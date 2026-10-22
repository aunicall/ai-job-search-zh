import type { DiscoveryRun } from "./discovery-types";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  EMPTY_PROFILE,
  type Event,
  type Job,
  type Material,
  type Profile,
  type Settings,
  type Submission,
  type Task,
  type Workspace,
  type JournalEntry,
  type InterviewRecord,
  type AiPreference,
} from "./types";

export const dataDir = path.resolve(
  process.env.OFFER_DATA_DIR || path.join(process.cwd(), "data"),
);
const globalDb = globalThis as typeof globalThis & { offerDb?: DatabaseSync };
export function db() {
  if (!globalDb.offerDb) {
    mkdirSync(dataDir, { recursive: true });
    const connection = new DatabaseSync(path.join(dataDir, "offer.sqlite"));
    connection.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    connection.exec(`CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,id));
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO metadata VALUES ('schema_version','1');`);
    globalDb.offerDb = connection;
  }
  return globalDb.offerDb;
}
export function read<T>(collection: string, id: string): T | null {
  const row = db()
    .prepare("SELECT payload FROM records WHERE collection=? AND id=?")
    .get(collection, id) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as T) : null;
}
export function list<T>(collection: string): T[] {
  return (
    db()
      .prepare(
        "SELECT payload FROM records WHERE collection=? ORDER BY rowid DESC",
      )
      .all(collection) as { payload: string }[]
  ).map((r) => JSON.parse(r.payload) as T);
}
export function write<T>(collection: string, id: string, payload: T): T {
  db()
    .prepare(
      "INSERT INTO records VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload",
    )
    .run(collection, id, JSON.stringify(payload));
  return payload;
}
export function transaction<T>(fn: () => T): T {
  db().exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db().exec("COMMIT");
    return result;
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}
export function event(message: string, jobId: string | null = null) {
  const item: Event = {
    id: randomUUID(),
    jobId,
    message,
    createdAt: new Date().toISOString(),
  };
  write("events", item.id, item);
}
export function getProfile() {
  return read<Profile>("config", "profile") || { ...EMPTY_PROFILE };
}
export function getSettings() {
  const saved = read<Settings>("config", "settings");
  const settings = structuredClone(DEFAULT_SETTINGS);
  if (saved) {
    if (Number.isInteger(saved.discoveryLimit) && saved.discoveryLimit >= 1 && saved.discoveryLimit <= 500) settings.discoveryLimit = saved.discoveryLimit;
    settings.engine = Object.hasOwn(settings.engines, saved.engine) ? saved.engine : "codebuddy";
    for (const id of Object.keys(settings.engines) as (keyof Settings["engines"])[]) {
      if (saved.engines?.[id]) settings.engines[id] = saved.engines[id];
    }
  }
  return settings;
}
export function workspace(): Workspace {
  // 旧版在职位上保存单次面试时间；迁入独立记录，后续编辑不覆盖。
  for (const job of list<Job>("jobs")) {
    const id = `legacy-${job.id}`;
    if (job.appliedAt && job.interviewAt && !read("interviews", id)) {
      write<InterviewRecord>("interviews", id, { id, jobId: job.id, round: job.interview?.stage || "历史面试", status: "已收到邀请", scheduledAt: job.interviewAt.slice(0, 16), format: job.interview?.format || "待确认", location: "", contact: "", feedback: job.interview?.feedback || "", createdAt: job.createdAt, updatedAt: job.updatedAt });
    }
  }
  return {
    avatarId: read<{ id: string }>("config", "avatar")?.id || null,
    journal: list<JournalEntry>("journal"),
    interviews: list<InterviewRecord>("interviews"),
    aiPreferences: getAiPreferences(),
    storage: { directory: fileDirectory(), database: path.join(dataDir, "offer.sqlite") },
    profile: getProfile(),
    settings: getSettings(),
    jobs: list<Job>("jobs"),
    materials: list<Material>("materials"),
    events: list<Event>("events").slice(0, 80),
    tasks: list<Task>("tasks").slice(0, 80),
    discovery: list<DiscoveryRun>("discovery").filter((run) => !run.taskLogCleared).slice(0, 80).map(({ items, ...run }) => ({ ...run, resultCount: items.length })),
    submissions: list<Submission>("submissions"),
  };
}
export function getAiPreferences() {
  const saved = read<{ prompt?: string; entries?: AiPreference[] }>("config", "ai-preferences");
  const entries = saved?.entries || (saved?.prompt?.trim() ? [{ id: "legacy", title: "全局设定", content: saved.prompt, updatedAt: "" }] : []);
  return { entries, prompt: entries.map((entry) => entry.content).join("\n\n") };
}
export function deleteJob(id: string) {
  transaction(() => {
    db()
      .prepare("DELETE FROM records WHERE collection='jobs' AND id=?")
      .run(id);
    for (const collection of ["materials", "events", "tasks", "submissions", "interviews"]) {
      db()
        .prepare(
          "DELETE FROM records WHERE collection=? AND json_extract(payload,'$.jobId')=?",
        )
        .run(collection, id);
    }
  });
}
export function fileDirectory() {
  return read<{ directory: string }>("config", "storage")?.directory || path.join(dataDir, "workspace");
}
export function updatePracticeFeedback(task: Task, status: "pending" | "completed" | "failed", feedback = "", message?: string) {
  if (!task.feedback) return;
  const { materialId, attemptId, turn: index } = task.feedback;
  const material = read<Material>("materials", materialId);
  const practice = material?.practice;
  if (!material || !practice) return;
  const attempt = practice.attemptId === attemptId ? practice : practice.previousAttempts?.find((a) => a.id === attemptId);
  const turn = attempt?.turns[index];
  if (!turn || turn.feedbackTaskId !== task.id) return;
  Object.assign(turn, { feedbackStatus: status, feedback });
  (turn.feedbackLog ||= []).push({ at: new Date().toISOString(), message: message || (status === "completed" ? "AI 点评完成" : "点评中断，回答已保留") });
  write("materials", materialId, material);
}
export function recoverTasks() {
  for (const task of list<Task>("tasks")) {
    if (task.status === "running") {
      updatePracticeFeedback(task, "failed");
      write("tasks", task.id, {
        ...task,
        status: "failed",
        step: "任务中断",
        error: "服务重启，任务已中断。可重新运行，已有材料保留。",
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

export function clearTaskLogs() {
  transaction(() => {
    if (list<Task>("tasks").some((task) => task.status === "running") || list<DiscoveryRun>("discovery").some((run) => run.status === "running")) throw new Error("仍有任务正在运行或暂停，请先完成或取消任务后再清空日志。");
    db().prepare("DELETE FROM records WHERE collection='tasks'").run();
    for (const run of list<DiscoveryRun>("discovery")) {
      write("discovery", run.id, { ...run, logs: [], error: "", taskLogCleared: true });
    }
    for (const material of list<Material>("materials")) {
      if (!material.practice) continue;
      for (const attempt of [material.practice, ...(material.practice.previousAttempts || [])]) {
        for (const turn of attempt.turns) delete turn.feedbackLog;
      }
      write("materials", material.id, material);
    }
  });
}
