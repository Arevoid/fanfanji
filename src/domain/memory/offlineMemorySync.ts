import type { Message, OfflineStory } from "../../types";

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
