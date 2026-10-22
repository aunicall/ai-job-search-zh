import { z } from "zod";
import { GATE_NAMES, STAGES, INTERVIEW_STAGES, INTERVIEW_FORMATS, INTERVIEW_DIFFICULTIES, INVITATION_STATUSES } from "./types";

const short = z.string().trim().max(500);
const text = z.string().trim().max(40000);
const calendarDate = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "请输入有效日期",
  );
export const engineIdSchema = z.enum(["codex", "claude", "codebuddy"]);
export const profileSchema = z.object({
  name: short,
  email: short.refine(
    (v) => !v || z.email().safeParse(v).success,
    "邮箱格式不正确",
  ),
  phone: short,
  city: short,
  targetRole: short,
  expectedSalary: short,
  education: text,
  experience: text,
  skills: text,
  background: text,
  preferences: text,
  exclusions: text,
});
const engineConfig = z.object({
  command: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((v) => !/[\r\n\0]/.test(v), "可执行文件路径无效"),
  model: z
    .string()
    .trim()
    .max(150)
    .regex(/^[\w.\-/:]*$/, "模型名格式无效"),
});
export const settingsSchema = z.object({
  discoveryLimit: z.number().int().min(1).max(500).default(50),
  engine: engineIdSchema,
  engines: z.object({ codex: engineConfig, claude: engineConfig, codebuddy: engineConfig.default({ command: "codebuddy", model: "" }) }),
});
export const jobSchema = z.object({
  company: short.min(1, "请填写公司名称"),
  title: short.min(1, "请填写职位名称"),
  city: short.default(""),
  salary: short.default(""),
  platform: short.default("手动录入"),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return (
          ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
        );
      } catch {
        return false;
      }
    }, "请输入有效的 http(s) 链接")
    .default(""),
  description: text.min(20, "请粘贴至少 20 字的职位描述"),
  sourceId: z.string().max(1000).optional(),
});
const optionalDescription = z.union([text.min(20, "职位描述请至少填写 20 字，或暂时留空"), z.literal("")]);
export const jobCreateSchema = jobSchema.extend({
  description: optionalDescription.default(""),
  stage: z.enum(STAGES).default("待投递"),
  appliedAt: calendarDate.optional(),
  notes: text.default(""),
});
export const jobPatchSchema = jobSchema
  .omit({ sourceId: true })
  .extend({
    city: jobSchema.shape.city.removeDefault(),
    salary: jobSchema.shape.salary.removeDefault(),
    platform: jobSchema.shape.platform.removeDefault(),
    url: jobSchema.shape.url.removeDefault(),
    description: optionalDescription,
  })
  .partial()
  .extend({
    stage: z.enum(STAGES).optional(),
    appliedAt: calendarDate.optional(),
    favorite: z.boolean().optional(),
    notes: text.optional(),
    interview: z.object({
      stage: z.enum(INTERVIEW_STAGES),
      format: z.enum(INTERVIEW_FORMATS),
      interviewer: short,
      feedback: z.string().trim().max(6000),
      difficulty: z.enum(INTERVIEW_DIFFICULTIES).optional(),
      questionCount: z.number().int().min(1).max(30).nullable().optional(),
      companyBackground: z.string().trim().max(6000).optional(),
    }).optional(),
    nextFollowUp: calendarDate.optional(),
    interviewAt: z
      .string()
      .max(50)
      .refine((v) => !v || Number.isFinite(Date.parse(v)), "面试时间格式不正确")
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "没有需要保存的修改");
const list = z.array(z.string().max(4000)).max(30);
export const evaluationSchema = z.object({
  score: z.number().int().min(0).max(100).nullable(),
  recommendation: short,
  summary: z.string().max(5000),
  gates: z
    .array(
      z.object({
        name: z.enum(GATE_NAMES),
        status: z.enum(["PASS", "FAIL", "FLAG", "UNKNOWN", "NA"]),
        evidence: z.string().max(3000),
      }),
    )
    .length(GATE_NAMES.length)
    .refine(
      (v) => new Set(v.map((g) => g.name)).size === GATE_NAMES.length,
      "必须完整检查七道门槛",
    ),
  dimensions: z
    .array(
      z.object({
        name: short,
        score: z.number().min(0).max(100),
        reason: z.string().max(3000),
      }),
    )
    .max(5),
  strengths: list,
  gaps: list,
  questions: list,
});
export const applySchema = z.object({
  templateId: z.enum(["classic", "emerald", "slate", "academic", "compact", "creative"]).optional(),
  resume: z.string().min(50).max(30000),
  outreach: z.string().min(10).max(5000),
});
export const reviewSchema = z.object({
  templateId: z.enum(["classic", "emerald", "slate", "academic", "compact", "creative"]).optional(),
  resume: z.string().min(50).max(30000),
  outreach: z.string().min(10).max(5000),
  review: z.string().min(10).max(10000),
});
export const journalSchema = z.object({ title: short.min(1, "请填写标题"), content: text.min(1, "请填写笔记内容") });
export const interviewRecordSchema = z.object({
  jobId: z.string().uuid(),
  round: short.min(1, "请填写面试轮次"),
  status: z.enum(INVITATION_STATUSES),
  scheduledAt: z.string().max(30).refine((v) => !v || (/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) && calendarDate.safeParse(v.slice(0, 10)).success), "请输入有效的面试日期和时间"),
  format: z.enum(INTERVIEW_FORMATS),
  location: short,
  contact: short,
  feedback: z.string().trim().max(10000),
}).refine((v) => v.status !== "确定参加" || Boolean(v.scheduledAt), "确定参加前请填写面试时间");
export function parseJsonOutput(output: string): unknown {
  const clean = output.trim();
  if (!clean) throw new Error("AI 返回了空回复，未提供 JSON 结果。");
  try {
    return JSON.parse(clean);
  } catch {
    // 只接受唯一代码块，避免在多个候选结果中猜测。
    if (/^```(?:json)?\s*[\s\S]*\s*```$/i.test(clean) && (clean.match(/```/g) || []).length === 2) {
      try { return JSON.parse(clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { /* 继续报告格式错误 */ }
    }
    const blocks = [...clean.matchAll(/```(?:json)?[^\S\r\n]*\r?\n([\s\S]*?)```/gi)];
    if (blocks.length === 1) {
      try { return JSON.parse(blocks[0][1].trim()); } catch { /* 继续报告格式错误 */ }
    }
    const reason = blocks.length > 1
      ? "回复包含多个 JSON 代码块，无法确定采用哪个结果"
      : blocks.length === 1 || /^[{[]/.test(clean)
        ? "JSON 格式不合法或内容被截断"
        : "回复不是要求的 JSON 格式";
    throw new Error(`AI 返回结果无法解析：${reason}（回复长度 ${clean.length} 字符）。本次结果未应用。`);
  }
}
