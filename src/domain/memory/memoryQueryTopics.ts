/** Small explicit topic bridges. This is a local retrieval aid, not an embedding model. */
const topics: readonly (readonly string[])[] = [
  ["打雷", "雷雨", "雷声", "雷暴", "雷电"],
  ["生日", "生辰"],
  ["咖啡", "coffee"],
  ["天文馆", "planetarium"],
  ["搬家", "新住址", "住在哪", "住哪里"],
];
export function expandMemoryQueryTopics(query: string): string {
  const normalized = query.normalize("NFKC").toLocaleLowerCase();
  const additions = topics.filter((group) => group.some((word) => normalized.includes(word)))
    .flatMap((group) => [...group]);
  return [query, ...new Set(additions)].join(" ");
}

/** Evidence-based intent bridge; never inject every important record for small talk. */
export function memoryIntentScore(text: string, query: string): number {
  if (!/(最珍惜|最珍贵|最重要的|珍藏的|珍惜的|重要的物品|重要的东西)/u.test(query)) return 0;
  // Importance must be expressed in the stored source, not inferred from its age or recency.
  return /珍藏|珍惜|珍贵|对.{0,8}(特别|很|非常)重要|意义.{0,6}(特别|重大|不同)|亲手.{0,12}(织|做|制作|送)/u.test(text) ? 8 : 0;
}
