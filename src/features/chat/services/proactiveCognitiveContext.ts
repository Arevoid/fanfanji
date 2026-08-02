import { buildCharacterCognitiveContext } from "../../../domain/characterCognitive/contextBuilder";
import { buildRelationshipCognitiveProjection } from "../../characterLife/services/relationshipCognitiveProjectionService";
import { createDirectChatKnowledgeBoundary } from "../../../domain/characterCognitive/contextPolicy";
import {
  classifyTimeOfDay,
  getCurrentRoutineState,
} from "../../../domain/characterLife/characterRoutine/characterRoutinePolicy";
import {
  getRecentProactiveTopics,
  normalizeProactiveTopic,
} from "../../../domain/characterLife/proactive/proactiveTopicHistory";
import {
  DEFAULT_PROACTIVE_TOPIC_COOLDOWN_MS,
  DEFAULT_PROACTIVE_TOPIC_DUPLICATE_WINDOW_MS,
} from "../../../domain/characterLife/proactive/proactiveTopicPolicy";
import type { ProactiveTopicRecord } from "../../../domain/characterLife/proactive/proactiveTopicTypes";
import type {
  CharacterCognitiveContext,
  CharacterCognitiveEventCandidate,
} from "../../../domain/characterCognitive/characterCognitiveTypes";
import type {
  CharacterRoutine,
  CharacterRoutinePeriod,
  CharacterRoutineState,
} from "../../../domain/characterLife/characterRoutine/characterRoutineTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { Character, MemoryItem } from "../../../types";

const getProactiveEventVisibility = (event: CharacterEvent): CharacterCognitiveEventCandidate["promptVisibility"] =>
  event.status === "active"
    && (event.kind === "relationship_created" || event.kind === "offline_story_completed")
    ? "safe"
    : "private";

/** A prompt-safe routine signal; the routine configuration itself never leaves this service. */
export interface ProactiveRoutineContext {
  period: CharacterRoutinePeriod;
  state: CharacterRoutineState;
}

export interface ProactiveTopicContext {
  recentTopics: readonly string[];
  repeatedTopics: readonly string[];
  cooldownTopics: readonly string[];
}

export type ProactiveCognitiveContext = CharacterCognitiveContext & {
  routineContext?: ProactiveRoutineContext;
  topicContext?: ProactiveTopicContext;
};

const PROACTIVE_TOPIC_CONTEXT_LIMIT = 8;
const PROACTIVE_REPEATED_TOPIC_LIMIT = 4;

function distinctTopicLabels(records: readonly ProactiveTopicRecord[], limit: number): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const record of records) {
    const topic = record.topic.trim();
    const normalized = normalizeProactiveTopic(topic);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    topics.push(topic);
    if (topics.length >= limit) break;
  }
  return topics;
}

function projectProactiveTopicContext(
  history: readonly ProactiveTopicRecord[] | undefined,
  characterId: string,
  relationId: string,
  now: number,
): ProactiveTopicContext | undefined {
  if (history === undefined) return undefined;

  const queryLimit = Math.max(history.length, PROACTIVE_TOPIC_CONTEXT_LIMIT);
  const recentRecords = getRecentProactiveTopics(history, characterId, relationId, {
    now,
    limit: queryLimit,
  });
  const duplicateWindowRecords = getRecentProactiveTopics(history, characterId, relationId, {
    now,
    withinMs: DEFAULT_PROACTIVE_TOPIC_DUPLICATE_WINDOW_MS,
    limit: queryLimit,
  });
  const topicCounts = new Map<string, { count: number; topic: string }>();
  for (const record of duplicateWindowRecords) {
    const topic = record.topic.trim();
    const normalized = normalizeProactiveTopic(topic);
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
    .slice(0, PROACTIVE_REPEATED_TOPIC_LIMIT);
  const cooldownRecords = getRecentProactiveTopics(history, characterId, relationId, {
    now,
    withinMs: DEFAULT_PROACTIVE_TOPIC_COOLDOWN_MS,
    limit: queryLimit,
  });

  return {
    recentTopics: distinctTopicLabels(recentRecords, PROACTIVE_TOPIC_CONTEXT_LIMIT),
    repeatedTopics,
    cooldownTopics: distinctTopicLabels(cooldownRecords, PROACTIVE_TOPIC_CONTEXT_LIMIT),
  };
}

/** Builds an optional relation-scoped snapshot without changing legacy proactive behavior. */
export function buildProactiveCognitiveContext(input: {
  character: Character;
  relationship: CharacterRelationship;
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  occurredAt: number;
  /** Optional routine configuration used only to derive the current prompt hint. */
  routine?: CharacterRoutine;
  /** Optional relation-scoped history used only for generation diversity hints. */
  topicHistory?: readonly ProactiveTopicRecord[];
}): ProactiveCognitiveContext | undefined {
  try {
    const relationshipProjection = buildRelationshipCognitiveProjection({
      relation: input.relationship,
      events: input.events,
      now: input.occurredAt,
    });
    const context = buildCharacterCognitiveContext({
      character: input.character,
      relation: input.relationship,
      memories: input.memories,
      events: input.events.map((event) => ({
        event,
        promptVisibility: getProactiveEventVisibility(event),
      })),
      timeContext: { now: input.occurredAt },
      knowledgeBoundary: createDirectChatKnowledgeBoundary(),
      conversationId: input.relationship.conversationId,
      relationshipTimeline: relationshipProjection.timeline,
    });
    const topicContext = projectProactiveTopicContext(
      input.topicHistory,
      input.relationship.characterId,
      input.relationship.id,
      input.occurredAt,
    );
    if (!input.routine && !topicContext) return context;

    return {
      ...context,
      ...(topicContext ? { topicContext } : {}),
      ...(!input.routine ? {} : {
        routineContext: {
          period: classifyTimeOfDay(input.occurredAt, input.routine.timezone),
          state: getCurrentRoutineState(input.routine, input.occurredAt),
        },
      }),
    };
  } catch {
    return undefined;
  }
}
