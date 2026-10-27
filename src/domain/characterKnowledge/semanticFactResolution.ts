import type { CharacterTruthScope, KnowledgeClaim, SemanticFactDecision, SemanticFactIdentity } from "./characterKnowledgeTypes";
export type { SemanticFactDecision, SemanticFactIdentity } from "./characterKnowledgeTypes";
import { memoryRelevance } from "../memory/memoryRelevance";
import { normalizeKnowledgeEvent } from "./knowledgeEventPolicy";
import { selectStructuredMemoryRecords } from "../memory/memoryTokenBudget";
import { sourceContradictsSemanticReplacement } from "./knowledgeSourceConsistency";
import { hasSemanticTransitionAuthorization } from "./semanticTransitionReview";
import {isKnowledgeAdmitted} from "./knowledgeValueAssessment";

export interface SemanticRegistryRecord { id: string; statement: string; subject: string; condition?: string; identity?: SemanticFactIdentity; value?: string; event?: KnowledgeClaim["event"] }
export function normalizeSemanticRegistry(raw: unknown): SemanticRegistryRecord[] {
  if (!Array.isArray(raw)) return [];
  return selectStructuredMemoryRecords(raw.slice(0, 48).flatMap((item) => !item || typeof item !== "object" || typeof item.id !== "string" || !item.id || item.id.length > 300
    || typeof item.statement !== "string" || !item.statement || !["user", "character", "relationship", "other"].includes(item.subject) ? []
    : [{ id: item.id, statement: item.statement.slice(0, 1600), subject: item.subject,
      ...(normalizeKnowledgeEvent(item.event) ? { event: normalizeKnowledgeEvent(item.event) } : {}),
      ...(normalizeSemanticFactIdentity(item.identity) ? { identity: normalizeSemanticFactIdentity(item.identity) } : {}),
      ...(typeof item.condition === "string" ? { condition: item.condition.slice(0, 120) } : {}),
      ...(typeof item.value === "string" ? { value: item.value.slice(0, 200) } : {}) }]), 12_000);
}
const sameScope = (a: CharacterTruthScope, b: CharacterTruthScope) => a.characterId === b.characterId && a.relationId === b.relationId
  && a.userIdentityId === b.userIdentityId && a.conversationId === b.conversationId;
export function semanticFactRegistry(claims: readonly KnowledgeClaim[], scope: CharacterTruthScope, query: string): SemanticRegistryRecord[] {
  return claims.filter((claim) => isKnowledgeAdmitted(claim)&&sameScope(claim, scope) && claim.status === "active" && !claim.recallDisabled && !claim.supersededById
    && ["asserted", "confirmed"].includes(claim.truthStatus) && (["fact", "preference"].includes(claim.kind) || claim.event))
    .sort((a, b) => memoryRelevance(b.statement, query) - memoryRelevance(a.statement, query) || b.recordedAt - a.recordedAt)
    .slice(0, 48).map((claim) => ({ id: claim.id, statement: claim.statement.slice(0, 1600), subject: claim.subject,
      ...(claim.event ? { event: claim.event } : {}),
      ...(claim.factIdentity ? { identity: claim.factIdentity } : {}), ...(claim.semantics ? { value: claim.semantics.value, condition: claim.semantics.condition } : {}) }));
}
export function normalizeSemanticFactDecision(raw: unknown): SemanticFactDecision | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  for (const [key, max] of [["entity", 120], ["attribute", 120], ["value", 200], ["reason", 500], ["currentQuote", 2000]] as const)
    if (typeof item[key] !== "string" || !item[key].trim() || item[key].length > max) return undefined;
  if (!["new", "duplicate", "change", "correction", "conflict", "different_condition", "uncertain"].includes(String(item.operation))
    || typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) return undefined;
  for (const key of ["targetClaimId", "entityReferenceId", "previousQuote", "condition"])
    if (item[key] !== undefined && item[key] !== null && (typeof item[key] !== "string" || !item[key].trim() || item[key].length > 2000)) return undefined;
  return { entity: String(item.entity).trim(), attribute: String(item.attribute).trim(), value: String(item.value).trim(),
    operation: item.operation as SemanticFactDecision["operation"], confidence: item.confidence, reason: String(item.reason).trim(), currentQuote: String(item.currentQuote).trim(),
    ...(["same", "different", "unknown"].includes(String(item.conditionRelation)) ? { conditionRelation: item.conditionRelation as SemanticFactDecision["conditionRelation"] } : {}),
    ...(item.targetClaimId ? { targetClaimId: String(item.targetClaimId) } : {}), ...(item.entityReferenceId ? { entityReferenceId: String(item.entityReferenceId) } : {}),
    ...(item.previousQuote ? { previousQuote: String(item.previousQuote) } : {}), ...(item.condition ? { condition: String(item.condition) } : {}) };
}
export function normalizeSemanticFactIdentity(raw: unknown): SemanticFactIdentity | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  return ["entityId", "attributeId", "entityLabel", "attributeLabel"].every((key) => typeof item[key] === "string" && (item[key] as string).length > 0 && (item[key] as string).length < 300)
    ? item as unknown as SemanticFactIdentity : undefined;
}
/** Compare evidence semantically in the extraction request; commit identity and transitions here. */
export function resolveSemanticFact(records: readonly KnowledgeClaim[], incoming: KnowledgeClaim): KnowledgeClaim[] | undefined {
  const decision = normalizeSemanticFactDecision(incoming.factDecision);
  if (!decision) return undefined;
  // A newly reported historical experience does not compete for a current
  // attribute slot. Its ordinary source/value gate remains authoritative.
  if(decision.operation==="new"&&incoming.temporalStatus==="past")return undefined;
  const quote = incoming.source.evidenceQuote || incoming.statement;
  const authoritativeAction = incoming.truthStatus === "confirmed" && (incoming.source.kind === "manual" || incoming.source.kind === "deterministic_action"
    || incoming.source.kind === "offline_story" && incoming.userConfirmed);
  const sourceCanRevise = authoritativeAction || incoming.subject !== "character" && incoming.source.authorship === "user";
  const evidenceValid = sourceCanRevise && ["asserted", "confirmed"].includes(incoming.truthStatus)
    && ["fact", "preference"].includes(incoming.kind) && ["present", "timeless"].includes(incoming.temporalStatus)
    && quote.includes(decision.currentQuote) && decision.currentQuote.includes(decision.value)
    && (!decision.condition || decision.currentQuote.includes(decision.condition));
  const target = records.find((claim) => claim.id === decision.targetClaimId && sameScope(claim, incoming));
  const linked = target && isKnowledgeAdmitted(target)&&target.subject === incoming.subject && target.status === "active" && !target.supersededById && !target.recallDisabled
    && ["asserted", "confirmed"].includes(target.truthStatus) && ["present", "timeless"].includes(target.temporalStatus)
    && decision.previousQuote && (target.source.evidenceQuote || target.statement).includes(decision.previousQuote);
  const hold = (reason: string) => [...records, { ...incoming, resolutionStatus: "review" as const, resolutionReason: reason,
    truthStatus: "disputed" as const, semantics: undefined, factIdentity: undefined }];
  if (!evidenceValid) return hold("原文、主体或当前有效性不足以授权语义修订");
  if (target && sourceContradictsSemanticReplacement(target, decision, [quote])) return hold("来源仍明确保留旧值，不能覆盖；需核对主体");
  if (decision.operation === "uncertain" || decision.confidence < .85) return hold("语义判断不确定，保留原文供核对，不替换当前值");
  if (decision.operation !== "new" && !linked) return hold("目标来源不存在、无权限、过期或引用不匹配");
  if (target && decision.operation !== "new" && !authoritativeAction && !hasSemanticTransitionAuthorization(incoming, target))
    return hold("实体、属性及修订含义尚未通过独立语义核对，保留原记录");
  if (linked && decision.operation !== "different_condition" && (target.semantics?.condition || "") !== (decision.condition || "")
    && !(decision.conditionRelation === "same" && decision.confidence >= .92))
    return hold("条件范围不同，不能覆盖原事实");
  const entityReference = records.find((claim) => claim.id === decision.entityReferenceId && sameScope(claim, incoming)
    && isKnowledgeAdmitted(claim)&&claim.status === "active" && !claim.recallDisabled && (claim.factIdentity
      // A reviewed reference to its own exact legacy target may establish that
      // target's first identity. This grants no reference to another bare record.
      || claim.id===target?.id&&linked&&decision.operation!=="new"));
  if (decision.entityReferenceId && !entityReference) return hold("实体引用无法验证");
  const sameSlot = linked && decision.operation !== "new";
  const identity: SemanticFactIdentity = target?.factIdentity && sameSlot ? target.factIdentity
    : { entityId: entityReference?.factIdentity?.entityId || (sameSlot ? `entity:${target.id}` : `entity:${incoming.id}`),
      attributeId: sameSlot ? `attribute:${target.id}` : `attribute:${incoming.id}`, entityLabel: decision.entity, attributeLabel: decision.attribute };
  const slotCondition = linked && decision.operation !== "different_condition" && decision.conditionRelation === "same"
    ? target.semantics?.condition || "" : decision.condition || "";
  const next: KnowledgeClaim = { ...incoming, factIdentity: identity, resolutionStatus: "accepted", resolutionReason: decision.reason,
    semantics: { key: `semantic:${identity.entityId}:${identity.attributeId}${slotCondition ? `:when:${slotCondition}` : ""}`, value: decision.value,
      ...(decision.condition ? { condition: decision.condition } : {}), update: decision.operation === "correction" ? "correction" : decision.operation === "change" ? "change" : "assertion" } };
  if (!target || !linked || ["new", "different_condition"].includes(decision.operation)) return [
    ...records.map((claim) => sameSlot && claim.id === target?.id ? { ...claim, factIdentity: identity } : claim), next];
  if (decision.operation === "conflict") return [...records.map((claim) => claim.id === target.id ? { ...claim, truthStatus: "disputed" as const } : claim), { ...next, truthStatus: "disputed" }];
  if (decision.operation === "duplicate") return records.map((claim) => claim.id !== target.id ? claim : { ...claim,
    factIdentity: identity, mergedClaimIds: [...new Set([...(claim.mergedClaimIds || []), next.id])],
    source: { ...claim.source, messageIds: [...new Set([...(claim.source.messageIds || []), ...(next.source.messageIds || [])])],
      evidenceGroups: [...(claim.source.evidenceGroups || [claim.source.messageIds || []]), ...(next.source.evidenceGroups || [next.source.messageIds || []])].filter((group) => group.length),
      messageRevisions: { ...claim.source.messageRevisions, ...next.source.messageRevisions } } });
  if (decision.confidence < .92) return hold("替换当前事实需要更充分的语义依据");
  const observed = (claim: KnowledgeClaim) => claim.validFrom ?? claim.source.statementAt ?? claim.recordedAt;
  if (observed(next) < observed(target)) return [...records, { ...next, validTo: observed(target), supersededById: target.id, retractionReason: "fact_changed" }];
  return [...records.map((claim) => claim.id !== target.id ? claim : { ...claim, factIdentity: identity,
    validTo: observed(next), supersededById: next.id, retractionReason: decision.operation === "correction" ? "corrected" : "fact_changed" }),
    { ...next, supersedesId: target.id, ...(target.coreMemory ? { coreMemory: true } : {}) }];
}
