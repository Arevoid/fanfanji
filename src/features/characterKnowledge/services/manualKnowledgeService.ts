import type { CharacterTruthScope, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { MemorySourceApp } from "../../../domain/memory/memoryModel";
import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";

export function createManualKnowledgeClaim(input: {
  id: string;
  scope: CharacterTruthScope;
  statement: string;
  sourceRecordId: string;
  recordedAt: number;
  sourceApp?: MemorySourceApp;
}): KnowledgeClaim | undefined {
  const decision = evaluateKnowledgeWrite({
    id: input.id,
    ...input.scope,
    kind: "fact",
    subject: "other",
    statement: input.statement,
    temporalStatus: "unknown",
    source: {
      kind: "manual",
      authorship: "user",
      ...(input.sourceApp ? { app: input.sourceApp } : {}),
      sourceRecordId: input.sourceRecordId,
      producer: "memory-ui.manual.v1",
      evidenceKey: `manual:${input.scope.relationId}:${input.sourceRecordId}:${input.recordedAt}`,
    },
    requestedTruthStatus: "confirmed",
    confidence: 1,
    userConfirmed: true,
    recordedAt: input.recordedAt,
  });
  return decision.accepted ? decision.claim : undefined;
}
