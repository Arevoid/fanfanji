import {
  CONTINUITY_RUNTIME_SCHEMA_VERSION,
  copyContinuityScope,
  sameContinuityScope,
  type ContinuityScope,
} from "./continuityTypes";

export type TopicBoundaryMode = "continue" | "shift" | "uncertain";

export interface TopicHistoryEntry {
  id: string;
  topic: string;
  startedAt: number;
  endedAt?: number;
  transitionReason: string;
  latestRelevantMessageRefs: readonly string[];
}

export interface TopicRuntimeState {
  version: typeof CONTINUITY_RUNTIME_SCHEMA_VERSION;
  scope: ContinuityScope;
  activeTopic?: string;
  topicHistory: readonly TopicHistoryEntry[];
  topicStartedAt?: number;
  topicTransitionReason?: string;
  unresolvedTopic?: string;
  latestRelevantMessageRefs: readonly string[];
  updatedAt: number;
}

export interface TopicRuntimeTransitionInput {
  scope: ContinuityScope;
  mode: TopicBoundaryMode;
  at: number;
  topic?: string;
  transitionReason?: string;
  unresolvedTopic?: string;
  relevantMessageRefs?: readonly string[];
}

const MAX_HISTORY = 32;
const MAX_REFS = 32;

const refs = (values: readonly string[] | undefined): string[] => Array.from(new Set(
  (values || []).filter((value): value is string => typeof value === "string")
    .map((value) => value.trim()).filter(Boolean),
)).slice(0, MAX_REFS);

export function createTopicRuntimeState(scope: ContinuityScope, now: number): TopicRuntimeState {
  return {
    version: CONTINUITY_RUNTIME_SCHEMA_VERSION,
    scope: copyContinuityScope(scope),
    topicHistory: [],
    latestRelevantMessageRefs: [],
    updatedAt: now,
  };
}

/**
 * Applies the existing deterministic boundary decision to a lightweight
 * character/conversation-scoped state. It does not call an AI model and never
 * treats Memory as the current topic.
 */
export function applyTopicRuntimeTransition(
  previous: TopicRuntimeState | undefined,
  input: TopicRuntimeTransitionInput,
): TopicRuntimeState {
  if (!Number.isFinite(input.at)) return previous || createTopicRuntimeState(input.scope, input.at);
  if (previous && !sameContinuityScope(previous.scope, input.scope)) return previous;
  const state = previous || createTopicRuntimeState(input.scope, input.at);
  const nextTopic = input.topic?.trim();
  const reason = input.transitionReason?.trim() || `boundary_${input.mode}`;
  const relevantRefs = refs(input.relevantMessageRefs);

  if (input.mode === "shift" && nextTopic) {
    const history = state.activeTopic && state.topicStartedAt !== undefined
      ? [...state.topicHistory, {
        id: `topic-${state.topicStartedAt}`,
        topic: state.activeTopic,
        startedAt: state.topicStartedAt,
        endedAt: input.at,
        transitionReason: reason,
        latestRelevantMessageRefs: state.latestRelevantMessageRefs,
      }]
      : [...state.topicHistory];
    return {
      ...state,
      activeTopic: nextTopic,
      topicHistory: history.slice(-MAX_HISTORY),
      topicStartedAt: input.at,
      topicTransitionReason: reason,
      ...(input.unresolvedTopic?.trim() ? { unresolvedTopic: input.unresolvedTopic.trim() } : { unresolvedTopic: undefined }),
      latestRelevantMessageRefs: relevantRefs,
      updatedAt: input.at,
    };
  }

  return {
    ...state,
    ...(nextTopic && !state.activeTopic ? { activeTopic: nextTopic, topicStartedAt: input.at } : {}),
    ...(input.unresolvedTopic !== undefined ? { unresolvedTopic: input.unresolvedTopic?.trim() || undefined } : {}),
    latestRelevantMessageRefs: relevantRefs.length > 0 ? relevantRefs : state.latestRelevantMessageRefs,
    updatedAt: input.at,
  };
}

export function selectTopicRuntimeState(
  states: readonly TopicRuntimeState[],
  scope: ContinuityScope,
): TopicRuntimeState | undefined {
  return states
    .filter((state) => sameContinuityScope(state.scope, scope))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
}
