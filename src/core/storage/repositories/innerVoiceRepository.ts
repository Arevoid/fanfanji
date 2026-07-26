import type { InnerVoiceRecord } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadInnerVoiceRecords = (): StorageResult<InnerVoiceRecord[]> =>
  readArray<InnerVoiceRecord>(storageKeys.innerVoiceRecords, []);

export const saveInnerVoiceRecords = (records: InnerVoiceRecord[]): StorageWriteResult =>
  writeArray(storageKeys.innerVoiceRecords, records);

export const findInnerVoiceByMessage = (characterId: string, messageId: string): InnerVoiceRecord | undefined =>
  loadInnerVoiceRecords().value.find((record) => record.characterId === characterId && record.messageId === messageId);

const isDefaultLegacyRelation = (relationId: string) => relationId.endsWith(":identity-1");

/** Relation-scoped lookup prevents one identity from reusing another's reflection. */
export const findInnerVoiceByRelationAndMessage = (relationId: string, messageId: string): InnerVoiceRecord | undefined =>
  loadInnerVoiceRecords().value.find((record) =>
    record.messageId === messageId
    && (record.relationId === relationId || (!record.relationId && isDefaultLegacyRelation(relationId))),
  );

export const listInnerVoicesByCharacter = (characterId: string, limit = 20): InnerVoiceRecord[] =>
  loadInnerVoiceRecords()
    .value
    .filter((record) => record.characterId === characterId)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, Math.max(0, limit));

export const listInnerVoicesByRelation = (relationId: string, limit = 20): InnerVoiceRecord[] =>
  loadInnerVoiceRecords()
    .value
    .filter((record) => record.relationId === relationId || (!record.relationId && isDefaultLegacyRelation(relationId)))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, Math.max(0, limit));

export const deleteInnerVoicesByCharacter = (characterId: string): StorageWriteResult => {
  const records = loadInnerVoiceRecords().value;
  return saveInnerVoiceRecords(records.filter((record) => record.characterId !== characterId));
};

export const deleteInnerVoicesByRelation = (relationId: string): StorageWriteResult => {
  const records = loadInnerVoiceRecords().value;
  return saveInnerVoiceRecords(records.filter((record) =>
    record.relationId !== relationId
    && !(!record.relationId && isDefaultLegacyRelation(relationId)),
  ));
};

export const updateInnerVoiceRecord = (record: InnerVoiceRecord): StorageWriteResult => {
  const records = loadInnerVoiceRecords().value;
  return saveInnerVoiceRecords(records.map((item) => item.id === record.id ? record : item));
};
