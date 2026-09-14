import type { BeliefRecord } from "../../../domain/continuity/beliefRuntime";
import type { EmotionState } from "../../../domain/continuity/emotionRuntime";
import type { HandoffCapsule } from "../../../domain/continuity/handoffCapsule";
import type { OpenLoopRecord } from "../../../domain/continuity/openLoopRuntime";
import type { TopicRuntimeState } from "../../../domain/continuity/topicRuntime";
import { CONTINUITY_RUNTIME_SCHEMA_VERSION, isContinuityScope, sameContinuityScope, type ContinuityScope } from "../../../domain/continuity/continuityTypes";
import { isHandoffCapsule } from "../../../domain/continuity/handoffCapsule";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export interface ContinuityRuntimeStore {
  version: typeof CONTINUITY_RUNTIME_SCHEMA_VERSION;
  topics: TopicRuntimeState[];
  emotions: EmotionState[];
  beliefs: BeliefRecord[];
  openLoops: OpenLoopRecord[];
  handoffs: HandoffCapsule[];
}

const EMPTY_STORE: ContinuityRuntimeStore = {
  version: CONTINUITY_RUNTIME_SCHEMA_VERSION,
  topics: [],
  emotions: [],
  beliefs: [],
  openLoops: [],
  handoffs: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isScopedV1 = (value: unknown): value is Record<string, unknown> & { version: 1; scope: { characterId: string; relationId: string; userIdentityId: string } } =>
  isRecord(value) && value.version === CONTINUITY_RUNTIME_SCHEMA_VERSION && isContinuityScope(value.scope);
const isTopic = (value: unknown): value is TopicRuntimeState =>
  isScopedV1(value) && Array.isArray(value.topicHistory) && Array.isArray(value.latestRelevantMessageRefs) && typeof value.updatedAt === "number";
const isEmotion = (value: unknown): value is EmotionState =>
  isScopedV1(value) && typeof value.baseline === "string" && typeof value.current === "string"
  && typeof value.intensity === "number" && typeof value.updatedAt === "number";
const isBelief = (value: unknown): value is BeliefRecord =>
  isScopedV1(value) && typeof value.id === "string" && typeof value.proposition === "string"
  && typeof value.confidence === "number" && typeof value.updatedAt === "number";
const isOpenLoop = (value: unknown): value is OpenLoopRecord =>
  isScopedV1(value) && typeof value.id === "string" && typeof value.description === "string"
  && typeof value.status === "string" && typeof value.updatedAt === "number";

function normalizeStore(value: unknown): ContinuityRuntimeStore {
  if (!isRecord(value)) return { ...EMPTY_STORE };
  return {
    version: CONTINUITY_RUNTIME_SCHEMA_VERSION,
    topics: Array.isArray(value.topics) ? value.topics.filter(isTopic) : [],
    emotions: Array.isArray(value.emotions) ? value.emotions.filter(isEmotion) : [],
    beliefs: Array.isArray(value.beliefs) ? value.beliefs.filter(isBelief) : [],
    openLoops: Array.isArray(value.openLoops) ? value.openLoops.filter(isOpenLoop) : [],
    handoffs: Array.isArray(value.handoffs) ? value.handoffs.filter(isHandoffCapsule) : [],
  };
}

export function loadContinuityRuntimeStore(): StorageResult<ContinuityRuntimeStore> {
  const result = readJson<unknown>(storageKeys.continuityRuntime, EMPTY_STORE);
  return { ...result, value: normalizeStore(result.value) };
}

export function saveContinuityRuntimeStore(store: ContinuityRuntimeStore): StorageWriteResult {
  return writeJson(storageKeys.continuityRuntime, normalizeStore(store));
}

export function updateContinuityRuntimeStore(
  update: (store: ContinuityRuntimeStore) => ContinuityRuntimeStore,
): StorageWriteResult {
  return saveContinuityRuntimeStore(update(loadContinuityRuntimeStore().value));
}

/** Removes only continuity records owned by the explicitly deleted relations. */
export function removeContinuityRuntimeForRelations(relationIds: readonly string[]): StorageWriteResult {
  const ids = new Set(relationIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()));
  if (ids.size === 0) return { success: true };
  return updateContinuityRuntimeStore((store) => ({
    ...store,
    topics: store.topics.filter((record) => !ids.has(record.scope.relationId)),
    emotions: store.emotions.filter((record) => !ids.has(record.scope.relationId)),
    beliefs: store.beliefs.filter((record) => !ids.has(record.scope.relationId)),
    openLoops: store.openLoops.filter((record) => !ids.has(record.scope.relationId)),
    handoffs: store.handoffs.filter((record) => !ids.has(record.scope.relationId)),
  }));
}

export function upsertHandoffCapsule(capsule: HandoffCapsule): StorageWriteResult {
  return updateContinuityRuntimeStore((store) => ({
    ...store,
    handoffs: [
      ...store.handoffs.filter((item) => item.id !== capsule.id),
      capsule,
    ].slice(-64),
  }));
}

export function listHandoffCapsules(scope: ContinuityScope): HandoffCapsule[] {
  return loadContinuityRuntimeStore().value.handoffs
    .filter((capsule) => sameContinuityScope(capsule.scope, scope))
    .sort((left, right) => right.exitTimestamp - left.exitTimestamp);
}

export const continuityRuntimeRepository = {
  load: loadContinuityRuntimeStore,
  save: saveContinuityRuntimeStore,
  update: updateContinuityRuntimeStore,
  removeForRelations: removeContinuityRuntimeForRelations,
  upsertHandoff: upsertHandoffCapsule,
  listHandoffs: listHandoffCapsules,
};
