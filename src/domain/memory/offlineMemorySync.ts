import type { MemoryItem, Message, OfflineStory } from "../../types";

export function getOfflineStorySyncMarker(story: OfflineStory): string {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
  return `offline-story:${story.id}:${syncStart}-${story.messages.length}`;
}

export function getOfflineMemorySourceMessages(story: OfflineStory): Message[] {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
  return story.messages
    .slice(syncStart)
    .map((message, index) => ({ message, index }))
    .filter(({ message }) =>
      !message.isImportedContext
      && !message.id.startsWith("offline-import-")
      && !message.isNarration
      && message.content.trim().length > 0,
    )
    // Old stories did not guarantee array order after editing. Preserve a
    // stable chronological handoff without mutating the persisted story.
    .sort((left, right) => left.message.timestamp - right.message.timestamp || left.index - right.index)
    .map(({ message }) => message);
}

/**
 * Produces the exact, user-visible offline plot transcript that may cross back
 * into an online chat. Imported online context and narration are deliberately
 * excluded; both the user's actions and the character's response remain.
 */
export function collectOfflineHandoffContent(story: OfflineStory): string {
  return getOfflineMemorySourceMessages(story)
    .slice(-12)
    .map((message) => `${message.sender === "user" ? "用户" : "角色"}: ${message.content}`)
    .join("\n");
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
  // sourceMessages is the result of getOfflineMemorySourceMessages(story) at
  // the sync boundary, so this preserves exactly the same filtered transcript.
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

export function buildOfflineHandoffPromptBlock(memory: MemoryItem): string {
  return `\n- Latest offline continuation handoff (continue this naturally if relevant):
  * ${memory.content}
  * When asked about what just happened offline, treat only the handoff facts above as authoritative. Do not invent missing scenes, actions, locations, or promises; if a detail is absent, say you are unsure.`;
}
