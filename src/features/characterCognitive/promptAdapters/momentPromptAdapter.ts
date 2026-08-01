import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptTime,
  selectMomentPublicFacts,
  selectPromptBehaviorConstraints,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { CognitivePromptAdapter, MomentPromptContext } from "./types";

/** Builds the deliberately narrow public-safe Moment projection without formatting Prompt text. */
export const buildMomentPromptContext: CognitivePromptAdapter<MomentPromptContext> = (context, options) => ({
  persona: projectPromptPersona(context),
  publicFacts: selectMomentPublicFacts(context),
  publicEvents: selectSafePromptEvents(context, options),
  behaviorConstraints: selectPromptBehaviorConstraints(context),
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
});

/**
 * Formats the deliberately public-safe Moment supplement. The existing Moment
 * prompt remains responsible for the task, history, WorldBook, and UI-facing
 * wording; this block supplies only adapter-projected context.
 */
export function formatMomentPromptContext(context: MomentPromptContext | undefined): string {
  if (!context) return "";

  const persona = [
    `- Name: ${context.persona.name}`,
    ...(context.persona.personality ? [`- Personality: ${context.persona.personality}`] : []),
    ...(context.persona.backstory ? [`- Background: ${context.persona.backstory}`] : []),
  ];
  const facts = context.publicFacts.map((fact) => `- ${fact.content}`);
  const events = context.publicEvents.map((event) => `- ${event.summary}`);
  const constraints = context.behaviorConstraints.map((constraint) => `- ${constraint.description}`);

  return [
    "[PUBLIC-SAFE MOMENT COGNITIVE CONTEXT]",
    "Use only the verified public-safe information below when directly relevant. Do not invent shared scenes, locations, actions, or user experiences.",
    "Character focus:",
    ...persona,
    ...(facts.length > 0 ? ["Verified public facts:", ...facts] : []),
    ...(events.length > 0 ? ["Verified public-safe events:", ...events] : []),
    ...(constraints.length > 0 ? ["Behavior constraints:", ...constraints] : []),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
  ].join("\n");
}
