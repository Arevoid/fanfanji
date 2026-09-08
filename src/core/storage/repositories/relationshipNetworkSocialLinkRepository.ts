import type { RelationshipNetworkSocialLink } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { storageKeys } from "../storageKeys";
import type { StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

function isEntityType(value: unknown): boolean {
  return value === "identity" || value === "character" || value === "npc";
}

function isSocialLink(value: unknown): value is RelationshipNetworkSocialLink {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && typeof candidate.ownerIdentityId === "string"
    && isEntityType(candidate.sourceEntityType)
    && typeof candidate.sourceEntityId === "string"
    && isEntityType(candidate.targetEntityType)
    && typeof candidate.targetEntityId === "string"
    && typeof candidate.relationshipLabel === "string"
    && typeof candidate.enabled === "boolean"
    && typeof candidate.canViewMoments === "boolean"
    && typeof candidate.canCommentMoments === "boolean"
    && (candidate.canLikeMoments === undefined || typeof candidate.canLikeMoments === "boolean")
    && (candidate.canReplyMoments === undefined || typeof candidate.canReplyMoments === "boolean")
    && (candidate.interactionApprovalMode === undefined || candidate.interactionApprovalMode === "automatic" || candidate.interactionApprovalMode === "confirm")
    && (candidate.commentFrequency === "low" || candidate.commentFrequency === "normal" || candidate.commentFrequency === "high")
    && (candidate.networkEdgeId === undefined || typeof candidate.networkEdgeId === "string")
    && typeof candidate.createdAt === "number"
    && typeof candidate.updatedAt === "number";
}

export const loadRelationshipNetworkSocialLinks = (): RelationshipNetworkSocialLink[] =>
  readArray<unknown>(storageKeys.relationshipNetworkSocialLinks, []).value.filter(isSocialLink);

export const listRelationshipNetworkSocialLinksForIdentity = (ownerIdentityId: string): RelationshipNetworkSocialLink[] =>
  loadRelationshipNetworkSocialLinks()
    .filter((link) => link.ownerIdentityId === ownerIdentityId)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));

export const findRelationshipNetworkSocialLinkByEdge = (ownerIdentityId: string, networkEdgeId: string): RelationshipNetworkSocialLink | undefined =>
  loadRelationshipNetworkSocialLinks().find((link) => link.ownerIdentityId === ownerIdentityId && link.networkEdgeId === networkEdgeId);

export const upsertRelationshipNetworkSocialLink = (link: RelationshipNetworkSocialLink): StorageWriteResult => {
  const current = loadRelationshipNetworkSocialLinks();
  const conflict = current.find((item) => item.id === link.id && item.ownerIdentityId !== link.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  const index = current.findIndex((item) => item.id === link.id);
  const next = index < 0
    ? [...current, link]
    : current.map((item, itemIndex) => itemIndex === index ? link : item);
  return writeArray(storageKeys.relationshipNetworkSocialLinks, next);
};

export const removeRelationshipNetworkSocialLink = (ownerIdentityId: string, linkId: string): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkSocialLinks, loadRelationshipNetworkSocialLinks().filter((link) =>
    link.id !== linkId || link.ownerIdentityId !== ownerIdentityId));

export const removeRelationshipNetworkSocialLinksForEntity = (
  ownerIdentityId: string,
  entityType: RelationshipNetworkSocialLink["sourceEntityType"],
  entityId: string,
): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkSocialLinks, loadRelationshipNetworkSocialLinks().filter((link) =>
    link.ownerIdentityId !== ownerIdentityId
    || (link.sourceEntityType !== entityType && link.targetEntityType !== entityType)
    || (link.sourceEntityId !== entityId && link.targetEntityId !== entityId)));
