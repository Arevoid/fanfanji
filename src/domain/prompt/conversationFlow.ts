import type { Message } from "../../types";

/**
 * A request-time-only description of the current conversational thread.
 *
 * This is intentionally derived from the short chat history on every turn.
 * It is not persisted, does not become Memory, and does not alter
 * Relationship or Truth Layer data.
 */
export type ConversationTopicState = "active" | "naturally-completed" | "needs-follow-up";

export interface ConversationFlowAnalysis {
  state: ConversationTopicState;
  repeatedTopicTurns: number;
  repeatedEmotionTurns: number;
  shouldTransition: boolean;
  transitionSuggestions: readonly string[];
}

const QUESTION_PATTERN = /[?？]|(怎么|什么|为何|为什么|能不能|可不可以|要不要|好吗|行吗|有没有|几点|谁|哪儿|哪里)/;
const FOLLOW_UP_PATTERN = /(等会儿|等一下|明天.*(?:告诉|说|聊)|回来.*(?:告诉|说|聊)|晚点.*(?:说|聊)|待会|记得|别忘了)/;
const CLOSING_PATTERN = /(晚安|早点休息|睡吧|先睡|再见|拜拜|回头聊|下次聊|先这样|明天见|好啦|好了|好的|好吧|行了|知道了|收到|谢谢|哈哈|嘿嘿|呵呵|笑死)/;
const EMOTION_TERMS = [
  "难过", "伤心", "委屈", "生气", "担心", "害怕", "失落", "烦", "哭", "不舒服", "难受", "吵架",
  "想你", "想念", "喜欢", "讨厌", "开心", "高兴", "心疼", "紧张", "害羞", "孤单",
] as const;
const TOPIC_ANCHORS = ["等", "陪", "睡", "等待", "承诺", "答应", "骗", "迟到", "吵架", "见面", "吃饭", "工作", "考试", "消息", "电话"] as const;

const STOP_WORDS = new Set([
  "这个", "那个", "然后", "就是", "还是", "真的", "你说", "我说", "觉得", "可以",
  "我们", "你们", "因为", "所以", "自己", "一下", "什么", "怎么", "已经", "没有", "不是", "不是吗",
]);

function isConversationMessage(message: Message, characterId: string): boolean {
  return message.characterId === characterId
    && !message.isOffline
    && !message.isNarration
    && message.sender !== undefined
    && !message.content.startsWith("[System");
}

function normalizeText(value: string): string {
  return value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[（）()“”"「」*]/g, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
}

function topicTerms(value: string): Set<string> {
  const normalized = normalizeText(value);
  if (!normalized) return new Set();
  const terms = new Set<string>();
  for (const word of normalized.match(/[a-z0-9_]{3,}/g) ?? []) {
    if (!STOP_WORDS.has(word)) terms.add(word);
  }
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const bigram = normalized.slice(index, index + 2);
    if (!STOP_WORDS.has(bigram)) terms.add(bigram);
  }
  return terms;
}

function similarity(left: string, right: string): number {
  const leftTerms = topicTerms(left);
  const rightTerms = topicTerms(right);
  if (leftTerms.size === 0 || rightTerms.size === 0) return 0;
  let intersection = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) intersection += 1;
  return intersection / (leftTerms.size + rightTerms.size - intersection);
}

function isRelatedTopic(left: string, right: string): boolean {
  const score = similarity(left, right);
  const leftTerms = topicTerms(left);
  const rightTerms = topicTerms(right);
  const sharedTerms = [...leftTerms].filter((term) => rightTerms.has(term));
  return (score >= 0.12 && sharedTerms.length >= 2)
    || (score >= 0.08 && sharedTerms.some((term) => term.length >= 2 && TOPIC_ANCHORS.some((anchor) => term.includes(anchor))));
}

function topicAnchors(value: string): Set<string> {
  const normalized = normalizeText(value);
  return new Set(TOPIC_ANCHORS.filter((anchor) => normalized.includes(anchor)));
}

function emotionSignatures(value: string): string[] {
  return EMOTION_TERMS.filter((term) => value.includes(term));
}

function isShortAcknowledgement(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized.length > 0 && normalized.length <= 8 && CLOSING_PATTERN.test(value);
}

function countRepeatedTopicTurns(messages: readonly Message[]): number {
  const substantive = messages
    .map((message) => message.content.trim())
    .filter((content) => normalizeText(content).length >= 4 && !isShortAcknowledgement(content));
  if (substantive.length === 0) return 0;

  // Compare adjacent substantive messages rather than comparing everything to
  // the final sentence. This catches natural paraphrases across alternating
  // user/character turns (the last reply may omit one of the original words).
  let repeatedMessages = 1;
  const knownAnchors = topicAnchors(substantive.at(-1) ?? "");
  for (let index = substantive.length - 1; index > 0; index -= 1) {
    const left = substantive[index];
    const right = substantive[index - 1];
    const rightAnchors = topicAnchors(right);
    const sharesKnownAnchor = [...rightAnchors].some((anchor) => knownAnchors.has(anchor));
    if (isRelatedTopic(left, right) || sharesKnownAnchor || normalizeText(left) === normalizeText(right)) {
      repeatedMessages += 1;
      rightAnchors.forEach((anchor) => knownAnchors.add(anchor));
    } else break;
  }

  // A user/character exchange is one conversational turn. Round up so a
  // single message still counts as one turn and three repeated replies become
  // the explicit three-turn guardrail.
  return repeatedMessages > 0 ? Math.max(1, Math.ceil(repeatedMessages / 2)) : 0;
}

function countRepeatedEmotionTurns(messages: readonly Message[]): number {
  const signatures = messages
    .map((message) => emotionSignatures(normalizeText(message.content)))
    .filter((items) => items.length > 0);
  const latest = signatures.at(-1);
  if (!latest) return 0;

  let repeatedMessages = 0;
  for (let index = signatures.length - 1; index >= 0; index -= 1) {
    if (signatures[index].some((term) => latest.includes(term))) repeatedMessages += 1;
    else break;
  }
  return repeatedMessages > 0 ? Math.max(1, Math.ceil(repeatedMessages / 2)) : 0;
}

/**
 * Derives short-term topic flow for one direct-chat turn.
 *
 * The function only reads the supplied online messages. It never reads or
 * writes Memory, Relationship, CharacterEvent, or any other long-lived store.
 */
export function analyzeConversationFlow(
  messages: readonly Message[],
  characterId: string,
  limit = 12,
): ConversationFlowAnalysis {
  const recentMessages = messages
    .filter((message) => isConversationMessage(message, characterId))
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-limit);
  const lastMessage = recentMessages.at(-1);
  const lastContent = lastMessage?.content.trim() ?? "";
  const repeatedTopicTurns = countRepeatedTopicTurns(recentMessages);
  const repeatedEmotionTurns = countRepeatedEmotionTurns(recentMessages);
  const hasQuestion = QUESTION_PATTERN.test(lastContent);
  const hasFollowUp = FOLLOW_UP_PATTERN.test(lastContent);
  const hasExplicitClosure = CLOSING_PATTERN.test(lastContent) && !hasQuestion;

  let state: ConversationTopicState = "active";
  if (lastMessage?.sender === "character" && (hasQuestion || hasFollowUp)) {
    state = "needs-follow-up";
  } else if (hasExplicitClosure || repeatedTopicTurns >= 3 || repeatedEmotionTurns >= 3) {
    state = "naturally-completed";
  }

  const shouldTransition = state === "naturally-completed"
    || repeatedTopicTurns >= 3
    || repeatedEmotionTurns >= 3;

  return {
    state,
    repeatedTopicTurns,
    repeatedEmotionTurns,
    shouldTransition,
    transitionSuggestions: [
      "用户当前状态或正在做的事",
      "今天发生的小事",
      "角色此刻符合人设的想法",
      "一个轻量、自然的新话题",
    ],
  };
}
