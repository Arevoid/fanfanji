const EXISTING_USER_DATA_KEYS = [
  "phone_settings",
  "phone_appearance_settings",
  "phone_characters_v3",
  "phone_characters",
  "phone_messages_v3",
  "phone_messages",
  "phone_character_relationships",
  "phone_worldbook_entries",
  "phone_memory_vault_items",
  "phone_offline_stories",
  "phone_moments_v3",
  "phone_diary_entries",
  "phone_forum_threads",
  "phone_notes",
] as const;

type StorageReader = Pick<Storage, "getItem">;

const containsUserData = (raw: string | null): boolean => {
  if (raw === null || raw.trim() === "") return false;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length > 0;
    return parsed !== null && parsed !== false && parsed !== "";
  } catch {
    // A legacy/non-JSON value is still evidence that this browser has been used.
    return true;
  }
};

/** Only a genuinely untouched phone receives newly-added default desktop apps. */
export function shouldSeedScheduleForFreshInstall(storage: StorageReader): boolean {
  if (storage.getItem("phone_homescreen_items") !== null
    || storage.getItem("phone_installed_apps") !== null) return false;
  return !EXISTING_USER_DATA_KEYS.some((key) => containsUserData(storage.getItem(key)));
}
