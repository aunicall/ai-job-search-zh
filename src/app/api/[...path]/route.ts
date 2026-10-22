import { clearTaskLogs, fileDirectory } from "@/lib/db";
import { pickFolder } from "@/lib/folder-picker";
import { practiceQuestionContent } from "@/lib/practice-records";
import { avatarBytes, storeAvatar } from "@/lib/avatar";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import path from "node:path";
import { mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { deleteMaterialFiles, exportDocument, saveWorkspaceFile } from "@/lib/files";
import { RESUME_TEMPLATES } from "@/lib/resume-templates";
import {
  db,
  deleteJob,
  event,
  getSettings,
  getAiPreferences,
  list,
  read,
  transaction,
  workspace,
  write,
} from "@/lib/db";
import { checkEngine } from "@/lib/engines";
import { setPracticeFeedbackPaused, beginPractice, cancelTask, initRunner, isJobBusy, startTask } from "@/lib/workflow";
import { offerQuerySchema, searchOffer } from "@/lib/offer-source";
import {
  cancelDiscovery,
  initDiscovery,
  collectDiscovered,
  discoveryQuerySchema,
  discoveryState,
  sourceIdSchema,
  startDiscovery,
} from "@/lib/discovery";
import { openSourceBrowser } from "@/lib/source-browser";
import {
  journalSchema,
  interviewRecordSchema,
  engineIdSchema,
  jobPatchSchema,
  jobCreateSchema,
  profileSchema,
  settingsSchema,
} from "@/lib/validation";
import { isCandidate, type Job, type Material, type Submission, type JournalEntry, type InterviewRecord } from "@/lib/types";
import { localVoices, localRecognitionAvailable, recognizeLocal, speechInputSchema, synthesizeLocal } from "@/lib/local-speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function localRequest(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host))
    throw new Error("仅允许本机访问");
  const origin = req.headers.get("origin");
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`)
    throw new Error("请求来源不受信任");
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("请求来源不受信任");
}
async function body(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 200000) throw new Error("请求过大");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("请求格式无效");
  }
}
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    localRequest(req);
    initRunner();
    initDiscovery();
    const { path: parts } = await ctx.params;
    const route = parts.join("/");
    const method = req.method;
    if (route === "speech/voices" && method === "GET") {
      const [voices, recognition] = await Promise.all([localVoices(), localRecognitionAvailable()]);
      return NextResponse.json({ voices, recognition });
    }
    if (route === "speech/recognize" && method === "POST") {
      if (req.headers.get("content-type")?.split(";")[0] !== "audio/wav") throw new Error("请上传 WAV 录音");
      const reader = req.body?.getReader();
      if (!reader) throw new Error("录音为空");
      const chunks: Buffer[] = [];
      let length = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 12 * 1024 * 1024) { await reader.cancel(); throw new Error("录音过大"); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      return NextResponse.json(await recognizeLocal(Buffer.concat(chunks), req.signal));
    }
    if (route === "speech/synthesize" && method === "POST") {
      const wave = await synthesizeLocal(speechInputSchema.parse(await body(req)), req.signal);
      return new NextResponse(new Uint8Array(wave), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
    }
    if (route === "workspace" && method === "GET")
      return NextResponse.json(workspace());
    if (parts[0] === "ai-preferences" && parts.length <= 2 && (method === "POST" || method === "PUT")) {
      const payload = await body(req);
      const existing = getAiPreferences().entries;
      let entries;
      if (route === "ai-preferences" && method === "PUT") {
        const input = z.object({ prompt: z.string().trim().max(12000) }).parse(payload);
        entries = existing.filter((entry) => entry.id !== "legacy");
        if (input.prompt) entries.unshift({ id: "legacy", title: "全局设定", content: input.prompt, updatedAt: new Date().toISOString() });
      } else {
        const input = z.object({ title: z.string().trim().min(1, "请填写设定名称").max(100), content: z.string().trim().min(1, "请填写设定内容").max(12000) }).parse(payload);
        if (method === "PUT" && !existing.some((entry) => entry.id === parts[1])) throw new Error("设定不存在");
        const entry = { ...input, id: method === "POST" ? randomUUID() : parts[1], updatedAt: new Date().toISOString() };
        entries = method === "POST" ? [...existing, entry] : existing.map((old) => old.id === entry.id ? entry : old);
      }
      if (entries.length > 50 || entries.reduce((sum, entry) => sum + entry.content.length, 0) > 12000) throw new Error("设定最多 50 条，总内容请控制在 12000 字以内");
      write("config", "ai-preferences", { entries });
      return NextResponse.json(getAiPreferences());
    }
    if (route === "storage/browse" && method === "POST") {
      return NextResponse.json({ directory: await pickFolder(fileDirectory()) });
    }
    if (route === "storage" && method === "PUT") {
      const input = z.object({ directory: z.string().trim().min(1).max(1000).refine((v) => path.isAbsolute(v) && !/[\r\n\0]/.test(v), "请填写本机绝对目录") }).parse(await body(req));
      const directory = path.resolve(input.directory);
      await mkdir(directory, { recursive: true });
      await access(directory, constants.W_OK);
      return NextResponse.json(write("config", "storage", { directory }));
    }
    if (parts[0] === "journal" && parts.length === 2 && method === "DELETE") {
      const id = z.string().uuid().parse(parts[1]);
      if (!read<JournalEntry>("journal", id)) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
      db().prepare("DELETE FROM records WHERE collection='journal' AND id=?").run(id);
      return NextResponse.json({ ok: true });
    }
    if (parts[0] === "journal" && (method === "POST" || method === "PUT")) {
      const input = journalSchema.parse(await body(req));
      const previous = parts[1] ? read<JournalEntry>("journal", parts[1]) : null;
      if (method === "PUT" && !previous) throw new Error("笔记不存在");
      const now = new Date().toISOString();
      const entry = { ...input, id: previous?.id || randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
      return NextResponse.json(write("journal", entry.id, entry));
    }
    if (parts[0] === "interviews" && (method === "POST" || method === "PUT")) {
      const input = interviewRecordSchema.parse(await body(req));
      const job = read<Job>("jobs", input.jobId);
      if (!job || !isCandidate(job) || !job.appliedAt) throw new Error("请先将候选职位标记为已投递，再记录实际面试邀请");
      const previous = parts[1] ? read<InterviewRecord>("interviews", parts[1]) : null;
      if (method === "PUT" && (!previous || previous.jobId !== job.id)) throw new Error("面试记录不存在或不属于此职位");
      const now = new Date().toISOString();
      const item = { ...input, id: previous?.id || randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
      transaction(() => {
        write("interviews", item.id, item);
        if (["已收到邀请", "确定参加", "已完成"].includes(item.status) && !["已结束", "已获 Offer"].includes(job.stage))
          write("jobs", job.id, { ...job, stage: "面试中", updatedAt: now });
        event(`${job.company} · ${item.round} · ${item.status}`, job.id);
      });
      return NextResponse.json(item);
    }
    if (route === "discovery" && method === "GET")
      return NextResponse.json(discoveryState());
    if (route === "discovery" && method === "POST")
      return NextResponse.json(
        startDiscovery(discoveryQuerySchema.parse(await body(req))),
        { status: 202 },
      );
    if (route === "discovery/browser" && method === "POST") {
      const input = z.object({ source: sourceIdSchema }).parse(await body(req));
      await openSourceBrowser(input.source);
      return NextResponse.json({ ok: true });
    }
    if (parts[0] === "discovery" && parts.length === 2 && method === "DELETE") {
      cancelDiscovery(z.string().uuid().parse(parts[1]));
      return NextResponse.json({ ok: true });
    }
    if (route === "discovery/collect" && method === "POST") {
      const input = z
        .object({
          runId: z.string().uuid(),
          itemId: z.string().min(1).max(300),
        })
        .parse(await body(req));
      return NextResponse.json(collectDiscovered(input.runId, input.itemId));
    }
    if (route === "profile/avatar" && method === "POST") {
      if (Number(req.headers.get("content-length") || 0) > 5 * 1024 * 1024 + 10000) throw new Error("请选择 5 MB 以内的头像");
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new Error("请选择 5 MB 以内的头像");
      const id = await storeAvatar(Buffer.from(await file.arrayBuffer()));
      return NextResponse.json({ id });
    }
    if (route === "profile/avatar" && method === "DELETE") {
      write("config", "avatar", null);
      return NextResponse.json({ ok: true });
    }
    if (parts[0] === "profile" && parts[1] === "avatar" && parts.length === 3 && method === "GET") {
      const bytes = await avatarBytes(z.string().uuid().parse(parts[2]));
      return new NextResponse(new Uint8Array(bytes!), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    }
    if (route === "profile" && method === "PUT") {
      const profile = profileSchema.parse(await body(req));
      write("config", "profile", profile);
      event("个人档案已更新");
      return NextResponse.json(profile);
    }
    if (route === "settings" && method === "PUT")
      return NextResponse.json(
        write("config", "settings", settingsSchema.parse(await body(req))),
      );
    if (route === "sources/offer/status" && method === "GET")
      return NextResponse.json({
        configured: Boolean(process.env.OFFER_CAMPUS_API_KEY),
      });
    if (route === "sources/offer/search" && method === "POST")
      return NextResponse.json(
        await searchOffer(offerQuerySchema.parse(await body(req))),
      );
    if (route === "engines/check" && method === "POST") {
      const data = z
        .object({
          id: engineIdSchema.optional(),
          probe: z.boolean().default(false),
        })
        .parse(await body(req));
      const settings = getSettings();
      const ids = data.id ? [data.id] : (["codex", "claude", "codebuddy"] as const);
      return NextResponse.json(
        await Promise.all(
          ids.map((id) => checkEngine(id, settings.engines[id], data.probe)),
        ),
      );
    }
    if (route === "jobs" && method === "POST") {
      const data = jobCreateSchema.parse(await body(req));
      const duplicate = list<Job>("jobs").find((j) =>
        data.sourceId
          ? j.sourceId === data.sourceId
          : (data.url && j.url === data.url) ||
            (j.company.toLowerCase() === data.company.toLowerCase() &&
              j.title.toLowerCase() === data.title.toLowerCase() &&
              j.city === data.city),
      );
      if (duplicate)
        return NextResponse.json(
          { error: "此职位已在候选职位中", existingId: duplicate.id },
          { status: 409 },
        );
      const now = new Date().toISOString();
      const job: Job = {
        ...data,
        candidate: true,
        id: randomUUID(),
        stage: data.stage,
        favorite: false,
        evaluation: null,
        createdAt: now,
        updatedAt: now,
        appliedAt: data.appliedAt || (["已投递", "面试中", "已获 Offer"].includes(data.stage) ? now : null),
        nextFollowUp: "",
        interviewAt: "",
        notes: data.notes,
      };
      transaction(() => {
        write("jobs", job.id, job);
        event(`${job.appliedAt ? "记录投递" : "收集职位"} · ${job.company} ${job.title}`, job.id);
      });
      return NextResponse.json(job, { status: 201 });
    }
    if (parts[0] === "jobs" && parts.length === 2) {
      const job = read<Job>("jobs", parts[1]);
      if (!job)
        return NextResponse.json({ error: "职位不存在" }, { status: 404 });
      if (isJobBusy(job.id) && method !== "PATCH")
        return NextResponse.json(
          { error: "职位正在处理，请先等待任务完成或取消任务" },
          { status: 409 },
        );
      if (method === "PATCH") {
        const patch = jobPatchSchema.parse(await body(req));
        if (isJobBusy(job.id) && !(patch.stage === "已投递" && Object.keys(patch).every((key) => key === "stage")))
          return NextResponse.json({ error: "职位正在处理，目前仅可标记已投递，请等待任务完成后修改其他信息" }, { status: 409 });
        if (!isCandidate(job) && (patch.appliedAt || (patch.stage && ["已投递", "面试中", "已获 Offer"].includes(patch.stage)))) throw new Error("请先加入候选职位");
        const invalidates = [
          "company",
          "title",
          "city",
          "salary",
          "description",
        ].some(
          (key) =>
            key in patch &&
            patch[key as keyof typeof patch] !== job[key as keyof Job],
        );
        const result = {
          ...job,
          ...patch,
          appliedAt: patch.appliedAt === undefined ? job.appliedAt : patch.appliedAt || null,
          ...(invalidates ? { evaluation: null } : {}),
          updatedAt: new Date().toISOString(),
        };
        if (
          patch.stage &&
          ["已投递", "面试中", "已获 Offer"].includes(patch.stage) &&
          !result.appliedAt
        )
          result.appliedAt = new Date().toISOString();
        transaction(() => {
          write("jobs", job.id, result);
          if (result.appliedAt && !job.appliedAt) {
            const materials = list<Material>("materials").filter(
              (m) => m.jobId === job.id,
            );
            const snapshot: Submission = {
              id: job.id,
              jobId: job.id,
              job: result,
              materials: ["resume", "outreach"].flatMap((kind) => {
                const latest = materials.find((m) => m.kind === kind);
                return latest ? [latest] : [];
              }),
              appliedAt: result.appliedAt,
            };
            write("submissions", job.id, snapshot);
          }
          if (patch.stage && patch.stage !== job.stage)
            event(`${job.company} · ${job.stage} → ${patch.stage}`, job.id);
        });
        return NextResponse.json(result);
      }
      if (method === "DELETE") {
        deleteJob(job.id);
        return NextResponse.json({ ok: true });
      }
    }
    if (parts[0] === "practice" && (parts[2] === "start" || parts[2] === "restart") && parts.length === 3 && method === "POST")
      return NextResponse.json(await beginPractice(z.string().uuid().parse(parts[1]), parts[2] === "restart"));
    if (parts[0] === "practice" && parts[2] === "feedback" && parts.length === 3 && method === "POST") {
      const input = z.object({ paused: z.boolean(), attemptId: z.string().min(1).max(100).optional() }).parse(await body(req));
      return NextResponse.json(setPracticeFeedbackPaused(z.string().uuid().parse(parts[1]), input.paused, input.attemptId));
    }
    if (route === "task-logs" && method === "DELETE") {
      const input = z.object({ confirm: z.literal(true) }).parse(await body(req));
      if (input.confirm) clearTaskLogs();
      return NextResponse.json({ ok: true });
    }
    if (route === "tasks" && method === "POST") {
      const input = z
        .object({
          action: z.enum(["evaluate", "apply", "interview", "practice", "learning"]),
          jobId: z.string().uuid().nullable().default(null),
          templateId: z.enum(["auto", ...RESUME_TEMPLATES.map((t) => t.id)]).optional(),
          materialId: z.string().uuid().optional(),
          attemptId: z.string().uuid().optional(),
          answer: z.string().trim().min(1).max(6000).optional(),
          turn: z.number().int().min(0).max(29).optional(),
        })
        .parse(await body(req));
      if (
        ["evaluate", "apply", "interview", "practice"].includes(input.action) &&
        !input.jobId
      )
        throw new Error("请先选择职位");
      return NextResponse.json(startTask(input.action, input.jobId, undefined, input), {
        status: 202,
      });
    }
    if (parts[0] === "tasks" && parts.length === 2 && method === "DELETE") {
      cancelTask(parts[1]);
      return NextResponse.json({ ok: true });
    }
    if (route === "resume/import" && method === "POST") {
      if (Number(req.headers.get("content-length") || 0) > 10_600_000)
        throw new Error("简历不能超过 10 MB");
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 10_000_000)
        throw new Error("请选择 10 MB 以内的简历");
      const buffer = Buffer.from(await file.arrayBuffer());
      let text = "";
      if (/\.pdf$/i.test(file.name)) {
        if (buffer.subarray(0, 5).toString() !== "%PDF-")
          throw new Error("PDF 文件格式无效");
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        try {
          text = (await parser.getText()).text;
        } finally {
          await parser.destroy();
        }
      } else if (/\.docx$/i.test(file.name)) {
        if (buffer.subarray(0, 2).toString() !== "PK")
          throw new Error("DOCX 文件格式无效");
        const mammoth = await import("mammoth");
        text = (await mammoth.extractRawText({ buffer })).value;
      } else if (/\.(txt|md)$/i.test(file.name)) text = buffer.toString("utf8");
      else
        throw new Error(
          "支持 PDF、DOCX、TXT、Markdown；旧版 DOC 请先另存为 DOCX。",
        );
      if (text.trim().length < 30)
        throw new Error(
          "未提取到有效文字；扫描件请先进行 OCR，或直接粘贴简历正文。",
        );
      if (text.length > 40000)
        throw new Error("简历正文超过 4 万字，请精简后导入。");
      await saveWorkspaceFile(file.name, buffer);
      return NextResponse.json({ text, filename: file.name });
    }
    if (route === "profile/extract" && method === "POST") {
      const input = z
        .object({ text: z.string().min(30).max(40000) })
        .parse(await body(req));
      return NextResponse.json(startTask("profile", null, input.text), {
        status: 202,
      });
    }
    if (parts[0] === "materials" && parts.length === 2) {
      z.string().uuid().parse(parts[1]);
      const material = read<Material>("materials", parts[1]);
      if (!material)
        return NextResponse.json({ error: "材料不存在" }, { status: 404 });
      if (method === "DELETE") {
        if (!material.practice) throw new Error("仅支持删除模拟面试记录");
        if (material.jobId && isJobBusy(material.jobId)) return NextResponse.json({ error: "面试任务正在处理中，请完成或取消后再删除" }, { status: 409 });
        deleteMaterialFiles(material.id);
        db().prepare("DELETE FROM records WHERE collection='materials' AND id=?").run(material.id);
        return NextResponse.json({ ok: true });
      }
      if (method === "PATCH") {
        if (material.practice) throw new Error("面试题生成后不可修改，请重新生成新的题组。");
        const patch = z
          .object({ content: z.string().min(1).max(50000) })
          .parse(await body(req));
        return NextResponse.json(
          write("materials", material.id, { ...material, ...patch }),
        );
      }
    }
    if (
      parts[0] === "export" &&
      parts[1] === "materials" &&
      parts[2] &&
      method === "GET"
    ) {
      const material = read<Material>("materials", parts[2]);
      if (!material) throw new Error("材料不存在");
      if (material.practice) material.content = practiceQuestionContent(material.title, material.practice);
      const filename = encodeURIComponent(
        material.title.replace(/[<>:"/\\|?*]/g, "_"),
      );
      const format = req.nextUrl.searchParams.get("format");
      if (format === "docx" || format === "pdf") {
        const buffer = await exportDocument(material, format);
        await saveWorkspaceFile(`${material.title}.${format}`, buffer, material.id);
        return new NextResponse(new Uint8Array(buffer), { headers: {
          "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename*=UTF-8''${filename}.${format}`,
        } });
      }
      await saveWorkspaceFile(`${material.title}.md`, material.content, material.id);
      return new NextResponse(material.content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${filename}.md`,
        },
      });
    }
    if (route === "export/backup" && method === "GET")
      return new NextResponse(
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            ...workspace(),
            discovery: list("discovery"),
            files: list("files"),
            avatars: list("avatars"),
            events: list("events"),
            tasks: list("tasks"),
          },
          null,
          2,
        ),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="offer-backup-${new Date().toISOString().slice(0, 10)}.json"`,
          },
        },
      );
    if (route === "export/tracker" && method === "GET") {
      const cell = (value: string) =>
        `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
      const rows = [
        [
          "公司",
          "职位",
          "城市",
          "薪资",
          "渠道",
          "状态",
          "匹配度",
          "投递日期",
          "下次跟进",
          "面试时间",
          "备注",
        ],
        ...list<Job>("jobs").map((j) => [
          j.company,
          j.title,
          j.city,
          j.salary,
          j.platform,
          j.stage,
          j.evaluation?.score?.toString() || "",
          j.appliedAt || "",
          j.nextFollowUp,
          j.interviewAt,
          j.notes,
        ]),
      ];
      return new NextResponse(
        "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="offer-tracker.csv"',
          },
        },
      );
    }
    return NextResponse.json({ error: "接口不存在" }, { status: 404 });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "输入格式无效"
        : (error as Error).message;
    return NextResponse.json(
      { error: message },
      { status: /不受信任|仅允许本机/.test(message) ? 403 : 400 },
    );
  }
}
export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
