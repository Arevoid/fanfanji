import type { Character } from "../../../types";

export type MomentSeason = "春季" | "夏季" | "秋季" | "冬季";

export interface MomentTemporalContext {
  currentDate: string;
  currentSeason: MomentSeason;
  currentSolarTerm: string;
  generatedAt: Date;
}

const SOLAR_TERMS = [
  [1, 5, "小寒"], [1, 20, "大寒"], [2, 4, "立春"], [2, 19, "雨水"],
  [3, 6, "惊蛰"], [3, 21, "春分"], [4, 5, "清明"], [4, 20, "谷雨"],
  [5, 6, "立夏"], [5, 21, "小满"], [6, 6, "芒种"], [6, 21, "夏至"],
  [7, 7, "小暑"], [7, 23, "大暑"], [8, 8, "立秋"], [8, 23, "处暑"],
  [9, 8, "白露"], [9, 23, "秋分"], [10, 8, "寒露"], [10, 23, "霜降"],
  [11, 8, "立冬"], [11, 22, "小雪"], [12, 7, "大雪"], [12, 22, "冬至"],
] as const;

const SEASONAL_WORDS: Record<MomentSeason, readonly string[]> = {
  春季: ["春天", "春日", "春风", "春暖", "花开", "踏青", "樱花", "春季"],
  夏季: ["夏天", "盛夏", "暑假", "高温", "酷暑", "雨季", "蝉鸣", "夏季"],
  秋季: ["秋天", "秋日", "凉爽", "落叶", "桂花", "秋季"],
  冬季: ["冬天", "寒冬", "冬日", "冬季", "立冬", "初雪", "寒潮", "年末", "雪天", "冰雪"],
};

const HOLIDAY_MONTHS: Record<string, readonly number[]> = {
  春节: [1, 2],
  年末: [12],
};

const FIXED_HOLIDAYS: Record<string, { month: number; day: number }> = {
  元旦: { month: 1, day: 1 },
  圣诞: { month: 12, day: 25 },
  圣诞节: { month: 12, day: 25 },
};

const HISTORICAL_REFERENCE = /(?:去年|前年|曾经|那年|回忆|小时候|过去|当时|以前)/;
const pad = (value: number) => value.toString().padStart(2, "0");

const CHINESE_CLOCK_VALUES: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
};

const parseClockNumber = (value: string): number | undefined => {
  if (/^\d{1,2}$/.test(value)) return Number(value);
  return CHINESE_CLOCK_VALUES[value];
};

function findCurrentClockReferences(content: string): Array<{ index: number; minutes: number }> {
  const references: Array<{ index: number; minutes: number }> = [];
  const clockPattern = /(?:凌晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)\s*([零〇一二两三四五六七八九十]{1,2}|\d{1,2})\s*(?:点|时)(半|(?:[零〇一二两三四五六七八九十]{1,2}|\d{1,2})分?)?/g;
  for (const match of content.matchAll(clockPattern)) {
    const index = match.index || 0;
    if (isExplicitHistoricalReference(content, index)) continue;
    const period = match[0].match(/^(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)/)?.[1] || "";
    const rawHour = parseClockNumber(match[1]);
    if (rawHour === undefined || rawHour > 23) continue;
    let hour = rawHour;
    if (["下午", "傍晚", "晚上", "夜里", "深夜"].includes(period) && hour < 12) hour += 12;
    if (period === "中午" && hour < 11) hour += 12;
    if (period === "凌晨" && hour === 12) hour = 0;
    const minuteToken = match[2] || "";
    const minute = minuteToken === "半" ? 30 : (parseClockNumber(minuteToken.replace(/分$/, "")) || 0);
    if (minute <= 59) references.push({ index, minutes: hour * 60 + minute });
  }
  return references;
}

export function getMomentSeason(date: Date): MomentSeason {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return "春季";
  if (month >= 6 && month <= 8) return "夏季";
  if (month >= 9 && month <= 11) return "秋季";
  return "冬季";
}

export function getCurrentSolarTerm(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const passed = SOLAR_TERMS.filter(([termMonth, termDay]) =>
    termMonth < month || (termMonth === month && termDay <= day),
  );
  return (passed[passed.length - 1] || SOLAR_TERMS[SOLAR_TERMS.length - 1])[2];
}

/** Builds request-time reality only. It is never persisted or derived from stories. */
export function createMomentTemporalContext(date: Date = new Date()): MomentTemporalContext {
  return {
    currentDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    currentSeason: getMomentSeason(date),
    currentSolarTerm: getCurrentSolarTerm(date),
    generatedAt: new Date(date.getTime()),
  };
}

/** Keeps this Moment's publication time separate from dated memory and offline fictional scenes. */
export function formatMomentTemporalContext(context: MomentTemporalContext, character?: Character): string {
  const birthday = character ? extractCharacterBirthday(character) : undefined;
  const birthdayRule = birthday
    ? `The character's recorded birthday is ${pad(birthday.month)}-${pad(birthday.day)}. Only call it "today" when the occurrence date has that month and day.`
    : "Do not claim that today is the character's birthday unless a recorded birthday matches the occurrence date.";
  const occurrenceTime = `${pad(context.generatedAt.getHours())}:${pad(context.generatedAt.getMinutes())}`;

  return `[MOMENT OCCURRENCE-TIME CONTEXT]
This Moment occurred and was published at: ${context.currentDate} ${occurrenceTime} (local time).
Current season: ${context.currentSeason}. Current solar term: ${context.currentSolarTerm}.
Write the post as if this occurrence time is "today" and "now". Do not use the real app-open time. Use this date and clock time for day-period references, season, solar terms, holidays, and birthdays.
If the post states an explicit current clock time such as “凌晨两点半” or “下午三点”, it must match the occurrence clock above. Prefer omitting an exact clock time unless it is necessary.
Do not refer to a later part of the same day as if it has already happened: for example, do not write "今晚" or "今天晚上" before evening, and do not write "今天下午" before afternoon.
Historical chat and memory are dated past events only; they must not replace this occurrence time. Offline-story time is fictional and is valid only inside that story.
Do not describe a season, solar term, holiday, or weather scene that conflicts with this occurrence time unless explicitly referring to a clearly marked historical memory.
${birthdayRule}`;
}

export function extractCharacterBirthday(character: Character): { month: number; day: number } | undefined {
  const source = [
    character.personality,
    character.backstory,
    ...(character.references || []).map((reference) => `${reference.title}\n${reference.content}`),
  ].join("\n");
  const patterns = [
    /(?:生日|birth(?:day)?)[^\d]{0,12}(\d{1,2})月(\d{1,2})日/i,
    /(\d{1,2})月(\d{1,2})日[^\n]{0,12}(?:生日|birth(?:day)?)/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  return undefined;
}

function isExplicitHistoricalReference(content: string, index: number): boolean {
  return HISTORICAL_REFERENCE.test(content.slice(Math.max(0, index - 16), index + 16));
}

/** Returns publication blockers for impossible current-time claims. */
export function findMomentTemporalConflicts(
  content: string,
  context: MomentTemporalContext,
  character?: Character,
): string[] {
  const conflicts: string[] = [];
  const allowedSeasonWords = new Set(SEASONAL_WORDS[context.currentSeason]);
  const occurrenceHour = context.generatedAt.getHours();
  const occurrenceMinutes = occurrenceHour * 60 + context.generatedAt.getMinutes();

  for (const reference of findCurrentClockReferences(content)) {
    if (Math.abs(reference.minutes - occurrenceMinutes) > 45) {
      conflicts.push("explicit clock time conflicts with the Moment occurrence time");
    }
  }

  if (occurrenceHour < 17 && /(?:今晚|今天晚上|今夜)/.test(content)) {
    conflicts.push("evening reference is later than the Moment occurrence time");
  }
  if (occurrenceHour < 12 && /(?:今天下午|今下午)/.test(content)) {
    conflicts.push("afternoon reference is later than the Moment occurrence time");
  }
  if (occurrenceHour < 11 && /(?:今天中午|今中午)/.test(content)) {
    conflicts.push("noon reference is later than the Moment occurrence time");
  }

  for (const [season, words] of Object.entries(SEASONAL_WORDS) as [MomentSeason, readonly string[]][]) {
    if (season === context.currentSeason) continue;
    for (const word of words) {
      const index = content.indexOf(word);
      if (index >= 0 && !allowedSeasonWords.has(word) && !isExplicitHistoricalReference(content, index)) {
        conflicts.push(`seasonal term "${word}" conflicts with ${context.currentSeason}`);
      }
    }
  }

  for (const [, , solarTerm] of SOLAR_TERMS) {
    if (solarTerm === context.currentSolarTerm) continue;
    const index = content.indexOf(solarTerm);
    if (index >= 0 && !isExplicitHistoricalReference(content, index)) {
      conflicts.push(`solar term "${solarTerm}" conflicts with ${context.currentSolarTerm}`);
    }
  }

  for (const [holiday, allowedMonths] of Object.entries(HOLIDAY_MONTHS)) {
    const index = content.indexOf(holiday);
    if (index >= 0 && !allowedMonths.includes(context.generatedAt.getMonth() + 1) && !isExplicitHistoricalReference(content, index)) {
      conflicts.push(`holiday "${holiday}" is not current`);
    }
  }

  for (const [holiday, expectedDate] of Object.entries(FIXED_HOLIDAYS)) {
    const index = content.indexOf(holiday);
    const isCurrentDate = context.generatedAt.getMonth() + 1 === expectedDate.month
      && context.generatedAt.getDate() === expectedDate.day;
    if (index >= 0 && !isCurrentDate && !isExplicitHistoricalReference(content, index)) {
      conflicts.push(`holiday "${holiday}" is not current`);
    }
  }

  if (/(?:今天.{0,8}生日|生日.{0,8}今天)/.test(content)) {
    const birthday = character ? extractCharacterBirthday(character) : undefined;
    if (!birthday || birthday.month !== context.generatedAt.getMonth() + 1 || birthday.day !== context.generatedAt.getDate()) {
      conflicts.push("today birthday claim does not match a recorded birthday");
    }
  }

  return conflicts;
}
