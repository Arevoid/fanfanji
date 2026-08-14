import type { Character } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readingAssetDb } from "../readingAssetDb";
import { remove } from "../storageAdapter";

const CHARACTER_METADATA_KEY = "character-archive-v4";
let cachedCharacters: Character[] | null = null;
let metadataReady = false;
let initializationPromise: Promise<StorageResult<Character[]>> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const cloneCharacters = (characters: Character[]): Character[] => typeof structuredClone === "function"
  ? structuredClone(characters)
  : JSON.parse(JSON.stringify(characters)) as Character[];

const loadLegacyCharacters = (fallback: Character[]): StorageResult<Character[]> => {
  const current = readArray<Character>(storageKeys.characters, fallback);
  if (current.found || !current.valid) return current;
  return readArray<Character>(storageKeys.legacyCharacters, fallback);
};

const enqueueWrite = (characters: Character[]): Promise<void> => {
  const snapshot = cloneCharacters(characters);
  writeQueue = writeQueue.catch(() => undefined).then(() => readingAssetDb.saveMetadataValue(CHARACTER_METADATA_KEY, snapshot));
  return writeQueue;
};

export function loadCharacters(fallback: Character[]): StorageResult<Character[]> {
  if (metadataReady && cachedCharacters) return { value: cachedCharacters, found: true, valid: true };
  return loadLegacyCharacters(fallback);
}

export function saveCharacters(characters: Character[]): StorageWriteResult {
  if (typeof indexedDB === "undefined") return writeArray(storageKeys.characters, characters);
  cachedCharacters = cloneCharacters(characters);
  metadataReady = true;
  enqueueWrite(cachedCharacters).catch((error) => console.warn("[storage] Failed to persist characters in IndexedDB.", error));
  return { success: true };
}

export async function initializeCharacterRepository(fallback: Character[]): Promise<StorageResult<Character[]>> {
  if (typeof indexedDB === "undefined") return loadLegacyCharacters(fallback);
  if (metadataReady && cachedCharacters) return { value: cachedCharacters, found: true, valid: true };
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    try {
      const stored = await readingAssetDb.loadMetadataValue<Character[]>(CHARACTER_METADATA_KEY);
      if (Array.isArray(stored)) {
        cachedCharacters = stored;
        metadataReady = true;
        return { value: stored, found: true, valid: true };
      }
      const legacy = loadLegacyCharacters(fallback);
      cachedCharacters = cloneCharacters(legacy.value);
      metadataReady = true;
      await enqueueWrite(cachedCharacters);
      if (legacy.found && legacy.valid) {
        remove(storageKeys.characters);
        remove(storageKeys.legacyCharacters);
      }
      return legacy;
    } catch (error) {
      console.warn("[storage] Character IndexedDB initialization failed; using localStorage for this session.", error);
      metadataReady = false;
      return loadLegacyCharacters(fallback);
    }
  })();
  return initializationPromise;
}

export async function flushCharacters(): Promise<StorageWriteResult> {
  if (typeof indexedDB === "undefined") return { success: true };
  try {
    await writeQueue;
    remove(storageKeys.characters);
    remove(storageKeys.legacyCharacters);
    return { success: true };
  } catch (error) {
    const name = error && typeof error === "object" ? String((error as { name?: unknown }).name || "") : "";
    return { success: false, error: name === "QuotaExceededError" ? "quota" : "write" };
  }
}
