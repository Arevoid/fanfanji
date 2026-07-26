import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { storageKeys } from "../storageKeys";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadRelationships = (fallback: CharacterRelationship[] = []): StorageResult<CharacterRelationship[]> =>
  readArray(storageKeys.characterRelationships, fallback);
export const saveRelationships = (relationships: CharacterRelationship[]): StorageWriteResult =>
  writeArray(storageKeys.characterRelationships, relationships);
