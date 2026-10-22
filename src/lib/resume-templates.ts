export const RESUME_TEMPLATES = [
  { id: "classic", name: "经典商务", color: "#263b50", layout: "classic", description: "通用岗位 · 清晰稳重" },
  { id: "emerald", name: "青绿专业", color: "#28735f", layout: "band", description: "产品 / 运营 · 重点突出" },
  { id: "slate", name: "技术蓝图", color: "#315c91", layout: "rule", description: "研发 / 数据 · 项目导向" },
  { id: "academic", name: "学术简约", color: "#57506c", layout: "center", description: "研究 / 应届生 · 教育优先" },
  { id: "compact", name: "精炼履历", color: "#505d57", layout: "compact", description: "资深岗位 · 高信息密度" },
  { id: "creative", name: "暖色创意", color: "#a56437", layout: "band", description: "设计 / 内容 · 温暖利落" },
] as const;
export type ResumeTemplateId = (typeof RESUME_TEMPLATES)[number]["id"];
export function resumeTemplate(id?: string) { return RESUME_TEMPLATES.find((t) => t.id === id) || RESUME_TEMPLATES[0]; }
export const SAMPLE_RESUME = `# 张三
产品经理 · 上海
lin@example.com · 138 0000 0000
## 个人概述
专注用户体验与业务流程优化，具备从需求研究到产品交付的完整项目经验。
## 核心能力
需求分析 / 用户访谈 / 数据分析 / 跨团队协作
## 工作经历
### 示例科技有限公司 · 产品经理
2022.07 — 至今
- 负责业务工作台的需求梳理，协调设计、研发与运营推进产品迭代。
- 建立需求优先级与验收标准，持续跟踪上线后的用户反馈。
## 项目经历
### 企业服务工作台
- 通过访谈整理高频使用场景，优化任务入口与操作流程。
- 组织可用性测试，推动设计问题闭环。
## 教育背景
示例大学 · 信息管理与信息系统 · 本科
2018.09 — 2022.06`;
export function resumeLines(content: string) {
  return content.split(/\r?\n/).filter((line) => line.trim()).map((line) => ({
    level: line.match(/^(#{1,6})\s/)?.[1].length || 0,
    text: line.replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").replace(/^[-*]\s+/, "• "),
  }));
}
export function resumeSections(content: string) {
  const lines = resumeLines(content);
  const section = lines.findIndex((line) => line.level === 2);
  const split = section < 0 ? Math.min(lines.length, 3) : section;
  return { header: lines.slice(0, split), body: lines.slice(split) };
}
export function resumeHtml(content: string, id?: string, avatar?: string) {
  const t = resumeTemplate(id);
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const sections = resumeSections(content);
  const render = (lines: ReturnType<typeof resumeLines>) => lines.map((l) => { const tag = l.level ? `h${Math.min(l.level, 3)}` : "p"; return `<${tag}>${escape(l.text)}</${tag}>`; }).join("");
  const photo = avatar && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(avatar) ? avatar : null;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
  @page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;color:#253139;font:14px/1.65 'Microsoft YaHei','Noto Sans CJK SC',sans-serif}
  .resume-header{display:flex;justify-content:space-between;gap:28px;align-items:flex-start;margin-bottom:20px;break-inside:avoid}.resume-identity{flex:1;min-width:0}.resume-photo{width:90px;height:120px;object-fit:cover;border-radius:4px}
  h1{font-size:30px;margin:0 0 12px;color:${t.color};${t.layout === "center" ? "text-align:center" : ""}${t.layout === "band" ? `padding:18px;background:${t.color};color:white;` : ""}}
  h2{font-size:17px;color:${t.color};margin:22px 0 8px;border-bottom:1px solid ${t.color};padding-bottom:5px;break-after:avoid}
  h3{font-size:15px;margin:12px 0 6px;break-after:avoid}p{margin:5px 0;overflow-wrap:anywhere;orphans:3;widows:3}
  ${t.layout === "compact" ? "body{line-height:1.45}h2{margin-top:14px}" : ""}
  ${t.layout === "rule" ? `h2{border-left:4px solid ${t.color};padding-left:10px}` : ""}
  </style><body><header class="resume-header"><div class="resume-identity">${render(sections.header)}</div>${photo ? `<img class="resume-photo" src="${photo}" alt="头像">` : ""}</header>${render(sections.body)}</body></html>`;
}
