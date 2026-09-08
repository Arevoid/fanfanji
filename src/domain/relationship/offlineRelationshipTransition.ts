import type { KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import type { CharacterRelationship } from "./characterRelationship";

const NEGATED_OR_HYPOTHETICAL = /(拒绝|否认|没有|并未|尚未|还没|不愿|不想|假装|如果|假如|可能|也许|想象|梦里)/u;
const EXPLICIT_PARTNER_RELATION = /(确认|确立|建立|成为|同意|接受).{0,24}(恋爱关系|情侣关系|男女朋友|男朋友|女朋友)|(?:恋爱关系|情侣关系|男女朋友).{0,24}(确认|确立|建立|成立)/u;

/**
 * Promotes only an explicitly confirmed offline relationship transition.
 * Nicknames, flirting and model inference can never mutate durable state.
 */
export function hasConfirmedOfflinePartnerTransition(claims: readonly KnowledgeClaim[], relationId?: string): boolean {
  return claims.some((claim) => claim.status === "active"
    && (!relationId || claim.relationId === relationId)
    && claim.source.kind === "offline_story"
    && claim.userConfirmed
    && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted")
    && claim.subject !== "other"
    && !NEGATED_OR_HYPOTHETICAL.test(claim.statement)
    && EXPLICIT_PARTNER_RELATION.test(claim.statement));
}

export function applyConfirmedOfflineRelationshipTransition(input: {
  relationships: readonly CharacterRelationship[];
  relationId: string;
  claims: readonly KnowledgeClaim[];
  now?: number;
}): CharacterRelationship[] {
  if (!hasConfirmedOfflinePartnerTransition(input.claims, input.relationId)) return [...input.relationships];
  const now = input.now ?? Date.now();
  return input.relationships.map((relationship) => relationship.id === input.relationId
    ? { ...relationship, relationship: "partner", updatedAt: Math.max(relationship.updatedAt, now) }
    : relationship);
}
