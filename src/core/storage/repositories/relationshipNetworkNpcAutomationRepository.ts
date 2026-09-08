import { storageKeys } from "../storageKeys";
import type { StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

export interface RelationshipNetworkNpcAutomationState {
  ownerIdentityId: string;
  npcId: string;
  lastAttemptKey?: string;
  lastAttemptAt?: number;
  lastPublishedAt?: number;
  updatedAt: number;
}

function isState(value: unknown): value is RelationshipNetworkNpcAutomationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.ownerIdentityId === "string"
    && typeof candidate.npcId === "string"
    && (candidate.lastAttemptKey === undefined || typeof candidate.lastAttemptKey === "string")
    && (candidate.lastAttemptAt === undefined || typeof candidate.lastAttemptAt === "number")
    && (candidate.lastPublishedAt === undefined || typeof candidate.lastPublishedAt === "number")
    && typeof candidate.updatedAt === "number";
}

export const loadRelationshipNetworkNpcAutomationStates = (): RelationshipNetworkNpcAutomationState[] =>
  readArray<unknown>(storageKeys.relationshipNetworkNpcAutomationStates, []).value.filter(isState);

export const listRelationshipNetworkNpcAutomationStatesForIdentity = (ownerIdentityId: string): RelationshipNetworkNpcAutomationState[] =>
  loadRelationshipNetworkNpcAutomationStates().filter((state) => state.ownerIdentityId === ownerIdentityId);

export const findRelationshipNetworkNpcAutomationState = (
  ownerIdentityId: string,
  npcId: string,
): RelationshipNetworkNpcAutomationState | undefined =>
  loadRelationshipNetworkNpcAutomationStates().find((state) =>
    state.ownerIdentityId === ownerIdentityId && state.npcId === npcId);

export const upsertRelationshipNetworkNpcAutomationState = (
  state: RelationshipNetworkNpcAutomationState,
): StorageWriteResult => {
  const current = loadRelationshipNetworkNpcAutomationStates();
  const conflict = current.find((item) => item.npcId === state.npcId && item.ownerIdentityId !== state.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  const index = current.findIndex((item) => item.ownerIdentityId === state.ownerIdentityId && item.npcId === state.npcId);
  const next = index < 0 ? [...current, state] : current.map((item, itemIndex) => itemIndex === index ? state : item);
  return writeArray(storageKeys.relationshipNetworkNpcAutomationStates, next);
};

export const removeRelationshipNetworkNpcAutomationState = (
  ownerIdentityId: string,
  npcId: string,
): StorageWriteResult => writeArray(
  storageKeys.relationshipNetworkNpcAutomationStates,
  loadRelationshipNetworkNpcAutomationStates().filter((state) =>
    state.ownerIdentityId !== ownerIdentityId || state.npcId !== npcId),
);
