import type { KnowledgeClaim, SemanticFactDecision } from "./characterKnowledgeTypes";
/** A narrow contradiction veto, not an entity resolver. Semantic proposals cannot
 * replace an old value when the same source explicitly says that value persists. */
export function sourceContradictsSemanticReplacement(target: KnowledgeClaim, decision: SemanticFactDecision, sourceTexts: readonly string[]): boolean {
  if (!["change", "correction"].includes(decision.operation)) return false;
  const clean = (text: string) => text.replace(/[\s\p{P}\p{S}]/gu, "").toLocaleLowerCase();
  const previous = clean(target.source.evidenceQuote || target.statement);
  const value = clean(decision.value);
  return sourceTexts.some((text) => text.split(/[。！？!?；;，,\n]/u).some((clause) => {
    if (!/仍|依然|还是|照旧|未变|不变|没有改变|still|unchanged/iu.test(clause)
      || /以前|过去|曾经|当时|之前|原先|不再|并非|不是|不叫/iu.test(clause)) return false;
    const current = clean(clause);
    let length = 0;
    while (length < previous.length && length < current.length && previous[previous.length - length - 1] === current[current.length - length - 1]) length++;
    const anchor = previous.slice(previous.length - length);
    return length >= 2 && !anchor.includes(value) && !value.includes(anchor);
  }));
}
