const CHINESE_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

export function formatLunarDay(day: number): string {
  if (day <= 0 || day > 30) return String(day);
  if (day <= 10) return `初${CHINESE_DIGITS[day]}`;
  if (day < 20) return `十${CHINESE_DIGITS[day - 10]}`;
  if (day === 20) return "二十";
  if (day < 30) return `廿${CHINESE_DIGITS[day - 20]}`;
  return "三十";
}

export function formatChineseLunarDate(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).formatToParts(date) as Array<{ type: string; value: string }>;
    const yearName = parts.find((part) => part.type === "yearName")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (yearName && month && Number.isFinite(day)) return `${yearName}年${month}${formatLunarDay(day)}`;
  } catch {
    // Older WebViews may not expose the Chinese calendar. Keep the widget usable.
  }
  return "农历日期";
}

export function formatTimeWidgetDate(date: Date): { time: string; heading: string } {
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "long" });
  return { time, heading: `${monthDay} ${weekday} · ${formatChineseLunarDate(date)}` };
}
