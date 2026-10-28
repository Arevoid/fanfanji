import type { ReadingRoomScope } from "../../../domain/reading/types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { getReadingRoom, listReadingComments, listDiscussionMessages } from "../../../core/storage/repositories/readingCoReadingRepository";
import { archiveSharedMediaMemory } from "../../characterKnowledge/services/sharedMediaMemoryService";
export function archiveReadingExperience(input: { scope: ReadingRoomScope; relation: CharacterRelationship; title: string; commentId?: string; discussionId?: string; now?: number }) {
  if (input.scope.characterId !== input.relation.characterId || input.scope.relationId !== input.relation.id || input.scope.userIdentityId !== input.relation.userIdentityId
    || input.scope.conversationId !== input.relation.conversationId || !getReadingRoom(input.scope)) return { success: false, error: "scope" as const };
  const comments = input.commentId ? listReadingComments(input.scope).filter((comment) => comment.id === input.commentId || comment.parentCommentId === input.commentId) : [];
  const discussion = input.discussionId ? listDiscussionMessages(input.scope, input.discussionId) : [];
  const records = [...comments, ...discussion];
  return archiveSharedMediaMemory({ scope: { characterId: input.relation.characterId, relationId: input.relation.id, userIdentityId: input.relation.userIdentityId, conversationId: input.relation.conversationId },
    app: "reading", recordId: input.commentId || input.discussionId || "", title: input.title, now: input.now,
    messages: records.map((record) => ({ id: record.id, author: record.author === "ai" ? "character" : "user", text: record.body, occurredAt: record.createdAt })) });
}
export { confirmMemoryPersistence } from "../../../core/storage/memoryStoreTransaction";
