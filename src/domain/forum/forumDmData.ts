import type { Character, ForumActorRef, ForumDmConversation, ForumDmMessage, ForumDmTask, ForumPublicAuthor, ForumReply, ForumThread } from "../../types";
import type { CharacterRelationship } from "../relationship/characterRelationship";
import { FORUM_VIRTUAL_PROFILES } from "./forumVirtualProfiles";

export const FORUM_DM_MAX_MESSAGES = 500;
export const FORUM_DM_MAX_CONVERSATIONS = 100;
export const forumDmActorKey = (actor: ForumActorRef): string => actor.kind === "relationship" ? `relation:${actor.relationId}` : `virtual:${actor.virtualProfileId}`;
export const forumDmConversationKey = (ownerIdentityId: string, actor: ForumActorRef): string => `${ownerIdentityId}:${forumDmActorKey(actor)}`;

const id = (prefix: string) => `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

/** Resolves only a public, non-anonymous forum record to an actor; UI never supplies actor IDs. */
export const resolveForumDmActorFromPublicRecord = (input: { ownerIdentityId: string; thread?: ForumThread; reply?: ForumReply; relationships: readonly CharacterRelationship[]; characters: readonly Character[] }): { actor: ForumActorRef; publicAuthor: ForumPublicAuthor } | undefined => {
  const record = input.reply || input.thread;
  if (!record || record.ownerIdentityId !== input.ownerIdentityId || record.publicAuthor.isAnonymous || record.publicAuthor.kind === "user" || record.publicAuthor.kind === "anonymous-user") return undefined;
  if (record.source === "ai-virtual" || record.source === "virtual") {
    const profile = FORUM_VIRTUAL_PROFILES.find((item) => item.displayName === record.publicAuthor.displayName);
    return profile ? { actor: { kind: "virtual", virtualProfileId: profile.id }, publicAuthor: record.publicAuthor } : undefined;
  }
  // Real-name AI records are only DM-able if their own stored public record has a valid relation mapping.
  const replyActor = input.reply?.privateActor?.kind === "relationship" ? input.reply.privateActor : undefined;
  const relationId = input.thread?.privateAuthorRelationId || replyActor?.relationId;
  const characterId = input.thread?.privateAuthorCharacterId || replyActor?.characterId;
  const relationship = relationId && input.relationships.find((item) => item.id === relationId && item.userIdentityId === input.ownerIdentityId && item.characterId === characterId);
  const character = relationship && input.characters.find((item) => item.id === relationship.characterId && !item.isGroupChat);
  return relationship && character ? { actor: { kind: "relationship", relationId: relationship.id, characterId: relationship.characterId }, publicAuthor: record.publicAuthor } : undefined;
};

export const openForumDmConversation = (input: { ownerIdentityId: string; conversations: readonly ForumDmConversation[]; actor: ForumActorRef; publicAuthor: ForumPublicAuthor; originThreadId?: string; originReplyId?: string; now?: number }): { conversation: ForumDmConversation; conversations: ForumDmConversation[] } => {
  const now = input.now || Date.now(); const key = forumDmConversationKey(input.ownerIdentityId, input.actor);
  const existing = input.conversations.find((item) => forumDmConversationKey(item.ownerIdentityId, item.participant) === key);
  const conversation: ForumDmConversation = existing ? { ...existing, participantPublicSnapshot: input.publicAuthor, updatedAt: now } : { id: id("forum-dm"), ownerIdentityId: input.ownerIdentityId, participant: input.actor, participantPublicSnapshot: input.publicAuthor, ...(input.originThreadId ? { originThreadId: input.originThreadId } : {}), ...(input.originReplyId ? { originReplyId: input.originReplyId } : {}), lastMessageAt: now, unreadCount: 0, createdAt: now, updatedAt: now };
  return { conversation, conversations: [conversation, ...input.conversations.filter((item) => item.id !== conversation.id)].sort((a, b) => b.lastMessageAt - a.lastMessageAt).slice(0, FORUM_DM_MAX_CONVERSATIONS) };
};

export const appendForumDmMessage = (input: { messages: readonly ForumDmMessage[]; conversations: readonly ForumDmConversation[]; conversationId: string; ownerIdentityId: string; sender: "user" | "participant"; body: string; activeConversationId?: string | null; now?: number }): { messages: ForumDmMessage[]; conversations: ForumDmConversation[]; message: ForumDmMessage } => {
  const now = input.now || Date.now(); const message: ForumDmMessage = { id: id("forum-dm-message"), conversationId: input.conversationId, ownerIdentityId: input.ownerIdentityId, sender: input.sender, body: input.body.trim(), occurredAt: now, createdAt: now };
  const conversations = input.conversations.map((item) => item.id !== input.conversationId ? item : { ...item, lastMessageAt: now, unreadCount: input.sender === "participant" && input.activeConversationId !== item.id ? item.unreadCount + 1 : input.sender === "user" ? 0 : item.unreadCount, updatedAt: now });
  return { message, messages: [...input.messages.filter((item) => item.conversationId !== input.conversationId), ...input.messages.filter((item) => item.conversationId === input.conversationId).slice(-(FORUM_DM_MAX_MESSAGES - 1)), message].sort((a, b) => a.occurredAt - b.occurredAt), conversations };
};

export const markForumDmRead = (conversations: readonly ForumDmConversation[], conversationId: string, now = Date.now()) => conversations.map((item) => item.id === conversationId ? { ...item, unreadCount: 0, updatedAt: now } : item);
export const removeForumDmConversationsByRelation = (conversations: readonly ForumDmConversation[], messages: readonly ForumDmMessage[], tasks: readonly ForumDmTask[], relationId: string) => { const ids = new Set(conversations.filter((item) => item.participant.kind === "relationship" && item.participant.relationId === relationId).map((item) => item.id)); return { conversations: conversations.filter((item) => !ids.has(item.id)), messages: messages.filter((item) => !ids.has(item.conversationId)), tasks: tasks.filter((item) => !ids.has(item.conversationId)) }; };
