import type { Character, MemoryItem } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";

export function buildOfflineMemberKnowledgeSnapshots(input: {
  memberIds: readonly string[];
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  memories: readonly MemoryItem[];
  claims: readonly KnowledgeClaim[];
}): Record<string, string[]> {
  return Object.fromEntries(input.memberIds.flatMap((memberId) => {
    const relationship = findRelationshipForCanonicalCharacter(
      input.relationships,
      input.activeIdentityId,
      memberId,
      input.characters,
    );
    if (!relationship) return [];
    const snapshot = Array.from(new Set([
      ...(relationship.compressedMemory?.trim() ? [relationship.compressedMemory.trim()] : []),
      ...input.claims
        .filter((claim) => claim.relationId === relationship.id
          && claim.userIdentityId === relationship.userIdentityId
          && claim.status === "active"
          && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted"))
        .map((claim) => claim.statement),
      ...input.memories
        .filter((memory) => memory.characterId === memberId && memory.relationId === relationship.id)
        .map((memory) => memory.content),
    ]));
    return snapshot.length > 0 ? [[memberId, snapshot] as const] : [];
  }));
}
