import { useEffect, useState } from "react";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { loadSemanticMemoryIndex, saveSemanticMemoryIndex } from "../../../core/storage/repositories/semanticMemoryIndexRepository";
import { loadCharacterContinuity } from "../../../core/storage/repositories/characterContinuityRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { semanticClaimRevision, SEMANTIC_INDEX_FAILURE_LABELS } from "../../../domain/memory/semanticMemoryIndex";
import { supplementarySemanticDocuments } from "../services/semanticMemoryDocuments";
import { chunkSemanticDocument, isIndexableSemanticClaim } from "../../../domain/memory/semanticMemoryDocuments";
import { filterRecallableKnowledge } from "../services/characterContinuityService";
import { memoryVectorProviderId } from "../services/semanticMemoryRecallService";
import type { MemoryEmbeddingConfiguration } from "../services/memoryEmbeddingProvider";
export function MemoryVectorProgress(props: { configuration?: MemoryEmbeddingConfiguration; claims: KnowledgeClaim[];
  relationships: CharacterRelationship[]; identityId: string; characterId: string; relationId: string }) {
  const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);
  const relations = props.relationships.filter((relation) => relation.userIdentityId === props.identityId && relation.conversationId
    && (props.characterId === "all" || props.characterId === relation.characterId) && (props.relationId === "all" || props.relationId === relation.id));
  const relationKey = JSON.stringify(relations.map((relation) => [relation.characterId, relation.userIdentityId, relation.id, relation.conversationId]));
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      if (!props.configuration?.enabled) { setStatus("未启用向量记忆，继续使用关键词召回。"); return; }
      try {
        const provider = memoryVectorProviderId(props.configuration); const now = Date.now();
        const store = loadCharacterContinuity(); const summaries = loadConversationSummaries();
        let count = 0; let indexed = 0; let limited = false; let failed = false;
        const failures = new Set<string>();
        for (const relation of relations) {
          const scope = { characterId: relation.characterId, relationId: relation.id, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId };
          const eligible = filterRecallableKnowledge(props.claims);
          const documents = [...eligible.filter((claim) => isIndexableSemanticClaim(claim, scope, now)).flatMap((claim) => chunkSemanticDocument(claim, "claim")), ...(store.valid && summaries.valid
            ? supplementarySemanticDocuments(scope, eligible, summaries.value, store.value, now, true).flatMap((claim) => chunkSemanticDocument(claim, "supplementary")) : [])];
          const index = await loadSemanticMemoryIndex(scope, provider); const revisions = new Map(index.entries.map((entry) => [entry.claimId, entry.revision]));
          count += documents.length; indexed += documents.filter((claim) => revisions.get(claim.id) === semanticClaimRevision(claim)).length;
          limited ||= index.state === "limited"; failed ||= index.state === "failed";
          if (index.state === "failed") failures.add(SEMANTIC_INDEX_FAILURE_LABELS[index.failureCode || "unavailable"]);
        }
        if (!disposed) setStatus(`向量索引 ${indexed}/${count} 个片段${failed ? ` · ${[...failures].join("、")}，保留队列重试` : limited ? " · 今日预算已用完，之后继续" : indexed < count ? " · 前台后台整理中" : " · 当前索引完整"}。未索引内容仍可关键词召回。`);
      } catch { if (!disposed) setStatus("向量索引暂不可读取，继续使用关键词召回。"); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 30_000);
    return () => { disposed = true; clearInterval(timer); };
  }, [relationKey, props.configuration, props.claims]);
  return <div className="rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
    <p role="status">{status}</p>
    {props.configuration?.enabled && <button type="button" disabled={busy} className="mt-2 min-h-11 rounded-lg border border-[var(--border)] px-3 disabled:opacity-50" onClick={async () => {
      setBusy(true);
      try {
        const provider = memoryVectorProviderId(props.configuration!);
        for (const relation of relations) {
          const scope = { characterId: relation.characterId, relationId: relation.id, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId };
          const existing=await loadSemanticMemoryIndex(scope,provider);
          await saveSemanticMemoryIndex({ ...existing, state: "pending", failureCode:undefined, updatedAt: Date.now() });
        }
        document.dispatchEvent(new Event("fanfanji:memory-evidence-updated"));
        setStatus("已排队补齐当前人物索引。保留已有向量，按每日预算后台处理。");
      } catch { setStatus("索引补齐未全部排队，请重试；原始记忆保留。"); }
      finally { setBusy(false); }
    }}>{busy ? "正在排队…" : "继续补齐当前人物索引"}</button>}
  </div>;
}
