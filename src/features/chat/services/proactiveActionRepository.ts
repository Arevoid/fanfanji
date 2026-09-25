import { readArray, writeArray } from "../../../core/storage/repositories/repositoryUtils";
import { storageKeys } from "../../../core/storage/storageKeys";
import type { ProactiveActionDirective } from "./proactiveActionProtocol";

export interface ProactiveActionRecord extends ProactiveActionDirective {
  id: string;
  relationId: string;
  characterId: string;
  userIdentityId: string;
  createdAt: number;
  sourceMessageId?: string;
}

const ACTION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_ACTIONS = 40;

const isActionType = (value: unknown): value is ProactiveActionDirective["type"] => value === "call" || value === "video_call";

function normalizeRecord(value: unknown): ProactiveActionRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !raw.id
    || typeof raw.relationId !== "string" || !raw.relationId
    || typeof raw.characterId !== "string" || !raw.characterId
    || typeof raw.userIdentityId !== "string" || !raw.userIdentityId
    || !isActionType(raw.type)
    || typeof raw.reason !== "string" || !raw.reason.trim()
    || typeof raw.createdAt !== "number" || !Number.isFinite(raw.createdAt)) return undefined;
  return {
    id: raw.id,
    relationId: raw.relationId,
    characterId: raw.characterId,
    userIdentityId: raw.userIdentityId,
    type: raw.type,
    reason: raw.reason.trim().slice(0, 200),
    createdAt: raw.createdAt,
    ...(typeof raw.sourceMessageId === "string" && raw.sourceMessageId ? { sourceMessageId: raw.sourceMessageId } : {}),
  };
}

function loadPendingActions(now = Date.now()): ProactiveActionRecord[] {
  const records = readArray<unknown>(storageKeys.proactiveActions, []).value
    .map(normalizeRecord)
    .filter((record): record is ProactiveActionRecord => Boolean(record))
    .filter((record) => now - record.createdAt <= ACTION_TTL_MS)
    .sort((left, right) => left.createdAt - right.createdAt);
  return records.slice(-MAX_PENDING_ACTIONS);
}

export function enqueueProactiveAction(input: Omit<ProactiveActionRecord, "id"> & { id?: string }): ProactiveActionRecord {
  const record: ProactiveActionRecord = {
    ...input,
    id: input.id || `proactive-action-${input.relationId}-${input.createdAt}`,
  };
  const records = loadPendingActions(record.createdAt)
    .filter((candidate) => candidate.relationId !== record.relationId);
  writeArray(storageKeys.proactiveActions, [...records, record].slice(-MAX_PENDING_ACTIONS));
  return record;
}

/** Removes and returns the oldest pending action for one exact relation scope. */
export function takePendingProactiveAction(input: {
  relationId: string;
  characterId: string;
  userIdentityId: string;
  now?: number;
}): ProactiveActionRecord | undefined {
  const now = input.now ?? Date.now();
  const records = loadPendingActions(now);
  const index = records.findIndex((record) => record.relationId === input.relationId
    && record.characterId === input.characterId
    && record.userIdentityId === input.userIdentityId);
  if (index < 0) {
    // Also compact expired/invalid records when a relation is opened.
    writeArray(storageKeys.proactiveActions, records);
    return undefined;
  }
  const [match] = records.splice(index, 1);
  writeArray(storageKeys.proactiveActions, records);
  return match;
}

export function listPendingProactiveActions(now = Date.now()): ProactiveActionRecord[] {
  const records = loadPendingActions(now);
  writeArray(storageKeys.proactiveActions, records);
  return records;
}
