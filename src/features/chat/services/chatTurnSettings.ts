import type { Character } from "../../../types";

/** Settings that affect the next generated chat turn, resolved at send time. */
export interface ChatTurnSettings {
  enableTimeAwareness: boolean;
  disableBracketActions: boolean;
}

/**
 * Keep UI defaults and prompt/output filtering in one place. This function is
 * intentionally called for every generation attempt rather than when a chat
 * session is initialized.
 */
export const resolveChatTurnSettings = (
  character: Pick<Character, "enableTimeAwareness" | "disableBracketActions"> | undefined,
): ChatTurnSettings => ({
  enableTimeAwareness: character?.enableTimeAwareness !== false,
  disableBracketActions: Boolean(character?.disableBracketActions),
});
