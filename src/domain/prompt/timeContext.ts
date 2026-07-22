const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export type LocalTimePeriod = "凌晨" | "清晨" | "上午" | "中午" | "下午" | "晚上";

export interface LocalTimeContext {
  dateTime: string;
  timezone: string;
  period: LocalTimePeriod;
}

export function getLocalTimePeriod(hour: number): LocalTimePeriod {
  if (hour < 5) return "凌晨";
  if (hour < 9) return "清晨";
  if (hour < 11) return "上午";
  if (hour < 13) return "中午";
  if (hour < 18) return "下午";
  return "晚上";
}

export function getLocalTimeContext(date: Date = new Date()): LocalTimeContext {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;
  const offsetSuffix = offsetRemainder ? `:${offsetRemainder.toString().padStart(2, "0")}` : "";
  const hour = date.getHours();

  return {
    dateTime: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]} ${hour.toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`,
    timezone: `UTC${offsetSign}${offsetHours}${offsetSuffix}`,
    period: getLocalTimePeriod(hour),
  };
}

/** Creates request-time local reality context; it is never cached or persisted. */
export function formatLocalTimeContext(date: Date = new Date()): string {
  const context = getLocalTimeContext(date);
  return `当前现实时间：${context.dateTime}\n当前时区：${context.timezone}\n当前时间段：${context.period}\n【现实时间优先】当用户询问“现在几点”、当前日期或早晚时，以以上设备本地现实时间为准；不要用聊天记录、故事内容或角色设定中的时间替代，除非用户明确在进行剧情扮演或询问故事内时间。`;
}
