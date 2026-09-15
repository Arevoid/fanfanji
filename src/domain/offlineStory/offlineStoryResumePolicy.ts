import type { Character, OfflineStory } from "../../types";
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
