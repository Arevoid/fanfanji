import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { findRelationshipForCanonicalCharacter, getConversationId } from "../../../domain/relationship/characterRelationship";
import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { createConversationSummaryRecord } from "../../characterKnowledge/services/conversationSummaryService";
import { appendMany as appendKnowledgeClaims, retractBySourceMessageIds } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { conversationSummaryRepository, loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { readJson, writeJson } from "../../../core/storage/storageAdapter";
import { storageKeys } from "../../../core/storage/storageKeys";

export interface GroupMemorySyncMemberCursor {
  relationId: string;
  messageHashes: Record<string, string>;
}

export interface GroupMemorySyncState {
  groupId: string;
  enabled: boolean;
  members: Record<string, GroupMemorySyncMemberCursor>;
  updatedAt: number;
}

export type GroupMemorySyncStore = Record<string, GroupMemorySyncState>;

export interface GroupMemorySyncResult {
  processed: number;
  skipped: number;
  total: number;
  memberCount: number;
  changed: number;
}

const EMPTY_STORE: GroupMemorySyncStore = {};

const normalizeStore = (value: unknown): GroupMemorySyncStore => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: GroupMemorySyncStore = {};
  Object.entries(value as Record<string, unknown>).forEach(([groupId, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const candidate = raw as Record<string, unknown>;
    const members: Record<string, GroupMemorySyncMemberCursor> = {};
    if (candidate.members && typeof candidate.members === "object" && !Array.isArray(candidate.members)) {
      Object.entries(candidate.members as Record<string, unknown>).forEach(([memberKey, memberRaw]) => {
        if (!memberRaw || typeof memberRaw !== "object" || Array.isArray(memberRaw)) return;
        const member = memberRaw as Record<string, unknown>;
        const hashes: Record<string, string> = {};
        if (member.messageHashes && typeof member.messageHashes === "object" && !Array.isArray(member.messageHashes)) {
          Object.entries(member.messageHashes as Record<string, unknown>).forEach(([messageId, hash]) => {
            if (typeof hash === "string" && hash.trim()) hashes[messageId] = hash;
          });
        }
        if (typeof member.relationId === "string" && member.relationId.trim()) {
          members[memberKey] = { relationId: member.relationId.trim(), messageHashes: hashes };
        }
      });
    }
    result[groupId] = {
      groupId,
      enabled: candidate.enabled === true,
      members,
      updatedAt: typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : 0,
    };
  });
  return result;
};

export function loadGroupMemorySyncStore(): GroupMemorySyncStore {
  return normalizeStore(readJson(storageKeys.groupMemorySync, EMPTY_STORE).value);
}

export function saveGroupMemorySyncStore(store: GroupMemorySyncStore): boolean {
  return writeJson(storageKeys.groupMemorySync, store).success;
}

export function setGroupMemorySyncEnabled(groupId: string, enabled: boolean): GroupMemorySyncState {
  const store = loadGroupMemorySyncStore();
  const previous = store[groupId];
  const next: GroupMemorySyncState = {
    groupId,
    enabled,
    members: previous?.members || {},
    updatedAt: Date.now(),
  };
  store[groupId] = next;
  saveGroupMemorySyncStore(store);
  return next;
}

/** Small stable hash used only to detect edits and make replays idempotent. */
export function hashGroupMemoryMessage(message: Pick<Message, "id" | "sender" | "senderId" | "content" | "timestamp">): string {
  const input = `${message.id}\u0000${message.sender}\u0000${message.senderId || ""}\u0000${message.timestamp}\u0000${message.content}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const messageSpeaker = (message: Message, members: readonly Character[], userName: string): string => {
  if (message.sender === "user") return userName || "用户";
  const member = members.find((candidate) => candidate.id === message.senderId);
  return member?.remark || member?.name || "群成员";
};

const sourceEventId = (groupId: string, messageId: string, hash: string): string =>
  `group-memory-sync:${groupId}:${messageId}:${hash}`;

/**
 * Projects every known group message into the exact direct relation of each
 * member. The source message and group are retained in the claim provenance;
 * direct retrieval therefore remains scope-safe while still being able to
 * recall the public group event.
 */
export function syncGroupMemoryToMembers(input: {
  group: Character;
  messages: readonly Message[];
  members: readonly Character[];
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  userName: string;
}): GroupMemorySyncResult {
  const groupId = input.group.id;
  const groupConversationId = `group:${groupId}`;
  const messages = input.messages
    .filter((message) => message.characterId === groupId && !message.isOffline && message.content.trim())
    .filter((message) => !message.conversationId || message.conversationId === groupConversationId)
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
  const memberScopes = input.members.flatMap((member) => {
    const relation = findRelationshipForCanonicalCharacter(input.relationships, input.activeIdentityId, member.id, input.characters);
    if (!relation) return [];
    return [{ member, relation, conversationId: relation.conversationId || getConversationId(relation.id), key: `${member.id}:${relation.id}` }];
  });
  const store = loadGroupMemorySyncStore();
  const previous = store[groupId] || { groupId, enabled: true, members: {}, updatedAt: 0 };
  if (previous.enabled === false) {
    return { processed: 0, skipped: 0, total: messages.length, memberCount: memberScopes.length, changed: 0 };
  }
  const nextMembers: Record<string, GroupMemorySyncMemberCursor> = { ...previous.members };
  let processed = 0;
  let skipped = 0;
  let changed = 0;
  const claims: KnowledgeClaim[] = [];
  const summaries: ConversationSummaryRecord[] = [];

  memberScopes.forEach(({ member, relation, conversationId, key }) => {
    const cursor = nextMembers[key] || { relationId: relation.id, messageHashes: {} };
    const messageHashes = { ...cursor.messageHashes };
    messages.forEach((message) => {
      const hash = hashGroupMemoryMessage(message);
      const previousHash = messageHashes[message.id];
      if (previousHash === hash) {
        skipped += 1;
        return;
      }
      if (previousHash !== undefined) changed += 1;
      if (previousHash !== undefined) {
        retractBySourceMessageIds([message.id], {
          characterId: member.id,
          relationId: relation.id,
          userIdentityId: input.activeIdentityId,
          conversationId,
        });
        conversationSummaryRepository.retractBySourceMessageIds([message.id], {
          characterId: member.id,
          relationId: relation.id,
          userIdentityId: input.activeIdentityId,
          conversationId,
        });
      }
      const eventId = sourceEventId(groupId, message.id, hash);
      const statement = `群聊「${input.group.name}」中有一条公开交流记录（${message.id}）`;
      const decision = evaluateKnowledgeWrite({
        id: `group-sync-claim:${groupId}:${member.id}:${message.id}:${hash}`,
        characterId: member.id,
        relationId: relation.id,
        userIdentityId: input.activeIdentityId,
        conversationId,
        kind: "fact",
        subject: "relationship",
        statement,
        temporalStatus: "past",
        source: {
          kind: "automatic_summary",
          authorship: "system",
          messageIds: [message.id],
          eventId,
          sourceRecordId: groupId,
          producer: "group-memory-sync.v1",
          evidenceKey: eventId,
        },
        confidence: 0.65,
        importance: 3,
        occurredAt: message.timestamp,
        recordedAt: Date.now(),
      });
      if (decision.accepted === false) return;
      claims.push(decision.claim);
      const summary = createConversationSummaryRecord({
        scope: {
          characterId: member.id,
          relationId: relation.id,
          userIdentityId: input.activeIdentityId,
          conversationId,
        },
        claims: [decision.claim],
        sourceMessageIds: [message.id],
        generatedAt: Date.now(),
        generator: "group-memory-sync.v1",
        layer: "episode",
        rangeStartAt: message.timestamp,
        rangeEndAt: message.timestamp,
      });
      if (summary) {
        summary.summary = `【群聊「${input.group.name}」公开记录】${messageSpeaker(message, input.members, input.userName)}：${message.content.trim()}`;
        summaries.push(summary);
      }
      messageHashes[message.id] = hash;
      processed += 1;
    });
    nextMembers[key] = { relationId: relation.id, messageHashes };
  });

  if (claims.length > 0) appendKnowledgeClaims(claims);
  if (summaries.length > 0) conversationSummaryRepository.appendMany(summaries);
  const next: GroupMemorySyncState = { groupId, enabled: previous.enabled, members: nextMembers, updatedAt: Date.now() };
  store[groupId] = next;
  saveGroupMemorySyncStore(store);
  return { processed, skipped, total: messages.length, memberCount: memberScopes.length, changed };
}
