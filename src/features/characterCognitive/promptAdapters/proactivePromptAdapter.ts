import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptRelationship,
  projectPromptTime,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { CognitivePromptAdapter, ProactivePromptContext } from "./types";

/**
 * Builds a relation-safe proactive projection. Open context is intentionally
 * empty until a separately audited source is introduced.
 */
export const buildProactivePromptContext: CognitivePromptAdapter<ProactivePromptContext> = (context, options) => ({
  persona: projectPromptPersona(context),
  relationship: projectPromptRelationship(context),
  recentMeaningfulEvents: selectSafePromptEvents(context, options),
  openContext: [],
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
});

/** Formats the safe supplement without exposing scope IDs, private Memory, or InnerVoice data. */
export function formatProactivePromptContext(context: ProactivePromptContext | undefined): string {
  if (!context) return "";

  const relationship = [
    `- Current relationship: ${context.relationship.stage}`,
    ...(context.relationship.compressedMemory ? [`- Safe relationship summary: ${context.relationship.compressedMemory}`] : []),
  ];
  const events = context.recentMeaningfulEvents.map((event) => `- ${event.summary}`);

  return [
    "[RELATION-SAFE PROACTIVE COGNITIVE CONTEXT]",
    "Use only the verified information below when directly relevant. Do not infer shared scenes, locations, actions, user experiences, or an unconfirmed relationship change.",
    "Character focus:",
    `- Name: ${context.persona.name}`,
    ...(context.persona.personality ? [`- Personality: ${context.persona.personality}`] : []),
    ...(context.persona.backstory ? [`- Background: ${context.persona.backstory}`] : []),
    "Relationship context:",
    ...relationship,
    ...(events.length > 0 ? ["Verified recent events:", ...events] : []),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
  ].join("\n");
}
