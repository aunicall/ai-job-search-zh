import { spawn } from "node:child_process";
import { access, readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { redactPersonalInfo } from "./privacy";
import type {
  EngineConfig,
  EngineId,
  EngineModel,
  EngineStatus,
} from "./types";

async function executable(
  command: string,
): Promise<{ command: string; prefix: string[] }> {
  const candidates =
    command.includes("/") || command.includes("\\")
      ? [path.resolve(command)]
      : (process.env.PATH || "")
          .split(path.delimiter)
          .flatMap((p) =>
            process.platform === "win32"
              ? [".exe", ".cmd", ".bat", ""].map((ext) =>
                  path.join(
                    p,
                    /\.(exe|cmd|bat)$/i.test(command) ? command : command + ext,
                  ),
                )
              : [path.join(p, command)],
          );
  for (const file of candidates) {
    try {
      await access(file, constants.F_OK);
      if (/\.(cmd|bat)$/i.test(file)) {
        const shim = await readFile(file, "utf8");
        const entry = shim.match(/%dp0%[\\/]([^"\r\n]*?\.js)/i)?.[1]
          || shim.match(/%dp0%[\\/](node_modules[\\/]@tencent-ai[\\/]codebuddy-code[\\/]bin[\\/]codebuddy)"/i)?.[1];
        if (!entry)
          throw new Error(
            "请填写 CLI 的 .exe 或 .js 路径；此命令包装器暂不支持。",
          );
        const script = path.resolve(path.dirname(file), entry);
        await access(script);
        return { command: process.execPath, prefix: [script] };
      }
      return /\.[cm]?js$/i.test(file)
        ? { command: process.execPath, prefix: [file] }
        : { command: file, prefix: [] };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("请填写"))
        throw error;
    }
  }
  throw new Error(
    "未找到命令，请安装 CLI，或在设置中填写可执行文件的完整路径。",
  );
}
async function killTree(pid: number | undefined) {
  if (!pid) return;
  if (process.platform === "win32")
    await new Promise<void>((resolve) => {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      })
        .on("error", () => resolve())
        .on("close", () => resolve());
    });
  else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
}
const quotaMessage = "AI 引擎额度已耗尽，请检查账号余额、套餐或当前模型的可用额度，再重新运行。";
function quotaExhausted(details: string) {
  return /quota_balance_exhausted|insufficient_quota|quota[_ ](?:exhausted|exceeded)|(?:credits?|balance) (?:exhausted|depleted)|额度(?:已)?(?:耗尽|用尽)|余额不足/i.test(details);
}
async function codebuddyQuotaLog(cwd: string) {
  // 只读取本次调用独有工作目录对应的日志，避免将其他会话的额度错误串入当前任务。
  const root = path.join(homedir(), ".codebuddy", "logs");
  try {
    const dates = (await readdir(root)).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().slice(-2);
    for (const date of dates) for (const name of await readdir(path.join(root, date))) {
      if (name.startsWith(`${path.basename(cwd)}__`) && name.endsWith(".log") && quotaExhausted(await readFile(path.join(root, date, name), "utf8"))) return true;
    }
  } catch { /* 日志不可读时仍使用本次进程返回的错误。 */ }
  return false;
}
export async function runCommand(
  config: EngineConfig,
  args: string[],
  input = "",
  timeout = 15000,
  signal?: AbortSignal,
  rpcRequest?: { method: string; params: Record<string, unknown> },
  engine?: EngineId,
): Promise<string> {
  const bin = await executable(config.command);
  const cwd = await mkdtemp(path.join(tmpdir(), "offer-knocks-"));
  const environment: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  for (const key of Object.keys(environment)) {
    if (key.endsWith("_ACCESS_TOKEN")) delete environment[key];
  }
  delete environment.OFFER_CAMPUS_API_KEY;
  delete environment.OFFER_DATA_DIR;
  try {
    return await new Promise<string>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("任务已取消"));
        return;
      }
      const child = spawn(bin.command, [...bin.prefix, ...args], {
        cwd,
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        env: environment,
      });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      let stdout = "",
        stderr = "",
        settled = false,
        stopError: Error | undefined;
      let rpcBuffer = "",
        rpcResult: string | undefined;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        error ? reject(error) : resolve(rpcResult ?? stdout.trim());
      };
      const stop = async (message: string) => {
        if (settled || stopError) return;
        stopError = new Error(message);
        await killTree(child.pid);
        finish(stopError);
      };
      const abort = () => {
        void stop("任务已取消");
      };
      const timer = setTimeout(() => {
        void (async () => {
          const quota = quotaExhausted(stderr) || (engine === "codebuddy" && await codebuddyQuotaLog(cwd));
          if (!settled && !stopError) void stop(quota ? quotaMessage : "引擎响应超时，未收到明确原因，请检查模型服务、网络及账号状态。");
        })();
      }, timeout);
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > 2_000_000 && !stopError)
          void stop("引擎输出过长，任务已停止。");
        if (!rpcRequest) return;
        rpcBuffer += chunk.toString();
        let newline: number;
        while ((newline = rpcBuffer.indexOf("\n")) >= 0) {
          const line = rpcBuffer.slice(0, newline);
          rpcBuffer = rpcBuffer.slice(newline + 1);
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          if (message.error && (message.id === 0 || message.id === 1)) {
            void stop("无法读取 Codex 模型列表，请检查 CLI 版本与网络。");
          } else if (message.id === 0) {
            child.stdin.write(
              JSON.stringify({ method: "initialized", params: {} }) + "\n",
            );
            child.stdin.write(JSON.stringify({ id: 1, ...rpcRequest }) + "\n");
          } else if (message.id === 1 && message.result) {
            rpcResult = JSON.stringify(message.result);
            child.stdin.end();
          }
        }
      });
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 100000) stderr += chunk.toString();
        if (quotaExhausted(stderr)) void stop(quotaMessage);
      });
      child.on("error", () =>
        finish(new Error("引擎无法启动，请检查可执行文件路径。")),
      );
      child.on("close", async (code) => {
        if (stopError) {
          finish(stopError);
          return;
        }
        if (rpcRequest && !rpcResult) {
          finish(new Error("Codex 未返回模型列表，请检查 CLI 版本与网络。"));
          return;
        }
        // 不把 CLI 原始错误回传浏览器，避免第三方配置中的令牌进入界面或日志。
        const details = stderr + stdout;
        if (code !== 0 && (quotaExhausted(details) || (engine === "codebuddy" && await codebuddyQuotaLog(cwd)))) {
          finish(new Error(quotaMessage));
          return;
        }
        if (code !== 0)
          finish(
            new Error(
              /model.{0,150}(not supported|not found|unavailable)|model_not_found/i.test(
                details,
              )
                ? "模型不可用，请重新选择模型后测试。"
                : /auth|login|credential|401|403/i.test(details)
                  ? "引擎认证失败，请在终端重新登录后检测。"
                  : "引擎调用失败，请在终端检查 CLI 的网络、模型与配置。",
            ),
          );
        else finish();
      });
      child.stdin.on("error", () => {});
      if (rpcRequest) {
        child.stdin.write(
          JSON.stringify({
            id: 0,
            method: "initialize",
            params: { clientInfo: { name: "offer-knocks", version: "0.1.0" } },
          }) + "\n",
        );
      } else child.stdin.end(input);
    });
  } finally {
    if (
      path.dirname(cwd) !== path.resolve(tmpdir()) ||
      !path.basename(cwd).startsWith("offer-knocks-")
    )
      throw new Error("临时目录校验失败");
    await rm(cwd, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}

export async function readCodexModels(
  config: EngineConfig,
  signal?: AbortSignal,
): Promise<EngineModel[]> {
  const output = await runCommand(
    config,
    ["app-server", "--stdio"],
    "",
    30000,
    signal,
    {
      method: "model/list",
      params: { limit: 100, includeHidden: false },
    },
  );
  const result = z
    .object({
      data: z
        .array(
          z.object({
            model: z.string().min(1).max(150),
            displayName: z.string().max(200),
            isDefault: z.boolean(),
            hidden: z.boolean().optional(),
          }),
        )
        .max(100),
    })
    .parse(JSON.parse(output));
  const models = result.data
    .filter((m) => !m.hidden)
    .map((m) => ({ id: m.model, name: m.displayName, isDefault: m.isDefault }));
  if (!models.length)
    throw new Error("当前账号未返回可用模型，请检查 CLI 登录与权限。");
  return models;
}

export const providers: Record<
  EngineId,
  {
    args: (config: EngineConfig) => string[];
    extract: (output: string) => string;
    auth: string[];
  }
> = {
  codex: {
    args: (c) => [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "-c",
      'approval_policy="never"',
      "-c",
      "features.shell_tool=false",
      "-c",
      'web_search="disabled"',
      "--json",
      ...(c.model ? ["--model", c.model] : []),
      "-",
    ],
    extract: (output) => {
      const messages = output.split(/\r?\n/).flatMap((line) => {
        try {
          const data = JSON.parse(line);
          return data.type === "item.completed" &&
            data.item?.type === "agent_message"
            ? [String(data.item.text)]
            : [];
        } catch {
          return [];
        }
      });
      if (!messages.length)
        throw new Error("Codex 未返回结果，请检查登录、模型配置和网络。");
      return messages.at(-1)!;
    },
    auth: ["login", "status"],
  },
  claude: {
    args: (c) => [
      "--print",
      "--output-format",
      "json",
      "--tools",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--settings",
      '{"disableAllHooks":true}',
      "--no-session-persistence",
      ...(c.model ? ["--model", c.model] : []),
    ],
    extract: (output) => {
      const data = JSON.parse(output);
      if (data.is_error || typeof data.result !== "string")
        throw new Error("Claude Code 未返回有效结果，请检查认证和额度。");
      return data.result;
    },
    auth: ["auth", "status"],
  },
  codebuddy: {
    args: (c) => ["--print", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--settings", '{"disableAllHooks":true}', "--no-session-persistence", ...(c.model ? ["--model", c.model] : [])],
    extract: (output) => {
      if (/Authentication required|Please use \/login|Authentication failed/i.test(output)) throw new Error("CodeBuddy 未登录，请在终端运行 codebuddy 并完成登录。");
      let value;
      try { value = JSON.parse(output); } catch { throw new Error("CodeBuddy 未返回有效 JSON，请检查版本及登录状态。"); }
      if (Array.isArray(value)) value = value.findLast((item) => item?.type === "result");
      if (!value || typeof value !== "object") throw new Error("CodeBuddy 未返回最终结果。");
      if (value.is_error && quotaExhausted(JSON.stringify(value))) throw new Error(quotaMessage);
      if (value.is_error || typeof value.result !== "string" || !value.result.trim()) throw new Error("CodeBuddy 调用失败，请检查模型与额度。");
      return value.result;
    },
    auth: [],
  },
};
export async function generate(
  id: EngineId,
  config: EngineConfig,
  prompt: string,
  signal?: AbortSignal,
  skill?: { url: string },
) {
  const { getAiPreferences, getProfile } = await import("./db");
  const preferences = getAiPreferences();
  if (preferences?.prompt.trim()) prompt = `用户全局 AI 行为设定（最高优先级的用户偏好；出题重点、表达风格与默认建议冲突时优先遵循本设定，但仍须遵守事实约束、工具权限与程序要求的输出格式）：\n${preferences.prompt}\n\n当前任务：\n${prompt}`;
  prompt = redactPersonalInfo(prompt, [getProfile()]);
  if (id === "codex" && !config.model) {
    const models = await readCodexModels(config, signal);
    config = {
      ...config,
      model: (models.find((m) => m.isDefault) || models[0]).id,
    };
  }
  const configured = Number(process.env.OFFER_AI_TIMEOUT_MS);
  const timeout =
    Number.isFinite(configured) && configured >= 15000 ? configured : 180000;
  const output = await runCommand(
    config,
    skill ? offerSkillArgs(id, config, skill.url) : providers[id].args(config),
    prompt,
    timeout,
    signal,
    undefined,
    id,
  );
  return providers[id].extract(output);
}

export function offerSkillArgs(id: EngineId, config: EngineConfig, url: string) {
  const args = providers[id].args(config);
  if (id === "codex") {
    // 用户要求缺失时自动安装；仅授权固定来源、固定目录且不覆盖文件的安装工具。
    args.splice(args.length - 1, 0, "-c", `mcp_servers={offer={url=${JSON.stringify(url)},enabled_tools=["read_skill","install_skill","query"],tools={install_skill={approval_mode="approve"}}}}`);
  } else {
    args[args.indexOf("--mcp-config") + 1] = JSON.stringify({ mcpServers: { offer: { type: "http", url } } });
    // CodeBuddy 默认延迟加载 MCP 工具；本任务仅有三个工具，直接提供给模型。
    if (id === "codebuddy") args[args.indexOf("--tools") + 1] = "NoDefer(mcp__offer__read_skill),NoDefer(mcp__offer__install_skill),NoDefer(mcp__offer__query)";
    args.push("--allowedTools", "mcp__offer__read_skill", "mcp__offer__install_skill", "mcp__offer__query");
  }
  return args;
}
export function codebuddyModels(help: string): EngineModel[] {
  const section = help.match(/--model\s+<model>([\s\S]*?)(?=\n\s*--|$)/)?.[1];
  const supported = section?.match(/Currently supported:\s*\(([^)]+)\)/i)?.[1];
  return [...new Set((supported || "").split(",").map((id) => id.trim()).filter((id) => /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(id)))].map((id) => ({ id, name: id, isDefault: false }));
}
export async function checkEngine(
  id: EngineId,
  config: EngineConfig,
  probe = false,
): Promise<EngineStatus> {
  const result: EngineStatus = {
    id,
    state: "error",
    version: "",
    message: "",
    checkedAt: new Date().toISOString(),
  };
  try {
    await executable(config.command);
  } catch (error) {
    return { ...result, state: "missing", message: (error as Error).message };
  }
  try {
    result.version = (await runCommand(config, ["--version"])).slice(0, 120);
    try {
      if (providers[id].auth.length) await runCommand(config, providers[id].auth);
    } catch {
      return {
        ...result,
        state: "unauthenticated",
        message: `请在终端运行 ${id === "codex" ? "codex login" : "claude auth login"}，或检查已配置的第三方服务。`,
      };
    }
    if (id === "codex") {
      try {
        result.models = await readCodexModels(config);
        result.model =
          config.model ||
          (result.models.find((m) => m.isDefault) || result.models[0]).id;
      } catch (error) {
        if (!config.model) throw error;
      }
    } else {
      result.model = config.model;
      if (id === "codebuddy") {
        try { result.models = codebuddyModels(await runCommand(config, ["--help"])); }
        catch { result.models = []; }
      }
    }
    if (probe) {
      const response = await generate(
        id,
        { ...config, model: result.model || config.model },
        id === "codebuddy" ? "连接测试。请计算 17 + 25，只需返回计算结果的数字，不使用工具。" : "连接测试。不要使用任何工具，只输出 OFFER_OK。不要输出其他内容。",
      );
      if (!(id === "codebuddy" ? /\b42\b/.test(response) : response.includes("OFFER_OK")))
        throw new Error("引擎未正确响应连接测试，请检查模型配置。");
    }
    return {
      ...result,
      state: probe ? "connected" : "ready",
      message: probe
        ? "连接成功，可以开始求职工作流。"
        : id === "codebuddy" ? "已安装；连接测试将验证登录与模型。" : "已安装并登录；点击连接测试以验证模型与网络。",
    };
  } catch (error) {
    return { ...result, state: "error", message: (error as Error).message };
  }
}
