import type { Message, OfflineStory } from "../../types";
import { readingAssetDb } from "./readingAssetDb";
import { loadArraySafely } from "./storageMigrationSources";
import { loadOfflineStories, mergeOfflineStoryCollections } from "./repositories/offlineRepository";
import { offlineStoryDb } from "./offlineStoryDb";
import { messageEntryDb } from "./messageEntryDb";
import { offlineStoryEntryDb } from "./offlineStoryEntryDb";
import {
  disableMessageEntryStore,
  disableOfflineStoryEntryStore,
  enableMessageEntryStore,
  enableOfflineStoryEntryStore,
  isMessageEntryStoreEnabled,
  isOfflineStoryEntryStoreEnabled,
} from "./contentStorageFlags";
import { loadStorageMigrationState, saveStorageMigrationState, type StorageMigrationState } from "./storageMigrationState";
import { createStorageMigrationOwnerId, releaseStorageMigrationLock, tryAcquireStorageMigrationLock } from "./storageMigrationLock";
import { runStoragePreflight, type StoragePreflightResult } from "./storagePreflight";

export const CONTENT_STORAGE_MIGRATION_ID = "content-entry-storage-v1";

export interface ContentStorageMigrationReport {
  messageCount: number;
  offlineStoryCount: number;
  offlineStoryMessageCount: number;
  retainedLegacySources: string[];
}

export interface ContentStorageMigrationProgress {
  phase: "backup" | "messages" | "offlineStories" | "verifying" | "completed";
  completed: number;
  total: number;
}

export interface ContentStorageMigrationOptions {
  onProgress?: (progress: ContentStorageMigrationProgress) => void;
  preflight?: StoragePreflightResult;
}

export class ContentStorageMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentStorageMigrationError";
  }
}

async function loadLegacyMessages(): Promise<Message[]> {
  const stored = await readingAssetDb.loadMetadataValue<Message[]>("messages-v4");
  if (Array.isArray(stored)) return stored;
  return loadArraySafely<Message>("phone_messages_v3", "phone_messages");
}

async function loadLegacyOfflineStories(): Promise<OfflineStory[]> {
  const localStories = loadOfflineStories([]).value;
  let durableStories: OfflineStory[] = [];
  try {
    durableStories = await offlineStoryDb.loadAll();
  } catch {
    // A missing/blocked legacy database does not prevent the LocalStorage
    // source from being migrated; the original value remains untouched.
  }
  return mergeOfflineStoryCollections(localStories, durableStories);
}

function createMigrationState(): StorageMigrationState {
  const now = Date.now();
  return {
    id: CONTENT_STORAGE_MIGRATION_ID,
    sourceVersion: 0,
    targetVersion: 1,
    phase: "backup",
    startedAt: now,
    updatedAt: now,
    completedModules: [],
  };
}

function saveStateOrThrow(state: StorageMigrationState): void {
  const result = saveStorageMigrationState(state);
  if (!result.success) throw new ContentStorageMigrationError(`无法保存迁移状态：${result.error || "write"}`);
}

function verifyMessages(source: readonly Message[], restored: readonly Message[]): void {
  if (source.length !== restored.length || JSON.stringify(source) !== JSON.stringify(restored)) {
    throw new ContentStorageMigrationError("聊天消息校验失败：数量、顺序或关键字段不一致。");
  }
}

function verifyOfflineStories(source: readonly OfflineStory[], restored: readonly OfflineStory[]): void {
  if (source.length !== restored.length || JSON.stringify(source) !== JSON.stringify(restored)) {
    throw new ContentStorageMigrationError("线下故事校验失败：数量、消息顺序或关键字段不一致。");
  }
}

export async function migrateContentStorage(
  options: ContentStorageMigrationOptions = {},
): Promise<ContentStorageMigrationReport> {
  const onProgress = options.onProgress;
  const preflight = options.preflight || await runStoragePreflight();
  if (preflight.status === "blocked" || preflight.status === "unknown") {
    throw new ContentStorageMigrationError("迁移预检未通过：请先解决空间、数据完整性或浏览器存储能力问题。");
  }
  if (isMessageEntryStoreEnabled() && isOfflineStoryEntryStoreEnabled()) {
    const messages = await messageEntryDb.loadAll();
    const stories = await offlineStoryEntryDb.loadAll();
    return {
      messageCount: messages.length,
      offlineStoryCount: stories.length,
      offlineStoryMessageCount: stories.reduce((total, story) => total + story.messages.length, 0),
      retainedLegacySources: ["FanfanjiReadingMetadataDB/messages-v4", "FanfanjiOfflineStoryDB/stories", "phone_messages_v3", "phone_offline_stories"],
    };
  }

  const ownerId = createStorageMigrationOwnerId();
  const lock = tryAcquireStorageMigrationLock(ownerId);
  if (!lock.acquired || !lock.lock) {
    throw new ContentStorageMigrationError(lock.reason === "expired"
      ? "检测到过期迁移锁，请先人工接管后重试。"
      : "另一个页面正在执行迁移，请关闭其他页面后重试。");
  }

  const state = createMigrationState();
  try {
    const previousState = loadStorageMigrationState();
    if (previousState
      && previousState.id === CONTENT_STORAGE_MIGRATION_ID
      && (previousState.phase === "backup" || previousState.phase === "migrating" || previousState.phase === "verifying")) {
      throw new ContentStorageMigrationError(`上次迁移未完成（${previousState.phase}），请先恢复或重新确认。`);
    }
    saveStateOrThrow(state);
    onProgress?.({ phase: "backup", completed: 0, total: 2 });

    const messages = isMessageEntryStoreEnabled()
      ? await messageEntryDb.loadAll()
      : await loadLegacyMessages();
    const offlineStories = isOfflineStoryEntryStoreEnabled()
      ? await offlineStoryEntryDb.loadAll()
      : await loadLegacyOfflineStories();
    state.phase = "migrating";
    state.updatedAt = Date.now();
    saveStateOrThrow(state);

    await messageEntryDb.replaceAll(messages);
    const messageMarker = enableMessageEntryStore();
    if (!messageMarker.success) throw new ContentStorageMigrationError(`聊天迁移标记写入失败：${messageMarker.error || "write"}`);
    state.completedModules = ["messages"];
    state.currentModule = "messages";
    state.updatedAt = Date.now();
    saveStateOrThrow(state);
    onProgress?.({ phase: "messages", completed: 1, total: 2 });

    await offlineStoryEntryDb.replaceAll(offlineStories);
    const offlineMarker = enableOfflineStoryEntryStore();
    if (!offlineMarker.success) throw new ContentStorageMigrationError(`线下故事迁移标记写入失败：${offlineMarker.error || "write"}`);
    state.completedModules = ["messages", "offlineStories"];
    state.currentModule = "offlineStories";
    state.updatedAt = Date.now();
    saveStateOrThrow(state);
    onProgress?.({ phase: "offlineStories", completed: 2, total: 2 });

    state.phase = "verifying";
    state.updatedAt = Date.now();
    saveStateOrThrow(state);
    onProgress?.({ phase: "verifying", completed: 2, total: 2 });
    verifyMessages(messages, await messageEntryDb.loadAll());
    verifyOfflineStories(offlineStories, await offlineStoryEntryDb.loadAll());

    state.phase = "completed";
    state.currentModule = undefined;
    state.updatedAt = Date.now();
    saveStateOrThrow(state);
    onProgress?.({ phase: "completed", completed: 2, total: 2 });
    return {
      messageCount: messages.length,
      offlineStoryCount: offlineStories.length,
      offlineStoryMessageCount: offlineStories.reduce((total, story) => total + story.messages.length, 0),
      retainedLegacySources: ["FanfanjiReadingMetadataDB/messages-v4", "FanfanjiOfflineStoryDB/stories", "phone_messages_v3", "phone_offline_stories"],
    };
  } catch (error) {
    try {
      await messageEntryDb.clearAll();
      await offlineStoryEntryDb.clearAll();
    } catch (cleanupError) {
      console.error("[storage] Failed to clear partial content migration targets.", cleanupError);
    }
    disableMessageEntryStore();
    disableOfflineStoryEntryStore();
    state.phase = "failed";
    state.updatedAt = Date.now();
    state.error = error instanceof Error ? error.message : String(error);
    try { saveStateOrThrow(state); } catch (stateError) { console.error("[storage] Failed to save content migration failure state.", stateError); }
    throw error;
  } finally {
    releaseStorageMigrationLock(lock.lock.id, ownerId);
  }
}
