/**
 * Explicit user requests for a real call should open the existing call UI.
 * This is intentionally narrow: ordinary mentions of a phone or a call, and
 * requests to avoid a call, must remain ordinary chat text.
 */
const EXPLICIT_CALL_REQUEST_PATTERN = /(?:打吧|打电话(?:给我|过来|吧|啊|呀|呗)?|拨电话(?:给我|过来|吧|啊|呀|呗)?|给(?:我|你|您)(?:打|拨)(?:个|一下)?电话|跟我(?:打|聊|通)电话|和我(?:打|聊|通)电话|打过来|拨过来|来(?:个|一下)?电话|(?:语音|视频)通话(?:吧|啊|呀|呗)?)/u;
const CALL_NEGATION_PATTERN = /(?:不要|别(?:再)?|不用|不想|无需|拒绝|先别|暂时别|晚点|等会儿?|以后|明天)/u;
const INDIRECT_CALL_CONTEXT_PATTERN = /^(?:我|他|她|朋友|同事|家人)[^。！？!?]{0,12}(?:打|拨)电话/u;

export function isExplicitVoiceCallRequest(text: string): boolean {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized || normalized.length > 120 || CALL_NEGATION_PATTERN.test(normalized)) return false;
  // Do not turn a statement about somebody calling a third party into a
  // call UI. Direct second-person requests ("给你/给我") remain eligible.
  if (INDIRECT_CALL_CONTEXT_PATTERN.test(normalized) && !/(?:给我|给你|给您|跟我|和我)/u.test(normalized)) return false;
  return EXPLICIT_CALL_REQUEST_PATTERN.test(normalized);
}
