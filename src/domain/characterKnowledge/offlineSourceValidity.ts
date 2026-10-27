import type { KnowledgeClaim } from "./characterKnowledgeTypes";
import type { OfflineStory } from "../../types";
import { sourceRevision } from "./knowledgeEvolution";

/** Read-time source leases also cover existing installations, before a resync.
 * Independent evidence groups survive; one edited member invalidates its group.
 * Missing legacy revisions are not invented or silently upgraded to evidence. */
export function reconcileOfflineSources(claims: readonly KnowledgeClaim[], stories: readonly OfflineStory[]): KnowledgeClaim[] {
  const projected = claims.map(claim => {
    if (claim.status !== "active" || !claim.source.storyId || !claim.source.messageIds?.length) return claim;
    const story = stories.find(story => story.id === claim.source.storyId
      && story.ownerIdentityId === claim.userIdentityId
      && (story.relationId ? story.relationId === claim.relationId && story.conversationId === claim.conversationId
        : (story.characterIds || [story.characterId]).includes(claim.characterId)));
    if (!story) return claim; // Absent legacy source is handled by its compatibility policy.
    const groups = (claim.source.evidenceGroups || [claim.source.messageIds]).filter(group => group.length && group.every(id => {
      const message = story.messages.find(message => message.id === id && !message.recalledAt && !message.isImportedContext);
      return message && (claim.source.messageRevisions?.[id]
        ? claim.source.messageRevisions[id] === sourceRevision(message.content)
        : Boolean(claim.source.evidenceQuote && message.content.includes(claim.source.evidenceQuote)));
    }));
    if (!groups.length) return { ...claim, status: "retracted" as const, truthStatus: "retracted" as const, retractionReason: "offline_source_changed" };
    return { ...claim, source: { ...claim.source, evidenceGroups: groups, messageIds: [...new Set(groups.flat())] } };
  });
  // Derived interpretations cannot outlive their last valid supporting source.
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < projected.length; i++) {
      const claim = projected[i];
      if (claim.status !== "active" || !claim.source.supportingClaimIds?.some(id => projected.some(source => source.id === id
        && source.characterId === claim.characterId && source.relationId === claim.relationId
        && source.userIdentityId === claim.userIdentityId && source.conversationId === claim.conversationId
        && source.retractionReason === "offline_source_changed"))) continue;
      projected[i] = { ...claim, status: "retracted", truthStatus: "retracted", retractionReason: "offline_source_changed" };
      changed = true;
    }
  }
  return projected;
}
