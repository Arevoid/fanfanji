import type {
  RelationshipNetworkMap,
  RelationshipNetworkNpc,
  RelationshipNetworkNode,
  RelationshipNetworkEdge,
} from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { RELATIONSHIP_NETWORK_SCHEMA_VERSION } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNode(value: unknown): value is RelationshipNetworkNode {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && (value.entityType === "identity" || value.entityType === "character" || value.entityType === "npc")
    && typeof value.entityId === "string"
    && Number.isFinite(value.x)
    && Number.isFinite(value.y);
}

function isEdge(value: unknown): value is RelationshipNetworkEdge {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.sourceNodeId === "string"
    && typeof value.targetNodeId === "string"
    && (value.direction === "forward" || value.direction === "reverse" || value.direction === "both")
    && (value.forwardLabel === undefined || typeof value.forwardLabel === "string")
    && (value.reverseLabel === undefined || typeof value.reverseLabel === "string")
    && (value.category === undefined || typeof value.category === "string")
    && (value.note === undefined || typeof value.note === "string")
    && typeof value.createdAt === "number"
    && typeof value.updatedAt === "number";
}

function normalizeMap(value: unknown): RelationshipNetworkMap | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.ownerIdentityId !== "string" || typeof value.name !== "string") return null;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return null;

  const nodes = value.nodes.filter(isNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = value.edges.filter(isEdge).filter((edge) =>
    edge.sourceNodeId !== edge.targetNodeId
      && nodeIds.has(edge.sourceNodeId)
      && nodeIds.has(edge.targetNodeId));

  return {
    id: value.id,
    ownerIdentityId: value.ownerIdentityId,
    name: value.name,
    nodes,
    edges,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    schemaVersion: RELATIONSHIP_NETWORK_SCHEMA_VERSION,
  };
}

function isNpc(value: unknown): value is RelationshipNetworkNpc {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.ownerIdentityId === "string"
    && typeof value.name === "string"
    && (value.avatar === undefined || typeof value.avatar === "string")
    && typeof value.summary === "string"
    && (value.role === undefined || typeof value.role === "string")
    && (value.personality === undefined || typeof value.personality === "string")
    && (value.motivation === undefined || typeof value.motivation === "string")
    && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")))
    && (value.linkedCharacterId === undefined || typeof value.linkedCharacterId === "string")
    && (value.momentApprovalMode === undefined || value.momentApprovalMode === "automatic" || value.momentApprovalMode === "confirm")
    && (value.momentAutoMode === undefined || value.momentAutoMode === "manual" || value.momentAutoMode === "scheduled" || value.momentAutoMode === "event" || value.momentAutoMode === "scheduled_and_event")
    && (value.momentAutoFrequency === undefined || value.momentAutoFrequency === "low" || value.momentAutoFrequency === "normal" || value.momentAutoFrequency === "high")
    && typeof value.createdAt === "number"
    && typeof value.updatedAt === "number";
}

export const loadRelationshipNetworkMaps = (): StorageResult<RelationshipNetworkMap[]> => {
  const loaded = readArray<unknown>(storageKeys.relationshipNetworkMaps, []);
  return { ...loaded, value: loaded.value.map(normalizeMap).filter((map): map is RelationshipNetworkMap => Boolean(map)) };
};

export const listRelationshipNetworkMapsForIdentity = (ownerIdentityId: string): RelationshipNetworkMap[] =>
  loadRelationshipNetworkMaps().value
    .filter((map) => map.ownerIdentityId === ownerIdentityId)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));

export const saveRelationshipNetworkMaps = (maps: RelationshipNetworkMap[]): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkMaps, maps);

export const upsertRelationshipNetworkMap = (map: RelationshipNetworkMap): StorageWriteResult => {
  const current = loadRelationshipNetworkMaps().value;
  const conflict = current.find((item) => item.id === map.id && item.ownerIdentityId !== map.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  const index = current.findIndex((item) => item.id === map.id);
  const next = index < 0 ? [...current, map] : current.map((item) => item.id === map.id ? map : item);
  return saveRelationshipNetworkMaps(next);
};

export const loadRelationshipNetworkNpcs = (): StorageResult<RelationshipNetworkNpc[]> => {
  const loaded = readArray<unknown>(storageKeys.relationshipNetworkNpcs, []);
  return { ...loaded, value: loaded.value.filter(isNpc) };
};

export const listRelationshipNetworkNpcsForIdentity = (ownerIdentityId: string): RelationshipNetworkNpc[] =>
  loadRelationshipNetworkNpcs().value
    .filter((npc) => npc.ownerIdentityId === ownerIdentityId)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));

export const saveRelationshipNetworkNpcs = (npcs: RelationshipNetworkNpc[]): StorageWriteResult =>
  writeArray(storageKeys.relationshipNetworkNpcs, npcs);

export const upsertRelationshipNetworkNpc = (npc: RelationshipNetworkNpc): StorageWriteResult => {
  const current = loadRelationshipNetworkNpcs().value;
  const conflict = current.find((item) => item.id === npc.id && item.ownerIdentityId !== npc.ownerIdentityId);
  if (conflict) return { success: false, error: "scope" };
  const index = current.findIndex((item) => item.id === npc.id);
  const next = index < 0 ? [...current, npc] : current.map((item) => item.id === npc.id ? npc : item);
  return saveRelationshipNetworkNpcs(next);
};

export const removeRelationshipNetworkNpc = (ownerIdentityId: string, npcId: string): StorageWriteResult =>
  saveRelationshipNetworkNpcs(loadRelationshipNetworkNpcs().value.filter((npc) =>
    npc.id !== npcId || npc.ownerIdentityId !== ownerIdentityId));
