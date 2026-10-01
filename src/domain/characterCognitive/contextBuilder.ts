import {
  CHARACTER_COGNITIVE_CONTEXT_SCHEMA_VERSION,
  type BuildCharacterCognitiveContextInput,
  type CharacterCognitiveContext,
  type CharacterCognitiveIdentityScope,
  type CharacterCognitivePersona,
  type CharacterCognitiveTemporalContext,
} from "./characterCognitiveTypes";
import type { RelationshipTimeline } from "../characterLife/relationshipTimelineTypes";
import type { RelationshipState } from "../characterLife/relationshipStateTypes";
import { classifyTimeOfDay, getCurrentRoutineState } from "../characterLife/characterRoutine/characterRoutinePolicy";
import { selectKnownFacts, selectRecentEvents } from "./contextPolicy";
import { LEGACY_SUMMARY_SOURCE } from "./legacySummaryPolicy";

function assertRelationshipScope(input: BuildCharacterCognitiveContextInput): CharacterCognitiveIdentityScope {
  const { character, relation, conversationId } = input;
  if (relation.characterId !== character.id) {
    throw new Error("CharacterCognitiveContext relation characterId must match character.id");
  }
  if (conversationId && conversationId !== relation.conversationId) {
    throw new Error("CharacterCognitiveContext conversationId must match relation.conversationId");
  }

  return {
    characterId: character.id,
    relationId: relation.id,
    userIdentityId: relation.userIdentityId,
    conversationId: conversationId || relation.conversationId,
  };
}

function projectPersona(input: BuildCharacterCognitiveContextInput): CharacterCognitivePersona {
  const { character } = input;
  return {
    id: character.id,
    name: character.name,
    ...(character.age === undefined ? {} : { age: character.age }),
    ...(character.gender === undefined ? {} : { gender: character.gender }),
    ...(character.mbti === undefined ? {} : { mbti: character.mbti }),
    personality: character.personality,
    backstory: character.backstory,
  };
}

function projectTimeContext(input: BuildCharacterCognitiveContextInput): CharacterCognitiveTemporalContext {
  const { timeContext } = input;
  const time = new Date(timeContext.now).toISOString();
  return {
    now: timeContext.now,
    date: timeContext.date || time.slice(0, 10),
    time: timeContext.time || time.slice(11, 16),
    ...(timeContext.timezone ? { timezone: timeContext.timezone } : {}),
    ...(timeContext.period ? { period: timeContext.period } : {}),
  };
}

function projectRoutineContext(input: BuildCharacterCognitiveContextInput) {
  if (!input.routine) return undefined;
  return {
    period: classifyTimeOfDay(input.timeContext.now, input.routine.timezone),
    state: getCurrentRoutineState(input.routine, input.timeContext.now),
  };
}

const matchesCognitiveScope = (
  value: Pick<RelationshipTimeline, "relationId" | "characterId" | "userIdentityId"> | RelationshipState,
  scope: CharacterCognitiveIdentityScope,
): boolean => value.relationId === scope.relationId
  && value.characterId === scope.characterId
  && value.userIdentityId === scope.userIdentityId;

function projectRelationshipTimeline(
  timeline: RelationshipTimeline | undefined,
  scope: CharacterCognitiveIdentityScope,
): Pick<CharacterCognitiveContext, "relationshipState" | "relationshipTimeline"> {
  if (!timeline || !matchesCognitiveScope(timeline, scope)) return {};
  const state = timeline.state && matchesCognitiveScope(timeline.state, scope)
    ? timeline.state
    : undefined;
  const safeTimeline = state === timeline.state ? timeline : { ...timeline, state: undefined };
  return {
    relationshipTimeline: safeTimeline,
    ...(state ? { relationshipState: state } : {}),
  };
}

/**
 * Builds a read-only cognitive snapshot from caller-provided data. This domain
 * function has no storage, API, React, AI, or prompt-string dependency.
 */
export function buildCharacterCognitiveContext(
  input: BuildCharacterCognitiveContextInput,
): CharacterCognitiveContext {
  const scope = assertRelationshipScope(input);
  const { relation } = input;
  const relationshipProjection = projectRelationshipTimeline(input.relationshipTimeline, scope);
  const routineContext = projectRoutineContext(input);
  const scheduleItems = [
    ...(input.scheduleEntries || [])
      .filter((entry) => entry.relationId === scope.relationId
        && entry.characterId === scope.characterId
        && entry.userIdentityId === scope.userIdentityId)
      .filter((entry) => entry.status !== "cancelled")
      .map((entry) => ({
        title: entry.title,
        ...(entry.detail ? { detail: entry.detail } : {}),
        ...(entry.dateKey ? { dateKey: entry.dateKey } : {}),
        ...(entry.startAt === undefined ? {} : { startAt: entry.startAt }),
        ...(entry.endAt === undefined ? {} : { endAt: entry.endAt }),
        status: entry.status,
        reviewState: "confirmed" as const,
      })),
    ...(input.appointmentEntries || [])
      .filter((entry) => entry.relationId === scope.relationId
        && entry.characterId === scope.characterId
        && entry.userIdentityId === scope.userIdentityId)
      .filter((entry) => entry.status !== "cancelled" && entry.status !== "expired")
      .map((entry) => ({
        title: `见面安排：${entry.title}`,
        detail: [entry.activity, entry.location].filter(Boolean).join(" · ") || "已确认的见面约定",
        ...(entry.dateKey ? { dateKey: entry.dateKey } : {}),
        ...(entry.startAt === undefined ? {} : { startAt: entry.startAt }),
        ...(entry.endAt === undefined ? {} : { endAt: entry.endAt }),
        status: entry.status,
        reviewState: "confirmed" as const,
      })),
  ]
    .sort((left, right) => (left.startAt ?? Number.MAX_SAFE_INTEGER) - (right.startAt ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 16);

  return {
    schemaVersion: CHARACTER_COGNITIVE_CONTEXT_SCHEMA_VERSION,
    createdAt: input.timeContext.now,
    scope,
    persona: projectPersona(input),
    relationship: {
      relationId: relation.id,
      characterId: relation.characterId,
      userIdentityId: relation.userIdentityId,
      conversationId: relation.conversationId,
      stage: relation.relationship,
      ...(relation.compressedMemory?.trim()
        ? {
          legacySummary: {
            content: relation.compressedMemory.trim(),
            source: LEGACY_SUMMARY_SOURCE,
            relationId: relation.id,
          },
        }
        : {}),
      ...(relation.lastActiveTime === undefined ? {} : { lastActiveTime: relation.lastActiveTime }),
      ...(relation.scheduledProactiveTime === undefined ? {} : { scheduledProactiveTime: relation.scheduledProactiveTime }),
      updatedAt: relation.updatedAt,
    },
    ...relationshipProjection,
    knownFacts: selectKnownFacts(input.memories, scope),
    recentEvents: selectRecentEvents(input.events, scope),
    temporalContext: projectTimeContext(input),
    ...(routineContext ? { routineContext } : {}),
    scheduleItems,
    knowledgeBoundary: {
      known: [...input.knowledgeBoundary.known],
      unknown: [...input.knowledgeBoundary.unknown],
      ...(input.knowledgeBoundary.forbidden ? { forbidden: [...input.knowledgeBoundary.forbidden] } : {}),
      ...(input.knowledgeBoundary.rules ? { rules: [...input.knowledgeBoundary.rules] } : {}),
    },
    behaviorConstraints: [...(input.behaviorConstraints || [])],
  };
}
