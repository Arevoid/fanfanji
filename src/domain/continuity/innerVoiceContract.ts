import type { RelationshipState } from "../characterLife/relationshipStateTypes";
import type { BeliefRecord } from "./beliefRuntime";
import type { EmotionState } from "./emotionRuntime";
import type { OpenLoopRecord } from "./openLoopRuntime";
import type { TopicRuntimeState } from "./topicRuntime";
import { sameContinuityScope, type ContinuityScene, type ContinuityScope } from "./continuityTypes";

export interface InnerVoiceContextInput {
  scope: ContinuityScope;
  scene?: ContinuityScene;
  topic?: TopicRuntimeState;
  emotion?: EmotionState;
  beliefs?: readonly BeliefRecord[];
  relationship?: RelationshipState;
  openLoops?: readonly OpenLoopRecord[];
  relevantMemoryRefs?: readonly string[];
}

export interface InnerVoiceContext {
  visibility: "character_private";
  scope: ContinuityScope;
  scene: ContinuityScene;
  topic?: TopicRuntimeState;
  emotion?: EmotionState;
  beliefs: readonly BeliefRecord[];
  relationship?: RelationshipState;
  openLoops: readonly OpenLoopRecord[];
  relevantMemoryRefs: readonly string[];
}

/**
 * Produces a character-private semantic context. Memory and event content are
 * represented only by caller-supplied references, so this contract cannot
 * accidentally turn inner voice into a public Truth or a second AI request.
 */
export function buildInnerVoiceContext(input: InnerVoiceContextInput): InnerVoiceContext {
  const sameScope = <T extends { scope: ContinuityScope }>(value: T | undefined): T | undefined =>
    value && sameContinuityScope(value.scope, input.scope) ? value : undefined;
  const topic = sameScope(input.topic);
  const emotion = sameScope(input.emotion);
  const relationship = input.relationship && sameContinuityScope(input.relationship, input.scope)
    ? input.relationship
    : undefined;
  return {
    visibility: "character_private",
    scope: { ...input.scope },
    scene: input.scene || "online_chat",
    ...(topic ? { topic } : {}),
    ...(emotion ? { emotion } : {}),
    beliefs: (input.beliefs || []).filter((belief) => sameContinuityScope(belief.scope, input.scope)),
    ...(relationship ? { relationship } : {}),
    openLoops: (input.openLoops || []).filter((loop) => sameContinuityScope(loop.scope, input.scope)),
    relevantMemoryRefs: Array.from(new Set((input.relevantMemoryRefs || []).filter(Boolean))).slice(0, 24),
  };
}
