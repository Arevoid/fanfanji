import {
  MOMENT_TOPIC_SCOPE,
  type CreateMomentTopicRecordInput,
  type MomentTopicQueryOptions,
  type MomentTopicRecord,
} from "./momentTopicTypes";

export const DEFAULT_MOMENT_TOPIC_LIMIT = 12;

const boundedLimit = (value: number | undefined): number =>
  Math.max(0, Math.floor(value ?? DEFAULT_MOMENT_TOPIC_LIMIT));

const isFiniteTimestamp = (value: number): boolean => Number.isFinite(value) && value >= 0;

/** Keeps topic comparison stable without changing the topic shown anywhere. */
export const normalizeMomentTopic = (topic: string): string => topic
  .trim()
  .toLocaleLowerCase()
  .replace(/[\s\u3000,，。.!！?？;；:：、"'“”‘’()[\]{}<>《》【】\-_/\\|~～]+/g, "");

/** Creates a valid public topic record without storage or side effects. */
export function createMomentTopicRecord(
  input: CreateMomentTopicRecordInput,
): MomentTopicRecord | undefined {
  const topic = input.topic.trim();
  if (!topic || !input.characterId || !input.momentId || !isFiniteTimestamp(input.generatedAt)) return undefined;
  return {
    topic,
    category: input.category,
    generatedAt: input.generatedAt,
    momentId: input.momentId,
    characterId: input.characterId,
    scope: input.scope ?? MOMENT_TOPIC_SCOPE,
  };
}

/** Appends a topic record while preserving the caller's immutable history. */
export function appendMomentTopic(
  history: readonly MomentTopicRecord[] = [],
  record: MomentTopicRecord,
): MomentTopicRecord[] {
  return [...history, record];
}

const belongsToCharacterPublicScope = (record: MomentTopicRecord, characterId: string): boolean =>
  record.characterId === characterId && record.scope === MOMENT_TOPIC_SCOPE;

/** Returns only the current character's own public topics, newest first. */
export function getRecentMomentTopics(
  history: readonly MomentTopicRecord[] = [],
  characterId: string,
  options: MomentTopicQueryOptions = {},
): MomentTopicRecord[] {
  const now = options.now ?? Date.now();
  const withinMs = options.withinMs;
  return [...history]
    .filter((record) => belongsToCharacterPublicScope(record, characterId))
    .filter((record) => isFiniteTimestamp(record.generatedAt) && record.generatedAt <= now)
    .filter((record) => withinMs === undefined || now - record.generatedAt <= Math.max(0, withinMs))
    .sort((left, right) => right.generatedAt - left.generatedAt)
    .slice(0, boundedLimit(options.limit));
}

/** Finds a current-character topic by normalized topic text. */
export function findMomentTopic(
  topic: string,
  history: readonly MomentTopicRecord[] = [],
  characterId: string,
  options: MomentTopicQueryOptions = {},
): MomentTopicRecord | undefined {
  const normalizedTopic = normalizeMomentTopic(topic);
  if (!normalizedTopic) return undefined;
  return getRecentMomentTopics(history, characterId, options)
    .find((record) => normalizeMomentTopic(record.topic) === normalizedTopic);
}
