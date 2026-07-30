import type { DiaryEntry } from "../../types";

export const DIARY_MAX_BODY_LENGTH = 4000;

export const createDiaryContentHash = (entry: Pick<DiaryEntry, "title" | "body" | "emotionalState">): string => {
  const value = `${entry.title || ""}\n${entry.body}\n${entry.emotionalState || ""}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
};

export const getDiaryDayKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const createDiaryId = (prefix = "diary"): string => `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
