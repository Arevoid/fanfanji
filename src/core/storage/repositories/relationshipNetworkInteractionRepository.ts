import type { RelationshipNetworkInteractionRecord } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { storageKeys } from "../storageKeys";
import type { StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

function isInteractionRecord(value: unknown): value is RelationshipNetworkInteractionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && typeof candidate.ownerIdentityId === "string"
    && typeof candidate.socialLinkId === "string"
    && typeof candidate.sourceNpcId === "string"
    && typeof candidate.sourceCharacterId === "string"
    && (candidate.sourceRelationId === undefined || typeof candidate.sourceRelationId === "string")
    && (typeof candidate.targetCharacterId === "string") !== (typeof candidate.targetIdentityId === "string")
    && (candidate.targetCharacterId === undefined || typeof candidate.targetCharacterId === "string")
    && (candidate.targetIdentityId === undefined || typeof candidate.targetIdentityId === "string")
    && typeof candidate.targetMomentId === "string"
    && (candidate.targetCommentId === undefined || typeof candidate.targetCommentId === "string")
    && (candidate.action === "comment" || candidate.action === "like" || candidate.action === "reply")
    && (candidate.status === "completed" || candidate.status === "failed" || candidate.status === "skipped" || candidate.status === "pending")
    && (candidate.content === undefined || typeof candidate.content === "string")
    && (candidate.reason === undefined || typeof candidate.reason === "string")
    && typeof candidate.occurredAt === "number";
}

export const loadRelationshipNetworkInteractionRecords = (): RelationshipNetworkInteractionRecord[] =>
  readArray<unknown>(storageKeys.relationshipNetworkInteractionRecords, []).value.filter(isInteractionRecord);

export const listRelationshipNetworkInteractionRecordsForIdentity = (ownerIdentityId: string): RelationshipNetworkInteractionRecord[] =>
  loadRelationshipNetworkInteractionRecords()
    .filter((record) => record.ownerIdentityId === ownerIdentityId)
    .sort((left, right) => right.occurredAt - left.occurredAt || right.id.localeCompare(left.id));

export const listRelationshipNetworkInteractionRecordsForSocialLink = (
  ownerIdentityId: string,
  socialLinkId: string,
): RelationshipNetworkInteractionRecord[] =>
  listRelationshipNetworkInteractionRecordsForIdentity(ownerIdentityId)
    .filter((record) => record.socialLinkId === socialLinkId);

export const appendRelationshipNetworkInteractionRecord = (
  record: RelationshipNetworkInteractionRecord,
): StorageWriteResult => {
  const current = loadRelationshipNetworkInteractionRecords();
  const conflict = current.find((item) => item.id === record.id && item.ownerIdentityId !== record.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  if (current.some((item) => item.id === record.id)) return { success: true };
  return writeArray(storageKeys.relationshipNetworkInteractionRecords, [...current, record]);
};

export const upsertRelationshipNetworkInteractionRecord = (
  record: RelationshipNetworkInteractionRecord,
): StorageWriteResult => {
  const current = loadRelationshipNetworkInteractionRecords();
  const conflict = current.find((item) => item.id === record.id && item.ownerIdentityId !== record.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  const index = current.findIndex((item) => item.id === record.id);
  const next = index < 0 ? [...current, record] : current.map((item, itemIndex) => itemIndex === index ? record : item);
  return writeArray(storageKeys.relationshipNetworkInteractionRecords, next);
};

export const removeRelationshipNetworkInteractionRecordsForSocialLink = (
  ownerIdentityId: string,
  socialLinkId: string,
): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkInteractionRecords, loadRelationshipNetworkInteractionRecords().filter((record) =>
    record.ownerIdentityId !== ownerIdentityId || record.socialLinkId !== socialLinkId));

export const removeRelationshipNetworkInteractionRecordsForEntity = (
  ownerIdentityId: string,
  entityType: "npc" | "character",
  entityId: string,
): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkInteractionRecords, loadRelationshipNetworkInteractionRecords().filter((record) =>
    record.ownerIdentityId !== ownerIdentityId
    || (entityType === "npc" ? record.sourceNpcId !== entityId : record.targetCharacterId !== entityId)));
