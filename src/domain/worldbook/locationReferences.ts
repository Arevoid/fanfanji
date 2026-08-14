import type { WorldBookEntry } from "../../types";
import { isWorldBookEntryForCharacter } from "./worldBookVisibility";

const LOCATION_CATEGORIES = new Set(["地点", "地名", "地址", "位置", "场景", "场景设定", "场景信息", "空间"]);
const INVALID_LOCATION = /^(?:前|后|左|右|上方|下方|站立|跪姿|坐着|站着|开心|难过|朋友|家人)$/;
const LOCATION_TITLE = /(?:站|机场|酒店|公园|学校|医院|商场|街|路|巷|区|市|镇|村|楼|馆|厅|店|室|公寓|住所|办公室|工作室|场所|地点|地址|场景)/;
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const usable = (value: string) => {
  const text = normalize(value);
  return Boolean(text) && text.length <= 80 && !INVALID_LOCATION.test(text);
};

export function getWorldBookLocationReferences(entries: readonly WorldBookEntry[], characterId: string, limit: number = 15): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const display = normalize(value);
    const key = display.toLowerCase();
    if (usable(display) && !seen.has(key) && result.length < limit) { seen.add(key); result.push(display); }
  };
  entries.filter((entry) => isWorldBookEntryForCharacter(entry, characterId)).forEach((entry) => {
    const locationCategory = LOCATION_CATEGORIES.has(entry.category || "");
    if (locationCategory || LOCATION_TITLE.test(entry.title || "")) add(entry.title);
    if (!entry.content) return;
    entry.content.split(/\r?\n/).forEach((line) => {
      const match = line.match(/(?:地址|地点|场景|位置|位于|坐落于)\s*[:：]?\s*(.+)/);
      if (match?.[1] && (locationCategory || /(?:地址|地点|场景|位置|位于|坐落于)/.test(line))) add(match[1]);
    });
  });
  return result;
}
