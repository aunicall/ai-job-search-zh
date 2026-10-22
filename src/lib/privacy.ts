import type { Profile } from "./types";

type Identity = Pick<Profile, "name" | "email" | "phone">;
const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const phonePattern = /(?<!\d)(?:(?:\+?86[ -]?)?1[3-9]\d[ -]?\d{4}[ -]?\d{4}|(?:\+\d{1,3}[ -])?\(?0\d{2,3}\)?[ -]?\d{7,8})(?!\d)/g;

export function localIdentity(text: string): Identity {
  const labeled = text.match(/(?:姓名|Name)[ \t]*[:：][ \t]*([^\r\n|｜,，;；]{1,60})/i)?.[1].trim();
  const first = text.trim().split(/\r?\n/)[0]?.replace(/^#+\s*/, "").trim() || "";
  // shortcut: 无标签姓名仅识别独立首行，其他排版由用户在本地确认补全。
  const name = labeled || (/^(?:[\p{Script=Han}]{2,6}|[A-Za-z]+(?:[ '-][A-Za-z]+){1,3})$/u.test(first) && !/简历|经历|档案|Resume/i.test(first) ? first : "");
  return { name, email: text.match(emailPattern)?.[0] || "", phone: text.match(phonePattern)?.[0] || "" };
}

export function redactPersonalInfo(text: string, identities: Identity[]): string {
  const values = identities.flatMap((identity) => [identity.name, identity.email, identity.phone]).map((value) => value.trim()).filter(Boolean);
  // 旧面试快照可能包含已修改的档案身份信息，也不能重新发送。
  for (const match of text.matchAll(/"name"\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*"(?:email|phone)"/g)) {
    values.push(JSON.parse(match[1]));
  }
  for (const value of [...new Set(values)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const variant of new Set([value, JSON.stringify(value).slice(1, -1)])) {
      text = text.split(variant).join("[个人信息已省略]");
    }
  }
  return text.replace(emailPattern, "[邮箱已省略]").replace(phonePattern, "[电话已省略]")
    .replace(/((?:姓名|Name|微信|WeChat|QQ)[ \t]*[:：][ \t]*)[^\r\n|｜,，;；"\\]+/gi, "$1[个人信息已省略]");
}

export function profileForAi(profile: Profile) {
  const { name: _name, email: _email, phone: _phone, ...rest } = profile;
  for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
    rest[key] = redactPersonalInfo(rest[key], [profile]);
  }
  return rest;
}

export function privateJson(value: unknown, profile: Profile): string {
  const identities: Identity[] = [profile];
  const json = JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && typeof item.name === "string" && typeof item.email === "string" && typeof item.phone === "string") {
      identities.push(item);
      const { name: _name, email: _email, phone: _phone, ...rest } = item;
      return rest;
    }
    return item;
  });
  return redactPersonalInfo(json ?? "null", identities);
}

export function resumeBody(content: string) {
  const section = content.search(/^##\s+/m);
  return section >= 0 ? content.slice(section).trim() : content.replace(/^#\s+[^\r\n]*(?:\r?\n|$)/gm, "").trim();
}

export function assembleResume(body: string, profile: Profile) {
  if (!/^##\s+/m.test(body)) throw new Error("AI 未返回分节简历正文，请重试。");
  const line = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>#]/g, "").trim();
  return [`# ${line(profile.name) || "个人简历"}`, [profile.phone, profile.email].map(line).filter(Boolean).join(" · "), redactPersonalInfo(resumeBody(body), [profile])].filter(Boolean).join("\n\n");
}
