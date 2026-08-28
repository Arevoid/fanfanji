export type CharacterPhoneAppId = "chat" | "browser" | "schedule" | "gallery" | "diary" | "moments";

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
}

export interface CharacterPhoneThreadMessage {
  id: string;
  contactId: string;
  sender: "character" | "contact";
  content: string;
  timestamp: number;
  operatedByUser?: boolean;
  attachment?: { kind: "screenshot" | "text-image"; label: string; content: string };
}

export interface CharacterPhonePost {
  id: string;
  author: string;
  content: string;
  timestamp: number;
  likes: number;
  comments: string[];
  source: "generated" | "user";
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
  wallpaper: string;
  appOrder: CharacterPhoneAppId[];
  messages: CharacterPhoneMessage[];
  contacts: CharacterPhoneContact[];
  threadMessages: CharacterPhoneThreadMessage[];
  posts: CharacterPhonePost[];
  browserHistory: CharacterPhoneBrowserEntry[];
  diaryEntries: CharacterPhoneDiaryEntry[];
  scheduleItems: CharacterPhoneScheduleItem[];
  galleryItems: CharacterPhoneGalleryItem[];
  activities: CharacterPhoneActivity[];
  awarenessLevel?: 0 | 1 | 2;
  awarenessUpdatedAt?: number;
}
