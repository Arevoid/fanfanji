import type { BeliefRecord } from "./beliefRuntime";
import type { EmotionState } from "./emotionRuntime";
import type { HandoffCapsule } from "./handoffCapsule";
import type { OpenLoopRecord } from "./openLoopRuntime";
import type { TopicRuntimeState } from "./topicRuntime";
import type { RelationshipState } from "../characterLife/relationshipStateTypes";
import {
  sameContinuityScope,
  type ContinuityApp,
  type ContinuityScene,
  type ContinuityScope,
} from "./continuityTypes";

export type ContextVisibility =
  | "KNOWN_BY_CHARACTER"
  | "PRIVATE_TO_USER"
  | "PRIVATE_TO_CHARACTER"
  | "PUBLIC"
  | "SHARED_WITH_CHARACTER"
  | "OTHER_CHARACTER_PRIVATE";

export interface CrossAppContextInput {
  app: ContinuityApp;
  scope: ContinuityScope;
  scene?: ContinuityScene;
  topic?: TopicRuntimeState;
  emotion?: EmotionState;
  beliefs?: readonly BeliefRecord[];
  relationship?: RelationshipState;
  openLoops?: readonly OpenLoopRecord[];
  handoff?: HandoffCapsule;
}

export interface CrossAppContextSnapshot {
  app: ContinuityApp;
  scope: ContinuityScope;
  scene: ContinuityScene;
  topic?: TopicRuntimeState;
  emotion?: EmotionState;
  beliefs: readonly BeliefRecord[];
  relationship?: RelationshipState;
  openLoops: readonly OpenLoopRecord[];
  handoff?: HandoffCapsule;
  visibility: "character_private";
}

const scoped = <T extends { scope: ContinuityScope }>(value: T | undefined, scope: ContinuityScope): T | undefined =>
  value && sameContinuityScope(value.scope, scope) ? value : undefined;

/**
 * One read-only gateway for cross-App continuity. It applies canonical scope
 * checks and deliberately does not expose user-private Diary data or another
 * character's state. Callers still decide which public records to provide.
 */
export function buildCrossAppContext(input: CrossAppContextInput): CrossAppContextSnapshot {
  const topic = scoped(input.topic, input.scope);
  const emotion = scoped(input.emotion, input.scope);
  const relationship = input.relationship && sameContinuityScope(input.relationship, input.scope)
    ? input.relationship
    : undefined;
  const handoff = input.handoff && sameContinuityScope(input.handoff.scope, input.scope)
    ? input.handoff
    : undefined;
  const beliefs = (input.beliefs || []).filter((belief) => sameContinuityScope(belief.scope, input.scope));
  const openLoops = (input.openLoops || []).filter((loop) => sameContinuityScope(loop.scope, input.scope));
  return {
    app: input.app,
    scope: { ...input.scope },
    scene: input.scene || "online_chat",
    ...(topic ? { topic } : {}),
    ...(emotion ? { emotion } : {}),
    beliefs,
    ...(relationship ? { relationship } : {}),
    openLoops,
    ...(handoff ? { handoff } : {}),
    visibility: "character_private",
  };
}

export function canExposeVisibility(visibility: ContextVisibility, target: "character" | "user" | "public"): boolean {
  if (visibility === "OTHER_CHARACTER_PRIVATE") return false;
  if (visibility === "PRIVATE_TO_USER") return target === "user";
  if (visibility === "PRIVATE_TO_CHARACTER" || visibility === "KNOWN_BY_CHARACTER" || visibility === "SHARED_WITH_CHARACTER") return target === "character";
  return target === "public" || target === "character" || target === "user";
}
