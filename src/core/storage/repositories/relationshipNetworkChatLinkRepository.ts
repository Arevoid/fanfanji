import type { RelationshipNetworkChatLink } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { storageKeys } from "../storageKeys";
import type { StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

function isLink(value: unknown): value is RelationshipNetworkChatLink {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.ownerIdentityId === "string"
    && typeof candidate.npcId === "string"
    && typeof candidate.characterId === "string"
    && typeof candidate.relationId === "string"
    && typeof candidate.createdAt === "number"
    && typeof candidate.updatedAt === "number";
}

export const loadRelationshipNetworkChatLinks = (): RelationshipNetworkChatLink[] =>
  readArray<unknown>(storageKeys.relationshipNetworkChatLinks, []).value.filter(isLink);

export const listRelationshipNetworkChatLinksForIdentity = (ownerIdentityId: string): RelationshipNetworkChatLink[] =>
  loadRelationshipNetworkChatLinks()
    .filter((link) => link.ownerIdentityId === ownerIdentityId)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.npcId.localeCompare(right.npcId));

export const findRelationshipNetworkChatLink = (ownerIdentityId: string, npcId: string): RelationshipNetworkChatLink | undefined =>
  loadRelationshipNetworkChatLinks().find((link) => link.ownerIdentityId === ownerIdentityId && link.npcId === npcId);

export const upsertRelationshipNetworkChatLink = (link: RelationshipNetworkChatLink): StorageWriteResult => {
  const current = loadRelationshipNetworkChatLinks();
  const conflict = current.find((item) => item.npcId === link.npcId && item.ownerIdentityId !== link.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  const index = current.findIndex((item) => item.ownerIdentityId === link.ownerIdentityId && item.npcId === link.npcId);
  const next = index < 0
    ? [...current, link]
    : current.map((item, itemIndex) => itemIndex === index ? link : item);
  return writeArray(storageKeys.relationshipNetworkChatLinks, next);
};
