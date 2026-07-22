import type { MemoryItem, Message, OfflineStory } from "../../types";

export function getOfflineStorySyncMarker(story: OfflineStory): string {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
  return `offline-story:${story.id}:${syncStart}-${story.messages.length}`;
}

export function getOfflineMemorySourceMessages(story: OfflineStory): Message[] {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
  return story.messages.slice(syncStart).filter((message) =>
    !message.isImportedContext
    && !message.id.startsWith("offline-import-")
    && !message.isNarration
    && message.content.trim().length > 0,
  );
}

export function hasUnsyncedOfflineMemoryProgress(story: OfflineStory): boolean {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
  return story.messages.length > syncStart;
}

/**
 * Keeps a concise, deterministic handoff when AI extraction has no result or
 * is unavailable. The marker is intentionally shared with the online prompt's
 * immediate-return handoff check.
 */
export function createOfflineStoryHandoffMemory(input: {
  story: OfflineStory;
  sourceMessages: readonly Message[];
  characterId: string;
  id: string;
  timestamp: number;
}): MemoryItem {
  const transcript = input.sourceMessages.slice(-12).map((message) =>
    `${message.sender === "user" ? "用户" : "角色"}: ${message.content}`,
  ).join("\n");
  return {
    id: input.id,
    characterId: input.characterId,
    content: `【线下剧本《${input.story.title}》线上交接】\n[${getOfflineStorySyncMarker(input.story)}]\n${transcript}`,
    timestamp: input.timestamp,
    importance: 8,
    isManual: false,
  };
}
