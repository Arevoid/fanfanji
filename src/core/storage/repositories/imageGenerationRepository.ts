import type { ImageGenerationRecord } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export function loadImageGenerationRecords(fallback: ImageGenerationRecord[] = []): StorageResult<ImageGenerationRecord[]> {
  return readArray<ImageGenerationRecord>(storageKeys.imageGenerationRecords, fallback);
}

export function saveImageGenerationRecords(records: ImageGenerationRecord[]): StorageWriteResult {
  return writeArray(storageKeys.imageGenerationRecords, records);
}

export const removeImageGenerationRecordsByRelation = (records: readonly ImageGenerationRecord[], relationId: string) =>
  records.filter((record) => record.relationId !== relationId);

export const removeImageGenerationRecordsByCharacter = (records: readonly ImageGenerationRecord[], characterId: string) =>
  records.filter((record) => record.characterId !== characterId);

export const removeImageGenerationRecordByMessage = (
  records: readonly ImageGenerationRecord[],
  messageId: string,
  scope?: Pick<ImageGenerationRecord, "relationId" | "conversationId" | "groupId">,
) => records.filter((record) => record.messageId !== messageId || Boolean(scope && (
  record.relationId !== scope.relationId
  || record.conversationId !== scope.conversationId
  || record.groupId !== scope.groupId
)));
