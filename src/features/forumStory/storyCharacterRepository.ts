import type { StoryCharacter } from "../../domain/forumStory/forumStoryTypes";
import { storageKeys } from "../../core/storage/storageKeys";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";
import {
  failedStoryWrite,
  isStoryCharacterRecord,
  loadStoryCollection,
  saveStoryCollection,
} from "./storyStorageUtils";

export type StoryCharacterPatch = Partial<Omit<StoryCharacter, "id" | "storyId">>;

export const loadStoryCharacters = (): StorageResult<StoryCharacter[]> =>
  loadStoryCollection(storageKeys.forumStoryCharacters, isStoryCharacterRecord);

export const getStoryCharactersByStoryId = (storyId: string): StoryCharacter[] =>
  loadStoryCharacters().value.filter((character) => character.storyId === storyId);

export const createStoryCharacter = (character: StoryCharacter): StorageWriteResult => {
  if (!isStoryCharacterRecord(character)) return failedStoryWrite();
  const current = loadStoryCharacters().value;
  if (current.some((item) => item.storyId === character.storyId && item.id === character.id)) {
    return failedStoryWrite();
  }
  return saveStoryCollection(storageKeys.forumStoryCharacters, [...current, character]);
};

export const updateStoryCharacter = (
  storyId: string,
  characterId: string,
  patch: StoryCharacterPatch,
): StorageWriteResult => {
  const current = loadStoryCharacters().value;
  const index = current.findIndex((character) => character.storyId === storyId && character.id === characterId);
  if (index < 0) return failedStoryWrite();

  const nextCharacter: StoryCharacter = {
    ...current[index],
    ...patch,
    id: characterId,
    storyId,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  if (!isStoryCharacterRecord(nextCharacter)) return failedStoryWrite();

  const next = [...current];
  next[index] = nextCharacter;
  return saveStoryCollection(storageKeys.forumStoryCharacters, next);
};

export const StoryCharacterRepository = {
  load: loadStoryCharacters,
  createStoryCharacter,
  getStoryCharactersByStoryId,
  updateStoryCharacter,
};

export const storyCharacterRepository = StoryCharacterRepository;
