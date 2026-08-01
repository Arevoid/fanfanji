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
