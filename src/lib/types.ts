import type { DiscoveryRun } from "./discovery-types";
export const STAGES = [
  "待评估",
  "待投递",
  "已投递",
  "面试中",
  "已获 Offer",
  "已结束",
] as const;
export type Stage = (typeof STAGES)[number];
export const INTERVIEW_STAGES = ["待确认", "HR初筛", "专业面", "交叉面", "终面", "谈薪", "笔试/机试", "群面", "实操/试讲"] as const;
export const INTERVIEW_FORMATS = ["待确认", "电话", "视频", "现场", "线上限时答题"] as const;
export const INTERVIEW_DIFFICULTIES = ["基础", "标准", "挑战"] as const;
export interface InterviewPlan {
  stage: (typeof INTERVIEW_STAGES)[number];
  format: (typeof INTERVIEW_FORMATS)[number];
  interviewer: string;
  feedback: string;
  difficulty?: (typeof INTERVIEW_DIFFICULTIES)[number];
  companyBackground?: string;
  questionCount?: number | null;
}
export const EMPTY_INTERVIEW: InterviewPlan = { stage: "待确认", format: "待确认", interviewer: "", feedback: "" };
export interface PracticeTurn {
 question: string; answer: string; feedback: string;
 feedbackStatus?: "pending" | "completed" | "failed";
 feedbackTaskId?: string;
 feedbackLog?: { at: string; message: string }[];
}
export interface PracticeAttempt {
  feedbackPaused?: boolean;
  id: string;
  startedAt: string;
  endedAt?: string;
  finished: boolean;
  turns: PracticeTurn[];
}
export interface InterviewPractice {
  feedbackPaused?: boolean;
  attemptId?: string;
  finishedAt?: string;
  previousAttempts?: PracticeAttempt[];
  questions?: { id: string; question: string; answer: string; basis: string }[];
  sourceSnapshot?: Record<string, unknown>;
  generatedAt?: string;
  startedAt?: string;
  totalQuestions?: number;
  plan: InterviewPlan;
  question: string;
  turns: PracticeTurn[];
  finished: boolean;
}
export const ENGINE_NAMES = { codex: "Codex", claude: "Claude Code", codebuddy: "CodeBuddy" } as const;
export type EngineId = keyof typeof ENGINE_NAMES;
export type PageId =
  | "discover"
  | "applications"
  | "practice"
  | "interviews"
  | "templates"
  | "journal"
  | "ai-settings"
  | "profile"
  | "settings";

export interface Profile {
  name: string;
  email: string;
  phone: string;
  city: string;
  targetRole: string;
  expectedSalary: string;
  education: string;
  experience: string;
  skills: string;
  background: string;
  preferences: string;
  exclusions: string;
}
export const EMPTY_PROFILE: Profile = {
  name: "",
  email: "",
  phone: "",
  city: "",
  targetRole: "",
  expectedSalary: "",
  education: "",
  experience: "",
  skills: "",
  background: "",
  preferences: "",
  exclusions: "",
};
export interface EngineConfig {
  command: string;
  model: string;
}
export interface Settings {
  discoveryLimit: number;
  engine: EngineId;
  engines: Record<EngineId, EngineConfig>;
}
export const DEFAULT_SETTINGS: Settings = {
  discoveryLimit: 50,
  engine: "codex",
  engines: {
    codex: { command: "codex", model: "" },
    claude: { command: "claude", model: "" },
    codebuddy: { command: "codebuddy", model: "" },
  },
};
export interface Dimension {
  name: string;
  score: number;
  reason: string;
}
export interface Gate {
  name: string;
  status: "PASS" | "FAIL" | "FLAG" | "UNKNOWN" | "NA";
  evidence: string;
}
export const GATE_NAMES = [
  "学历与院校",
  "执业资格",
  "应届生与三方",
  "户口与落户",
  "外包与派遣",
  "工作年限",
  "个人明确排除",
] as const;
export interface Evaluation {
  score: number | null;
  recommendation: string;
  summary: string;
  gates: Gate[];
  dimensions: Dimension[];
  strengths: string[];
  gaps: string[];
  questions: string[];
}
export interface Job {
  discoveryMatch?: {
    score: number;
    dimensions?: { skills: number; experience: number; behavior: number; direction: number };
    reasons: string[];
    concerns: string[];
    runId: string;
    capturedAt: string;
  };
  candidate?: boolean;
  id: string;
  company: string;
  title: string;
  city: string;
  salary: string;
  platform: string;
  url: string;
  description: string;
  stage: Stage;
  favorite: boolean;
  evaluation: Evaluation | null;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  nextFollowUp: string;
  notes: string;
  interviewAt: string;
  sourceId?: string;
  interview?: InterviewPlan;
}
export interface Material {
  taskId?: string;
  avatarId?: string | null;
  templateId?: string;
  id: string;
  jobId: string | null;
  kind: "resume" | "outreach" | "interview" | "learning";
  title: string;
  content: string;
  review: string;
  engine: EngineId;
  createdAt: string;
  practice?: InterviewPractice;
}
export interface Submission {
  id: string;
  jobId: string;
  job: Job;
  materials: Material[];
  appliedAt: string;
}
export interface Event {
  id: string;
  jobId: string | null;
  message: string;
  createdAt: string;
}
export interface Task {
 feedback?: { materialId: string; attemptId: string; turn: number };
  id: string;
  jobId: string | null;
  action: "evaluate" | "apply" | "interview" | "practice" | "learning" | "profile";
  status: "running" | "completed" | "failed";
  step: string;
  error: string;
  createdAt: string;
  updatedAt: string;
}
export interface EngineModel {
  id: string;
  name: string;
  isDefault: boolean;
}
export interface EngineStatus {
  id: EngineId;
  state: "missing" | "unauthenticated" | "ready" | "connected" | "error";
  version: string;
  message: string;
  checkedAt: string;
  model?: string;
  models?: EngineModel[];
}
export interface Workspace {
  discovery?: (Omit<DiscoveryRun, "items"> & { resultCount: number })[];
  avatarId: string | null;
  journal: JournalEntry[];
  interviews: InterviewRecord[];
  aiPreferences: { prompt: string; entries: AiPreference[] };
  storage: { directory: string; database: string };
  profile: Profile;
  settings: Settings;
  jobs: Job[];
  materials: Material[];
  events: Event[];
  tasks: Task[];
  submissions: Submission[];
}
export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
export interface AiPreference {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}
export const INVITATION_STATUSES = ["已收到邀请", "确定参加", "已拒绝", "已完成", "已取消"] as const;
export interface InterviewRecord {
  id: string;
  jobId: string;
  round: string;
  status: (typeof INVITATION_STATUSES)[number];
  scheduledAt: string;
  format: (typeof INTERVIEW_FORMATS)[number];
  location: string;
  contact: string;
  feedback: string;
  createdAt: string;
  updatedAt: string;
}
export function isCandidate(job: Job) { return job.candidate !== false; }
