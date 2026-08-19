import { normalizeReadingCoStoryStore } from "../../../domain/reading/coStoryNormalization";
import {
  createEmptyReadingCoStoryStore,
  type ReadingCoStorySave,
  type ReadingCoStoryScope,
  type ReadingCoStoryState,
  type ReadingCoStoryStore,
  type ReadingCoStoryTurn,
} from "../../../domain/reading/coStoryTypes";
import { readingAssetDb } from "../readingAssetDb";
import { readJson, remove, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { createLatestSnapshotWriter } from "../latestSnapshotWriter";

const CO_STORY_METADATA_KEY = "reading-co-story-store";
const sameScope = (left: ReadingCoStoryScope, right: ReadingCoStoryScope): boolean =>
  left.userIdentityId === right.userIdentityId
  && left.coStoryId === right.coStoryId
  && left.relationId === right.relationId
  && left.characterId === right.characterId;

let cachedStore: ReadingCoStoryStore | null = null;
let metadataReady = false;
let initializationPromise: Promise<StorageResult<ReadingCoStoryStore>> | null = null;

function loadLegacyStore(): StorageResult<ReadingCoStoryStore> {
  const loaded = readJson<unknown>(storageKeys.readingCoStoryStore, createEmptyReadingCoStoryStore());
  return { ...loaded, value: normalizeReadingCoStoryStore(loaded.value) };
}

function cloneStore(store: ReadingCoStoryStore): ReadingCoStoryStore {
  return typeof structuredClone === "function"
    ? structuredClone(store)
    : JSON.parse(JSON.stringify(store)) as ReadingCoStoryStore;
}

const coStoryWriter = createLatestSnapshotWriter(
  cloneStore,
  (snapshot) => readingAssetDb.saveMetadataValue(CO_STORY_METADATA_KEY, snapshot),
);

export async function initializeReadingCoStoryStore(): Promise<StorageResult<ReadingCoStoryStore>> {
  if (typeof indexedDB === "undefined") return loadLegacyStore();
  if (metadataReady && cachedStore) return { value: cachedStore, found: true, valid: true };
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    try {
      const stored = await readingAssetDb.loadMetadataValue<ReadingCoStoryStore>(CO_STORY_METADATA_KEY);
      if (stored) {
        cachedStore = normalizeReadingCoStoryStore(stored);
        metadataReady = true;
        return { value: cachedStore, found: true, valid: true };
      }
      const legacy = loadLegacyStore();
      if (legacy.found && !legacy.valid) return legacy;
      cachedStore = legacy.value;
      metadataReady = true;
      await coStoryWriter.enqueue(cachedStore);
      if (legacy.found && legacy.valid) remove(storageKeys.readingCoStoryStore);
      return legacy;
    } catch (error) {
      console.warn("[reading] IndexedDB story-world initialization failed; using the legacy store for this session.", error);
      metadataReady = false;
      return loadLegacyStore();
    }
  })();
  return initializationPromise;
}

export function loadReadingCoStoryStore(): StorageResult<ReadingCoStoryStore> {
  if (metadataReady && cachedStore) return { value: cachedStore, found: true, valid: true };
  return loadLegacyStore();
}

export function saveReadingCoStoryStore(store: ReadingCoStoryStore): StorageWriteResult {
  const normalized = normalizeReadingCoStoryStore(store);
  if (typeof indexedDB === "undefined") return writeJson(storageKeys.readingCoStoryStore, normalized);
  cachedStore = normalized;
  metadataReady = true;
  coStoryWriter.enqueue(normalized).catch((error) => console.warn("[reading] Failed to persist story-world data in IndexedDB.", error));
  return { success: true };
}

export async function flushReadingCoStoryStore(): Promise<StorageWriteResult> {
  if (typeof indexedDB === "undefined") return { success: true };
  try {
    await coStoryWriter.flush();
    remove(storageKeys.readingCoStoryStore);
    return { success: true };
  } catch (error) {
    console.warn("[reading] Story-world IndexedDB transaction failed.", error);
    return { success: false, error: error && typeof error === "object" && String((error as { name?: unknown }).name) === "QuotaExceededError" ? "quota" : "write" };
  }
}

export function listReadingCoStories(userIdentityId: string): ReadingCoStoryState[] {
  return loadReadingCoStoryStore().value.stories.filter((story) => story.userIdentityId === userIdentityId).sort((left, right) => right.updatedAt - left.updatedAt);
}

export function getReadingCoStory(scope: ReadingCoStoryScope): ReadingCoStoryState | undefined {
  return loadReadingCoStoryStore().value.stories.find((story) => sameScope(story, scope));
}

export function saveReadingCoStory(story: ReadingCoStoryState): StorageWriteResult {
  const store = loadReadingCoStoryStore().value;
  return saveReadingCoStoryStore({ ...store, stories: [...store.stories.filter((candidate) => !sameScope(candidate, story)), story] });
}

export function listReadingCoStoryTurns(scope: ReadingCoStoryScope): ReadingCoStoryTurn[] {
  return loadReadingCoStoryStore().value.turns.filter((turn) => sameScope(turn, scope)).sort((left, right) => left.turnIndex - right.turnIndex);
}

export function saveReadingCoStoryTurn(turn: ReadingCoStoryTurn): StorageWriteResult {
  const store = loadReadingCoStoryStore().value;
  return saveReadingCoStoryStore({ ...store, turns: [...store.turns.filter((candidate) => !(candidate.turnId === turn.turnId && sameScope(candidate, turn))), turn] });
}

export function listReadingCoStorySaves(scope: ReadingCoStoryScope): ReadingCoStorySave[] {
  return loadReadingCoStoryStore().value.saves.filter((save) => sameScope(save, scope)).sort((left, right) => right.createdAt - left.createdAt);
}

export function saveReadingCoStorySave(save: ReadingCoStorySave): StorageWriteResult {
  const store = loadReadingCoStoryStore().value;
  return saveReadingCoStoryStore({ ...store, saves: [...store.saves.filter((candidate) => !(candidate.id === save.id && sameScope(candidate, save))), save] });
}

export function deleteReadingCoStoryScope(scope: ReadingCoStoryScope): StorageWriteResult {
  const store = loadReadingCoStoryStore().value;
  return saveReadingCoStoryStore({
    ...store,
    stories: store.stories.filter((item) => !sameScope(item, scope)),
    turns: store.turns.filter((item) => !sameScope(item, scope)),
    saves: store.saves.filter((item) => !sameScope(item, scope)),
  });
}
