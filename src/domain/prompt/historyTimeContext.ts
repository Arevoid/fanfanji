const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${WEEKDAYS[date.getDay()]}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function describeRelativeDate(target: Date, now: Date): string {
  const difference = Math.round((startOfLocalDay(target).getTime() - startOfLocalDay(now).getTime()) / 86_400_000);
  if (difference < 0) return "相对当前日期已过去";
  if (difference === 0) return "就是今天，仍可能有效";
  return "相对当前日期仍在未来";
}

/**
 * Adds only factual calendar resolution for relative time words found in an
 * existing message. It never persists data or changes the displayed message.
 */
export function describeHistoricalRelativeTime(content: string, sentAt: number, now: Date = new Date()): string {
  const sentDate = new Date(sentAt);
  const resolved: string[] = [];

  if (/(明天|明日|내일|\btomorrow\b)/iu.test(content)) {
    const target = new Date(sentDate.getFullYear(), sentDate.getMonth(), sentDate.getDate() + 1);
    resolved.push(`“明天／明日／내일／tomorrow”指${formatDate(target)}，${describeRelativeDate(target, now)}`);
  }
  if (/(今晚|今夜|오늘\s*밤|\btonight\b)/iu.test(content)) {
    const target = startOfLocalDay(sentDate);
    resolved.push(`“今晚／今夜／오늘 밤／tonight”指${formatDate(target)}当晚，${describeRelativeDate(target, now)}`);
  }
  if (/(下周|下週|来週|다음\s*주|\bnext\s+week\b)/iu.test(content)) {
    const daysUntilNextMonday = ((8 - sentDate.getDay()) % 7) || 7;
    const target = new Date(sentDate.getFullYear(), sentDate.getMonth(), sentDate.getDate() + daysUntilNextMonday);
    resolved.push(`“下周／来週／다음 주／next week”从该消息日期起指${formatDate(target)}所在周，${describeRelativeDate(target, now)}`);
  }

  return resolved.length > 0 ? `；相对时间解释：${resolved.join("；")}` : "";
}

export function formatHistoricalMessageForPrompt(content: string, sentAt: number, now: Date = new Date()): string {
  const sentDate = new Date(sentAt);
  const time = `${formatDate(sentDate)} ${sentDate.getHours().toString().padStart(2, "0")}:${sentDate.getMinutes().toString().padStart(2, "0")}`;
  return `${content}\n[历史发送时间：${time}${describeHistoricalRelativeTime(content, sentAt, now)}]`;
}
