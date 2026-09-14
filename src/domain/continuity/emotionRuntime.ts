import {
  CONTINUITY_RUNTIME_SCHEMA_VERSION,
  copyContinuityScope,
  sameContinuityScope,
  type ContinuityScope,
} from "./continuityTypes";

export interface EmotionState {
  version: typeof CONTINUITY_RUNTIME_SCHEMA_VERSION;
  scope: ContinuityScope;
  baseline: string;
  current: string;
  intensity: number;
  causeEventRefs: readonly string[];
  decayRatePerHour: number;
  residue: number;
  updatedAt: number;
}

export interface EmotionDeltaInput {
  scope: ContinuityScope;
  current?: string;
  intensityDelta?: number;
  causeEventRefs?: readonly string[];
  at: number;
  decayRatePerHour?: number;
}

const MAX_REFS = 16;
const bounded = (value: number): number => Math.max(0, Math.min(1, value));
const refs = (values: readonly string[] | undefined): string[] => Array.from(new Set(
  (values || []).filter((value): value is string => typeof value === "string")
    .map((value) => value.trim()).filter(Boolean),
)).slice(0, MAX_REFS);

export function createEmotionState(scope: ContinuityScope, now: number, baseline = "neutral"): EmotionState {
  const normalizedBaseline = baseline.trim() || "neutral";
  return {
    version: CONTINUITY_RUNTIME_SCHEMA_VERSION,
    scope: copyContinuityScope(scope),
    baseline: normalizedBaseline,
    current: normalizedBaseline,
    intensity: 0,
    causeEventRefs: [],
    decayRatePerHour: 0.15,
    residue: 0,
    updatedAt: now,
  };
}

/** Applies a temporary event delta; baseline is never rewritten. */
export function applyEmotionDelta(previous: EmotionState | undefined, input: EmotionDeltaInput): EmotionState {
  if (!Number.isFinite(input.at)) return previous || createEmotionState(input.scope, Date.now());
  if (previous && !sameContinuityScope(previous.scope, input.scope)) return previous;
  const state = previous || createEmotionState(input.scope, input.at);
  const intensity = bounded(state.intensity + (input.intensityDelta ?? 0));
  const eventRefs = refs(input.causeEventRefs);
  return {
    ...state,
    ...(input.current?.trim() ? { current: input.current.trim() } : {}),
    intensity,
    causeEventRefs: eventRefs.length ? eventRefs : state.causeEventRefs,
    decayRatePerHour: input.decayRatePerHour === undefined
      ? state.decayRatePerHour
      : bounded(input.decayRatePerHour),
    residue: bounded(Math.max(state.residue, intensity * 0.5)),
    updatedAt: input.at,
  };
}

/** Deterministic elapsed-time decay; no provider call and no scene mutation. */
export function decayEmotion(state: EmotionState, at: number): EmotionState {
  if (!Number.isFinite(at) || at <= state.updatedAt) return state;
  const hours = (at - state.updatedAt) / (60 * 60 * 1000);
  const amount = state.decayRatePerHour * hours;
  const intensity = bounded(state.intensity - amount);
  const residue = bounded(state.residue - amount * 0.5);
  return {
    ...state,
    current: intensity <= 0.01 ? state.baseline : state.current,
    intensity,
    residue,
    updatedAt: at,
  };
}
