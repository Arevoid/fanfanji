export interface VoiceMessagePayload {
  seconds: string;
  transcript: string;
}

export function parseVoiceMessagePayload(content: string): VoiceMessagePayload | null {
  if (!content.startsWith("[语音]|")) return null;
  const parts = content.split("|");
  return {
    seconds: parts[1] || "5",
    transcript: parts.slice(2).join("|").trim(),
  };
}

export function formatVoiceMessageHistory(content: string): string | null {
  const voice = parseVoiceMessagePayload(content);
  if (!voice) return null;
  return voice.transcript
    ? `[语音消息，${voice.seconds}秒；准确转写，与前后文字属于同一段对话]\n${voice.transcript}`
    : `[语音消息，${voice.seconds}秒；未提供可确认的转写，与前后文字属于同一段对话]`;
}

export function formatCurrentVoiceMessagePrompt(content: string): string | null {
  const voice = parseVoiceMessagePayload(content);
  if (!voice) return null;
  if (!voice.transcript) {
    return `[USER VOICE MESSAGE — SAME CONVERSATION]
The user sent a ${voice.seconds}-second voice message without a confirmed transcript. Voice is only the delivery medium: this is the next turn of the existing conversation, not a new conversation or a topic reset. Continue from the immediately preceding messages when possible; otherwise ask naturally without inventing what the user said.`;
  }
  return `[USER VOICE MESSAGE — SAME CONVERSATION]
Voice is only the delivery medium. The transcript below is the user's newest message in the existing conversation; it does not start a new topic or reset the preceding context.
Continue from the immediately preceding messages and respond to the transcript's conversational intent in that context. Do not merely repeat, imitate, or paraphrase the transcript.
Exact transcript (${voice.seconds} seconds):
${voice.transcript}`;
}
