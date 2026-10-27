import type { KnowledgeAssociation } from "./characterKnowledgeTypes";
export function normalizeKnowledgeAssociation(raw: unknown): KnowledgeAssociation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  if (!["targetId", "sourceQuote", "targetQuote", "reason"].every((key) => typeof item[key] === "string" && Boolean(item[key]) && (item[key] as string).length <= 2000)
    || !["same_event", "same_attribute", "historical_version", "duplicate"].includes(String(item.relation))
    || typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < .9 || item.confidence > 1
    || item.targetRevision !== undefined && typeof item.targetRevision !== "string") return undefined;
  return { targetId: String(item.targetId), relation: item.relation as KnowledgeAssociation["relation"], sourceQuote: String(item.sourceQuote), targetQuote: String(item.targetQuote),
    confidence: item.confidence, reason: String(item.reason), ...(typeof item.targetRevision === "string" ? { targetRevision: item.targetRevision } : {}) };
}
