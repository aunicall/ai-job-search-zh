"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recognitionError, speechChunks, voiceGender, type VoiceGender } from "@/lib/speech";
import { useLocalRecorder } from "./use-local-recorder";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
type VoiceOption = SpeechSynthesisVoice & { windows?: boolean };

export function useInterviewSpeech(onTranscript: (text: string) => void, enabled = true) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [gender, setGender] = useState<VoiceGender>("female");
  const [supported, setSupported] = useState(false);
  const [localRecognition, setLocalRecognition] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recorder = useLocalRecorder(onTranscript, setError);
  const cancelRecording = recorder.cancel;
  const recognition = useRef<Recognition | null>(null);
  const speechRun = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localAudio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const audioRequest = useRef<AbortController | null>(null);
  const transcriptCallback = useRef(onTranscript);
  transcriptCallback.current = onTranscript;
  const alive = useRef(true);
  const voice = voices.find((item) => item.voiceURI === voiceId);

  const stopSpeaking = useCallback(() => {
    speechRun.current++;
    if (speechTimer.current) clearTimeout(speechTimer.current);
    utteranceRef.current = null;
    audioRequest.current?.abort();
    audioRequest.current = null;
    if (localAudio.current) { localAudio.current.pause(); localAudio.current.removeAttribute("src"); localAudio.current.load(); }
    localAudio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = "";
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setPreparing(false);
  }, []);
  const stopListening = () => { if (localRecognition) recorder.stop(); else recognition.current?.stop(); };
  const stopAll = useCallback(() => {
    const current = recognition.current;
    recognition.current = null;
    current?.abort();
    cancelRecording();
    setListening(false);
    setInterim("");
    stopSpeaking();
  }, [stopSpeaking, cancelRecording]);

  useEffect(() => {
    if (!enabled) return;
    alive.current = true;
    const browser = window as SpeechWindow;
    setSupported(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
    const synth = window.speechSynthesis;
    let windowsVoices: VoiceOption[] = [];
    const update = () => setVoices([...windowsVoices, ...(synth?.getVoices().filter((item) => /^(zh|cmn)(-|_)/i.test(item.lang)) || [])]);
    update();
    // 音源查询只读且很短；卸载时忽略结果，避免开发模式重复挂载触发取消异常。
    let disposed = false;
    void fetch("/api/speech/voices").then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { voices: { name: string; lang: string }[]; recognition: boolean };
      if (!alive.current || disposed) return;
      if (data.recognition && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined") { setLocalRecognition(true); setSupported(true); }
      windowsVoices = data.voices.map((item) => ({ ...item, voiceURI: `windows:${item.name}`, default: false, localService: true, windows: true }));
      if (windowsVoices.length) { setVoiceId(""); update(); }
    }).catch(() => { /* 系统语音不可用时保留浏览器音源。 */ });
    synth?.addEventListener("voiceschanged", update);
    return () => {
      disposed = true;
      alive.current = false;
      audioRequest.current?.abort();
      localAudio.current?.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      recognition.current?.abort();
      recognition.current = null;
      speechRun.current++;
      if (speechTimer.current) clearTimeout(speechTimer.current);
      utteranceRef.current = null;
      synth?.cancel();
      synth?.removeEventListener("voiceschanged", update);
    };
  }, [enabled]);
  useEffect(() => {
    setVoiceId((current) => {
      if (voices.some((item) => item.voiceURI === current)) return current;
      return voices.find((item) => voiceGender(item.name) === gender)?.voiceURI || "";
    });
  }, [voices, gender]);

  function chooseGender(value: VoiceGender) {
    stopSpeaking();
    setGender(value);
    const match = voices.find((item) => voiceGender(item.name) === value);
    setVoiceId(match?.voiceURI || "");
    setError(match ? "" : `本机没有识别到中文${value === "male" ? "男" : "女"}声，可在系统中安装中文语音包，或手动选择可用声音。`);
  }
  function chooseVoice(value: string) {
    stopSpeaking();
    setVoiceId(value);
    const match = voices.find((item) => item.voiceURI === value);
    const detected = match && voiceGender(match.name);
    if (detected) setGender(detected);
    setError("");
  }
  function startListening(base: string) {
    if (localRecognition) {
      stopSpeaking(); setError(""); setInterim("");
      void recorder.start(base);
      return;
    }
    if (recognition.current) return;
    const BrowserRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!BrowserRecognition) { setError("当前浏览器不支持语音识别，请使用新版 Chrome，或切换文字回答。"); return; }
    stopSpeaking();
    setError("");
    setInterim("");
    const current = new BrowserRecognition();
    recognition.current = current;
    current.lang = "zh-CN";
    current.continuous = true;
    current.interimResults = true;
    current.onresult = (event) => {
      if (!alive.current || recognition.current !== current) return;
      const results = Array.from(event.results);
      const final = results.filter((result) => result.isFinal).map((result) => result[0].transcript).join("");
      const pending = results.filter((result) => !result.isFinal).map((result) => result[0].transcript).join("");
      transcriptCallback.current((base + (base && final ? "\n" : "") + final).slice(0, 6000));
      setInterim(pending);
      if (base.length + final.length >= 6000) { current.stop(); setError("回答已达到 6000 字，录音已停止。"); }
    };
    current.onerror = (event) => {
      if (alive.current && recognition.current === current && event.error !== "aborted") setError(recognitionError(event.error));
    };
    current.onend = () => {
      if (!alive.current || recognition.current !== current) return;
      recognition.current = null;
      setListening(false);
      setInterim("");
    };
    try { current.start(); setListening(true); }
    catch { recognition.current = null; setListening(false); setError("无法启动麦克风，请检查浏览器权限后重试。"); }
  }
  const speak = useCallback((text: string) => {
    stopAll();
    if (!voice) { setError("请先选择一个可用的中文声音。"); return; }
    setError("");
    const chunks = speechChunks(text);
    const run = speechRun.current;
    if (voice.windows) {
      const controller = new AbortController();
      audioRequest.current = controller;
      setPreparing(true);
      void fetch("/api/speech/synthesize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunks.join(""), voice: voice.name }), signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || "本机语音合成失败");
        const blob = await response.blob();
        if (!alive.current || run !== speechRun.current) return;
        audioUrl.current = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl.current);
        localAudio.current = audio;
        audio.onplaying = () => { if (alive.current && run === speechRun.current) { setPreparing(false); setSpeaking(true); } };
        audio.onended = () => { if (alive.current && run === speechRun.current) stopSpeaking(); };
        audio.onerror = () => {
          if (alive.current && run === speechRun.current) { stopSpeaking(); setError("音频无法播放，请检查系统输出设备后重试。"); }
        };
        await audio.play();
      }).catch((error: Error) => {
        if (!alive.current || run !== speechRun.current || controller.signal.aborted) return;
        stopSpeaking();
        setError(error.name === "NotAllowedError" ? "浏览器阻止了自动播放，请点击朗读题目。" : error.message);
      });
      return;
    }
    const next = (index: number) => {
      if (!alive.current || run !== speechRun.current) return;
      if (index >= chunks.length) { setSpeaking(false); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utteranceRef.current = utterance;
      utterance.lang = "zh-CN";
      utterance.voice = voice;
      utterance.rate = 0.98;
      utterance.onstart = () => {
        if (!alive.current || run !== speechRun.current) return;
        if (speechTimer.current) clearTimeout(speechTimer.current);
        setSpeaking(true);
      };
      utterance.onend = () => {
        if (run !== speechRun.current) return;
        if (speechTimer.current) clearTimeout(speechTimer.current);
        utteranceRef.current = null;
        next(index + 1);
      };
      utterance.onerror = (event) => {
        if (!alive.current || run !== speechRun.current) return;
        if (speechTimer.current) clearTimeout(speechTimer.current);
        utteranceRef.current = null;
        setSpeaking(false);
        if (event.error !== "canceled" && event.error !== "interrupted") setError("语音播放失败，请点击重新朗读，或更换中文声音。");
      };
      speechTimer.current = setTimeout(() => {
        if (!alive.current || run !== speechRun.current) return;
        stopSpeaking();
        setError("声音未能启动，请检查系统输出设备，或更换中文声音后重试。");
      }, 10000);
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    };
    next(0);
  }, [voice, stopAll, stopSpeaking]);
  return { voices, voice, voiceId, gender, chooseGender, chooseVoice, supported, localRecognition, listening: listening || recorder.recording, processing: recorder.processing, speaking, preparing, interim, error, startListening, stopListening, stopSpeaking, stopAll, speak };
}
