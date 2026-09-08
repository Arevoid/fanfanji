export interface CharacterPhoneLocation {
  label: string;
  timeZone: string;
}

const KNOWN_LOCATIONS: Array<{ label: string; timeZone: string; aliases: string[] }> = [
  { label: "纽约", timeZone: "America/New_York", aliases: ["纽约", "New York", "纽约州"] },
  { label: "洛杉矶", timeZone: "America/Los_Angeles", aliases: ["洛杉矶", "Los Angeles", "加州"] },
  { label: "伦敦", timeZone: "Europe/London", aliases: ["伦敦", "London", "英国"] },
  { label: "巴黎", timeZone: "Europe/Paris", aliases: ["巴黎", "Paris", "法国"] },
  { label: "东京", timeZone: "Asia/Tokyo", aliases: ["东京", "Tokyo", "日本东京"] },
  { label: "首尔", timeZone: "Asia/Seoul", aliases: ["首尔", "Seoul", "韩国"] },
  { label: "新加坡", timeZone: "Asia/Singapore", aliases: ["新加坡", "Singapore"] },
  { label: "深圳", timeZone: "Asia/Shanghai", aliases: ["深圳"] },
  { label: "上海", timeZone: "Asia/Shanghai", aliases: ["上海"] },
  { label: "北京", timeZone: "Asia/Shanghai", aliases: ["北京"] },
  { label: "广州", timeZone: "Asia/Shanghai", aliases: ["广州"] },
  { label: "杭州", timeZone: "Asia/Shanghai", aliases: ["杭州"] },
  { label: "成都", timeZone: "Asia/Shanghai", aliases: ["成都"] },
  { label: "香港", timeZone: "Asia/Hong_Kong", aliases: ["香港", "Hong Kong"] },
  { label: "台北", timeZone: "Asia/Taipei", aliases: ["台北", "Taipei"] },
];

const EXPLICIT_LOCATION_PATTERN = /(?:所在地|居住地|住所|现居|住在|来自|位于|生活在|工作地|所在地区|城市|地区)[：:\s]*([^\n，。；,.;]{2,16})/u;

function normalizeLocationLabel(value: string): string {
  return value.replace(/[\s，。；,.;：:]+$/gu, "").trim().slice(0, 16);
}

function findKnownLocation(text: string): CharacterPhoneLocation | undefined {
  const match = KNOWN_LOCATIONS.find((location) => location.aliases.some((alias) => text.includes(alias)));
  return match ? { label: match.label, timeZone: match.timeZone } : undefined;
}

/** Infers only a compact display label/timezone; it never exposes the full source text. */
export function inferCharacterPhoneLocation(
  sources: readonly (string | undefined)[],
  fallbackLabel: string,
): CharacterPhoneLocation {
  const text = sources.filter((source): source is string => Boolean(source?.trim())).join("\n");
  const known = findKnownLocation(text);
  if (known) return known;
  const explicitLabel = text.match(EXPLICIT_LOCATION_PATTERN)?.[1];
  return {
    label: explicitLabel ? normalizeLocationLabel(explicitLabel) : fallbackLabel,
    timeZone: "Asia/Shanghai",
  };
}

export function formatCharacterPhoneTime(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
}

export function formatCharacterPhoneDate(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
  }
}
