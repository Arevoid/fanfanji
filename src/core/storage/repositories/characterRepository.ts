import type { Character } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export function loadCharacters(fallback: Character[]): StorageResult<Character[]> {
  const current = readArray<Character>(storageKeys.characters, fallback);
  if (current.found || !current.valid) return current;

  const legacy = readArray<Character>(storageKeys.legacyCharacters, fallback);
  if (!legacy.found || !legacy.valid) return current;

  const saved = saveCharacters(legacy.value);
  if (!saved.success) console.warn("[storage] Could not migrate legacy characters to v3.");
  return legacy;
}

export function saveCharacters(characters: Character[]): StorageWriteResult {
  return writeArray(storageKeys.characters, characters);
}
