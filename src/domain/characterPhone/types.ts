export type CharacterPhoneAppId = "chat" | "browser" | "schedule" | "gallery" | "diary" | "moments" | "notes" | "music" | "settings";

export interface CharacterPhoneMessage {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
  unread?: boolean;
}

export interface CharacterPhoneContact {
  id: string;
  name: string;
  relation: string;
  isLongTerm: boolean;
  isNpc: boolean;
  avatar?: string;
  source?: "user" | "linked" | "generated";
  remark?: string;
  removedAt?: number;
  lastMessage?: string;
  lastMessageAt?: number;
}

export interface CharacterPhoneThreadMessage {
  id: string;
  contactId: string;
  sender: "character" | "contact";
  content: string;
  timestamp: number;
  operatedByUser?: boolean;
  sourceMessageId?: string;
  promise?: { summary: string; dueAt?: number };
  attachment?: { kind: "screenshot" | "text-image"; label: string; content: string };
}

export interface CharacterPhonePost {
  id: string;
  author: string;
  content: string;
  timestamp: number;
  likes: number;
  comments: string[];
  source: "generated" | "user" | "npc";
  authorId?: string;
  authorAvatar?: string;
  sourceMomentId?: string;
}

export interface CharacterPhoneBrowserEntry {
  id: string;
  query: string;
  title: string;
  timestamp: number;
}

export interface CharacterPhoneDiaryEntry {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  hidden?: boolean;
}

export interface CharacterPhoneNote {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export interface CharacterPhoneTodo {
  id: string;
  text: string;
  checked: boolean;
  dueAt?: number;
  source?: "generated" | "chat" | "schedule" | "user";
}

export interface CharacterPhoneScheduleItem {
  id: string;
  title: string;
  detail: string;
  timestamp: number;
}

export interface CharacterPhoneGalleryItem {
  id: string;
  title: string;
  caption: string;
  timestamp: number;
  hidden?: boolean;
  deletedAt?: number;
  source?: "generated" | "received" | "user";
  imageAssetId?: string;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  sourceId?: string;
  textImageForId?: string;
  /** Locally rendered text-image data URL; raw descriptions stay in caption. */
  dataUrl?: string;
}

export interface CharacterPhoneMusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  coverUrl?: string;
  sourceTrackId?: string;
}

export interface CharacterPhoneListeningRecord {
  id: string;
  trackId: string;
  startedAt: number;
  durationSeconds: number;
  source?: "generated" | "user-library";
}

export interface CharacterPhoneMusicPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  source?: "generated" | "user-library";
}

export type CharacterPhoneActionKind =
  | "phone_opened"
  | "app_opened"
  | "data_changed"
  | "chat_read"
  | "chat_sent_as_character"
  | "contact_remark_changed"
  | "contact_removed"
  | "gallery_viewed"
  | "gallery_deleted"
  | "gallery_restored"
  | "gallery_text_image_created"
  | "diary_read"
  | "browser_searched"
  | "schedule_changed"
  | "settings_changed";

export interface CharacterPhoneActionRecord {
  id: string;
  kind: CharacterPhoneActionKind;
  app: CharacterPhoneAppId | "phone" | "camera" | "system";
  targetId?: string;
  detail?: string;
  timestamp: number;
  actor: "user";
  detectability: "none" | "possible" | "likely";
  discovered?: boolean;
  discoveredAt?: number;
  discoveryAfterOpens?: number;
}

export interface CharacterPhoneImageSaveInput {
  characterId: string;
  imageBlob: Blob;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  title: string;
  caption?: string;
  source: "generated" | "received";
  /** Stable source ID lets refreshes replace the same album item. */
  sourceKey?: string;
}

export interface CharacterPhoneActivity {
  id: string;
  type: "unlock_failed" | "app_opened" | "user_edit";
  label: string;
  timestamp: number;
  relatedToUser?: boolean;
}

export interface CharacterPhoneRecord {
  id: string;
  ownerIdentityId: string;
  characterId: string;
  passcode: string;
  failedAttempts: number;
  lockedUntil?: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  lastGeneratedAt?: number;
  contentSeededAt?: number;
  lastSyncedMessageId?: string;
  lastSyncedMomentId?: string;
  wallpaper: string;
  /** Optional data-URL overrides for the apps shown on this character phone. */
  appIcons?: Record<string, string>;
  appOrder: CharacterPhoneAppId[];
  messages: CharacterPhoneMessage[];
  contacts: CharacterPhoneContact[];
  threadMessages: CharacterPhoneThreadMessage[];
  posts: CharacterPhonePost[];
  browserHistory: CharacterPhoneBrowserEntry[];
  diaryEntries: CharacterPhoneDiaryEntry[];
  notes?: CharacterPhoneNote[];
  todos?: CharacterPhoneTodo[];
  scheduleItems: CharacterPhoneScheduleItem[];
  galleryItems: CharacterPhoneGalleryItem[];
  musicTracks?: CharacterPhoneMusicTrack[];
  listeningHistory?: CharacterPhoneListeningRecord[];
  musicPlaylists?: CharacterPhoneMusicPlaylist[];
  actionLog?: CharacterPhoneActionRecord[];
  activities: CharacterPhoneActivity[];
  awarenessLevel?: 0 | 1 | 2;
  awarenessUpdatedAt?: number;
  phoneOpenCount?: number;
}
