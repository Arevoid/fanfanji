export interface VoiceMessagePreview {
  duration: number;
  transcript: string;
}

/**
 * Reads both the persisted voice markup and the older human-readable voice
 * format. The transcript is the only text that should be sent to translation;
 * the [语音]|duration| wrapper is a delivery detail, not message content.
 */
export function getVoiceMessagePreview(content: string, fallbackDuration?: number): VoiceMessagePreview {
  const normalized = content.trim();
  const safeFallback = Number.isFinite(fallbackDuration) && (fallbackDuration || 0) > 0
    ? Math.max(1, Math.round(fallbackDuration as number))
    : 3;
  if (normalized.startsWith("[语音]|")) {
    const parts = normalized.split("|");
    const parsedDuration = Number.parseInt(parts[1] || "", 10);
    return {
      duration: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : safeFallback,
      transcript: parts.slice(2).join("|").trim(),
    };
  }
  if (!normalized.startsWith("[语音")) {
    return { duration: safeFallback, transcript: normalized };
  }

  const matchWithDuration = normalized.match(/^\[语音:\s*(?:"([^"]+)"|(.+?))\s*\((\d+)(?:秒|s)\)\]/i);
  if (matchWithDuration) {
    return {
      duration: Math.max(1, Number.parseInt(matchWithDuration[3] || "", 10) || safeFallback),
      transcript: (matchWithDuration[1] || matchWithDuration[2] || "").trim(),
    };
  }
  const matchWithQuotedText = normalized.match(/^\[语音:\s*"([^"]+)"\]/i);
  if (matchWithQuotedText) {
    const transcript = matchWithQuotedText[1].trim();
    return { duration: Math.max(1, Math.min(60, Math.ceil(transcript.length * 0.35 + 1.2))), transcript };
  }
  const cleaned = normalized
    .replace(/^\[语音\]\s*/, "")
    .replace(/^\[语音:\s*/, "")
    .replace(/\]$/, "")
    .trim();
  return {
    duration: Math.max(1, Math.min(60, Math.ceil(cleaned.length * 0.35 + 1.2))) || safeFallback,
    transcript: cleaned,
  };
}

export const isVoiceMessageContent = (content: string, isVoiceMessage = false, hasAudioUrl = false): boolean => (
  isVoiceMessage || hasAudioUrl || content.trim().startsWith("[语音")
);
