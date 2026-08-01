import type {
  CreateProactiveTopicRecordInput,
  ProactiveTopicQueryOptions,
  ProactiveTopicRecord,
} from "./proactiveTopicTypes";

export const DEFAULT_PROACTIVE_TOPIC_LIMIT = 12;

const boundedLimit = (value: number | undefined): number =>
  Math.max(0, Math.floor(value ?? DEFAULT_PROACTIVE_TOPIC_LIMIT));

const isFiniteTimestamp = (value: number): boolean => Number.isFinite(value) && value >= 0;

/** Keeps comparisons stable without changing the topic shown to a caller. */
export const normalizeProactiveTopic = (topic: string): string => topic
  .trim()
  .toLocaleLowerCase()
  .replace(/[\s,，。.!！?？:：;；、'"“”‘’()[\]{}<>《》【】…—\-_/\\|~+]/g, "");

/** Creates a valid topic record without storage or side effects. */
export function createProactiveTopicRecord(
  input: CreateProactiveTopicRecordInput,
): ProactiveTopicRecord | undefined {
  const topic = input.topic.trim();
  if (!topic || !input.characterId || !input.relationId || !isFiniteTimestamp(input.createdAt)) return undefined;
  return {
    topic,
    category: input.category,
    createdAt: input.createdAt,
    characterId: input.characterId,
    relationId: input.relationId,
  };
}

/** Appends a record while preserving the caller's immutable history. */
export function appendProactiveTopic(
  history: readonly ProactiveTopicRecord[] = [],
  record: ProactiveTopicRecord,
): ProactiveTopicRecord[] {
  return [...history, record];
}

const belongsToScope = (
  record: ProactiveTopicRecord,
  characterId: string,
  relationId: string,
): boolean => record.characterId === characterId && record.relationId === relationId;

/** Returns only the current character/relation topics, newest first. */
export function getRecentProactiveTopics(
  history: readonly ProactiveTopicRecord[] = [],
  characterId: string,
  relationId: string,
  options: ProactiveTopicQueryOptions = {},
): ProactiveTopicRecord[] {
  const now = options.now ?? Date.now();
  const withinMs = options.withinMs;
  return [...history]
    .filter((record) => belongsToScope(record, characterId, relationId))
    .filter((record) => isFiniteTimestamp(record.createdAt) && record.createdAt <= now)
    .filter((record) => withinMs === undefined || now - record.createdAt <= Math.max(0, withinMs))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, boundedLimit(options.limit));
}

/** Finds an exact normalized topic only inside the current character/relation scope. */
export function findProactiveTopic(
  topic: string,
  history: readonly ProactiveTopicRecord[] = [],
  characterId: string,
  relationId: string,
  options: ProactiveTopicQueryOptions = {},
): ProactiveTopicRecord | undefined {
  const normalizedTopic = normalizeProactiveTopic(topic);
  if (!normalizedTopic) return undefined;
  return getRecentProactiveTopics(history, characterId, relationId, options)
    .find((record) => normalizeProactiveTopic(record.topic) === normalizedTopic);
}
