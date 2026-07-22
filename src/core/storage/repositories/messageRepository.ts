import type { Message } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export function loadMessages(fallback: Message[]): StorageResult<Message[]> {
  const current = readArray<Message>(storageKeys.messages, fallback);
  if (current.found || !current.valid) return current;

  const legacy = readArray<Message>(storageKeys.legacyMessages, fallback);
  if (!legacy.found || !legacy.valid) return current;

  const saved = saveMessages(legacy.value);
  if (!saved.success) console.warn("[storage] Could not migrate legacy messages to v3.");
  return legacy;
}

export function saveMessages(messages: Message[]): StorageWriteResult {
  return writeArray(storageKeys.messages, messages);
}
