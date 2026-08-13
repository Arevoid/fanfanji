import type { Character } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import {
  createReadingRoom,
  getReadingRoom,
  listReadingRooms,
  updateReadingRoomStatus,
} from "../../../core/storage/repositories/readingCoReadingRepository";
import {
  DEFAULT_AI_READING_STATE,
  DEFAULT_READING_ROOM_SETTINGS,
  type AiReadingState,
  type ReadingInvitationDecision,
  type ReadingRoom,
} from "../../../domain/reading/coReadingTypes";
import type { ReadingBook, ReadingRoomScope } from "../../../domain/reading/types";

const id = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export class ReadingCoReadingError extends Error {
  constructor(message: string, public readonly code: "missing-book" | "invalid-relationship" | "duplicate" | "storage" = "storage") {
    super(message);
    this.name = "ReadingCoReadingError";
  }
}

export interface CreateReadingRoomInput {
  userIdentityId: string;
  book: ReadingBook;
  relationship: CharacterRelationship;
  character: Character;
  now?: number;
}

export function createAiReadingRoom(input: CreateReadingRoomInput): ReadingRoom {
  const now = input.now ?? Date.now();
  if (input.book.userIdentityId !== input.userIdentityId || input.book.status === "archived") {
    throw new ReadingCoReadingError("只能为当前身份书架中的未归档书籍建立共读。", "missing-book");
  }
  if (input.relationship.userIdentityId !== input.userIdentityId || input.relationship.characterId !== input.character.id) {
    throw new ReadingCoReadingError("共读好友关系与当前身份不匹配。", "invalid-relationship");
  }
  if (listReadingRooms(input.userIdentityId, input.book.id).some((room) => room.relationId === input.relationship.id && room.status !== "ended")) {
    throw new ReadingCoReadingError("这位好友已经有一个共读房间。", "duplicate");
  }
  const readingRoomId = id("reading-room");
  const scope: ReadingRoomScope = {
    userIdentityId: input.userIdentityId,
    bookId: input.book.id,
    readingRoomId,
    relationId: input.relationship.id,
    characterId: input.character.id,
    conversationId: input.relationship.conversationId,
  };
  const room: ReadingRoom = {
    ...scope,
    id: readingRoomId,
    status: "invited",
    characterSnapshot: { characterId: input.character.id, name: input.character.name, avatar: input.character.avatar },
    settings: { ...DEFAULT_READING_ROOM_SETTINGS },
    invitedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const aiReadingState: AiReadingState = {
    ...scope,
    aiReadingCursor: null,
    aiKnownChapterIds: [],
    aiKnownParagraphRange: {},
    ...DEFAULT_AI_READING_STATE,
    userRevealedSpoilers: [],
    updatedAt: now,
  };
  const result = createReadingRoom(room, aiReadingState);
  if (!result.success) {
    throw new ReadingCoReadingError(result.error === "duplicate" ? "这位好友已经有一个共读房间。" : "共读房间保存失败。", result.error === "duplicate" ? "duplicate" : "storage");
  }
  return room;
}

export function respondToReadingInvitation(input: {
  scope: ReadingRoomScope;
  decision: ReadingInvitationDecision;
  replyText?: string;
  now?: number;
}): ReadingRoom {
  const now = input.now ?? Date.now();
  const nextStatus = input.decision === "accept" ? "active" : input.decision === "decline" ? "declined" : "invited";
  const result = updateReadingRoomStatus(input.scope, nextStatus, now, input.decision, input.replyText);
  if (!result.success) throw new ReadingCoReadingError("共读邀请状态保存失败。", "storage");
  const room = getReadingRoom(input.scope);
  if (!room) throw new ReadingCoReadingError("共读房间不存在。", "storage");
  return room;
}

export { getReadingRoom, listReadingRooms };
