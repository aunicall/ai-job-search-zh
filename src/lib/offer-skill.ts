import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { installOfferSkill, offerSkillDirectory, readOfferSkill } from "./offer-skill-install";
import type { EngineId } from "./types";
import { requestOffer, type OfferResults, offerQuerySchema } from "./offer-source";
import { z } from "zod";

// 官方 Skill 允许原生 HTTP 工具；只开放本次固定查询，不给模型密钥或任意网络权限。
export async function useOfferSkill(
  query: z.infer<typeof offerQuerySchema>,
  invoke: (url: string) => Promise<unknown>,
  signal?: AbortSignal,
  engine: EngineId = "codex",
): Promise<OfferResults> {
  const input = offerQuerySchema.parse(query);
  const directory = offerSkillDirectory(engine);
  const token = `/${randomBytes(24).toString("hex")}`;
  const controller = new AbortController();
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let loaded = false;
  let result: OfferResults | undefined;
  let queryError: Error | undefined;
  let installing: Promise<void> | undefined;
  let pending: Promise<OfferResults> | undefined;
  const server = createServer(async (req, res) => {
    const reply = (status: number, value?: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(value === undefined ? undefined : JSON.stringify(value));
    };
    if (req.url !== token || req.headers.origin) { reply(403); return; }
    if (req.method !== "POST") { reply(405); return; }
    let id: string | number | null = null;
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 16000) { reply(413); return; }
      }
      const message = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number()]).optional(), method: z.string(), params: z.unknown().optional() }).parse(JSON.parse(body));
      if (message.id === undefined) { reply(202); return; }
      id = message.id;
      let response: unknown;
      if (message.method === "initialize") {
        response = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "offer-skill", version: "0.1" } };
      } else if (message.method === "ping") response = {};
      else if (message.method === "tools/list") response = { tools: [
        { name: "read_skill", description: "读取官方 offer-skill 及 API 契约、字段规则、查询指引。查询前必须读取。", annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        { name: "query", description: `按官方 offer-skill 执行本次校招搜索，只读、仅一次，无需传入参数或密钥。固定条件：${JSON.stringify(input)}。先调用 read_skill。`, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        { name: "install_skill", description: "缺失时从官方固定地址安装完整 offer-skill 到当前用户的引擎技能目录，不覆盖已有文件，不写入项目。安装后需重新读取。", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
      ] };
      else if (message.method === "tools/call") {
        const call = z.object({ name: z.enum(["read_skill", "install_skill", "query"]), arguments: z.object({}).strict().optional() }).parse(message.params);
        if (call.name === "read_skill") {
          const instructions = await readOfferSkill(directory);
          loaded = Boolean(instructions);
          response = { content: [{ type: "text", text: instructions || JSON.stringify({ status: "missing", directory, next: "调用 install_skill 安装后重新调用 read_skill" }) }] };
        } else if (call.name === "install_skill") {
          requestSignal.throwIfAborted();
          installing ??= installOfferSkill(directory, requestSignal);
          await installing;
          response = { content: [{ type: "text", text: "安装完成，请调用 read_skill 读取后再查询。" }] };
        } else {
          if (!loaded) throw new Error("必须先读取官方 offer-skill");
          requestSignal.throwIfAborted();
          pending ??= requestOffer(input, requestSignal);
          try { result = await pending; }
          catch (error) { queryError = new Error((error as Error).message); throw queryError; }
          response = { content: [{ type: "text", text: JSON.stringify({ code: 1000, data: result }) }] };
        }
      } else { reply(200, { jsonrpc: "2.0", id, error: { code: -32601, message: "Unsupported method" } }); return; }
      reply(200, { jsonrpc: "2.0", id, result: response });
    } catch (error) {
      reply(200, { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: queryError?.message || (error instanceof Error && !(error instanceof z.ZodError) ? error.message : "Skill 调用失败：请按工具说明检查安装、读取后查询。") }] } });
    }
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Skill 查询工具未启动");
    requestSignal.throwIfAborted();
    await invoke(`http://127.0.0.1:${address.port}${token}`);
    if (queryError) throw queryError;
    if (!loaded || !result) throw new Error("AI 未实际读取并调用官方 Offer先生 Skill，请检查引擎的 MCP 工具支持。");
    return result;
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
