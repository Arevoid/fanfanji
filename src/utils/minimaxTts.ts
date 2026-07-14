import { audioDb } from "./audioDb";

export const MINIMAX_DEFAULT_VOICES = [
  { id: "female-shaonv", name: "甜美少女 (女)", gender: "female" },
  { id: "female-qn-jiaochen", name: "娇嗔可人 (女)", gender: "female" },
  { id: "female-qn-yujie", name: "高冷御姐 (女)", gender: "female" },
  { id: "female-qn-shuangkuai", name: "爽快大姐 (女)", gender: "female" },
  { id: "female-qn-ruomei", name: "柔美温婉 (女)", gender: "female" },
  { id: "male-qn-qingse", name: "青涩青年 (男)", gender: "male" },
  { id: "male-qn-shaonian", name: "阳光少年 (男)", gender: "male" },
  { id: "male-qn-chaoku", name: "潮酷青年 (男)", gender: "male" },
  { id: "male-qn-badao", name: "霸道总裁 (男)", gender: "male" },
  { id: "presenter_female", name: "播音女声 (女)", gender: "female" },
  { id: "presenter_male", name: "播音男声 (男)", gender: "male" },
];

/**
 * Filter out dialogue actions in brackets / parentheticals or asterisks.
 * e.g., (微笑)你好 -> 你好, *摸头*好久不见 -> 好久不见, 【开心】今天 -> 今天
 */
export function cleanBracketActions(text: string): string {
  if (!text) return "";
  return text
    .replace(/\([^)]*\)/g, "") // (微笑)
    .replace(/（[^）]*）/g, "") // 中文 （笑）
    .replace(/\[[^\]]*\]/g, "") // [生气]
    .replace(/【[^】]*】/g, "") // 【开心】
    .replace(/\{[^}]*\}/g, "") // {开心}
    .replace(/\*[^*]+\*/g, "") // *抱抱* or *摸头*
    .trim();
}

/**
 * Split ultra-long text into sentences or shorter chunks (< 150 characters) to avoid API limit
 */
export function splitTextIntoChunks(text: string, maxLen: number = 150): string[] {
  const cleaned = cleanBracketActions(text);
  if (!cleaned) return [];
  
  // Split into sentences using common sentence terminators
  const sentences = cleaned.split(/([。！？\n!?；;]+)/);
  const chunks: string[] = [];
  let currentChunk = "";
  
  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i];
    if (!part) continue;
    
    if (currentChunk.length + part.length > maxLen) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = part;
    } else {
      currentChunk += part;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // Force split if any remaining chunk is still too long
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen) {
      finalChunks.push(chunk);
    } else {
      let remaining = chunk;
      while (remaining.length > 0) {
        let sliceLen = maxLen;
        if (remaining.length > maxLen) {
          const sub = remaining.slice(0, maxLen);
          const commaIdx = Math.max(sub.lastIndexOf("，"), sub.lastIndexOf(","), sub.lastIndexOf(" "));
          if (commaIdx > maxLen * 0.5) {
            sliceLen = commaIdx + 1;
          }
        }
        finalChunks.push(remaining.slice(0, sliceLen).trim());
        remaining = remaining.slice(sliceLen);
      }
    }
  }
  return finalChunks.filter(c => c.length > 0);
}

export interface MiniMaxTtsOptions {
  apiKey?: string;
  groupId?: string;
  model?: string;
  speed?: number;
  pitch?: number;
  vol?: number;
  voiceId?: string;
  proxyUrl?: string;
  forceDirectTts?: boolean;
}

/**
 * Perform a single segment TTS synthesis
 */
async function fetchSingleTtsSegment(
  text: string,
  options: MiniMaxTtsOptions
): Promise<Blob> {
  const voiceId = options.voiceId || "female-shaonv";
  const speed = options.speed !== undefined ? options.speed : 1.0;
  const vol = options.vol !== undefined ? options.vol : 1.0;
  const pitch = options.pitch !== undefined ? options.pitch : 0;
  const model = options.model || "speech-2.8-hd";

  // Use Custom Cloudflare Worker Proxy or Local backend proxy or direct URL
  let url = "/api/minimax-tts";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.proxyUrl && options.proxyUrl.trim() !== "") {
    url = options.proxyUrl.trim();
  } else if (options.forceDirectTts) {
    // If testing or directly requested without backend, use direct MiniMax URL
    url = `https://api.minimax.chat/v1/t2a_v2?GroupId=${options.groupId || ""}`;
    headers["Authorization"] = `Bearer ${options.apiKey || ""}`;
  }

  const payload = {
    text,
    apiKey: options.apiKey,
    groupId: options.groupId,
    model,
    voiceId,
    speed,
    pitch,
    vol,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const textErr = await response.text();
    throw new Error(`MiniMax合成失败 (${response.status}): ${textErr}`);
  }

  // The endpoint returns binary audio (audio/mpeg)
  return await response.blob();
}

/**
 * Merge multiple blobs of audio/mpeg into one single Blob
 */
async function mergeAudioBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0];
  
  const arrayBuffers = await Promise.all(
    blobs.map(blob => blob.arrayBuffer())
  );
  
  // Calculate total length
  let totalLength = 0;
  for (const buffer of arrayBuffers) {
    totalLength += buffer.byteLength;
  }
  
  // Concatenate buffers
  const mergedUint8 = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of arrayBuffers) {
    mergedUint8.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  
  return new Blob([mergedUint8], { type: "audio/mpeg" });
}

/**
 * Synthesize speech for full text, splitting if necessary, with full IndexedDB caching support.
 */
export async function getSpeechForText(
  text: string,
  options: MiniMaxTtsOptions,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  const cleanedText = cleanBracketActions(text);
  if (!cleanedText) {
    throw new Error("无有效可读台词（过滤括号和动作后文本为空）");
  }

  const voiceId = options.voiceId || "female-shaonv";
  const speed = options.speed !== undefined ? options.speed : 1.0;
  const vol = options.vol !== undefined ? options.vol : 1.0;
  const pitch = options.pitch !== undefined ? options.pitch : 0;
  const model = options.model || "speech-2.8-hd";

  // Check cache first in audioDb
  const cacheKey = `minimax_tts_v3:${voiceId}:${speed}:${pitch}:${vol}:${cleanedText}`;
  try {
    const cachedBlob = await audioDb.getTrackFile(cacheKey);
    if (cachedBlob) {
      console.log("[MiniMax TTS] Play cached speech for key:", cacheKey.substring(0, 80));
      return cachedBlob;
    }
  } catch (err) {
    console.warn("[MiniMax TTS] Failed to read IndexedDB cache:", err);
  }

  onProgress?.("正在合成语音...");

  // Split into chunks if text is long
  const chunks = splitTextIntoChunks(cleanedText, 150);
  if (chunks.length === 0) {
    throw new Error("无有效分段合成台词");
  }

  console.log(`[MiniMax TTS] Synthesizing text in ${chunks.length} segments`);

  const blobs: Blob[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks.length > 1) {
      onProgress?.(`正在合成第 ${i + 1}/${chunks.length} 段语音...`);
    }
    const blob = await fetchSingleTtsSegment(chunks[i], options);
    blobs.push(blob);
  }

  const mergedBlob = await mergeAudioBlobs(blobs);

  // Save to cache
  try {
    await audioDb.saveTrackFile(cacheKey, mergedBlob);
  } catch (err) {
    console.warn("[MiniMax TTS] Failed to save to IndexedDB cache:", err);
  }

  return mergedBlob;
}

/**
 * Request audio playback permission on mobile browsers
 */
export function initAudioContextPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    // Standard AudioContext unlocking sequence
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      resolve(false);
      return;
    }
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      const unlock = () => {
        ctx.resume().then(() => {
          cleanUp();
          resolve(true);
        });
      };
      const cleanUp = () => {
        document.removeEventListener("click", unlock);
        document.removeEventListener("touchstart", unlock);
      };
      document.addEventListener("click", unlock);
      document.addEventListener("touchstart", unlock);
    } else {
      resolve(true);
    }
  });
}
