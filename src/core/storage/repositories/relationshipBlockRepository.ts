import { storageKeys } from "../storageKeys";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import type { BlockedDeliveryRecord, FriendRequestRecord } from "../../../domain/relationship/relationshipBlock";

export const loadBlockedDeliveries = (fallback: BlockedDeliveryRecord[] = []): StorageResult<BlockedDeliveryRecord[]> =>
  readArray(storageKeys.relationshipBlockedDeliveries, fallback);

export const saveBlockedDeliveries = (records: BlockedDeliveryRecord[]): StorageWriteResult =>
  writeArray(storageKeys.relationshipBlockedDeliveries, records.slice(-500));

export const loadFriendRequests = (fallback: FriendRequestRecord[] = []): StorageResult<FriendRequestRecord[]> =>
  readArray(storageKeys.relationshipFriendRequests, fallback);

export const saveFriendRequests = (records: FriendRequestRecord[]): StorageWriteResult =>
  writeArray(storageKeys.relationshipFriendRequests, records.slice(-200));

export const removeBlockedDeliveriesByRelation = (relationId: string): StorageWriteResult => {
  const current = loadBlockedDeliveries().value;
  return saveBlockedDeliveries(current.filter((record) => record.relationId !== relationId));
};

export const removeFriendRequestsByRelation = (relationId: string): StorageWriteResult => {
  const current = loadFriendRequests().value;
  return saveFriendRequests(current.filter((request) => request.relationId !== relationId));
};
