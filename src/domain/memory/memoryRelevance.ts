import { expandMemoryQueryTopics, memoryIntentScore } from "./memoryQueryTopics";
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
export function memoryRelevance(text: string, query: string): number {
  const candidate = normalize(text); const search = normalize(expandMemoryQueryTopics(query));
  if (!search || !candidate) return 0;
  const words = new Set(query.toLocaleLowerCase().match(/[a-z0-9]{3,}/gu) || []);
  for (const word of words) if (candidate.includes(word)) return 3;
  const stop = new Set(["什么", "怎么", "今天", "最近", "一下", "你好", "我的", "你的", "我们", "可以", "是不是", "现在", "时候"]);
  const pairs = [...new Set(Array.from(search).slice(0, -1).map((_, index) => search.slice(index, index + 2)))].filter((pair) => !stop.has(pair));
  return memoryIntentScore(text, query) + pairs.reduce((score, pair) => score + Number(candidate.includes(pair)), 0);
}
