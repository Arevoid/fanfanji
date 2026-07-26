import type { CharacterRelationship } from "../../../domain/relationship/relationshipTypes";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

export const loadCharacterRelationships = (): StorageResult<CharacterRelationship[]> =>
  readArray<CharacterRelationship>(storageKeys.characterRelationships, []);

export const saveCharacterRelationships = (relationships: CharacterRelationship[]): StorageWriteResult =>
  writeArray(storageKeys.characterRelationships, relationships);
