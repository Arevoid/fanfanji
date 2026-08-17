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
export interface ReadingStoryChoiceContext {
  narrative?: string;
  currentLocation?: string;
}
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

const hasAny = (text: string, words: readonly string[]): boolean =>
  words.some((word) => text.includes(word));

/**
 * Produces scene-aware directions when the model returns fewer than three
 * usable choices. This is intentionally deterministic: it keeps the story
 * playable during a partial/low-quality model response without showing the
 * same generic options at every node.
 */
function contextualFallbackDirections(
  context: ReadingStoryChoiceContext | undefined,
): ReadingStoryChoice[] {
  const narrative = context?.narrative?.trim() || "";
  const location = context?.currentLocation?.trim() || "";
  const scene = `${location}${narrative}`;

  if (hasAny(scene, ["岔路", "路口", "分叉", "左右两边", "中间道路"])) {
    return [
      { id: "scene-left", label: "沿左侧路线前进，先确认前方的动静" },
      { id: "scene-right", label: "沿右侧路线绕行，寻找更安全的出口" },
      { id: "scene-middle", label: "留在岔路口检查痕迹，再决定走哪一边" },
    ];
  }
  if (hasAny(scene, ["门", "门锁", "钥匙", "出口", "入口", "房门"])) {
    return [
      { id: "scene-door-check", label: "先检查门锁和门边痕迹，确认是否有人来过" },
      { id: "scene-door-search", label: "寻找钥匙或其他入口，尽量不惊动门后的人" },
      { id: "scene-door-call", label: "敲门或出声试探，听清门后的回应" },
    ];
  }
  if (hasAny(scene, ["脚印", "血迹", "痕迹", "线索", "文件", "箱子", "库房", "失窃"])) {
    return [
      { id: "scene-trace-follow", label: "沿着最明显的痕迹追查，锁定线索指向的人或地点" },
      { id: "scene-trace-search", label: "回到现场仔细搜索，找出被遗漏的物品或证据" },
      { id: "scene-trace-hide", label: "先藏好自己的行踪，观察谁会来处理现场" },
    ];
  }
  if (hasAny(scene, ["守卫", "陌生人", "庄主", "对方", "他", "她", "说", "问"])) {
    return [
      { id: "scene-person-ask", label: "直接询问关键人物，确认他此刻真正想做什么" },
      { id: "scene-person-watch", label: "保持距离观察对方的下一步，暂时不暴露意图" },
      { id: "scene-person-test", label: "抛出一个试探性问题，看看对方会如何回应" },
    ];
  }
  if (hasAny(scene, ["追", "逃", "危险", "袭击", "逼近", "火", "爆炸"])) {
    return [
      { id: "scene-danger-cover", label: "寻找掩体并确认威胁来源，再决定是否反击" },
      { id: "scene-danger-retreat", label: "带上眼前最重要的东西，先撤到安全位置" },
      { id: "scene-danger-divert", label: "制造新的动静，把危险引向另一条路线" },
    ];
  }

  const hint = (location || narrative.replace(/\s+/g, " ")).slice(0, 18) || "眼前的场景";
  return [
    { id: "scene-focus", label: `仔细观察“${hint}”中最异常的细节` },
    { id: "scene-approach", label: "寻找一个可以改变局面的对象或线索并主动接近" },
    { id: "scene-position", label: "换一个位置重新判断局势，给自己留下退路" },
  ];
}

/**
 * Keeps every story node actionable: up to three model directions plus one
 * explicit free-action entry. If a model returns too few distinct directions,
 * scene-aware fallbacks prevent four identical choices from being shown to
 * the user when the model omits some branches.
 */
export function ensureDistinctReadingStoryChoices(
  choices: readonly ReadingStoryChoice[],
  context?: ReadingStoryChoiceContext,
): ReadingStoryChoice[] {
  const unique: ReadingStoryChoice[] = [];
  const seen = new Set<string>();
  for (const choice of choices) {
    const label = choice.label.trim();
    const key = normalizeLabel(label);
    const isStaticFallback = FALLBACK_DIRECTIONS.some(
      (fallback) => normalizeLabel(fallback.label) === key,
    );
    if (
      !label ||
      seen.has(key) ||
      isFreeActionLabel(label) ||
      (Boolean(context?.narrative || context?.currentLocation) && isStaticFallback) ||
      GENERIC_DIRECTION_PATTERNS.some((pattern) => pattern.test(label))
    ) continue;
    seen.add(key);
    unique.push({ ...choice, label });
  }

  const directions = unique.length >= 3 ? unique.slice(0, 3) : [...unique];
  const fallbackDirections = context
    ? contextualFallbackDirections(context)
    : FALLBACK_DIRECTIONS;
  for (const fallback of fallbackDirections) {
    if (directions.length >= 3) break;
    const key = normalizeLabel(fallback.label);
    if (!seen.has(key)) {
      seen.add(key);
      directions.push(fallback);
    }
  }
  return [...directions, FREE_ACTION_CHOICE];
}
