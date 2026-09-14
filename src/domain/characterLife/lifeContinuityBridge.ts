import type { CharacterLifeScope } from "./characterLifeTypes";
import type { LifeEvent } from "./lifeEventRuntime";
import { applyEmotionDelta, type EmotionState } from "../continuity/emotionRuntime";
import { createBeliefRecord, upsertBelief, type BeliefRecord } from "../continuity/beliefRuntime";
import {
  closeOpenLoop,
  createOpenLoop,
  upsertOpenLoop,
  type OpenLoopRecord,
} from "../continuity/openLoopRuntime";
import type { ContinuityScope } from "../continuity/continuityTypes";

export interface LifeContinuityProjection {
  emotion?: EmotionState;
  beliefs: BeliefRecord[];
  openLoops: OpenLoopRecord[];
  topicTransitionHint?: "continue" | "shift";
}

const asContinuityScope = (scope: CharacterLifeScope): ContinuityScope => ({ ...scope });
const isUsableEvent = (event: LifeEvent): boolean => event.status !== "cancelled" && event.status !== "missed";

const findReferencedLoop = (event: LifeEvent, loops: readonly OpenLoopRecord[]): OpenLoopRecord | undefined => {
  const refs = new Set(event.refs);
  return loops.find((loop) => refs.has(loop.id) || refs.has(event.id) || loop.sourceRefs.some((ref) => refs.has(ref)));
};

/**
 * Explicit Event→continuity rules. Each channel is updated independently so
 * an event cannot overwrite the whole runtime or turn a belief into Truth.
 */
export const projectLifeEventToContinuity = (input: {
  event: LifeEvent;
  emotion?: EmotionState;
  beliefs?: readonly BeliefRecord[];
  openLoops?: readonly OpenLoopRecord[];
  now?: number;
}): LifeContinuityProjection => {
  const event = input.event;
  const scope = asContinuityScope(event);
  const now = input.now ?? event.recordedAt;
  let emotion = input.emotion;
  let beliefs = [...(input.beliefs || [])];
  let openLoops = [...(input.openLoops || [])];
  if (!isUsableEvent(event)) return { emotion, beliefs, openLoops };

  const addBelief = (category: string): void => {
    const belief = createBeliefRecord({
      id: `belief:${event.id}`,
      scope,
      subjectScope: "relationship",
      proposition: event.summary,
      category,
      confidence: 0.55,
      supportingEventRefs: [event.id],
      updatedAt: now,
    });
    if (belief) beliefs = upsertBelief(beliefs, beliefToInput(belief));
  };

  switch (event.type) {
    case "promise_made": {
      const loop = createOpenLoop({
        id: event.refs[0] || `promise:${event.id}`,
        scope,
        type: "promise",
        description: event.summary,
        createdAt: event.timestamp,
        targetTime: event.interval?.startAt,
        sourceRefs: [event.id, ...event.refs],
      });
      if (loop) openLoops = upsertOpenLoop(openLoops, loop);
      addBelief("promise");
      break;
    }
    case "promise_kept": {
      const target = findReferencedLoop(event, openLoops);
      if (target) openLoops = closeOpenLoop(openLoops, scope, target.id, "fulfilled", now);
      emotion = applyEmotionDelta(emotion, { scope, current: "relieved", intensityDelta: 0.2, causeEventRefs: [event.id], at: now });
      addBelief("reliability");
      break;
    }
    case "conflict":
      emotion = applyEmotionDelta(emotion, { scope, current: "strained", intensityDelta: 0.4, causeEventRefs: [event.id], at: now });
      addBelief("conflict");
      break;
    case "repair":
      emotion = applyEmotionDelta(emotion, { scope, current: "reassured", intensityDelta: -0.25, causeEventRefs: [event.id], at: now });
      addBelief("repair");
      break;
    case "meaningful_share":
      emotion = applyEmotionDelta(emotion, { scope, current: "warm", intensityDelta: 0.12, causeEventRefs: [event.id], at: now });
      addBelief("shared_experience");
      break;
    case "topic_shift":
      return { emotion, beliefs, openLoops, topicTransitionHint: "shift" };
    default:
      break;
  }
  return { emotion, beliefs, openLoops };
};

const beliefToInput = (belief: BeliefRecord) => ({
  id: belief.id,
  scope: belief.scope,
  subjectScope: belief.subjectScope,
  proposition: belief.proposition,
  category: belief.category,
  confidence: belief.confidence,
  supportingEventRefs: belief.supportingEventRefs,
  updatedAt: belief.updatedAt,
  ...(belief.decayMs === undefined ? {} : { decayMs: belief.decayMs }),
  ...(belief.stability === undefined ? {} : { stability: belief.stability }),
});

