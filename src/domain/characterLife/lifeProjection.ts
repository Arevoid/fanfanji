import type { ContinuityApp, ContinuityScene, ContinuityScope } from "../continuity/continuityTypes";
import { defaultSceneForApp } from "../continuity/sceneRuntime";
import type { OpenLoopRecord } from "../continuity/openLoopRuntime";
import type { CharacterEvent } from "./characterEventTypes";
import type { CharacterLifeScope } from "./characterLifeTypes";
import { applyCharacterLifeStatePatch, createEmptyCharacterLifeState, type CharacterLifeState } from "./lifeStateRuntime";
import { buildTemporalContext, type TemporalContext } from "./temporalRuntime";
import type { CharacterScheduleEntry } from "./scheduleRuntime";

export interface CharacterLifeProjection {
  app: ContinuityApp;
  scope: ContinuityScope;
  scene: ContinuityScene;
  state: CharacterLifeState;
  temporal: TemporalContext;
  schedules: readonly CharacterScheduleEntry[];
  events: readonly CharacterEvent[];
  openLoops: readonly OpenLoopRecord[];
}

const sameScope = (left: CharacterLifeScope, right: CharacterLifeScope): boolean =>
  left.relationId === right.relationId && left.characterId === right.characterId && left.userIdentityId === right.userIdentityId;

const chronological = (left: CharacterEvent, right: CharacterEvent): number =>
  left.occurredAt - right.occurredAt || left.recordedAt - right.recordedAt || left.id.localeCompare(right.id);

/** Folds explicit events into a lightweight life-state projection only. */
export const projectCharacterLifeState = (input: {
  scope: CharacterLifeScope;
  previous?: CharacterLifeState;
  events?: readonly CharacterEvent[];
  schedules?: readonly CharacterScheduleEntry[];
  now: number;
}): CharacterLifeState => {
  let state = input.previous && sameScope(input.previous, input.scope)
    ? input.previous
    : createEmptyCharacterLifeState(input.scope, input.now);
  const events = (input.events || []).filter((event) => sameScope(event, input.scope)).sort(chronological);
  for (const event of events) {
    if (event.status !== "active" && event.status !== "confirmed" && event.status !== "completed") continue;
    const activity = event.summary.trim().slice(0, 160);
    const isMeaningful = event.kind !== "chat.message" && event.kind !== "message";
    state = applyCharacterLifeStatePatch(state, input.scope, {
      currentActivity: activity || state.currentActivity,
      lastInteractionAt: event.occurredAt,
      ...(isMeaningful ? { lastMeaningfulEventAt: event.occurredAt } : {}),
    }, Math.max(state.updatedAt, event.recordedAt));
  }
  const nextScheduleAt = (input.schedules || [])
    .filter((entry) => sameScope(entry, input.scope) && entry.status === "scheduled" && entry.startAt !== undefined)
    .map((entry) => entry.startAt!)
    .filter((at) => at >= input.now)
    .sort((left, right) => left - right)[0];
  return applyCharacterLifeStatePatch(state, input.scope, {
    ...(nextScheduleAt === undefined ? {} : { nextRelevantScheduleAt: nextScheduleAt }),
  }, input.now);
};

/**
 * Projects one canonical life to an App-specific window. The app scene is a
 * view choice; it never rewrites the persisted life state.
 */
export const buildCharacterLifeProjection = (input: {
  app: ContinuityApp;
  scope: ContinuityScope;
  scene?: ContinuityScene;
  state?: CharacterLifeState;
  events?: readonly CharacterEvent[];
  schedules?: readonly CharacterScheduleEntry[];
  openLoops?: readonly OpenLoopRecord[];
  now: number;
}): CharacterLifeProjection => {
  const scope: CharacterLifeScope = {
    relationId: input.scope.relationId,
    characterId: input.scope.characterId,
    userIdentityId: input.scope.userIdentityId,
  };
  const events = (input.events || []).filter((event) => sameScope(event, scope));
  const schedules = (input.schedules || []).filter((entry) => sameScope(entry, scope));
  const openLoops = (input.openLoops || []).filter((loop) =>
    loop.scope.characterId === scope.characterId
    && loop.scope.relationId === scope.relationId
    && loop.scope.userIdentityId === scope.userIdentityId);
  const state = projectCharacterLifeState({ scope, previous: input.state, events, schedules, now: input.now });
  return {
    app: input.app,
    scope: { ...input.scope },
    scene: input.scene || defaultSceneForApp(input.app),
    state,
    temporal: buildTemporalContext({
      now: input.now,
      lastInteractionAt: state.lastInteractionAt,
      lastMeaningfulEventAt: state.lastMeaningfulEventAt,
      nextScheduleAt: state.nextRelevantScheduleAt,
    }),
    schedules,
    events,
    openLoops,
  };
};

