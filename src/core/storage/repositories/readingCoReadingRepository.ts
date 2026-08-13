import { normalizeCoReadingStore } from "../../../domain/reading/coReadingNormalization";
import {
  CO_READING_STORE_VERSION,
  createEmptyCoReadingStore,
  type AiReadingState,
  type CoReadingStore,
  type ReadingRoom,
  type ReadingRoomStatus,
} from "../../../domain/reading/coReadingTypes";
import { isSameReadingRoomScope, isValidReadingRoomScope } from "../../../domain/reading/scope";
import type { ReadingRoomScope } from "../../../domain/reading/types";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export function loadCoReadingStore(): StorageResult<CoReadingStore> {
  const loaded = readJson<unknown>(storageKeys.readingCoReadingStore, createEmptyCoReadingStore());
  return { ...loaded, value: normalizeCoReadingStore(loaded.value) };
}

export function saveCoReadingStore(store: CoReadingStore): StorageWriteResult {
  return writeJson(storageKeys.readingCoReadingStore, normalizeCoReadingStore(store));
}

export function listReadingRooms(userIdentityId: string, bookId?: string): ReadingRoom[] {
  return loadCoReadingStore().value.rooms.filter((room) => room.userIdentityId === userIdentityId && (!bookId || room.bookId === bookId));
}

export function getReadingRoom(scope: ReadingRoomScope): ReadingRoom | undefined {
  if (!isValidReadingRoomScope(scope)) return undefined;
  return loadCoReadingStore().value.rooms.find((room) => isSameReadingRoomScope(room, scope));
}

export function getAiReadingState(scope: ReadingRoomScope): AiReadingState | undefined {
  if (!isValidReadingRoomScope(scope)) return undefined;
  return loadCoReadingStore().value.aiReadingStates.find((state) => isSameReadingRoomScope(state, scope));
}

export function saveAiReadingState(state: AiReadingState): StorageWriteResult {
  if (!isValidReadingRoomScope(state)) return { success: false, error: "validation" };
  const store = loadCoReadingStore().value;
  if (!store.rooms.some((room) => isSameReadingRoomScope(room, state))) return { success: false, error: "scope" };
  const next = { ...store, aiReadingStates: [...store.aiReadingStates.filter((candidate) => !isSameReadingRoomScope(candidate, state)), state] };
  return saveCoReadingStore(next);
}

export function createReadingRoom(room: ReadingRoom, aiReadingState: AiReadingState): StorageWriteResult {
  if (!isValidReadingRoomScope(room) || room.id !== room.readingRoomId || !isValidReadingRoomScope(aiReadingState) || !isSameReadingRoomScope(room, aiReadingState)) {
    return { success: false, error: "validation" };
  }
  const store = loadCoReadingStore().value;
  if (store.rooms.some((candidate) => isSameReadingRoomScope(candidate, room))) return { success: false, error: "duplicate" };
  return saveCoReadingStore({
    version: CO_READING_STORE_VERSION,
    rooms: [...store.rooms, room],
    aiReadingStates: [...store.aiReadingStates, aiReadingState],
  });
}

export function updateReadingRoomStatus(scope: ReadingRoomScope, status: ReadingRoomStatus, now: number, decision?: ReadingRoom["invitationDecision"], replyText?: string): StorageWriteResult {
  if (!isValidReadingRoomScope(scope)) return { success: false, error: "validation" };
  const store = loadCoReadingStore().value;
  const existing = store.rooms.find((room) => isSameReadingRoomScope(room, scope));
  if (!existing) return { success: false, error: "missing" };
  const updated: ReadingRoom = { ...existing, status, updatedAt: now, invitationDecision: decision ?? existing.invitationDecision, invitationReplyText: replyText ?? existing.invitationReplyText, respondedAt: decision ? now : existing.respondedAt, endedAt: status === "ended" ? now : existing.endedAt };
  return saveCoReadingStore({ ...store, rooms: store.rooms.map((room) => isSameReadingRoomScope(room, scope) ? updated : room) });
}
