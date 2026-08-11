export type ChatStylePreset = "default" | "floating-cute" | "liquid-glass";

/**
 * A persisted character value of `default` means "inherit". Keeping this
 * decision outside AppChat lets the shell resolve settings without importing
 * the entire chat application bundle.
 */
export const resolveActiveChatStylePreset = (
  characterPreset: ChatStylePreset | undefined,
  globalPreset: ChatStylePreset | undefined,
): ChatStylePreset =>
  characterPreset && characterPreset !== "default"
    ? characterPreset
    : (globalPreset || "default");
