import type { Moment } from "../../../types";
import { sanitizeMomentPublishText } from "./momentContent";

export type MomentUniquenessReason = "unique" | "empty" | "duplicate" | "similar";

export interface MomentUniquenessOptions {
  ownerIdentityId?: string;
  characterId?: string;
  relationId?: string;
  maxComparisons?: number;
  similarThreshold?: number;
}

export interface MomentUniquenessResult {
  accepted: boolean;
  reason: MomentUniquenessReason;
  similarity: number;
  comparedMomentId?: string;
}

const DEFAULT_OWNER_ID = "identity-1";
const DEFAULT_SIMILAR_THRESHOLD = 0.68;

/**
 * Keeps generated posts comparable without changing the text that is stored or
 * rendered. Punctuation and whitespace should not allow a model to repost the
 * same sentence with superficial formatting changes.
 */
export const normalizeMomentComparisonText = (content: string): string =>
  sanitizeMomentPublishText(content)
    .toLocaleLowerCase()
    .replace(/[\s\u3000，。！？、；：,.!?;:"'“”‘’「」【】（）()[\]{}…—\-_/\\|~·]+/g, "")
    .trim();

const createNgrams = (value: string, size: number): Set<string> => {
  if (value.length <= size) return value ? new Set([value]) : new Set();
  const grams = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) {
    grams.add(value.slice(index, index + size));
  }
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

const containmentSimilarity = (left: string, right: string): number => {
  if (left.length < 12 || right.length < 12) return 0;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return longer.includes(shorter) ? shorter.length / longer.length : 0;
};

/** Returns a conservative similarity score for Chinese and Latin text. */
export const calculateMomentTextSimilarity = (leftContent: string, rightContent: string): number => {
  const left = normalizeMomentComparisonText(leftContent);
  const right = normalizeMomentComparisonText(rightContent);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const containment = containmentSimilarity(left, right);
  const bigram = jaccardSimilarity(createNgrams(left, 2), createNgrams(right, 2));
  const trigram = jaccardSimilarity(createNgrams(left, 3), createNgrams(right, 3));
  return Math.max(containment, bigram * 0.55 + trigram * 0.45);
};

const belongsToOwner = (moment: Moment, ownerIdentityId?: string): boolean =>
  !ownerIdentityId || (moment.ownerIdentityId || DEFAULT_OWNER_ID) === ownerIdentityId;

/**
 * Generated friends' posts are compared inside one owner's feed. This keeps
 * each identity's private feed isolated while also preventing every friend
 * from receiving the same generic daily-life template.
 */
export function assessMomentUniqueness(
  candidateContent: string,
  existingMoments: readonly Moment[] = [],
  options: MomentUniquenessOptions = {},
): MomentUniquenessResult {
  const normalizedCandidate = normalizeMomentComparisonText(candidateContent);
  if (!normalizedCandidate) return { accepted: false, reason: "empty", similarity: 0 };

  const maxComparisons = options.maxComparisons ?? 120;
  const threshold = options.similarThreshold ?? DEFAULT_SIMILAR_THRESHOLD;
  const comparableMoments = [...existingMoments]
    .filter((moment) => Boolean(moment.characterId))
    .filter((moment) => belongsToOwner(moment, options.ownerIdentityId))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, maxComparisons);

  let highestSimilarity = 0;
  let mostSimilarMoment: Moment | undefined;
  for (const moment of comparableMoments) {
    const similarity = calculateMomentTextSimilarity(normalizedCandidate, moment.content);
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      mostSimilarMoment = moment;
    }
    if (similarity >= 1) {
      return {
        accepted: false,
        reason: "duplicate",
        similarity,
        comparedMomentId: moment.id,
      };
    }
  }

  if (highestSimilarity >= threshold) {
    return {
      accepted: false,
      reason: "similar",
      similarity: highestSimilarity,
      comparedMomentId: mostSimilarMoment?.id,
    };
  }

  return { accepted: true, reason: "unique", similarity: highestSimilarity };
}

/** The model may decline a post when there is no fresh, personality-grounded idea. */
export const isMomentSkipResponse = (content: string): boolean =>
  /^(?:skip|no[_ -]?post|no[_ -]?moment|none|pass|跳过|不发|无需发布|没有合适内容)[.!。！]?$/.test(
    sanitizeMomentPublishText(content).trim().toLocaleLowerCase(),
  );
