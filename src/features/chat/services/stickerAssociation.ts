import type { Sticker, StickerGroup } from "../../../types";

const normalize = (value: string): string => value.trim().toLocaleLowerCase();

/**
 * Returns local sticker matches for the text currently in the chat composer.
 * This is deliberately synchronous and never calls an API; semantic metadata
 * is only used when it was already cached on the sticker.
 */
export function getStickerRecommendations(
  groups: readonly StickerGroup[],
  query: string,
  limit = 5,
): Sticker[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery || limit <= 0) return [];

  const chineseSegments = normalizedQuery.match(/[\u3400-\u9fff]{2,}/gu) || [];
  const tokens = Array.from(new Set<string>([
    normalizedQuery,
    ...normalizedQuery
      .split(/[\s,，。！？!?、;；:："“”‘’（）()\[\]{}]+/u)
      .map(normalize)
      .filter(Boolean),
    ...chineseSegments.flatMap((segment) => Array.from({ length: segment.length - 1 }, (_, index) => segment.slice(index, index + 2))),
  ])).sort((a, b) => b.length - a.length);

  const seen = new Set<string>();
  const matches: Array<{ sticker: Sticker; score: number; order: number }> = [];
  let order = 0;
  for (const group of groups) {
    for (const sticker of group.stickers) {
      const id = sticker.id || `${group.id}:${sticker.name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const haystack = normalize(`${sticker.name} ${sticker.semanticDescription || ""}`);
      const matchingToken = tokens.find((token) => haystack.includes(token));
      if (!matchingToken) {
        order += 1;
        continue;
      }
      const nameMatch = normalize(sticker.name).includes(matchingToken);
      matches.push({
        sticker,
        score: matchingToken.length * 10 + (nameMatch ? 5 : 0),
        order,
      });
      order += 1;
    }
  }

  return matches
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.sticker);
}
