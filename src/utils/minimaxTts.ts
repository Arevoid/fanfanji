import { audioDb } from "./audioDb";
import { API_REQUEST_TIMEOUTS, fetchWithTimeout } from "./fetchWithTimeout";

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

export interface TtsOptions {
  provider?: "minimax" | "mossland";
  apiEndpoint?: string;
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
export async function fetchSingleTtsSegment(
  text: string,
  options: TtsOptions
): Promise<Blob> {
  if (options.provider === "mossland") {
    const apiEndpoint = options.apiEndpoint?.trim() || "https://api.mosi.cn/v1/audio/speech";
    const apiKey = options.apiKey?.trim();
    const voiceId = options.voiceId?.trim();
    if (!apiKey) throw new Error("请先填写 Mossland API Key");
    if (!voiceId) throw new Error("请先为角色填写 Mossland Voice ID");

    const response = await fetchWithTimeout("/api/mossland-tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiEndpoint,
        apiKey,
        model: options.model || "moss-tts",
        text,
        voiceId,
      }),
    }, API_REQUEST_TIMEOUTS.speechSynthesis);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mossland 合成失败 (${response.status}): ${errorText}`);
    }
    return response.blob();
  }

  const voiceId = options.voiceId || "female-shaonv";
  const speed = options.speed !== undefined ? options.speed : 1.0;
  const vol = options.vol !== undefined ? options.vol : 1.0;
  const pitch = options.pitch !== undefined ? options.pitch : 0;
  const model = options.model || "speech-2.8-hd";

  // Prefer the app proxy so browser CORS policy does not decide whether TTS
  // works. Direct provider access remains available only as an explicit opt-in.
  const isDirectCall = options.forceDirectTts === true;
  
  let url = "/api/minimax-tts";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let payload: any;

  if (isDirectCall) {
    // Call MiniMax API directly as requested: "不需要用 worker 中转 API 密钥，直接填入就行"
    const finalGroupId = (options.groupId || "").trim();
    const finalApiKey = (options.apiKey || "").trim();
    
    url = `https://api.minimax.chat/v1/t2a_v2?GroupId=${finalGroupId}`;
    headers["Authorization"] = `Bearer ${finalApiKey}`;
    
    payload = {
      model,
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: Number(speed),
        vol: Number(vol),
        pitch: Number(pitch),
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
      },
    };
  } else {
    // Proxy through server
    if (options.proxyUrl && options.proxyUrl.trim() !== "") {
      url = options.proxyUrl.trim();
    }
    payload = {
      text,
      apiKey: options.apiKey,
      groupId: options.groupId,
      model,
      voiceId,
      speed,
      pitch,
      vol,
    };
  }

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  }, API_REQUEST_TIMEOUTS.speechSynthesis);

  if (!response.ok) {
    const textErr = await response.text();
    throw new Error(`MiniMax合成失败 (${response.status}): ${textErr}`);
  }

  if (isDirectCall) {
    const data = await response.json();
    if (!data || !data.data || !data.data.audio) {
      const errMsg = data?.base_resp?.status_msg || "未收到有效的语音合成数据";
      throw new Error(`MiniMax合成失败: ${errMsg}`);
    }

    const audioHexOrBase64 = data.data.audio;
    let audioBytes: Uint8Array;
    const isHex = /^[0-9a-fA-F]+$/.test(audioHexOrBase64);
    if (isHex) {
      const len = audioHexOrBase64.length;
      audioBytes = new Uint8Array(len / 2);
      for (let i = 0; i < len; i += 2) {
        audioBytes[i / 2] = parseInt(audioHexOrBase64.substring(i, i + 2), 16);
      }
    } else {
      const binaryString = atob(audioHexOrBase64);
      const len = binaryString.length;
      audioBytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        audioBytes[i] = binaryString.charCodeAt(i);
      }
    }
    return new Blob([audioBytes], { type: "audio/mpeg" });
  } else {
    // The proxy endpoint returns binary audio (audio/mpeg)
    return await response.blob();
  }
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
  options: TtsOptions,
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
  const provider = options.provider || "minimax";
  const endpoint = options.apiEndpoint || "default";
  const cacheKey = `tts_v4:${provider}:${endpoint}:${model}:${voiceId}:${speed}:${pitch}:${vol}:${cleanedText}`;
  try {
    const cachedBlob = await audioDb.getTrackFile(cacheKey);
    if (cachedBlob) {
      console.log("[TTS] Play cached speech for key:", cacheKey.substring(0, 80));
      return cachedBlob;
    }
  } catch (err) {
    console.warn("[TTS] Failed to read IndexedDB cache:", err);
  }

  onProgress?.("正在合成语音...");

  // Split into chunks if text is long
  const chunks = splitTextIntoChunks(cleanedText, 150);
  if (chunks.length === 0) {
    throw new Error("无有效分段合成台词");
  }

  console.log(`[TTS] Synthesizing text in ${chunks.length} segments`);

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
    console.warn("[TTS] Failed to save to IndexedDB cache:", err);
  }

  return mergedBlob;
}
