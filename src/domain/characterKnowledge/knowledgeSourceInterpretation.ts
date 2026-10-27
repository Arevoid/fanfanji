import type { KnowledgeSourceInterpretation } from "./characterKnowledgeTypes";
const day = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
export function normalizeKnowledgeSourceInterpretation(raw: unknown, evidence: string): KnowledgeSourceInterpretation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  const roles: KnowledgeSourceInterpretation["roles"] = Array.isArray(item.roles) ? item.roles.slice(0, 12).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.mention !== "string" || !entry.mention.trim() || entry.mention.length > 120
      || !["actor", "participant", "observer", "informant"].includes(entry.role)
      || typeof entry.quote !== "string" || !entry.quote.includes(entry.mention) || entry.quote.length > 2000 || !evidence.includes(entry.quote)) return [];
    return [{ mention: entry.mention, role: entry.role, quote: entry.quote }];
  }) : [];
  const interval = item.interval as Record<string, unknown> | undefined;
  const validInterval = interval && day(interval.from) && day(interval.to) && interval.from <= interval.to && typeof interval.quote === "string"
    && interval.quote.includes(interval.from) && interval.quote.includes(interval.to) && evidence.includes(interval.quote);
  const acquisition = ["self_report", "hearsay", "inference", "unknown"].includes(String(item.acquisition))
    && typeof item.acquisitionQuote === "string" && item.acquisitionQuote.trim() && evidence.includes(item.acquisitionQuote);
  return roles.length || validInterval || acquisition ? { roles,
    ...(acquisition ? { acquisition: item.acquisition as KnowledgeSourceInterpretation["acquisition"], acquisitionQuote: String(item.acquisitionQuote) } : {}),
    ...(validInterval ? { interval: { from: String(interval.from), to: String(interval.to), quote: String(interval.quote) } } : {}) } : undefined;
}
