import type { KnowledgeKind, KnowledgeWriteCandidate, TemporalStatus } from "./characterKnowledgeTypes";

export interface KnowledgeLanguageCues {
  conditional: boolean;
  future: boolean;
  question: boolean;
  suggestion: boolean;
  roleplayOrAction: boolean;
  systemInstruction: boolean;
}

const CONDITIONAL_PATTERN = /(?:\bif\b|\bmaybe\b|\bperhaps\b|\bpossibly\b|如果|假如|也许|可能)/iu;
const FUTURE_PATTERN = /(?:\bwill\b|\bplan(?:ning)?\b|\bhope(?:fully)?\b|\bsomeday\b|\bin the future\b|以后|将来|希望|计划|打算)/iu;
const SUGGESTION_PATTERN = /(?:\bshould\b|\bcould you\b|\bwhy don't\b|建议|不如|要不|应该)/iu;
const SYSTEM_INSTRUCTION_PATTERN = /(?:\bsystem\s*(?:prompt|instruction)\b|忽略.{0,8}(?:指令|设定)|系统指令)/iu;
const ROLEPLAY_PATTERN = /^\s*(?:\([^\n]+\)|（[^\n]+）|\[[^\n]+\]|【[^\n]+】|\*[^\n]+\*)\s*$/u;

export function inspectKnowledgeLanguageCues(statement: string): KnowledgeLanguageCues {
  const text = statement.trim();
  return {
    conditional: CONDITIONAL_PATTERN.test(text),
    future: FUTURE_PATTERN.test(text),
    question: /[?？]\s*$/u.test(text),
    suggestion: SUGGESTION_PATTERN.test(text),
    roleplayOrAction: ROLEPLAY_PATTERN.test(text),
    systemInstruction: SYSTEM_INSTRUCTION_PATTERN.test(text),
  };
}

export function normalizeKnowledgeTemporalSemantics(
  candidate: Pick<KnowledgeWriteCandidate, "kind" | "temporalStatus" | "statement">,
): { kind: KnowledgeKind; temporalStatus: TemporalStatus; adjustments: string[] } {
  const cues = inspectKnowledgeLanguageCues(candidate.statement);
  if (cues.conditional) {
    return {
      kind: "hypothesis",
      temporalStatus: cues.future ? "future" : "unknown",
      adjustments: ["conditional_to_hypothesis"],
    };
  }
  if (cues.future || candidate.kind === "plan") {
    return { kind: "plan", temporalStatus: "future", adjustments: ["future_to_plan"] };
  }
  return { kind: candidate.kind, temporalStatus: candidate.temporalStatus, adjustments: [] };
}

export function isKnowledgeTemporallyActive(
  claim: { status: string; validFrom?: number; validTo?: number },
  now = Date.now(),
): boolean {
  if (claim.status !== "active") return false;
  if (claim.validFrom !== undefined && claim.validFrom > now) return false;
  if (claim.validTo !== undefined && claim.validTo <= now) return false;
  return true;
}

export function temporalStatusLabel(status: TemporalStatus): string {
  const labels: Record<TemporalStatus, string> = {
    past: "过去",
    present: "现在",
    future: "未来",
    timeless: "长期",
    unknown: "时间未核定",
  };
  return labels[status];
}
