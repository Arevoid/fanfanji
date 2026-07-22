import type { Message } from "../../types";

export interface RecentConversationContext {
  recentMessages: Message[];
  lastUserMessage?: Message;
  lastCharacterMessage?: Message;
  minutesSinceLastMessage?: number;
  likelyUnfinished: boolean;
  continuationHints: string[];
}

const ENDING_PATTERN = /(晚安|早点休息|睡吧|再见|拜拜|回头聊|下次聊|先这样|明天见)/;
const WAITING_PATTERN = /(等会儿|等一下|明天.*(?:告诉|说|聊)|回来.*(?:告诉|说|聊)|晚点.*(?:说|聊)|待会)/;
const QUESTION_PATTERN = /[？?]|(怎么|什么|为何|为什么|能不能|可不可以|要不要|好吗|行吗|有没有|几点)/;
const EMOTION_PATTERN = /(难过|伤心|委屈|生气|担心|害怕|失落|烦|哭|不舒服|难受|吵架)/;

function isConversationMessage(message: Message, characterId: string): boolean {
  return message.characterId === characterId
    && !message.isOffline
    && !message.isNarration
    && message.sender !== undefined
    && !message.content.startsWith("[System");
}

export function analyzeRecentConversation(
  messages: Message[],
  characterId: string,
  now: Date = new Date(),
  limit = 12
): RecentConversationContext {
  const recentMessages = messages
    .filter((message) => isConversationMessage(message, characterId))
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-limit);
  const lastMessage = recentMessages.at(-1);
  const lastUserMessage = [...recentMessages].reverse().find((message) => message.sender === "user");
  const lastCharacterMessage = [...recentMessages].reverse().find((message) => message.sender === "character");
  const minutesSinceLastMessage = lastMessage
    ? Math.max(0, Math.floor((now.getTime() - lastMessage.timestamp) / 60000))
    : undefined;
  const lastContent = lastMessage?.content || "";
  const recentText = recentMessages.map((message) => message.content).join("\n");
  const hasRecentEnding = ENDING_PATTERN.test(recentMessages.slice(-2).map((message) => message.content).join("\n"));
  const isRecentEnough = minutesSinceLastMessage !== undefined && minutesSinceLastMessage <= 12 * 60;
  const hasWaitingItem = WAITING_PATTERN.test(recentText);
  const hints: string[] = [];

  if (lastMessage?.sender === "user" && QUESTION_PATTERN.test(lastContent)) {
    hints.push("用户最后一条消息是问题或请求，优先自然回应其中实际内容。");
  }
  if (lastMessage?.sender === "character" && QUESTION_PATTERN.test(lastContent)) {
    hints.push("角色上一条提出了问题，用户尚未回答；可自然追问，但不要重复原句。");
  }
  if (hasWaitingItem) hints.push("最近对话包含明确等待、约定或后续事项，可自然关心进展。");
  if (EMOTION_PATTERN.test(recentText)) hints.push("最近对话包含未缓解的情绪线索，可优先表达关心。");
  if (hasRecentEnding) hints.push("最近对话有明确结束语，不要强行继续旧话题。");
  if (minutesSinceLastMessage !== undefined) hints.push(`距上一条实际消息约 ${minutesSinceLastMessage} 分钟。`);

  const likelyUnfinished = !hasRecentEnding && (
    (isRecentEnough && Boolean(lastMessage) && (QUESTION_PATTERN.test(lastContent) || EMOTION_PATTERN.test(recentText)))
    || hasWaitingItem
  );

  return { recentMessages, lastUserMessage, lastCharacterMessage, minutesSinceLastMessage, likelyUnfinished, continuationHints: hints };
}

export function formatProactiveConversationGuidance(context: RecentConversationContext): string {
  if (context.recentMessages.length === 0) {
    return "[最近对话状态]\n没有可安全引用的当前单聊记录；可按人设自然开启话题，不要虚构旧话题。";
  }

  const decision = context.likelyUnfinished
    ? "最近对话可能未结束：优先自然延续实际存在的问题、约定或情绪；不要重复原句，也不要生硬地说“继续刚才的话题”。"
    : "最近对话已结束、间隔较久或信息不足：可自然问候后按人设开启新话题；不要强行续接旧话题。";
  const lastUser = context.lastUserMessage ? `用户最后一条：${context.lastUserMessage.content}` : "用户最后一条：无";
  const lastCharacter = context.lastCharacterMessage ? `角色最后一条：${context.lastCharacterMessage.content}` : "角色最后一条：无";

  return `[最近对话状态]\n${decision}\n${lastUser}\n${lastCharacter}\n${context.continuationHints.map((hint) => `- ${hint}`).join("\n")}\n只能依据以上实际历史，不得虚构双方讨论过的内容。`;
}
