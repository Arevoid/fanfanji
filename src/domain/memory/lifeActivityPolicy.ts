/** Completion is conservative: an ambiguous proposal leaves the original plan pending. */
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s/gu, "");
const families = [
  ["读书", "看书", "聊书", "阅读", "读了", "读完", "书架", "旧书"],
  ["散步", "走路", "逛公园"], ["做饭", "烹饪", "炒菜"],
  ["画画", "绘画", "画作"], ["跑步", "慢跑"],
];
/** A review can resolve wording ambiguity, but cannot turn an explicitly failed
 * current step into a successful result. A different step's failure is separate. */
export function isExplicitLifeStepFailure(result: string, currentStep: string): boolean {
  const clauses=result.split(/[。；;，,\n]/u);
  const failure=/失败|没成功|未成功|没做成|没完成|没有完成|未完成|没能|未能/u;
  const named=clauses.filter(clause=>clause.includes(currentStep));
  return named.some(clause=>failure.test(clause)) || !named.length && /^(?:这次|结果|最后|还是|我)?(?:失败了?|没成功|未成功)[。！!\s]*$/u.test(result.trim());
}
export function isLifeCompletionCompatible(plan: string, result: string, people: readonly string[] = []): boolean {
  const before = normalize(plan); const after = normalize(result);
  // Negative, deferred and hypothetical results never establish completion.
  if (/失败|没成功|未成功|没做成|没(?:有|能|来得及)?|未(?:能|完成|开始)|不(?:曾|能|想|再)|取消|改天|推迟|准备|计划|打算|希望|如果|也许|可能|将要|明天/u.test(after)) return false;
  if (!/了|完|好|结束|完成|达成|实现|收尾/u.test(after)) return false;
  let topic = before.replace(/准备|计划|打算|明天|今天|最近|一起|独自|一个人|想要|将要|之后|然后/gu, "");
  for (const name of people.filter(Boolean)) topic = topic.replaceAll(normalize(name), "");
  const pairs = [...new Set(Array.from(topic).slice(0, -1).map((_, index) => topic.slice(index, index + 2)))];
  const matches = pairs.filter((pair) => after.includes(pair));
  if (topic.length >= 2 && after.includes(topic)) return true;
  if (matches.length >= 2) return true;
  // Short activity names may have no two matching bigrams after inflection.
  // Family bridges cannot substitute a different subtask (e.g. reading for shelving).
  if (/整理|分类|修理|清洁|打扫/u.test(before)) return matches.length >= 1 && /整理|分类|修理|清洁|打扫/u.test(after);
  return families.some((family) => family.some((word) => topic.includes(word)) && family.some((word) => after.includes(word)));
}
