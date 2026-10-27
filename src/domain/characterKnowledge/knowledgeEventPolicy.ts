import type { KnowledgeClaim, KnowledgeEventIdentity } from "./characterKnowledgeTypes";
import {isKnowledgeAdmitted} from "./knowledgeValueAssessment";
const states = new Set(["proposed", "confirmed", "completed", "cancelled", "rescheduled", "unfulfilled"]);
/** Merely unfinished is not a terminal outcome, even if two model judgments agree. */
export function isAmbiguousPlanNonCompletion(evidence: string): boolean {
  return /(?:没有|尚未|还没|未)完成/u.test(evidence) && !/最终|爽约|失约|未兑现|没有兑现|没有履行|没能赴约/u.test(evidence);
}
export function normalizeKnowledgeEvent(value: unknown): KnowledgeEventIdentity | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const event = value as Record<string, unknown>;
  if (typeof event.activity !== "string" || event.activity.trim().length < 2 || event.activity.length > 120 || !states.has(String(event.state))) return undefined;
  if (event.scheduledDate !== undefined) {
    if (typeof event.scheduledDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(event.scheduledDate)) return undefined;
    const time = Date.parse(`${event.scheduledDate}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== event.scheduledDate) return undefined;
  }
  return { activity: event.activity.trim().normalize("NFKC"), state: event.state as KnowledgeEventIdentity["state"],
    ...Object.fromEntries(["identityId", "referenceClaimId", "referenceQuote", "matchReason", "object", "place", "timeWindow"].flatMap((key) => typeof event[key] === "string" && event[key].trim() && event[key].length <= 2000 ? [[key, event[key].trim()]] : [])),
    ...(typeof event.matchConfidence === "number" && Number.isFinite(event.matchConfidence) ? { matchConfidence: Math.max(0, Math.min(1, event.matchConfidence)) } : {}),
    ...(Array.isArray(event.participants) && event.participants.length <= 12 && event.participants.every((value) => typeof value === "string" && value.length <= 120) ? { participants: [...new Set(event.participants as string[])] } : {}),
    ...(event.scheduledDate ? { scheduledDate: event.scheduledDate as string } : {}) };
}
/** A model proposes labels; source text authorizes lifecycle changes. */
export function groundKnowledgeEvent(value: unknown, claim: KnowledgeClaim, existing: readonly KnowledgeClaim[] = [], independentlyReviewed?: boolean): KnowledgeEventIdentity | undefined {
  const event = normalizeKnowledgeEvent(value); const evidence = claim.source.evidenceQuote || claim.statement;
  const referenced = event?.referenceClaimId ? existing.find((record) => record.id === event.referenceClaimId && scopeKey(record) === scopeKey(claim)
    && isKnowledgeAdmitted(record)&&record.status === "active" && !record.recallDisabled && record.event && event.referenceQuote
    && (record.source.evidenceQuote || record.statement).includes(event.referenceQuote)) : undefined;
  const semanticReference = referenced && (event?.matchConfidence ?? 0) >= .92 && Boolean(event?.matchReason);
  if (independentlyReviewed === false) return undefined;
  if (!event || !["asserted", "confirmed"].includes(claim.truthStatus) || /如果|假如|也许|可能|听说|据说/u.test(evidence)
    || !evidence.normalize("NFKC").includes(event.activity) && !semanticReference || event.referenceClaimId && !semanticReference) return undefined;
  const cues = { proposed: /计划|打算|想去|准备|希望/u, confirmed: /约定|约好|说定|答应|确定/u,
    completed: /完成|已经|去了|做完|结束|兑现/u, cancelled: /取消|作罢|放弃|不去了|不再/u,
    rescheduled: /改到|改为|改期|推迟|提前|延期/u, unfulfilled: /没来|没到|爽约|失约|未兑现|没有兑现|没能赴约|没有履行/u };
  if (!cues[event.state].test(evidence) && !independentlyReviewed) return undefined;
  if (event.state === "unfulfilled" && /没有爽约|并未爽约|没有失约|并未失约|尚未到期|还没到约定/u.test(evidence)) return undefined;
  if (event.state === "unfulfilled" && isAmbiguousPlanNonCompletion(evidence)) return undefined;
  if ([...(event.participants || []), event.object, event.place, event.timeWindow].filter((text): text is string => Boolean(text))
    .some((text) => !evidence.includes(text) && !(referenced && (referenced.source.evidenceQuote || referenced.statement).includes(text)))) return undefined;
  if (event.state === "completed" && /没有|没能|尚未|未完成|明天|将要|准备|打算/u.test(evidence)) return undefined;
  if (event.scheduledDate) {
    const [year, month, day] = event.scheduledDate.split("-");
    if (!evidence.includes(event.scheduledDate) && !evidence.includes(`${year}年${Number(month)}月${Number(day)}日`)) return undefined;
  }
  // Identity IDs come from the runtime; model-authored identity IDs are discarded.
  return { ...event, identityId: semanticReference ? referenced.event!.identityId || `event:${referenced.id}` : `event:${claim.id}` };
}
const scopeKey = (claim: KnowledgeClaim) => JSON.stringify([claim.characterId, claim.relationId, claim.userIdentityId, claim.conversationId, claim.subject]);
export function evolveKnowledgeEvents(existing: readonly KnowledgeClaim[], incoming: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  let records = existing.map((claim) => ({ ...claim }));
  for (const raw of incoming) {
    if (records.some((claim) => claim.id === raw.id || claim.mergedClaimIds?.includes(raw.id))) continue;
    const next = { ...raw }; const event = next.event;
    if (!event || next.status !== "active" || !["asserted", "confirmed"].includes(next.truthStatus)) { records.push(next); continue; }
    const related = records.filter((claim) => isKnowledgeAdmitted(claim)&&scopeKey(claim) === scopeKey(next) && claim.status === "active"
      && !claim.supersededById && claim.event && (event.referenceClaimId ? claim.id === event.referenceClaimId
        : claim.event.activity === event.activity && JSON.stringify(claim.event.participants || []) === JSON.stringify(event.participants || [])
          && (claim.event.object || "") === (event.object || "") && (claim.event.place || "") === (event.place || "")
          && (claim.event.timeWindow || "") === (event.timeWindow || "")) && ["asserted", "confirmed"].includes(claim.truthStatus));
    const duplicate = related.find((claim) => claim.event?.state === event.state
      && (event.scheduledDate && claim.event.scheduledDate === event.scheduledDate || event.referenceClaimId === claim.id && !event.scheduledDate));
    if (duplicate) {
      records = records.map((claim) => claim.id !== duplicate.id ? claim : { ...claim,
        mergedClaimIds: [...new Set([...(claim.mergedClaimIds || []), next.id])],
        source: { ...claim.source, messageIds: [...new Set([...(claim.source.messageIds || []), ...(next.source.messageIds || [])])],
          evidenceGroups: [...(claim.source.evidenceGroups || [claim.source.messageIds || []]), ...(next.source.evidenceGroups || [next.source.messageIds || []])].filter((group) => group.length > 0),
          messageRevisions: { ...claim.source.messageRevisions, ...next.source.messageRevisions } } });
      continue;
    }
    const pending = related.filter((claim) => ["proposed", "confirmed", "rescheduled"].includes(claim.event!.state));
    const candidates = pending.filter((claim) => event.state === "rescheduled" || !event.scheduledDate || claim.event?.scheduledDate === event.scheduledDate);
    // Ambiguous references remain separate; clock passage never completes a plan.
    if (["completed", "cancelled", "rescheduled", "confirmed", "unfulfilled"].includes(event.state) && candidates.length === 1
      && (next.source.statementAt ?? next.recordedAt) >= (candidates[0].source.statementAt ?? candidates[0].recordedAt)) {
      const previous = candidates[0]; next.supersedesId = previous.id;
      next.event = { ...event, identityId: previous.event!.identityId || `event:${previous.id}` };
      records = records.map((claim) => claim.id !== previous.id ? claim : { ...claim, supersededById: next.id,
        validTo: next.source.statementAt ?? next.recordedAt, retractionReason: "plan_progressed" });
    }
    if (["completed", "cancelled", "unfulfilled"].includes(event.state)) { next.temporalStatus = "past"; next.kind = "fact"; }
    else { next.temporalStatus = "future"; next.kind = "plan"; }
    next.planStatus = event.state === "rescheduled" ? "confirmed" : event.state;
    records.push(next);
  }
  return records;
}
