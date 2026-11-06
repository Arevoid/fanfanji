import { sanitizeChatIcons, type ChatIconOverrides } from "../../../types";

export const CHAT_THEME_FORMAT = "fanfanji-chat-theme" as const;
export const CHAT_THEME_SCHEMA_VERSION = 2 as const;
export type ChatCssApiVersion = 1 | 2;

export interface ChatThemePackageV2 {
  format: typeof CHAT_THEME_FORMAT;
  schemaVersion: typeof CHAT_THEME_SCHEMA_VERSION;
  cssApiVersion: ChatCssApiVersion;
  meta: { name: string; exportedAt: string; app: "fanfanji" };
  css: string;
  assets: { icons: ChatIconOverrides };
}

export interface ParsedChatTheme {
  cssApiVersion: ChatCssApiVersion;
  css: string;
  icons: ChatIconOverrides;
}

export function sanitizeChatCssApiVersion(value: unknown): ChatCssApiVersion {
  return value === 2 ? 2 : 1;
}

export function buildChatThemePackage(input: {
  cssApiVersion?: unknown;
  css: string;
  icons: ChatIconOverrides;
  name?: string;
  exportedAt?: string;
}): ChatThemePackageV2 {
  return {
    format: CHAT_THEME_FORMAT,
    schemaVersion: CHAT_THEME_SCHEMA_VERSION,
    cssApiVersion: sanitizeChatCssApiVersion(input.cssApiVersion),
    meta: {
      name: input.name?.trim() || "饭饭机聊天主题",
      exportedAt: input.exportedAt || new Date().toISOString(),
      app: "fanfanji",
    },
    css: input.css,
    assets: { icons: sanitizeChatIcons(input.icons) },
  };
}

/** Parses v2 packages and migrates the original {version:1} theme shape. */
export function parseChatThemePackage(value: unknown): ParsedChatTheme {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid theme");
  const source = value as Record<string, unknown>;
  if (source.format === CHAT_THEME_FORMAT) {
    if (source.schemaVersion !== CHAT_THEME_SCHEMA_VERSION) throw new Error("unsupported theme schema");
    const assets = source.assets && typeof source.assets === "object" && !Array.isArray(source.assets)
      ? source.assets as Record<string, unknown>
      : {};
    return {
      cssApiVersion: sanitizeChatCssApiVersion(source.cssApiVersion),
      css: typeof source.css === "string" ? source.css : "",
      icons: sanitizeChatIcons(assets.icons),
    };
  }
  if (source.version === 1 || "chatGlobalCSS" in source || "chatIcons" in source) {
    return {
      cssApiVersion: 1,
      css: typeof source.chatGlobalCSS === "string" ? source.chatGlobalCSS : "",
      icons: sanitizeChatIcons(source.chatIcons),
    };
  }
  throw new Error("invalid theme");
}
