import type { KnowledgeClaim, KnowledgeKind, TemporalStatus } from "./characterKnowledgeTypes";
import { evaluateKnowledgeWrite } from "./knowledgeWritePolicy";
import { deriveKnowledgeSemantics, sourceRevision } from "./knowledgeEvolution";
import { groundKnowledgeProposition } from "./knowledgeProposition";
import { assessKnowledgeValue } from "./knowledgeValueAssessment";
import { normalizeKnowledgeAssociation } from "./knowledgeAssociation";
import { normalizeSemanticFactDecision } from "./semanticFactResolution";
import { normalizeKnowledgeEvent, isAmbiguousPlanNonCompletion } from "./knowledgeEventPolicy";
import { semanticClaimRevision } from "../memory/semanticMemoryIndex";
import { reconcileExplicitPlanCancellations } from "./explicitPlanCancellation";
/** Rebuild derived current/history views from validated source revisions each read.
 * Original legacy records stay intact and remain unverified; editing either
 * source automatically removes the entire derived transition. */
export function projectOrganizedKnowledge(input: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  const records = reconcileExplicitPlanCancellations(reconcileOrganizedKnowledge(input.map(unprojectOrganizedKnowledge)));
  const proposals = records.flatMap((claim) => {
    const judgment = claim.organizationJudgment;
    const target = judgment && records.find((record) => record.id === judgment.targetId && record.id !== claim.id
      && record.characterId === claim.characterId && record.relationId === claim.relationId && record.userIdentityId === claim.userIdentityId
      && record.conversationId === claim.conversationId && record.subject === claim.subject && record.status === "active" && !record.recallDisabled);
    if (!judgment || !target || claim.status !== "active" || claim.recallDisabled || judgment.sourceRevision !== organizationSourceRevision(claim)
      || judgment.targetRevision !== organizationSourceRevision(target) || claim.truthStatus !== "legacy_unverified" || target.truthStatus !== "legacy_unverified") return [];
    const decision = normalizeSemanticFactDecision(judgment.factDecision);
    const event = normalizeKnowledgeEvent(judgment.event);
    const quote = claim.source.evidenceQuote || claim.statement; const prior = target.source.evidenceQuote || target.statement;
    const fact = decision && decision.targetClaimId === target.id && ["change", "correction", "duplicate"].includes(decision.operation)
      && decision.confidence >= .92 && decision.previousQuote && prior.includes(decision.previousQuote)
      && quote.includes(decision.currentQuote) && decision.currentQuote.includes(decision.value)
      && !decision.condition && !target.semantics?.condition && ["present", "timeless"].includes(claim.temporalStatus);
    const linkedEvent = event && event.referenceClaimId === target.id && event.referenceQuote && prior.includes(event.referenceQuote)
      && event.matchConfidence! >= .92 && Boolean(event.matchReason)
      && !(event.state === "unfulfilled" && isAmbiguousPlanNonCompletion(quote));
    return fact || linkedEvent ? [{ claim, target, decision: fact ? decision : undefined, event: linkedEvent ? event : undefined }] : [];
  });
  const output = new Map(records.map((record) => [record.id, { ...record }]));
  const byId = new Map(records.map((record) => [record.id, record]));
  const parents = new Map(records.map((record) => [record.id, record.id]));
  const root = (id: string): string => { let current = id; while (parents.get(current) && parents.get(current) !== current) current = parents.get(current)!; return current; };
  for (const record of records) for (const association of record.associations || []) {
    const target = byId.get(association.targetId);
    if (association.relation !== "same_event" || record.truthStatus !== "legacy_unverified" || target?.truthStatus !== "legacy_unverified"
      || record.status !== "active" || target.status !== "active" || record.recallDisabled || target.recallDisabled) continue;
    const roots = [root(record.id), root(target.id)].sort(); parents.set(roots[1], roots[0]);
  }
  const familySizes = new Map<string, number>();
  for (const record of records) familySizes.set(root(record.id), (familySizes.get(root(record.id)) || 0) + 1);
  for (const record of records) {
    if ((familySizes.get(root(record.id)) || 0) > 1) output.get(record.id)!.organizationFamilyId = JSON.stringify(["legacy-event-family", record.characterId,
      record.relationId, record.userIdentityId, record.conversationId, root(record.id)]);
  }
  const rememberBase = (record: KnowledgeClaim) => { record.organizationProjectionBase ||= {
    factIdentity: record.factIdentity, semantics: record.semantics, supersedesId: record.supersedesId, supersededById: record.supersededById,
    retractionReason: record.retractionReason, recallDisabled: record.recallDisabled, mergedClaimIds: record.mergedClaimIds,
    event: record.event, planStatus: record.planStatus, temporalStatus: record.temporalStatus, kind: record.kind, coreMemory: record.coreMemory, importance: record.importance }; };
  const depth = (id: string) => { const seen = new Set<string>(); let current = id;
    while (!seen.has(current)) { seen.add(current); const parent = proposals.find((proposal) => proposal.claim.id === current)?.target.id; if (!parent) break; current = parent; }
    return seen.size; };
  for (const proposal of [...proposals].sort((a, b) => depth(a.claim.id) - depth(b.claim.id))) {
    const { claim, target, decision, event } = proposal;
    const ambiguous = proposals.filter((other) => other.target.id === target.id).length > 1;
    const seen = new Set([claim.id]); let cursor: string | undefined = target.id;
    while (cursor && !seen.has(cursor)) { seen.add(cursor); cursor = proposals.find((other) => other.claim.id === cursor)?.target.id; }
    if (ambiguous || cursor || output.get(target.id)?.resolutionStatus === "review") {
      output.set(claim.id, { ...output.get(claim.id)!, resolutionStatus: "review", resolutionReason: "旧资料的版本方向存在分歧或循环，保留全部原文" }); continue;
    }
    const before = output.get(target.id)!; const next = output.get(claim.id)!;
    rememberBase(before); rememberBase(next);
    if (before.coreMemory) next.coreMemory = true;
    next.importance = Math.max(next.importance ?? 4, before.importance ?? 4);
    if (decision) {
      const identity = before.factIdentity || { entityId: `legacy-entity:${target.id}`, attributeId: `legacy-attribute:${target.id}`,
        entityLabel: decision.entity, attributeLabel: decision.attribute };
      before.factIdentity = identity; next.factIdentity = identity;
      next.semantics = { key: `semantic:${identity.entityId}:${identity.attributeId}`, value: decision.value,
        update: decision.operation === "correction" ? "correction" : "change" };
      if (decision.operation === "duplicate") { before.recallDisabled = true; next.mergedClaimIds = [...new Set([...(next.mergedClaimIds || []), before.id])]; }
      else { before.supersededById = next.id; before.retractionReason = decision.operation === "correction" ? "corrected" : "fact_changed"; next.supersedesId = before.id; }
    }
    if (event) {
      const identityId = before.event?.identityId || `legacy-event:${target.id}`;
      next.event = { ...event, identityId }; if (before.event) before.event = { ...before.event, identityId };
      before.supersededById = next.id; before.retractionReason = "plan_progressed"; next.supersedesId = before.id;
      next.planStatus = event.state === "rescheduled" ? "confirmed" : event.state;
      next.temporalStatus = ["completed", "cancelled", "unfulfilled"].includes(event.state) ? "past" : "future";
      next.kind = next.temporalStatus === "future" ? "plan" : "fact";
    }
  }
  return [...output.values()];
}
export function unprojectOrganizedKnowledge(claim: KnowledgeClaim): KnowledgeClaim {
  if (!claim) return claim;
  const { organizationFamilyId: _family, organizationProjectionBase: base, ...original } = claim;
  if (!base) return original;
  return Object.fromEntries(Object.entries({ ...original, factIdentity: base.factIdentity, semantics: base.semantics, supersedesId: base.supersedesId, supersededById: base.supersededById,
    retractionReason: base.retractionReason, recallDisabled: base.recallDisabled, mergedClaimIds: base.mergedClaimIds,
    event: base.event, planStatus: base.planStatus, temporalStatus: base.temporalStatus, kind: base.kind, coreMemory: base.coreMemory, importance: base.importance }).filter(([, value]) => value !== undefined)) as unknown as KnowledgeClaim;
}
export function organizedSourceCoverage(source: KnowledgeClaim, records: readonly KnowledgeClaim[]): number {
  const covered = new Set<number>();
  for (const atom of records.filter((record) => record.organizationSourceId === source.id && record.status === "active")) {
    let start = source.statement.indexOf(atom.statement);
    while (start >= 0) {
      for (let index = start; index < start + atom.statement.length; index++) covered.add(index);
      start = source.statement.indexOf(atom.statement, start + Math.max(1, atom.statement.length));
    }
  }
  const significant = [...source.statement.matchAll(/[\s\S]/gu)].map((match) => ({ character: match[0], index: match.index! })).filter(({ character }) => !/[\s\p{P}\p{S}]/u.test(character));
  return significant.length ? significant.filter(({ index }) => covered.has(index)).length / significant.length : 1;
}
export function enrichOrganizedKnowledge(claim: KnowledgeClaim, raw: unknown, registry: readonly KnowledgeClaim[],options?:{preserveValue?:boolean}): KnowledgeClaim {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return claim;
  const item = raw as Record<string, unknown>; const association = normalizeKnowledgeAssociation(item.association);
  const target = association && registry.find((record) => record.id === association.targetId && record.status === "active" && !record.recallDisabled
    && record.characterId === claim.characterId && record.relationId === claim.relationId && record.userIdentityId === claim.userIdentityId && record.conversationId === claim.conversationId
    && record.id !== claim.id && record.id !== claim.organizationSourceId && record.statement.includes(association.targetQuote) && claim.statement.includes(association.sourceQuote));
  // The organizer judges the stored statement. Its literal source quote may
  // contain the original dialogue rather than this historical paraphrase.
  // Keep that provenance intact; never replace it with the paraphrase.
  const result = options?.preserveValue?{...claim}:{...assessKnowledgeValue({...claim,source:{...claim.source,evidenceQuote:claim.statement}}, item.valueAssessment).claim,source:claim.source};
  if (association && target) result.associations = [{ ...association, targetRevision: organizationSourceRevision(target) }];
  result.importance = Math.max(claim.importance ?? 4, result.importance ?? 4);
  return result;
}
export const organizationSourceRevision = (input: KnowledgeClaim) => {
  const claim = unprojectOrganizedKnowledge(input);
  return sourceRevision(JSON.stringify([claim.characterId, claim.relationId, claim.userIdentityId, claim.conversationId, claim.subject,
    semanticClaimRevision({ ...claim, validTo: undefined, validFrom: undefined, supersededById: undefined, recallDisabled: false })]));
};
/** A model's discard is not a user deletion. Keep the original compatible
 * unless a complete, revision-matched replacement can actually be used. */
export function preserveUnreplacedLegacySources(records:readonly KnowledgeClaim[],legacySourceIds:ReadonlySet<string>=new Set()):KnowledgeClaim[]{
 return records.map(source=>{
  const legacy=source.legacyCompatible||source.source.kind==="legacy_memory"||source.source.kind==="import"||legacySourceIds.has(source.id);
  if((!source.organizationOriginal&&!(legacy&&(source.admissionStatus==="skipped"||legacySourceIds.has(source.id)&&source.admissionStatus==="review")))||source.organizationSourceId||source.offlineArchiveManaged
    ||source.status!=="active"||source.recallDisabled||source.supersededById||source.intervention
    ||!legacy)return source;
  const children=records.filter(c=>c.organizationSourceId===source.id&&isExactScopeForCutover(c,source)
    &&c.organizationSourceRevision===organizationSourceRevision(source)&&c.status==="active"&&!c.recallDisabled&&!c.supersededById);
  if(children.some(c=>c.admissionStatus==="retained")&&children.every(c=>c.admissionStatus==="retained"||c.admissionStatus==="skipped"))return source;
  return {...source,organizationOriginal:true,legacyCompatible:true,...(source.admissionStatus==="skipped"?{admissionStatus:"review" as const}:{})};
 });
}
/** Cut over only a fully processed source; a held child keeps its original
 * compatible until review. The parent itself is an archive, not a new fact. */
export function finalizeLegacySourceCutover(records:readonly KnowledgeClaim[],processed:Readonly<Record<string,string>>,reviewIds:ReadonlySet<string>):KnowledgeClaim[]{
 const preserved=preserveUnreplacedLegacySources(records);
 return preserved.map(source=>{
  if(!source.legacyCompatible||processed[source.id]!==organizationSourceRevision(source))return source;
  if(!source.organizationOriginal)return source.admissionStatus==="retained"?{...source,legacyCompatible:false}:source;
  const children=preserved.filter(c=>c.organizationSourceId===source.id&&isExactScopeForCutover(c,source)&&c.organizationSourceRevision===organizationSourceRevision(source)&&c.status==="active"&&!c.recallDisabled&&!c.supersededById);
  if(!children.some(c=>c.admissionStatus==="retained")||children.some(c=>reviewIds.has(c.id)||c.admissionStatus!=="retained"&&c.admissionStatus!=="skipped"))return source;
  return {...source,legacyCompatible:false};
 });
}
const isExactScopeForCutover=(a:KnowledgeClaim,b:KnowledgeClaim)=>a.characterId===b.characterId&&a.relationId===b.relationId&&a.userIdentityId===b.userIdentityId&&a.conversationId===b.conversationId;
export function reconcileOrganizedKnowledge(claims: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  return claims.map((originalClaim) => {
    const claim = originalClaim.associations ? { ...originalClaim, associations: originalClaim.associations.filter((association) => claims.some((target) => target.id === association.targetId
      && target.status === "active" && target.characterId === originalClaim.characterId && target.relationId === originalClaim.relationId
      && target.userIdentityId === originalClaim.userIdentityId && target.conversationId === originalClaim.conversationId
      && association.targetRevision === organizationSourceRevision(target) && target.statement.includes(association.targetQuote)
      && originalClaim.statement.includes(association.sourceQuote))) } : originalClaim;
    if (!claim.organizationSourceId || claim.status !== "active") return claim;
    const original = claims.find((source) => source.id === claim.organizationSourceId || source.mergedClaimIds?.includes(claim.organizationSourceId!));
    return original?.status === "active" && claim.organizationSourceRevision === organizationSourceRevision(original) ? claim
      : { ...claim, status: "retracted", truthStatus: "retracted", retractionReason: "organized_source_changed" };
  });
}
/** Atomisation never raises source authority, changes ownership or discards the original. */
export function acceptOrganizedKnowledge(base: KnowledgeClaim, input: unknown, registry: readonly KnowledgeClaim[] = []): KnowledgeClaim[] {
  if (!Array.isArray(input) || input.length > 12) return [];
  const atoms: KnowledgeClaim[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (item.sourceId !== base.id || typeof item.quote !== "string" || !item.quote.trim() || item.quote.length > 1900
      || !base.statement.includes(item.quote) || !["fact", "preference", "plan", "belief", "hypothesis"].includes(String(item.kind))
      || !["past", "present", "future", "timeless", "unknown"].includes(String(item.temporalStatus))) continue;
    const statement = item.quote.trim();
    // A literal substring can still drop a negation, condition or speaker.
    // Require complete clauses so atomisation cannot strengthen the source.
    const start = base.statement.indexOf(item.quote);
    const rawBefore = base.statement.slice(0, start);
    const rawAfter = base.statement.slice(start + item.quote.length);
    const before = rawBefore.trimEnd();
    const after = rawAfter.trimStart();
    // Historical summaries are often bullet lists with explicit parser labels.
    // These decorations are not omitted semantic clauses. Recognize only a
    // complete line prefix; never strip arbitrary brackets, speakers, negation
    // or conditions in order to make a model substring pass.
    const linePrefix=rawBefore.slice(rawBefore.lastIndexOf("\n")+1);
    const decoratedLineStart=/^[\t ]*(?:[-•][\t ]*)?(?:\[(?:已确认事实|已确认约定|用户陈述|待验证|待核验|推断|偏好|未来计划|未发生计划)(?:\/(?:事实|偏好|推断|计划))?\][\t ]*)*$/u.test(linePrefix);
    const startsClause=!before||decoratedLineStart||/[。！？!?；;]$/u.test(before)||/^[。！？!?；;\n]/u.test(item.quote);
    const endsClause=!after||/^[\t \r]*\n/u.test(rawAfter)||/^[。！？!?；;]/u.test(after)||/[。！？!?；;\n]$/u.test(item.quote.trimEnd());
    if(!startsClause||!endsClause)continue;
    // Reorganizing an already persisted offline record is not a new story sync.
    // Validate it as an archival derivative, then restore its original provenance
    // and authority cap. Never invent a fresh offline consent/policy object.
    const archivalOffline=base.source.kind==="offline_story";
    const decision = evaluateKnowledgeWrite({ ...base, id: `organized:${base.id}:${sourceRevision(JSON.stringify([statement, item.kind, item.temporalStatus]))}`,
      statement, kind: item.kind as KnowledgeKind, temporalStatus: /以前|过去|曾经|当年/u.test(statement) && !/现在|不再|已经不/u.test(statement) ? "past" : item.temporalStatus as TemporalStatus,
      userConfirmed: base.userConfirmed, source: { ...base.source,...(archivalOffline?{kind:"legacy_memory" as const,sourceRecordId:base.source.sourceRecordId||base.id}:{}), evidenceQuote: statement }, recordedAt: base.recordedAt });
    if (!decision.accepted) continue;
    const claim: KnowledgeClaim = { ...decision.claim, legacyCompatible:false, truthStatus: base.truthStatus, confidence: Math.min(base.confidence, decision.claim.confidence),
      source:{...base.source,evidenceQuote:statement},
      userConfirmed: base.userConfirmed, importance: base.importance, coreMemory: base.coreMemory, continuityVersion: 1 as const };
    claim.organizationSourceId = base.id;
    claim.organizationSourceRevision = organizationSourceRevision(base);
    claim.semantics = deriveKnowledgeSemantics(claim) || groundKnowledgeProposition(item.proposition, claim);
    if (!atoms.some((atom) => atom.statement === claim.statement)) atoms.push(enrichOrganizedKnowledge(claim, item, registry));
  }
  return atoms;
}
