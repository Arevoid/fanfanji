import type { KnowledgeClaim, KnowledgeSemantics } from "./characterKnowledgeTypes";
import { canonicalKnowledgeAttribute } from "./knowledgeAttributeIdentity";

export interface ExtractedProposition { attribute: string; value: string; update: "assertion" | "change" | "correction"; condition?: string }
export function normalizeExtractedProposition(raw: unknown): ExtractedProposition | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.attribute !== "string" || !value.attribute.trim() || value.attribute.length > 80
    || typeof value.value !== "string" || !value.value.trim() || value.value.length > 200
    || !["assertion", "change", "correction"].includes(value.update as string)
    || value.condition !== undefined && (typeof value.condition !== "string" || value.condition.length > 120)) return undefined;
  return { attribute: value.attribute.trim(), value: value.value.trim(), update: value.update as ExtractedProposition["update"],
    ...(typeof value.condition === "string" && value.condition.trim() ? { condition: value.condition.trim() } : {}) };
}
export function groundKnowledgeProposition(raw: unknown, claim: Pick<KnowledgeClaim, "subject" | "kind" | "temporalStatus" | "source" | "statement">): KnowledgeSemantics | undefined {
  const proposal = normalizeExtractedProposition(raw);
  if (!proposal || claim.subject !== "user" || claim.source.authorship !== "user"
    || !["fact", "preference"].includes(claim.kind) || !["present", "timeless"].includes(claim.temporalStatus)) return undefined;
  const evidence = claim.statement.normalize("NFKC").replace(/\s/gu, "");
  if (!/^(?:我|用户)/u.test(evidence) || /我(?:妈妈|爸爸|朋友|同事|姐姐|妹妹|哥哥|弟弟)|听说|据说|转述|告诉我|跟我说|说[：:]|[“「『"']|也许|可能|假如|如果|要是/u.test(evidence)
    || !evidence.includes(proposal.value.normalize("NFKC").replace(/\s/gu, ""))) return undefined;
  if (/只在|只有|有时候|偶尔|的时候/u.test(evidence) && !proposal.condition) return undefined;
  if (proposal.condition && !evidence.includes(proposal.condition.replace(/\s/gu, ""))) return undefined;
  const correction = /说错|纠正|更正|记错|其实不是/u.test(evidence);
  const change = /现在|后来|改成|改为|变成|不再|已经|换成|从.+(?:到|为|成)/u.test(evidence);
  if (proposal.update === "correction" && !correction || proposal.update === "change" && !change) return undefined;
  const attribute = canonicalKnowledgeAttribute(proposal.attribute);
  return { key: `user:attribute:${attribute}${proposal.condition ? `:when:${proposal.condition}` : ""}`,
    value: proposal.value.normalize("NFKC").toLocaleLowerCase().trim(), update: proposal.update,
    ...(proposal.condition ? { condition: proposal.condition } : {}) };
}
