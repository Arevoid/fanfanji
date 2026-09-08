import type { Message } from "../../../types";
import type {
  DirectReplyLifecycleInput,
  DirectReplyLifecycleOutcome,
} from "../contracts/directReplyLifecycle";
import {
  classifyDirectReplyError,
  createDirectReplyLifecycleOutcome,
} from "../contracts/directReplyLifecycle";
import {
  executeDirectReplyTurn,
  type DirectReplyTurnExecutorInput,
  type DirectReplyTurnResult,
} from "./directReplyTurnExecutor";
import type { ReplyCandidatesResult } from "./chatServiceTypes";

/**
 * A small adapter around the existing PostReplyCoordinator.  The use case
 * decides when post-reply work is eligible; the caller keeps ownership of
 * feature-specific side effects and the coordinator implementation.
 */
export interface DirectReplyUseCasePostReplyInput<PreparedResponse> {
  lifecycle: DirectReplyLifecycleInput;
  response: PreparedResponse;
  candidates: ReplyCandidatesResult;
  deliveredMessages: readonly Message[];
}

export interface DirectReplyUseCasePostReplyOutcome {
  scheduled: boolean;
  failures: readonly string[];
}

export type DirectReplyUseCasePostReplyHandler<PreparedResponse> = (
  input: DirectReplyUseCasePostReplyInput<PreparedResponse>,
) => DirectReplyUseCasePostReplyOutcome | void;

/**
 * Prepared input for one normal direct send.  User-message persistence and
 * context/prompt assembly happen before this boundary; the turn bundle is
 * already scoped to the current runtime and carries no raw composer input.
 */
export interface DirectReplyUseCaseInput<PreparedResponse> {
  lifecycle: DirectReplyLifecycleInput;
  turn: DirectReplyTurnExecutorInput<PreparedResponse>;
  postReply?: DirectReplyUseCasePostReplyHandler<PreparedResponse>;
}

export interface DirectReplyUseCaseResult<PreparedResponse> {
  outcome: DirectReplyLifecycleOutcome;
  turn: DirectReplyTurnResult<PreparedResponse>;
  response?: PreparedResponse;
  candidates?: ReplyCandidatesResult;
  deliveredMessages: readonly Message[];
  postReply?: DirectReplyUseCasePostReplyOutcome;
}

const deliveredMessagesFromTurn = <PreparedResponse>(
  turn: DirectReplyTurnResult<PreparedResponse>,
): readonly Message[] => {
  if (!turn.candidates || turn.deliveredMessageIds.length === 0) return [];
  const deliveredIds = new Set(turn.deliveredMessageIds);
  return turn.candidates.messages.filter((message) => deliveredIds.has(message.id));
};

const deliveryForTurn = <PreparedResponse>(turn: DirectReplyTurnResult<PreparedResponse>) => ({
  status: turn.deliveredMessageIds.length === 0
    ? "not_delivered" as const
    : turn.deliveredMessageIds.length < turn.generatedCandidateIds.length
      ? "partial" as const
      : "delivered" as const,
  generatedCandidateIds: turn.generatedCandidateIds,
  deliveredMessageIds: turn.deliveredMessageIds,
});

const errorForTurn = <PreparedResponse>(
  turn: DirectReplyTurnResult<PreparedResponse>,
) => {
  if (turn.status === "cancelled") return { kind: "cancelled" as const, recoverable: true };
  if (turn.phase === "delivering") return { kind: "delivery" as const, recoverable: true };
  if (turn.error) return classifyDirectReplyError(turn.error);
  return { kind: "parse" as const, recoverable: true };
};

/**
 * Application-level boundary for the normal 1:1 reply lifecycle.
 *
 * This function deliberately does not know React, storage, Prompt/Context
 * internals, or regenerate semantics.  It executes the already-prepared turn,
 * converts terminal metadata to the existing lifecycle contract, and invokes
 * the caller-owned post-reply adapter exactly once after successful delivery.
 */
export async function executeDirectReplyUseCase<PreparedResponse>(
  input: DirectReplyUseCaseInput<PreparedResponse>,
): Promise<DirectReplyUseCaseResult<PreparedResponse>> {
  if (input.lifecycle.mode !== "send" || input.lifecycle.postReplyPolicy !== "normal_send") {
    throw new Error("DirectReplyUseCase only supports normal direct sends");
  }

  const turn = await executeDirectReplyTurn(input.turn);
  const deliveredMessages = deliveredMessagesFromTurn(turn);
  const delivery = deliveryForTurn(turn);

  if (turn.status === "cancelled") {
    return {
      turn,
      response: turn.response,
      candidates: turn.candidates,
      deliveredMessages,
      outcome: createDirectReplyLifecycleOutcome({
        lifecycle: input.lifecycle,
        status: "cancelled",
        phase: "cancelled",
        delivery,
        error: { kind: "cancelled", recoverable: true },
      }),
    };
  }

  if (turn.status === "failed" || turn.status === "no_response") {
    const phase = turn.status === "no_response" ? "parsed" : turn.phase;
    const error = errorForTurn(turn);
    return {
      turn,
      response: turn.response,
      candidates: turn.candidates,
      deliveredMessages,
      outcome: createDirectReplyLifecycleOutcome({
        lifecycle: input.lifecycle,
        status: "failed",
        phase,
        delivery,
        error,
      }),
    };
  }

  let postReply: DirectReplyUseCasePostReplyOutcome | undefined;
  if (input.postReply && turn.response && turn.candidates && deliveredMessages.length > 0) {
    try {
      postReply = input.postReply({
        lifecycle: input.lifecycle,
        response: turn.response,
        candidates: turn.candidates,
        deliveredMessages,
      }) || { scheduled: false, failures: [] };
    } catch {
      // Post-reply work is best effort.  The main reply remains delivered even
      // if an adapter violates its non-throwing coordinator contract.
      postReply = { scheduled: false, failures: ["post_reply"] };
    }
  }

  return {
    turn,
    response: turn.response,
    candidates: turn.candidates,
    deliveredMessages,
    ...(postReply ? { postReply } : {}),
    outcome: createDirectReplyLifecycleOutcome({
      lifecycle: input.lifecycle,
      status: "delivered",
      phase: postReply ? "post_reply_scheduled" : "delivered",
      delivery,
      ...(postReply ? { postReply } : {}),
    }),
  };
}
