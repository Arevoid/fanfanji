import { normalizeReadingStoryStore } from "../../../domain/reading/storyNormalization";
import { createEmptyReadingStoryStore, type ReadingStorySave, type ReadingStoryScope, type ReadingStoryState, type ReadingStoryStore, type ReadingStoryTurn } from "../../../domain/reading/storyTypes";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

const sameScope = (left: ReadingStoryScope, right: ReadingStoryScope): boolean => left.userIdentityId === right.userIdentityId && left.storyId === right.storyId;
export function loadReadingStoryStore(): StorageResult<ReadingStoryStore> { const loaded = readJson<unknown>(storageKeys.readingStoryStore, createEmptyReadingStoryStore()); return { ...loaded, value: normalizeReadingStoryStore(loaded.value) }; }
export function saveReadingStoryStore(store: ReadingStoryStore): StorageWriteResult { return writeJson(storageKeys.readingStoryStore, normalizeReadingStoryStore(store)); }
export function listReadingStories(userIdentityId: string): ReadingStoryState[] { return loadReadingStoryStore().value.stories.filter((story) => story.userIdentityId === userIdentityId).sort((left, right) => right.updatedAt - left.updatedAt); }
export function getReadingStory(scope: ReadingStoryScope): ReadingStoryState | undefined { return loadReadingStoryStore().value.stories.find((story) => sameScope(story, scope)); }
export function saveReadingStory(story: ReadingStoryState): StorageWriteResult { const store = loadReadingStoryStore().value; return saveReadingStoryStore({ ...store, stories: [...store.stories.filter((candidate) => !sameScope(candidate, story)), story] }); }
export function listReadingStoryTurns(scope: ReadingStoryScope): ReadingStoryTurn[] { return loadReadingStoryStore().value.turns.filter((turn) => sameScope(turn, scope)).sort((left, right) => left.turnIndex - right.turnIndex); }
export function saveReadingStoryTurn(turn: ReadingStoryTurn): StorageWriteResult { const store = loadReadingStoryStore().value; return saveReadingStoryStore({ ...store, turns: [...store.turns.filter((candidate) => !(candidate.id === turn.id && sameScope(candidate, turn))), turn] }); }
export function listReadingStorySaves(scope: ReadingStoryScope): ReadingStorySave[] { return loadReadingStoryStore().value.saves.filter((save) => sameScope(save, scope)).sort((left, right) => right.createdAt - left.createdAt); }
export function saveReadingStorySave(save: ReadingStorySave): StorageWriteResult { const store = loadReadingStoryStore().value; return saveReadingStoryStore({ ...store, saves: [...store.saves.filter((candidate) => !(candidate.id === save.id && sameScope(candidate, save))), save] }); }
export function deleteReadingStoryScope(scope: ReadingStoryScope): StorageWriteResult { const store = loadReadingStoryStore().value; return saveReadingStoryStore({ ...store, stories: store.stories.filter((item) => !sameScope(item, scope)), turns: store.turns.filter((item) => !sameScope(item, scope)), saves: store.saves.filter((item) => !sameScope(item, scope)) }); }
