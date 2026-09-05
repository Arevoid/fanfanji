import type { DiaryEntry } from "../../types";
import { DIARY_MAX_BODY_LENGTH } from "./diaryData";

const hasInternalTerm = (value: string): boolean => /\b(prompt|memory|relationId|characterId|system|model)\b/i.test(value);

export const isValidDiaryEntry = (value: unknown): value is DiaryEntry => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const common = typeof entry.id === "string" && typeof entry.ownerIdentityId === "string"
    && (entry.authorType === "user" || entry.authorType === "character")
    && typeof entry.authorNameSnapshot === "string" && typeof entry.body === "string" && entry.body.trim().length > 0
    && entry.body.length <= DIARY_MAX_BODY_LENGTH && Array.isArray(entry.tags) && entry.tags.every((tag) => typeof tag === "string")
    && typeof entry.occurredAt === "number" && Number.isFinite(entry.occurredAt) && entry.occurredAt <= Date.now() + 60_000
    && typeof entry.createdAt === "number" && typeof entry.updatedAt === "number"
    && ["manual", "ai-auto", "ai-manual"].includes(String(entry.source)) && typeof entry.isFavorite === "boolean";
  if (!common) return false;
  return entry.authorType === "user"
    ? entry.relationId === undefined && entry.characterId === undefined && entry.conversationId === undefined
    : typeof entry.relationId === "string" && typeof entry.characterId === "string" && typeof entry.conversationId === "string";
};
export const validateGeneratedDiaryContent = (value: unknown): { title?: string; body: string; emotionalState?: string; weather?: string; location?: string; tags: string[] } | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 100) : undefined;
  const emotionalState = typeof raw.emotionalState === "string" ? raw.emotionalState.trim().slice(0, 120) : undefined;
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).slice(0, 8).map((tag) => tag.trim().slice(0, 24)) : [];
  if (body.length < 20 || body.length > DIARY_MAX_BODY_LENGTH || hasInternalTerm(`${title || ""}\n${body}\n${emotionalState || ""}`)) return null;
  if (/[(（][^()（）]{1,80}[)）]/.test(body) || /发送了(一张)?照片|发送了语音/.test(body)) return null;
  if (emotionalState && emotionalState.length < 4) return null;
  return {
    ...(title ? { title } : {}), body, ...(emotionalState ? { emotionalState } : {}),
    ...(typeof raw.weather === "string" && raw.weather.trim() ? { weather: raw.weather.trim().slice(0, 60) } : {}),
    ...(typeof raw.location === "string" && raw.location.trim() ? { location: raw.location.trim().slice(0, 80) } : {}), tags,
  };
};
