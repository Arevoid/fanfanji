import type { KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import { describeKnowledgeEvidence } from "../characterKnowledge/knowledgeEvidence";
export interface MemoryQueryConstraints { eventDate?: string; entityId?: string }
const entityText = (text: string) => text.normalize("NFKC").replace(/用户的|我的|我家的|我家|\s/gu, "");
export function inferMemoryQueryConstraints(query: string, claims: readonly KnowledgeClaim[]): MemoryQueryConstraints {
  const constraints: MemoryQueryConstraints = {};
  const date = query.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})(?:日)?/u);
  if (date && /那天|那次|当天|发生|约定|经历|回忆|当时/u.test(query)) {
    const calendar = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
    const parsed = new Date(`${calendar}T00:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === calendar) constraints.eventDate = calendar;
  }
  const normalized = entityText(query);
  const entities = new Set(claims.flatMap((claim) => {
    const label = claim.factIdentity && entityText(claim.factIdentity.entityLabel);
    return label && label.length >= 2 && normalized.includes(label) ? [claim.factIdentity!.entityId] : [];
  }));
  // An ambiguous entity reference must not silently hide another entity's record.
  if (entities.size === 1) constraints.entityId = [...entities][0];
  return constraints;
}
export function matchesMemoryQueryConstraints(claim: KnowledgeClaim, constraints: MemoryQueryConstraints): boolean {
  if (constraints.entityId && claim.factIdentity && claim.factIdentity.entityId !== constraints.entityId) return false;
  if (constraints.eventDate) {
    const date = claim.event?.scheduledDate || describeKnowledgeEvidence(claim.source, claim.source.evidenceQuote || claim.statement, claim.characterId).eventDate;
    const interval = claim.source.interpretation?.interval;
    if (date !== constraints.eventDate && !(interval && interval.from <= constraints.eventDate && constraints.eventDate <= interval.to)) return false;
  }
  return true;
}
export function memoryQueryMatchingIds(claims: readonly KnowledgeClaim[], constraints: MemoryQueryConstraints): Set<string> {
  const ids = new Set(claims.filter((claim) => matchesMemoryQueryConstraints(claim, constraints)).map((claim) => claim.id));
  if (!constraints.eventDate) return ids;
  const identities = new Set(claims.filter((claim) => ids.has(claim.id) && claim.event?.identityId).map((claim) => claim.event!.identityId));
  const families = new Set(claims.filter((claim) => ids.has(claim.id) && claim.organizationFamilyId).map((claim) => claim.organizationFamilyId!));
  let changed = true;
  while (changed) { changed = false;
    for (const claim of claims) if (!ids.has(claim.id) && (claim.organizationFamilyId && families.has(claim.organizationFamilyId)
      || claim.event && identities.has(claim.event.identityId)
      || claim.supersedesId && ids.has(claim.supersedesId) || claim.supersededById && ids.has(claim.supersededById))) {
      ids.add(claim.id); if (claim.event?.identityId) identities.add(claim.event.identityId);
      if (claim.organizationFamilyId) families.add(claim.organizationFamilyId); changed = true;
    }
  }
  return ids;
}
