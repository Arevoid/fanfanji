import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptRelationship,
  projectPromptTime,
  selectPromptBehaviorConstraints,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { CognitivePromptAdapter, DiaryPromptContext } from "./types";

/**
 * Projects a relation-scoped cognitive snapshot for a character's private
 * diary. Memory is deliberately not projected: a diary may reflect its own
 * current conversation, but it must not receive user-private Memory as a
 * reusable factual source.
 */
export const buildDiaryPromptContext: CognitivePromptAdapter<DiaryPromptContext> = (context, options) => ({
  persona: projectPromptPersona(context),
  relationship: projectPromptRelationship(context),
  safeEvents: selectSafePromptEvents(context, options),
  behaviorConstraints: selectPromptBehaviorConstraints(context),
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
});

/**
 * Formats only the optional diary safety supplement. The existing diary
 * prompt remains responsible for the diary task, persona wording, JSON
 * contract, and its original writing rules.
 */
export function formatDiaryPromptContext(context: DiaryPromptContext | undefined): string {
  if (!context) return "";

  const events = context.safeEvents.map((event) => `- ${event.summary}`);
  const constraints = context.behaviorConstraints.map((constraint) => `- ${constraint.description}`);
  const boundaries = [
    ...context.boundaries.unknown.map((item) => `- Unknown: ${item}`),
    ...context.boundaries.forbidden.map((item) => `- Forbidden: ${item}`),
    ...context.boundaries.rules.map((item) => `- Rule: ${item}`),
  ];
  if (events.length === 0 && constraints.length === 0 && boundaries.length === 0) return "";

  return [
    "[RELATION-SAFE DIARY COGNITIVE CONTEXT]",
    "Use only verified completed facts when directly relevant. Do not present plans, offline-story narration, inner thoughts, or inferred shared scenes as real completed experiences.",
    ...(events.length > 0 ? ["Verified safe events:", ...events] : []),
    ...(constraints.length > 0 ? ["Behavior constraints:", ...constraints] : []),
    ...(boundaries.length > 0 ? ["Knowledge boundaries:", ...boundaries] : []),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
  ].join("\n");
}
