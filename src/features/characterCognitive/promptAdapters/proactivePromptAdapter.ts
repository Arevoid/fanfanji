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
