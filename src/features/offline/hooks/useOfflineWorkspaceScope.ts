import { useEffect, useRef, useState } from "react";
import type { Character, OfflineStory } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { getAvailableCanonicalCharacterIds, resolveCanonicalCharacterId, resolveOfflineStoryCharacterId } from "../../../domain/character/characterIdentity";
import { getOfflineGroupModeStorageKey, getOfflineGroupStoryStorageKey, getOfflineModeStorageKey, getOfflineStoryStorageKey } from "../../../domain/relationship/characterRelationship";
import { canAccessOfflineStoryFromCurrentRelation, isGroupOfflineStory as isGroupOfflineStoryScope, resolveOfflineRelationChoices } from "../services/offlineStoryWorkspaceScope";
import { remove as removeStoredValue, readString, writeString } from "../../../core/storage/storageAdapter";

interface UseOfflineWorkspaceScopeOptions {
  characters: Character[];
  relationships: CharacterRelationship[];
  activeIdentityId: string;
  activeChatCharId?: string | null;
  activeChatRelationId?: string | null;
  offlineStories: OfflineStory[];
  openStoryId?: string | null;
  onOpenOfflineStoryHandled?: (storyId: string) => void;
  showToast: (message: string) => void;
}

/** Owns relation-scoped story selection and restoration for the offline workspace. */
export function useOfflineWorkspaceScope({
  characters,
  relationships,
  activeIdentityId,
  activeChatCharId = null,
  activeChatRelationId = null,
  offlineStories,
  openStoryId = null,
  onOpenOfflineStoryHandled,
  showToast,
}: UseOfflineWorkspaceScopeOptions) {
  const selectableCharacters = characters.filter((character) => !character.isContactInstance);
  const selectableCharacterIds = getAvailableCanonicalCharacterIds(selectableCharacters);
  const resolveCharacterId = (characterId: string) => resolveCanonicalCharacterId(characterId, characters);
  const [selectedCharId, setSelectedCharId] = useState<string>(() => {
    const canonicalActiveChatId = activeChatCharId ? resolveCharacterId(activeChatCharId) : null;
    return canonicalActiveChatId && selectableCharacters.some((character) => character.id === canonicalActiveChatId)
      ? canonicalActiveChatId
      : selectableCharacters[0]?.id || "";
  });
  const [selectedRelationId, setSelectedRelationId] = useState<string>(() => activeChatRelationId || "");
  const relationChoices = resolveOfflineRelationChoices(relationships, selectedCharId, activeIdentityId);
  const isGroupOfflineStory = (story: OfflineStory) => isGroupOfflineStoryScope(story, characters);
  const canAccessStoryFromCurrentRelation = (story: OfflineStory) => canAccessOfflineStoryFromCurrentRelation({
    story,
    characters,
    selectedRelationId,
    relationChoices,
    activeIdentityId,
  });
  const [activeStory, setActiveStory] = useState<OfflineStory | null>(null);
  const activeStoryRef = useRef<OfflineStory | null>(null);
  const [lastLoadedStoryScope, setLastLoadedStoryScope] = useState<string | null>(null);

  useEffect(() => {
    const preferred = activeChatRelationId && relationships.some((relation) => relation.id === activeChatRelationId
      && relation.characterId === selectedCharId && relation.userIdentityId === activeIdentityId)
      ? activeChatRelationId
      : relationChoices[0]?.id || "";
    if (preferred !== selectedRelationId) setSelectedRelationId(preferred);
  }, [activeChatRelationId, selectedCharId, activeIdentityId, relationships]);

  const clearActiveStorySnapshot = () => {
    activeStoryRef.current = null;
    setActiveStory(null);
  };

  useEffect(() => {
    if (selectedCharId && !selectableCharacterIds.has(selectedCharId)) setSelectedCharId(selectableCharacters[0]?.id || "");
    if (activeStoryRef.current && (
      (!isGroupOfflineStory(activeStoryRef.current)
        && !selectableCharacterIds.has(resolveOfflineStoryCharacterId(activeStoryRef.current, characters)))
      || !canAccessStoryFromCurrentRelation(activeStoryRef.current)
    )) clearActiveStorySnapshot();
  }, [characters, selectedCharId, selectedRelationId, activeStory?.id, relationChoices]);

  const handleOpenStory = (story: OfflineStory): boolean => {
    if (!canAccessStoryFromCurrentRelation(story)) {
      showToast("此线下剧情属于另一个人设关系，不能跨身份进入。");
      return false;
    }
    const storyContainer = characters.find((character) => character.id === story.characterId);
    if (storyContainer && selectableCharacters.some((character) => character.id === storyContainer.id)) {
      setSelectedCharId(storyContainer.id);
      if (isGroupOfflineStory(story)) setSelectedRelationId("");
    }
    activeStoryRef.current = story;
    setActiveStory(story);
    if (story.relationId) {
      writeString(getOfflineModeStorageKey(story.relationId), "true");
      writeString(getOfflineStoryStorageKey(story.relationId), story.id);
    } else if (characters.find((character) => character.id === story.characterId)?.isGroupChat) {
      writeString(getOfflineGroupModeStorageKey(story.characterId), "true");
      writeString(getOfflineGroupStoryStorageKey(story.characterId), story.id);
    }
    return true;
  };

  useEffect(() => {
    if (activeStoryRef.current || openStoryId) return;
    const scopeKey = selectedRelationId || `legacy:${selectedCharId}`;
    if (selectedCharId && scopeKey !== lastLoadedStoryScope) {
      setLastLoadedStoryScope(scopeKey);
      const selectedCharacter = characters.find((character) => character.id === selectedCharId);
      const savedStoryId = selectedCharacter?.isGroupChat
        ? readString(getOfflineGroupStoryStorageKey(selectedCharacter.id)).value
        : selectedRelationId ? readString(getOfflineStoryStorageKey(selectedRelationId)).value : null;
      const story = savedStoryId ? offlineStories.find((item) => item.id === savedStoryId) : undefined;
      if (story && canAccessStoryFromCurrentRelation(story)) {
        activeStoryRef.current = story;
        setActiveStory(story);
        return;
      }
      clearActiveStorySnapshot();
    }
  }, [selectedCharId, selectedRelationId, offlineStories, lastLoadedStoryScope, openStoryId]);

  useEffect(() => {
    if (!openStoryId || activeStoryRef.current) return;
    const requestedStory = offlineStories.find((story) => story.id === openStoryId);
    if (requestedStory && handleOpenStory(requestedStory)) onOpenOfflineStoryHandled?.(requestedStory.id);
  }, [openStoryId, offlineStories, characters, selectedRelationId, relationChoices]);

  const clearOfflineSession = (story: OfflineStory) => {
    if (story.relationId) {
      removeStoredValue(getOfflineStoryStorageKey(story.relationId));
      writeString(getOfflineModeStorageKey(story.relationId), "false");
    } else if (characters.find((character) => character.id === story.characterId)?.isGroupChat) {
      removeStoredValue(getOfflineGroupStoryStorageKey(story.characterId));
      writeString(getOfflineGroupModeStorageKey(story.characterId), "false");
    }
  };

  return {
    selectableCharacters,
    selectableCharacterIds,
    selectedCharId,
    setSelectedCharId,
    selectedRelationId,
    setSelectedRelationId,
    relationChoices,
    activeStory,
    setActiveStory,
    activeStoryRef,
    clearActiveStorySnapshot,
    canAccessStoryFromCurrentRelation,
    isGroupOfflineStory,
    handleOpenStory,
    clearOfflineSession,
  };
}
