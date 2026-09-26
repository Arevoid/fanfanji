import {
  loadBlockedDeliveries as loadBlockedDeliveryRecords,
  loadFriendRequests as loadFriendRequestRecords,
  removeBlockedDeliveriesByRelation as removeBlockedDeliveriesByRelationRecords,
  removeFriendRequestsByRelation as removeFriendRequestsByRelationRecords,
  saveBlockedDeliveries as persistBlockedDeliveries,
  saveFriendRequests as persistFriendRequests,
} from "../../../core/storage/repositories/relationshipBlockRepository";
import type { BlockedDeliveryRecord, FriendRequestRecord } from "../../../domain/relationship/relationshipBlock";

export const loadBlockedDeliveries = (fallback: BlockedDeliveryRecord[] = []) => loadBlockedDeliveryRecords(fallback);
export const saveBlockedDeliveries = (records: BlockedDeliveryRecord[]) => persistBlockedDeliveries(records);
export const loadFriendRequests = (fallback: FriendRequestRecord[] = []) => loadFriendRequestRecords(fallback);
export const saveFriendRequests = (records: FriendRequestRecord[]) => persistFriendRequests(records);
export const removeBlockedDeliveriesByRelation = (relationId: string) => removeBlockedDeliveriesByRelationRecords(relationId);
export const removeFriendRequestsByRelation = (relationId: string) => removeFriendRequestsByRelationRecords(relationId);
