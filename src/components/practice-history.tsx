"use client";

import { useEffect, useState } from "react";
import { formatDate, formatPracticeFeedback } from "@/lib/client";
import { practiceAttempts, practiceFeedbackState } from "@/lib/practice-records";
import type { Material } from "@/lib/types";
import { Markdown, Modal, Scroll } from "./ui";

export function PracticeHistory({ material, onClose, onToggleFeedback }: { material?: Material; onClose: () => void; onToggleFeedback: (materialId: string, attemptId: string, paused: boolean) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  useEffect(() => { setSelectedId(null); setLogId(null); }, [material?.id]);
  const practice = material?.practice;
  const attempts = practice ? practiceAttempts(practice) : [];
  const selected = attempts.find((attempt) => attempt.id === selectedId);
  const logAttempt = attempts.find((attempt) => attempt.id === logId);
  const total = practice?.questions?.length || practice?.totalQuestions || 0;
  const date = (value: string) => value ? formatDate(value, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "历史时间未记录";
  const status = (id: string, finished: boolean) => finished ? "已完成" : id === attempts.at(-1)?.id ? "进行中" : "未完成";
  return <><Modal open={Boolean(material)} onOpenChange={(open) => { if (!open) onClose(); }} title="作答记录" wide>
    <div className="dialog-body practice-history">
      <Scroll className="practice-history-scroll">
        <table className="generation-table practice-records-table">
          <thead><tr><th scope="col">作答次数</th><th scope="col">开始时间</th><th scope="col">答题进度</th><th scope="col">状态</th><th scope="col">AI 点评</th><th scope="col">点评控制</th><th scope="col">操作</th></tr></thead>
          <tbody>{attempts.map((attempt, index) => ({ attempt, index })).reverse().map(({ attempt, index }) => {
            const feedback = practiceFeedbackState(attempt);
            return <tr key={attempt.id}>
            <td>第 {index + 1} 次</td><td>{date(attempt.startedAt)}</td><td>{attempt.turns.length} / {total} 题</td>
            <td>{status(attempt.id, attempt.finished)}</td>
            <td><div>{feedback.label} · {feedback.completed} / {feedback.total}</div><button type="button" className="text-button" onClick={() => setLogId(attempt.id)}>查看日志</button></td>
            <td>{feedback.control ? <button type="button" className="text-button" disabled={updating === attempt.id} onClick={async () => {
              setUpdating(attempt.id);
              try { await onToggleFeedback(material!.id, attempt.id, !attempt.feedbackPaused); }
              finally { setUpdating(null); }
            }}>{feedback.control}</button> : <span className="muted">—</span>}</td><td><button type="button" className="text-button" onClick={() => setSelectedId(attempt.id)}>查看</button></td>
          </tr>; })}</tbody>
        </table>
        {!attempts.length && <div className="empty-state compact">暂无作答记录，开始面试后将自动记录每次练习。</div>}
      </Scroll>
    </div>
  </Modal>
  <Modal open={Boolean(material && selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected ? `第 ${attempts.findIndex((attempt) => attempt.id === selected.id) + 1} 次作答` : "作答详情"} wide>
    <div className="dialog-body practice-history">
      {selected && <>
        <p className="muted">{date(selected.startedAt)} · 已答 {selected.turns.length} / {total} 题</p>
        <Scroll className="practice-history-scroll practice-history-content">
        {selected.turns.length ? selected.turns.map((turn, index) => <section className="practice-attempt-answer" key={index}>
          <h3>第 {index + 1} 题</h3>
          <Markdown text={turn.question} />
          <h4>我的回答</h4><Markdown text={turn.answer} />
          <h4>作答反馈</h4>{turn.feedbackStatus === "pending" ? <p>{selected.feedbackPaused ? "点评已暂停，回答已保存。" : "AI 点评中，可继续作答，完成后自动更新。"}</p> : turn.feedbackStatus === "failed" ? <p>点评未完成，回答已保存。</p> : <Markdown text={formatPracticeFeedback(turn.feedback)} />}
        </section>) : <div className="empty-state compact">本次尚未提交回答</div>}
        </Scroll>
      </>}
    </div>
  </Modal>
  <Modal open={Boolean(material && logAttempt)} onOpenChange={(open) => { if (!open) setLogId(null); }} title="AI 点评日志" wide>
    <div className="dialog-body practice-history">
      {logAttempt && <><p className="muted">{date(logAttempt.startedAt)} · {practiceFeedbackState(logAttempt).label}</p>
      <Scroll className="practice-history-scroll practice-history-content">
      {logAttempt.turns.length ? logAttempt.turns.map((turn, index) => <section className="practice-attempt-answer" key={index}>
        <h3>第 {index + 1} 题</h3>
        {turn.feedbackLog?.length ? <ul>{turn.feedbackLog.map((entry, i) => <li key={i}><time>{date(entry.at)}</time> · {entry.message}</li>)}</ul> : <p>{turn.feedbackStatus === "pending" ? "等待点评，尚无详细日志" : turn.feedbackStatus === "failed" ? "点评失败，历史记录未保存详细日志" : "历史记录未保存详细日志"}</p>}
      </section>) : <p>尚未提交回答，暂无点评日志。</p>}
      </Scroll></>}
    </div>
  </Modal></>;
}
