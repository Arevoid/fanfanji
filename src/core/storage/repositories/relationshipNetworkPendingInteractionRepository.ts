import type { RelationshipNetworkPendingInteraction } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

function isPendingInteraction(value: unknown): value is RelationshipNetworkPendingInteraction {
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
    && (candidate.action === "comment" || candidate.action === "reply")
    && typeof candidate.content === "string"
    && typeof candidate.authorName === "string"
    && typeof candidate.authorAvatar === "string"
    && (candidate.replyToCommentId === undefined || typeof candidate.replyToCommentId === "string")
    && typeof candidate.createdAt === "number";
}

export const loadRelationshipNetworkPendingInteractions = (): StorageResult<RelationshipNetworkPendingInteraction[]> => {
  const loaded = readArray<unknown>(storageKeys.relationshipNetworkPendingInteractions, []);
  return { ...loaded, value: loaded.value.filter(isPendingInteraction) };
};

export const listRelationshipNetworkPendingInteractionsForIdentity = (ownerIdentityId: string): RelationshipNetworkPendingInteraction[] =>
  loadRelationshipNetworkPendingInteractions().value
    .filter((interaction) => interaction.ownerIdentityId === ownerIdentityId)
    .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));

export const appendRelationshipNetworkPendingInteraction = (
  interaction: RelationshipNetworkPendingInteraction,
): StorageWriteResult => {
  const current = loadRelationshipNetworkPendingInteractions().value;
  const conflict = current.find((item) => item.id === interaction.id && item.ownerIdentityId !== interaction.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  if (current.some((item) => item.id === interaction.id)) return { success: true };
  return writeArray(storageKeys.relationshipNetworkPendingInteractions, [...current, interaction]);
};

export const removeRelationshipNetworkPendingInteraction = (
  ownerIdentityId: string,
  interactionId: string,
): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkPendingInteractions, loadRelationshipNetworkPendingInteractions().value.filter((interaction) =>
    interaction.id !== interactionId || interaction.ownerIdentityId !== ownerIdentityId));

export const removeRelationshipNetworkPendingInteractionsForMoment = (
  ownerIdentityId: string,
  momentId: string,
): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkPendingInteractions, loadRelationshipNetworkPendingInteractions().value.filter((interaction) =>
    interaction.ownerIdentityId !== ownerIdentityId || interaction.targetMomentId !== momentId));
