import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptRelationship,
  projectPromptTime,
  selectPromptBehaviorConstraints,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { CognitivePromptAdapter, DiaryPromptContext } from "./types";
import type {
  CharacterCognitiveContext,
  CharacterCognitiveRoutineContext,
} from "../../../domain/characterCognitive/characterCognitiveTypes";

type DiaryPromptContextWithRoutine = DiaryPromptContext & {
  routineContext?: CharacterCognitiveRoutineContext;
};

function projectDiaryRoutineContext(
  context: CharacterCognitiveContext,
): Pick<DiaryPromptContextWithRoutine, "routineContext"> {
  if (!context.routineContext) return {};
  return {
    routineContext: {
      period: context.routineContext.period,
      state: context.routineContext.state,
    },
  };
}

/**
 * Projects a relation-scoped cognitive snapshot for a character's private
 * diary. Memory is deliberately not projected: a diary may reflect its own
 * current conversation, but it must not receive user-private Memory as a
 * reusable factual source.
 */
export const buildDiaryPromptContext = (
  context: Parameters<CognitivePromptAdapter<DiaryPromptContext>>[0],
  options?: Parameters<CognitivePromptAdapter<DiaryPromptContext>>[1],
): DiaryPromptContextWithRoutine => ({
  persona: projectPromptPersona(context),
  relationship: projectPromptRelationship(context, options),
  safeEvents: selectSafePromptEvents(context, options),
  behaviorConstraints: selectPromptBehaviorConstraints(context),
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
  ...projectDiaryRoutineContext(context),
});

/**
 * Formats only the optional diary safety supplement. The existing diary
 * prompt remains responsible for the diary task, persona wording, JSON
 * contract, and its original writing rules.
 */
export function formatDiaryPromptContext(context: DiaryPromptContextWithRoutine | undefined): string {
  if (!context) return "";

  const events = context.safeEvents.map((event) => `- ${event.summary}`);
  const legacySummary = context.relationship.legacySummary
    ? [`- ${context.relationship.legacySummary.content} (source=${context.relationship.legacySummary.source}; weak reference only)`]
    : [];
  const constraints = context.behaviorConstraints.map((constraint) => `- ${constraint.description}`);
  const boundaries = [
    ...context.boundaries.unknown.map((item) => `- Unknown: ${item}`),
    ...context.boundaries.forbidden.map((item) => `- Forbidden: ${item}`),
    ...context.boundaries.rules.map((item) => `- Rule: ${item}`),
  ];
  const routine = context.routineContext;
  const routineContext = routine ? [
    "Routine context (behavior reference only):",
    `- Current time period: ${routine.period}`,
    `- Current routine state: ${routine.state}`,
  ] : [];
  if (events.length === 0 && constraints.length === 0 && boundaries.length === 0 && legacySummary.length === 0 && routineContext.length === 0) return "";

  return [
    "[RELATION-SAFE DIARY COGNITIVE CONTEXT]",
    "Use only verified completed facts when directly relevant. Do not present plans, offline-story narration, inner thoughts, or inferred shared scenes as real completed experiences.",
    ...(events.length > 0 ? ["Verified safe events:", ...events] : []),
    ...(legacySummary.length > 0 ? ["Legacy summary (source=legacy-unverified; weak reference, never an authoritative fact):", ...legacySummary] : []),
    ...(constraints.length > 0 ? ["Behavior constraints:", ...constraints] : []),
    ...(boundaries.length > 0 ? ["Knowledge boundaries:", ...boundaries] : []),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
    ...routineContext,
  ].join("\n");
}
