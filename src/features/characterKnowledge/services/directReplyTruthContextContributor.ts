import {
  retrieveTruthForPrivatePrompt,
  type TruthRetrievalInput,
  type TruthRetrievalResult,
} from "./truthRetrievalService";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type { MemoryItem } from "../../../types";
import {
  observeDirectReplyTruthMemoryShadow,
  type DirectChatMemoryShadowComparison,
} from "../../chat/services/directChatMemoryShadowComparison";

/**
 * Direct-reply Truth seam. Callers own scope resolution, storage loading,
 * history boundaries, and prompt formatting; this function only applies the
 * existing deterministic Truth retrieval semantics.
 */
export interface DirectReplyMemoryShadowDiagnosticsInput {
  /** Test/debug injected opt-in. Normal production callers omit this field. */
  enabled: boolean;
  memories?: readonly MemoryItem[];
  events?: readonly CharacterEvent[];
  maxItems?: number;
  maxCharacters?: number;
}

export interface DirectReplyTruthContextInput extends TruthRetrievalInput {
  /** Diagnostics only; it can never alter the returned Truth selection. */
  memoryShadowDiagnostics?: DirectReplyMemoryShadowDiagnosticsInput;
}

export interface DirectReplyTruthContextResult extends TruthRetrievalResult {
  memoryShadowDiagnostics?: DirectChatMemoryShadowComparison;
}

export function contributeDirectReplyTruthContext(input: DirectReplyTruthContextInput): DirectReplyTruthContextResult {
  const { memoryShadowDiagnostics, ...retrievalInput } = input;
  const result = retrieveTruthForPrivatePrompt(retrievalInput);
  if (!memoryShadowDiagnostics?.enabled) return result;
  const diagnostics = observeDirectReplyTruthMemoryShadow({
    enabled: true,
    retrievalInput: input,
    result,
    memories: memoryShadowDiagnostics.memories,
    events: memoryShadowDiagnostics.events,
    maxItems: memoryShadowDiagnostics.maxItems ?? input.limit,
    maxCharacters: memoryShadowDiagnostics.maxCharacters ?? input.maxCharacters,
  });
  return diagnostics ? { ...result, memoryShadowDiagnostics: diagnostics } : result;
}
