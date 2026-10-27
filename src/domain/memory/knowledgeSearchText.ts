import type { KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
/** Search hints remain metadata; the prompt still quotes the original statement as its evidence. */
export function knowledgeSearchText(claim: KnowledgeClaim): string {
  const hints = [claim.factIdentity?.entityLabel, claim.factIdentity?.attributeLabel, claim.event?.activity,
    claim.event?.object, claim.event?.place, claim.event?.timeWindow, ...(claim.event?.participants || [])].filter(Boolean);
  return hints.length ? `${claim.statement}\n[检索标注] ${hints.join(" · ")}` : claim.statement;
}
