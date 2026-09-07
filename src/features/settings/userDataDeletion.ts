import { remove } from "../../core/storage/storageAdapter";
import { storageKeys } from "../../core/storage/storageKeys";
import { messageEntryDb } from "../../core/storage/messageEntryDb";
import { offlineStoryDb } from "../../core/storage/offlineStoryDb";
import { readingAssetDb } from "../../core/storage/readingAssetDb";
import { cinemaAssetDb } from "../../core/storage/cinemaAssetDb";
import { characterPhoneDb } from "../../core/storage/characterPhoneDb";
import { audioDb } from "../../utils/audioDb";
import { cleanupOrphanedStorageResources } from "../../core/storage/storageDiagnostics";

/**
 * Formal app data is intentionally separate from rebuildable caches.  Every
 * app owns an explicit whitelist here; deleting one app never falls back to
 * localStorage.clear(), so settings and unselected apps remain untouched.
 */
export type UserDataAppId =
  | "chat"
  | "characters"
  | "worldbook"
  | "moments"
  | "diary"
  | "notes"
  | "schedule"
  | "music"
  | "reading"
  | "cinema"
  | "offline"
  | "forum"
  | "memory"
  | "relationshipNetwork"
  | "characterPhone"
  | "gallery";

export interface UserDataAppOption {
  id: UserDataAppId;
  label: string;
  description: string;
}

export const USER_DATA_APP_OPTIONS: readonly UserDataAppOption[] = [
  { id: "chat", label: "聊天", description: "聊天记录、会话状态和聊天生成数据" },
  { id: "characters", label: "档案馆", description: "角色、人设和角色关系资料" },
  { id: "worldbook", label: "世界书", description: "世界书词条和绑定信息" },
  { id: "moments", label: "朋友圈", description: "朋友圈动态、互动和生成记录" },
  { id: "diary", label: "日记", description: "日记正文、分享和草稿" },
  { id: "notes", label: "备忘录", description: "备忘录、待办和聊天引用记录" },
  { id: "schedule", label: "日程", description: "日程和提醒安排" },
  { id: "music", label: "音乐", description: "曲目、歌单、播放记录和音乐小组件状态" },
  { id: "reading", label: "阅读", description: "书籍、共读、分析和阅读资源" },
  { id: "cinema", label: "影视", description: "影视条目和本地视频资源" },
  { id: "offline", label: "线下", description: "线下剧本、设置和本地故事" },
  { id: "forum", label: "论坛", description: "帖子、回复、社区和论坛故事" },
  { id: "memory", label: "记忆书", description: "记忆库内容和记忆设置" },
  { id: "relationshipNetwork", label: "关系网", description: "关系图谱、NPC 和互动记录" },
  { id: "characterPhone", label: "角色手机", description: "所有角色手机及其独立数据" },
  { id: "gallery", label: "图片资源", description: "仅清理没有被任何应用引用的图片资源" },
];

type DataManifest = {
  keys?: readonly string[];
  prefixes?: readonly string[];
  clearBinary?: () => Promise<void>;
};

const clearOrphanedSharedAssets = async (): Promise<void> => {
  // Image/sticker binaries are shared by several apps.  Only remove records
  // proven to have no remaining reference, so deleting one app cannot break a
  // photo or sticker still used by an unselected app.
  await cleanupOrphanedStorageResources();
};

const USER_DATA_MANIFEST: Record<UserDataAppId, DataManifest> = {
  chat: {
    keys: [
      storageKeys.messages,
      storageKeys.legacyMessages,
      storageKeys.innerVoiceRecords,
      storageKeys.imageGenerationRecords,
      storageKeys.conversationSummaries,
      "phone_initiated_chat_ids",
      "phone_last_read_timestamps",
      "phone_friend_ids",
      "phone_immediate_summary_task",
      storageKeys.redPacketStatuses,
    ],
    clearBinary: async () => {
      await messageEntryDb.clearAll();
      await clearOrphanedSharedAssets();
    },
  },
  characters: {
    keys: [
      storageKeys.characters,
      storageKeys.legacyCharacters,
      storageKeys.characterRelationships,
      storageKeys.characterEvents,
      storageKeys.characterKnowledgeClaims,
      storageKeys.characterKnowledgeMigrationState,
      storageKeys.behaviorCorrections,
    ],
  },
  worldbook: {
    keys: [storageKeys.worldBookEntries],
  },
  moments: {
    keys: [
      storageKeys.moments,
      storageKeys.momentGenerationTasks,
      storageKeys.momentTopicHistory,
      storageKeys.proactiveTopicHistory,
      "phone_last_viewed_moments_time",
      "phone_moment_comment_translations",
      "phone_moment_favorites",
      "phone_moment_translations",
    ],
    clearBinary: clearOrphanedSharedAssets,
  },
  diary: {
    keys: [
      storageKeys.diaryEntries,
      storageKeys.diaryShares,
      storageKeys.diaryGenerationTasks,
      storageKeys.diaryTranslations,
      storageKeys.diaryDrafts,
    ],
  },
  notes: {
    keys: ["phone_memo_notes", "phone_memo_todos", "phone_memo_chat_mention_ledger_v1", "phone_notes"],
  },
  schedule: {
    keys: [storageKeys.scheduleStore],
  },
  music: {
    keys: [
      "phone_music_tracks",
      "phone_music_playlists",
      "phone_music_playback_history_v1",
      "phone_music_remote_library_v1",
      "phone_dual_music_widget_configs",
      "phone_identity_music_states",
      "phone_relationship_music_states",
    ],
    clearBinary: () => audioDb.clearAll(),
  },
  reading: {
    keys: [
      storageKeys.readingStore,
      storageKeys.readingCoReadingStore,
      storageKeys.readingAnalysisStore,
      storageKeys.readingStoryStore,
      storageKeys.readingCoStoryStore,
    ],
    clearBinary: () => readingAssetDb.clearAll(),
  },
  cinema: {
    keys: [storageKeys.cinemaStore],
    clearBinary: () => cinemaAssetDb.clearAll(),
  },
  offline: {
    keys: [storageKeys.offlineStories, "offline_custom_style_presets"],
    clearBinary: () => offlineStoryDb.clearAll(),
  },
  forum: {
    prefixes: ["phone_forum_"],
  },
  memory: {
    keys: [storageKeys.memoryVaultItems, storageKeys.memoryVaultSettings],
  },
  relationshipNetwork: {
    prefixes: ["phone_relationship_network_"],
  },
  characterPhone: {
    keys: [
      storageKeys.characterPhones,
      storageKeys.characterPhonesIndexV2,
      storageKeys.characterPhoneOneTimeCleanup,
    ],
    prefixes: ["phone_character_phone_v2_"],
    clearBinary: async () => {
      await characterPhoneDb.clearAll();
      await clearOrphanedSharedAssets();
    },
  },
  // Images are shared by chat, moments and generated content.  There is no
  // safe app-specific binary store to wipe here; the deletion action removes
  // only this app's local album-widget metadata.  Shared orphan cleanup is
  // deliberately left to the explicit cache-cleaning action.
  gallery: {
    prefixes: ["album_widget_photos_"],
    clearBinary: clearOrphanedSharedAssets,
  },
};

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function collectKeys(manifest: DataManifest): string[] {
  const storage = getStorage();
  if (!storage) return [];
  const keys = new Set(manifest.keys || []);
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (manifest.prefixes || []).some((prefix) => key.startsWith(prefix))) keys.add(key);
  }
  return [...keys];
}

export interface UserDataDeletionResult {
  apps: UserDataAppId[];
  removedKeys: string[];
  failedKeys: string[];
}

export async function deleteSelectedUserAppData(appIds: readonly UserDataAppId[]): Promise<UserDataDeletionResult> {
  const selected = [...new Set(appIds)].filter((id): id is UserDataAppId => Boolean(USER_DATA_MANIFEST[id]));
  const removedKeys: string[] = [];
  const failedKeys: string[] = [];
  const keys = new Set<string>();
  const clearers: Array<() => Promise<void>> = [];
  selected.forEach((id) => {
    const manifest = USER_DATA_MANIFEST[id];
    collectKeys(manifest).forEach((key) => keys.add(key));
    if (manifest.clearBinary) clearers.push(manifest.clearBinary);
  });
  keys.forEach((key) => (remove(key).success ? removedKeys.push(key) : failedKeys.push(key)));
  // Run binary clearers serially.  Several selected apps can share the same
  // orphan scan, and serializing it avoids two IndexedDB cleanup transactions
  // racing to remove the same unreferenced asset.
  for (const clear of clearers) await clear();
  return { apps: selected, removedKeys, failedKeys };
}

export interface UserDataAppUsage {
  appId: UserDataAppId;
  bytes: number;
  keys: number;
}

export function getUserDataAppUsage(): UserDataAppUsage[] {
  const storage = getStorage();
  return USER_DATA_APP_OPTIONS.map((option) => {
    const manifest = USER_DATA_MANIFEST[option.id];
    if (!storage) return { appId: option.id, bytes: 0, keys: 0 };
    return collectKeys(manifest).reduce<UserDataAppUsage>((usage, key) => {
      const value = storage.getItem(key) || "";
      return { appId: option.id, bytes: usage.bytes + (key.length + value.length) * 2, keys: usage.keys + 1 };
    }, { appId: option.id, bytes: 0, keys: 0 });
  });
}

export function getUserDataAppOption(appId: UserDataAppId): UserDataAppOption {
  return USER_DATA_APP_OPTIONS.find((option) => option.id === appId) || USER_DATA_APP_OPTIONS[0];
}
