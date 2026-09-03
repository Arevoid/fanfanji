import type { DiaryEntry, DiaryShare, Message } from "../../../types";
import { getConversationId, type CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { createDiaryId } from "../../../domain/diary/diaryData";

export const createDiaryShareMessage = (input: { entry: DiaryEntry; relation: CharacterRelationship; messageId?: string; now?: number }): { share: DiaryShare; message: Message } => {
  const { entry, relation } = input;
  if (entry.ownerIdentityId !== relation.userIdentityId) {
    throw new Error("日记与目标好友不属于同一个 user 身份");
  }
  if (!entry.body.trim()) throw new Error("空日记不能分享");

  const conversationId = relation.conversationId || getConversationId(relation.id);
  if (entry.authorType === "character" && (
    entry.relationId !== relation.id
    || entry.characterId !== relation.characterId
    || (entry.conversationId && entry.conversationId !== conversationId)
  )) {
    throw new Error("角色日记只能分享回它所属的好友关系");
  }

  const now = input.now ?? Date.now();
  const messageId = input.messageId || createDiaryId("diary-message");
  const share: DiaryShare = {
    id: createDiaryId("diary-share"),
    diaryEntryId: entry.id,
    ownerIdentityId: entry.ownerIdentityId,
    targetRelationId: relation.id,
    conversationId,
    messageId,
    snapshot: {
      authorType: entry.authorType,
      authorName: entry.authorNameSnapshot,
      ...(entry.title ? { title: entry.title } : {}),
      body: entry.body,
      ...(entry.emotionalState ? { emotionalState: entry.emotionalState } : {}),
      occurredAt: entry.occurredAt,
    },
    createdAt: now,
  };
  return {
    share,
    message: {
      id: messageId,
      characterId: relation.characterId,
      relationId: relation.id,
      conversationId,
      sender: "user",
      content: "[日记分享]",
      timestamp: now,
      diaryShareId: share.id,
    },
  };
};
