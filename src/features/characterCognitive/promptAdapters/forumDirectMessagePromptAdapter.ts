import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptTime,
  selectPromptBehaviorConstraints,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type {
  CognitivePromptAdapter,
  ForumDirectMessagePromptContext,
} from "./types";

/**
 * Projects only relation-safe evidence for a Forum direct message. Forum DM
 * history and its public origin remain owned by the existing Forum prompt;
 * this adapter never projects Memory, scope identifiers, or public records.
 */
export const buildForumDirectMessagePromptContext: CognitivePromptAdapter<ForumDirectMessagePromptContext> = (context, options) => ({
  persona: projectPromptPersona(context),
  // Forum DM receives only the current relation stage. Legacy compressed
  // summaries are not authoritative and must not bypass the Truth adapter.
  relationship: { stage: context.relationship.stage },
  safeEvents: selectSafePromptEvents(context, options),
  behaviorConstraints: selectPromptBehaviorConstraints(context),
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
});

/** Formats the optional safety supplement while preserving the legacy Forum DM prompt. */
export function formatForumDirectMessagePromptContext(
  context: ForumDirectMessagePromptContext | undefined,
): string {
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
    "[RELATION-SAFE FORUM DIRECT MESSAGE COGNITIVE CONTEXT]",
    "Use only verified information below when directly relevant. Do not infer shared scenes, locations, actions, user experiences, private chat facts, or an unconfirmed relationship change.",
    `Character focus: ${context.persona.name}`,
    `Current relationship: ${context.relationship.stage}`,
    ...(events.length > 0 ? ["Verified safe events:", ...events] : []),
    ...(constraints.length > 0 ? ["Behavior constraints:", ...constraints] : []),
    ...(boundaries.length > 0 ? ["Knowledge boundaries:", ...boundaries] : []),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
  ].join("\n");
}
