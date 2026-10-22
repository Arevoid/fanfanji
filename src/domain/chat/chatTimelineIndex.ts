import type { Message } from "../../types";

interface TimelineIndex { relations: Map<string, Message[]>; characters: Map<string, Message[]>; selections: Map<string, Message[]> }
const indexes = new WeakMap<readonly Message[], TimelineIndex>();
/** One index per immutable root snapshot, shared by all chat switches. */
export function getChatTimelineIndex(messages: readonly Message[]): TimelineIndex {
  const cached = indexes.get(messages); if (cached) return cached;
  const index: TimelineIndex = { relations: new Map(), characters: new Map(), selections: new Map() };
  for (const message of messages) {
    if (message.isOffline) continue;
    const add = (map: Map<string, Message[]>, key: string) => {
      let rows = map.get(key); if (!rows) { rows = []; map.set(key, rows); } rows.push(message);
    };
    if (message.relationId) add(index.relations, message.relationId);
    add(index.characters, message.characterId);
  }
  indexes.set(messages, index); return index;
}

export function selectChatTimeline(messages: readonly Message[], scope: { characterId: string; relationId?: string; conversationId?: string; group?: boolean }): Message[] {
  const index = getChatTimelineIndex(messages);
  const key = JSON.stringify([scope.characterId, scope.relationId, scope.conversationId, scope.group]);
  const cached = index.selections.get(key); if (cached) return cached;
  const rows = scope.relationId ? index.relations.get(scope.relationId) : scope.group ? index.characters.get(scope.characterId) : undefined;
  const selected = (rows || []).filter(message => message.characterId === scope.characterId
    && (!scope.conversationId || !message.conversationId || message.conversationId === scope.conversationId));
  index.selections.set(key, selected); return selected;
}

export const resolveChatPageSize = (value?: number): number => [20, 50, 100].includes(value ?? 0) ? value! : 50;

/** Resolve split-bubble turn tails once rather than scanning forward per avatar. */
export function indexChatTurnEnds(messages: readonly Message[]): Map<string, Message> {
  const ends = new Map<string, Message>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const current = messages[i], next = messages[i + 1];
    ends.set(current.id, next && !next.isNarration && next.sender === current.sender ? ends.get(next.id)! : current);
  }
  return ends;
}

/** Timestamp + stable message identity avoids offset drift after an append/delete. */
export interface ChatTimelineCursor { timestamp: number; id: string }
export const compareChatMessages = (left: Pick<Message, "timestamp" | "id">, right: Pick<Message, "timestamp" | "id">): number =>
  left.timestamp - right.timestamp || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
export function readChatTimelinePage(messages: readonly Message[], options: { before?: ChatTimelineCursor; limit: number }) {
  const sorted = [...messages].sort(compareChatMessages);
  let end = sorted.length;
  if (options.before) { let low = 0, high = sorted.length; while (low < high) { const mid = (low + high) >>> 1;
    if (compareChatMessages(sorted[mid], options.before) < 0) low = mid + 1; else high = mid; } end = low; }
  const start = Math.max(0, end - Math.max(1, Math.min(100, options.limit)));
  const items = sorted.slice(start, end);
  return { items, hasEarlier: start > 0, cursor: items.length ? { timestamp: items[0].timestamp, id: items[0].id } : undefined };
}
