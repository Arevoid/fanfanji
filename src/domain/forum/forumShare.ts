import type {
  Character,
  ForumReply,
  ForumShare,
  ForumThread,
  ForumThreadPublicSnapshot,
} from "../../types";
import type { CharacterRelationship } from "../relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../character/characterIdentity";

export interface ForumShareTarget {
  relationship: CharacterRelationship;
  character: Character;
}

export const listForumShareTargets = (
  relationships: readonly CharacterRelationship[],
  characters: readonly Character[],
  ownerIdentityId: string,
): ForumShareTarget[] => relationships
  .filter((relationship) => relationship.userIdentityId === ownerIdentityId)
  .map((relationship) => ({
    relationship,
    character: characters.find((character) =>
      character.id === resolveCanonicalCharacterId(relationship.characterId, characters)),
  }))
  .filter((item): item is ForumShareTarget =>
    Boolean(item.character && !item.character.isGroupChat && !item.character.isContactInstance));

export const buildForumThreadPublicSnapshot = (
  thread: ForumThread,
  replies: readonly ForumReply[],
): ForumThreadPublicSnapshot => ({
  threadId: thread.id,
  title: thread.title,
  body: thread.body,
  publicAuthor: {
    displayName: thread.publicAuthor.displayName,
    ...(thread.publicAuthor.avatar ? { avatar: thread.publicAuthor.avatar } : {}),
    kind: thread.publicAuthor.kind,
    isAnonymous: thread.publicAuthor.isAnonymous,
  },
  occurredAt: thread.occurredAt,
  replyCount: thread.replyCount,
  replies: replies
    .filter((reply) => reply.threadId === thread.id && reply.ownerIdentityId === thread.ownerIdentityId)
    .sort((left, right) => left.floor - right.floor)
    .map((reply) => ({
      id: reply.id,
      floor: reply.floor,
      ...(reply.kind ? { kind: reply.kind } : {}),
      body: reply.isDeleted ? "该回复已删除" : reply.body,
      publicAuthor: {
        displayName: reply.isDeleted ? "已删除用户" : reply.publicAuthor.displayName,
        ...(!reply.isDeleted && reply.publicAuthor.avatar ? { avatar: reply.publicAuthor.avatar } : {}),
        kind: reply.publicAuthor.kind,
        isAnonymous: reply.publicAuthor.isAnonymous,
      },
      ...(reply.replyToFloor !== undefined ? { replyToFloor: reply.replyToFloor } : {}),
      ...(reply.replyToAuthorName ? { replyToAuthorName: reply.replyToAuthorName } : {}),
      ...(reply.quotedText ? { quotedText: reply.quotedText } : {}),
      occurredAt: reply.occurredAt,
    })),
});

export const createForumShare = (input: {
  id: string;
  ownerIdentityId: string;
  thread: ForumThread;
  replies: readonly ForumReply[];
  targetRelationship: CharacterRelationship;
  sourceMessageId: string;
  now: number;
}): ForumShare => ({
  id: input.id,
  ownerIdentityId: input.ownerIdentityId,
  threadId: input.thread.id,
  targetRelationId: input.targetRelationship.id,
  conversationId: input.targetRelationship.conversationId,
  sourceMessageId: input.sourceMessageId,
  publicSnapshot: buildForumThreadPublicSnapshot(input.thread, input.replies),
  createdAt: input.now,
});

export const appendForumShareOnce = (
  shares: readonly ForumShare[],
  share: ForumShare,
): ForumShare[] => shares.some((item) =>
  item.id === share.id || item.sourceMessageId === share.sourceMessageId)
  ? [...shares]
  : [...shares, share];

export const removeForumSharesByRelation = (
  shares: readonly ForumShare[],
  relationId: string,
): ForumShare[] => shares.filter((share) => share.targetRelationId !== relationId);

export const clearForumSharesByIdentity = (
  shares: readonly ForumShare[],
  ownerIdentityId: string,
): ForumShare[] => shares.filter((share) => share.ownerIdentityId !== ownerIdentityId);

export const cleanupForumDataForDeletedCharacter = (input: {
  shares: readonly ForumShare[];
  threads: readonly ForumThread[];
  relationIds: readonly string[];
  characterIds: readonly string[];
  now?: number;
}): { shares: ForumShare[]; threads: ForumThread[] } => {
  const removedRelations = new Set(input.relationIds);
  const removedCharacters = new Set(input.characterIds);
  return {
    shares: input.shares.filter((share) => !removedRelations.has(share.targetRelationId)),
    threads: input.threads.map((thread) =>
      (thread.privateAuthorRelationId && removedRelations.has(thread.privateAuthorRelationId))
      || (thread.privateAuthorCharacterId && removedCharacters.has(thread.privateAuthorCharacterId))
        ? {
            ...thread,
            privateAuthorRelationId: undefined,
            privateAuthorCharacterId: undefined,
            updatedAt: input.now ?? Date.now(),
          }
        : thread),
  };
};

export const unlinkForumPrivateAuthorByRelation = (
  threads: readonly ForumThread[],
  relationId: string,
  now = Date.now(),
): ForumThread[] => threads.map((thread) =>
  thread.privateAuthorRelationId === relationId
    ? {
        ...thread,
        privateAuthorRelationId: undefined,
        privateAuthorCharacterId: undefined,
        updatedAt: now,
      }
    : thread);
