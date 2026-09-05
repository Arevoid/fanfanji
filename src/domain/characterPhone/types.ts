import type { MomentVisibility } from "../../types";

export type CharacterPhoneAppId = "chat" | "browser" | "schedule" | "gallery" | "diary" | "moments" | "notes" | "music" | "settings";
export type CharacterPhoneLifeArtifactAppId = CharacterPhoneAppId | "phone" | "camera";

export type CharacterPhoneSourceRef = { kind: "character" | "worldbook" | "chat" | "moment" | "phone" | "relationship-network"; id: string };

export interface CharacterPhoneLifeEvent {
  id: string;
  summary: string;
  startedAt: number;
  generatedAt: number;
  sourceRefs: CharacterPhoneSourceRef[];
  artifactRefs: Array<{ app: CharacterPhoneLifeArtifactAppId; id: string }>;
}

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
  kind?: "user" | "character" | "npc" | "group";
  isLongTerm: boolean;
  isNpc: boolean;
  avatar?: string;
  source?: "user" | "linked" | "generated";
  linkedCharacterId?: string;
  /** Stable lightweight NPC source when this contact comes from a relationship-network edge. */
  relationshipNetworkNpcId?: string;
  memberNames?: string[];
  sourceRefs?: CharacterPhoneSourceRef[];
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
  sourceRefs?: CharacterPhoneSourceRef[];
  lifeEventId?: string;
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
  /** Structured comment metadata used to render authors and preserve visibility. */
  commentDetails?: CharacterPhonePostComment[];
  source: "generated" | "user" | "npc";
  authorId?: string;
  authorAvatar?: string;
  sourceMomentId?: string;
  lifeEventId?: string;
  /** Audience selected when the role posts from their simulated phone. */
  visibility?: MomentVisibility;
  /** Character/identity ids selected for a specific audience. */
  visibilityTargetIds?: string[];
}

export interface CharacterPhonePostComment {
  id: string;
  authorName: string;
  content: string;
  timestamp: number;
  authorId?: string;
  authorAvatar?: string;
  relationId?: string;
}

export interface CharacterPhoneBrowserResult {
  /** AI-generated source/platform label shown in the search result card. */
  platform: string;
  title: string;
  snippet: string;
}

export interface CharacterPhoneBrowserEntry {
  id: string;
  query: string;
  title: string;
  timestamp: number;
  lifeEventId?: string;
  /** Optional cached detail; legacy history derives it from query/title at render time. */
  summary?: string;
  reflection?: string;
  /** AI-generated 2–3 platform result cards for the browser detail view. */
  results?: CharacterPhoneBrowserResult[];
  /** Legacy compatibility fields; the detail UI does not expose external links. */
  sourceUrl?: string;
  sourceLabel?: string;
}

export interface CharacterPhoneDiaryEntry {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  hidden?: boolean;
  lifeEventId?: string;
}

export interface CharacterPhoneNote {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  lifeEventId?: string;
}

export interface CharacterPhoneTodo {
  id: string;
  text: string;
  checked: boolean;
  dueAt?: number;
  source?: "generated" | "chat" | "schedule" | "user";
  lifeEventId?: string;
}

export interface CharacterPhoneScheduleItem {
  id: string;
  title: string;
  detail: string;
  timestamp: number;
  lifeEventId?: string;
}

export interface CharacterPhoneCallRecord {
  id: string;
  contactId?: string;
  contactName: string;
  number?: string;
  direction: "incoming" | "outgoing" | "missed";
  timestamp: number;
  durationSeconds?: number;
  lifeEventId?: string;
}

export interface CharacterPhoneGalleryItem {
  id: string;
  title: string;
  caption: string;
  timestamp: number;
  hidden?: boolean;
  deletedAt?: number;
  source?: "generated" | "received" | "camera" | "user";
  imageAssetId?: string;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  sourceId?: string;
  textImageForId?: string;
  /** Locally rendered text-image data URL; raw descriptions stay in caption. */
  dataUrl?: string;
  lifeEventId?: string;
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
  /** Minimum elapsed time before the character can notice this operation. */
  discoveryAfterMs?: number;
  discoveryAfterOpens?: number;
  /** Whether the character confronts the user or keeps the observation private. */
  discoveryResponse?: "ask" | "silent";
  phoneOpenCountAtAction?: number;
}

export interface CharacterPhoneImageSaveInput {
  ownerIdentityId: string;
  characterId: string;
  imageBlob: Blob;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  title: string;
  caption?: string;
  source: "generated" | "received" | "camera";
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
  /** Optional per-character override for the hidden album gate. Falls back to the temporary test code when absent. */
  hiddenGalleryPasscode?: string;
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
  phoneCalls?: CharacterPhoneCallRecord[];
  galleryItems: CharacterPhoneGalleryItem[];
  musicTracks?: CharacterPhoneMusicTrack[];
  listeningHistory?: CharacterPhoneListeningRecord[];
  musicPlaylists?: CharacterPhoneMusicPlaylist[];
  actionLog?: CharacterPhoneActionRecord[];
  lifeEvents?: CharacterPhoneLifeEvent[];
  activities: CharacterPhoneActivity[];
  awarenessLevel?: 0 | 1 | 2;
  awarenessUpdatedAt?: number;
  phoneOpenCount?: number;
}
