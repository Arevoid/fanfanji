import {
  findMomentTopic,
  getRecentMomentTopics,
  normalizeMomentTopic,
} from "./momentTopicHistory";
import type {
  MomentTopicDecision,
  MomentTopicPolicyOptions,
  MomentTopicRecord,
} from "./momentTopicTypes";

export const DEFAULT_MOMENT_TOPIC_DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_MOMENT_TOPIC_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MOMENT_TOPIC_SIMILAR_THRESHOLD = 0.72;

const createNgrams = (value: string, size: number): Set<string> => {
  if (value.length <= size) return value ? new Set([value]) : new Set();
  const grams = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) grams.add(value.slice(index, index + size));
  return grams;
};

const jaccardSimilarity = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  left.forEach((gram) => {
    if (right.has(gram)) intersection += 1;
  });
  return intersection / (left.size + right.size - intersection);
};

const longestCommonSubsequenceLength = (left: string, right: string): number => {
  const previous = new Array<number>(right.length + 1).fill(0);
  for (const leftCharacter of left) {
    let diagonal = 0;
    for (let index = 1; index <= right.length; index += 1) {
      const saved = previous[index];
      previous[index] = leftCharacter === right[index - 1]
        ? diagonal + 1
        : Math.max(previous[index], previous[index - 1]);
      diagonal = saved;
    }
  }
  return previous[right.length];
};

/** Compares short topic labels, allowing punctuation/case-only changes. */
export function calculateMomentTopicSimilarity(leftTopic: string, rightTopic: string): number {
  const left = normalizeMomentTopic(leftTopic);
  const right = normalizeMomentTopic(rightTopic);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 4 && right.length >= 4) {
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    if (longer.includes(shorter)) return shorter.length / longer.length;
  }
  const ngramSimilarity = jaccardSimilarity(createNgrams(left, 2), createNgrams(right, 2));
  const sequenceSimilarity = longestCommonSubsequenceLength(left, right) / Math.max(left.length, right.length);
  return Math.max(ngramSimilarity, sequenceSimilarity);
}

/** Exact normalized topic repetition within the current character's recent history. */
export function isDuplicateMomentTopic(
  topic: string,
  history: readonly MomentTopicRecord[] = [],
  characterId: string,
  options: MomentTopicPolicyOptions = {},
): boolean {
  return Boolean(findMomentTopic(topic, history, characterId, {
    ...options,
    withinMs: options.withinMs ?? options.duplicateWindowMs ?? DEFAULT_MOMENT_TOPIC_DUPLICATE_WINDOW_MS,
  }));
}

/** Similar topics are evaluated only against the current character's public history. */
export function isSimilarMomentTopic(
  topic: string,
  history: readonly MomentTopicRecord[] = [],
  characterId: string,
  options: MomentTopicPolicyOptions = {},
): boolean {
  const threshold = options.similarThreshold ?? DEFAULT_MOMENT_TOPIC_SIMILAR_THRESHOLD;
  return getRecentMomentTopics(history, characterId, {
    ...options,
    withinMs: options.withinMs ?? options.duplicateWindowMs ?? DEFAULT_MOMENT_TOPIC_DUPLICATE_WINDOW_MS,
  }).some((record) => calculateMomentTopicSimilarity(topic, record.topic) >= threshold);
}

/** Prevents the same normalized topic from being selected during its cooldown. */
export function isMomentTopicCoolingDown(
  topic: string,
  history: readonly MomentTopicRecord[] = [],
  characterId: string,
  options: MomentTopicPolicyOptions = {},
): boolean {
  return Boolean(findMomentTopic(topic, history, characterId, {
    ...options,
    withinMs: options.cooldownMs ?? DEFAULT_MOMENT_TOPIC_COOLDOWN_MS,
  }));
}

/** Gives generation code one explainable decision without creating side effects. */
export function evaluateMomentTopic(
  topic: string,
  history: readonly MomentTopicRecord[] = [],
  characterId: string,
  options: MomentTopicPolicyOptions = {},
): MomentTopicDecision {
  const cooldownTopic = isMomentTopicCoolingDown(topic, history, characterId, options);
  if (cooldownTopic) {
    return { avoid: true, reason: "cooldown", matchedTopic: findMomentTopic(topic, history, characterId, { ...options, withinMs: options.cooldownMs ?? DEFAULT_MOMENT_TOPIC_COOLDOWN_MS }) };
  }
  const duplicateTopic = findMomentTopic(topic, history, characterId, {
    ...options,
    withinMs: options.duplicateWindowMs ?? DEFAULT_MOMENT_TOPIC_DUPLICATE_WINDOW_MS,
  });
  if (duplicateTopic) return { avoid: true, reason: "duplicate", matchedTopic: duplicateTopic };
  const similarTopic = getRecentMomentTopics(history, characterId, {
    ...options,
    withinMs: options.duplicateWindowMs ?? DEFAULT_MOMENT_TOPIC_DUPLICATE_WINDOW_MS,
  }).find((record) => calculateMomentTopicSimilarity(topic, record.topic) >= (options.similarThreshold ?? DEFAULT_MOMENT_TOPIC_SIMILAR_THRESHOLD));
  if (similarTopic) return { avoid: true, reason: "similar", matchedTopic: similarTopic };
  return { avoid: false, reason: "allowed" };
}
