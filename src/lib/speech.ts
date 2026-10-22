export type VoiceGender = "female" | "male";

export function pcmWave(samples: Float32Array): ArrayBuffer {
  if (!samples.length || samples.length > 16000 * 121) throw new Error("单次录音最多两分钟");
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return buffer;
}

export function voiceGender(name: string): VoiceGender | null {
  if (/xiaoxiao|xiaoyi|huihui|yaoyao|hanhan|hsiao|tracy|tingting|ting-ting|sinji|晓晓|晓伊|慧慧|瑶瑶/i.test(name)) return "female";
  if (/yunxi|yunyang|yunjian|kang[k]?ang|danny|zhiwei|云希|云扬|康康|志伟/i.test(name)) return "male";
  return null;
}

export function speechChunks(text: string): string[] {
  const plain = text.replace(/https?:\/\/\S+/g, "").replace(/[#*_`>|]/g, "").trim();
  return plain.match(/[^。！？；\n]{1,100}[。！？；\n]?/g)?.map((part) => part.trim()).filter(Boolean) || [];
}

export function recognitionError(code: string) {
  const errors: Record<string, string> = {
    "not-allowed": "麦克风权限被拒绝，请在浏览器地址栏中允许麦克风。",
    "service-not-allowed": "当前浏览器未开放语音识别服务，可尝试新版 Chrome 或切换文字回答。",
    "audio-capture": "未找到可用麦克风，请检查输入设备。",
    network: "语音识别服务连接失败，请检查网络，或切换文字回答。",
    "no-speech": "没有听到声音，请靠近麦克风后重试。",
    "language-not-supported": "当前识别服务不支持中文，请切换文字回答。",
  };
  return errors[code] || "语音识别未能完成，已识别文字仍保留，请重试或输入文字。";
}
