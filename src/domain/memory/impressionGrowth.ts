import { RELATIONSHIP_DIMENSIONS, createRelationshipDimensions, type RelationshipDimensions } from "../characterLife/relationshipGrowth";
interface ImpressionGrowthRecord { status: string; paused?: boolean; intervention?: boolean;
  confidence: number; growth?: Partial<RelationshipDimensions> }
export const canonicalImpressionTheme = (category: string) => {
  const key = category.normalize("NFKC").toLocaleLowerCase().replace(/\s/gu, "");
  const groups = [["关怀", "体贴", "温柔", "善意"], ["可靠", "信任", "可信", "可靠性"], ["开放", "亲近", "冷淡", "距离感"]];
  return groups.find((group) => group.includes(key))?.[0] || key;
};
export function normalizeImpressionGrowth(value: unknown): Partial<RelationshipDimensions> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Partial<RelationshipDimensions> = {};
  for (const dimension of RELATIONSHIP_DIMENSIONS) {
    const amount = (value as Record<string, unknown>)[dimension];
    if (typeof amount === "number" && Number.isFinite(amount)) result[dimension] = Math.max(-.03, Math.min(.03, amount));
  }
  return Object.keys(result).length ? result : undefined;
}
/** A reversible subjective overlay; it cannot promote the macro relationship stage. */
export function projectImpressionGrowth(current: RelationshipDimensions | undefined, impressions: readonly ImpressionGrowthRecord[]): RelationshipDimensions {
  const next = { ...(current || createRelationshipDimensions()) };
  const active = impressions.filter((record) => record.status === "active" && !record.paused && !record.intervention);
  for (const dimension of RELATIONSHIP_DIMENSIONS) {
    const delta = active.reduce((sum, record) => sum + (record.growth?.[dimension] ?? 0) * record.confidence, 0);
    next[dimension] = Math.max(0, Math.min(1, next[dimension] + Math.max(-.15, Math.min(.15, delta))));
  }
  return next;
}
