import type { Character } from "../../../types";
import type { CharacterRoutine } from "../../../domain/characterLife/characterRoutine/characterRoutineTypes";

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

/**
 * Time awareness controls both the explicit clock prompt and derived routine
 * hints such as "sleeping". Keep this gate next to the turn settings so all
 * chat entry points apply the same legacy-safe default.
 */
export const resolveChatRoutine = (
  routine: CharacterRoutine | undefined,
  enableTimeAwareness: boolean,
): CharacterRoutine | undefined => enableTimeAwareness ? routine : undefined;
