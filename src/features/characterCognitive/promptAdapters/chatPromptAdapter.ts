import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptRelationship,
  projectPromptTime,
  selectChatPromptFacts,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { ChatPromptContext, CognitivePromptAdapter } from "./types";

/** Builds a prompt-safe direct-chat projection without formatting Prompt text. */
export const buildChatPromptContext: CognitivePromptAdapter<ChatPromptContext> = (context, options) => ({
  persona: projectPromptPersona(context),
  relationship: projectPromptRelationship(context),
  relevantMemories: selectChatPromptFacts(context, options),
  safeEvents: selectSafePromptEvents(context, options),
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
});

/**
 * Formats only the new, non-duplicative cognitive supplement. Existing chat
 * prompt sections remain the authority for persona, relationship, and clock
 * presentation; this block adds scoped evidence and boundaries only.
 */
export function formatChatPromptContext(context: ChatPromptContext | undefined): string {
  if (!context) return "";

  const facts = context.relevantMemories.map((fact) => `- ${fact.content}`);
  const events = context.safeEvents.map((event) => `- ${event.summary}`);
  const boundaries = [
    ...context.boundaries.unknown.map((item) => `- Unknown: ${item}`),
    ...context.boundaries.forbidden.map((item) => `- Forbidden: ${item}`),
    ...context.boundaries.rules.map((item) => `- Rule: ${item}`),
  ];
  if (facts.length === 0 && events.length === 0 && boundaries.length === 0) return "";

  return [
    "[RELATION-SCOPED COGNITIVE CONTEXT]",
    "Use only the verified information below when it is directly relevant. Do not infer additional shared scenes, locations, actions, or user experiences.",
    ...(facts.length > 0 ? ["Verified relevant memories:", ...facts] : []),
    ...(events.length > 0 ? ["Verified recent events:", ...events] : []),
    ...(boundaries.length > 0 ? ["Knowledge boundaries:", ...boundaries] : []),
  ].join("\n");
}
