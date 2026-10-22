export const DISCOVERY_SOURCES = [
  { id: "liepin", name: "猎聘", mode: "公开职位", domain: "liepin.com" },
  {
    id: "boss",
    name: "BOSS直聘",
    mode: "浏览器 · 需登录",
    domain: "zhipin.com",
  },
  {
    id: "zhaopin",
    name: "智联招聘",
    mode: "浏览器 · 需登录",
    domain: "zhaopin.com",
  },
  { id: "51job", name: "前程无忧", mode: "浏览器", domain: "51job.com" },
  {
    id: "offer",
    name: "Offer先生",
    mode: "校招 · 开放接口",
    domain: "offerxiansheng.com",
  },
] as const;
export type SourceId = (typeof DISCOVERY_SOURCES)[number]["id"];
export interface DiscoveryQuery {
  mode?: "profile" | "custom";
  expectedSalary?: string;
  experience?: string;
  education?: string;
  skills?: string;
  preferences?: string;
  exclusions?: string;
  sources: SourceId[];
  keywords: string;
  city: string;
}
export interface DiscoveredJob {
  id: string;
  source: SourceId;
  company: string;
  title: string;
  city: string;
  salary: string;
  url: string;
  description: string;
  capturedAt: string;
  score?: number;
  dimensions?: { skills: number; experience: number; behavior: number; direction: number };
  reasons: string[];
  concerns: string[];
  collectedId?: string;
}
export interface DiscoveryRun {
  taskLogCleared?: boolean;
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  step: string;
  query: DiscoveryQuery;
  keywords: string[];
  sources: {
    id: SourceId;
    state: "pending" | "running" | "completed" | "error";
    count: number;
    received?: number;
    message: string;
  }[];
  items: DiscoveredJob[];
  error: string;
  logs?: { at: string; message: string }[];
  createdAt: string;
}
export interface DiscoveryState {
  browserReady: boolean;
  offerReady: boolean;
  latest: DiscoveryRun | null;
}
