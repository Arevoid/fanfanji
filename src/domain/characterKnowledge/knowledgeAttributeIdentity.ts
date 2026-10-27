/** Stable identities are deliberately narrower than semantic similarity: uncertain near-matches do not auto-merge. */
import type { CharacterTruthScope, KnowledgeClaim } from "./characterKnowledgeTypes";
import { memoryRelevance } from "../memory/memoryRelevance";
const aliases: readonly (readonly string[])[] = [
  ["宠物名", "宠物名字", "宠物名称"], ["猫名字", "猫名"], ["狗名字", "狗名"],
  ["居住地", "住址", "住所", "居住地址"], ["职业", "工作职业"],
  ["姓名", "名字", "名称"], ["工作作息", "工作班次", "上班班次"],
  ["过敏原", "过敏物", "过敏物质"], ["紧急联系人", "紧急联系人员"],
];
export function canonicalKnowledgeAttribute(value: string): string {
  const normalized = value.normalize("NFKC").toLocaleLowerCase().replace(/\s/gu, "").replace(/^(?:用户的|我的|当前的)/u, "");
  return aliases.find((group) => group.includes(normalized))?.[0] || normalized;
}
export function canonicalKnowledgeKey(key: string): string {
  if (!key.startsWith("user:attribute:")) return key;
  const [attribute, ...condition] = key.slice("user:attribute:".length).split(":when:");
  return `user:attribute:${canonicalKnowledgeAttribute(attribute)}${condition.length ? `:when:${condition.join(":when:")}` : ""}`;
}
export function knowledgeAttributeRegistry(claims: readonly KnowledgeClaim[], scope: CharacterTruthScope, query: string): string[] {
  return [...new Set(claims.filter((claim) => claim.characterId === scope.characterId && claim.relationId === scope.relationId
    && claim.userIdentityId === scope.userIdentityId && claim.conversationId === scope.conversationId && claim.status === "active")
    .sort((a, b) => memoryRelevance(b.statement, query) - memoryRelevance(a.statement, query) || b.recordedAt - a.recordedAt)
    .flatMap((claim) => claim.semantics?.key.startsWith("user:attribute:") ? [claim.semantics.key.slice("user:attribute:".length).split(":when:")[0]] : []))].slice(0, 64);
}
