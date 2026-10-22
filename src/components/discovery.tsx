"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  CircleAlert,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Monitor,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
} from "lucide-react";
import { api, formatDate } from "@/lib/client";
import {
  DISCOVERY_SOURCES,
  type DiscoveryRun,
  type DiscoveryState,
  type DiscoveredJob,
  type SourceId,
} from "@/lib/discovery-types";
import type { Job } from "@/lib/types";
import { Dropdown, Field, Modal, Scroll, Tip } from "./ui";
import type { Actions } from "./workspace-app";

export function DiscoveryPage(actions: Actions & { addJob: () => void }) {
  const { data, notify, navigate } = actions;
  const profile = data.profile;
  const [sources, setSources] = useState<SourceId[]>(["liepin"]);
  const [keywords, setKeywords] = useState(profile.targetRole);
  const [city, setCity] = useState(profile.city);
  const [mode, setMode] = useState<"profile" | "custom">("profile");
  const [custom, setCustom] = useState({ expectedSalary: "", experience: "", education: "", skills: "", preferences: "", exclusions: "" });
  const [state, setState] = useState<DiscoveryState | null>(null);
  const [starting, setStarting] = useState(false);
  const [connecting, setConnecting] = useState<SourceId | null>(null);
  const [collecting, setCollecting] = useState<string | null>(null);
  const [detail, setDetail] = useState<DiscoveredJob | null>(null);
  const [help, setHelp] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [filter, setFilter] = useState("全部来源");
  const [onlyMatch, setOnlyMatch] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const next = await api<DiscoveryState>("discovery");
    setState(next);
    return next;
  }, []);
  useEffect(() => {
    void refresh()
      .then((next) => {
        if (next.latest) {
          setSources(next.latest.query.sources);
          setKeywords(next.latest.query.keywords);
          setCity(next.latest.query.city);
          setMode(next.latest.query.mode || "profile");
          const q = next.latest.query;
          setCustom({ expectedSalary: q.expectedSalary || "", experience: q.experience || "", education: q.education || "", skills: q.skills || "", preferences: q.preferences || "", exclusions: q.exclusions || "" });
        }
      })
      .catch((e) => setError(e.message));
  }, [refresh]);
  const run = state?.latest;
  const running = run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [running, refresh]);
  async function start() {
    setStarting(true);
    setError("");
    try {
      const next = await api<DiscoveryRun>("discovery", {
        method: "POST",
        body: JSON.stringify(mode === "custom" ? { sources, mode, keywords, city, ...custom } : { sources, mode, keywords: profile.targetRole, city: profile.city }),
      });
      setState((old) => ({
        browserReady: old?.browserReady || false,
        offerReady: old?.offerReady || false,
        latest: next,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  async function connect(source: SourceId) {
    if (source === "offer") {
      setHelp(true);
      return;
    }
    setConnecting(source);
    try {
      await api("discovery/browser", {
        method: "POST",
        body: JSON.stringify({ source }),
      });
      await refresh();
      notify("招聘浏览器已打开，请在平台完成登录并设置求职期望。");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setConnecting(null);
    }
  }
  async function collect(item: DiscoveredJob) {
    if (!run) return;
    setCollecting(item.id);
    try {
      const job = await api<Job>("discovery/collect", {
        method: "POST",
        body: JSON.stringify({ runId: run.id, itemId: item.id }),
      });
      await actions.refresh();
      await refresh();
      notify("已加入候选，可在职位管理中查看");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setCollecting(null);
    }
  }
  const items = (run?.items || []).filter(
    (item) =>
      (filter === "全部来源" || item.source === filter) &&
      (!onlyMatch || (item.score ?? 0) >= 75),
  ).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return (
    <>
      <div className="page-heading">
        <h1>发现职位</h1>
        <div className="button-group">
          <button className="text-button" onClick={actions.addJob}>
            <Plus size={17} />
            手动补充
          </button>
          <button
            className="button secondary"
            onClick={() => navigate("profile")}
          >
            <FileText size={17} />
            个人档案
          </button>
        </div>
      </div>
      <section className="panel discovery-config">
        <div className="section-heading">
          <h2>
            <Sparkles size={20} />
            找工作
          </h2>
          <Tip label="可依据个人档案或自定义条件查找职位。自定义模式只使用本次填写的条件，不修改个人档案。招聘平台需在本地浏览器登录；遇验证时由你处理。" />
        </div>
        <div className="discovery-mode-row">
          <div className="discovery-mode" role="group" aria-label="找工作方式">
            {([['profile', '根据个人档案', FileText], ['custom', '自定义条件', SlidersHorizontal]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={mode === value} disabled={running || starting} onClick={() => setMode(value)}><Icon size={16} />{label}</button>
            ))}
          </div>
          <span className="discovery-mode-note">{mode === "profile" ? "结合你的技能与经历，发现合适的职位" : "只用于本次搜索，不修改个人档案"}</span>
        </div>
        {mode === "profile" ? (
          <div className="discovery-profile-summary">
            <div className="discovery-profile-main">
              <div className="discovery-profile-target">
                <span className="discovery-summary-label">求职方向</span>
                <strong>{profile.targetRole || "尚未设置目标职位"}</strong>
                <span className="discovery-profile-city"><MapPin size={15} />{profile.city || "不限城市"}</span>
              </div>
              <div className="discovery-facts">
                {[profile.expectedSalary && `期望薪资 · ${profile.expectedSalary}`, profile.experience && `工作经验 · ${profile.experience}`, profile.skills]
                  .filter(Boolean).map((text, index) => <span key={index}>{text}</span>)}
                {!profile.skills && !profile.background && <span>补充技能与经历，让推荐更准确</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="discovery-fields">
            <Field label={<>目标方向 <span style={{ color: "#dc4545" }} aria-hidden="true">*</span></>}>
              <input value={keywords} required maxLength={100} onChange={(e) => setKeywords(e.target.value)} placeholder="例如：前端工程师" disabled={running || starting} />
            </Field>
            <Field label="期望城市">
              <input value={city} maxLength={50} onChange={(e) => setCity(e.target.value)} placeholder="不限城市" disabled={running || starting} />
            </Field>
          </div>
        )}
        {mode === "custom" && <div className="discovery-custom-fields">
          {([
            ['expectedSalary', '期望薪资', '例如：25–35K', 100],
            ['experience', '工作经验', '例如：3–5年、应届', 100],
            ['education', '学历', '例如：本科', 100],
            ['skills', '技能关键词', '例如：React、Python、智能体', 1000],
            ['preferences', '其他偏好', '例如：全职、远程、行业方向', 2000],
            ['exclusions', '排除条件', '例如：不接受外包、兼职', 1000],
          ] as const).map(([key, label, placeholder, maxLength]) => <Field key={key} label={label}><input value={custom[key]} maxLength={maxLength} placeholder={placeholder} disabled={running || starting} onChange={(e) => setCustom((old) => ({ ...old, [key]: e.target.value }))} /></Field>)}
        </div>}
        <div className="discovery-source-label">
          <strong>职位来源</strong>
          <span>可多选</span>
        </div>
        <div className="discovery-sources">
          {DISCOVERY_SOURCES.map((source) => {
            const selected = sources.includes(source.id);
            const browser = !["liepin", "offer"].includes(source.id);
            return (
              <div
                className={`discovery-source ${selected ? "selected" : ""}`}
                key={source.id}
              >
                <button
                  role="checkbox"
                  aria-checked={selected}
                  disabled={running}
                  onClick={() =>
                    setSources((old) =>
                      selected
                        ? old.filter((s) => s !== source.id)
                        : [...old, source.id],
                    )
                  }
                >
                  <span className="source-check">
                    {selected && <Check size={14} />}
                  </span>
                  <strong>{source.name}</strong>
                </button>
                <span>{source.mode}</span>
                {source.id === "liepin" ? (
                  <span className="source-available">直接搜索</span>
                ) : (
                  <button
                    className="text-button"
                    disabled={Boolean(connecting) || running}
                    onClick={() => void connect(source.id)}
                  >
                    {connecting === source.id ? (
                      <Loader2 size={14} className="spin" />
                    ) : browser ? (
                      <Monitor size={14} />
                    ) : (
                      <SlidersHorizontal size={14} />
                    )}
                    {source.id === "offer"
                      ? state?.offerReady
                        ? "已配置"
                        : "配置数据源"
                      : "打开 / 登录"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="discovery-start">
          <span className="muted">
            已选 {sources.length} 个来源
            {run?.keywords.length
              ? ` · 本轮关键词：${run.keywords.join("、")}`
              : ""}
          </span>
          {running ? (
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await api(`discovery/${run.id}`, { method: "DELETE" });
                  await refresh();
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            >
              <Square size={16} />
              停止发现
            </button>
          ) : (
            <button
              className="button primary"
              disabled={starting || !sources.length || !keywords.trim()}
              onClick={() => void start()}
            >
              {starting ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <Search size={18} />
              )}
              开始发现
            </button>
          )}
        </div>
      </section>
      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={17} />
          {error}
        </div>
      )}
      {run && (
        <section className="panel discovery-progress" aria-live="polite">
          <div className="flex-between">
            <strong>
              {running && <Loader2 size={17} className="spin" />}
              {run.step}
            </strong>
            <span className="muted">{formatDate(run.createdAt)}</span>
          </div>
          <div className="source-progress-list">
            {run.sources.map((source) => (
              <div
                className={`source-progress ${source.state}`}
                key={source.id}
              >
                <span>
                  {source.state === "running" ? (
                    <Loader2 size={15} className="spin" />
                  ) : source.state === "completed" ? (
                    <Check size={15} />
                  ) : source.state === "error" ? (
                    <CircleAlert size={15} />
                  ) : (
                    <span className="status-dot" />
                  )}
                  {DISCOVERY_SOURCES.find((s) => s.id === source.id)!.name}
                </span>
                <span>
                  {source.message ||
                    (source.state === "running"
                      ? "正在搜索与读取职位"
                      : "等待搜索")}
                </span>
                {source.state === "error" && (
                  <button
                    className="text-button"
                    onClick={() => void connect(source.id)}
                    disabled={Boolean(connecting)}
                  >
                    {source.id === "offer" ? "查看配置" : "打开平台"}
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="discovery-log-action">
            <button className="text-button" onClick={() => setLogsOpen(true)}>
              <FileText size={16} />运行日志
            </button>
          </div>
        </section>
      )}
      <div className="toolbar discovery-results-heading">
        <div className="tabs">
          <button
            className={!onlyMatch ? "active" : ""}
            onClick={() => setOnlyMatch(false)}
          >
            全部机会 {run?.items.length || 0}
          </button>
          <button
            className={onlyMatch ? "active" : ""}
            onClick={() => setOnlyMatch(true)}
          >
            优先看看{" "}
            {(run?.items || []).filter((i) => (i.score ?? 0) >= 75).length}
          </button>
        </div>
        <Dropdown
          label="发现结果来源"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "全部来源", label: "全部来源" },
            ...DISCOVERY_SOURCES.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </div>
      {items.length ? (
        <div className="discovery-results">
          {items.map((item) => {
            const source = DISCOVERY_SOURCES.find((s) => s.id === item.source)!;
            const collected =
              data.jobs.find(
                (j) =>
                  j.id === item.collectedId ||
                  j.sourceId === `${item.source}:${item.id}` ||
                  (item.url && j.url === item.url),
              )?.id;
            return (
              <article className="panel discovered-job" key={item.id}>
                <div className="discovered-job-main">
                  <span className="company-symbol">
                    <Building2 size={24} />
                  </span>
                  <div>
                    <button
                      className="discovered-title"
                      onClick={() => setDetail(item)}
                    >
                      {item.title}
                    </button>
                    <p>{item.company}</p>
                    <div className="job-meta">
                      <span>
                        <MapPin size={14} />
                        {item.city || "地点待核实"}
                      </span>
                      <span>{source.name}</span>
                    </div>
                  </div>
                  <strong className="salary">
                    {item.salary || "薪资待核实"}
                  </strong>
                </div>
                <div className="discovered-match">
                  <span
                    className={`badge ${item.score != null && item.score >= 75 ? "success" : "neutral"}`}
                  >
                    {item.score == null
                      ? item.description.length >= 50
                        ? "待初筛"
                        : "详情待核实"
                      : `匹配度 ${item.score} 分 · ${item.score >= 75 ? "高度匹配" : item.score >= 60 ? "良好匹配" : item.score >= 45 ? "一般匹配" : "较低匹配"}`}
                  </span>
                  <p>
                    {item.reasons.slice(0, 3).join("；") ||
                      (item.description.length >= 50
                        ? "职位描述已读取，可进一步评估。"
                        : "尚未读取完整职位描述。")}
                  </p>
                  {item.concerns.length > 0 && (
                    <span className="muted">
                      欠缺与待核实：{item.concerns.slice(0, 3).join("；")}
                    </span>
                  )}
                </div>
                <div className="discovered-job-actions">
                  <button
                    className="text-button"
                    onClick={() => setDetail(item)}
                  >
                    查看职位
                  </button>
                  {item.url && (
                    <a
                      className="text-button"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      原职位
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <button
                    className={`button ${collected ? "secondary" : "primary"} small`}
                    disabled={
                      Boolean(collecting) ||
                      running ||
                      (!collected && item.description.length < 50)
                    }
                    onClick={() =>
                      collected
                        ? actions.openJob(collected)
                        : void collect(item)
                    }
                  >
                    {collecting === item.id ? (
                      <Loader2 size={16} className="spin" />
                    ) : collected ? (
                      <Check size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    {collected ? "查看候选" : "加入候选"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel empty-state large">
          <span className="empty-art">
            {running ? (
              <Loader2 size={33} className="spin" />
            ) : (
              <Search size={33} />
            )}
          </span>
          <h3>
            {running
              ? "正在发现适合你的职位"
              : run
                ? "当前没有符合条件的机会"
                : "选择来源，开始发现"}
          </h3>
          {!running && run && <p>可调整方向或城市，或处理来源提示后重试。</p>}
        </div>
      )}
      <Modal
        open={Boolean(detail)}
        onOpenChange={(value) => {
          if (!value) setDetail(null);
        }}
        title={detail?.title || "职位详情"}
      >
        {detail && (
          <div className="dialog-body">
            <div className="flex-between">
              <strong>{detail.company}</strong>
              <span className="salary">{detail.salary || "薪资待核实"}</span>
            </div>
            <p className="muted">
              {DISCOVERY_SOURCES.find((s) => s.id === detail.source)?.name} ·{" "}
              {detail.city || "地点待核实"} · 采集于{" "}
              {formatDate(detail.capturedAt)}
            </p>
            <div className="discovery-jd">
              {detail.dimensions && <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
                <strong>匹配度 {detail.score} 分</strong>
                <p>技能 {detail.dimensions.skills} × 30% · 经历 {detail.dimensions.experience} × 25% · 行为适配 {detail.dimensions.behavior} × 15% · 职业方向 {detail.dimensions.direction} × 30%</p>
              </div>}
              {detail.reasons.length > 0 && <><strong>匹配优势</strong><ul>{detail.reasons.map((note, i) => <li key={i}>{note}</li>)}</ul></>}
              {detail.concerns.length > 0 && <><strong>欠缺与待核实</strong><ul>{detail.concerns.map((note, i) => <li key={i}>{note}</li>)}</ul></>}
              {detail.description ||
                "未能读取完整详情，请打开原职位核实后重试发现。"}
            </div>
          </div>
        )}
      </Modal>
      <Modal open={logsOpen} onOpenChange={setLogsOpen} title="运行日志">
        <div className="dialog-body discovery-logs">
          <Scroll className="discovery-log-scroll">
          <div className="discovery-log-content">
          <ol>
            {(run?.logs || []).map((entry, index) => (
              <li key={index}><time dateTime={entry.at}>{formatDate(entry.at, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</time><span>{entry.message}</span></li>
            ))}
            {run?.error && <li><span>{run.error}</span></li>}
          </ol>
          {!run?.logs?.length && !run?.error && <p className="muted">暂无日志</p>}
          </div>
          </Scroll>
        </div>
      </Modal>
      <Modal open={help} onOpenChange={setHelp} title="连接 Offer先生">
        <div className="dialog-body">
          <p>在项目的 .env.local 配置开放平台密钥并重启本地服务：</p>
          <pre className="command-block">OFFER_CAMPUS_API_KEY=你的密钥</pre>
          <p className="muted">
            密钥只由本地后端读取。该来源提供校招与实习公告。
          </p>
          <a
            className="button primary"
            href="https://developer.offerxiansheng.com/docs/ai"
            target="_blank"
            rel="noreferrer"
          >
            开放平台文档
            <ExternalLink size={16} />
          </a>
        </div>
      </Modal>
    </>
  );
}
