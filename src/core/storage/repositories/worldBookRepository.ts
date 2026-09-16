import type { WorldBookEntry } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

const VALID_TRIGGER_TYPES = new Set(["keys", "constant", "vector"]);
const VALID_POSITIONS = new Set(["after_main_prompt", "before_char_def", "after_char_def", "before_chat_history", "at_depth"]);
const VALID_VISIBILITY = new Set(["private", "public"]);
const VALID_PURPOSES = new Set(["world_canon", "persona_rule", "memory", "instruction"]);
const hasEnumValue = <T extends string>(values: ReadonlySet<string>, value: unknown): value is T =>
  typeof value === "string" && values.has(value);

/**
 * Normalize one persisted record without changing the on-disk value. Older
 * exports may omit optional fields, but malformed required fields must not be
 * allowed to poison the whole World Book array.
 */
export function normalizeWorldBookEntry(value: unknown): WorldBookEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const title = typeof source.title === "string" ? source.title.trim() : "";
  const content = typeof source.content === "string" ? source.content.trim() : "";
  if (!id || !title || !content) return null;

  const category = typeof source.category === "string" && source.category.trim()
    ? source.category.trim()
    : "常规";
  const timestamp = typeof source.timestamp === "number" && Number.isFinite(source.timestamp)
    ? source.timestamp
    : 0;
  const characterId = typeof source.characterId === "string" && source.characterId.trim()
    ? source.characterId.trim()
    : undefined;
  const characterIds = Array.isArray(source.characterIds)
    ? [...new Set(source.characterIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))]
    : undefined;
  const triggerType = hasEnumValue<NonNullable<WorldBookEntry["triggerType"]>>(VALID_TRIGGER_TYPES, source.triggerType)
    ? source.triggerType as WorldBookEntry["triggerType"]
    : undefined;
  const keywords = typeof source.keywords === "string" ? source.keywords.trim() : undefined;
  const position = hasEnumValue<NonNullable<WorldBookEntry["position"]>>(VALID_POSITIONS, source.position)
    ? source.position as WorldBookEntry["position"]
    : undefined;
  const depth = typeof source.depth === "number" && Number.isFinite(source.depth)
    ? Math.max(1, Math.min(15, Math.round(source.depth)))
    : undefined;
  const visibility = hasEnumValue<NonNullable<WorldBookEntry["visibility"]>>(VALID_VISIBILITY, source.visibility)
    ? source.visibility as WorldBookEntry["visibility"]
    : undefined;
  const purpose = hasEnumValue<NonNullable<WorldBookEntry["purpose"]>>(VALID_PURPOSES, source.purpose)
    ? source.purpose as WorldBookEntry["purpose"]
    : undefined;
  const scope = source.scope && typeof source.scope === "object" && !Array.isArray(source.scope)
    ? source.scope as WorldBookEntry["scope"]
    : undefined;

  return {
    id,
    title,
    category,
    content,
    timestamp,
    characterId,
    characterIds: characterIds?.length ? characterIds : undefined,
    scope,
    visibility,
    purpose,
    triggerType,
    keywords,
    isActive: source.isActive === false ? false : true,
    position,
    depth,
  };
}

export function normalizeWorldBookEntries(values: unknown): WorldBookEntry[] {
  if (!Array.isArray(values)) return [];
  const result: WorldBookEntry[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const entry = normalizeWorldBookEntry(value);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

export function mergeDefaultWorldBookEntries(entries: WorldBookEntry[], defaults: WorldBookEntry[]): WorldBookEntry[] {
  const merged = [...entries];
  for (const entry of defaults) {
    if (!merged.some((saved) => saved.id === entry.id)) merged.push(entry);
  }
  return merged;
}

export function loadWorldBookEntries(defaults: WorldBookEntry[]): StorageResult<WorldBookEntry[]> {
  const normalizedDefaults = normalizeWorldBookEntries(defaults);
  const result = readArray<WorldBookEntry>(storageKeys.worldBookEntries, normalizedDefaults);
  if (!result.found || !result.valid) return { ...result, value: normalizedDefaults };
  const normalizedStored = normalizeWorldBookEntries(result.value);
  if (normalizedStored.length !== result.value.length) {
    console.warn("[worldbook] Ignored malformed or duplicate persisted entries while loading.");
  }
  return { ...result, value: mergeDefaultWorldBookEntries(normalizedStored, normalizedDefaults) };
}

export const saveWorldBookEntries = (entries: WorldBookEntry[]): StorageWriteResult => writeArray(storageKeys.worldBookEntries, entries);
