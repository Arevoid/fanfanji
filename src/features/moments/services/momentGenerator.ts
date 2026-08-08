import type { Character, MemoryItem, Moment } from "../../../types";
import type { apiChat } from "../../../utils/apiHelper";
import type { MomentPublicCognitiveContext } from "../../../domain/momentCognitive/momentPublicCognitiveTypes";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { CognitivePromptWorldSetting } from "../../characterCognitive/promptAdapters/types";
import { appendMomentPublicPromptContext } from "../../characterCognitive/promptAdapters/momentPromptAdapter";
import { sanitizeMomentPublishText } from "./momentContent";
import { assessMomentUniqueness, isMomentSkipResponse } from "./momentUniqueness";
import { findMomentTemporalConflicts, type MomentTemporalContext } from "./momentTemporalContext";
import {
  claimCharacterMomentGeneration,
  completeCharacterMomentGeneration,
  completeSkippedCharacterMomentGeneration,
  releaseCharacterMomentGeneration,
} from "./momentGenerationGuard";

type ChatRequest = Parameters<typeof apiChat>[0];
type RequestAi = (request: ChatRequest) => ReturnType<typeof apiChat>;

export interface CharacterMomentOccurredAtInput {
  now: number;
  relationId: string;
  lastMomentAt?: number;
  lastActiveAt?: number;
  scheduledAt?: number;
  relationshipCreatedAt?: number;
  intervalMs: number;
  occupiedTimestamps?: readonly number[];
}

const stableFraction = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
};

/** Chooses the time at which an already-approved direct Moment plausibly
 * happened. It never affects eligibility, frequency, or number of posts. */
export function calculateCharacterMomentOccurredAt(input: CharacterMomentOccurredAtInput): number {
  const now = Math.max(0, input.now);
  const past = (value: number | undefined) => value && value > 0 && value <= now ? value : 0;
  const lastMomentAt = past(input.lastMomentAt);
  const scheduledAt = past(input.scheduledAt);
  const timelineAnchor = Math.max(past(input.lastActiveAt), past(input.relationshipCreatedAt));
  const eligibleAt = lastMomentAt
    ? Math.min(now, lastMomentAt + Math.max(0, input.intervalMs))
    : Math.max(scheduledAt, timelineAnchor);
  const earliest = Math.min(now, eligibleAt || now);
  const currentDate = new Date(now);
  const currentHour = currentDate.getHours();
  const currentDaypartStart = currentHour >= 17
    ? 17
    : currentHour >= 12
      ? 12
      : currentHour >= 6
        ? 6
        : 0;
  if (currentDaypartStart > 0) {
    currentDate.setHours(currentDaypartStart, 0, 0, 0);
  }
  const daypartEarliest = currentDaypartStart > 0
    ? Math.max(earliest, currentDate.getTime())
    : earliest;
  const latest = Math.max(daypartEarliest, now - 1_000);

  if (now - daypartEarliest <= 15 * 60 * 1000) return now;

  const spread = latest - daypartEarliest;
  let occurredAt = daypartEarliest + Math.floor(spread * (0.2 + stableFraction(input.relationId) * 0.6));
  const occupied = new Set((input.occupiedTimestamps || []).filter((timestamp) => timestamp >= daypartEarliest && timestamp <= latest));
  while (occupied.has(occurredAt) && occurredAt < latest) occurredAt += 1_000;
  while (occupied.has(occurredAt) && occurredAt > daypartEarliest) occurredAt -= 1_000;
  return Math.min(now, Math.max(daypartEarliest, occurredAt));
}

export async function requestCharacterMoment(input: {
  requestAi: RequestAi;
  request: ChatRequest;
  character: Character;
  ownerIdentityId: string;
  parseContent: (content: string) => { content: string; selfComments: string[]; imageDescription?: string };
  relationId?: string;
  occurredAt?: () => number;
  now?: () => number;
  random?: () => number;
  temporalContext?: MomentTemporalContext;
  existingMoments?: readonly Moment[];
  /** Required for production character generation; omitted only for legacy callers. */
  publicContext?: MomentPublicCognitiveContext;
  /** Confirmed material for this exact relationship only. */
  relationContext?: CharacterCognitiveContext;
  relationWorldKnowledge?: readonly CognitivePromptWorldSetting[];
}): Promise<{ moment?: Moment; memory?: MemoryItem }> {
  const response = await input.requestAi(appendMomentPublicPromptContext(input.request, input.publicContext, {
    relationContext: input.relationContext,
    relationWorldKnowledge: input.relationWorldKnowledge,
  }));
  if (!response?.text) return {};
  const now = input.occurredAt || input.now || Date.now;
  const random = input.random || Math.random;
  const cleanedContent = sanitizeMomentPublishText(response.text).replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  if (isMomentSkipResponse(cleanedContent)) return {};
  const parsed = input.parseContent(sanitizeMomentPublishText(cleanedContent));
  if (isMomentSkipResponse(parsed.content) || !parsed.content.trim()) return {};
  const temporalConflicts = input.temporalContext
    ? [parsed.content, ...parsed.selfComments]
      .flatMap((content) => findMomentTemporalConflicts(content, input.temporalContext!, input.character))
    : [];
  if (temporalConflicts.length > 0) {
    console.warn("[moments] Rejected temporally inconsistent generated post:", temporalConflicts);
    return {};
  }
  const uniqueness = assessMomentUniqueness(parsed.content, input.existingMoments || [], {
    ownerIdentityId: input.ownerIdentityId,
    characterId: input.character.id,
    relationId: input.relationId,
  });
  if (!uniqueness.accepted) return {};
  let image: string | undefined;
  if (!parsed.imageDescription && input.character.album?.length && random() < 0.4) {
    image = input.character.album[Math.floor(random() * input.character.album.length)];
  }
  const timestamp = now();
  const moment: Moment = {
    id: `${timestamp}-char-moment-${random().toString(36).substr(2, 5)}`,
    characterId: input.character.id,
    relationId: input.relationId,
    ownerIdentityId: input.ownerIdentityId,
    authorName: input.character.remark || input.character.name,
    authorAvatar: input.character.avatar,
    content: parsed.content,
    timestamp,
    likes: [],
    comments: parsed.selfComments.map((content, index) => ({
      id: `${timestamp}-self-comment-${index}-${random().toString(36).substr(2, 4)}`,
      authorName: input.character.remark || input.character.name,
      authorAvatar: input.character.avatar,
      content: sanitizeMomentPublishText(content),
      timestamp: timestamp + (index + 1) * 1000,
    })),
    image,
    imageType: image ? "photo" : (parsed.imageDescription ? "text" : undefined),
    imageDescription: parsed.imageDescription,
  };
  return {
    moment,
    memory: {
      id: `${timestamp}-moment-memory-${random().toString(36).slice(2, 6)}`,
      characterId: input.character.id,
      relationId: input.relationId,
      sourceMomentId: moment.id,
      content: `【${input.character.name}发布的朋友圈】${parsed.content}${image ? "（发布时附有配图）" : ""}`,
      timestamp,
      importance: 4,
      isManual: false,
    },
  };
}

export async function requestCharacterMomentOnce(input: Parameters<typeof requestCharacterMoment>[0]): Promise<{
  moment?: Moment;
  memory?: MemoryItem;
  skipped?: boolean;
}> {
  const timestamp = (input.now || Date.now)();
  const generatedAt = new Date(timestamp);
  const taskKey = claimCharacterMomentGeneration(input.character.id, generatedAt, input.relationId);
  if (!taskKey) return { skipped: true };

  try {
    const result = await requestCharacterMoment(input);
    if (!result.moment) {
      completeSkippedCharacterMomentGeneration(taskKey, input.character.id, input.relationId, generatedAt);
      return { ...result, skipped: true };
    }

    if (!completeCharacterMomentGeneration(taskKey, result.moment, generatedAt)) {
      console.warn(`[moments] Generated moment task "${taskKey}" could not be persisted; keeping it in memory only.`);
    }
    return result;
  } catch (error) {
    releaseCharacterMomentGeneration(taskKey);
    throw error;
  }
}
