import type { Character } from "../../types";

export type SmsTimelineMode = "unanchored" | "anchored";
export type SmsTimelineKind = "independent_future" | "continuation_future" | "past" | "present" | "custom";
export type SmsAnchorChoice = "convert_current" | "keep_exploration";

export interface SmsUserPhone {
  identityId: string;
  phoneNumber: string;
  updatedAt: number;
}

export interface SmsTimeline {
  id: string;
  characterId: string;
  ownerIdentityId: string;
  phoneNumber: string;
  label: string;
  kind: SmsTimelineKind;
  mode: SmsTimelineMode;
  /** Fictional time, deliberately separate from storage/receipt time. */
  timelineTime?: string;
  relationshipHint?: string;
  /** When true, only this timeline's earlier SMS messages are carried forward. */
  knowsCurrentTimeline: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SmsMessage {
  id: string;
  timelineId: string;
  characterId: string;
  ownerIdentityId: string;
  phoneNumber: string;
  sender: "user" | "character" | "system";
  content: string;
  /** Real device receipt/send time. */
  receivedAt: number;
  /** When the user opened the conversation after receiving this message. */
  readAt?: number;
  /** Optional fictional time shown by the role's timeline. */
  timelineTime?: string;
}

export interface SmsTimelineMemory {
  timelineId: string;
  characterId: string;
  ownerIdentityId: string;
  phoneNumber: string;
  notes: string[];
  relationshipSummary?: string;
  updatedAt: number;
}

export interface SmsStore {
  version: 1;
  phones: SmsUserPhone[];
  timelines: SmsTimeline[];
  messages: SmsMessage[];
  memories: SmsTimelineMemory[];
}

export interface SmsConversationPreview {
  character: Character;
  timeline?: SmsTimeline;
  latestMessage?: SmsMessage;
  unreadCount: number;
  /** Real activity time used by the inbox sorter. Empty conversations use 0. */
  lastActivityAt: number;
}

export const SMS_DEFAULT_PHONE = "1380000000000";
export const SMS_STORE_VERSION = 1 as const;

export const isSmsPhoneNumber = (value: string): boolean => /^\d{13}$/.test(value);

export const smsScopeKey = (ownerIdentityId: string, phoneNumber: string, characterId: string, timelineId: string): string =>
  [ownerIdentityId, phoneNumber, characterId, timelineId].join("\u0000");

export const smsContactScopeKey = (ownerIdentityId: string, phoneNumber: string, characterId: string): string =>
  [ownerIdentityId, phoneNumber, characterId].join("\u0000");
