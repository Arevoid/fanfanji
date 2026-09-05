import {
  findProactiveTopic,
} from "./proactiveTopicHistory";
import type {
  ProactiveTopicPolicyOptions,
  ProactiveTopicRecord,
} from "./proactiveTopicTypes";

export const DEFAULT_PROACTIVE_TOPIC_DUPLICATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const DEFAULT_PROACTIVE_TOPIC_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Exact normalized repetition within the current character/relation scope. */
export function isDuplicateProactiveTopic(
  topic: string,
  history: readonly ProactiveTopicRecord[] = [],
  characterId: string,
  relationId: string,
  options: ProactiveTopicPolicyOptions = {},
): boolean {
  return Boolean(findProactiveTopic(topic, history, characterId, relationId, {
    ...options,
    withinMs: options.withinMs ?? options.duplicateWindowMs ?? DEFAULT_PROACTIVE_TOPIC_DUPLICATE_WINDOW_MS,
  }));
}

/** Prevents the same normalized topic from being reused during its cooldown. */
export function isProactiveTopicCoolingDown(
  topic: string,
  history: readonly ProactiveTopicRecord[] = [],
  characterId: string,
  relationId: string,
  options: ProactiveTopicPolicyOptions = {},
): boolean {
  return Boolean(findProactiveTopic(topic, history, characterId, relationId, {
    ...options,
    withinMs: options.withinMs ?? options.cooldownMs ?? DEFAULT_PROACTIVE_TOPIC_COOLDOWN_MS,
  }));
}
