import type { BeliefRecord } from "../../../domain/continuity/beliefRuntime";
import type { EmotionState } from "../../../domain/continuity/emotionRuntime";
import type { HandoffCapsule } from "../../../domain/continuity/handoffCapsule";
import type { OpenLoopRecord } from "../../../domain/continuity/openLoopRuntime";
import type { TopicRuntimeState } from "../../../domain/continuity/topicRuntime";
import { CONTINUITY_RUNTIME_SCHEMA_VERSION } from "../../../domain/continuity/continuityTypes";
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

function normalizeStore(value: unknown): ContinuityRuntimeStore {
  if (!isRecord(value)) return { ...EMPTY_STORE };
  return {
    version: CONTINUITY_RUNTIME_SCHEMA_VERSION,
    topics: Array.isArray(value.topics) ? value.topics as TopicRuntimeState[] : [],
    emotions: Array.isArray(value.emotions) ? value.emotions as EmotionState[] : [],
    beliefs: Array.isArray(value.beliefs) ? value.beliefs as BeliefRecord[] : [],
    openLoops: Array.isArray(value.openLoops) ? value.openLoops as OpenLoopRecord[] : [],
    handoffs: Array.isArray(value.handoffs) ? value.handoffs as HandoffCapsule[] : [],
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

export const continuityRuntimeRepository = {
  load: loadContinuityRuntimeStore,
  save: saveContinuityRuntimeStore,
  update: updateContinuityRuntimeStore,
};
