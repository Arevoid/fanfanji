import {
  retrieveTruthForPrivatePrompt,
  type TruthRetrievalInput,
  type TruthRetrievalResult,
} from "./truthRetrievalService";

/**
 * Direct-reply Truth seam. Callers own scope resolution, storage loading,
 * history boundaries, and prompt formatting; this function only applies the
 * existing deterministic Truth retrieval semantics.
 */
export type DirectReplyTruthContextInput = TruthRetrievalInput;

export function contributeDirectReplyTruthContext(input: DirectReplyTruthContextInput): TruthRetrievalResult {
  return retrieveTruthForPrivatePrompt(input);
}
