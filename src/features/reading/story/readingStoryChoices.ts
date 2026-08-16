import type { ReadingStoryChoice } from "../../../domain/reading/storyTypes";

export const FREE_ACTION_CHOICE: ReadingStoryChoice = {
  id: "free-action",
  label: "按自己的想法行动或说话",
};

const FALLBACK_DIRECTIONS: ReadingStoryChoice[] = [
  { id: "scene-investigate", label: "观察当前场景，寻找能改变局面的线索" },
  { id: "scene-interact", label: "与在场人物直接交涉，试探对方的真实意图" },
  { id: "scene-move", label: "改变当前位置或采取主动行动，制造新的机会" },
];
const GENERIC_DIRECTION_PATTERNS = [
  /^继续观察局势/,
  /^主动询问在场人物/,
  /^询问同行好友的判断$/,
  /^按照当前目标推进/,
  /^观察眼前变化，确认最值得注意的线索$/,
  /^和.+交换判断后行动$/,
  /^主动回应在场的人，推动当前事件$/,
];

const normalizeLabel = (label: string): string =>
  label.replace(/[\s，。！？；：、“”‘’（）()]/g, "").toLocaleLowerCase();

const isFreeActionLabel = (label: string): boolean => {
  const key = normalizeLabel(label);
  return key === "按自己的想法行动" || key === normalizeLabel(FREE_ACTION_CHOICE.label);
};

/**
 * Keeps every story node actionable: up to three model directions plus one
 * explicit free-action entry. If a model returns too few distinct directions,
 * scene-neutral but materially different fallbacks prevent four identical
 * choices from being shown to the user.
 */
export function ensureDistinctReadingStoryChoices(
  choices: readonly ReadingStoryChoice[],
): ReadingStoryChoice[] {
  const unique: ReadingStoryChoice[] = [];
  const seen = new Set<string>();
  for (const choice of choices) {
    const label = choice.label.trim();
    const key = normalizeLabel(label);
    if (!label || seen.has(key) || isFreeActionLabel(label) || GENERIC_DIRECTION_PATTERNS.some((pattern) => pattern.test(label))) continue;
    seen.add(key);
    unique.push({ ...choice, label });
  }

  const directions = unique.length >= 3 ? unique.slice(0, 3) : [...unique];
  for (const fallback of FALLBACK_DIRECTIONS) {
    if (directions.length >= 3) break;
    const key = normalizeLabel(fallback.label);
    if (!seen.has(key)) {
      seen.add(key);
      directions.push(fallback);
    }
  }
  return [...directions, FREE_ACTION_CHOICE];
}
