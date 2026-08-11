import type { Character } from "../../types";

type LanguageDefinition = {
  label: string;
  aliases: readonly RegExp[];
  nationalities: readonly RegExp[];
};

const LANGUAGES: readonly LanguageDefinition[] = [
  { label: "Japanese", aliases: [/日语|日文|日本語|Japanese/i], nationalities: [/日本人|日本国籍|国籍\s*[:：]?\s*日本|来自日本|Japanese\s+national/i] },
  { label: "Korean", aliases: [/韩语|韓語|朝鲜语|韓国語|Korean/i], nationalities: [/韩国人|韓國人|韩国国籍|国籍\s*[:：]?\s*韩国|来自韩国|Korean\s+national/i] },
  { label: "English", aliases: [/英语|英文|English/i], nationalities: [/英国人|美国人|加拿大人|澳大利亚人|新西兰人|British|American|Canadian|Australian|New Zealand(?:er)?/i] },
  { label: "French", aliases: [/法语|法文|French/i], nationalities: [/法国人|法国国籍|国籍\s*[:：]?\s*法国|来自法国|French\s+national/i] },
  { label: "German", aliases: [/德语|德文|German/i], nationalities: [/德国人|德国国籍|国籍\s*[:：]?\s*德国|来自德国|German\s+national/i] },
  { label: "Spanish", aliases: [/西班牙语|西语|Spanish/i], nationalities: [/西班牙人|西班牙国籍|国籍\s*[:：]?\s*西班牙|来自西班牙|Spanish\s+national/i] },
  { label: "Russian", aliases: [/俄语|俄文|Russian/i], nationalities: [/俄罗斯人|俄国人|俄罗斯国籍|来自俄罗斯|Russian\s+national/i] },
  { label: "Italian", aliases: [/意大利语|意大利文|Italian/i], nationalities: [/意大利人|意大利国籍|来自意大利|Italian\s+national/i] },
  { label: "Portuguese", aliases: [/葡萄牙语|葡语|Portuguese/i], nationalities: [/葡萄牙人|巴西人|Portuguese\s+national|Brazilian/i] },
  { label: "Thai", aliases: [/泰语|泰文|Thai/i], nationalities: [/泰国人|泰国国籍|来自泰国|Thai\s+national/i] },
  { label: "Vietnamese", aliases: [/越南语|越南文|Vietnamese/i], nationalities: [/越南人|越南国籍|来自越南|Vietnamese\s+national/i] },
  { label: "Arabic", aliases: [/阿拉伯语|阿拉伯文|Arabic/i], nationalities: [/阿拉伯人|Arab\s+national/i] },
  { label: "Traditional Chinese", aliases: [/繁体中文|繁體中文|正體中文|Traditional Chinese/i], nationalities: [] },
  { label: "Simplified Chinese", aliases: [/简体中文|簡體中文|普通话|普通話|汉语|漢語|Mandarin|Simplified Chinese/i], nationalities: [/中国人|中国国籍|国籍\s*[:：]?\s*中国|来自中国|Chinese\s+national/i] },
];

const EXPLICIT_LANGUAGE_MARKER = /说话语言|聊天语言|回复语言|输出语言|使用语言|主要语言|母语|语言\s*[:：]|speaks?|reply language|output language|native language|language\s*[:：]/i;

const normalizeConfiguredLanguage = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return LANGUAGES.find((language) => language.aliases.some((alias) => alias.test(trimmed)))?.label || trimmed;
};

const findExplicitLanguage = (text: string): string | undefined => {
  for (const language of LANGUAGES) {
    for (const alias of language.aliases) {
      const match = alias.exec(text);
      if (!match) continue;
      const window = text.slice(Math.max(0, match.index - 36), Math.min(text.length, match.index + match[0].length + 36));
      if (EXPLICIT_LANGUAGE_MARKER.test(window)) return language.label;
    }
  }
  return undefined;
};

const findNationalityLanguage = (text: string): string | undefined =>
  LANGUAGES.find((language) => language.nationalities.some((pattern) => pattern.test(text)))?.label;

export function resolveCharacterReplyLanguage(
  character: Pick<Character, "replyLanguage" | "personality" | "backstory">,
  worldKnowledge: readonly string[] = [],
): string {
  const configured = normalizeConfiguredLanguage(character.replyLanguage || "");
  if (configured) return configured;
  const profileText = [character.personality, character.backstory, ...worldKnowledge].filter(Boolean).join("\n");
  return findExplicitLanguage(profileText) || findNationalityLanguage(profileText) || "Simplified Chinese";
}

export function formatFinalReplyLanguageInstruction(language: string): string {
  return `[FINAL OUTPUT LANGUAGE — HIGHEST PRIORITY]
The character's visible reply language for this turn is: ${language}.
Write every character-authored chat bubble, voice transcript, Moment post, and Moment comment in ${language} only.
The user's language, Chinese UI text, Chinese task instructions, and prior Chinese conversation history must never change this output language.
Do not append a translation or bilingual duplicate unless the user explicitly asks for translation in the current message.`;
}
