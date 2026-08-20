import type { Message } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readingAssetDb } from "../readingAssetDb";
import { remove } from "../storageAdapter";
import { createLatestSnapshotWriter } from "../latestSnapshotWriter";
import { isMessageEntryStoreEnabled } from "../contentStorageFlags";
import { messageEntryDb, type MessageEntryQuery } from "../messageEntryDb";

const MESSAGE_METADATA_KEY = "messages-v4";
let cachedMessages: Message[] | null = null;
let metadataReady = false;
let initializationPromise: Promise<StorageResult<Message[]>> | null = null;
let mutationVersion = 0;

const cloneMessages = (messages: Message[]): Message[] => typeof structuredClone === "function"
  ? structuredClone(messages)
  : JSON.parse(JSON.stringify(messages)) as Message[];

const messageWriter = createLatestSnapshotWriter(
  cloneMessages,
  (snapshot) => readingAssetDb.saveMetadataValue(MESSAGE_METADATA_KEY, snapshot),
);
const messageEntryWriter = createLatestSnapshotWriter(
  cloneMessages,
  (snapshot) => messageEntryDb.saveSnapshot(snapshot),
);

export function loadMessages(fallback: Message[]): StorageResult<Message[]> {
  if (isMessageEntryStoreEnabled() && typeof indexedDB !== "undefined") {
    if (metadataReady && cachedMessages) return { value: cloneMessages(cachedMessages), found: true, valid: true };
    // The entry store is asynchronous. Return the caller's fallback without
    // reading the legacy snapshot; initializeMessages performs the single
    // authoritative read for this session.
    return { value: fallback, found: false, valid: true };
  }
  if (metadataReady && cachedMessages) return { value: cloneMessages(cachedMessages), found: true, valid: true };
  const current = readArray<Message>(storageKeys.messages, fallback);
  if (current.found || !current.valid) return current;

  const legacy = readArray<Message>(storageKeys.legacyMessages, fallback);
  if (!legacy.found || !legacy.valid) return current;

  const saved = saveMessages(legacy.value);
  if (!saved.success) console.warn("[storage] Could not migrate legacy messages to v3.");
  return legacy;
}

export function saveMessages(messages: Message[]): StorageWriteResult {
  if (typeof indexedDB !== "undefined") {
    mutationVersion += 1;
    cachedMessages = cloneMessages(messages);
    metadataReady = true;
    const writer = isMessageEntryStoreEnabled() ? messageEntryWriter : messageWriter;
    writer.enqueue(cachedMessages).catch((error) => console.warn("[storage] Failed to persist messages in IndexedDB.", error));
    return { success: true };
  }
  return writeArray(storageKeys.messages, messages);
}

export async function initializeMessages(fallback: Message[]): Promise<StorageResult<Message[]>> {
  if (typeof indexedDB === "undefined") return loadMessages(fallback);
  if (metadataReady && cachedMessages) return { value: cloneMessages(cachedMessages), found: true, valid: true };
  if (initializationPromise) return initializationPromise;
  const initializationMutationVersion = mutationVersion;
  initializationPromise = (async () => {
    try {
      if (isMessageEntryStoreEnabled()) {
        const stored = await messageEntryDb.loadAll();
        if (mutationVersion !== initializationMutationVersion && cachedMessages) {
          return { value: cloneMessages(cachedMessages), found: true, valid: true };
        }
        cachedMessages = cloneMessages(stored);
        metadataReady = true;
        return { value: cloneMessages(stored), found: true, valid: true };
      }
      const stored = await readingAssetDb.loadMetadataValue<Message[]>(MESSAGE_METADATA_KEY);
      if (mutationVersion !== initializationMutationVersion && cachedMessages) {
        return { value: cloneMessages(cachedMessages), found: true, valid: true };
      }
      if (Array.isArray(stored)) {
        cachedMessages = cloneMessages(stored);
        metadataReady = true;
        remove(storageKeys.messages);
        remove(storageKeys.legacyMessages);
        return { value: cloneMessages(stored), found: true, valid: true };
      }
      const legacy = readArray<Message>(storageKeys.messages, fallback);
      const source = legacy.found && legacy.valid
        ? legacy
        : readArray<Message>(storageKeys.legacyMessages, fallback);
      cachedMessages = cloneMessages(source.value);
      metadataReady = true;
      await messageWriter.enqueue(cachedMessages);
      if (source.found && source.valid) {
        remove(storageKeys.messages);
        remove(storageKeys.legacyMessages);
      }
      return { value: cloneMessages(source.value), found: source.found, valid: source.valid };
    } catch (error) {
      console.warn("[storage] Message IndexedDB initialization failed; using localStorage for this session.", error);
      metadataReady = false;
      return loadMessages(fallback);
    }
  })();
  return initializationPromise;
}

export async function loadMessageWindow(query: MessageEntryQuery): Promise<Message[]> {
  if (isMessageEntryStoreEnabled() && typeof indexedDB !== "undefined") {
    try {
      return await messageEntryDb.loadWindow(query);
    } catch (error) {
      console.warn("[storage] Message window query failed; using the in-memory snapshot.", error);
    }
  }
  const source = cachedMessages || loadMessages([]).value;
  const filtered = source.filter((message) => (!query.characterId || message.characterId === query.characterId)
    && (!query.relationId || message.relationId === query.relationId)
    && (!query.conversationId || message.conversationId === query.conversationId));
  return filtered.slice(Math.max(0, query.offset || 0), Math.max(0, query.offset || 0) + Math.max(0, query.limit));
}

export async function flushMessages(): Promise<StorageWriteResult> {
  if (typeof indexedDB === "undefined") return { success: true };
  try {
    await (isMessageEntryStoreEnabled() ? messageEntryWriter : messageWriter).flush();
    if (isMessageEntryStoreEnabled()) return { success: true };
    remove(storageKeys.messages);
    remove(storageKeys.legacyMessages);
    return { success: true };
  } catch (error) {
    const name = error && typeof error === "object" ? String((error as { name?: unknown }).name || "") : "";
    return { success: false, error: name === "QuotaExceededError" ? "quota" : "write" };
  }
}
