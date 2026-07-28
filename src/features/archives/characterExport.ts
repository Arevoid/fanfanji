import type { Character, WorldBookEntry } from "../../types";

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
  const boundEntries = includeWorldBook
    ? worldBookEntries.filter((entry) => entry.characterId === character.id)
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
          version: 1,
          character,
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
