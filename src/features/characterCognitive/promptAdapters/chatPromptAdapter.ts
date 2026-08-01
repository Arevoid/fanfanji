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
