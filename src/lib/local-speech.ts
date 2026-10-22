import { spawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";

const voiceSchema = z.object({ name: z.string(), lang: z.string(), gender: z.enum(["Female", "Male", "Neutral", "NotSet"]) });
export const speechInputSchema = z.object({ text: z.string().trim().min(1).max(4000), voice: z.string().min(1).max(500) });
const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $modernVoices = @()
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $modernVoices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]::AllVoices | Where-Object { $_.Language -like 'zh-*' })
  } catch { $modernVoices = @() }
  if ($inputData.mode -eq 'voices') {
    $voices = @($modernVoices | ForEach-Object { @{ name = $_.DisplayName; lang = $_.Language; gender = $_.Gender.ToString() } })
    $voices += @($speech.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh-*' } | ForEach-Object {
      @{ name = $_.VoiceInfo.Name; lang = $_.VoiceInfo.Culture.Name; gender = $_.VoiceInfo.Gender.ToString() }
    })
    [Console]::Write((ConvertTo-Json -InputObject $voices -Compress))
  } elseif ($inputData.mode -eq 'recognizers') {
    $found = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -eq 'zh-CN' })
    [Console]::Write(($found.Count -gt 0).ToString().ToLowerInvariant())
  } elseif ($inputData.mode -eq 'recognize') {
    $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::new([System.Globalization.CultureInfo]::GetCultureInfo('zh-CN'))
    $audio = [System.IO.MemoryStream]::new([Convert]::FromBase64String($inputData.audio))
    try {
      $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
      $recognizer.SetInputToWaveStream($audio)
      $phrases = New-Object System.Collections.Generic.List[string]
      while ($true) {
        try { $result = $recognizer.Recognize() }
        catch [System.InvalidOperationException] {
          if ($audio.Position -ge $audio.Length) { break }
          throw
        }
        if ($null -eq $result) { break }
        $phrases.Add($result.Text)
      }
      [Console]::Write((ConvertTo-Json -InputObject @{ text = ($phrases -join '，') } -Compress))
    } finally { $recognizer.Dispose(); $audio.Dispose() }
  } else {
    $wave = New-Object System.IO.MemoryStream
    try {
      $modernVoice = $modernVoices | Where-Object { $_.DisplayName -eq $inputData.voice } | Select-Object -First 1
      if ($null -ne $modernVoice) {
        $modern = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::new()
        try {
          $modern.Voice = $modernVoice
          $operation = $modern.SynthesizeTextToStreamAsync([string]$inputData.text)
          $streamType = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
          $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
          $task = $asTask.MakeGenericMethod($streamType).Invoke($null, @($operation))
          $task.Wait()
          $resultStream = $task.Result
          $readStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($resultStream)
          try { $readStream.CopyTo($wave) } finally { $readStream.Dispose(); $resultStream.Dispose() }
        } finally { $modern.Dispose() }
      } else {
        $speech.SelectVoice($inputData.voice)
        $speech.SetOutputToWaveStream($wave)
        $speech.Speak([string]$inputData.text)
        $speech.SetOutputToNull()
      }
      $bytes = $wave.ToArray()
      [Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)
    } finally { $wave.Dispose() }
  }
} finally { $speech.Dispose() }
`;
let voiceCache: Promise<z.infer<typeof voiceSchema>[]> | undefined;
let recognitionCache: Promise<boolean> | undefined;
let synthesizing = 0;
let recognizing = false;
function runSpeech(input: object, signal?: AbortSignal, timeout = 20000): Promise<Buffer> {
  if (process.platform !== "win32") return Promise.reject(new Error("本机合成仅支持 Windows，请使用浏览器声音"));
  if (signal?.aborted) return Promise.reject(new Error("语音已取消"));
  return new Promise((resolve, reject) => {
    // 仅执行固定脚本；文本通过 stdin JSON 传入，不作为命令或 SSML 执行。
    const command = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const child = spawn(command, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let length = 0;
    let failure = "";
    const stop = (message: string) => { failure = message; child.kill(); };
    const abort = () => stop("语音已取消");
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop("本机语音处理超时，请缩短内容后重试"), timeout);
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > 24 * 1024 * 1024) stop("合成音频过大");
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new Error("无法启动本机语音服务")); });
    child.on("close", (code) => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (failure || code !== 0) reject(new Error(failure || "本机语音处理失败，请检查中文语音包"));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(JSON.stringify(input));
  });
}
export async function localVoices() {
  if (process.platform !== "win32") return [];
  voiceCache ??= runSpeech({ mode: "voices" }).then((output) => z.array(voiceSchema).parse(JSON.parse(output.toString("utf8").replace(/^\uFEFF/, "")))).catch((error) => { voiceCache = undefined; throw error; });
  return voiceCache;
}
export async function localRecognitionAvailable() {
  if (process.platform !== "win32") return false;
  recognitionCache ??= runSpeech({ mode: "recognizers" }).then((result) => result.toString("utf8").trim() === "true").catch(() => false);
  return recognitionCache;
}
export function validateRecording(wave: Buffer) {
  if (wave.length < 44 || wave.length > 12 * 1024 * 1024 || wave.subarray(0, 4).toString() !== "RIFF" || wave.subarray(8, 12).toString() !== "WAVE")
    throw new Error("录音格式无效");
  let byteRate = 0;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= wave.length;) {
    const tag = wave.subarray(offset, offset + 4).toString();
    const size = wave.readUInt32LE(offset + 4);
    if (offset + 8 + size > wave.length) throw new Error("录音数据不完整");
    if (tag === "fmt ") {
      if (size < 16) throw new Error("录音格式无效");
      const channels = wave.readUInt16LE(offset + 10);
      const rate = wave.readUInt32LE(offset + 12);
      byteRate = wave.readUInt32LE(offset + 16);
      if (wave.readUInt16LE(offset + 8) !== 1 || ![1, 2].includes(channels) || rate < 8000 || rate > 48000 || wave.readUInt16LE(offset + 22) !== 16 || byteRate !== rate * channels * 2 || wave.readUInt16LE(offset + 20) !== channels * 2)
        throw new Error("请使用 16 位 PCM 录音");
    }
    if (tag === "data") dataSize += size;
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || !dataSize || dataSize / byteRate > 121) throw new Error("单次录音最多两分钟");
}
export async function recognizeLocal(wave: Buffer, signal?: AbortSignal) {
  validateRecording(wave);
  if (!(await localRecognitionAvailable())) throw new Error("本机未安装中文语音识别包");
  if (recognizing) throw new Error("正在识别另一段录音，请稍后重试");
  recognizing = true;
  try {
    const output = await runSpeech({ mode: "recognize", audio: wave.toString("base64") }, signal, 45000);
    return z.object({ text: z.string().max(6000) }).parse(JSON.parse(output.toString("utf8").replace(/^\uFEFF/, "")));
  } finally { recognizing = false; }
}
export async function synthesizeLocal(input: z.infer<typeof speechInputSchema>, signal?: AbortSignal) {
  const validated = speechInputSchema.parse(input);
  if (!(await localVoices()).some((voice) => voice.name === validated.voice)) throw new Error("所选中文声音未安装");
  if (synthesizing >= 2) throw new Error("语音正在合成，请稍后重试");
  synthesizing++;
  try {
    const wave = await runSpeech({ mode: "speak", ...validated }, signal);
    if (wave.subarray(0, 4).toString() !== "RIFF" || wave.subarray(8, 12).toString() !== "WAVE") throw new Error("语音服务未生成有效音频");
    return wave;
  } finally { synthesizing--; }
}
