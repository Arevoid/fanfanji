export type TtsEmotion =
  | "happy"
  | "playful"
  | "sad"
  | "angry"
  | "anxious"
  | "affectionate"
  | "neutral";

export type TtsEmotionIntensity = "natural" | "clear" | "strong";

export const ELEVENLABS_AUDIO_TAG_MODELS = new Set([
  "eleven_v3",
  "eleven_v4",
  "eleven_v4_turbo",
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
  { emotion: "sad", pattern: /(难过|伤心|委屈|失落|想哭|哭了|难受|心酸|遗憾)/ },
  { emotion: "anxious", pattern: /(担心|害怕|紧张|焦虑|不安|睡不着|慌|忐忑|急)/ },
  { emotion: "affectionate", pattern: /(想你|想念|喜欢|爱你|抱抱|亲亲|宝宝|宝贝|老公|老婆|乖乖|摸摸)/ },
  { emotion: "playful", pattern: /(哼|才不|略略|逗你|笨蛋|坏蛋|调皮|撒娇|嘿嘿|哈哈)/ },
  { emotion: "happy", pattern: /(开心|高兴|好耶|笑死|乐死|快乐|太好了|恭喜|成功)/ },
];

export function supportsElevenLabsAudioTags(model?: string): boolean {
  return ELEVENLABS_AUDIO_TAG_MODELS.has((model || "").trim().toLowerCase());
}

export function supportsTtsEmotion(provider?: string, model?: string): boolean {
  return provider === "elevenlabs" && supportsElevenLabsAudioTags(model);
}

export function normalizeTtsEmotion(value: unknown): TtsEmotion {
  return value === "happy" || value === "playful" || value === "sad" || value === "angry"
    || value === "anxious" || value === "affectionate"
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
    if (emotion === "happy") return "excited";
  }
  const tags: Record<Exclude<TtsEmotion, "neutral">, string> = {
    happy: "happy",
    playful: "mischievously",
    sad: "sad",
    angry: "angry",
    anxious: "worried",
    affectionate: "affectionate",
  };
  return tags[emotion];
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
  const supportsTags = supportsTtsEmotion(options.provider, options.model);
  if (!supportsTags || options.emotionEnabled !== true) return cleanTtsText(text, false);
  const cleaned = cleanTtsText(text, true);
  const tag = emotionTagForTts(
    normalizeTtsEmotion(options.emotion),
    options.emotionIntensity || "natural",
  );
  if (!tag) return cleaned;
  return `[${tag}] ${removeLeadingAudioTags(cleaned)}`.trim();
}
