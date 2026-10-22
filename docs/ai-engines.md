# AI 引擎安装与配置

[返回项目首页](../README.md) · [使用帮助](usage.md)

Offer来敲门通过本机 CLI 调用 AI，选择一个可用引擎即可。先在终端完成安装、登录和简单对话，再到应用中配置。服务应由完成 CLI 登录的同一系统用户启动。

Codex、CodeBuddy 已完成真实账号全流程测试。Claude Code 已实现接入，但作者没有账号，尚未完成真实账号流程测试；欢迎有账号的小伙伴协助验证。

截至 2026 年 10 月 22 日，已测试通过的 CLI 版本如下，包含通过官方 Offer先生 Skill 读取并查询校招数据：

| 引擎 | 已测试版本 | npm 包 |
| --- | --- | --- |
| Codex | `0.142.5` | `@openai/codex` |
| CodeBuddy | `2.172.1` | `@tencent-ai/codebuddy-code` |

以上为已验证版本，不代表最低兼容版本；其他版本尚未逐一验证。可使用 `codex --version` 或 `codebuddy --version` 检查本机版本。

## Codex

安装 Node.js 24+ 后，可通过 npm 安装 CLI：

```bash
npm install -g @openai/codex
codex --version
codex
```

首次启动按提示完成登录，在终端进行一次简单对话，确认账号与模型可用。安装和认证方式如有变化，以 [Codex 官方文档](https://developers.openai.com/codex/cli/) 为准。

回到「引擎与设置」，选择 Codex，命令通常填 `codex`。应用可读取可用模型列表，也可填写模型标识；保存后执行连接测试。

## CodeBuddy

使用官方完整 CodeBuddy CLI：

```bash
npm install -g @tencent-ai/codebuddy-code
codebuddy --version
codebuddy
```

按提示选择对应站点或组织的登录方式并完成认证，再进行一次简单对话。详见 [CodeBuddy 官方快速入门](https://www.codebuddy.cn/docs/cli/quickstart)。

应用中的命令通常填 `codebuddy`。模型下拉列表从本机 CLI 的帮助信息读取，选择「使用 CLI 默认模型」时沿用 CLI 配置；选择其他模型后保存并执行连接测试。列表表示当前 CLI 支持的模型，不代表账号已拥有对应权限或额度。高级配置中仍可手动填写模型 ID。

## Claude Code

Windows PowerShell 可使用官方安装器：

```powershell
irm https://claude.ai/install.ps1 | iex
```

macOS / Linux 可使用：

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

安装完成后重新打开终端：

```bash
claude --version
claude
```

按提示完成账号认证。应用中的命令通常填 `claude`，模型留空时沿用 CLI 配置。系统要求及其他安装方式见 [Claude Code 官方安装文档](https://code.claude.com/docs/en/setup)。本项目尚未通过真实 Claude Code 账号验证完整流程，欢迎反馈测试结果。

应用的模型下拉框提供 CLI 默认模型，以及 Sonnet、Opus、Haiku 官方别名；具体版本由 CLI 与服务商配置决定。已有的自定义模型 ID 会保留，也可在高级配置中填写。此适配仅完成代码实现，未进行 Claude Code 账号或模型调用测试。

## 在应用中检查连接

1. 进入「引擎与设置」，选择默认引擎。
2. 填写 CLI 命令或可执行文件的绝对路径；不要在命令路径中拼接参数。
3. 按需填写模型，保存配置。
4. 运行连接测试，确认实际请求成功，再开始生成材料。

应用启动时也会后台检查引擎连接。连接测试会调用模型，可能消耗服务额度。订阅、模型权限、地区与网络条件由相应服务商决定，项目不提供免费模型额度。

Windows 支持标准 npm 安装的 CLI 命令入口。若终端能调用、应用却提示找不到，重新打开终端并重启服务，使其读取新的 PATH；也可填写实际可执行文件或 CLI JavaScript 入口的绝对路径。应用和 CLI 应运行在同一环境中，不要混用 Windows 与 WSL 的路径和登录状态。

## 可选环境配置

### 三个引擎通过官方 Skill 使用 Offer先生

项目仓库不包含或分发 Offer先生的 Skill。三个引擎的查询提示词均包含安装检查、官方 ZIP 地址及安装方法：先检查本机安装；缺失时调用安装工具，从官方下载安装完整 Skill，再读取文档并执行查询。已有完整安装会直接复用，不重复下载，也不自动更新或覆盖已有目录。

安装目录位于当前用户主目录下，不在项目中：

| 引擎 | 安装位置 |
| --- | --- |
| Codex | `~/.agents/skills/offer-skill/` |
| Claude Code | `~/.claude/skills/offer-skill/` |
| CodeBuddy | `~/.codebuddy/skills/offer-skill/` |

`~` 表示运行应用的系统用户主目录。官方来源见 [AI 接入页](https://developer.offerxiansheng.com/docs/ai)，下载地址为 [官方 offer-skill v0.1 ZIP](https://image.waiqi.com/offer-skill/releases/offer-skill-v0.1.zip)。首次使用需要网络和该目录的写入权限；安装失败会停止查询。也可自行将 ZIP 内完整的 `offer-skill` 文件夹解压到对应位置；若已有不完整目录，请先备份并处理后重试。Skill 的使用条件以官方说明为准。

本项目通过本机 MCP 提供检查与读取、固定地址安装、只读查询三个工具，不开放任意 Shell 或网站访问，不执行下载包里的脚本。只有引擎实际读取文档并取得查询回执，任务才会成功。接口密钥由服务端保管，不写入 Skill、提示词或 CLI 子进程环境。

Codex 仅为本次调用的 `install_skill` 工具设置预授权，以支持非交互自动安装；其他权限保持原样，配置不写入全局文件。该设置使用官方的 [MCP 单工具审批配置](https://learn.chatgpt.com/docs/config-file/config-reference)。

在项目 `.env.local` 中配置 `OFFER_CAMPUS_API_KEY` 并重启服务，再选择引擎并在「发现职位」勾选 Offer先生。不会修改已有的全局 MCP 配置。Claude Code 仅实现接入，尚未进行真实账号测试。

2026 年 10 月 22 日已使用真实账号验证 Codex 和 CodeBuddy：两者均读取官方 Skill，并通过查询工具成功取得校招数据。CodeBuddy 使用直接加载 MCP 工具的参数，请使用新版 CLI；旧版本若不支持 `NoDefer`，需先更新。

安装后可在「发现职位」选择 Offer先生进行实际查询，验证所选引擎的 Skill 接入；查询会消耗对应 AI 和 Offer先生额度。

### 超时与浏览器

在 `ai-job-search-zh/.env.local` 中按需设置，修改后重启服务：

```dotenv
# AI 请求超时时间，单位毫秒；慢模型可适当增加。
OFFER_AI_TIMEOUT_MS=600000

# 招聘浏览器和 PDF 导出：msedge 或 chrome。
OFFER_BROWSER_CHANNEL=msedge
```

生成简历和面试题需要处理大量信息，耗时较长并不一定是故障。先查看进度和错误，再调整超时；增大超时不会加快模型生成。

| 现象 | 排查方向 |
| --- | --- |
| 找不到命令 | 检查安装、PATH、运行用户及命令路径，重启应用服务。 |
| 未登录或权限不足 | 在同一环境重新启动 CLI 登录，确认账号可进行对话。 |
| 模型不可用 | 选择该账号可用的模型，必要时更新 CLI。 |
| CLI 能对话，应用任务失败 | 检查非交互调用是否受组织策略限制，并记录引擎版本、任务类型与错误信息。 |
| 配额不足或网络失败 | 按服务商提示处理，不要连续重复生成同一任务。 |

报错反馈请移除个人简历、联系方式、密钥和登录凭据。数据发送范围见 [项目首页](../README.md#数据与隐私)。
