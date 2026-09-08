import type { Message } from "../../../types";
import { describeHistoricalRelativeTime, formatHistoricalMessageForPrompt } from "../../../domain/prompt/historyTimeContext";
import { buildCrossDayHistoricalReferencePrompt, partitionDirectChatHistoryByCurrentDay, shouldUseCrossDayHistoryBoundary } from "../prompts/directChatTurnPrompt";
import { serializeMessageContentForPrompt, serializeMessageToPromptTurns } from "../prompts/messagePromptSerializer";
import { formatWeChatTimestamp } from "./chatTime";
import { DEFAULT_CHAT_CONTEXT_MEMORY_LIMIT, MAX_CHAT_CONTEXT_MEMORY_LIMIT } from "./chatMemoryRetrievalSettings";

const DEFAULT_HISTORY_CHARACTER_LIMIT = 16_000;
const DEFAULT_HISTORICAL_REFERENCE_CHARACTER_LIMIT = 6_000;

function selectRecentMessagesWithinBudget(
  messages: readonly Message[],
  characterLimit: number,
  characterName: string,
  userName: string,
): Message[] {
  if (messages.length === 0) return [];
  const selected: Message[] = [];
  let usedCharacters = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const serialized = serializeMessageContentForPrompt(message, {
      mode: "history", userName, characterName, includeCallTranscript: false,
    });
    const cost = Math.max(1, serialized.length + 32);
    // Always keep the newest message, even if it is larger than the budget;
    // dropping the latest turn is more damaging than exceeding the soft cap.
    if (selected.length > 0 && usedCharacters + cost > characterLimit) break;
    selected.unshift(message);
    usedCharacters += cost;
  }
  return selected;
}

export function buildDirectChatHistoryContext(input: {
  messages: readonly Message[];
  userMessageId?: string;
  userMessageAt?: number;
  enableTimeAwareness: boolean;
  contextLimit: number;
  /** Soft prompt budget for recent chat history, measured in characters. */
  historyCharacterLimit?: number;
  /** Soft prompt budget for the older cross-day reference, measured in characters. */
  historicalReferenceCharacterLimit?: number;
  characterName: string;
  userName: string;
  requestTime?: Date;
}): {
  finalMessages: Message[];
  recentMessages: Message[];
  history: Array<{ role: "user" | "model"; text: string }>;
  messagesForHistory: Message[];
  crossDayHistoricalReference: string;
  timeLogString: string;
  isCrossDayNewSession: boolean;
  hasCrossDayHistory: boolean;
  requestTime: Date;
} {
  const uniqueMessages = new Map<string, Message>();
  input.messages.forEach((message) => { if (message) uniqueMessages.set(message.id, message); });
  const finalMessages = Array.from(uniqueMessages.values()).sort((left, right) => left.timestamp - right.timestamp);
  const latestMessage = finalMessages[finalMessages.length - 1];
  const messagesForHistory = input.userMessageId && latestMessage?.id === input.userMessageId
    ? finalMessages.slice(0, -1)
    : finalMessages;
  const isCrossDayNewSession = shouldUseCrossDayHistoryBoundary({
    enableTimeAwareness: input.enableTimeAwareness,
    currentMessageAt: input.userMessageAt,
    latestHistoryMessageAt: messagesForHistory[messagesForHistory.length - 1]?.timestamp,
  });
  const requestTime = input.requestTime || new Date();
  const historyPartition = partitionDirectChatHistoryByCurrentDay({
    messages: messagesForHistory,
    currentMessageAt: input.userMessageAt,
    enableTimeAwareness: input.enableTimeAwareness,
  });
  const liveWindow = historyPartition.liveMessages.slice(-Math.min(MAX_CHAT_CONTEXT_MEMORY_LIMIT, Math.max(0, input.contextLimit ?? DEFAULT_CHAT_CONTEXT_MEMORY_LIMIT)));
  const recentMessages = selectRecentMessagesWithinBudget(
    liveWindow,
    Math.max(1, input.historyCharacterLimit ?? DEFAULT_HISTORY_CHARACTER_LIMIT),
    input.characterName,
    input.userName,
  );
  const historicalMessages = selectRecentMessagesWithinBudget(
    historyPartition.historicalMessages,
    Math.max(1, input.historicalReferenceCharacterLimit ?? DEFAULT_HISTORICAL_REFERENCE_CHARACTER_LIMIT),
    input.characterName,
    input.userName,
  );
  const historicalReferenceLines = historicalMessages.map((message) => {
    const speaker = message.sender === "user" ? "用户" : input.characterName;
    const content = serializeMessageContentForPrompt(message, {
      mode: "history", userName: input.userName, characterName: input.characterName, includeCallTranscript: false,
    }).replace(/\s+/gu, " ").trim().slice(0, 240);
    return `- ${new Date(message.timestamp).toLocaleString("zh-CN", { hour12: false })}｜${speaker}：${content}`;
  });
  const history = recentMessages.flatMap((message) => serializeMessageToPromptTurns(message, {
    userName: input.userName,
    characterName: input.characterName,
  }).map((turn) => ({
    role: turn.role,
    text: input.enableTimeAwareness ? formatHistoricalMessageForPrompt(turn.text, turn.timestamp, requestTime) : turn.text,
  })));
  const timeLogString = input.enableTimeAwareness
    ? recentMessages.reduce((lines, message) => {
      const date = new Date(message.timestamp);
      const day = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
      if (lines.lastDay !== day) {
        lines.values.push(`\n=== 居中分割时间标签: 【${formatWeChatTimestamp(message.timestamp)}】 ===`);
        lines.lastDay = day;
      }
      const sender = message.sender === "user" ? "用户" : input.characterName;
      const fullTime = `${day} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
      let snippet = serializeMessageContentForPrompt(message, { mode: "history", userName: input.userName, characterName: input.characterName, includeCallTranscript: false });
      if (snippet.length > 80) snippet = `${snippet.slice(0, 80)}...`;
      lines.values.push(`- ${sender}: "${snippet}" (发送于: ${fullTime}${describeHistoricalRelativeTime(message.content, message.timestamp, requestTime)})`);
      return lines;
    }, { lastDay: "", values: [] as string[] }).values.join("\n")
    : "";
  return {
    finalMessages,
    messagesForHistory,
    recentMessages,
    history,
    crossDayHistoricalReference: buildCrossDayHistoricalReferencePrompt(historicalReferenceLines),
    timeLogString,
    isCrossDayNewSession,
    hasCrossDayHistory: historyPartition.hasCrossDayHistory,
    requestTime,
  };
}
