"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, ChevronRight, CircleHelp, Loader2, MessageSquare, Mic, MicOff, RotateCcw, Send, Volume2, VolumeX } from "lucide-react";
import { INTERVIEW_DIFFICULTIES, type InterviewPlan, type Job, type Material, type Task } from "@/lib/types";
import { Dropdown, Field, Markdown, Modal, Scroll, Tip } from "./ui";
import { InterviewerAvatar } from "./interviewer-avatar";
import { practiceAttempts } from "@/lib/practice-records";
import { formatPracticeFeedback } from "@/lib/client";
import { useInterviewSpeech } from "./use-interview-speech";

export function PracticeRoom({
  job, session, plan, setPlan, mode: initialMode, answer, setAnswer, busy, task, error,
  generate, start, submit, cancel, close, openRecord, openQuestions, restart: restartPractice,
}: {
  job: Job; session?: Material; plan: InterviewPlan; setPlan: (plan: InterviewPlan) => void;
  mode: "text" | "voice"; answer: string; setAnswer: (answer: string) => void;
  busy: boolean; task?: Task; error?: string; generate: () => Promise<void>; start: () => Promise<void>; submit: () => void;
  cancel: () => void; close: () => void; openRecord: () => void; openQuestions: () => void; restart: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState(initialMode);
  const [consent, setConsent] = useState(false);
  const [permission, setPermission] = useState<"mic" | "read" | "start" | null>(null);
  const [restart, setRestart] = useState(false);
  const [discardRecording, setDiscardRecording] = useState(false);
  const [autoRead, setAutoRead] = useState(true);
  const speech = useInterviewSpeech(setAnswer, mode === "voice");
  const practice = session?.practice;
  const [newRound, setNewRound] = useState(false);
  useEffect(() => setNewRound(false), [session?.id]);
  const setup = newRound || !practice?.startedAt;
  const ready = !newRound && Boolean(practice?.questions?.length) && !practice?.finished
    && JSON.stringify(practice?.plan) === JSON.stringify(plan);
  const totalQuestions = !newRound && practice?.questions?.length ? practice.questions.length : !setup && practice ? practice.totalQuestions || practice.plan.questionCount || 5 : plan.questionCount;
  const question = practice?.question || "";
  const spokenText = practice?.finished ? practice.turns.at(-1)?.feedback || "" : question;
  const previousQuestion = useRef(spokenText);
  const speechRef = useRef(speech);
  speechRef.current = speech;
  useEffect(() => {
    if (spokenText === previousQuestion.current) return;
    previousQuestion.current = spokenText;
    if (mode === "voice" && consent && autoRead && spokenText) speechRef.current.speak(spokenText);
  }, [spokenText, mode, consent, autoRead]);
  const phase = speech.listening ? "listening" : speech.speaking ? "speaking" : busy || speech.preparing || speech.processing ? "thinking" : "idle";
  const status = { listening: "正在倾听", speaking: "正在说话", thinking: speech.processing ? "正在处理录音" : speech.preparing ? "正在合成语音" : "正在思考", idle: setup ? "等待开始" : practice?.finished ? "本轮结束" : "等待回答" }[phase];
  const difficulty = practice && !setup ? practice.plan.difficulty || "标准" : plan.difficulty || "标准";

  function voiceAction(action: "mic" | "read") {
    if (!consent) { setPermission(action); return; }
    if (action === "mic") speech.startListening(answer);
    else speech.speak(spokenText || "你好，我是你的模拟面试官。我们将围绕目标职位和你的真实经历展开交流。准备好后，我们就开始。");
  }
  const practiceControls = session && <><button type="button" className="text-button" disabled={speech.listening || speech.processing} onClick={() => { speech.stopAll(); openRecord(); }}>作答记录</button><button type="button" className="text-button" disabled={busy} onClick={() => setRestart(true)}>重新开始</button></>;
  return <Modal open onOpenChange={(open) => {
    if (!open) {
      if (speech.listening || speech.processing) { setDiscardRecording(true); return; }
      speech.stopAll(); close();
    }
  }} title={<>模拟面试{practice?.startedAt && !newRound && <span className="practice-attempt-label">第 {practiceAttempts(practice).length} 次作答</span>}</>} wide>
    <div className="practice-room">
      <div className="practice-room-toolbar">
        <div className="tracker-view" aria-label="模拟面试模式">
          <button className={mode === "text" ? "active" : ""} disabled={speech.listening || speech.processing} aria-pressed={mode === "text"} onClick={() => { speech.stopAll(); setMode("text"); }}><MessageSquare size={16} />文字</button>
          <button className={mode === "voice" ? "active" : ""} aria-pressed={mode === "voice"} onClick={() => setMode("voice")}><AudioLines size={16} />语音</button>
        </div>
        <span className="practice-language">中文 · {difficulty} · {totalQuestions ? `${totalQuestions} 道题` : "题数自动"}</span>
        <Tip label="AI 根据职位、简历和公司资料模拟面试。回答确认后提交，已完成问答自动保存。关闭窗口不会取消正在运行的 AI 任务。" />
      </div>
      <div className={`practice-layout ${mode}`}>
        {mode === "voice" && <aside className="practice-stage">
          <div className="practice-stage-top"><span className={`interviewer-status ${phase}`}><i />{status}</span><span>虚拟面试官</span></div>
          <InterviewerAvatar state={phase} />
          <div className={`voice-wave ${phase}`} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${i * .09}s` }} />)}</div>
          <div className="practice-voice-settings">
            <div className="voice-gender" aria-label="面试官声音">
              <button aria-pressed={speech.gender === "female"} onClick={() => speech.chooseGender("female")}>女声</button>
              <button aria-pressed={speech.gender === "male"} onClick={() => speech.chooseGender("male")}>男声</button>
              <button className="icon-button" aria-label={speech.speaking ? "停止朗读" : "试听声音"} disabled={speech.listening || !speech.voice} onClick={() => speech.speaking ? speech.stopSpeaking() : voiceAction("read")}>{speech.speaking ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            </div>
            <Dropdown label="中文合成声音" value={speech.voiceId || (speech.voices.length ? "__choose" : "__none")} disabled={!speech.voices.length || speech.listening} options={speech.voices.length ? [{ value: "__choose", label: "选择中文声音" }, ...speech.voices.map((voice) => ({ value: voice.voiceURI, label: voice.name }))] : [{ value: "__none", label: "没有可用的中文声音" }]} onChange={speech.chooseVoice} />
            {!speech.voices.length && <p className="voice-capability">未检测到中文声音，请安装系统中文语音包。</p>}
            {!speech.supported && <p className="voice-capability">此浏览器未提供语音识别，可使用文字回答。</p>}
            {speech.voice && <span className="voice-service">{speech.localRecognition ? "本机识别 · " : ""}{speech.voice.localService ? "本机语音合成" : "联网语音合成"}</span>}
            <label className="voice-auto"><input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />自动朗读下一题</label>
          </div>
        </aside>}
        <section className="practice-conversation">
          <div className="practice-job"><div><strong>{job.company}</strong><span>{job.title}</span></div><span className="badge neutral">{practice && !setup ? practice.plan.stage : plan.stage}</span></div>
          {setup ? <div className="practice-setup">
            <div className="practice-setup-icon">{mode === "voice" ? <AudioLines size={28} /> : <MessageSquare size={28} />}</div>
            <h3>{practice?.finished ? "开始下一轮练习" : "准备好，开始面试"}</h3>
            <p>{ready ? `面试题已就绪，共 ${practice?.questions?.length} 题` : "先生成整套题目与参考答案，再开始面试。"}</p>
            <Field label="难度">
              <div className="practice-difficulty">{INTERVIEW_DIFFICULTIES.map((value) => <button key={value} aria-label={`面试难度：${value}`} className={difficulty === value ? "active" : ""} aria-pressed={difficulty === value} disabled={busy} onClick={() => setPlan({ ...plan, difficulty: value })}>{value}{difficulty === value && <Check size={14} />}</button>)}</div>
            </Field>
            <span className="practice-difficulty-hint">{{ 基础: "核心知识与经历表达", 标准: "岗位场景与决策取舍", 挑战: "复杂约束与深入追问" }[difficulty]}</span>
            <div className="practice-setup-actions">
              <button className="button secondary" disabled={busy} onClick={() => { speech.stopAll(); void generate(); }}><RotateCcw size={16} />{ready ? "重新生成面试题" : "生成面试题"}</button>
            <button className="button primary" disabled={busy || !ready} onClick={() => {
              speech.stopAll();
              if (mode === "voice" && !consent) { setPermission("start"); return; }
              void start();
            }}>{busy ? <Loader2 size={17} className="spin" /> : <ChevronRight size={17} />}开始面试</button>
            </div>
            {ready && <button className="text-button" onClick={openQuestions}>查看题目与参考答案<ChevronRight size={15} /></button>}
          </div> : <>
            <div className="practice-progress"><span>{practice?.finished ? "本轮已完成" : `问题 ${Math.min((practice?.turns.length || 0) + 1, totalQuestions || 5)} / ${totalQuestions || 5}`}</span><div>{Array.from({ length: totalQuestions || 5 }, (_, i) => <i key={i} className={i < (practice?.turns.length || 0) ? "done" : i === practice?.turns.length ? "current" : ""} />)}</div>{mode === "voice" && <button className="icon-button" aria-label={speech.speaking ? "停止朗读" : practice?.finished ? "朗读总结" : "朗读题目"} disabled={!speech.voice || speech.listening} onClick={() => speech.speaking ? speech.stopSpeaking() : voiceAction("read")}>{speech.speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>}</div>
            <Scroll className="practice-transcript">
              {practice?.turns.length ? <details className="practice-feedback" open={practice.finished || undefined}><summary>{practice.finished ? "本轮总结" : "上一题反馈"}<ChevronRight size={15} /></summary>{practice.turns.at(-1)!.feedbackStatus === "pending" ? <p>{practice.feedbackPaused ? "点评已暂停，可继续作答。" : "AI 点评中，可继续作答，完成后自动更新。"}</p> : practice.turns.at(-1)!.feedbackStatus === "failed" ? <p>点评未完成，回答已保存。</p> : <Markdown text={formatPracticeFeedback(practice.turns.at(-1)!.feedback)} />}</details> : null}
              {!practice?.finished && <div className="practice-question"><span>面试官</span><Markdown text={question} /></div>}
            </Scroll>
            {!practice?.finished && <form className="practice-answer" onSubmit={(e) => { e.preventDefault(); if (answer.trim() && !busy && !speech.listening && !speech.processing) { speech.stopAll(); submit(); } }}>
              <Field label="我的回答" hint={`${answer.length} / 6000`}>
                <textarea rows={mode === "voice" ? 4 : 5} maxLength={6000} value={answer} disabled={busy || speech.listening || speech.processing} onChange={(e) => setAnswer(e.target.value)} placeholder={mode === "voice" ? "点击麦克风开始回答，结束录音后可修改识别文字。" : "结合你的真实经历作答…"} />
              </Field>
              {speech.interim && <p className="voice-interim" role="status">{speech.interim}</p>}
              <div className="practice-answer-actions">
                <div className="practice-answer-tools">{practiceControls}</div>
                <div className="practice-answer-tools">
                {mode === "voice" ? <button type="button" className={`button secondary ${speech.listening ? "recording" : ""}`} disabled={busy || !speech.supported || speech.processing} onClick={() => speech.listening ? speech.stopListening() : voiceAction("mic")}>{speech.processing ? <Loader2 size={17} className="spin" /> : speech.listening ? <MicOff size={17} /> : <Mic size={17} />}{speech.processing ? "正在识别" : speech.listening ? "结束录音" : "开始回答"}</button> : null}
                <button className="button primary" disabled={busy || speech.listening || speech.processing || !answer.trim()}>{busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />}提交回答</button>
                </div>
              </div>
            </form>}
          </>}
          {busy && <div className="practice-task" role="status"><Loader2 size={16} className="spin" /><span>{task?.step || "正在保存设置…"}</span>{task && <button className="text-button" onClick={cancel}>取消</button>}</div>}
          {(error || (mode === "voice" && speech.error)) && <div className="inline-error" role="alert">{error || speech.error}</div>}
          {session && (setup || practice?.finished) && <div className="practice-footer">{practiceControls}</div>}
        </section>
      </div>
    </div>
    <Modal open={permission !== null} onOpenChange={(open) => { if (!open) setPermission(null); }} title="启用语音">
      <div className="dialog-body voice-consent">
        <CircleHelp size={28} />
        <p>{speech.localRecognition ? "录音将在当前电脑识别，不发送到外部识别服务。单次最多两分钟，结束录音后可编辑识别文字，也可以继续追加录音。" : "语音识别由浏览器提供。Chrome 等浏览器可能将录音发送给其语音服务商处理，网络不可用时可以继续使用文字模式。"}</p>
        <p>{speech.voice?.localService ? "当前声音在本机合成。" : "当前合成声音可能需要联网。"}本应用不保存录音，只保存你确认提交的文字与 AI 反馈。</p>
        <div className="dialog-actions"><button className="button secondary" onClick={() => setPermission(null)}>暂不开启</button><button className="button primary" onClick={() => {
          const action = permission; setPermission(null); setConsent(true);
          if (action === "mic") speech.startListening(answer);
          else {
            speech.speak(action === "start" ? "你好，我是你的模拟面试官。正在准备第一道问题，请稍候。" : spokenText || "你好，我是你的模拟面试官。准备好后，我们就开始。");
            if (action === "start") void start();
          }
        }}>同意并启用</button></div>
      </div>
    </Modal>
    <Modal open={restart} onOpenChange={setRestart} title="重新开始面试">
      <div className="dialog-body"><p>将保留本次已提交的作答与反馈，并新增一次作答，从第一题重新开始。当前未提交的文字或录音将被清空。题目与参考答案保持不变。</p><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setRestart(false)}>取消</button><button className="button primary" disabled={busy} onClick={async () => { speech.stopAll(); if (await restartPractice()) { setRestart(false); setNewRound(false); } }}>确认重新开始</button></div></div>
    </Modal>
    <Modal open={discardRecording} onOpenChange={setDiscardRecording} title="放弃本段录音？">
      <div className="dialog-body"><p>本段录音尚未完成识别，关闭后无法恢复。已提交的问答不会受影响。</p><div className="dialog-actions"><button className="button secondary" onClick={() => setDiscardRecording(false)}>继续回答</button><button className="button primary" onClick={() => { speech.stopAll(); close(); }}>放弃录音并关闭</button></div></div>
    </Modal>
  </Modal>;
}
