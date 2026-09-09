/** Compatibility import path; Summary semantics live in the domain layer. */
export {
  createConversationSummaryRecord,
  getConversationSummaryClaimLabel,
  isConversationSummarySourceValid,
  projectConversationSummaryClaims,
  rebuildConversationSummaryRecord,
  reconcileConversationSummaryRecords,
} from "../../../domain/characterKnowledge/conversationSummaryProjection";
