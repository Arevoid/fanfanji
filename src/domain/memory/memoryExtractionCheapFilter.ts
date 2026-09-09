export type MemoryExtractionCheapFilterReason =
  | "empty_batch"
  | "unsupported_input"
  | "reaction_only"
  | "acknowledgement_only"
  | "greeting_only"
  | "repetition_only"
  | "possible_memory_value"
  | "uncertain";

export type MemoryExtractionCheapFilterResult =
  | { decision: "skip"; reason: Exclude<MemoryExtractionCheapFilterReason, "unsupported_input" | "possible_memory_value" | "uncertain"> }
  | { decision: "extract"; reason: Extract<MemoryExtractionCheapFilterReason, "unsupported_input" | "possible_memory_value" | "uncertain"> };

export interface MemoryExtractionCheapFilterMessage {
  sender: "user" | "character";
  content: string;
  imageAssetId?: string;
  isVoiceMessage?: boolean;
}

const ACKNOWLEDGEMENTS = new Set([
  "好", "好啊", "好呀", "好的", "好吧", "好耶", "嗯", "嗯嗯", "哦", "哦哦", "行", "行啊", "可以",
  "没问题", "收到", "知道了", "ok", "okay", "yes", "yep", "sure", "got it", "lol", "哈哈", "哈哈哈",
  "哈哈哈哈", "笑死",
]);

const GREETINGS = new Set([
  "早", "早安", "早上好", "晚上好", "晚安", "谢谢", "谢谢你", "不客气",
]);

/**
 * These are deliberately broad safety guards rather than a memory classifier.
 * A match means “do not skip”; an unknown sentence always extracts.
 */
const POSSIBLE_MEMORY_VALUE = /(?:怀孕|生孩子|孩子|分手|离婚|结婚|告白|表白|喜欢你|爱你|失恋|去世|过世|死亡|死了|住院|受伤|骨折|手术|搬家|搬到|旅行|出国|辞职|换工作|上学|毕业|转学|明天|今晚|下个月|周末|预约|约会|见面|答应|承诺|生日|爸爸|妈妈|父母|女儿|儿子|猫|狗|宠物|我喜欢|我不喜欢|我不吃|过敏|来自|住在|职业|名字|叫|可能|也许|或许|觉得|心情|烦|累|难过|焦虑|害怕|吵架)/u;

const EMOJI_ONLY = /^(?:[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]|[!！?？。.,，、~～])+$/u;
const stripCourtesyPunctuation = (value: string): string => value
  .trim()
  .toLocaleLowerCase()
  .replace(/[\s\u3000!！?？。.,，、~～…]+$/gu, "")
  .replace(/^[\s\u3000!！?？。.,，、~～…]+/gu, "");

const skip = (reason: Exclude<MemoryExtractionCheapFilterReason, "unsupported_input" | "possible_memory_value" | "uncertain">): MemoryExtractionCheapFilterResult => ({
  decision: "skip",
  reason,
});

const extract = (reason: Extract<MemoryExtractionCheapFilterReason, "unsupported_input" | "possible_memory_value" | "uncertain">): MemoryExtractionCheapFilterResult => ({
  decision: "extract",
  reason,
});

/**
 * Batch-level, deterministic, high-precision skip decision. It has no access
 * to storage, Prompt, Provider, React, or semantic memory state.
 */
export function evaluateMemoryExtractionCheapFilter(input: unknown): MemoryExtractionCheapFilterResult {
  if (!Array.isArray(input)) return extract("unsupported_input");
  if (input.length === 0) return skip("empty_batch");
  const messages: MemoryExtractionCheapFilterMessage[] = [];
  for (const value of input) {
    if (!value || typeof value !== "object") return extract("unsupported_input");
    const record = value as Record<string, unknown>;
    if ((record.sender !== "user" && record.sender !== "character") || typeof record.content !== "string") {
      return extract("unsupported_input");
    }
    // A media-only or voice-only record is intentionally uncertain: this
    // filter cannot inspect the binary payload or audio semantics.
    if (!record.content.trim() && (record.imageAssetId || record.isVoiceMessage)) return extract("uncertain");
    messages.push({
      sender: record.sender,
      content: record.content,
      ...(typeof record.imageAssetId === "string" ? { imageAssetId: record.imageAssetId } : {}),
      ...(record.isVoiceMessage === true ? { isVoiceMessage: true } : {}),
    });
  }

  if (!messages.some((message) => message.content.trim())) return skip("empty_batch");
  // An assistant-only batch can contain a promise, plan, event, or signal that
  // the user did not author. Without an ownership decision, fail open.
  if (!messages.some((message) => message.sender === "user")) return extract("uncertain");

  const normalized = messages.map((message) => stripCourtesyPunctuation(message.content));
  const nonEmpty = normalized.filter(Boolean);
  if (nonEmpty.some((text) => POSSIBLE_MEMORY_VALUE.test(text))) return extract("possible_memory_value");

  const reactionOnly = nonEmpty.length > 0 && nonEmpty.every((text) => EMOJI_ONLY.test(text));
  if (reactionOnly) return skip("reaction_only");

  const acknowledgementOnly = nonEmpty.length > 0 && nonEmpty.every((text) => ACKNOWLEDGEMENTS.has(text));
  if (acknowledgementOnly) {
    const unique = new Set(nonEmpty);
    return skip(unique.size === 1 && nonEmpty.length > 1 ? "repetition_only" : "acknowledgement_only");
  }

  const greetingOnly = nonEmpty.length > 0 && nonEmpty.every((text) => GREETINGS.has(text));
  if (greetingOnly) return skip("greeting_only");

  // Any remaining content is not provably low-value. This includes questions,
  // ordinary small talk, unknown languages, and mixed media/text batches.
  return extract("uncertain");
}
