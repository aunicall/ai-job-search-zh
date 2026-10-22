"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "radix-ui";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  DoorOpen,
  FileText,
  Loader2,
  LockKeyhole,
  Menu,
  MessageSquare,
  CalendarDays,
  BookOpen,
  SlidersHorizontal,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { practiceQuestionContent } from "@/lib/practice-records";
import { api, needsFollowUp } from "@/lib/client";
import {
  ENGINE_NAMES,
  type EngineId,
  type EngineStatus,
  type Job,
  type Material,
  type PageId,
  type Profile,
  type Task,
  type Workspace,
} from "@/lib/types";
import { Markdown, Modal, Scroll, Tip } from "./ui";
import { JobDetail, JobForm, TrackerPage } from "./jobs";
import { ProfilePage, SettingsPage, type ProfileEditor } from "./profile-settings";
import { AiPreferencesPage, InterviewsPage, JournalPage, PracticePage, TemplatesPage, ResumePreview } from "./career-pages";
import { DiscoveryPage } from "./discovery";

const navigation: { id: PageId; name: string; icon: typeof Sparkles }[] =
  [
    { id: "discover", name: "发现职位", icon: Sparkles },
    { id: "applications", name: "职位管理", icon: BriefcaseBusiness },
    { id: "practice", name: "模拟面试", icon: MessageSquare },
    { id: "interviews", name: "面试管理", icon: CalendarDays },
    { id: "profile", name: "个人档案", icon: UserRound },
    { id: "templates", name: "简历模板", icon: FileText },
    { id: "journal", name: "求职笔记", icon: BookOpen },
    { id: "ai-settings", name: "AI 设定", icon: SlidersHorizontal },
    { id: "settings", name: "引擎与设置", icon: Settings2 },
  ];
export interface Actions {
  data: Workspace;
  refresh: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
  runTask: (action: Task["action"], jobId?: string | null, practice?: { materialId?: string; attemptId?: string; answer?: string; turn?: number; templateId?: string }) => Promise<void>;
  openJob: (id: string, tab?: "匹配分析" | "面试准备" | "投递材料" | "跟进记录") => void;
  navigate: (page: PageId) => void;
  openPractice: (id: string) => void;
  openMaterial: (material: Material) => void;
}

export default function WorkspaceApp() {
  const [data, setData] = useState<Workspace | null>(null);
  const [page, setPage] = useState<PageId>("discover");
  const profileEditor = useRef<ProfileEditor>(null);
  const settingsEditor = useRef<ProfileEditor>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [savingBeforeLeave, setSavingBeforeLeave] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [statuses, setStatuses] = useState<EngineStatus[]>([]);
  const [checking, setChecking] = useState<string | null>(null);
  const engineChecks = useRef(new Set<EngineId>());
  const startupCheckStarted = useRef(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobTab, setJobTab] = useState<"职位详情" | "匹配分析" | "面试准备" | "投递材料" | "跟进记录">("职位详情");
  const [practiceJob, setPracticeJob] = useState<string | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);
  const [reviewProfile, setReviewProfile] = useState<Profile | null>(null);
  const [help, setHelp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previousTasks = useRef<Task[] | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, error: isError });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const refresh = useCallback(async () => {
    const result = await api<Workspace>("workspace");
    for (const task of result.tasks) {
      const old = previousTasks.current?.find((t) => t.id === task.id);
      if (old?.status === "running" && task.status !== "running" && !task.feedback) {
        notify(
          task.status === "failed" ? task.error : "任务完成，结果已保存",
          task.status === "failed",
        );
        if (task.action === "profile" && task.status === "completed") {
          const imported = result.materials.find(
            (m) =>
              m.title === "简历导入 · 待确认档案" &&
              m.createdAt >= task.createdAt,
          );
          if (imported) {
            try {
              setReviewProfile(JSON.parse(imported.content));
            } catch {}
          }
        }
      }
    }
    previousTasks.current = result.tasks;
    setData(result);
    setError("");
  }, [notify]);
  const checkEngines = useCallback(
    async (id?: EngineId, probe = true) => {
      const ids = id ? [id] : (["codex", "claude", "codebuddy"] as const);
      await Promise.all(ids.map(async (engine) => {
        if (engineChecks.current.has(engine)) return;
        engineChecks.current.add(engine);
        setChecking(engineChecks.current.size > 1 ? "all" : engine);
        let result: EngineStatus;
        try {
          [result] = await api<EngineStatus[]>("engines/check", {
            method: "POST", body: JSON.stringify({ id: engine, probe }),
          });
        } catch (error) {
          result = { id: engine, state: "error", version: "", checkedAt: new Date().toISOString(), message: (error as Error).message };
        }
        setStatuses((old) => [...old.filter((status) => status.id !== engine), result]);
        engineChecks.current.delete(engine);
        setChecking(engineChecks.current.size > 1 ? "all" : engineChecks.current.values().next().value || null);
        if (id && probe) notify(result.message, result.state !== "connected");
      }));
    },
    [notify],
  );
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    if (!startupCheckStarted.current) {
      startupCheckStarted.current = true;
      void checkEngines();
    }
    const syncPage = () => {
      const next = new URLSearchParams(location.search).get("page");
      setPracticeJob(new URLSearchParams(location.search).get("job"));
      if (navigation.some((n) => n.id === next)) setPage(next as PageId);
      else if (["jobs", "materials", "interviews"].includes(next || "")) {
        setPage("applications");
        window.history.replaceState(null, "", "/?page=applications");
      } else setPage("discover");
    };
    syncPage();
    const onPopState = () => {
      if (profileEditor.current?.dirty || settingsEditor.current?.dirty) {
        const target = location.href;
        window.history.replaceState(null, "", settingsEditor.current ? "/?page=settings" : "/?page=profile");
        setPendingLeave(() => () => {
          window.history.replaceState(null, "", target);
          syncPage();
        });
      } else syncPage();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (profileEditor.current?.dirty || settingsEditor.current?.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(toastTimer.current);
    };
  }, [refresh, checkEngines]);
  const hasRunning = data?.tasks.some((t) => t.status === "running") || data?.discovery?.some((run) => run.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => {
      void refresh().catch(() => setError("本地服务连接中断，正在重试…"));
    }, 2000);
    return () => clearInterval(timer);
  }, [hasRunning, refresh]);
  function navigate(next: PageId) {
    if (next === page) return;
    if (profileEditor.current?.dirty || settingsEditor.current?.dirty) {
      setPendingLeave(() => () => changePage(next));
      return;
    }
    changePage(next);
  }
  function changePage(next: PageId) {
    setPage(next);
    setMobileNav(false);
    window.history.pushState(
      null,
      "",
      next === "discover" ? "/" : `/?page=${next}`,
    );
  }
  async function runTask(action: Task["action"], jobId: string | null = null, practice?: { materialId?: string; attemptId?: string; answer?: string; turn?: number; templateId?: string }) {
    try {
      await api("tasks", {
        method: "POST",
        body: JSON.stringify({ action, jobId, ...practice }),
      });
      await refresh();
      if (!practice?.materialId) notify("AI 任务已开始，可继续处理其他职位");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await api<{ text: string; filename: string }>(
        "resume/import",
        { method: "POST", body: form },
      );
      setImportText(result.text);
      setImportName(result.filename);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  if (!data)
    return (
      <div className="app-loading">
        <div className="brand-mark">
          <DoorOpen size={28} />
        </div>
        <h1>Offer来敲门</h1>
        {error ? (
          <>
            <p>{error}</p>
            <button
              className="button primary"
              onClick={() => void refresh().catch((e) => setError(e.message))}
            >
              重新连接
            </button>
          </>
        ) : (
          <>
            <Loader2 className="spin" />
            <p>正在打开你的工作空间</p>
          </>
        )}
      </div>
    );
  const activeStatus = statuses.find((s) => s.id === data.settings.engine);
  const activeChecking = checking === "all" || checking === data.settings.engine;
  const engineOk =
    activeStatus && ["ready", "connected"].includes(activeStatus.state);
  const currentNav = navigation.find((n) => n.id === page)!;
  const actions: Actions = {
    data,
    refresh,
    notify,
    runTask,
    openJob: (id, tab) => { setJobTab(tab || "职位详情"); setSelectedJob(id); },
    navigate,
    openPractice: (id) => { setSelectedJob(null); setPracticeJob(id); navigate("practice"); window.history.replaceState(null, "", `/?page=practice&job=${encodeURIComponent(id)}`); },
    openMaterial: setMaterial,
  };
  const activeJob = data.jobs.find((j) => j.id === selectedJob);
  const running = data.tasks.filter((t) => t.status === "running" && !t.feedback);
  const notices = (
    <>
      {error && (
        <div className="banner error">
          <CircleHelp size={18} />
          {error}
        </div>
      )}
      {!engineOk && !activeChecking && page !== "settings" && (
        <div className="banner engine-warning">
          <span>
            <Sparkles size={17} />
            {activeStatus?.state === "missing"
              ? "尚未找到 AI 引擎"
              : "AI 引擎需要连接"}
          </span>
          <button className="text-button" onClick={() => navigate("settings")}>
            前往设置
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  );
  return (
    <Tooltip.Provider>
      <div className="app-shell">
        {mobileNav && (
          <button
            className="nav-scrim"
            aria-label="收起菜单"
            onClick={() => setMobileNav(false)}
          />
        )}
        <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
          <button
            className="brand"
            onClick={() => navigate("discover")}
            aria-label="Offer来敲门，发现职位"
          >
            <span className="brand-mark">
              <DoorOpen size={26} strokeWidth={1.8} />
              <span className="brand-spark" />
            </span>
            <span>
              <strong>Offer来敲门</strong>
            </span>
          </button>
          <span className="nav-label">我的求职空间</span>
          <Scroll className="sidebar-navigation"><nav aria-label="主导航">
            {navigation.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""} ${item.id === "profile" ? "nav-separate" : ""}`}
                onClick={() => navigate(item.id)}
                aria-current={page === item.id ? "page" : undefined}
              >
                <item.icon size={21} strokeWidth={1.8} />
                <span>{item.name}</span>
                {item.id === "applications" && data.jobs.length > 0 && (
                  <span className="nav-count">{data.jobs.length}</span>
                )}
              </button>
            ))}
          </nav></Scroll>
          <div className="sidebar-bottom">
            <button
              className="engine-mini"
              onClick={() => navigate("settings")}
            >
              <img className="engine-brand-logo" src={`/engines/${data.settings.engine}.svg`} alt="" width={28} height={28} />
              <div className="engine-mini-copy">
              <strong>{ENGINE_NAMES[data.settings.engine]}</strong>
              <span>
                <i className={`status-dot ${engineOk ? "green" : "amber"}`} />
                {activeChecking
                  ? "检测中…"
                  : activeStatus?.state === "connected"
                    ? "已连接"
                    : engineOk
                      ? "待连接测试"
                      : "未连接"}
              </span>
              </div>
              <ChevronRight size={15} />
            </button>
            <button className="workspace-status" onClick={() => setHelp(true)}>
              <LockKeyhole size={15} />
              <span>本地工作空间</span>
              <CircleHelp size={15} />
            </button>
          </div>
        </aside>
        <div className="workspace-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="展开菜单"
                onClick={() => setMobileNav(true)}
              >
                <Menu size={22} />
              </button>
              <span>我的工作空间</span>
              <ChevronRight size={15} />
              <strong>{currentNav.name}</strong>
            </div>
            <div className="topbar-actions">
              <a
                className="button secondary small github-star"
                href="https://github.com/aunicall/ai-job-search-zh"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Star：在 GitHub 为项目点星"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .297a12 12 0 0 0-3.793 23.385c.6.111.82-.261.82-.577v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.419-1.305.762-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 0 1 3.004-.404c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.654 1.652.243 2.873.119 3.176.769.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.216.694.825.576A12.001 12.001 0 0 0 12 .297Z" />
                </svg>
                Star
              </a>
              <span className="local-badge">
                <ShieldCheck size={16} />
                数据保存在本机
              </span>
              <Tip label="查看待跟进的投递">
                <button
                  className="icon-button notification"
                  aria-label="查看待跟进的投递"
                  onClick={() => navigate("applications")}
                >
                  <Bell size={20} />
                  {data.jobs.some(needsFollowUp) && <i />}
                </button>
              </Tip>
              <button
                className="avatar"
                aria-label="打开个人档案"
                onClick={() => navigate("profile")}
              >
                <UserRound size={20} />
              </button>

            </div>
          </header>
          {page === "profile" ? (
            <main className="profile-page">
              <ProfilePage
                {...actions}
                editorRef={profileEditor}
                onImport={() => fileInput.current?.click()}
                importing={importing}
                notices={notices}
              />
            </main>
          ) : (
            <Scroll key={page} className="main-scroll">
              <main>
                {notices}
                {page === "discover" && (
                  <DiscoveryPage {...actions} addJob={() => setAdding(true)} />
                )}
                {page === "applications" && (
                  <TrackerPage {...actions} addApplication={() => setAdding(true)} />
                )}
                {page === "practice" && <PracticePage {...actions} jobId={practiceJob} selectJob={actions.openPractice} />}
                {page === "interviews" && <InterviewsPage {...actions} />}
                {page === "templates" && <TemplatesPage />}
                {page === "journal" && <JournalPage {...actions} />}
                {page === "ai-settings" && <AiPreferencesPage {...actions} />}
                {page === "settings" && (
                  <SettingsPage
                    {...actions}
                    editorRef={settingsEditor}
                    statuses={statuses}
                    checking={checking}
                    checkEngines={checkEngines}
                  />
                )}
              </main>
            </Scroll>
          )}
        </div>
        {running.length > 0 && (
          <div className="task-float" role="status">
            <Loader2 size={19} className="spin" />
            <div>
              <strong>{running[0].step}</strong>
              <span>
                {running.length > 1
                  ? `共 ${running.length} 个任务进行中`
                  : "你可以继续浏览，完成后会通知你"}
              </span>
            </div>
            <Tip label="取消当前任务">
              <button
                className="icon-button"
                aria-label="取消当前任务"
                onClick={async () => {
                  try {
                    await api(`tasks/${running[0].id}`, { method: "DELETE" });
                    await refresh();
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                }}
              >
                <X size={18} />
              </button>
            </Tip>
          </div>
        )}
        {toast && (
          <div
            className={`toast ${toast.error ? "toast-error" : ""}`}
            role={toast.error ? "alert" : "status"}
          >
            {toast.error ? (
              <CircleHelp size={20} />
            ) : (
              <CheckCircle2 size={20} />
            )}
            <span>{toast.text}</span>
            <button
              className="icon-button"
              aria-label="关闭通知"
              onClick={() => setToast(null)}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <JobForm
          open={adding || Boolean(editing)}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          initial={editing}
          recordApplication={Boolean(editing)}
          {...actions}
        />
        {activeJob && (
          <JobDetail
            {...actions}
            job={activeJob}
            hidden={Boolean(material)}
            initialTab={jobTab}
            onClose={() => setSelectedJob(null)}
            onEdit={() => {
              setEditing(activeJob);
              setSelectedJob(null);
            }}
          />
        )}
        <MaterialModal
          material={
            material
              ? data.materials.find((m) => m.id === material.id) || material
              : null
          }
          onClose={() => setMaterial(null)}
          {...actions}
          onReviewProfile={setReviewProfile}
        />
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="sr-only"
          aria-label="上传简历文件"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        <Modal
          open={Boolean(importText)}
          onOpenChange={(open) => {
            if (!open) setImportText("");
          }}
          title="确认简历内容"
          description={importName}
        >
          <div className="dialog-body">
            <textarea
              aria-label="提取的简历正文"
              className="resume-import-text"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="inline-note">
              <ShieldCheck size={17} />
              文件先在本机解析，姓名和联系方式由本地提取；脱敏后的经历正文会发送给 AI。请先检查文本，移除未识别的姓名、证件号、详细住址等隐私；姓名未识别时请在档案中手动补全。
            </div>
            <div className="dialog-actions">
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await api("profile", {
                      method: "PUT",
                      body: JSON.stringify({
                        ...data.profile,
                        background: importText,
                      }),
                    });
                    setImportText("");
                    await refresh();
                    navigate("profile");
                    notify("正文已保存，可继续完善档案");
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                }}
              >
                仅保存正文
              </button>
              <button
                className="button primary"
                onClick={async () => {
                  try {
                    await api("profile/extract", {
                      method: "POST",
                      body: JSON.stringify({ text: importText }),
                    });
                    setImportText("");
                    await refresh();
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                }}
              >
                <Sparkles size={17} />
                AI 提取档案
              </button>
            </div>
          </div>
        </Modal>
        <Modal
          open={Boolean(reviewProfile)}
          onOpenChange={(open) => {
            if (!open) setReviewProfile(null);
          }}
          title="确认导入档案"
          description="核对提取结果后保存。已有内容会保留，勾选的字段将被替换。"
        >
          <ProfileReview
            profile={reviewProfile}
            current={data.profile}
            onSave={async (profile) => {
              await api("profile", {
                method: "PUT",
                body: JSON.stringify(profile),
              });
              setReviewProfile(null);
              await refresh();
              navigate("profile");
              notify("档案已导入");
            }}
            notify={notify}
          />
        </Modal>
        <Modal open={!!pendingLeave} onOpenChange={(open) => { if (!open && !savingBeforeLeave) setPendingLeave(null); }} title={page === "settings" ? "引擎与设置尚未保存" : "个人档案尚未保存"}>
          <div className="dialog-body">
            <p>修改还没有保存，是否保存后再离开？</p>
            <div className="dialog-actions">
              <button className="button secondary" disabled={savingBeforeLeave} onClick={() => setPendingLeave(null)}>继续编辑</button>
              <button className="button secondary" disabled={savingBeforeLeave} onClick={() => { pendingLeave?.(); setPendingLeave(null); }}>忽略并离开</button>
              <button className="button primary" disabled={savingBeforeLeave} onClick={async () => {
                setSavingBeforeLeave(true);
                try {
                  if (await (profileEditor.current || settingsEditor.current)?.save()) { pendingLeave?.(); setPendingLeave(null); }
                } finally { setSavingBeforeLeave(false); }
              }}>{savingBeforeLeave ? "正在保存…" : "保存并离开"}</button>
            </div>
          </div>
        </Modal>
        <Modal open={help} onOpenChange={setHelp} title="你的本地工作空间">
          <div className="dialog-body help-body">
            <ShieldCheck size={38} />
            <p>
              档案、职位和生成材料保存在运行服务的这台电脑中，无需网站账号。
            </p>
            <p>
              使用 AI 功能时，相关档案和职位内容会交给你配置的 Codex 或 Claude
              Code。请按引擎服务的数据政策使用。
            </p>
            <p>
              本版本仅开放本机访问。定期在设置中导出备份，迁移时可复制完整数据目录。
            </p>
            <button
              className="button primary"
              onClick={() => {
                setHelp(false);
                navigate("settings");
              }}
            >
              管理工作空间
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      </div>
    </Tooltip.Provider>
  );
}

function MaterialModal({
  material,
  onClose,
  onReviewProfile,
  notify,
  refresh,
}: Actions & {
  material: Material | null;
  onClose: () => void;
  onReviewProfile: (profile: Profile) => void;
}) {
  const [tab, setTab] = useState("内容");
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setEdit(false);
    setTab("内容");
    setDraft(material?.content || "");
  }, [material?.id]);
  const importProfile = material?.title === "简历导入 · 待确认档案";
  return (
    <Modal
      open={Boolean(material)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={material?.title || "材料"}
      wide
    >
      <div className="dialog-body material-detail">
        {material && (
          <>
            <div className="material-actions">
              <div className="tabs">
                <button
                  className={tab === "内容" ? "active" : ""}
                  onClick={() => setTab("内容")}
                >
                  材料内容
                </button>
                {material.review && (
                  <button
                    className={tab === "审阅" ? "active" : ""}
                    onClick={() => setTab("审阅")}
                  >
                    审阅记录
                  </button>
                )}
              </div>
              <div className="button-group">
                {importProfile ? (
                  <button
                    className="button primary small"
                    onClick={() => {
                      try {
                        onReviewProfile(JSON.parse(material.content));
                        onClose();
                      } catch {
                        notify("档案数据无效", true);
                      }
                    }}
                  >
                    确认导入
                  </button>
                ) : (
                  <>
                    {!material.practice && <button
                      className="button secondary small"
                      disabled={saving}
                      onClick={async () => {
                        if (!edit) {
                          setDraft(material.content);
                          setEdit(true);
                          return;
                        }
                        setSaving(true);
                        try {
                          await api(`materials/${material.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ content: draft }),
                          });
                          await refresh();
                          setEdit(false);
                          notify("修改已保存");
                        } catch (e) {
                          notify((e as Error).message, true);
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      {edit ? "保存修改" : "编辑"}
                    </button>}
                    <a
                      className="button secondary small"
                      href={`/api/export/materials/${material.id}?format=docx`}
                    >
                      <ArrowDownToLine size={16} />
                      Word
                    </a>
                    <a className="button secondary small" href={`/api/export/materials/${material.id}?format=pdf`}><ArrowDownToLine size={16} />PDF</a>
                    <a
                      className="icon-button"
                      aria-label="下载 Markdown"
                      href={`/api/export/materials/${material.id}`}
                    >
                      <ArrowDownToLine size={18} />
                    </a>
                  </>
                )}
              </div>
            </div>
            {edit && tab === "内容" ? (
              <textarea
                aria-label="编辑材料内容"
                className="material-editor"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              <div className="document-paper">
                {material.kind === "resume" && !importProfile && tab === "内容" ? <ResumePreview content={material.content} templateId={material.templateId} avatarId={material.avatarId} /> : <Markdown
                  text={tab === "审阅" ? material.review : material.practice ? practiceQuestionContent(material.title, material.practice) : material.content}
                />}
              </div>
            )}
            <div className="inline-note">
              <ShieldCheck size={16} />
              {ENGINE_NAMES[material.engine]} 生成 · 请核实后再提交给招聘方
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
function ProfileReview({
  profile,
  current,
  onSave,
  notify,
}: {
  profile: Profile | null;
  current: Profile;
  onSave: (profile: Profile) => Promise<void>;
  notify: Actions["notify"];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSelected(
      profile
        ? Object.keys(profile).filter((k) =>
            Boolean(profile[k as keyof Profile]),
          )
        : [],
    );
  }, [profile]);
  if (!profile) return null;
  const labels: Record<keyof Profile, string> = {
    name: "姓名",
    email: "邮箱",
    phone: "电话",
    city: "城市",
    targetRole: "目标职位",
    expectedSalary: "期望薪资",
    education: "教育经历",
    experience: "工作年限",
    skills: "技能",
    background: "经历正文",
    preferences: "求职偏好",
    exclusions: "明确排除",
  };
  return (
    <div className="dialog-body">
      <div className="review-fields">
        {Object.entries(profile)
          .filter(([, value]) => value)
          .map(([key, value]) => (
            <label className="review-field" key={key}>
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, key]
                      : old.filter((k) => k !== key),
                  )
                }
              />
              <span>
                <strong>{labels[key as keyof Profile]}</strong>
                <span>{value}</span>
                {current[key as keyof Profile] && <small>将替换现有内容</small>}
              </span>
            </label>
          ))}
      </div>
      <div className="dialog-actions">
        <button
          className="button primary"
          disabled={saving || !selected.length}
          onClick={async () => {
            setSaving(true);
            try {
              const merged = { ...current };
              for (const key of selected)
                merged[key as keyof Profile] = profile[key as keyof Profile];
              await onSave(merged);
            } catch (e) {
              notify((e as Error).message, true);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? (
            <Loader2 size={17} className="spin" />
          ) : (
            <Check size={17} />
          )}
          确认并保存
        </button>
      </div>
    </div>
  );
}
