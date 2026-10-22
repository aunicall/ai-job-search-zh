"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  Loader2,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, formatDate, needsFollowUp } from "@/lib/client";
import { RESUME_TEMPLATES } from "@/lib/resume-templates";
import { STAGES, isCandidate, type Job } from "@/lib/types";
import { Calendar, Dropdown, Field, Modal, Scroll, Tip } from "./ui";
import type { Actions } from "./workspace-app";
import { ResumePreview } from "./career-pages";
import { SAMPLE_RESUME } from "@/lib/resume-templates";
import { InterviewPanel } from "./interview";

const platforms = [
  "BOSS直聘",
  "猎聘",
  "智联招聘",
  "前程无忧",
  "牛客",
  "拉勾",
  "企业官网",
  "内推",
  "手动录入",
];
const blank = {
  company: "",
  title: "",
  city: "",
  salary: "",
  platform: "BOSS直聘",
  url: "",
  description: "",
};
export function JobForm({
  open,
  onClose,
  initial,
  refresh,
  notify,
  openJob,
  recordApplication = false,
}: Actions & { open: boolean; onClose: () => void; initial: Job | null; recordApplication?: boolean }) {
  const [form, setForm] = useState(blank);
  const [stage, setStage] = useState<Job["stage"]>("已投递");
  const [appliedAt, setAppliedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setForm(
      initial
        ? {
            company: initial.company,
            title: initial.title,
            city: initial.city,
            salary: initial.salary,
            platform: initial.platform,
            url: initial.url,
            description: initial.description,
          }
        : blank,
    );
    setError("");
    setStage(initial?.stage || "已投递");
    const today = new Date();
    setAppliedAt(initial ? initial.appliedAt?.slice(0, 10) || "" : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
    setNotes(initial?.notes || "");
  }, [initial, open]);
  const input = (key: keyof typeof blank, placeholder: string) => (
    <input
      value={form[key]}
      placeholder={placeholder}
      onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))}
      maxLength={key === "url" ? 2000 : 500}
    />
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const saved = await api<Job>(initial ? `jobs/${initial.id}` : "jobs", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, ...(recordApplication ? { stage, appliedAt: ["待评估", "待投递"].includes(stage) && !initial?.appliedAt ? "" : appliedAt, notes } : {}) }),
      });
      await refresh();
      onClose();
      notify(initial ? "记录已更新" : recordApplication ? "投递已记录" : "职位已添加");
      if (!initial && recordApplication) openJob(saved.id, "面试准备");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value && !saving) onClose();
      }}
      title={initial ? "编辑职位" : recordApplication ? "记录投递" : "添加候选职位"}
    >
      <form className="dialog-body job-record-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="职位名称" hint="必填">
            {input("title", "如：高级前端工程师")}
          </Field>
          <Field label="公司名称" hint="必填">
            {input("company", "招聘公司的名称")}
          </Field>
          <Field label="工作城市">{input("city", "如：上海 · 徐汇区")}</Field>
          <Field label="薪资范围">{input("salary", "如：25–35K · 14薪")}</Field>
          <Field label="招聘渠道">
            <Dropdown
              value={form.platform}
              onChange={(value) =>
                setForm((old) => ({ ...old, platform: value }))
              }
              options={[...new Set([...platforms, form.platform])]}
              label="招聘渠道"
            />
          </Field>
          <Field label="原始链接">{input("url", "https://…（选填）")}</Field>
          {recordApplication && <>
            <Field label="当前进展"><Dropdown label="当前进展" value={stage} options={[...STAGES]} onChange={(value) => setStage(value as Job["stage"])} /></Field>
            <Field label="投递日期"><Calendar label="投递日期" value={appliedAt} onChange={setAppliedAt} /></Field>
          </>}
        </div>
        <Field label="职位描述" hint="选填 · 可稍后补充">
          <textarea
            rows={3}
            maxLength={40000}
            value={form.description}
            onChange={(e) =>
              setForm((old) => ({ ...old, description: e.target.value }))
            }
            placeholder="粘贴岗位职责、任职要求、福利待遇等完整 职位描述。"
          />
        </Field>
        {recordApplication && <Field label="沟通备注" hint="选填"><textarea rows={2} maxLength={40000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="如：已通过内网投递，HR 约了周五面试。" /></Field>}
        {error && (
          <div className="inline-error" role="alert">
            <CircleAlert size={17} />
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Plus size={17} />
            )}
            {initial ? "保存修改" : recordApplication ? "保存投递记录" : "加入候选"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function StageBadge({ stage }: { stage: Job["stage"] }) {
  return (
    <span className={`badge stage-${STAGES.indexOf(stage)}`}>
      <i />
      {stage}
    </span>
  );
}

export function TrackerPage(actions: Actions & { addApplication: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const candidates = actions.data.jobs.filter(isCandidate);
  const jobs = candidates.filter((j) => `${j.company} ${j.title}`.toLowerCase().includes(query.toLowerCase()) && (filter === "全部" || (filter === "待投递" ? !j.appliedAt && j.stage !== "已结束" : j.stage === filter)));
  const [saving, setSaving] = useState<string | null>(null);
  async function applied(job: Job) {
    setSaving(job.id);
    try { await api(`jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ stage: "已投递" }) }); await actions.refresh(); actions.notify("已标记为已投递"); }
    catch (error) { actions.notify((error as Error).message, true); }
    finally { setSaving(null); }
  }
  return <div className="career-page"><div className="page-heading"><h1>职位管理</h1><div className="button-group"><a className="button secondary" href="/api/export/tracker"><ArrowDownToLine size={17} />导出记录</a><button className="button primary" onClick={actions.addApplication}><Plus size={17} />添加候选</button></div></div>
    <div className="tracker-summary"><div><span>候选职位</span><strong>{candidates.length}</strong></div><div><span>待投递</span><strong>{candidates.filter((j) => !j.appliedAt && j.stage !== "已结束").length}</strong></div><div><span>已投递</span><strong>{candidates.filter((j) => j.appliedAt).length}</strong></div><div><span>面试中</span><strong>{candidates.filter((j) => j.stage === "面试中").length}</strong></div></div>
    <div className="toolbar"><div className="tabs">{["全部", "待投递", "已投递", "面试中", "已获 Offer", "已结束"].map((label) => <button key={label} className={filter === label ? "active" : ""} onClick={() => setFilter(label)}>{label}</button>)}</div><div className="search-input"><Search size={17} /><input aria-label="搜索候选职位" placeholder="搜索公司或职位" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
    {!jobs.length ? <div className="panel empty-state"><BriefcaseBusiness size={32} /><h3>{candidates.length ? "没有符合条件的职位" : "还没有候选职位"}</h3><button className="button primary" onClick={() => actions.navigate("discover")}>发现职位</button></div> : <div className="candidate-grid">{jobs.map((job) => {
      const resume = actions.data.materials.find((m) => m.jobId === job.id && m.kind === "resume");
      const resumeTask = actions.data.tasks.find((t) => t.jobId === job.id && t.action === "apply");
      return <article className="panel candidate-card" key={job.id}><div className="flex-between"><span className="company-symbol small"><Building2 size={22} /></span><StageBadge stage={job.stage} /></div><button className="candidate-title" onClick={() => actions.openJob(job.id)}><div className="candidate-title-row"><h3>{job.title}</h3><strong>{job.salary || "薪资待沟通"}</strong></div><p>{job.company}</p></button><div className="candidate-meta"><span><MapPin size={15} aria-hidden="true" />{job.city || "城市待确认"}</span><span className="candidate-source" aria-label={`来源：${job.platform || "手动录入"}`}>{job.platform || "手动录入"}</span></div>{job.appliedAt && <div className="candidate-date">投递于 {formatDate(job.appliedAt)}</div>}
        {!resume && resumeTask?.status === "failed" && <p className="muted" role="status">简历生成失败：{resumeTask.error}</p>}
        <div className="candidate-actions">
          <button className="button secondary small" onClick={() => actions.openJob(job.id)}><BriefcaseBusiness size={16} />职位详情</button>
          <button className="button secondary small" onClick={() => actions.openJob(job.id, "匹配分析")}><ShieldCheck size={16} />匹配分析</button>
          <button className="button secondary small" onClick={() => actions.openJob(job.id, "投递材料")}><FileText size={16} />投递材料</button>
          <button className="button secondary small" onClick={() => actions.openJob(job.id, "面试准备")}><CalendarDays size={16} />面试准备</button>
          <button className="button secondary small" onClick={() => actions.openJob(job.id, "跟进记录")}><List size={16} />跟进记录</button>
        </div><div className="candidate-footer"><button className="text-button" onClick={() => actions.openJob(job.id)}>管理职位<ChevronRight size={16} /></button>{!job.appliedAt && job.stage !== "已结束" ? <button className="button primary small" disabled={saving === job.id} onClick={() => void applied(job)}><Check size={16} />标记已投递</button> : job.appliedAt ? <button className="text-button" onClick={() => actions.navigate("interviews")}>面试管理<ChevronRight size={16} /></button> : null}</div>
      </article>;
    })}</div>}
  </div>;
}

export function JobDetail(
  actions: Actions & { job: Job; onClose: () => void; onEdit: () => void; initialTab?: string; hidden?: boolean },
) {
  const { job, data, notify, refresh } = actions;
  const [tab, setTab] = useState(actions.initialTab || "职位详情");
  const [templateId, setTemplateId] = useState("auto");
  const [previewTemplate, setPreviewTemplate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(job.notes);
  const [followUp, setFollowUp] = useState(job.nextFollowUp);
  const busy = data.tasks.some(
    (t) => t.jobId === job.id && t.status === "running",
  );
  const blocked = job.evaluation?.gates.some((g) => g.status === "FAIL");
  const visibleMaterials = data.materials
    .filter((m) => m.jobId === job.id && (m.kind === "resume" || m.kind === "outreach"))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const generationRows = Array.from(visibleMaterials.reduce((groups, material) => {
    const task = data.tasks.filter((t) => t.jobId === job.id && t.action === "apply" && t.createdAt <= material.createdAt)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    const key = material.taskId || task?.id || material.createdAt.slice(0, 19);
    const row = groups.get(key) || { id: key, createdAt: material.createdAt, items: [] as typeof visibleMaterials };
    row.items.push(material);
    groups.set(key, row);
    return groups;
  }, new Map<string, { id: string; createdAt: string; items: typeof visibleMaterials }>()).values());
  async function patch(values: object) {
    setSaving(true);
    try {
      await api(`jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      await refresh();
      notify("已保存");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={!actions.hidden}
      onOpenChange={(value) => {
        if (!value) actions.onClose();
      }}
      title={job.title}
      description={job.company}
      wide
    >
      <div className="job-detail">
        <div className="job-detail-summary">
          <div className="job-detail-meta">
            <span className="salary">{job.salary || "薪资待沟通"}</span>
            <span>
              <MapPin size={16} />
              {job.city || "城市待确认"}
            </span>
            <span>{job.platform}</span>
            {job.url && (
              <a
                className="text-button"
                href={job.url}
                target="_blank"
                rel="noreferrer"
              >
                原始职位
                <ExternalLink size={15} />
              </a>
            )}
          </div>
          <div className="button-group">
            <Dropdown
              label="职位进展"
              disabled={busy || saving}
              value={job.stage}
              onChange={(stage) => void patch({ stage })}
              options={[...STAGES]}
            />
            <Tip label="编辑职位">
              <button
                className="icon-button"
                aria-label="编辑职位"
                disabled={busy}
                onClick={actions.onEdit}
              >
                <Pencil size={18} />
              </button>
            </Tip>
            <Tip label="删除职位">
              <button
                className="icon-button danger"
                aria-label="删除职位"
                disabled={busy}
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={18} />
              </button>
            </Tip>
          </div>
        </div>
        <div className="tabs detail-tabs">
          {["职位详情", "匹配分析", "投递材料", "面试准备", "跟进记录"].map((label) => (
            <button
              key={label}
              className={tab === label ? "active" : ""}
              onClick={() => setTab(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="job-detail-content">
          {tab === "职位详情" && (
            <div>
              <h3 className="content-heading">职位描述</h3>
              <div className="job-description">{job.description}</div>
            </div>
          )}
          {tab === "匹配分析" &&
            (job.evaluation ? (
              <div className="evaluation">
                <div
                  className={`evaluation-header ${blocked ? "blocked" : ""}`}
                >
                  <div className="evaluation-score">
                    {job.evaluation.score ?? "—"}
                    <span>
                      {job.evaluation.score != null ? "/ 100" : "硬门未通过"}
                    </span>
                  </div>
                  <div>
                    <h3>{job.evaluation.recommendation}</h3>
                    <p>{job.evaluation.summary.replace(/\bJD\b/gi, "职位描述")}</p>
                  </div>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => void actions.runTask("evaluate", job.id)}
                  >
                    重新评估
                  </button>
                </div>
                <h3 className="content-heading">
                  硬性条件检查
                  <Tip label="只有明确证据证明冲突才标记不满足；档案未填写的信息会标记待确认。" />
                </h3>
                <div className="gates-grid">
                  {job.evaluation.gates.map((gate) => (
                    <div className="gate" key={gate.name}>
                      <div>
                        <strong>{gate.name}</strong>
                        <span
                          className={`badge gate-${gate.status.toLowerCase()}`}
                        >
                          {
                            {
                              PASS: "满足",
                              FAIL: "不满足",
                              FLAG: "需留意",
                              UNKNOWN: "待确认",
                              NA: "未涉及",
                            }[gate.status]
                          }
                        </span>
                      </div>
                      <p>{gate.evidence.replace(/\bJD\b/gi, "职位描述")}</p>
                    </div>
                  ))}
                </div>
                {job.evaluation.dimensions.length > 0 && !blocked && (
                  <>
                    <h3 className="content-heading">四维匹配度</h3>
                    <div className="dimensions">
                      {job.evaluation.dimensions.map((dim) => (
                        <div className="dimension" key={dim.name}>
                          <div className="flex-between">
                            <strong>{dim.name}</strong>
                            <b>{dim.score}</b>
                          </div>
                          <div className="progress">
                            <span style={{ width: `${dim.score}%` }} />
                          </div>
                          <p>{dim.reason}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="evaluation-lists">
                  {[
                    {
                      title: "你的优势",
                      items: job.evaluation.strengths,
                      type: "positive",
                    },
                    {
                      title: "真实缺口",
                      items: job.evaluation.gaps,
                      type: "gaps",
                    },
                    {
                      title: "投前必问",
                      items: job.evaluation.questions,
                      type: "questions",
                    },
                  ].map((section) => (
                    <section key={section.title} className={section.type}>
                      <h3>{section.title}</h3>
                      {section.items.length ? (
                        section.items.map((item, i) => (
                          <p key={i}>
                            <span>·</span>
                            {item}
                          </p>
                        ))
                      ) : (
                        <p className="muted">暂无补充</p>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state compact">
                <span className="empty-art">
                  <Sparkles size={32} />
                </span>
                <h3>暂无匹配评估</h3>
                <p>学历、用工、地点与技能，结合你的档案逐项检查。</p>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void actions.runTask("evaluate", job.id)}
                >
                  <Sparkles size={17} />
                  开始评估
                </button>
              </div>
            ))}
          {tab === "面试准备" && <InterviewPanel {...actions} preparationOnly />}
          {tab === "投递材料" && (
            <>
              <div className="resume-generation-toolbar">
                <div className="resume-template-select"><Field label="简历模板"><Dropdown label="简历模板" value={templateId} onChange={setTemplateId} options={[{ value: "auto", label: "由 AI 自动选择" }, ...RESUME_TEMPLATES.map((t) => ({ value: t.id, label: t.name }))]} /></Field>{templateId !== "auto" && <button className="text-button" onClick={() => setPreviewTemplate(true)}>预览所选模板<FileText size={16} /></button>}</div>
                <button
                  className="button primary"
                  disabled={busy || blocked}
                  onClick={() => void actions.runTask("apply", job.id, { templateId })}
                >
                  <Sparkles size={17} />
                  {visibleMaterials.length ? "重新生成投递简历" : "生成投递简历"}
                </button>
              </div>
              {blocked && tab === "投递材料" && (
                <div className="banner warning">
                  <CircleAlert size={18} />
                  有明确硬性限制，请补充档案或修正 职位描述 后重新评估。
                </div>
              )}
              <section className="generation-records" aria-label="生成记录">
                <h3>生成记录</h3>
              {visibleMaterials.length ? (
                <Scroll className="generation-records-scroll">
                <table className="generation-table">
                  <thead><tr><th scope="col">生成时间</th><th scope="col">定制简历</th><th scope="col">沟通话术</th></tr></thead>
                  <tbody>{generationRows.map((row) => <tr key={row.id}>
                    <td>{formatDate(row.createdAt, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</td>
                    {(["resume", "outreach"] as const).map((kind) => <td key={kind}>
                      {row.items.filter((item) => item.kind === kind).map((item) => <button key={item.id} className="text-button" onClick={() => actions.openMaterial(item)}><FileText size={16} />{kind === "resume" ? "查看简历" : "查看话术"}</button>)}
                      {!row.items.some((item) => item.kind === kind) && <span className="muted">—</span>}
                    </td>)}
                  </tr>)}</tbody>
                </table>
                </Scroll>
              ) : (
                <div className="empty-state compact">
                  <p>暂无定制简历</p>
                </div>
              )}
              </section>
              {tab === "投递材料" && <div className="inline-note">
                <ShieldCheck size={17} />
                生成不会自动发送。确认材料后，请到招聘平台提交。
              </div>}
            </>
          )}
          {tab === "跟进记录" && (
            <div className="followup-form">
              <div className="form-grid">
                <Field label="下次跟进">
                  <Calendar
                    value={followUp}
                    onChange={setFollowUp}
                    label="选择跟进日期"
                  />
                </Field>
                <Field label="当前进展">
                  <span className="field-static">
                    <StageBadge stage={job.stage} />
                    {job.appliedAt && (
                      <small>{formatDate(job.appliedAt)} 投递</small>
                    )}
                  </span>
                </Field>
              </div>
              <Field label="沟通记录">
                <textarea
                  rows={7}
                  value={notes}
                  maxLength={40000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="记录 HR 沟通、下一步与跟进结果。"
                />
              </Field>
              <div className="flex-between">
                <button
                  className="button primary"
                  disabled={saving || busy}
                  onClick={() => {
                    void patch({ notes, nextFollowUp: followUp });
                  }}
                >
                  <Check size={17} />
                  保存记录
                </button>
              </div>
              <div className="job-history">
                {data.events
                  .filter((e) => e.jobId === job.id)
                  .slice(0, 8)
                  .map((e) => (
                    <div key={e.id}>
                      <span className="activity-dot" />
                      <p>{e.message}</p>
                      <small>{formatDate(e.createdAt, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</small>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Modal open={previewTemplate} onOpenChange={setPreviewTemplate} title="简历模板预览" wide><div className="resume-preview-wrap"><ResumePreview content={SAMPLE_RESUME} templateId={templateId} placeholder /></div></Modal>
      <Modal
        open={deleting}
        onOpenChange={setDeleting}
        title="删除这个职位？"
        description="该职位的材料和跟进记录也会删除，此操作无法撤销。"
      >
        <div className="dialog-body">
          <div className="delete-summary">
            <Building2 size={26} />
            <span>
              {job.company} · {job.title}
            </span>
          </div>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(false)}
            >
              保留职位
            </button>
            <button
              className="button destructive"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await api(`jobs/${job.id}`, { method: "DELETE" });
                  await refresh();
                  setDeleting(false);
                  actions.onClose();
                  notify("职位已删除");
                } catch (e) {
                  notify((e as Error).message, true);
                } finally {
                  setSaving(false);
                }
              }}
            >
              确认删除
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

