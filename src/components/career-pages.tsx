"use client";

import { useRef, useState } from "react";
import { FolderOpen, UserRound, BookOpen, CalendarDays, Check, FileText, MessageSquare, Pencil, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { api, formatDate } from "@/lib/client";
import { INTERVIEW_FORMATS, INVITATION_STATUSES, isCandidate, type AiPreference, type InterviewRecord, type JournalEntry } from "@/lib/types";
import { RESUME_TEMPLATES, SAMPLE_RESUME, resumeSections, resumeTemplate } from "@/lib/resume-templates";
import { Calendar, Dropdown, Field, Modal, Scroll, Tip } from "./ui";
import { InterviewPanel } from "./interview";
import type { Actions } from "./workspace-app";

export function ResumePreview({ content, templateId, avatarId, placeholder = false }: { content: string; templateId?: string; avatarId?: string | null; placeholder?: boolean }) {
  const template = resumeTemplate(templateId);
  const sections = resumeSections(content);
  const render = (lines: typeof sections.header) => lines.map((line, i) => line.level === 1 ? <h1 key={i}>{line.text}</h1> : line.level === 2 ? <h2 key={i}>{line.text}</h2> : line.level ? <h3 key={i}>{line.text}</h3> : <p key={i}>{line.text}</p>);
  return <article className={`resume-preview resume-${template.layout}`} style={{ "--resume-accent": template.color } as React.CSSProperties}>
    <header className="resume-header"><div className="resume-identity">{render(sections.header)}</div>{avatarId ? <img className="resume-photo" src={`/api/profile/avatar/${avatarId}`} alt="简历头像" /> : placeholder ? <div className="resume-photo-placeholder"><UserRound size={30} strokeWidth={1.4} /><span>照片</span></div> : null}</header>
    {render(sections.body)}
  </article>;
}

export function TemplatesPage() {
  const [preview, setPreview] = useState<string | null>(null);
  return <div className="career-page"><div className="page-heading"><div className="button-group"><h1>简历模板</h1><Tip label="在职位管理中为具体岗位生成简历时选择模板。预览为示例内容，不会写入个人档案。" /></div></div>
    <div className="template-grid">{RESUME_TEMPLATES.map((template) => <button className="template-card" key={template.id} onClick={() => setPreview(template.id)}>
      <div className="template-thumbnail" aria-hidden="true"><ResumePreview content={SAMPLE_RESUME} templateId={template.id} placeholder /></div>
      <div className="template-caption"><strong>{template.name}</strong><span>{template.description}</span><span className="text-button">预览模板 <FileText size={16} /></span></div>
    </button>)}</div>
    <Modal open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }} title={`${resumeTemplate(preview || undefined).name} · 示例预览`} wide>
      <div className="resume-preview-wrap"><ResumePreview content={SAMPLE_RESUME} templateId={preview || undefined} placeholder /></div>
    </Modal>
  </div>;
}

export function PracticePage(actions: Actions & { jobId: string | null; selectJob: (id: string) => void }) {
  const candidates = actions.data.jobs.filter(isCandidate);
  const job = candidates.find((j) => j.id === actions.jobId);
  return <div className="career-page"><div className="page-heading practice-page-heading"><h1>模拟面试</h1><Tip label="结合当前职位、公司背景、个人档案、最近 20 篇笔记及最多 12 条相似岗位的实际面试反馈。笔记每篇取前 3000 字。" /></div>
    {!candidates.length ? <div className="panel empty-state"><MessageSquare size={32} /><h3>先选择一个候选职位</h3><button className="button primary" onClick={() => actions.navigate("discover")}>发现职位</button></div> : <div className="practice-page-layout">
      <aside className="panel practice-job-picker"><h3>候选职位</h3><Scroll className="candidate-list">{candidates.map((item) => <button key={item.id} className={`candidate-option ${job?.id === item.id ? "active" : ""}`} onClick={() => actions.selectJob(item.id)}><strong>{item.title}</strong><span>{item.company}</span><small>{item.stage}</small></button>)}</Scroll></aside>
      <section className="panel practice-page-body">{job ? <><div className="practice-job-heading"><div><h2>{job.title}</h2><p>{job.company} · {job.city || "地点待确认"}</p></div><button className="button secondary small" onClick={() => actions.openJob(job.id)}>职位资料</button></div><Scroll className="practice-content-scroll"><InterviewPanel key={job.id} {...actions} job={job} /></Scroll></> : <div className="empty-state"><MessageSquare size={32} /><h3>选择本次练习的职位</h3></div>}</section>
    </div>}
  </div>;
}

export function JournalPage(actions: Actions) {
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  function edit(entry: JournalEntry | "new") { setEditing(entry); setTitle(entry === "new" ? "" : entry.title); setContent(entry === "new" ? "" : entry.content); }
  return <div className="career-page"><div className="page-heading"><div className="button-group"><h1>求职笔记</h1><Tip label="保存后会作为模拟面试的参考，不会自动改写个人档案。" /></div><button className="button primary" onClick={() => edit("new")}><Plus size={17} />写笔记</button></div>
    <div className="journal-grid">{actions.data.journal.map((entry) => <article className="panel journal-card" key={entry.id}>
      <button className="journal-card-content" onClick={() => edit(entry)}><BookOpen size={21} /><h3>{entry.title}</h3><p>{entry.content}</p></button>
      <div className="journal-card-footer"><small>{formatDate(entry.updatedAt, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</small><button className="icon-button journal-delete" aria-label={`删除笔记：${entry.title}`} onClick={() => setDeleting(entry)}><Trash2 size={17} /></button></div>
    </article>)}</div>
    {!actions.data.journal.length && <div className="panel empty-state"><BookOpen size={30} /><h3>记录你的思考与收获</h3><button className="button secondary" onClick={() => edit("new")}>写第一篇笔记</button></div>}
    <Modal open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !removing) setDeleting(null); }} title="删除笔记">
      <div className="dialog-body"><p>确定删除“{deleting?.title}”？</p><div className="dialog-actions"><button className="button secondary" disabled={removing} onClick={() => setDeleting(null)}>取消</button><button className="button danger" disabled={removing} onClick={async () => {
        if (!deleting) return;
        setRemoving(true);
        try { await api(`journal/${deleting.id}`, { method: "DELETE" }); await actions.refresh(); setDeleting(null); actions.notify("笔记已删除"); }
        catch (error) { actions.notify((error as Error).message, true); }
        finally { setRemoving(false); }
      }}><Trash2 size={16} />删除</button></div></div>
    </Modal>
    <Modal open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }} title={editing === "new" ? "写笔记" : "编辑笔记"} wide>
      <form className="dialog-body" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await api(editing === "new" ? "journal" : `journal/${(editing as JournalEntry).id}`, { method: editing === "new" ? "POST" : "PUT", body: JSON.stringify({ title, content }) }); await actions.refresh(); setEditing(null); actions.notify("笔记已保存"); } catch (error) { actions.notify((error as Error).message, true); } finally { setSaving(false); } }}>
        <Field label="标题"><input value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} placeholder="这次面试让我想到……" /></Field>
        <Field label="正文"><textarea className="journal-editor" value={content} maxLength={40000} onChange={(e) => setContent(e.target.value)} placeholder="记录经验、反思、表达习惯，以及下次想改进的地方。" /></Field>
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>取消</button><button className="button primary" disabled={saving || !title.trim() || !content.trim()}><Save size={17} />保存笔记</button></div>
      </form>
    </Modal>
  </div>;
}

export function AiPreferencesPage(actions: Actions) {
  const [editing, setEditing] = useState<AiPreference | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  function edit(entry: AiPreference | "new") { setEditing(entry); setTitle(entry === "new" ? "" : entry.title); setContent(entry === "new" ? "" : entry.content); }
  const entries = actions.data.aiPreferences.entries;
  return <div className="career-page"><div className="page-heading"><div className="button-group"><h1>AI 设定</h1><Tip label="所有保存的设定会共同用于两个引擎的 AI 请求，下次调用生效。请避免互相冲突；事实约束和任务输出格式优先。" /></div><button className="button primary" onClick={() => edit("new")}><Plus size={17} />新增设定</button></div>
    <div className="journal-grid">{entries.map((entry) => <button className="panel journal-card" key={entry.id} onClick={() => edit(entry)}><Sparkles size={21} /><h3>{entry.title}</h3><p>{entry.content}</p><small>{entry.updatedAt ? formatDate(entry.updatedAt) : "原有设定"}</small></button>)}</div>
    {!entries.length && <div className="panel empty-state"><Sparkles size={30} /><h3>添加你的 AI 行为偏好</h3><button className="button secondary" onClick={() => edit("new")}>新增第一条设定</button></div>}
    <Modal open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }} title={editing === "new" ? "新增设定" : "编辑设定"} wide>
      <form className="dialog-body" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await api(editing === "new" ? "ai-preferences" : `ai-preferences/${(editing as AiPreference).id}`, { method: editing === "new" ? "POST" : "PUT", body: JSON.stringify({ title, content }) }); await actions.refresh(); setEditing(null); actions.notify("设定已保存，下次 AI 调用生效"); } catch (error) { actions.notify((error as Error).message, true); } finally { setSaving(false); } }}>
        <Field label="设定名称"><input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="例如：回答风格、面试追问方式" /></Field>
        <Field label="设定内容"><textarea className="journal-editor" value={content} maxLength={12000} onChange={(e) => setContent(e.target.value)} placeholder="例如：请直接指出问题，给出具体可执行的建议，避免空泛的鼓励。" /></Field>
        <div className="dialog-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => setEditing(null)}>取消</button><button className="button primary" disabled={saving || !title.trim() || !content.trim()}><Save size={17} />保存设定</button></div>
      </form>
    </Modal>
  </div>;
}

const emptyInvitation = { jobId: "", round: "第一轮面试", status: "已收到邀请" as InterviewRecord["status"], scheduledAt: "", format: "待确认" as InterviewRecord["format"], location: "", contact: "", feedback: "" };
export function InterviewsPage(actions: Actions) {
  const eligible = actions.data.jobs.filter((j) => isCandidate(j) && j.appliedAt);
  const [filter, setFilter] = useState("全部");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyInvitation);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  function edit(item?: InterviewRecord) { setEditing(item?.id || "new"); setDraft(item || { ...emptyInvitation, jobId: eligible[0]?.id || "" }); setDate(item?.scheduledAt.slice(0, 10) || ""); setTime(item?.scheduledAt.slice(11, 16) || "10:00"); }
  const items = actions.data.interviews.filter((r) => filter === "全部" || (filter === "有反馈" ? Boolean(r.feedback) : r.status === filter)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return <div className="career-page"><div className="page-heading"><h1>面试管理</h1><button className="button primary" disabled={!eligible.length} onClick={() => edit()}><Plus size={17} />记录面试邀请</button></div>
    <div className="toolbar"><div className="tabs">{["全部", "已收到邀请", "确定参加", "已完成", "有反馈"].map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "有反馈" ? "面试反馈" : value}</button>)}</div></div>
    {!items.length && <div className="panel empty-state"><CalendarDays size={32} /><h3>{eligible.length ? "暂无面试记录" : "先在职位管理中标记实际投递"}</h3><button className="button secondary" onClick={() => eligible.length ? edit() : actions.navigate("applications")}>{eligible.length ? "记录收到的邀请" : "前往职位管理"}</button></div>}
    <div className="invitation-list">{items.map((item) => { const job = actions.data.jobs.find((j) => j.id === item.jobId); return <article className="panel invitation-card" key={item.id}>
      <div className="invitation-main"><span className="soft-icon"><CalendarDays size={24} /></span><div><h3>{job?.title || "职位已删除"}</h3><p>{job?.company} · {item.round}</p><div className="invitation-meta"><span>{item.scheduledAt ? `${item.scheduledAt.slice(0, 10)} ${item.scheduledAt.slice(11, 16)}` : "时间待确认"}</span><span>{item.format}</span><span>{item.location}</span></div></div><span className="badge">{item.status}</span></div>
      {item.feedback && <div className="feedback-excerpt"><strong>面试反馈</strong><p>{item.feedback}</p></div>}
      <div className="invitation-actions"><button className="button secondary small" onClick={() => edit(item)}><Pencil size={16} />{item.feedback ? "管理面试 / 编辑反馈" : "管理面试 / 添加反馈"}</button>{job && <><button className="button secondary small" onClick={() => actions.openJob(job.id, "面试准备")}><FileText size={16} />面试准备</button><button className="button secondary small" onClick={() => actions.openPractice(job.id)}><MessageSquare size={16} />模拟面试</button></>}</div>
    </article>; })}</div>
    <Modal open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }} title={editing === "new" ? "记录面试邀请" : "面试安排与反馈"} wide>
      <form className="dialog-body job-record-form" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await api(editing === "new" ? "interviews" : `interviews/${editing}`, { method: editing === "new" ? "POST" : "PUT", body: JSON.stringify({ ...draft, scheduledAt: date ? `${date}T${time}` : "" }) }); await actions.refresh(); setEditing(null); actions.notify("面试记录已保存"); } catch (error) { actions.notify((error as Error).message, true); } finally { setSaving(false); } }}>
        <div className="form-grid"><Field label="已投递职位"><Dropdown label="已投递职位" disabled={editing !== "new"} value={draft.jobId} options={eligible.map((j) => ({ value: j.id, label: `${j.company} · ${j.title}` }))} onChange={(jobId) => setDraft({ ...draft, jobId })} /></Field>
          <Field label="面试轮次"><input value={draft.round} maxLength={500} onChange={(e) => setDraft({ ...draft, round: e.target.value })} /></Field>
          <Field label="邀请状态"><Dropdown label="邀请状态" value={draft.status} options={[...INVITATION_STATUSES]} onChange={(status) => setDraft({ ...draft, status: status as InterviewRecord["status"] })} /></Field>
          <Field label="面试形式"><Dropdown label="面试形式" value={draft.format} options={[...INTERVIEW_FORMATS]} onChange={(format) => setDraft({ ...draft, format: format as InterviewRecord["format"] })} /></Field>
          <Field label="面试日期"><Calendar label="面试日期" value={date} onChange={setDate} /></Field><Field label="时间" hint="24 小时制"><input value={time} maxLength={5} placeholder="10:00" onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="地点 / 会议链接"><input value={draft.location} maxLength={500} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></Field><Field label="联系人"><input value={draft.contact} maxLength={500} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} /></Field>
        </div><Field label="实际面试反馈" hint="可在面试后补充"><textarea rows={5} maxLength={10000} value={draft.feedback} onChange={(e) => setDraft({ ...draft, feedback: e.target.value })} placeholder="实际被问到的问题、自己的表现、招聘方反馈、下一步。相似岗位的模拟面试会参考这些内容。" /></Field>
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>取消</button><button className="button primary" disabled={saving || !draft.jobId}><Check size={17} />保存记录</button></div>
      </form>
    </Modal>
  </div>;
}

export function StorageSettings(actions: Pick<Actions, "data" | "refresh" | "notify">) {
  const [directory, setDirectory] = useState(actions.data.storage.directory);
  const [saving, setSaving] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const savedDirectory = useRef(actions.data.storage.directory);
  const pendingSave = useRef<Promise<void> | null>(null);
  async function saveDirectory(value: string) {
    const next = value.trim();
    if (next === savedDirectory.current) return;
    setSaving(true);
    try {
      const result = await api<{ directory: string }>("storage", { method: "PUT", body: JSON.stringify({ directory: next }) });
      savedDirectory.current = result.directory;
      setDirectory(result.directory);
      await actions.refresh();
      actions.notify("工作目录已更新");
    } catch (error) { actions.notify((error as Error).message, true); }
    finally { setSaving(false); }
  }
  return <div className="storage-settings">
    <div className="storage-directory-label"><label htmlFor="storage-directory">文件工作目录</label><Tip label={`导入文件、生成材料和导出文件保存到此目录。修改后用于新文件，已有文件保留在原处。数据库仍位于 ${actions.data.storage.database}。`} /></div>
    <div className="storage-directory-controls">
      <input id="storage-directory" aria-label="文件工作目录" value={directory} maxLength={1000} disabled={saving || browsing} onChange={(e) => setDirectory(e.target.value)} onBlur={() => { pendingSave.current = saveDirectory(directory); }} />
      <button type="button" className="button secondary" disabled={browsing} onPointerDown={(e) => e.preventDefault()} onClick={async () => {
        setBrowsing(true);
        try {
          await pendingSave.current;
          const result = await api<{ directory: string | null }>("storage/browse", { method: "POST" });
          if (result.directory) { setDirectory(result.directory); await saveDirectory(result.directory); }
        } catch (error) { actions.notify((error as Error).message, true); }
        finally { setBrowsing(false); }
      }}><FolderOpen size={17} />{browsing ? "选择目录中…" : "浏览本地文件夹"}</button>
    </div>
    {saving && <small className="muted" role="status">正在保存目录…</small>}
  </div>;
}
