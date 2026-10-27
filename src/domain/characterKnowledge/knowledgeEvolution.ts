import type { KnowledgeClaim, KnowledgeSemantics } from "./characterKnowledgeTypes";
import { canonicalKnowledgeAttribute, canonicalKnowledgeKey } from "./knowledgeAttributeIdentity";
import { evolveKnowledgeEvents } from "./knowledgeEventPolicy";
import { resolveSemanticFact } from "./semanticFactResolution";
import {hasSemanticTransitionAuthorization} from "./semanticTransitionReview";
import {isKnowledgeAdmitted} from "./knowledgeValueAssessment";
import {sourceContradictsSemanticReplacement} from "./knowledgeSourceConsistency";
import { reconcileExplicitPlanCancellations } from "./explicitPlanCancellation";

const clean = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s/gu, "");
export function sourceRevision(text: string): string {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

/** Narrow deterministic updates: unknown propositions remain evidence-bearing records. */
export function deriveKnowledgeSemantics(claim: Pick<KnowledgeClaim, "statement" | "subject" | "source">): KnowledgeSemantics | undefined {
  if (claim.subject !== "user" || claim.source.authorship !== "user") return undefined;
  const text = clean(claim.statement);
  // Embedded speakers and conditional preferences cannot revise the user's
  // unconditional current state, even when a model mislabels their subject.
  if (/如果|假如|要是|只在|只有|有时候|偶尔|的时候|也许|可能|听说|据说|转述|告诉我|跟我说|说[：:]|[“「『"']/u.test(text)) return undefined;
  const update = /说错|纠正|更正|其实不是/u.test(text) ? "correction" : /现在|后来|改成|改为|换成|变成|不再|已经不/u.test(text) ? "change" : "assertion";
  // Only the last explicit preference governs a change sentence. Conditions
  // remain part of the key; black coffee and latte are separate propositions.
  const preferences = [...text.matchAll(/(?:^|[；;,，。！？!?])(?:我|用户)?(?:现在|后来|以前|过去|曾经|最初)?(不再喜欢|已经不喜欢|不喜欢|讨厌|喜欢)([^；;,，。！？!?]{1,40})/gu)];
  const preference = preferences.at(-1);
  if (preference) {
    let object = preference[2].replace(/了$/u, "");
    if (!object && update === "change" && preferences.length === 2) {
      object = preferences[0][2].replace(/了$/u, "");
    }
    if (!object || /以前|过去|曾经|最初/u.test(text.slice(0, preference.index)) && !/现在|后来|不再|已经不/u.test(text)) return undefined;
    if (/但是|不过|因为|如果|的时候|时|只|有时候|偶尔/u.test(object)) return undefined;
    return { key: `user:preference:${object}`, value: preference[1] === "喜欢" ? "like" : "dislike", update };
  }
  const patterns: [string, RegExp][] = [
    ["residence", /(?:我|用户)(?:现在|已经)?(?:住在|搬到)([^；;，。！？!?]{1,40})/u],
    ["name", /(?:我|用户)(?:现在)?(?:叫|名字是)([^；;，。！？!?]{1,20})/u],
    ["occupation", /(?:我|用户)(?:现在)?(?:的工作是|职业是)([^；;，。！？!?]{1,40})/u],
  ];
  for (const [attribute, pattern] of patterns) {
    const match = text.match(pattern);
    if (match && !/如果|也许|可能|以前|曾经/u.test(text)) return { key: `user:${attribute}`, value: match[1], update };
  }
  // Open attribute syntax also upgrades evidence-bearing old records without
  // a model call or an attribute allowlist. Historical/conditional material is excluded.
  const generic = text.match(/^(?:我|用户)(?:现在)?的([^；;,，。！？!?]{1,40}?)(?:现在)?(?:是|为|改为|换成|改成)([^；;,，。！？!?]{1,200})/u);
  if (generic && !/以前|过去|曾经|最初/u.test(text)) return {
    key: `user:attribute:${canonicalKnowledgeAttribute(generic[1])}`, value: generic[2].replace(/了$/u, ""), update,
  };
  return undefined;
}

const sameScope = (a: KnowledgeClaim, b: KnowledgeClaim) => a.characterId === b.characterId
  && a.relationId === b.relationId && a.userIdentityId === b.userIdentityId && a.conversationId === b.conversationId;

export function evolveKnowledgeClaims(existing: readonly KnowledgeClaim[], incoming: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  const semantic = (claim: KnowledgeClaim) => { const value = claim.semantics || deriveKnowledgeSemantics(claim);
    return value ? { ...value, key: canonicalKnowledgeKey(value.key) } : undefined; };
  let records: KnowledgeClaim[] = existing.map((claim) => ({ ...claim, semantics: semantic(claim) }));
  const bindsLegacyIdentity=(claim:KnowledgeClaim)=>{
    const decision=claim.factDecision;
    const target=existing.find(record=>record.id===decision?.targetClaimId&&sameScope(record,claim));
    return decision?.operation==="duplicate"&&target&&!target.factIdentity
      &&(!decision.entityReferenceId||decision.entityReferenceId===target.id)&&hasSemanticTransitionAuthorization(claim,target);
  };
  // Model output order cannot let a broad replacement consume an identity
  // before a separately reviewed, unchanged facet establishes its own slot.
  const faceted=incoming.map(claim=>{
    const decision=claim.factDecision;
    const target=existing.find(record=>record.id===decision?.targetClaimId&&sameScope(record,claim));
    if(!target||target.factIdentity||decision?.operation!=="duplicate"||!isKnowledgeAdmitted(claim)
      ||!hasSemanticTransitionAuthorization(claim,target)||!decision.previousQuote)return claim;
    const text=target.source.evidenceQuote||target.statement;
    const start=text.indexOf(decision.previousQuote),end=start+decision.previousQuote.length;
    const replacement=incoming.find(next=>{
      const change=next.factDecision;
      if(next===claim||!change||change.targetClaimId!==target.id||!["change","correction"].includes(change.operation)
        ||!isKnowledgeAdmitted(next)||!hasSemanticTransitionAuthorization(next,target)||!change.previousQuote
        ||sourceContradictsSemanticReplacement(target,change,[next.source.evidenceQuote||next.statement]))return false;
      const other=text.indexOf(change.previousQuote);
      return start>=0&&other>=0&&(other+change.previousQuote.length<=start||end<=other);
    });
    // Two separately reviewed, disjoint source spans establish distinct facets.
    // Keep the unchanged facet without binding the whole compound legacy record
    // to its attribute, which would invalidate the other facet's revision lease.
    if(!replacement)return claim;
    return {...claim,statement:decision.currentQuote,factDecision:{...decision,operation:"new" as const,
      targetClaimId:undefined,entityReferenceId:undefined,previousQuote:undefined},semantics:undefined};
  });
  const ordered=[...faceted].sort((a,b)=>Number(Boolean(bindsLegacyIdentity(b)))-Number(Boolean(bindsLegacyIdentity(a))));
  for (const raw of ordered) {
    const known=records.find(claim=>claim.id===raw.id||claim.mergedClaimIds?.includes(raw.id));
    if(known){
      if(known.id===raw.id&&known.admissionStatus==="review"&&(raw.admissionStatus==="review"||raw.admissionStatus==="skipped")&&raw.offlineArchiveManaged
        &&sameScope(known,raw)&&known.statement===raw.statement&&JSON.stringify(known.source)===JSON.stringify(raw.source))
        records=records.map(claim=>claim.id===known.id?{...claim,offlineArchiveManaged:true,admissionStatus:raw.admissionStatus,coreCandidate:false}:claim);
      if(known.id===raw.id&&known.admissionStatus==="review"&&raw.admissionStatus==="retained"&&sameScope(known,raw)
        &&known.statement===raw.statement&&JSON.stringify(known.source)===JSON.stringify(raw.source)){
        records=records.filter(claim=>claim.id!==known.id);
      }else continue;
    }
    if(raw.admissionStatus!==undefined&&raw.admissionStatus!=="retained"){records.push(raw);continue;}
    if (raw.event) { records = evolveKnowledgeEvents(records, [raw]); continue; }
    const resolved = resolveSemanticFact(records, raw);
    if (resolved) { records = resolved; continue; }
    const next = { ...raw, semantics: semantic(raw) };
    if (next.status !== "active" || next.supersededById || next.validTo !== undefined
      || !["asserted", "confirmed"].includes(next.truthStatus)
      || !["present", "timeless"].includes(next.temporalStatus)) { records.push(next); continue; }
    const previous = records.filter((claim) => isKnowledgeAdmitted(claim)&&sameScope(claim, next) && claim.status === "active"
      && !claim.supersededById && claim.validTo === undefined
      && (claim.semantics || deriveKnowledgeSemantics(claim))?.key === next.semantics?.key);
    if (next.semantics) {
      const conflict = previous.filter((claim) => (claim.semantics || deriveKnowledgeSemantics(claim))?.value !== next.semantics!.value);
      const repeated = previous.find((claim) => claim.source.kind === "user_message" && next.source.kind === "user_message"
        && claim.temporalStatus === "present" && next.temporalStatus === "present"
        && claim.truthStatus === next.truthStatus && (claim.semantics || deriveKnowledgeSemantics(claim))?.value === next.semantics!.value);
      if (!conflict.length && repeated) {
        records = records.map((claim) => claim !== repeated ? claim : { ...claim, semantics: next.semantics,
          mergedClaimIds: [...new Set([...(claim.mergedClaimIds || []), next.id])],
          source: { ...claim.source, messageIds: [...new Set([...(claim.source.messageIds || []), ...(next.source.messageIds || [])])],
            evidenceGroups: [...(claim.source.evidenceGroups || [claim.source.messageIds || []]), ...(next.source.evidenceGroups || [next.source.messageIds || []])].filter((group) => group.length > 0),
            messageRevisions: { ...claim.source.messageRevisions, ...next.source.messageRevisions } },
          recordedAt: Math.max(claim.recordedAt, next.recordedAt), importance: Math.max(claim.importance ?? 4, next.importance ?? 4),
        });
        continue;
      }
      if (conflict.length) {
        const observedAt = (claim: KnowledgeClaim) => claim.source.statementAt ?? claim.recordedAt;
        const newest = [...conflict].sort((a, b) => observedAt(b) - observedAt(a))[0];
        if (observedAt(next) < observedAt(newest)) {
          next.validTo = observedAt(newest); next.supersededById = newest.id; next.retractionReason = "fact_changed";
        } else if (next.semantics.update !== "assertion") {
          if (conflict.some((claim) => claim.coreMemory)) next.coreMemory = true;
          const ids = new Set(conflict.map((claim) => claim.id));
          records = records.map((claim) => ids.has(claim.id) ? {
            ...claim, semantics: claim.semantics || deriveKnowledgeSemantics(claim),
            validTo: next.occurredAt ?? next.recordedAt, supersededById: next.id,
            retractionReason: next.semantics!.update === "correction" ? "corrected" : "fact_changed",
          } : claim);
          next.supersedesId = conflict.at(-1)!.id;
        } else {
          next.truthStatus = "disputed";
          const ids = new Set(conflict.map((claim) => claim.id));
          records = records.map((claim) => ids.has(claim.id) ? { ...claim, truthStatus: "disputed" } : claim);
        }
      }
    }
    records.push(next);
  }
  return reconcileExplicitPlanCancellations(records);
}

export const asksForHistory = (query: string) => /以前|原来|当时|曾经|过去|之前|最初|原定|那次|上次|改期|怎么变|如何变|history|previously|used to/iu.test(query);
export const isHistoricalKnowledgeVersion = (claim: Pick<KnowledgeClaim, "status" | "retractionReason">) => claim.status === "active"
  && ["fact_changed", "plan_progressed"].includes(claim.retractionReason || "");
