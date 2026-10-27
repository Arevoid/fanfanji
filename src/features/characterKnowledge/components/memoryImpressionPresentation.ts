import type { CharacterImpression } from "../../../domain/memory/characterContinuity";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";

/** Display wording only: do not synthesize feelings or write back to memory. */
export function impressionDisplayText(text: string): string {
  return text.trim()
    .replace(/在亲密关系中表现得/gu, "在亲密的时候挺")
    .replace(/用户|对方/gu, "你")
    .replace(/表现得/gu, "显得")
    .replace(/性格挺跳脱有趣的/gu, "挺跳脱，也挺有趣的")
    .replace(/直接而大胆/gu, "直接，也很大胆")
    .replace(/会通过消息/gu, "会在消息里")
    .replace(/主动引导我/gu, "主动带着我")
    .replace(/发生更深层的亲密接触/gu, "更亲密地相处")
    .replace(/无厘头、搞笑的玩梗动态/gu, "无厘头、逗人的动态");
}

/** A first impression or a user correction is not evidence of character growth. */
export function impressionChangeEntries(records: readonly CharacterImpression[], history: readonly CharacterImpression[]) {
  return records.filter(record => record.status === "active" && !record.intervention && !record.resolvedById)
    .flatMap(record => {
      const previous = history.find(item => item.id === record.supersedesId && isExactTruthScope(item.scope, record.scope));
      if (!previous || previous.proposition.trim() === record.proposition.trim()) return [];
      return [{ id: record.id, time: record.recordedAt, label: "对你的看法变了",
        text: `起初，${impressionDisplayText(previous.proposition)}\n后来，${impressionDisplayText(record.proposition)}` }];
    });
}
