"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, FileText, Loader2, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { api, formatDate } from "@/lib/client";
import { EMPTY_INTERVIEW, INTERVIEW_FORMATS, INTERVIEW_STAGES, type InterviewPlan, type Job } from "@/lib/types";
import { Dropdown, Field, Scroll, Modal } from "./ui";
import type { Actions } from "./workspace-app";
import { PracticeHistory } from "./practice-history";
import { PracticeRoom } from "./practice-room";

export function InterviewPanel({ job, preparationOnly = false, ...actions }: Actions & { job: Job; preparationOnly?: boolean }) {
  const saved = JSON.stringify(job.interview || EMPTY_INTERVIEW);
  const [plan, setPlan] = useState<InterviewPlan>(job.interview || EMPTY_INTERVIEW);
  // shortcut: 未提交草稿仅保留在当前面板，需要刷新恢复时再持久化。
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [roomPlan, setRoomPlan] = useState<InterviewPlan>(plan);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const [roomMode, setRoomMode] = useState<"text" | "voice" | null>(null);
  const task = actions.data.tasks.find((t) => t.jobId === job.id && !t.feedback && t.status === "running");
  const running = Boolean(task);
  const lastTask = actions.data.tasks.find((t) => t.jobId === job.id && !t.feedback && (t.action === "interview" || t.action === "practice"));
  const taskError = !running && lastTask?.status === "failed" && lastTask.error !== "任务已取消" ? lastTask.error : undefined;
  const busy = running || saving;
  const materials = actions.data.materials.filter((m) => m.jobId === job.id && (m.kind === "interview" || m.kind === "learning"));
  const preparationRecords = materials.filter((m) => !m.practice && m.kind === "interview").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const practiceRecords = materials.filter((m) => m.practice).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const session = selectedSessionId ? practiceRecords.find((m) => m.id === selectedSessionId) : practiceRecords[0];
  const practice = session?.practice;
  useEffect(() => setSelectedSessionId(null), [practiceRecords[0]?.id]);
  useEffect(() => setPlan(JSON.parse(saved)), [saved]);
  useEffect(() => setAnswer(""), [session?.id, practice?.turns.length]);
  async function persist(config = plan) {
    if (JSON.stringify(config) === saved) return;
    await api(`jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ interview: config }) });
    await actions.refresh();
  }
  async function closeConfig() {
    if (saving) return;
    setSaving(true);
    try {
      await persist();
      setConfigOpen(false);
    } catch (error) {
      actions.notify(`配置未保存：${(error as Error).message}`, true);
    } finally {
      setSaving(false);
    }
  }
  async function start(action: "interview" | "practice", config = plan) {
    setSaving(true);
    try {
      await persist(config);
      await actions.runTask(action, job.id);
    } catch (error) {
      actions.notify((error as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={`interview-panel ${preparationOnly ? "preparation-panel" : ""}`}>
      {!preparationOnly && <section className="practice-records" aria-label="模拟面试记录">
        <div className="flex-between practice-records-toolbar">
          <h3>模拟面试</h3>
          <div className="button-group">
            <button className="button secondary small" disabled={busy} onClick={() => setConfigOpen(true)}><SlidersHorizontal size={16} />面试配置</button>
            <button className="button secondary small" onClick={() => actions.openJob(job.id, "面试准备")}><BookOpen size={16} />准备资料</button>
            <button className="button primary small" disabled={busy} onClick={() => void start("practice")}><Sparkles size={16} />生成面试题</button>
          </div>
        </div>
        <Scroll className="practice-records-scroll">
          <table className="generation-table practice-records-table">
            <thead><tr><th scope="col">生成时间</th><th scope="col">类型 / 难度</th><th scope="col">答题进度</th><th scope="col">状态</th><th scope="col">面试题</th><th scope="col">作答记录</th><th scope="col">模拟面试</th><th scope="col">操作</th></tr></thead>
            <tbody>{practiceRecords.map((item) => {
              const record = item.practice!;
              const total = record.questions?.length || record.totalQuestions || record.plan.questionCount || 5;
              const available = Boolean(record.questions?.length);
              return <tr key={item.id}>
                <td>{formatDate(item.createdAt, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</td>
                <td><span>{record.plan.stage}</span><small className="muted">{record.plan.difficulty || "标准"}</small></td>
                <td>{record.turns.length} / {total} 题</td>
                <td><span className={`badge ${record.finished ? "success" : "neutral"}`}>{record.finished ? "已完成" : record.startedAt ? "面试中" : record.questions?.length ? "题目就绪" : "历史练习"}</span></td>
                <td><button className="text-button" aria-label={`查看${formatDate(item.createdAt)}的面试题`} onClick={() => actions.openMaterial(item)}>查看</button></td>
                <td><button className="text-button" onClick={() => setHistorySessionId(item.id)}>查看</button></td>
                <td>{available && <button className="button interview-start small" disabled={busy} aria-label={`${formatDate(item.createdAt)}的面试`} onClick={() => { setSelectedSessionId(item.id); setRoomPlan(record.plan); setAnswer(""); setRoomMode("text"); }}>开始</button>}</td>
                <td><button className="icon-button journal-delete" disabled={busy} aria-label={`删除模拟面试：${formatDate(item.createdAt)}`} onClick={() => setDeletingId(item.id)}><Trash2 size={16} /></button></td>
              </tr>;
            })}</tbody>
          </table>
          {!practiceRecords.length && <div className="empty-state compact"><p>{running ? "面试题生成中…" : "暂无模拟面试，先配置并生成面试题。"}</p></div>}
        </Scroll>
      </section>}

      {preparationOnly && <div className="button-group interview-top-actions">
        <div className="preparation-config-entry">
          <span className="field-label preparation-config-label">面试配置<span className="preparation-config-hint">先完善配置，准备更有针对性</span></span>
          <button className="button secondary" disabled={busy} onClick={() => setConfigOpen(true)}><SlidersHorizontal size={16} />{plan.stage} · {plan.format}<ChevronRight size={16} /></button>
        </div>
        <div className="button-group">
          <button className="button primary" disabled={busy} onClick={() => void start("interview")}><Sparkles size={16} />{preparationRecords.length ? "重新生成准备包" : "生成准备包"}</button>
        </div>
      </div>}

      {preparationOnly && task && <div className="flex-between" role="status">
        <span className="button-group"><Loader2 size={17} className="spin" />{task.step}</span>
        <button className="text-button" onClick={async () => {
          try { await api(`tasks/${task.id}`, { method: "DELETE" }); await actions.refresh(); }
          catch (error) { actions.notify((error as Error).message, true); }
        }}>取消任务</button>
      </div>}
      {taskError && <div className="inline-error" role="alert">{taskError}</div>}
      {preparationOnly && <section className="generation-records preparation-records" aria-label="生成记录">
        <h3>生成记录</h3>
        {preparationRecords.length ? <Scroll className="generation-records-scroll">
          <table className="generation-table">
            <thead><tr><th scope="col">生成时间</th><th scope="col">面试准备包</th><th scope="col">操作</th></tr></thead>
            <tbody>{preparationRecords.map((item, index) => <tr key={item.id}>
              <td>{formatDate(item.createdAt, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</td>
              <td>{item.title}{index === 0 && <span className="badge success preparation-latest">最新</span>}</td>
              <td><button className="text-button" onClick={() => actions.openMaterial(item)}><FileText size={16} />查看准备包</button></td>
            </tr>)}</tbody>
          </table>
        </Scroll> : <div className="empty-state compact"><p>{running ? "准备包生成中…" : "暂无准备包"}</p></div>}
      </section>}
      {preparationOnly && <div className="preparation-footer"><button className="button secondary" onClick={() => actions.openPractice(job.id)}>进入模拟面试<ChevronRight size={16} /></button></div>}
      <Modal open={Boolean(deletingId)} onOpenChange={(open) => { if (!open && !saving) setDeletingId(null); }} title="删除模拟面试">
        <div className="dialog-body">
          <p>确定删除这次模拟面试吗？</p>
          <p>本题组的全部题目、参考答案、所有作答记录与反馈，以及应用内保存的相关文件将一并删除，无法恢复。其他面试记录不受影响。</p>
          <p className="muted">已下载到其他位置的副本不会被删除。</p>
          <div className="dialog-actions">
            <button className="button secondary" disabled={saving} onClick={() => setDeletingId(null)}>取消</button>
            <button className="button danger" disabled={busy} onClick={async () => {
              if (!deletingId) return;
              setSaving(true);
              try {
                await api(`materials/${deletingId}`, { method: "DELETE" });
                if (selectedSessionId === deletingId) { setSelectedSessionId(null); setRoomMode(null); setAnswer(""); }
                setDeletingId(null);
                await actions.refresh();
                actions.notify("本次面试题目与作答记录已删除");
              } catch (error) { actions.notify((error as Error).message, true); }
              finally { setSaving(false); }
            }}><Trash2 size={16} />{saving ? "删除中…" : "确认删除"}</button>
          </div>
        </div>
      </Modal>
      <Modal open={configOpen} onOpenChange={(open) => { if (!open) void closeConfig(); }} title="面试准备配置">
      <div className="dialog-body interview-settings">
      <div className="form-grid">
        <Field label="面试类型">
          <Dropdown label="面试类型" disabled={busy} value={plan.stage} options={[...INTERVIEW_STAGES]} onChange={(stage) => setPlan({ ...plan, stage: stage as InterviewPlan["stage"] })} />
        </Field>
        <Field label="面试形式">
          <Dropdown label="面试形式" disabled={busy} value={plan.format} options={[...INTERVIEW_FORMATS]} onChange={(format) => setPlan({ ...plan, format: format as InterviewPlan["format"] })} />
        </Field>
        <Field label="面试官" hint="选填">
          <input disabled={busy} maxLength={500} value={plan.interviewer} onChange={(e) => setPlan({ ...plan, interviewer: e.target.value })} placeholder="如：用人部门负责人" />
        </Field>
        <Field label="题目数量" hint="默认自动">
          <input type="number" min={1} max={30} step={1} disabled={busy} value={plan.questionCount ?? ""} onChange={(e) => setPlan({ ...plan, questionCount: e.target.value === "" ? null : Number(e.target.value) })} placeholder="自动，由 AI 决定" />
        </Field>
        <Field label="准备依据">
          <span className="field-static">{actions.data.submissions.some((s) => s.jobId === job.id) ? "投递时保存的材料与职位" : "个人档案与已记录岗位"}</span>
        </Field>
      </div>
      <Field label="本轮补充信息" hint="选填">
        <textarea rows={3} disabled={busy} maxLength={6000} value={plan.feedback} onChange={(e) => setPlan({ ...plan, feedback: e.target.value })} placeholder="本轮希望练习的问题，以及已经确认的沟通口径。实际面试反馈在面试管理中记录。" />
      </Field>
      <Field label="公司背景与资料来源" hint="选填">
        <textarea rows={3} disabled={busy} maxLength={6000} value={plan.companyBackground || ""} onChange={(e) => setPlan({ ...plan, companyBackground: e.target.value })} placeholder="公司业务、产品、团队背景，以及官网等资料来源。AI 会结合这些资料设计面试情境。" />
      </Field>
      </div>
      </Modal>
      {roomMode && <PracticeRoom job={job} session={session} plan={roomPlan} setPlan={setRoomPlan} mode={roomMode} answer={answer} setAnswer={setAnswer} busy={busy} task={task} error={taskError}
        generate={() => start("practice", roomPlan)}
        restart={async () => {
          if (!session) return false;
          setSaving(true);
          try {
            await api(`practice/${session.id}/restart`, { method: "POST" });
            setAnswer("");
            await actions.refresh();
            return true;
          } catch (error) { actions.notify((error as Error).message, true); return false; }
          finally { setSaving(false); }
        }}
        start={async () => {
          if (!session?.practice?.questions?.length) return;
          setSaving(true);
          try { await api(`practice/${session.id}/start`, { method: "POST" }); await actions.refresh(); }
          catch (error) { actions.notify((error as Error).message, true); }
          finally { setSaving(false); }
        }}
        submit={() => {
          if (!session || !practice || busy) return;
          setSaving(true);
          void actions.runTask("practice", job.id, { materialId: session.id, attemptId: practice.attemptId, answer: answer.trim(), turn: practice.turns.length }).finally(() => setSaving(false));
        }}
        cancel={() => { if (task) void api(`tasks/${task.id}`, { method: "DELETE" }).then(() => actions.refresh()).catch((error) => actions.notify(error.message, true)); }}
        close={() => setRoomMode(null)}
        openRecord={() => { if (session) setHistorySessionId(session.id); }}
        openQuestions={() => { if (session) actions.openMaterial(session); }}
      />}
      <PracticeHistory onToggleFeedback={async (materialId, attemptId, paused) => {
        try { await api(`practice/${materialId}/feedback`, { method: "POST", body: JSON.stringify({ paused, attemptId }) }); await actions.refresh(); }
        catch (error) { actions.notify((error as Error).message, true); }
      }} material={practiceRecords.find((item) => item.id === historySessionId)} onClose={() => setHistorySessionId(null)} />
    </div>
  );
}
