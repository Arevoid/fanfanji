import type { Message } from "../../../types";
import { requestDirectChatTurn } from "../controllers/chatGenerationController";
import { createDirectReplyCandidates } from "./directChatService";
import { deliverDirectReplyCandidates, DirectReplyDeliveryError } from "./directReplyDeliveryService";
import { isChatResponseFormatError } from "./chatTurnResponseProtocol";
import type {
  ParsedAiChatResponse,
  ReplyCandidateContext,
  ReplyCandidatesResult,
} from "./chatServiceTypes";

export type DirectReplyTurnRequest = Parameters<typeof requestDirectChatTurn>[0];
export type DirectReplyTurnCandidateContext = ReplyCandidateContext;

export interface DirectReplyTurnDeliveryInput {
  candidates: ReplyCandidatesResult;
  signal?: AbortSignal;
  shouldCancel: () => boolean;
}

/** A caller-owned adapter may bind delivery to voice/UI scope without exposing it to the executor. */
export type DirectReplyTurnDelivery = (input: DirectReplyTurnDeliveryInput) => Promise<Message[]>;

/** Binds the existing sequential delivery service without moving UI callbacks into the executor. */
export function createDirectReplyTurnDelivery(input: {
  onTyping: (typing: boolean) => void;
  onSendMessage: (message: Message) => void | Promise<void>;
}): DirectReplyTurnDelivery {
  return ({ candidates, signal, shouldCancel }) => deliverDirectReplyCandidates({
    candidates,
    signal,
    shouldCancel,
    onTyping: input.onTyping,
    onSendMessage: input.onSendMessage,
  });
}

export interface DirectReplyTurnExecutorInput<PreparedResponse> {
  request: DirectReplyTurnRequest;
  normalizeResponse: (response: ParsedAiChatResponse) => PreparedResponse | Promise<PreparedResponse>;
  hasReplyText: (response: PreparedResponse) => boolean;
  createCandidateContext: (response: PreparedResponse) => DirectReplyTurnCandidateContext;
  deliver: DirectReplyTurnDelivery;
  signal?: AbortSignal;
  shouldCancel?: () => boolean;
}

export type DirectReplyTurnPhase = "requesting" | "parsed" | "delivering" | "delivered" | "cancelled";
export type DirectReplyTurnStatus = "delivered" | "no_response" | "failed" | "cancelled";

export interface DirectReplyTurnResult<PreparedResponse> {
  status: DirectReplyTurnStatus;
  phase: DirectReplyTurnPhase;
  response?: PreparedResponse;
  candidates?: ReplyCandidatesResult;
  generatedCandidateIds: readonly string[];
  deliveredMessageIds: readonly string[];
  /** In-memory only; the outer pipeline maps it to its existing UI error flow. */
  error?: unknown;
}

const isAbortFailure = (error: unknown, signal?: AbortSignal): boolean => {
  if (signal?.aborted) return true;
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "aborted";
};

const deliveredMessagesFromFailure = (error: unknown): readonly Message[] => {
  if (error instanceof DirectReplyDeliveryError) return error.deliveredMessages;
  if (!error || typeof error !== "object" || !("deliveredMessages" in error)) return [];
  const deliveredMessages = (error as { deliveredMessages?: unknown }).deliveredMessages;
  return Array.isArray(deliveredMessages) ? deliveredMessages as Message[] : [];
};

const result = <PreparedResponse>(input: {
  status: DirectReplyTurnStatus;
  phase: DirectReplyTurnPhase;
  response?: PreparedResponse;
  candidates?: ReplyCandidatesResult;
  deliveredMessages?: readonly Message[];
  error?: unknown;
}): DirectReplyTurnResult<PreparedResponse> => ({
  status: input.status,
  phase: input.phase,
  ...(input.response ? { response: input.response } : {}),
  ...(input.candidates ? { candidates: input.candidates } : {}),
  generatedCandidateIds: input.candidates?.messages.map((message) => message.id) || [],
  deliveredMessageIds: input.deliveredMessages?.map((message) => message.id) || [],
  ...(input.error !== undefined ? { error: input.error } : {}),
});

/**
 * Coordinates one already-prepared direct turn. It deliberately knows neither
 * React nor cross-feature side effects: the caller supplies the prepared
 * request, candidate inputs, and a delivery adapter bound to the current scope.
 */
export async function executeDirectReplyTurn<PreparedResponse>(
  input: DirectReplyTurnExecutorInput<PreparedResponse>,
): Promise<DirectReplyTurnResult<PreparedResponse>> {
  const signal = input.signal || input.request.signal;
  if (signal?.aborted) return result({ status: "cancelled", phase: "cancelled" });

  let rawResponse: ParsedAiChatResponse;
  try {
    rawResponse = await requestDirectChatTurn({ ...input.request, signal });
  } catch (error) {
    if (isAbortFailure(error, signal)) return result({ status: "cancelled", phase: "cancelled", error });
    return result({ status: "failed", phase: isChatResponseFormatError(error) ? "parsed" : "requesting", error });
  }

  let preparedResponse: PreparedResponse;
  try {
    preparedResponse = await input.normalizeResponse(rawResponse);
  } catch (error) {
    if (isAbortFailure(error, signal)) return result({ status: "cancelled", phase: "cancelled", error });
    return result({ status: "failed", phase: "parsed", error });
  }
  if (signal?.aborted) return result({ status: "cancelled", phase: "cancelled", response: preparedResponse });
  if (!input.hasReplyText(preparedResponse)) {
    return result({ status: "failed", phase: "parsed", response: preparedResponse });
  }

  let candidates: ReplyCandidatesResult;
  try {
    candidates = createDirectReplyCandidates({
      ...input.createCandidateContext(preparedResponse),
    });
  } catch (error) {
    return result({ status: "failed", phase: "parsed", response: preparedResponse, error });
  }

  if (signal?.aborted) return result({ status: "cancelled", phase: "cancelled", response: preparedResponse, candidates });

  let deliveredMessages: Message[];
  try {
    deliveredMessages = await input.deliver({
      candidates,
      signal,
      shouldCancel: input.shouldCancel || (() => false),
    });
  } catch (error) {
    if (isAbortFailure(error, signal)) {
      return result({
        status: "cancelled",
        phase: "cancelled",
        response: preparedResponse,
        candidates,
        deliveredMessages: deliveredMessagesFromFailure(error),
        error,
      });
    }
    return result({
      status: "failed",
      phase: "delivering",
      response: preparedResponse,
      candidates,
      deliveredMessages: deliveredMessagesFromFailure(error),
      error,
    });
  }

  if (signal?.aborted) {
    return result({ status: "cancelled", phase: "cancelled", response: preparedResponse, candidates, deliveredMessages });
  }
  return result({
    status: deliveredMessages.length > 0 ? "delivered" : "no_response",
    phase: "delivered",
    response: preparedResponse,
    candidates,
    deliveredMessages,
  });
}
