"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pcmWave } from "@/lib/speech";

export function useLocalRecorder(onTranscript: (text: string) => void, onError: (message: string) => void) {
  const [state, setState] = useState<"idle" | "requesting" | "recording" | "transcribing">("idle");
  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const run = useRef(0);
  const cancel = useCallback(() => {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setState("idle");
  }, []);
  useEffect(() => () => {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);
  const stop = useCallback(() => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);
  async function start(base: string) {
    cancel();
    const current = run.current;
    setState("requesting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (current !== run.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const recording = new MediaRecorder(media);
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = (event) => { if (current === run.current && event.data.size) chunks.push(event.data); };
      recording.onerror = () => { if (current === run.current) { cancel(); callbacks.current.onError("录音中断，请检查麦克风后重试。"); } };
      recording.onstop = async () => {
        media.getTracks().forEach((track) => track.stop());
        if (current !== run.current) return;
        if (timer.current) clearTimeout(timer.current);
        recorder.current = null; stream.current = null;
        setState("transcribing");
        const controller = new AbortController();
        request.current = controller;
        try {
          const blob = new Blob(chunks, { type: recording.mimeType });
          if (!blob.size || blob.size > 12 * 1024 * 1024) throw new Error("录音为空或过长，请重新录制。");
          const context = new OfflineAudioContext(1, 1, 16000);
          const decoded = await context.decodeAudioData(await blob.arrayBuffer());
          if (current !== run.current) return;
          const mono = new Float32Array(decoded.length);
          for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
            const samples = decoded.getChannelData(channel);
            for (let i = 0; i < mono.length; i++) mono[i] += samples[i] / decoded.numberOfChannels;
          }
          const response = await fetch("/api/speech/recognize", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: pcmWave(mono), signal: controller.signal });
          const result = await response.json() as { text?: string; error?: string };
          if (current !== run.current) return;
          if (!response.ok) throw new Error(result.error || "本机识别失败");
          if (!result.text?.trim()) throw new Error("没有识别到清晰的中文，请靠近麦克风后重试。");
          callbacks.current.onTranscript((base + (base ? "\n" : "") + result.text).slice(0, 6000));
        } catch (error) {
          if (current === run.current) callbacks.current.onError((error as Error).message);
        } finally { if (current === run.current) setState("idle"); }
      };
      recording.start(1000);
      setState("recording");
      timer.current = setTimeout(stop, 120000);
    } catch (error) {
      if (current !== run.current) return;
      cancel();
      callbacks.current.onError((error as Error).name === "NotAllowedError" ? "麦克风权限被拒绝，请在浏览器地址栏中允许麦克风。" : "无法打开麦克风，请检查输入设备后重试。");
    }
  }
  return { start, stop, cancel, recording: state === "recording", processing: state === "requesting" || state === "transcribing" };
}
