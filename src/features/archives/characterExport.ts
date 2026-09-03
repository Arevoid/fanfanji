import type { Character, WorldBookEntry } from "../../types";
import { getWorldBookCharacterIds } from "../../domain/worldbook/worldBookVisibility";

export type PortableCharacterProfile = Pick<Character,
  "name" | "age" | "avatar" | "gender" | "mbti" | "personality" | "backstory" | "replyLanguage" | "greeting"
>;

const readString = (value: unknown): string => typeof value === "string" ? value : "";

/**
 * Character cards are portable persona documents, not chat backups. Keep this
 * allowlist deliberately small so relation state, memory, UI configuration,
 * proactive scheduling, voice/image settings, and local asset references can
 * never hitch a ride through a character-card round trip.
 */
export const toPortableCharacterProfile = (character: Character): PortableCharacterProfile => ({
  name: character.name,
  age: character.age ?? "",
  avatar: character.avatar || "",
  gender: character.gender || "",
  mbti: character.mbti || "",
  personality: character.personality || "",
  backstory: character.backstory || "",
  replyLanguage: character.replyLanguage || "",
  greeting: character.greeting || "",
});

/** Rebuilds a local Character from persona-only data and ignores every extra field. */
export const createCharacterFromImportedProfile = (value: unknown, id: string): Character => {
  const profile = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const importedAge = profile.age === "∞"
    ? "∞"
    : typeof profile.age === "number" && Number.isFinite(profile.age)
      ? profile.age
      : "";

  return {
    id,
    name: readString(profile.name) || "未命名角色",
    age: importedAge,
    avatar: readString(profile.avatar),
    gender: readString(profile.gender),
    mbti: readString(profile.mbti),
    personality: readString(profile.personality),
    backstory: readString(profile.backstory),
    replyLanguage: readString(profile.replyLanguage),
    greeting: readString(profile.greeting),
    album: [],
    references: [],
  };
};

const cleanRecognizedValue = (value: string): string => value
  .replace(/^\s*(?:\*\*|__)/, "")
  .replace(/(?:\*\*|__)\s*$/, "")
  .trim();

const readRawDocumentField = (text: string, labels: string): string => {
  const match = text.match(new RegExp(
    `^\\s*(?:[>#+\\-*•]\\s*)*(?:\\*\\*|__)?\\s*(?:${labels})\\s*(?:\\*\\*|__)?\\s*[:：]\\s*(.+?)\\s*$`,
    "im",
  ));
  return match?.[1] ? cleanRecognizedValue(match[1]) : "";
};

export const extractRawDocumentCharacterMetadata = (text: string) => {
  const name = readRawDocumentField(text, "姓名|角色名|name|character\\s*name");
  const ageValue = readRawDocumentField(text, "年龄|age");
  const ageMatch = ageValue.match(/\d{1,3}/);
  return {
    name,
    age: /^(?:∞|无限|永恒)$/i.test(ageValue.trim()) ? "∞" as const : ageMatch ? Number(ageMatch[0]) : "" as const,
    gender: readRawDocumentField(text, "性别|gender|sex"),
  };
};

/**
 * TXT/DOCX imports are plain archive documents. Recognize only name, age and
 * gender while keeping the entire extracted source in one unchanged field.
 */
export const createCharacterFromRawDocument = (text: string, filename: string, id: string): Character => {
  const metadata = extractRawDocumentCharacterMetadata(text);
  return {
    id,
    name: metadata.name || filename.replace(/\.[^/.]+$/, "").trim() || "未命名角色",
    age: metadata.age,
    avatar: "https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg",
    gender: metadata.gender,
    mbti: "",
    personality: text,
    backstory: "",
    greeting: "",
    album: [],
    references: [],
  };
};

const toWorldBookEntry = (entry: WorldBookEntry) => ({
  keys: (entry.keywords || "").split(/[,，]/).map((key) => key.trim()).filter(Boolean),
  content: entry.content,
  comment: entry.title,
  enabled: entry.isActive !== false,
  constant: entry.triggerType === "constant",
  position: entry.position || "after_char_def",
  depth: entry.depth || 5,
  insertion_order: entry.depth || 5,
});

/** Builds a portable V2 character card while preserving Fanfanji-only fields. */
export const buildCharacterExport = (
  character: Character,
  worldBookEntries: WorldBookEntry[],
  includeWorldBook: boolean,
) => {
  const profile = toPortableCharacterProfile(character);
  const boundEntries = includeWorldBook
    ? worldBookEntries.filter((entry) => getWorldBookCharacterIds(entry).includes(character.id))
    : [];

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: character.name,
      description: character.backstory || "",
      personality: character.personality || "",
      first_mes: character.greeting || "",
      avatar: character.avatar || "",
      extensions: {
        fanfanji: {
          format: "fanfanji-character-export",
          version: 2,
          character: profile,
        },
      },
      ...(includeWorldBook && boundEntries.length > 0 ? {
        character_book: {
          name: `${character.name} 世界书`,
          entries: Object.fromEntries(boundEntries.map((entry, index) => [String(index), toWorldBookEntry(entry)])),
        },
      } : {}),
    },
  };
};

export const characterExportFilename = (name: string) => {
  const safeName = (name || "角色").replace(/[\\/:*?"<>|]/g, "_").trim() || "角色";
  return `${safeName}-角色卡.json`;
};
