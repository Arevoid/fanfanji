import { normalizeReadingCoStoryStore } from "../../../domain/reading/coStoryNormalization";
import { createEmptyReadingCoStoryStore, type ReadingCoStorySave, type ReadingCoStoryScope, type ReadingCoStoryState, type ReadingCoStoryStore, type ReadingCoStoryTurn } from "../../../domain/reading/coStoryTypes";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

const sameScope = (left: ReadingCoStoryScope, right: ReadingCoStoryScope): boolean => left.userIdentityId === right.userIdentityId && left.coStoryId === right.coStoryId && left.relationId === right.relationId && left.characterId === right.characterId;
export function loadReadingCoStoryStore(): StorageResult<ReadingCoStoryStore> { const loaded = readJson<unknown>(storageKeys.readingCoStoryStore, createEmptyReadingCoStoryStore()); return { ...loaded, value: normalizeReadingCoStoryStore(loaded.value) }; }
export function saveReadingCoStoryStore(store: ReadingCoStoryStore): StorageWriteResult { return writeJson(storageKeys.readingCoStoryStore, normalizeReadingCoStoryStore(store)); }
export function listReadingCoStories(userIdentityId: string): ReadingCoStoryState[] { return loadReadingCoStoryStore().value.stories.filter((story) => story.userIdentityId === userIdentityId).sort((left, right) => right.updatedAt - left.updatedAt); }
export function getReadingCoStory(scope: ReadingCoStoryScope): ReadingCoStoryState | undefined { return loadReadingCoStoryStore().value.stories.find((story) => sameScope(story, scope)); }
export function saveReadingCoStory(story: ReadingCoStoryState): StorageWriteResult { const store = loadReadingCoStoryStore().value; return saveReadingCoStoryStore({ ...store, stories: [...store.stories.filter((candidate) => !sameScope(candidate, story)), story] }); }
export function listReadingCoStoryTurns(scope: ReadingCoStoryScope): ReadingCoStoryTurn[] { return loadReadingCoStoryStore().value.turns.filter((turn) => sameScope(turn, scope)).sort((left, right) => left.turnIndex - right.turnIndex); }
export function saveReadingCoStoryTurn(turn: ReadingCoStoryTurn): StorageWriteResult { const store = loadReadingCoStoryStore().value; return saveReadingCoStoryStore({ ...store, turns: [...store.turns.filter((candidate) => !(candidate.turnId === turn.turnId && sameScope(candidate, turn))), turn] }); }
export function listReadingCoStorySaves(scope: ReadingCoStoryScope): ReadingCoStorySave[] { return loadReadingCoStoryStore().value.saves.filter((save) => sameScope(save, scope)).sort((left, right) => right.createdAt - left.createdAt); }
export function saveReadingCoStorySave(save: ReadingCoStorySave): StorageWriteResult { const store = loadReadingCoStoryStore().value; return saveReadingCoStoryStore({ ...store, saves: [...store.saves.filter((candidate) => !(candidate.id === save.id && sameScope(candidate, save))), save] }); }
export function deleteReadingCoStoryScope(scope: ReadingCoStoryScope): StorageWriteResult { const store = loadReadingCoStoryStore().value; return saveReadingCoStoryStore({ ...store, stories: store.stories.filter((item) => !sameScope(item, scope)), turns: store.turns.filter((item) => !sameScope(item, scope)), saves: store.saves.filter((item) => !sameScope(item, scope)) }); }
