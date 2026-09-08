import type { Message } from "../../../types";

export type DirectReplyMode = "send" | "regenerate";

/**
 * The history decisions that are allowed to differ between a normal turn and
 * a regeneration.  The context builder remains the owner of how these values
 * are applied; this contract only carries the caller's explicit boundary.
 */
export interface DirectReplyHistoryBoundary {
  userMessageId?: string;
  targetMessageId?: string;
  excludedMessageIds?: readonly string[];
}

export interface DirectReplyScope {
  characterId: string;
  relationId?: string;
  conversationId?: string;
  userIdentityId: string;
}

export interface DirectReplyRuntimeInfo {
  requestedAt: number;
  signal?: AbortSignal;
}

export interface DirectReplyCorrectionInput {
  oocComment?: string;
}

export type DirectReplyPostReplyPolicy = "normal_send" | "regenerate_none";

/**
 * UI-free input for one direct reply lifecycle. React state, provider
 * implementations, storage adapters and DOM callbacks deliberately stay at
 * the adapter boundary.
 */
export interface DirectReplyLifecycleInput {
  mode: DirectReplyMode;
  scope: DirectReplyScope;
  userMessage: Message | null;
  targetMessage?: Message;
  historyBoundary: DirectReplyHistoryBoundary;
  correction?: DirectReplyCorrectionInput;
  runtime: DirectReplyRuntimeInfo;
  postReplyPolicy: DirectReplyPostReplyPolicy;
}

export type DirectReplyLifecyclePhase =
  | "prepared"
  | "requesting"
  | "parsed"
  | "delivering"
  | "delivered"
  | "post_reply_scheduled"
  | "failed"
  | "cancelled";

export type DirectReplyLifecycleStatus = "delivered" | "no_response" | "failed" | "cancelled";

export type DirectReplyErrorKind = "provider" | "parse" | "delivery" | "post_reply" | "cancelled" | "unknown";

export interface DirectReplyDeliveryOutcome {
  status: "delivered" | "partial" | "not_delivered";
  generatedCandidateIds: readonly string[];
  deliveredMessageIds: readonly string[];
}

export interface DirectReplyPostReplyOutcome {
  policy: DirectReplyPostReplyPolicy;
  scheduled: boolean;
  failures: readonly string[];
}

export interface DirectReplyLifecycleError {
  kind: DirectReplyErrorKind;
  recoverable: boolean;
}

/**
 * Structured result reserved for the direct-reply orchestration boundary.
 * It intentionally contains IDs and classifications, not prompt or response
 * bodies, and therefore is safe to pass back to a UI/controller adapter.
 */
export interface DirectReplyLifecycleOutcome {
  mode: DirectReplyMode;
  status: DirectReplyLifecycleStatus;
  phase: DirectReplyLifecyclePhase;
  scope: DirectReplyScope;
  delivery: DirectReplyDeliveryOutcome;
  postReply: DirectReplyPostReplyOutcome;
  error?: DirectReplyLifecycleError;
}

export function createDirectReplyLifecycleOutcome(input: {
  lifecycle: DirectReplyLifecycleInput;
  status: DirectReplyLifecycleStatus;
  phase: DirectReplyLifecyclePhase;
  delivery?: Partial<DirectReplyDeliveryOutcome>;
  postReply?: Partial<DirectReplyPostReplyOutcome>;
  error?: DirectReplyLifecycleError;
}): DirectReplyLifecycleOutcome {
  const generatedCandidateIds = input.delivery?.generatedCandidateIds || [];
  const deliveredMessageIds = input.delivery?.deliveredMessageIds || [];
  const deliveryStatus = input.delivery?.status
    || (deliveredMessageIds.length > 0 ? "delivered" : "not_delivered");
  return {
    mode: input.lifecycle.mode,
    status: input.status,
    phase: input.phase,
    scope: input.lifecycle.scope,
    delivery: {
      status: deliveryStatus,
      generatedCandidateIds,
      deliveredMessageIds,
    },
    postReply: {
      policy: input.lifecycle.postReplyPolicy,
      scheduled: input.postReply?.scheduled === true,
      failures: input.postReply?.failures || [],
    },
    ...(input.error ? { error: input.error } : {}),
  };
}

export function classifyDirectReplyError(error: unknown): DirectReplyLifecycleError {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  if (code === "aborted") return { kind: "cancelled", recoverable: true };
  if (
    code.startsWith("provider_")
    || code === "configuration"
    || code === "context_too_large"
    || code === "network"
    || code === "timeout"
  ) {
    return { kind: "provider", recoverable: true };
  }
  if (code === "response_format" || code === "invalid_response") {
    return { kind: "parse", recoverable: true };
  }
  return { kind: "unknown", recoverable: false };
}
