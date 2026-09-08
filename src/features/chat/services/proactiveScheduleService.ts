import type { Character } from "../../../types";

export function scheduleNextProactiveMessage(
  friend: Pick<Character, "proactiveStartTime" | "proactiveEndTime">,
  now = new Date(),
  random = Math.random,
): number {
  const startTime = friend.proactiveStartTime || "09:00";
  const endTime = friend.proactiveEndTime || "22:00";
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowStartMs = todayStart.getTime() + startMinutes * 60000;
  const windowEndMs = todayStart.getTime() + endMinutes * 60000;
  const currentTimeMs = now.getTime();

  if (currentTimeMs >= windowEndMs) {
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowStartMs = tomorrowStart.getTime() + startMinutes * 60000;
    const tomorrowEndMs = tomorrowStart.getTime() + endMinutes * 60000;
    return Math.floor(tomorrowStartMs + random() * (tomorrowEndMs - tomorrowStartMs));
  }
  const possibleStartMs = Math.max(currentTimeMs, windowStartMs);
  return Math.floor(possibleStartMs + random() * (windowEndMs - possibleStartMs));
}
