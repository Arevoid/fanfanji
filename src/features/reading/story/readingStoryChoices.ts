import type { ReadingStoryChoice } from "../../../domain/reading/storyTypes";

export const FREE_ACTION_CHOICE: ReadingStoryChoice = { id: "free-action", label: "按自己的想法行动或说话" };
export const READING_STORY_CHOICE_INSTRUCTION = "选项与正文在同一次请求中生成。返回 0 至 3 个由当前场景支持的具体行动：使用在场人物、当前矛盾、玩家可见信息；不同选择可以影响态度、关系或处理方式，不必强行互斥或偏离原著。不确定时宁缺毋滥，不凑数、不编造门锁钥匙或不存在的人物。用户未选的选项绝不是已发生的事件。自由输入由界面提供。";
export interface ReadingStoryChoiceContext { narrative?: string; currentLocation?: string; previousChoices?: readonly string[] }
const normalize = (value: string) => value.replace(/[\s，。！？；：、“”‘’（）()]/g, "").toLocaleLowerCase();
// Exact legacy UI fillers, not plot facts. Never rewrite old narrative or user actions.
const LEGACY_FILLERS = new Set(["观察当前场景，寻找能改变局面的线索", "与在场人物直接交涉，试探对方的真实意图", "改变当前位置或采取主动行动，制造新的机会", "沿左侧路线前进，先确认前方的动静", "沿右侧路线绕行，寻找更安全的出口", "留在岔路口检查痕迹，再决定走哪一边", "先检查门锁和门边痕迹，确认是否有人来过", "寻找钥匙或其他入口，尽量不惊动门后的人", "敲门或出声试探，听清门后的回应", "沿着最明显的痕迹追查，锁定线索指向的人或地点", "回到现场仔细搜索，找出被遗漏的物品或证据", "先藏好自己的行踪，观察谁会来处理现场", "直接询问关键人物，确认他此刻真正想做什么", "保持距离观察对方的下一步，暂时不暴露意图", "抛出一个试探性问题，看看对方会如何回应", "寻找掩体并确认威胁来源，再决定是否反击", "带上眼前最重要的东西，先撤到安全位置", "制造新的动静，把危险引向另一条路线", "寻找一个可以改变局面的对象或线索并主动接近", "换一个位置重新判断局势，给自己留下退路"].map(normalize));
export function ensureDistinctReadingStoryChoices(choices: readonly ReadingStoryChoice[], _context?: ReadingStoryChoiceContext): ReadingStoryChoice[] {
  const seen = new Set<string>((_context?.previousChoices || []).map(normalize));
  const result: ReadingStoryChoice[] = [];
  const ids = new Set<string>();
  for (const choice of choices) {
    const label = choice.label?.trim();
    if (!label) continue;
    const key = normalize(label);
    if (choice.id === "free-action" || key === normalize(FREE_ACTION_CHOICE.label) || key === "按自己的想法行动" || LEGACY_FILLERS.has(key) || /^(继续观察局势|主动询问在场人物|按照当前目标推进)/.test(label) || seen.has(key)) continue;
    seen.add(key);
    let id = choice.id || `choice-${result.length + 1}`;
    while (ids.has(id)) id = `${id}-${result.length + 1}`;
    ids.add(id);
    result.push({ ...choice, id, label });
    if (result.length === 3) break;
  }
  return [...result, FREE_ACTION_CHOICE];
}
