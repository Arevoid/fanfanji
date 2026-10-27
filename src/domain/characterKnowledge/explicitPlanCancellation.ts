import type { KnowledgeClaim } from "./characterKnowledgeTypes";

const quote = (claim: KnowledgeClaim) => claim.source.evidenceQuote || "";
const dates = (text: string) => text.match(/(?:\d{4}年)?\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}/gu) || [];
const sameScope = (a: KnowledgeClaim, b: KnowledgeClaim) => a.characterId === b.characterId
  && a.userIdentityId === b.userIdentityId && a.relationId === b.relationId && a.conversationId === b.conversationId;
const observed = (claim: KnowledgeClaim) => claim.source.statementAt ?? claim.recordedAt;
const usable = (claim: KnowledgeClaim) => claim.status === "active" && !claim.recallDisabled && !claim.supersededById
  && claim.source.authorship === "user" && ["asserted", "confirmed"].includes(claim.truthStatus);
const userProposedPlan = (claim: KnowledgeClaim) => usable(claim) || claim.status === "active" && !claim.recallDisabled && !claim.supersededById
  && ["inferred", "disputed"].includes(claim.truthStatus) && claim.source.kind === "user_message" && Boolean(claim.source.quotedMessageId)
  && claim.source.messageAuthors?.[claim.source.quotedMessageId!] === "user"
  && !["hearsay", "inference"].includes(claim.source.interpretation?.acquisition || "")
  && !/听说|据说|如果|假如|也许|可能/u.test(quote(claim));
const activityText = (text: string) => text.replace(/(?:\d{4}年)?\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}/gu, "")
  .replace(/我们|用户|约定|约好|取消|下午|上午|晚上|见面|时间|安排|那天|已经|不再|好像|可能|一起/gu, "");

/** Narrow local repair: same explicit date AND a shared concrete activity/place span.
 * Ambiguous, conditional, quoted, cross-scope or undated cancellations never retire a plan.
 * Pure projection also repairs already-saved records without rewriting source material.
 */
export function reconcileExplicitPlanCancellations(input: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  let records = [...input];
  for (const cancellation of [...input].sort((a, b) => observed(a) - observed(b))) {
    const current = quote(cancellation);
    if (!usable(cancellation) || !/取消了|已取消|已经取消|不去了|作罢了/u.test(current)
      || /如果|假如|可能|也许|听说|据说|没有取消|没取消|未取消|[？?“”「」]/u.test(current)) continue;
    const date = dates(current);
    if (date.length !== 1) continue;
    const candidates = records.filter(previous => previous.id !== cancellation.id && userProposedPlan(previous)
      && sameScope(previous, cancellation) && previous.kind === "plan" && previous.temporalStatus === "future"
      && observed(previous) <= observed(cancellation) && dates(quote(previous)).length === 1 && dates(quote(previous))[0] === date[0]
      && /约好|约定|说定|计划|打算|准备/u.test(quote(previous))
      && (activityText(quote(previous)).match(/[\u3400-\u9fff]{4,}/gu) || []).some(run =>
        Array.from({ length: run.length - 3 }, (_, i) => run.slice(i, i + 4)).some(span => activityText(current).includes(span))));
    if (candidates.length !== 1) continue;
    const previous = candidates[0];
    records = records.map(claim => claim.id === previous.id ? { ...claim, supersededById: cancellation.id,
      validTo: observed(cancellation), retractionReason: "plan_progressed" }
      : claim.id === cancellation.id ? { ...claim, kind: "fact", temporalStatus: "past", planStatus: "cancelled",
        supersedesId: previous.id } : claim);
  }
  return records;
}
