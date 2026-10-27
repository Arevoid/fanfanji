import type { KnowledgeClaim, KnowledgeValueAssessment } from "./characterKnowledgeTypes";
export const isKnowledgeAdmitted=(claim:KnowledgeClaim)=>(claim.source.app!=="diary"||claim.source.producer==="diary-reflection.v1"&&claim.kind==="belief"&&claim.truthStatus==="inferred")&&(claim.admissionStatus===undefined||claim.admissionStatus==="retained"||claim.legacyCompatible===true&&claim.admissionStatus==="review");
export function normalizeKnowledgeValueAssessment(raw: unknown): KnowledgeValueAssessment | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  if (typeof item.quote !== "string" || !item.quote || item.quote.length > 2000 || typeof item.reason !== "string" || !item.reason || item.reason.length > 500
    || !["impact", "durability", "novelty", "confidence"].every((key) => typeof item[key] === "number" && Number.isFinite(item[key]))) return undefined;
  if (Number(item.impact) < 0 || Number(item.impact) > 3 || Number(item.durability) < 0 || Number(item.durability) > 3
    || Number(item.novelty) < 0 || Number(item.novelty) > 2 || Number(item.confidence) < 0 || Number(item.confidence) > 1) return undefined;
  return { quote: item.quote, reason: item.reason, impact: Number(item.impact), durability: Number(item.durability), novelty: Number(item.novelty), confidence: Number(item.confidence),
    ...(typeof item.explicitRemember === "boolean" ? { explicitRemember: item.explicitRemember } : {}) };
}
/** Semantic value is proposed, but provenance caps both ranking and core-candidate eligibility. */
export function assessKnowledgeValue(claim: KnowledgeClaim, raw: unknown): { claim: KnowledgeClaim; retain: boolean } {
  const value = normalizeKnowledgeValueAssessment(raw);
  const reliability = claim.truthStatus === "confirmed" ? 1 : claim.truthStatus === "asserted" ? .85 : claim.truthStatus === "legacy_unverified" ? .25 : .4;
  if (!value || !(claim.source.evidenceQuote || claim.statement).includes(value.quote) || value.confidence < .8)
    return { claim: { ...claim, admissionStatus:"review",importance: Math.min(claim.importance ?? 4, 5), valueReason: "价值尚未核实，原文保留待整理，不参与正式召回", coreCandidate: false }, retain: true };
  const explicitlyRequested = value.explicitRemember === true && claim.source.authorship === "user" && /记住|别忘|不要忘|remember|keep.{0,12}mind/iu.test(value.quote);
  const importance = Math.max(1, Math.min(10, Math.round(1 + (value.impact * 1.3 + value.durability * 1.1 + value.novelty * .4) * reliability + (explicitlyRequested ? 2 : 0))));
  const retain=explicitlyRequested || value.impact > .5 || value.durability > 0;
  return { claim: { ...claim,admissionStatus:retain?"retained":"skipped", importance, valueAssessment: value, coreCandidate: reliability >= .85 && importance >= 8 && value.confidence >= .9,
    valueReason: `${value.reason}；持续影响 ${value.impact}/3，持续性 ${value.durability}/3，新信息 ${value.novelty}/2，来源权重 ${reliability}${explicitlyRequested ? "，用户明确要求记住" : ""}` },
    retain };
}
