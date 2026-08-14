import { normalizeCoReadingStore } from "../../../domain/reading/coReadingNormalization";
import {
  CO_READING_STORE_VERSION,
  createEmptyCoReadingStore,
  type AiReadingState,
  type CoReadingStore,
  type ReadingRoom,
  type ReadingRoomStatus,
  type ReadingComment,
  type ReadingDiscussion,
  type ReadingDiscussionMessage,
  type ReadingRoomProgress,
} from "../../../domain/reading/coReadingTypes";
import { isSameReadingRoomScope, isValidReadingRoomScope } from "../../../domain/reading/scope";
import type { ReadingRoomScope } from "../../../domain/reading/types";
import { readingAssetDb } from "../readingAssetDb";
import { readJson, remove, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

const CO_READING_METADATA_KEY = "reading-co-reading-store";
let cachedStore: CoReadingStore | null = null;
let metadataReady = false;
let initializationPromise: Promise<StorageResult<CoReadingStore>> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function loadLegacyCoReadingStore(): StorageResult<CoReadingStore> {
  const loaded = readJson<unknown>(storageKeys.readingCoReadingStore, createEmptyCoReadingStore());
  return { ...loaded, value: normalizeCoReadingStore(loaded.value) };
}

function enqueueCoReadingWrite(store: CoReadingStore): Promise<void> {
  const snapshot = typeof structuredClone === "function" ? structuredClone(store) : JSON.parse(JSON.stringify(store)) as CoReadingStore;
  writeQueue = writeQueue.catch(() => undefined).then(() => readingAssetDb.saveMetadataValue(CO_READING_METADATA_KEY, snapshot));
  return writeQueue;
}

export async function initializeCoReadingStore(): Promise<StorageResult<CoReadingStore>> {
  if (typeof indexedDB === "undefined") return loadLegacyCoReadingStore();
  if (metadataReady && cachedStore) return { value: cachedStore, found: true, valid: true };
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    try {
      const stored = await readingAssetDb.loadMetadataValue<CoReadingStore>(CO_READING_METADATA_KEY);
      if (stored) {
        cachedStore = normalizeCoReadingStore(stored);
        metadataReady = true;
        return { value: cachedStore, found: true, valid: true };
      }
      const legacy = loadLegacyCoReadingStore();
      if (legacy.found && !legacy.valid) return legacy;
      cachedStore = legacy.value;
      metadataReady = true;
      await enqueueCoReadingWrite(cachedStore);
      if (legacy.found && legacy.valid) remove(storageKeys.readingCoReadingStore);
      return legacy;
    } catch (error) {
      console.warn("[reading] IndexedDB co-reading initialization failed; using the legacy store for this session.", error);
      metadataReady = false;
      return loadLegacyCoReadingStore();
    }
  })();
  return initializationPromise;
}

export function loadCoReadingStore(): StorageResult<CoReadingStore> {
  if (metadataReady && cachedStore) return { value: cachedStore, found: true, valid: true };
  return loadLegacyCoReadingStore();
}

export function saveCoReadingStore(store: CoReadingStore): StorageWriteResult {
  const normalized = normalizeCoReadingStore(store);
  if (typeof indexedDB === "undefined") return writeJson(storageKeys.readingCoReadingStore, normalized);
  cachedStore = normalized;
  metadataReady = true;
  enqueueCoReadingWrite(normalized).catch((error) => console.warn("[reading] Failed to persist co-reading data in IndexedDB.", error));
  return { success: true };
}

export async function flushCoReadingStore(): Promise<StorageWriteResult> {
  if (typeof indexedDB === "undefined") return { success: true };
  try {
    await writeQueue;
    remove(storageKeys.readingCoReadingStore);
    return { success: true };
  } catch (error) {
    console.warn("[reading] Co-reading IndexedDB transaction failed.", error);
    return { success: false, error: error && typeof error === "object" && String((error as { name?: unknown }).name) === "QuotaExceededError" ? "quota" : "write" };
  }
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
    comments: store.comments,
    discussions: store.discussions,
    discussionMessages: store.discussionMessages,
    roomProgress: store.roomProgress,
  });
}

export function getReadingRoomProgress(scope: ReadingRoomScope): ReadingRoomProgress | undefined {
  if (!isValidReadingRoomScope(scope)) return undefined;
  return loadCoReadingStore().value.roomProgress.find((item) => isSameReadingRoomScope(item, scope));
}

export function saveReadingRoomProgress(progress: ReadingRoomProgress): StorageWriteResult {
  if (!isValidReadingRoomScope(progress)) return { success: false, error: "validation" };
  const store = loadCoReadingStore().value;
  if (!store.rooms.some((room) => isSameReadingRoomScope(room, progress))) return { success: false, error: "scope" };
  return saveCoReadingStore({
    ...store,
    roomProgress: [...store.roomProgress.filter((item) => !isSameReadingRoomScope(item, progress)), progress],
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

export function listReadingComments(scope: ReadingRoomScope): ReadingComment[] {
  if (!isValidReadingRoomScope(scope)) return [];
  return loadCoReadingStore().value.comments.filter((comment) => isSameReadingRoomScope(comment, scope)).sort((left, right) => left.createdAt - right.createdAt);
}

export function createReadingComment(comment: ReadingComment): StorageWriteResult {
  if (!isValidReadingRoomScope(comment)) return { success: false, error: "validation" };
  const store = loadCoReadingStore().value;
  if (!store.rooms.some((room) => isSameReadingRoomScope(room, comment))) return { success: false, error: "scope" };
  if (store.comments.some((candidate) => isSameReadingRoomScope(candidate, comment) && candidate.id === comment.id)) return { success: false, error: "duplicate" };
  return saveCoReadingStore({ ...store, comments: [...store.comments, comment] });
}

export function listReadingDiscussions(scope: ReadingRoomScope): ReadingDiscussion[] {
  if (!isValidReadingRoomScope(scope)) return [];
  return loadCoReadingStore().value.discussions.filter((discussion) => isSameReadingRoomScope(discussion, scope)).sort((left, right) => right.updatedAt - left.updatedAt);
}

export function listDiscussionMessages(scope: ReadingRoomScope, discussionId: string): ReadingDiscussionMessage[] {
  if (!isValidReadingRoomScope(scope) || !discussionId) return [];
  return loadCoReadingStore().value.discussionMessages.filter((message) => isSameReadingRoomScope(message, scope) && message.discussionId === discussionId).sort((left, right) => left.createdAt - right.createdAt);
}

export function createReadingDiscussion(discussion: ReadingDiscussion, firstMessage: ReadingDiscussionMessage): StorageWriteResult {
  if (!isValidReadingRoomScope(discussion) || !isValidReadingRoomScope(firstMessage) || !isSameReadingRoomScope(discussion, firstMessage) || firstMessage.discussionId !== discussion.id) return { success: false, error: "validation" };
  const store = loadCoReadingStore().value;
  if (!store.rooms.some((room) => isSameReadingRoomScope(room, discussion))) return { success: false, error: "scope" };
  if (store.discussions.some((candidate) => isSameReadingRoomScope(candidate, discussion) && candidate.id === discussion.id)) return { success: false, error: "duplicate" };
  return saveCoReadingStore({ ...store, discussions: [...store.discussions, discussion], discussionMessages: [...store.discussionMessages, firstMessage] });
}

export function appendDiscussionMessage(message: ReadingDiscussionMessage, status?: ReadingDiscussion["status"]): StorageWriteResult {
  if (!isValidReadingRoomScope(message)) return { success: false, error: "validation" };
  const store = loadCoReadingStore().value;
  if (!store.discussions.some((discussion) => isSameReadingRoomScope(discussion, message) && discussion.id === message.discussionId)) return { success: false, error: "missing" };
  if (store.discussionMessages.some((candidate) => isSameReadingRoomScope(candidate, message) && candidate.id === message.id)) return { success: false, error: "duplicate" };
  return saveCoReadingStore({
    ...store,
    discussions: store.discussions.map((discussion) => isSameReadingRoomScope(discussion, message) && discussion.id === message.discussionId
      ? { ...discussion, status: status ?? discussion.status, updatedAt: message.createdAt }
      : discussion),
    discussionMessages: [...store.discussionMessages, message],
  });
}
