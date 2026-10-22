import type { InterviewPractice, PracticeAttempt } from "./types";

export function practiceAttempts(practice: InterviewPractice): PracticeAttempt[] {
  const past = practice.previousAttempts || [];
  if (!practice.startedAt && !practice.turns.length) return past;
  return [...past, {
    id: practice.attemptId || "legacy-attempt",
    startedAt: practice.startedAt || practice.generatedAt || "",
    endedAt: practice.finishedAt,
    finished: practice.finished,
    turns: practice.turns,
    feedbackPaused: practice.feedbackPaused,
  }];
}

export function practiceQuestionContent(title: string, practice: InterviewPractice) {
  return [`# ${title}`,
    `阶段：${practice.plan.stage} · 难度：${practice.plan.difficulty || "标准"} · 共 ${practice.questions?.length || practice.totalQuestions || practice.turns.length} 题`,
    `生成时间：${practice.generatedAt || "历史记录"}`,
    ...(practice.questions || practice.turns.map((turn) => ({ question: turn.question, answer: "历史记录未保存参考答案", basis: "历史记录" })))
      .map((q, i) => `## 面试题 ${i + 1}\n${q.question}\n\n### 参考答案\n${q.answer}\n\n### 出题依据\n${q.basis}`),
  ].join("\n\n");
}

export function practiceFeedbackState(attempt: PracticeAttempt) {
  const total = attempt.turns.length;
  const pending = attempt.turns.filter((turn) => turn.feedbackStatus === "pending").length;
  const completed = attempt.turns.filter((turn) => turn.feedbackStatus === "completed" || (!turn.feedbackStatus && Boolean(turn.feedback))).length;
  const failed = attempt.turns.filter((turn) => turn.feedbackStatus === "failed").length;
  const label = !total ? "待作答" : pending ? (attempt.feedbackPaused ? "已暂停" : "点评中")
    : completed === total ? "已完成" : failed === total ? "点评失败" : failed ? "部分点评失败" : "暂无点评";
  return { label, completed, total, control: pending ? (attempt.feedbackPaused ? "恢复点评" : "停止点评") : null };
}
