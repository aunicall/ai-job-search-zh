"use client";
import { DISCOVERY_SOURCES } from "@/lib/discovery-types";
import { practiceAttempts } from "@/lib/practice-records";
import { StorageSettings } from "./career-pages";
import { Popover, RadioGroup, Tabs } from "radix-ui";

import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import {
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FileText,
  HardDrive,
  Loader2,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserRound,
  Trash2,
} from "lucide-react";
import { api, completeness, formatDate, formatPracticeFeedback } from "@/lib/client";
import {
  ENGINE_NAMES,
  type EngineId,
  type EngineStatus,
  type Profile,
  type Settings,
  type Task,
} from "@/lib/types";
import { Dropdown, Field, Markdown, Modal, Scroll, Tip } from "./ui";
import type { Actions } from "./workspace-app";

export interface ProfileEditor { dirty: boolean; save: () => Promise<boolean> }

export function ProfilePage({
  editorRef,
  data,
  refresh,
  notify,
  onImport,
  importing,
  notices,
  openMaterial,
}: Actions & { editorRef: Ref<ProfileEditor>; onImport: () => void; importing: boolean; notices: ReactNode }) {
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [experienceOpen, setExperienceOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>(data.profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lastImport = data.materials.find((m) => m.title === "简历导入 · 待确认档案");
  const serverValue = JSON.stringify(data.profile);
  useEffect(() => {
    setProfile(JSON.parse(serverValue));
  }, [serverValue]);
  function input(
    key: keyof Profile,
    placeholder: string,
    multiline = false,
    rows = 3,
  ) {
    const props = {
      value: profile[key],
      placeholder,
      maxLength: multiline ? 40000 : 500,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setProfile((old) => ({ ...old, [key]: e.target.value })),
    };
    return multiline ? (
      <textarea {...props} rows={rows} />
    ) : (
      <input {...props} type={key === "email" ? "email" : "text"} />
    );
  }
  async function save() {
    if (saving) return false;
    if (!dirty) return true;
    setSaving(true);
    setError("");
    try {
      await api("profile", { method: "PUT", body: JSON.stringify(profile) });
      await refresh();
      notify("档案已保存");
      return true;
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message, true);
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function updateAvatar(file?: File, remove = false) {
    if (!file && !remove) return;
    setAvatarBusy(true);
    try {
      if (remove) await api("profile/avatar", { method: "DELETE" });
      else {
        if (file!.size > 5 * 1024 * 1024) throw new Error("请选择 5 MB 以内的头像");
        const form = new FormData(); form.set("file", file!);
        await api("profile/avatar", { method: "POST", body: form });
      }
      await refresh();
      notify(remove ? "头像已移除" : "头像已保存");
    } catch (error) { notify((error as Error).message, true); }
    finally { setAvatarBusy(false); if (avatarInput.current) avatarInput.current.value = ""; }
  }
  const progress = completeness(profile);
  const dirty = JSON.stringify(profile) !== serverValue;
  useImperativeHandle(editorRef, () => ({ dirty, save }));
  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }
  return (
    <div className="profile-layout">
      <Scroll className="profile-form-scroll">
        {notices}
        <form
          id="profile-form"
          onSubmit={submit}
          noValidate
          className="profile-form"
        >
          <section className="panel form-panel">
            <div className="section-heading">
              <h2>
                <UserRound size={20} />
                基本信息
              </h2>
            </div>
            <div className="profile-avatar-section">
              <div className="profile-avatar-preview">{data.avatarId ? <img src={`/api/profile/avatar/${data.avatarId}`} alt="个人头像" /> : <UserRound size={34} strokeWidth={1.4} />}</div>
              <div className="profile-avatar-controls"><div className="button-group"><strong>个人头像</strong><span className="muted">选填</span><Tip label="支持 5 MB 以内的 JPG、PNG、WebP，自动裁为 3:4。仅用于简历排版，不发送给 AI；更换或移除不影响已生成简历。" /></div>
                <div className="button-group"><button type="button" className="button secondary small" disabled={avatarBusy || saving} onClick={() => avatarInput.current?.click()}>{avatarBusy ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}{data.avatarId ? "更换头像" : "上传头像"}</button>{data.avatarId && <button type="button" className="text-button" disabled={avatarBusy || saving} onClick={() => void updateAvatar(undefined, true)}>移除</button>}</div>
              </div>
              <input ref={avatarInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" aria-label="上传个人头像" onChange={(e) => void updateAvatar(e.target.files?.[0])} />
            </div>
            <p className="muted">姓名、电话和邮箱仅在本地保存并拼入简历，本项目不会主动发送给 AI 引擎。经历正文、笔记等自由文本请勿填写无关隐私。</p>
            <div className="form-grid">
              <Field label="姓名">{input("name", "你的姓名")}</Field>
              <Field label="所在城市">{input("city", "如：上海")}</Field>
              <Field label="联系邮箱">
                {input("email", "用于简历中的联系方式")}
              </Field>
              <Field label="手机号码">{input("phone", "你的联系号码")}</Field>
              <Field label="目标职位">
                {input("targetRole", "如：产品经理、前端工程师")}
              </Field>
              <Field label="期望薪资">
                {input("expectedSalary", "如：25–35K · 14薪（税前）")}
              </Field>
              <Field label="工作经验">
                <Popover.Root open={experienceOpen} onOpenChange={setExperienceOpen}>
                  <Popover.Trigger asChild>
                    <button type="button" className="select-trigger" aria-label="工作经验">
                      <span>{profile.experience || "请选择工作经验"}</span>
                      <ChevronDown size={16} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content className="experience-picker" align="start" sideOffset={8} collisionPadding={16} aria-label="选择工作经验">
                      <RadioGroup.Root className="experience-options" aria-label="工作经验选项" value={profile.experience} onValueChange={(experience) => {
                        setProfile((old) => ({ ...old, experience }));
                        setExperienceOpen(false);
                      }}>
                        {["应届生", "1年", "2年", "3年", "4年", "5年", "6年", "7年", "8年", "9年", "10年", "10年~20年", "20年以上"].map((experience) => (
                          <RadioGroup.Item key={experience} value={experience} className="experience-option">
                            {experience}
                          </RadioGroup.Item>
                        ))}
                      </RadioGroup.Root>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </Field>
              <Field label="核心技能">
                {input("skills", "用逗号分隔，如：React, 用户研究")}
              </Field>
            </div>
            <Field label="教育经历">
              {input(
                "education",
                "学校、学历、专业、起止时间；有特殊学历口径可补充说明。",
                true,
                3,
              )}
            </Field>
          </section>
          <section className="panel form-panel">
            <div className="section-heading">
              <h2>
                <FileText size={20} />
                经历与成果
              </h2>
              <Tip label="只填写真实信息。尽量包括公司、职位、时间、职责、项目成果与数字依据。生成材料只以这里的事实为准。" />
            </div>
            <Field label="经历正文" hint="支持直接粘贴已有简历">
              {input(
                "background",
                "工作经历、项目经历、实习、技能与代表成果。\n\n例如：\n2022.07–2025.06  某公司 · 前端工程师\n负责…，使用…，最终取得…（有依据的成果）",
                true,
                12,
              )}
            </Field>
          </section>
          <section className="panel form-panel">
            <div className="section-heading">
              <h2>
                <SlidersHorizontal size={20} />
                求职偏好
              </h2>
            </div>
            <div className="form-grid">
              <Field label="偏好与补充">
                {input(
                  "preferences",
                  "期望行业、城市、通勤、工作方式、到岗时间等。",
                  true,
                  4,
                )}
              </Field>
              <Field label="明确排除的条件">
                {input(
                  "exclusions",
                  "如：不接受外包 / 劳务派遣、不跨城、不接受特定行业。",
                  true,
                  4,
                )}
              </Field>
            </div>
          </section>
          {error && (
            <div className="inline-error" role="alert">
              <CircleAlert size={17} />
              {error}
            </div>
          )}
        </form>
      </Scroll>
      <aside className="profile-aside">
        <Scroll className="profile-aside-scroll">
          <section className="panel profile-completion">
            <div className="completion-ring">
              <svg viewBox="0 0 112 112">
                <circle
                  cx="56"
                  cy="56"
                  r="47"
                  fill="none"
                  stroke="#eaf0eb"
                  strokeWidth="7"
                />
                <circle
                  cx="56"
                  cy="56"
                  r="47"
                  fill="none"
                  stroke="#39795f"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${progress * 2.953} 295.3`}
                  transform="rotate(-90 56 56)"
                />
              </svg>
              <strong>
                {progress}
                <span>%</span>
              </strong>
            </div>
            <h3>档案完整度</h3>

            <div className="completion-checklist">
              {[
                {
                  label: "基本信息",
                  done: Boolean(
                    profile.name &&
                    (profile.email || profile.phone) &&
                    profile.city,
                  ),
                },
                { label: "求职方向", done: Boolean(profile.targetRole) },
                {
                  label: "教育与技能",
                  done: Boolean(profile.education && profile.skills),
                },
                { label: "经历与成果", done: Boolean(profile.background) },
              ].map((item) => (
                <div key={item.label}>
                  <CheckCircle2
                    size={17}
                    className={item.done ? "text-green" : "text-light"}
                  />
                  <span>{item.label}</span>
                  {item.done && <span className="text-green">已填写</span>}
                </div>
              ))}
            </div>
          </section>
        </Scroll>
        <div className="profile-actions">
          <span
            className="profile-unsaved"
            role="status"
            style={{ visibility: dirty ? "visible" : "hidden" }}
          >
            <CircleAlert size={15} />未保存
          </span>
          <button
            className="button secondary"
            onClick={onImport}
            disabled={importing}
            type="button"
          >
            {importing ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Upload size={17} />
            )}
            导入简历
          </button>
          <button
            className="button primary"
            form="profile-form"
            disabled={saving || avatarBusy || !dirty}
            type="submit"
          >
            {saving ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Save size={17} />
            )}
            保存档案
          </button>
        </div>
        {lastImport && (
          <button className="text-button" onClick={() => openMaterial(lastImport)}>
            <FileText size={16} />
            查看上次导入结果
          </button>
        )}
      </aside>
    </div>
  );
}

const statusLabels: Record<EngineStatus["state"], string> = {
  missing: "未安装",
  unauthenticated: "未登录",
  ready: "已登录 · 未测试",
  connected: "连接正常",
  error: "连接异常",
};
export function SettingsPage({
  openMaterial,
  editorRef,
  data,
  refresh,
  notify,
  statuses,
  checking,
  checkEngines,
}: Actions & {
  editorRef?: Ref<ProfileEditor>;
  statuses: EngineStatus[];
  checking: string | null;
  checkEngines: (id?: EngineId, probe?: boolean) => Promise<void>;
}) {
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [settingsTab, setSettingsTab] = useState("engines");
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const tasks = [...data.tasks, ...(data.discovery || []).map((run) => ({ ...run, action: "discovery" as const, jobId: null, feedback: undefined, updatedAt: run.logs?.at(-1)?.at || run.createdAt }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedTask = tasks.find((task) => task.id === taskId);
  const selectedDiscovery = data.discovery?.find((run) => run.id === taskId);
  useEffect(() => { void refresh().catch((error) => notify((error as Error).message, true)); }, [refresh, notify]);
  const taskMaterials = selectedTask ? data.materials.filter((material) => material.taskId === selectedTask.id) : [];
  const feedbackMaterial = selectedTask?.feedback ? data.materials.find((material) => material.id === selectedTask.feedback!.materialId) : undefined;
  const feedbackAttempt = feedbackMaterial?.practice ? practiceAttempts(feedbackMaterial.practice).find((attempt) => attempt.id === selectedTask?.feedback?.attemptId) : undefined;
  const feedbackTurn = feedbackAttempt?.turns[selectedTask?.feedback?.turn ?? -1];
  const taskDate = (value: string) => formatDate(value, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  const current = JSON.stringify(data.settings);
  useEffect(() => {
    setSettings(JSON.parse(current));
  }, [current]);
  async function save() {
    await api("settings", { method: "PUT", body: JSON.stringify(settings) });
    await refresh();
  }
  const dirty = JSON.stringify(settings) !== current;
  useImperativeHandle(editorRef, () => ({
    dirty,
    save: async () => {
      if (saving) return false;
      setSaving(true);
      try {
        await save();
        notify("设置已保存");
        return true;
      } catch (error) {
        notify((error as Error).message, true);
        return false;
      } finally { setSaving(false); }
    },
  }));
  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    const enginesChanged = settings.engine !== data.settings.engine || JSON.stringify(settings.engines) !== JSON.stringify(data.settings.engines);
    setSaving(true);
    try {
      await save();
      notify("设置已保存");
      if (enginesChanged) await checkEngines();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  async function test(id: EngineId) {
    setSaving(true);
    try {
      await save();
      await checkEngines(id, true);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Tabs.Root className="settings-tabs" value={settingsTab} onValueChange={setSettingsTab}>
      <form noValidate onSubmit={saveSettings}>
        <div className="settings-tab-header">
        <Tabs.List className="settings-tab-list" aria-label="设置分类">
          <Tabs.Trigger value="engines" className="settings-tab">AI 引擎</Tabs.Trigger>
          <Tabs.Trigger value="storage" className="settings-tab">数据与工作空间</Tabs.Trigger>
          <Tabs.Trigger value="logs" className="settings-tab">任务日志</Tabs.Trigger>
        </Tabs.List>
        </div>
        <Tabs.Content value="engines" forceMount hidden={settingsTab !== "engines"} className="settings-tab-panel">
        <section className="panel settings-panel">
          <div className="section-heading">
            <div className="button-group">
              <h2>
                <Sparkles size={20} />
                AI引擎
              </h2>
            <Tip label="平台启动后会在后台自动验证安装、登录和模型连接，结果分别更新。检测会发起简短模型调用，可能消耗引擎额度。" />
            </div>
            <div className="button-group">
            <button
              type="button"
              className="button secondary settings-header-action"
              disabled={Boolean(checking) || saving}
              onClick={() => void checkEngines()}
            >
              <RefreshCw size={17} className={checking ? "spin" : ""} />
              重新检测
            </button>
            <button className="button primary settings-header-action" type="submit" disabled={saving || Boolean(checking) || !dirty}><Save size={17} />保存设置</button>
            </div>
          </div>
          <div className="engine-cards">
            {(["codex", "claude", "codebuddy"] as const).map((id) => {
              const status = statuses.find((s) => s.id === id);
              const models = id === "claude"
                ? ["sonnet", "opus", "haiku"].map((name) => ({ id: name, name: name[0].toUpperCase() + name.slice(1), isDefault: false }))
                : status?.models || [];
              return (
                <div
                  key={id}
                  className={`engine-card ${settings.engine === id ? "selected" : ""}`}
                >
                  <label className="engine-select">
                    <input
                      type="radio"
                      name="engine"
                      value={id}
                      checked={settings.engine === id}
                      onChange={() =>
                        setSettings((old) => ({ ...old, engine: id }))
                      }
                    />
                    <span className={`engine-large-icon ${id}`}>
                      <img className="engine-brand-logo" src={`/engines/${id}.svg`} alt="" width={27} height={27} />
                    </span>
                    <span>
                      <strong>{ENGINE_NAMES[id]}</strong>
                      <small>{id === "codex" ? "OpenAI" : id === "claude" ? "Anthropic" : "腾讯"}</small>
                    </span>
                    <span className="custom-radio">
                      {settings.engine === id && <Check size={13} />}
                    </span>
                  </label>
                  <div className="engine-card-body">
                    <span
                      className={`badge ${status?.state === "connected" ? "success" : status?.state === "ready" ? "neutral" : "warning"}`}
                    >
                      <i />
                      {checking === id || checking === "all"
                        ? "检测中…"
                        : status
                          ? statusLabels[status.state]
                          : "尚未检测"}
                    </span>
                    <p>{status?.message || "检测安装、登录与模型连接状态。"}</p>
                    <span className="engine-version">
                      {status?.version || "本地 CLI"}
                    </span>
                    <Field label="模型">
                        <Dropdown
                          label={`${ENGINE_NAMES[id]} 模型`}
                          value={settings.engines[id].model || "__auto__"}
                          onChange={(value) =>
                            setSettings((old) => ({
                              ...old,
                              engines: {
                                ...old.engines,
                                [id]: {
                                  ...old.engines[id],
                                  model: value === "__auto__" ? "" : value,
                                },
                              },
                            }))
                          }
                          options={[
                            {
                              value: "__auto__",
                              label: `使用 CLI 默认模型${models.find((m) => m.isDefault) ? `（${models.find((m) => m.isDefault)!.id}）` : ""}`,
                            },
                            ...models.map((m) => ({
                              value: m.id,
                              label: m.name,
                            })),
                            ...(settings.engines[id].model &&
                            !models.some(
                              (m) => m.id === settings.engines[id].model,
                            )
                              ? [
                                  {
                                    value: settings.engines[id].model,
                                    label: settings.engines[id].model,
                                  },
                                ]
                              : []),
                          ]}
                          disabled={Boolean(checking) || saving}
                        />
                    </Field>
                    <div className="flex-between">
                      <a
                        className="text-button"
                        target="_blank"
                        rel="noreferrer"
                        href={
                          id === "codex"
                            ? "https://developers.openai.com/codex/cli/"
                            : id === "claude" ? "https://code.claude.com/docs/zh-CN/overview" : "https://www.codebuddy.cn/docs/cli/quickstart"
                        }
                      >
                        安装指南
                        <ExternalLink size={14} />
                      </a>
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => void test(id)}
                        disabled={Boolean(checking) || saving}
                      >
                        {checking === id ? (
                          <Loader2 size={16} className="spin" />
                        ) : (
                          <PlugZap size={16} />
                        )}
                        连接测试
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="advanced-toggle"
            onClick={() => setAdvanced(!advanced)}
            aria-expanded={advanced}
          >
            <SlidersHorizontal size={17} />
            <span>命令路径与模型</span>
            <ChevronDown size={16} className={advanced ? "rotate" : ""} />
          </button>
          {advanced && (
            <div className="advanced-fields">
              {(["codex", "claude", "codebuddy"] as const).map((id) => (
                <div key={id}>
                  <h3>{ENGINE_NAMES[id]}</h3>
                  <div className="form-grid">
                    <Field label="可执行文件路径">
                      <input
                        value={settings.engines[id].command}
                        onChange={(e) =>
                          setSettings((old) => ({
                            ...old,
                            engines: {
                              ...old.engines,
                              [id]: {
                                ...old.engines[id],
                                command: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder={id}
                        maxLength={1000}
                      />
                    </Field>
                    <Field
                      label="模型 ID"
                      hint={
                        id === "codex"
                          ? "留空自动选择 CLI 推荐模型"
                          : "留空沿用 CLI 默认值"
                      }
                    >
                      <input
                        value={settings.engines[id].model}
                        onChange={(e) =>
                          setSettings((old) => ({
                            ...old,
                            engines: {
                              ...old.engines,
                              [id]: {
                                ...old.engines[id],
                                model: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="使用引擎默认模型"
                        maxLength={150}
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <p className="inline-note">
                <CircleAlert size={16} />
                路径只填写可执行文件，不附加命令参数。支持标准 npm
                安装的命令包装器。
              </p>
            </div>
          )}
        </section>
        </Tabs.Content>
        <Tabs.Content value="storage" forceMount hidden={settingsTab !== "storage"} className="settings-tab-panel">
      <section className="panel settings-panel storage-panel">
        <div className="section-heading">
          <h2>
            <HardDrive size={20} />
            数据与工作空间
          </h2>
          <div className="button-group">
          <button className="button primary settings-header-action" type="submit" disabled={saving || Boolean(checking) || !dirty}><Save size={17} />保存设置</button>
          </div>
        </div>
        <StorageSettings data={data} refresh={refresh} notify={notify} />
        <div className="storage-search-limit">
          <Field label="每个平台的搜索结果上限">
            <div className="discovery-limit-slider">
              <input id="discovery-limit" aria-label="每个平台的搜索结果上限" type="range" min={1} max={500} step={1}
                value={Number.isFinite(settings.discoveryLimit) ? settings.discoveryLimit : 50}
                onChange={(e) => setSettings((old) => ({ ...old, discoveryLimit: e.target.valueAsNumber }))} />
              <output htmlFor="discovery-limit">{Number.isFinite(settings.discoveryLimit) ? settings.discoveryLimit : 50} 条</output>
            </div>
            <small className="muted">默认 50 条，可设置 1–500 条。每个平台的多个关键词共用额度，达到上限后再去重和筛选；数量越多，处理时间越长。</small>
          </Field>
        </div>
        <div className="storage-row">
          <div>
            <strong>导出数据备份</strong>
            <p>档案、职位、面试、笔记与设定。文件请另行备份工作目录。</p>
          </div>
          <a href="/api/export/backup" className="button secondary">
            <ArrowDownToLine size={17} />
            导出备份
          </a>
        </div>
        <div className="storage-row">
          <div>
            <strong>导出投递记录</strong>
            <p>CSV 格式，可用 Excel 或 WPS 打开。</p>
          </div>
          <a href="/api/export/tracker" className="button secondary">
            <ArrowDownToLine size={17} />
            导出记录
          </a>
        </div>
        <div className="settings-privacy">
          <ShieldCheck size={20} />
          <p>
            无需网站账号。AI
            任务将必要的档案与职位内容交给所选引擎，招聘平台上的投递由你确认提交。
          </p>
        </div>
      </section>
        </Tabs.Content>
        <Tabs.Content value="logs" forceMount hidden={settingsTab !== "logs"} className="settings-tab-panel">
      <section className="task-history panel settings-panel">
        <div className="section-heading">
          <h2><FileText size={20} />任务日志</h2>
          <div className="button-group">
          {dirty && <button className="button primary settings-header-action" type="submit" disabled={saving || Boolean(checking) || !dirty}><Save size={17} />保存设置</button>}
          <button type="button" className="button secondary settings-header-action clear-task-logs" disabled={!tasks.length || clearingLogs} onClick={() => setClearLogsOpen(true)}><Trash2 size={17} />清空日志</button>
          </div>
        </div>
        {tasks.length ? (
          <Scroll className="task-history-scroll">
          <table className="generation-table task-history-table">
            <thead><tr><th scope="col">任务</th><th scope="col">状态</th><th scope="col">执行结果</th><th scope="col">时间</th><th scope="col">操作</th></tr></thead>
            <tbody>{tasks.slice(0, 80).map((task) => (
              <tr key={task.id}>
                <td>{task.feedback ? "AI 作答点评" : ({ evaluate: "匹配评估", apply: "投递材料", interview: "面试准备", practice: "模拟面试", learning: "能力提升", profile: "简历导入", discovery: "职位发现" } as Record<Task["action"] | "discovery", string>)[task.action]}</td>
                <td><span className={`badge ${task.status === "completed" ? "success" : task.status === "failed" ? "danger" : "neutral"}`}>{task.status === "running" ? "进行中" : task.status === "completed" ? "已完成" : (task.status === "cancelled" || task.error === "任务已取消") ? "已取消" : "未完成"}</span></td>
                <td>{task.error || task.step || "—"}</td>
                <td><time dateTime={task.createdAt}>{taskDate(task.createdAt)}</time></td>
                <td>{(task.step || task.error || task.feedback || data.materials.some((material) => material.taskId === task.id)) ? <button type="button" className="text-button" onClick={() => setTaskId(task.id)}>查看详情</button> : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          </Scroll>
        ) : (
          <div className="empty-tasks">暂无 AI 任务</div>
        )}
      </section>
        </Tabs.Content>
      </form>
      </Tabs.Root>
      <Modal open={clearLogsOpen} onOpenChange={(open) => { if (!clearingLogs) setClearLogsOpen(open); }} title="清空任务日志">
        <div className="dialog-body">
          <p>确定清空全部任务日志吗？</p>
          <p>将删除 AI 任务记录、职位发现运行日志及作答点评日志，无法恢复。职位搜索结果、候选职位、生成材料和作答内容仍保留。</p>
          {tasks.some((task) => task.status === "running") && <p className="danger">仍有任务正在运行或暂停，请先完成或取消后再清空。</p>}
          <div className="dialog-actions">
            <button type="button" className="button secondary" disabled={clearingLogs} onClick={() => setClearLogsOpen(false)}>取消</button>
            <button type="button" className="button secondary danger" disabled={clearingLogs || tasks.some((task) => task.status === "running")} onClick={async () => {
              setClearingLogs(true);
              try {
                await api("task-logs", { method: "DELETE", body: JSON.stringify({ confirm: true }) });
                setTaskId(null); setClearLogsOpen(false);
                await refresh(); notify("任务日志已清空");
              } catch (error) { notify((error as Error).message, true); }
              finally { setClearingLogs(false); }
            }}>{clearingLogs ? "正在清空…" : "确认清空"}</button>
          </div>
        </div>
      </Modal>
      <Modal open={Boolean(selectedTask)} onOpenChange={(open) => { if (!open) setTaskId(null); }} title="任务详情" wide>
        {selectedTask && <div className="dialog-body task-detail-body">
          <Scroll className="task-detail-scroll">
          <p>创建时间：{taskDate(selectedTask.createdAt)}</p>
          <p>更新时间：{taskDate(selectedTask.updatedAt)}</p>
          <p>状态：{{ running: "进行中", completed: "已完成", failed: "未完成", cancelled: "已取消" }[selectedTask.status]}</p>
          {selectedTask.step && !["已完成", "进行中", "未完成", "任务未完成", selectedTask.error].includes(selectedTask.step) && <p>{selectedTask.step}</p>}
          {selectedTask.error && <p className="danger">{selectedTask.error}</p>}
          {(taskMaterials.length > 0 || selectedTask.feedback || selectedDiscovery) && <hr className="task-detail-divider" />}
          {selectedDiscovery && <>
            <h3>搜索条件</h3>
            <p>方式：{selectedDiscovery.query.mode === "custom" ? "自定义条件" : "根据个人档案"}</p>
            <p>目标方向：{selectedDiscovery.query.keywords} · 城市：{selectedDiscovery.query.city || "不限"}</p>
            <p>搜索关键词：{selectedDiscovery.keywords.join("、") || "尚未生成"}</p>
            {([ ["期望薪资", selectedDiscovery.query.expectedSalary], ["工作经验", selectedDiscovery.query.experience], ["学历", selectedDiscovery.query.education], ["技能", selectedDiscovery.query.skills], ["其他偏好", selectedDiscovery.query.preferences], ["排除条件", selectedDiscovery.query.exclusions] ]).filter(([, value]) => value).map(([label, value]) => <p key={label}>{label}：{value}</p>)}
            <h3>来源结果 · {selectedDiscovery.resultCount} 个机会</h3>
            {selectedDiscovery.sources.map((source) => <p key={source.id}><strong>{DISCOVERY_SOURCES.find((item) => item.id === source.id)?.name || source.id}</strong> · {source.message || ({ pending: "等待获取", running: "获取中", completed: "已完成", error: "获取失败" })[source.state]}</p>)}
            <h3>运行日志</h3>
            {selectedDiscovery.logs?.length ? <ul>{selectedDiscovery.logs.map((entry, index) => <li key={index}><time dateTime={entry.at}>{taskDate(entry.at)}</time> · {entry.message}</li>)}</ul> : <p className="muted">暂无运行日志</p>}
          </>}
          {taskMaterials.length > 0 && <><h3>生成结果</h3>{taskMaterials.map((material) => <p key={material.id}><button type="button" className="text-button" onClick={() => openMaterial(material)}>{material.title} · 查看</button></p>)}</>}
          {feedbackTurn && <>
            <h3>第 {selectedTask.feedback!.turn + 1} 题</h3>
            <Markdown text={feedbackTurn.question} />
            <h4>我的回答</h4><Markdown text={feedbackTurn.answer} />
            <h4>AI 点评</h4>{feedbackTurn.feedback ? <Markdown text={formatPracticeFeedback(feedbackTurn.feedback)} /> : <p>{feedbackTurn.feedbackStatus === "failed" ? "点评未完成，回答已保存。" : feedbackAttempt?.feedbackPaused ? "点评已暂停" : "等待后台点评"}</p>}
            {!!feedbackTurn.feedbackLog?.length && <><h4>点评日志</h4><ul>{feedbackTurn.feedbackLog.map((entry, index) => <li key={index}>{taskDate(entry.at)} · {entry.message}</li>)}</ul></>}
          </>}
          {selectedTask.feedback && !feedbackTurn && <p className="muted">关联的作答记录已不存在。</p>}
          </Scroll>
        </div>}
      </Modal>
    </>
  );
}
