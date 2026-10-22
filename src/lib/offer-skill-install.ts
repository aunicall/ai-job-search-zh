import { homedir } from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { Readable } from "node:stream";
import type { EngineId } from "./types";

export const offerSkillUrl = "https://image.waiqi.com/offer-skill/releases/offer-skill-v0.1.zip";
export const offerSkillDocuments = ["SKILL.md", "references/api-contract.md", "references/data-fields.md", "references/query-guidance.md"];
export function offerSkillDirectory(engine: EngineId) {
  return path.join(homedir(), { codex: ".agents", claude: ".claude", codebuddy: ".codebuddy" }[engine], "skills", "offer-skill");
}
export async function readOfferSkill(directory: string) {
  try {
    return (await Promise.all(offerSkillDocuments.map(async (name) => `# ${name}\n${await readFile(path.join(directory, name), "utf8")}`))).join("\n\n");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// 只从官方固定地址安装，保留已有目录，不运行下载包中的脚本。
export async function installOfferSkill(directory: string, signal?: AbortSignal) {
  if (await readOfferSkill(directory)) return;
  const response = await fetch(offerSkillUrl, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), redirect: "error" });
  if (!response.ok || !response.body) throw new Error("官方 Skill 下载失败，请检查网络后重试。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5_000_000) throw new Error("官方 Skill 安装包过大，已停止安装。");
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const entries = Object.values(zip.files).filter((entry) => !entry.name.startsWith("__MACOSX/"));
  if (entries.length > 200) throw new Error("Skill 安装包文件数量异常。");
  const parent = path.dirname(directory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, ".offer-skill-"));
  try {
    let total = 0;
    for (const entry of entries) {
      const original = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName || entry.name;
      if (!original.startsWith("offer-skill/") || original.includes("\\") || original.includes(":") || original.split("/").some((part) => part === ".." || part === ".") || (Number(entry.unixPermissions) & 0o170000) === 0o120000) throw new Error("Skill 安装包包含非法路径。");
      if (entry.dir) continue;
      const destination = path.resolve(staging, original.slice("offer-skill/".length));
      if (!destination.startsWith(staging + path.sep)) throw new Error("Skill 安装路径无效。");
      const buffers: Buffer[] = [];
      for await (const chunk of new Readable().wrap(entry.nodeStream())) {
        total += chunk.length;
        if (total > 10_000_000) throw new Error("Skill 解压内容过大。");
        buffers.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.concat(buffers), { flag: "wx" });
    }
    if (!await readOfferSkill(staging)) throw new Error("官方 Skill 安装包不完整。");
    signal?.throwIfAborted();
    try { await rename(staging, directory); }
    catch (error) {
      if (!await readOfferSkill(directory)) throw new Error("Skill 目录已存在或不可写；请检查本机安装目录，现有文件未覆盖。", { cause: error });
    }
  } finally {
    if (path.dirname(staging) !== parent || !path.basename(staging).startsWith(".offer-skill-")) throw new Error("安装临时目录校验失败");
    await rm(staging, { recursive: true, force: true });
  }
}

export const offerSearchGuidance = `Offer先生搜索接口适配规则：
- city 使用接口认可的完整城市名称，例如北京→北京市、上海→上海市、杭州→杭州市。实测同一关键词传“北京”返回0条、传“北京市”有结果。不要把页面显示简称直接当作接口参数，也不要给香港、自治州或未知地名机械追加“市”；不确定时标记待确认，不编造名称。
- 城市不限时留空，不传“全国”“不限”。用户指定城市时，不得为了取得结果偷偷取消城市限制。
- keywords 是多字段模糊搜索词，应简短且与目标相关。不要把岗位、城市、薪资、学历和技能拼成一条关键词。完整岗位名无结果时，可建议同方向核心词，但不能据此断言没有岗位。
- 仅使用官方契约及当前工具支持的参数。毕业届次必须来自明确的毕业年份，不得由“应届”或当前年份推算；薪资、工作经验、全职及排除条件由返回数据后的筛选处理，不发送未支持的参数，禁止 recruitmentStatus。
- 0条只表示本次条件下接口无返回。先区分参数问题、接口无结果、解析失败与筛选排除，不直接归因于用户条件过高。网页有结果而接口无结果时优先核对字段、城市全称及筛选语义。
- 校招公告可能同时包含正式岗和实习岗，不能因某段实习描述排除整场校招；缺失薪资等信息应标为待核实。hasMore=true只表示还有下一页，不代表本页数量就是全部结果。`;

export function offerSkillPrompt(engine: EngineId) {
  return `使用官方 Offer先生 offer-skill。必须先调用 offer 的 read_skill 检查本机安装并读取文档。若返回 missing，先调用 install_skill 安装，再次调用 read_skill，最后调用 query 查询。用户已要求缺失时自动安装。
安装方法：从官方 ${offerSkillUrl} 下载 ZIP，将完整 offer-skill 目录安装到 ${offerSkillDirectory(engine)}，保留全部脚本和参考文档，不覆盖已有文件，不放入项目仓库。install_skill 工具实现此方法，无需 Shell。官方说明：https://developer.offerxiansheng.com/docs/ai 。
${offerSearchGuidance}
本次 query 工具的条件已由应用校验并固定，调用时不传参数；重复调用不会更换条件或翻页。如条件有问题，说明原因，不声称已修改参数或完成额外查询。
只使用这三个工具；密钥由查询服务保管，不查找或输出密钥。只有实际查询成功才报告成功，不得编造职位。完成后简短回复。`;
}
