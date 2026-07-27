import type { InnerVoiceRecord } from "../../../types";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

export const loadInnerVoiceRecords = (fallback: InnerVoiceRecord[] = []): StorageResult<InnerVoiceRecord[]> =>
  readArray(storageKeys.innerVoiceRecords, fallback);

export const saveInnerVoiceRecords = (records: InnerVoiceRecord[]): StorageWriteResult =>
  writeArray(storageKeys.innerVoiceRecords, records);

export type InnerVoiceScope =
  | { kind: "direct"; relationId: string; messageId: string }
  | { kind: "group"; groupId: string; conversationId: string; characterId: string; messageId: string };

/** Finds one record within its direct relationship or group conversation boundary. */
export const findInnerVoiceByMessage = (
  records: readonly InnerVoiceRecord[],
  scope: InnerVoiceScope,
): InnerVoiceRecord | undefined => records.find((record) => scope.kind === "direct"
  ? record.relationId === scope.relationId && record.messageId === scope.messageId
  : record.groupId === scope.groupId
    && record.conversationId === scope.conversationId
    && record.characterId === scope.characterId
    && record.messageId === scope.messageId,
);

/** Returns only the newest records needed by the history UI. */
export const listInnerVoicesByCharacter = (
  records: readonly InnerVoiceRecord[],
  characterId: string,
  limit = 10,
): InnerVoiceRecord[] => records
  .filter((record) => record.characterId === characterId)
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, limit);

export const listInnerVoicesByRelation = (
  records: readonly InnerVoiceRecord[],
  relationId: string,
  limit = 10,
): InnerVoiceRecord[] => records
  .filter((record) => record.relationId === relationId)
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, limit);

export const listInnerVoicesByGroup = (
  records: readonly InnerVoiceRecord[],
  groupId: string,
  conversationId: string,
  characterId: string,
  limit = 10,
): InnerVoiceRecord[] => records
  .filter((record) => record.groupId === groupId
    && record.conversationId === conversationId
    && record.characterId === characterId)
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, limit);

export const removeInnerVoicesByRelation = (
  records: readonly InnerVoiceRecord[],
  relationId: string,
): InnerVoiceRecord[] => records.filter((record) => record.relationId !== relationId);

export const removeInnerVoicesByCharacter = (
  records: readonly InnerVoiceRecord[],
  characterId: string,
): InnerVoiceRecord[] => records.filter((record) => record.characterId !== characterId);
