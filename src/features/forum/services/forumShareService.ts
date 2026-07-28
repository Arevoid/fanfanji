import type { ForumReply, ForumShare, ForumThread, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { createUserTextMessage } from "../../chat/services/messageFactory";
import { createForumShare } from "../../../domain/forum/forumShare";

export function createForumShareOperation(input: {
  shareId: string;
  messageId: string;
  ownerIdentityId: string;
  thread: ForumThread;
  replies: readonly ForumReply[];
  targetRelationship: CharacterRelationship;
  characterId: string;
  now: number;
}): { share: ForumShare; message: Message } {
  const share = createForumShare({
    id: input.shareId,
    ownerIdentityId: input.ownerIdentityId,
    thread: input.thread,
    replies: input.replies,
    targetRelationship: input.targetRelationship,
    sourceMessageId: input.messageId,
    now: input.now,
  });
  const message: Message = {
    ...createUserTextMessage({
      id: input.messageId,
      characterId: input.characterId,
      relationId: input.targetRelationship.id,
      conversationId: input.targetRelationship.conversationId,
      content: `[论坛分享] ${share.publicSnapshot.title}`,
      timestamp: input.now,
    }),
    forumShareId: share.id,
  };
  return { share, message };
}
