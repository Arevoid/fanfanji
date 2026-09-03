import type { MemoryItem } from "../../types";
import type {
  BehaviorCorrectionRecord,
  ConversationSummaryRecord,
  KnowledgeClaim,
  TruthStatus,
  TemporalStatus,
} from "../characterKnowledge/characterKnowledgeTypes";
import {
  memoryRecordFromBehaviorCorrection,
  memoryRecordFromConversationSummary,
  memoryRecordFromKnowledgeClaim,
  memoryRecordFromLegacyItem,
  type MemoryRecord,
  type MemoryRecordStatus,
  type MemorySourceApp,
} from "./memoryModel";

/** The user-facing categories used by the redesigned memory center. */
export type MemoryCenterRecordType = "truth" | "summary" | "rule" | "compatibility";

export interface MemoryCenterRecord extends MemoryRecord {
  recordType: MemoryCenterRecordType;
  truthStatus?: TruthStatus;
  temporalStatus?: TemporalStatus;
}

export const MEMORY_CENTER_TYPE_LABELS: Readonly<Record<MemoryCenterRecordType, string>> = {
  truth: "长期事实",
  summary: "对话摘要",
  rule: "规则记忆",
  compatibility: "兼容记忆",
};

export const MEMORY_CENTER_LAYER_LABELS: Readonly<Record<MemoryRecord["layer"], string>> = {
  temporary: "临时上下文",
  episodic: "长期经历",
  core: "核心记忆",
  rule: "行为规则",
};

export const MEMORY_CENTER_SOURCE_LABELS: Readonly<Record<MemorySourceApp, string>> = {
  chat: "聊天",
  offline: "线下故事",
  memory: "记忆库",
  moments: "朋友圈",
  notes: "备忘录",
  diary: "日记",
  cinema: "影视",
  schedule: "日程",
  forum: "论坛",
  "relationship-network": "关系网",
  music: "音乐",
  reading: "阅读",
  worldbook: "世界书",
  archives: "档案馆",
  system: "系统",
  legacy: "旧版数据",
};

export interface MemoryCenterFilter {
  recordType?: MemoryCenterRecordType | "all";
  characterId?: string | "all";
  relationId?: string | "all";
  sourceApp?: MemorySourceApp | "all";
  status?: MemoryRecordStatus | "all";
  searchQuery?: string;
}

const withType = (
  record: MemoryRecord,
  recordType: MemoryCenterRecordType,
  extra: Pick<MemoryCenterRecord, "truthStatus" | "temporalStatus"> = {},
): MemoryCenterRecord => ({ ...record, recordType, ...extra });

const projectCompatibilityStatus = (memory: MemoryItem, claims: readonly KnowledgeClaim[]): MemoryRecord["status"] => {
  const linkedClaims = claims.filter((claim) => memory.sourceKnowledgeClaimIds?.includes(claim.id));
  if (linkedClaims.some((claim) => claim.status === "retracted" || claim.truthStatus === "retracted")) return "retracted";
  if (linkedClaims.some((claim) => claim.supersededById)) return "superseded";
  return "active";
};

/**
 * Builds a read-only view for the memory center. It never rewrites stored data
 * and deliberately keeps the legacy compatibility records visible alongside
 * their canonical sources until the UI adds an explicit deduplication view.
 */
export function buildMemoryCenterRecords(input: {
  memories: readonly MemoryItem[];
  claims: readonly KnowledgeClaim[];
  summaries: readonly ConversationSummaryRecord[];
  corrections: readonly BehaviorCorrectionRecord[];
}): MemoryCenterRecord[] {
  const records: MemoryCenterRecord[] = [
    ...input.claims.map((claim) => withType(memoryRecordFromKnowledgeClaim(claim), "truth", {
      truthStatus: claim.truthStatus,
      temporalStatus: claim.temporalStatus,
    })),
    ...input.summaries.map((summary) => withType(memoryRecordFromConversationSummary(summary), "summary")),
    ...input.corrections.map((correction) => withType(memoryRecordFromBehaviorCorrection(correction), "rule")),
    ...input.memories.map((memory) => withType({
      ...memoryRecordFromLegacyItem(memory),
      status: projectCompatibilityStatus(memory, input.claims),
    }, "compatibility")),
  ];

  return records.sort((left, right) =>
    right.recordedAt - left.recordedAt || left.id.localeCompare(right.id));
}

export function countMemoryCenterRecords(records: readonly MemoryCenterRecord[]): Record<MemoryCenterRecordType, number> {
  return records.reduce<Record<MemoryCenterRecordType, number>>((counts, record) => {
    counts[record.recordType] += 1;
    return counts;
  }, { truth: 0, summary: 0, rule: 0, compatibility: 0 });
}

/** Applies every memory-center filter to the same canonical read model. */
export function filterMemoryCenterRecords(
  records: readonly MemoryCenterRecord[],
  filter: MemoryCenterFilter = {},
): MemoryCenterRecord[] {
  const query = filter.searchQuery?.trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (filter.recordType && filter.recordType !== "all" && record.recordType !== filter.recordType) return false;
    if (filter.characterId && filter.characterId !== "all" && record.scope.characterId !== filter.characterId) return false;
    if (filter.relationId && filter.relationId !== "all" && record.scope.relationId !== filter.relationId) return false;
    if (filter.sourceApp && filter.sourceApp !== "all" && record.provenance.app !== filter.sourceApp) return false;
    if (filter.status && filter.status !== "all" && record.status !== filter.status) return false;
    if (query && !`${record.content}\n${record.provenance.app}\n${record.recordType}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  });
}
