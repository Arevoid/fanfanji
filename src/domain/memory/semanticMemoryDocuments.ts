import type { CharacterTruthScope, KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../characterKnowledge/knowledgeConflictPolicy";
import { isHistoricalKnowledgeVersion } from "../characterKnowledge/knowledgeEvolution";
import { semanticClaimRevision } from "./semanticMemoryIndex";
/** Shared by the index writer and its progress view. Recall eligibility is narrower
 * and remains query dependent; corrected/retracted versions must never be indexed. */
export function isIndexableSemanticClaim(claim: KnowledgeClaim, scope: CharacterTruthScope, now: number): boolean {
  return isExactTruthScope(claim, scope) &&(claim.source.app!=="diary"||claim.source.producer==="diary-reflection.v1"&&claim.kind==="belief"&&claim.truthStatus==="inferred")&& !claim.recallDisabled && claim.status === "active"&&(claim.admissionStatus===undefined||claim.admissionStatus==="retained"||claim.legacyCompatible&&claim.admissionStatus==="review")
    && (!claim.supersededById || isHistoricalKnowledgeVersion(claim))
    && (claim.validFrom === undefined || claim.validFrom <= now);
}
export const SEMANTIC_DOCUMENT_CHUNK_SIZE = 600;
export const semanticDocumentId = (kind: string, id: string, part: number) => JSON.stringify([kind, id, part]);
export function chunkSemanticDocument(claim: KnowledgeClaim, kind: string): KnowledgeClaim[] {
  const revision = semanticClaimRevision(claim); const chunks: KnowledgeClaim[] = [];
  let offset = 0;
  while (offset < claim.statement.length) {
    let end = Math.min(claim.statement.length, offset + SEMANTIC_DOCUMENT_CHUNK_SIZE);
    if (end < claim.statement.length) {
      const boundary = Math.max(...["。", "！", "？", "\n", ". "].map((mark) => claim.statement.lastIndexOf(mark, end - 1)));
      if (boundary >= offset + 200) end = boundary + 1;
      else if (/[\uD800-\uDBFF]/u.test(claim.statement[end - 1])) end--;
    }
    chunks.push({ ...claim, id: semanticDocumentId(kind, claim.id, chunks.length), statement: claim.statement.slice(offset, end),
      source: { ...claim.source, evidenceKey: `${claim.source.evidenceKey}\u0000${revision}` } });
    offset = end;
  }
  return chunks;
}
export function semanticDocumentScore(claim: KnowledgeClaim, kind: string, scores: ReadonlyMap<string, number>) {
  let best: { score: number; excerpt: string } = { score: 0, excerpt: "" };
  for (const chunk of chunkSemanticDocument(claim, kind)) {
    const score = scores.get(chunk.id) ?? 0;
    if (score > best.score) best = { score, excerpt: chunk.statement };
  }
  return best;
}
