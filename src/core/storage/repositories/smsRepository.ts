import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import {
  SMS_DEFAULT_PHONE,
  SMS_STORE_VERSION,
  isSmsPhoneNumber,
  type SmsMessage,
  type SmsStore,
  type SmsTimeline,
  type SmsTimelineMemory,
  type SmsUserPhone,
} from "../../../domain/sms/smsTypes";

export const SMS_STORE_KEY = storageKeys.smsStore;

const emptyStore = (): SmsStore => ({ version: SMS_STORE_VERSION, phones: [], timelines: [], messages: [], memories: [] });

const text = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const time = (value: unknown, fallback = Date.now()): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizePhone = (value: unknown): SmsUserPhone | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SmsUserPhone>;
  const phoneNumber = text(item.phoneNumber);
  const identityId = text(item.identityId);
  return identityId && isSmsPhoneNumber(phoneNumber)
    ? { identityId, phoneNumber, updatedAt: time(item.updatedAt) }
    : null;
};

const normalizeTimeline = (value: unknown): SmsTimeline | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SmsTimeline>;
  const id = text(item.id);
  const characterId = text(item.characterId);
  const ownerIdentityId = text(item.ownerIdentityId);
  const phoneNumber = text(item.phoneNumber);
  const mode = item.mode === "anchored" ? "anchored" : "unanchored";
  const kind = item.kind === "independent_future" || item.kind === "continuation_future" || item.kind === "past" || item.kind === "present" || item.kind === "custom"
    ? item.kind
    : "custom";
  return id && characterId && ownerIdentityId && isSmsPhoneNumber(phoneNumber)
    ? {
      id,
      characterId,
      ownerIdentityId,
      phoneNumber,
      label: text(item.label, "未锚定探索"),
      kind,
      mode,
      timelineTime: text(item.timelineTime) || undefined,
      relationshipHint: text(item.relationshipHint) || undefined,
      knowsCurrentTimeline: Boolean(item.knowsCurrentTimeline),
      createdAt: time(item.createdAt),
      updatedAt: time(item.updatedAt),
    }
    : null;
};

const normalizeMessage = (value: unknown): SmsMessage | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SmsMessage>;
  const sender = item.sender === "character" || item.sender === "system" ? item.sender : "user";
  const content = text(item.content).trim();
  const id = text(item.id);
  const timelineId = text(item.timelineId);
  const characterId = text(item.characterId);
  const ownerIdentityId = text(item.ownerIdentityId);
  const phoneNumber = text(item.phoneNumber);
  return id && timelineId && characterId && ownerIdentityId && content && isSmsPhoneNumber(phoneNumber)
    ? { id, timelineId, characterId, ownerIdentityId, phoneNumber, sender, content, receivedAt: time(item.receivedAt), readAt: typeof item.readAt === "number" ? item.readAt : undefined, timelineTime: text(item.timelineTime) || undefined }
    : null;
};

const normalizeMemory = (value: unknown): SmsTimelineMemory | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SmsTimelineMemory>;
  const timelineId = text(item.timelineId);
  const characterId = text(item.characterId);
  const ownerIdentityId = text(item.ownerIdentityId);
  const phoneNumber = text(item.phoneNumber);
  if (!timelineId || !characterId || !ownerIdentityId || !isSmsPhoneNumber(phoneNumber)) return null;
  const notes = Array.isArray(item.notes) ? item.notes.filter((note): note is string => typeof note === "string" && Boolean(note.trim())).slice(-20) : [];
  return { timelineId, characterId, ownerIdentityId, phoneNumber, notes, relationshipSummary: text(item.relationshipSummary) || undefined, updatedAt: time(item.updatedAt) };
};

export const normalizeSmsStore = (value: unknown): SmsStore => {
  if (!value || typeof value !== "object") return emptyStore();
  const item = value as Partial<SmsStore>;
  return {
    version: SMS_STORE_VERSION,
    phones: Array.isArray(item.phones) ? item.phones.map(normalizePhone).filter((entry): entry is SmsUserPhone => Boolean(entry)) : [],
    timelines: Array.isArray(item.timelines) ? item.timelines.map(normalizeTimeline).filter((entry): entry is SmsTimeline => Boolean(entry)) : [],
    messages: Array.isArray(item.messages) ? item.messages.map(normalizeMessage).filter((entry): entry is SmsMessage => Boolean(entry)) : [],
    memories: Array.isArray(item.memories) ? item.memories.map(normalizeMemory).filter((entry): entry is SmsTimelineMemory => Boolean(entry)) : [],
  };
};

export function loadSmsStore(): StorageResult<SmsStore> {
  const result = readJson<unknown>(SMS_STORE_KEY, emptyStore());
  return { ...result, value: normalizeSmsStore(result.value) };
}

export function saveSmsStore(store: SmsStore): StorageWriteResult {
  return writeJson(SMS_STORE_KEY, normalizeSmsStore(store));
}

export function getSmsPhone(store: SmsStore, identityId: string): string {
  return store.phones.find((phone) => phone.identityId === identityId)?.phoneNumber || SMS_DEFAULT_PHONE;
}

export function upsertSmsPhone(store: SmsStore, identityId: string, phoneNumber: string): SmsStore {
  if (!isSmsPhoneNumber(phoneNumber)) return store;
  const next = { ...store, phones: store.phones.filter((phone) => phone.identityId !== identityId) };
  next.phones.push({ identityId, phoneNumber, updatedAt: Date.now() });
  return next;
}
