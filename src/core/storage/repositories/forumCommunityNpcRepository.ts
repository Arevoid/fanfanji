import type { ForumCommunityNpc } from "../../../types";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const isForumCommunityNpc = (value: unknown): value is ForumCommunityNpc => {
  if (!value || typeof value !== "object") return false;
  const npc = value as Record<string, unknown>;
  return typeof npc.id === "string"
    && typeof npc.ownerIdentityId === "string"
    && typeof npc.displayName === "string"
    && (npc.avatar === undefined || typeof npc.avatar === "string")
    && typeof npc.personaSummary === "string"
    && typeof npc.publicStyle === "string"
    && typeof npc.enabled === "boolean"
    && typeof npc.createdAt === "number"
    && typeof npc.updatedAt === "number";
};

export const loadForumCommunityNpcs = (): StorageResult<ForumCommunityNpc[]> => {
  const loaded = readArray<unknown>(storageKeys.forumCommunityNpcs, []);
  return { ...loaded, value: loaded.value.filter(isForumCommunityNpc) };
};

export const listForumCommunityNpcsForIdentity = (ownerIdentityId: string): ForumCommunityNpc[] =>
  loadForumCommunityNpcs().value
    .filter((npc) => npc.ownerIdentityId === ownerIdentityId)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));

export const saveForumCommunityNpcs = (npcs: ForumCommunityNpc[]): StorageWriteResult =>
  writeArray(storageKeys.forumCommunityNpcs, npcs);

export const upsertForumCommunityNpc = (npc: ForumCommunityNpc): StorageWriteResult => {
  const current = loadForumCommunityNpcs().value;
  const index = current.findIndex((item) => item.id === npc.id);
  const next = index < 0
    ? [...current, npc]
    : current.map((item) => item.id === npc.id ? npc : item);
  return saveForumCommunityNpcs(next);
};

export const removeForumCommunityNpc = (ownerIdentityId: string, npcId: string): StorageWriteResult =>
  saveForumCommunityNpcs(loadForumCommunityNpcs().value.filter((npc) =>
    npc.id !== npcId || npc.ownerIdentityId !== ownerIdentityId));
