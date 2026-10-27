import type { CharacterTruthScope, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { MemorySourceApp } from "../../../domain/memory/memoryModel";
import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { deriveKnowledgeSemantics } from "../../../domain/characterKnowledge/knowledgeEvolution";

export function createManualKnowledgeClaim(input: {
  id: string;
  scope: CharacterTruthScope;
  statement: string;
  sourceRecordId: string;
  recordedAt: number;
  sourceApp?: MemorySourceApp;
  importance?: number;
  classification?: Pick<KnowledgeClaim, "kind" | "subject" | "temporalStatus">;
}): KnowledgeClaim | undefined {
  const decision = evaluateKnowledgeWrite({
    id: input.id,
    ...input.scope,
    kind: input.classification?.kind ?? "fact",
    subject: input.classification?.subject ?? (/^(?:用户|我)(?:现在|已经|以前)?(?:喜欢|不喜欢|不再喜欢|讨厌|住在|搬到|叫|名字是|的)/u.test(input.statement.trim()) ? "user" : "other"),
    statement: input.statement,
    temporalStatus: input.classification?.temporalStatus ?? "unknown",
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
    importance: input.importance,
    recordedAt: input.recordedAt,
  });
  if (!decision.accepted) return undefined;
  const semantics = deriveKnowledgeSemantics(decision.claim);
  return { ...decision.claim, ...(semantics ? { semantics, ...(!input.classification ? { temporalStatus: "present" as const } : {}) } : {}), continuityVersion: 1 };
}
