export type TtsEmotion =
  | "happy"
  | "excited"
  | "playful"
  | "surprised"
  | "embarrassed"
  | "reassuring"
  | "sad"
  | "disappointed"
  | "angry"
  | "anxious"
  | "affectionate"
  | "neutral";

export type TtsEmotionIntensity = "natural" | "clear" | "strong";
export type TtsDeliveryStyle = "warm" | "serious" | "restrained" | "cold" | "low" | "whisper";
export type TtsProvider = "minimax" | "mossland" | "elevenlabs";
export type TtsEmotionCapability = "native" | "interjection" | "approximate" | "none";

export const ELEVENLABS_AUDIO_TAG_MODELS = new Set([
  "eleven_v3",
  "eleven_v4",
  "eleven_v4_turbo",
]);

export const MINIMAX_INTERJECTION_MODELS = new Set([
  "speech-2.8-hd",
  "speech-2.8-turbo",
]);

export const MOSSLAND_APPROXIMATE_MODELS = new Set([
  "moss-tts",
  "moss-tts-1.5-flash",
  "moss-tts-1.0-pro",
  "moss-tts-1.5-flash-2026-06-26",
  "moss-tts-1.0-pro-2026-02-07",
]);

const AUDIO_TAG_PATTERN = /\[([^\]]+)\]/g;
const LEADING_AUDIO_TAG_PATTERN = /^\s*(?:(\[[^\]]+\])\s*)+/;
const ALLOWED_AUDIO_TAGS = new Set([
  "happy", "sad", "angry", "excited", "worried", "anxious", "affectionate",
  "mischievously", "curious", "calm", "reassuring", "gently", "whispers",
  "whispering", "shouts", "laughs", "crying", "sighs", "gasps", "clears throat",
]);

const EMOTION_PATTERNS: readonly { emotion: Exclude<TtsEmotion, "neutral">; pattern: RegExp }[] = [
  { emotion: "angry", pattern: /(生气|气死|火大|烦死|讨厌|别理|吵架|滚|烦|愤怒)/ },
  { emotion: "disappointed", pattern: /(失望|落空|没想到|白等|遗憾|可惜)/ },
  { emotion: "sad", pattern: /(难过|伤心|委屈|想哭|哭了|难受|心酸)/ },
  { emotion: "anxious", pattern: /(担心|害怕|紧张|焦虑|不安|睡不着|慌|忐忑|急)/ },
  { emotion: "embarrassed", pattern: /(害羞|不好意思|脸红|羞|尴尬|被夸)/ },
  { emotion: "surprised", pattern: /(没想到|真的假的|不会吧|居然|竟然|惊讶|吓一跳)/ },
  { emotion: "affectionate", pattern: /(想你|想念|喜欢|爱你|抱抱|亲亲|宝宝|宝贝|老公|老婆|乖乖|摸摸)/ },
  { emotion: "playful", pattern: /(哼|才不|略略|逗你|笨蛋|坏蛋|调皮|撒娇|嘿嘿|哈哈)/ },
  { emotion: "excited", pattern: /(激动|兴奋|迫不及待|太期待|冲呀|好耶)/ },
  { emotion: "reassuring", pattern: /(放心|安心|没事的|别担心|我在|会陪你|没关系)/ },
  { emotion: "happy", pattern: /(开心|高兴|笑死|乐死|快乐|太好了|恭喜|成功)/ },
];

export function supportsElevenLabsAudioTags(model?: string): boolean {
  return ELEVENLABS_AUDIO_TAG_MODELS.has((model || "").trim().toLowerCase());
}

export function getTtsEmotionCapability(provider?: string, model?: string): TtsEmotionCapability {
  const normalizedProvider = (provider || "").trim().toLowerCase();
  const normalizedModel = (model || "").trim().toLowerCase();
  if (normalizedProvider === "elevenlabs" && supportsElevenLabsAudioTags(normalizedModel)) return "native";
  if (normalizedProvider === "minimax" && MINIMAX_INTERJECTION_MODELS.has(normalizedModel)) return "interjection";
  if (normalizedProvider === "mossland" && MOSSLAND_APPROXIMATE_MODELS.has(normalizedModel)) return "approximate";
  return "none";
}

export function supportsTtsEmotion(provider?: string, model?: string): boolean {
  return getTtsEmotionCapability(provider, model) !== "none";
}

export function normalizeTtsEmotion(value: unknown): TtsEmotion {
  return value === "happy" || value === "excited" || value === "playful" || value === "surprised"
    || value === "embarrassed" || value === "reassuring" || value === "sad" || value === "disappointed"
    || value === "angry" || value === "anxious" || value === "affectionate"
    ? value
    : "neutral";
}

export function inferTtsEmotion(text: string): TtsEmotion {
  const normalized = text.trim();
  if (!normalized) return "neutral";
  return EMOTION_PATTERNS.find(({ pattern }) => pattern.test(normalized))?.emotion || "neutral";
}

export function emotionTagForTts(
  emotion: TtsEmotion,
  intensity: TtsEmotionIntensity = "natural",
): string | undefined {
  if (emotion === "neutral") return undefined;
  if (intensity === "strong") {
    if (emotion === "angry") return "shouts";
    if (emotion === "sad") return "crying";
    if (emotion === "happy" || emotion === "excited") return "excited";
    if (emotion === "surprised") return "gasps";
  }
  const tags: Record<Exclude<TtsEmotion, "neutral">, string> = {
    happy: "happy",
    excited: "excited",
    playful: "mischievously",
    surprised: "gasps",
    embarrassed: "whispers",
    reassuring: "reassuring",
    sad: "sad",
    disappointed: "sad",
    angry: "angry",
    anxious: "worried",
    affectionate: "affectionate",
  };
  return tags[emotion];
}

function minimaxInterjectionForEmotion(emotion: TtsEmotion, intensity: TtsEmotionIntensity): string | undefined {
  if (emotion === "neutral") return undefined;
  if (emotion === "surprised") return "(gasps)";
  if (emotion === "sad" || emotion === "disappointed") return "(sighs)";
  if (emotion === "anxious" || emotion === "embarrassed") return "(breath)";
  if (emotion === "playful") return "(chuckle)";
  if (emotion === "excited" || (emotion === "happy" && intensity === "strong")) return "(laughs)";
  if (emotion === "happy" || emotion === "affectionate" || emotion === "reassuring") return "(chuckle)";
  if (emotion === "angry") return intensity === "strong" ? "(groans)" : "(clear-throat)";
  return undefined;
}

function mosslandApproximateText(text: string, emotion: TtsEmotion, intensity: TtsEmotionIntensity): string {
  if (emotion === "neutral") return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (emotion === "sad" || emotion === "disappointed" || emotion === "anxious") {
    return `……${trimmed}`;
  }
  if (emotion === "excited" || (emotion === "happy" && intensity === "strong")) {
    return /[!?！？。]$/.test(trimmed) ? trimmed.replace(/[。]$/, "！") : `${trimmed}！`;
  }
  if (emotion === "surprised") {
    return /[!?！？]$/.test(trimmed) ? trimmed : `${trimmed}？`;
  }
  return trimmed;
}

function normalizeAudioTag(value: string): string | undefined {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return ALLOWED_AUDIO_TAGS.has(normalized) ? normalized : undefined;
}

function protectAudioTags(text: string): { value: string; tags: string[] } {
  const tags: string[] = [];
  const value = text.replace(AUDIO_TAG_PATTERN, (full, rawTag: string) => {
    const normalized = normalizeAudioTag(rawTag);
    if (!normalized) return "";
    const index = tags.push(`[${normalized}]`) - 1;
    return `\uE000${index}\uE001`;
  });
  return { value, tags };
}

/** Removes ordinary action markup while preserving only approved ElevenLabs tags. */
export function cleanTtsText(text: string, preserveAudioTags = false): string {
  if (!text) return "";
  const protectedValue = preserveAudioTags ? protectAudioTags(text) : { value: text, tags: [] };
  let cleaned = protectedValue.value
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\*[^*]+\*/g, "")
    .trim();
  if (preserveAudioTags) {
    cleaned = cleaned.replace(/\uE000(\d+)\uE001/g, (_full, index: string) => protectedValue.tags[Number(index)] || "");
  }
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

function removeLeadingAudioTags(text: string): string {
  return text.replace(LEADING_AUDIO_TAG_PATTERN, "").trim();
}

export interface TtsEmotionTextOptions {
  provider?: string;
  model?: string;
  emotion?: TtsEmotion;
  emotionIntensity?: TtsEmotionIntensity;
  emotionEnabled?: boolean;
}

/** Builds the provider-facing text; this value must never be shown as chat content. */
export function buildTtsSynthesisText(text: string, options: TtsEmotionTextOptions = {}): string {
  const capability = getTtsEmotionCapability(options.provider, options.model);
  if (capability === "none" || options.emotionEnabled !== true) return cleanTtsText(text, false);
  const cleaned = cleanTtsText(text, capability === "native");
  const emotion = normalizeTtsEmotion(options.emotion);
  const intensity = options.emotionIntensity || "natural";
  if (capability === "interjection") {
    const cue = minimaxInterjectionForEmotion(emotion, intensity);
    return cue ? `${cue} ${removeLeadingAudioTags(cleaned)}`.trim() : cleaned;
  }
  if (capability === "approximate") return mosslandApproximateText(cleaned, emotion, intensity);
  const tag = emotionTagForTts(
    emotion,
    intensity,
  );
  if (!tag) return cleaned;
  return `[${tag}] ${removeLeadingAudioTags(cleaned)}`.trim();
}
