import type { Character, Message, OfflineStory } from "../../types";
import type { CharacterRelationship } from "../relationship/characterRelationship";
import { resolveCanonicalCharacterId, resolveOfflineStoryCharacterIds } from "../character/characterIdentity";
import { resolveOfflineStoryRelationId } from "../relationship/offlineStoryScope";

/**
 * A story is resumable once it has either produced Offline content or has a
 * persisted online handoff ready to start that first scene. Empty drafts are
 * intentionally left out so the entry flow can create a fresh story instead
 * of asking the user to resume an unfinished shell.
 */
export function isOfflineStoryResumable(story: OfflineStory): boolean {
  const hasOfflineContent = Array.isArray(story.messages)
    && story.messages.some((message) => !message.isImportedContext);
  const hasPersistedHandoff = Array.isArray(story.importedContext?.messages)
    && story.importedContext.messages.length > 0;
  return hasOfflineContent || hasPersistedHandoff;
}

export interface OfflineStoryResumeScope {
  characterId: string;
  relationId?: string | null;
  userIdentityId: string;
}

/** Returns only resumable stories owned by the current character/relation. */
export function listResumableOfflineStories(input: {
  stories: readonly OfflineStory[];
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  scope: OfflineStoryResumeScope;
}): OfflineStory[] {
  const canonicalCharacterId = resolveCanonicalCharacterId(input.scope.characterId, input.characters);
  return input.stories
    .filter(isOfflineStoryResumable)
    .filter((story) => {
      const storyCharacterId = resolveCanonicalCharacterId(story.characterId, input.characters);
      const participantIds = resolveOfflineStoryCharacterIds(story, input.characters);
      if (storyCharacterId !== canonicalCharacterId && !participantIds.includes(canonicalCharacterId)) return false;

      const storyRelationId = resolveOfflineStoryRelationId(
        story,
        input.relationships,
        input.characters,
        input.scope.userIdentityId,
      );
      return input.scope.relationId
        ? storyRelationId === input.scope.relationId
        : !storyRelationId;
    })
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt);
}

const isMergeableOnlineMessage = (message: Message): boolean => Boolean(
  !message.isOffline
  && !message.isImportedContext
  && !message.isNarration
  && message.content?.trim(),
);

const getImportedSourceKey = (message: Message): string => message.sourceMessageId || message.id;

/**
 * Adds the online segment that happened after a completed offline handoff to
 * an existing continue story. Imported messages remain context-only so the
 * offline memory extractor never treats them as new offline events.
 */
export function mergeOnlineMessagesIntoOfflineStory(
  story: OfflineStory,
  onlineMessages: readonly Message[],
  now = Date.now(),
): OfflineStory {
  if (story.mode !== "continue" || !story.onlineHandoff) return story;

  const cutoff = story.onlineHandoff.endedAt;
  const importedMessages = story.importedContext?.messages || [];
  const importedSourceKeys = new Set(importedMessages.map(getImportedSourceKey));
  const importedFingerprints = new Set(importedMessages.map((message) =>
    `${message.timestamp}|${message.sender}|${message.content.trim()}`,
  ));
  const additions: Message[] = [];
  for (const message of onlineMessages) {
    if (!isMergeableOnlineMessage(message) || message.timestamp <= cutoff) continue;
    const sourceKey = getImportedSourceKey(message);
    const fingerprint = `${message.timestamp}|${message.sender}|${message.content.trim()}`;
    if (importedSourceKeys.has(sourceKey) || importedFingerprints.has(fingerprint)) continue;
    importedSourceKeys.add(sourceKey);
    importedFingerprints.add(fingerprint);
    additions.push(message);
  }
  if (additions.length === 0) return story;

  const copiedMessages = additions.map((message) => ({
    ...message,
    id: `offline-online-${story.id}-${message.id}`,
    sourceMessageId: message.id,
    isOffline: true,
    isImportedContext: true,
  }));
  const previousContext = story.importedContext;
  const nextImportedMessages = [...importedMessages, ...copiedMessages];

  return {
    ...story,
    sourceChatId: story.sourceChatId || story.characterId,
    sourceChatMsgCount: (story.sourceChatMsgCount || importedMessages.length) + copiedMessages.length,
    importedContext: {
      messages: nextImportedMessages,
      memories: previousContext?.memories || [],
      ...(previousContext?.handoffFacts ? { handoffFacts: previousContext.handoffFacts } : {}),
      ...(previousContext?.memberMemories ? { memberMemories: previousContext.memberMemories } : {}),
      worldBook: previousContext?.worldBook || [],
      importedAt: now,
    },
    updatedAt: now,
  };
}
