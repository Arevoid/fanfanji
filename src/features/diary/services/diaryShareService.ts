import type { DiaryEntry, DiaryShare, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { createDiaryId } from "../../../domain/diary/diaryData";

export const createDiaryShareMessage = (input: { entry: DiaryEntry; relation: CharacterRelationship; messageId?: string; now?: number }): { share: DiaryShare; message: Message } => {
  const now = input.now ?? Date.now(); const messageId = input.messageId || createDiaryId("diary-message");
  const share: DiaryShare = { id: createDiaryId("diary-share"), diaryEntryId: input.entry.id, ownerIdentityId: input.entry.ownerIdentityId, targetRelationId: input.relation.id, conversationId: input.relation.conversationId, messageId, snapshot: { authorType: input.entry.authorType, authorName: input.entry.authorNameSnapshot, ...(input.entry.title ? { title: input.entry.title } : {}), body: input.entry.body, ...(input.entry.emotionalState ? { emotionalState: input.entry.emotionalState } : {}), occurredAt: input.entry.occurredAt }, createdAt: now };
  return { share, message: { id: messageId, characterId: input.relation.characterId, relationId: input.relation.id, conversationId: input.relation.conversationId, sender: "user", content: "[日记分享]", timestamp: now, diaryShareId: share.id } };
};
