import type { KnowledgeClaim, KnowledgeSourceRef } from "./characterKnowledgeTypes";
export interface KnowledgeEvidenceContext {
  channel: "user_statement" | "confirmed_participation" | "product_action" | "hearsay" | "inference" | "legacy_unknown";
  statementAt?: number;
  eventDate?: string;
  datePrecision: "day" | "month" | "year" | "unknown";
  knownBy: string[];
}
export function describeKnowledgeEvidence(source: KnowledgeSourceRef, statement: string, characterId: string): KnowledgeEvidenceContext {
  const time = source.statementAt;
  let eventDate: string | undefined; let precision: KnowledgeEvidenceContext["datePrecision"] = "unknown";
  const explicit = statement.match(/\b(\d{4})[-年](\d{1,2})[-月](\d{1,2})(?:日)?/u);
  if (explicit) {
    const [year, month, day] = explicit.slice(1).map(Number); const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) { eventDate = date.toISOString().slice(0, 10); precision = "day"; }
  } else {
    // A timestamp alone cannot establish the speaker's local calendar day.
    // Relative expressions retain their statement-time anchor in the prompt.
    const month = statement.match(/\b(\d{4})[-年](\d{1,2})(?:月)?(?![-\d])/u);
    const year = statement.match(/\b(\d{4})年(?!\d)/u);
    if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) {
      eventDate = `${month[1]}-${month[2].padStart(2, "0")}`; precision = "month";
    } else if (year) { eventDate = year[1]; precision = "year"; }
  }
  const channel = source.interpretation?.acquisition === "hearsay" || /听说|据说|转述|告诉我|跟我说/u.test(source.evidenceQuote || statement) ? "hearsay"
    : source.interpretation?.acquisition === "inference" ? "inference"
    : source.kind === "offline_story" ? "confirmed_participation" : source.kind === "deterministic_action" ? "product_action"
    : ["legacy_memory", "import", "automatic_summary"].includes(source.kind) ? "legacy_unknown"
    : source.authorship === "user" ? "user_statement" : "inference";
  return { channel, ...(time !== undefined ? { statementAt: time } : {}), ...(eventDate ? { eventDate } : {}), datePrecision: precision, knownBy: [characterId] };
}
export function knowledgeEvidenceLabel(claim: KnowledgeClaim): string {
  if (claim.source.retainedSnapshot && ["reading", "cinema"].includes(claim.source.app || "") && claim.source.producer === "shared-media-archive.v1")
    return "用户确认保留的交流快照；作品情节非现实经历";
  const context = describeKnowledgeEvidence(claim.source, claim.statement, claim.characterId);
  const labels = { user_statement: "用户陈述，非角色亲眼观察", confirmed_participation: "已确认参与的剧情", product_action: "产品操作证据", hearsay: "转述，未证明原事件", inference: "推测，非客观事实", legacy_unknown: "旧资料，知情来源未明" };
  const interval = claim.source.interpretation?.interval;
  const roles = claim.perspective?.reportedRoles;
  return `${labels[context.channel]}${interval ? `；陈述中时间区间 ${interval.from} 至 ${interval.to}（不证明已发生）`
    : context.eventDate ? `；陈述中日期 ${context.eventDate}（${context.datePrecision}，不证明事件已发生）` : ""}${roles?.length
      ? `；原文角色解读：${roles.map((role) => `${({ actor: "行动者", participant: "参与者", observer: "目击者", informant: "转述者" })[role.role]}=${role.mention}`).join("、")}（不授予角色知情）` : ""}`;
}
