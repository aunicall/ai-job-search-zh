import type { Job, Profile } from "./types";

export async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败，请稍后重试");
  return result as T;
}
export function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(
    "zh-CN",
    options || { month: "short", day: "numeric" },
  );
}
export function completeness(profile: Profile) {
  return Math.round(
    ([
      profile.name,
      profile.email || profile.phone,
      profile.city,
      profile.targetRole,
      profile.skills,
      profile.education,
      profile.background,
    ].filter((v) => v.trim()).length /
      7) *
      100,
  );
}
export function needsFollowUp(job: Job) {
  if (!["已投递", "面试中"].includes(job.stage)) return false;
  if (job.nextFollowUp)
    return job.nextFollowUp <= new Date().toLocaleDateString("en-CA");
  return Boolean(
    job.appliedAt && Date.now() - Date.parse(job.appliedAt) >= 10 * 86400000,
  );
}

export function formatPracticeFeedback(text: string) {
  return text.replace(/\s*(?:#{1,6}[ \t]+)?(?:\*\*)?(亮点|改进建议|与参考答案的差异)(?:[：:]?\*\*[：:]?|[：:]|(?=\s|$))\s*/g, "\n\n### $1\n").trim();
}
