import {
  MOMENT_PUBLIC_COGNITIVE_CONTEXT_SCHEMA_VERSION,
  type BuildMomentPublicCognitiveContextInput,
  type MomentPublicCharacterProfile,
  type MomentPublicCognitiveContext,
  type MomentPublicTimeContext,
} from "./momentPublicCognitiveTypes";
import {
  selectAuthorizedPublicFacts,
  selectPublicBehaviorConstraints,
  selectPublicMomentComments,
  selectPublicMomentEvents,
  selectPublicMomentHistory,
} from "./momentPublicVisibilityPolicy";
import {
  getRecentMomentTopics,
  normalizeMomentTopic,
} from "../moments/momentGeneration/momentTopicHistory";
import {
  DEFAULT_MOMENT_TOPIC_COOLDOWN_MS,
  DEFAULT_MOMENT_TOPIC_DUPLICATE_WINDOW_MS,
} from "../moments/momentGeneration/momentTopicPolicy";
import type { MomentTopicRecord } from "../moments/momentGeneration/momentTopicTypes";
import type { MomentPublicTopicContext } from "./momentPublicCognitiveTypes";
import { classifyTimeOfDay, getCurrentRoutineState } from "../characterLife/characterRoutine/characterRoutinePolicy";

const MOMENT_TOPIC_CONTEXT_LIMIT = 8;
const MOMENT_REPEATED_TOPIC_LIMIT = 4;

function projectPublicCharacterProfile(
  character: BuildMomentPublicCognitiveContextInput["character"],
): MomentPublicCharacterProfile {
  return {
    name: character.name,
    ...(character.age === undefined ? {} : { age: character.age }),
    ...(character.gender === undefined ? {} : { gender: character.gender }),
    ...(character.mbti === undefined ? {} : { mbti: character.mbti }),
    personality: character.personality,
    backstory: character.backstory,
  };
}

function projectCurrentTime(
  currentTime: BuildMomentPublicCognitiveContextInput["currentTime"],
): MomentPublicTimeContext {
  const iso = new Date(currentTime.now).toISOString();
  return {
    now: currentTime.now,
    date: currentTime.date || iso.slice(0, 10),
    time: currentTime.time || iso.slice(11, 16),
    ...(currentTime.timezone ? { timezone: currentTime.timezone } : {}),
    ...(currentTime.period ? { period: currentTime.period } : {}),
  };
}

function distinctTopicLabels(records: readonly MomentTopicRecord[], limit: number): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const record of records) {
    const topic = record.topic.trim();
    const normalized = normalizeMomentTopic(topic);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    topics.push(topic);
    if (topics.length >= limit) break;
  }
  return topics;
}

function projectTopicContext(
  history: readonly MomentTopicRecord[] | undefined,
  characterId: string,
  now: number,
): MomentPublicTopicContext | undefined {
  if (history === undefined) return undefined;

  const queryLimit = Math.max(history.length, MOMENT_TOPIC_CONTEXT_LIMIT);
  const recentRecords = getRecentMomentTopics(history, characterId, {
    now,
    limit: queryLimit,
  });
  const duplicateWindowRecords = getRecentMomentTopics(history, characterId, {
    now,
    withinMs: DEFAULT_MOMENT_TOPIC_DUPLICATE_WINDOW_MS,
    limit: queryLimit,
  });
  const topicCounts = new Map<string, { count: number; topic: string }>();
  for (const record of duplicateWindowRecords) {
    const topic = record.topic.trim();
    const normalized = normalizeMomentTopic(topic);
    if (!normalized) continue;
    const current = topicCounts.get(normalized);
    topicCounts.set(normalized, {
      count: (current?.count ?? 0) + 1,
      topic: current?.topic ?? topic,
    });
  }
  const repeatedTopics = [...topicCounts.values()]
    .filter(({ count }) => count > 1)
    .map(({ topic }) => topic)
    .slice(0, MOMENT_REPEATED_TOPIC_LIMIT);
  const cooldownRecords = getRecentMomentTopics(history, characterId, {
    now,
    withinMs: DEFAULT_MOMENT_TOPIC_COOLDOWN_MS,
    limit: queryLimit,
  });

  return {
    recentTopics: distinctTopicLabels(recentRecords, MOMENT_TOPIC_CONTEXT_LIMIT),
    repeatedTopics,
    cooldownTopics: distinctTopicLabels(cooldownRecords, MOMENT_TOPIC_CONTEXT_LIMIT),
  };
}

/** Pure, deny-by-default builder for the Moment public-expression domain. */
export function buildMomentPublicCognitiveContext(
  input: BuildMomentPublicCognitiveContextInput,
): MomentPublicCognitiveContext {
  const characterId = input.character.id;
  return {
    schemaVersion: MOMENT_PUBLIC_COGNITIVE_CONTEXT_SCHEMA_VERSION,
    createdAt: input.currentTime.now,
    publicCharacterProfile: projectPublicCharacterProfile(input.character),
    publicMomentHistory: selectPublicMomentHistory(input.publicMomentHistory || [], characterId),
    publicCommentHistory: selectPublicMomentComments(input.publicCommentHistory || [], characterId),
    authorizedPublicFacts: selectAuthorizedPublicFacts(input.publicFacts || [], characterId),
    publicEvents: selectPublicMomentEvents(input.publicEvents || [], characterId),
    publicBehaviorConstraints: selectPublicBehaviorConstraints(input.publicBehaviorConstraints || []),
    topicContext: projectTopicContext(input.topicHistory, characterId, input.currentTime.now),
    ...(input.routine ? {
      routineContext: {
        period: classifyTimeOfDay(input.currentTime.now, input.routine.timezone),
        state: getCurrentRoutineState(input.routine, input.currentTime.now),
      },
    } : {}),
    currentTime: projectCurrentTime(input.currentTime),
  };
}
