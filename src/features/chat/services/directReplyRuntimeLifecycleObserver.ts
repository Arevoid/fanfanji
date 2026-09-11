export type DirectReplyRuntimeLifecycleStage =
  | "initial_parse_success"
  | "initial_parse_format_issue"
  | "repair_requested"
  | "repair_parse_success"
  | "repair_parse_format_issue"
  | "terminal_response_format"
  | "candidate_created"
  | "candidate_no_response"
  | "delivery_success";

export interface DirectReplyRuntimeLifecycleEvent {
  stage: DirectReplyRuntimeLifecycleStage;
  sequence: number;
  recordedAt: number;
  candidateCount?: number;
  deliveredCount?: number;
}

export interface DirectReplyRuntimeLifecycleDebugApi {
  read: () => readonly DirectReplyRuntimeLifecycleEvent[];
  clear: () => void;
}

const DIRECT_REPLY_RUNTIME_LIFECYCLE_GLOBAL_NAME = "__fanfanjiDirectReplyLifecycle" as const;
const MAX_EVENTS = 64;

const isDevRuntime = (): boolean => {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
};

export function createDirectReplyRuntimeLifecycleRecorder(options: {
  enabled: boolean;
  now?: () => number;
  maxEvents?: number;
}): {
  api: DirectReplyRuntimeLifecycleDebugApi;
  record: (
    stage: DirectReplyRuntimeLifecycleStage,
    details?: Pick<DirectReplyRuntimeLifecycleEvent, "candidateCount" | "deliveredCount">,
  ) => void;
} {
  let events: DirectReplyRuntimeLifecycleEvent[] = [];
  let sequence = 0;
  const now = options.now || Date.now;
  const maxEvents = Math.max(1, Math.floor(options.maxEvents || MAX_EVENTS));
  const api: DirectReplyRuntimeLifecycleDebugApi = {
    read: () => [...events],
    clear: () => {
      events = [];
    },
  };
  return {
    api,
    record: (stage, details = {}) => {
      if (!options.enabled) return;
      sequence += 1;
      events = [
        ...events,
        {
          stage,
          sequence,
          recordedAt: now(),
          ...(typeof details.candidateCount === "number" ? { candidateCount: Math.max(0, Math.floor(details.candidateCount)) } : {}),
          ...(typeof details.deliveredCount === "number" ? { deliveredCount: Math.max(0, Math.floor(details.deliveredCount)) } : {}),
        },
      ].slice(-maxEvents);
    },
  };
}

const runtimeRecorder = createDirectReplyRuntimeLifecycleRecorder({ enabled: isDevRuntime() });

if (isDevRuntime() && typeof window !== "undefined") {
  const root = window as typeof window & {
    [DIRECT_REPLY_RUNTIME_LIFECYCLE_GLOBAL_NAME]?: DirectReplyRuntimeLifecycleDebugApi;
  };
  root[DIRECT_REPLY_RUNTIME_LIFECYCLE_GLOBAL_NAME] = runtimeRecorder.api;
}

export function recordDirectReplyRuntimeLifecycleStage(
  stage: DirectReplyRuntimeLifecycleStage,
  details: Pick<DirectReplyRuntimeLifecycleEvent, "candidateCount" | "deliveredCount"> = {},
): void {
  runtimeRecorder.record(stage, details);
}

export const DIRECT_REPLY_RUNTIME_LIFECYCLE_GLOBAL = DIRECT_REPLY_RUNTIME_LIFECYCLE_GLOBAL_NAME;
