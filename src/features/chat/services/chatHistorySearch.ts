import type { Message, OfflineStory } from "../../../types";
import { getChatMessageVisualType, isCallRecordMarkup, parseCallRecord, parseTextImageDescription } from "./messageParser";
import { projectChatDisplayMessage, isVisibleChatMessage } from "./chatDisplayProjection";

export type ChatHistoryCategory = "all" | "text" | "call" | "image" | "sticker" | "offline";
export const CHAT_HISTORY_CATEGORIES: { id: ChatHistoryCategory; label: string }[] = [
  { id: "all", label: "全部" }, { id: "text", label: "文字" }, { id: "call", label: "通话" },
  { id: "image", label: "图片" }, { id: "sticker", label: "表情" }, { id: "offline", label: "线下" },
];
export interface ChatHistoryScope { characterId: string; relationId?: string; conversationId?: string; userIdentityId: string; group?: boolean }
export interface ChatHistoryCandidate { key: string; message: Message; category: Exclude<ChatHistoryCategory, "all">; storyId?: string; title?: string }
export interface ChatHistoryResult { key: string; messageId: string; timestamp: number; sender: Message["sender"]; category: ChatHistoryCandidate["category"]; text: string; storyId?: string; title?: string }
const textCache = new WeakMap<Message, { content: string; text: string }>();
export function classifyChatHistoryMessage(message: Message): Exclude<ChatHistoryCategory, "all" | "offline"> {
  if (message.callId || isCallRecordMarkup(message.content)) return "call";
  const type = getChatMessageVisualType(message.content);
  if (type === "call") return "call";
  if (message.imageAssetId || type === "image" || type === "text-image") return "image";
  if (type === "sticker") return "sticker";
  return "text";
}
export function buildChatHistoryCandidates(messages: readonly Message[], stories: readonly OfflineStory[], scope: ChatHistoryScope): ChatHistoryCandidate[] {
  const matches = (message: Message) => message.characterId === scope.characterId && !message.isOffline
    && (scope.group || Boolean(scope.relationId) && message.relationId === scope.relationId)
    && (!scope.conversationId || !message.conversationId || message.conversationId === scope.conversationId);
  const candidates: ChatHistoryCandidate[] = messages.filter(matches).map(message => ({ key: `message:${message.id}`, message, category: classifyChatHistoryMessage(message) }));
  for (const story of stories) {
    if ((story.ownerIdentityId || "identity-1") !== scope.userIdentityId || (scope.group
      ? story.sourceChatId !== scope.characterId
      : story.relationId !== scope.relationId || story.characterId !== scope.characterId)) continue;
    for (const message of story.messages || []) {
      if (message.isImportedContext) continue;
      candidates.push({ key: `offline:${story.id}:${message.id}`, message, category: "offline", storyId: story.id, title: story.title });
    }
  }
  return candidates.sort((a, b) => b.message.timestamp - a.message.timestamp || b.key.localeCompare(a.key));
}
function searchText(candidate: ChatHistoryCandidate): string {
  const message = candidate.message, cached = textCache.get(message); if (cached?.content === message.content) return cached.text;
  const display = projectChatDisplayMessage(message);
  let text = display.content;
  if (candidate.category === "image") text = parseTextImageDescription(text) || (text.startsWith("data:") ? "图片" : text.replace(/data:image\/[^\s]+/gu, "[图片]"));
  else if (candidate.category === "sticker") text = `[表情] ${text.split("|")[1] || ""}`;
  else if (candidate.category === "call" && isCallRecordMarkup(text)) {
    const call = parseCallRecord(text); text = `${message.callMedia === "video" ? "视频通话" : "语音通话"} ${call.status}\n${call.transcript.map(turn => turn.content).join("\n")}`;
  }
  textCache.set(message, { content: message.content, text }); return text;
}
export interface ChatHistorySearchOptions { query: string; category: ChatHistoryCategory; date?: string; before?: { timestamp: number; key: string }; limit?: number; signal?: AbortSignal }
/** Bounded output and cooperative scanning; an obsolete query cannot publish results. */
export async function searchChatHistory(candidates: readonly ChatHistoryCandidate[], options: ChatHistorySearchOptions) {
  const query = options.query.trim().normalize("NFKC").toLocaleLowerCase();
  const limit = Math.max(1, Math.min(100, options.limit || 50)), results: ChatHistoryResult[] = [];
  let hasMore = false;
  for (let i = 0; i < candidates.length; i++) {
    if (options.signal?.aborted) throw new DOMException("Search aborted", "AbortError");
    if (i && i % 256 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    const candidate = candidates[i], message = candidate.message;
    if (message.recalledAt || !isVisibleChatMessage(message) || options.category !== "all" && candidate.category !== options.category) continue;
    if (options.before && (message.timestamp > options.before.timestamp || message.timestamp === options.before.timestamp && candidate.key.localeCompare(options.before.key) >= 0)) continue;
    const date = new Date(message.timestamp);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (options.date && options.date !== dateKey) continue;
    const text = searchText(candidate);
    if (query && !`${candidate.title || ""}\n${text}`.normalize("NFKC").toLocaleLowerCase().includes(query)) continue;
    if (results.length === limit) { hasMore = true; break; }
    results.push({ key: candidate.key, messageId: message.id, timestamp: message.timestamp, sender: message.sender, category: candidate.category, text, storyId: candidate.storyId, title: candidate.title });
  }
  if (options.signal?.aborted) throw new DOMException("Search aborted", "AbortError");
  const last = results.at(-1);
  return { results, hasMore, cursor: last ? { timestamp: last.timestamp, key: last.key } : undefined };
}
