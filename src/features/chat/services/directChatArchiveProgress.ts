import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { saveRelationships } from "../../../core/storage/repositories/relationshipRepository";

export interface DirectChatArchiveProgressInput {
  relationships: readonly CharacterRelationship[];
  relationshipId: string;
  lastMessageId: string;
  now?: number;
}

export interface DirectChatArchiveProgressResult {
  success: boolean;
  relationships: CharacterRelationship[];
  error?: string;
}

/**
 * Persist the direct-chat extraction cursor before React state advances.
 * Keeping this repository boundary in the chat feature prevents UI components
 * from taking a direct dependency on storage while still returning the exact
 * snapshot that was successfully committed.
 */
export function persistDirectChatArchiveProgress(
  input: DirectChatArchiveProgressInput,
): DirectChatArchiveProgressResult {
  const updatedAt = input.now ?? Date.now();
  const relationships = input.relationships.map((relation) => relation.id === input.relationshipId
    ? { ...relation, lastImmediateSummaryMsgId: input.lastMessageId, updatedAt }
    : relation);
  if (!relationships.some((relation) => relation.id === input.relationshipId)) {
    return { success: false, relationships, error: "relationship_not_found" };
  }
  const persisted = saveRelationships(relationships);
  return persisted.success
    ? { success: true, relationships }
    : { success: false, relationships, error: persisted.error };
}
