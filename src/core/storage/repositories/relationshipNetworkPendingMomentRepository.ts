import type { Moment, MomentComment } from "../../../types";
import type { RelationshipNetworkPendingMoment } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMomentComment(value: unknown): value is MomentComment {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && (value.characterId === undefined || typeof value.characterId === "string")
    && (value.relationId === undefined || typeof value.relationId === "string")
    && typeof value.authorName === "string"
    && typeof value.authorAvatar === "string"
    && typeof value.content === "string"
    && Number.isFinite(value.timestamp)
    && (value.replyToCommentId === undefined || typeof value.replyToCommentId === "string");
}

function isMoment(value: unknown): value is Moment {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && (value.characterId === undefined || typeof value.characterId === "string")
    && (value.relationId === undefined || typeof value.relationId === "string")
    && (value.relationshipNetworkNpcId === undefined || typeof value.relationshipNetworkNpcId === "string")
    && typeof value.authorName === "string"
    && typeof value.authorAvatar === "string"
    && typeof value.content === "string"
    && Number.isFinite(value.timestamp)
    && Array.isArray(value.likes)
    && value.likes.every((like) => typeof like === "string")
    && Array.isArray(value.comments)
    && value.comments.every(isMomentComment)
    && (value.deletedCommentIds === undefined || (Array.isArray(value.deletedCommentIds) && value.deletedCommentIds.every((id) => typeof id === "string")))
    && (value.image === undefined || typeof value.image === "string")
    && (value.imageWidth === undefined || Number.isFinite(value.imageWidth))
    && (value.imageHeight === undefined || Number.isFinite(value.imageHeight))
    && (value.imageType === undefined || value.imageType === "photo" || value.imageType === "text")
    && (value.imageDescription === undefined || typeof value.imageDescription === "string")
    && (value.ownerIdentityId === undefined || typeof value.ownerIdentityId === "string");
}

function isPendingMoment(value: unknown): value is RelationshipNetworkPendingMoment {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.ownerIdentityId === "string"
    && typeof value.npcId === "string"
    && typeof value.sourceCharacterId === "string"
    && typeof value.sourceRelationId === "string"
    && isMoment(value.moment)
    && typeof value.createdAt === "number";
}

export const loadRelationshipNetworkPendingMoments = (): StorageResult<RelationshipNetworkPendingMoment[]> => {
  const loaded = readArray<unknown>(storageKeys.relationshipNetworkPendingMoments, []);
  return { ...loaded, value: loaded.value.filter(isPendingMoment) };
};

export const listRelationshipNetworkPendingMomentsForIdentity = (ownerIdentityId: string): RelationshipNetworkPendingMoment[] =>
  loadRelationshipNetworkPendingMoments().value
    .filter((pending) => pending.ownerIdentityId === ownerIdentityId)
    .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));

export const appendRelationshipNetworkPendingMoment = (
  pending: RelationshipNetworkPendingMoment,
): StorageWriteResult => {
  const current = loadRelationshipNetworkPendingMoments().value;
  const conflict = current.find((item) => item.id === pending.id && item.ownerIdentityId !== pending.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  if (current.some((item) => item.id === pending.id)) return { success: true };
  return writeArray(storageKeys.relationshipNetworkPendingMoments, [...current, pending]);
};

export const removeRelationshipNetworkPendingMoment = (
  ownerIdentityId: string,
  pendingId: string,
): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkPendingMoments, loadRelationshipNetworkPendingMoments().value.filter((pending) =>
    pending.id !== pendingId || pending.ownerIdentityId !== ownerIdentityId));
