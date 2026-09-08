import {
  createCharacterMemoryRepository,
  type CharacterMemoryReadKind,
  type CharacterMemoryReadRecord,
  type CharacterMemoryReadScope,
  type CharacterMemoryRepository,
} from "../../../domain/memory/CharacterMemoryRepository";

export type DirectChatMemoryDropReason =
  | "scope_mismatch"
  | "missing_scope"
  | "superseded"
  | "inactive"
  | "temporal_ineligible"
  | "missing_provenance"
  | "duplicate_source"
  | "canonical_mirror"
  | "live_source_duplicate"
  | "budget"
  | "legacy_low_authority";

export interface MemorySelectionDiagnostics {
  selectedCount: number;
  droppedCount: number;
  selectedByKind: Partial<Record<CharacterMemoryReadKind, number>>;
  droppedByReason: Partial<Record<DirectChatMemoryDropReason, number>>;
  duplicateGroups: string[][];
  unscopedLegacyCount: number;
  missingProvenanceCount: number;
  missingTemporalCount: number;
  estimatedSelectedCharacters: number;
  selectedReasons: Record<string, "truth_authority" | "source_backed" | "fallback_legacy" | "recent">;
}

export interface DirectChatMemoryView {
  records: CharacterMemoryReadRecord[];
  diagnostics: MemorySelectionDiagnostics;
}

export interface DirectChatMemoryViewInput {
  scope: CharacterMemoryReadScope;
  queryText?: string;
  liveSourceMessageIds?: readonly string[];
  liveSourceTexts?: readonly string[];
  maxItems?: number;
  maxCharacters?: number;
  now?: number;
  includeEvents?: boolean;
  repository?: CharacterMemoryRepository;
}

const authorityRank: Record<CharacterMemoryReadKind, number> = { truth: 4, event: 3, summary: 2, "legacy-memory": 1 };

const normalize = (value: string): string => value.toLocaleLowerCase().normalize("NFKC").replace(/\s+/gu, "").trim();
const tokens = (value: string): string[] => Array.from(new Set((value.match(/[\p{Script=Han}]{2,}|[a-z\d]{3,}/giu) || []).map(normalize).filter(Boolean)));
const count = <T extends string>(values: readonly T[]): Partial<Record<T, number>> => values.reduce<Partial<Record<T, number>>>((result, value) => {
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});

const addDrop = (
  diagnostics: MemorySelectionDiagnostics,
  reason: DirectChatMemoryDropReason,
) => {
  diagnostics.droppedCount += 1;
  diagnostics.droppedByReason[reason] = (diagnostics.droppedByReason[reason] || 0) + 1;
};

const hasSourceOverlap = (left: CharacterMemoryReadRecord, right: CharacterMemoryReadRecord): boolean => {
  const rightIds = new Set(right.sourceIds);
  return left.sourceIds.some((id) => rightIds.has(id));
};

export function buildDirectChatMemoryView(input: DirectChatMemoryViewInput): DirectChatMemoryView {
  const repository = input.repository || createCharacterMemoryRepository();
  const read = repository.readForScope(input.scope, input.now);
  const diagnostics: MemorySelectionDiagnostics = {
    selectedCount: 0,
    droppedCount: read.dropped.length,
    selectedByKind: {},
    droppedByReason: count(read.dropped.map((item) => item.reason) as DirectChatMemoryDropReason[]),
    duplicateGroups: [],
    unscopedLegacyCount: read.dropped.filter((item) => item.kind === "legacy-memory" && item.reason === "missing_scope").length,
    missingProvenanceCount: read.dropped.filter((item) => item.reason === "missing_provenance").length
      + read.records.filter((record) => record.sourceIds.length === 0).length,
    missingTemporalCount: 0,
    estimatedSelectedCharacters: 0,
    selectedReasons: {},
  };
  const liveIds = new Set((input.liveSourceMessageIds || []).filter(Boolean));
  const liveTexts = new Set((input.liveSourceTexts || []).map(normalize).filter(Boolean));
  const truthIds = new Set(read.records.filter((record) => record.kind === "truth").map((record) => record.id));
  const candidates = read.records
    .filter((record) => input.includeEvents === true || record.kind !== "event")
    .filter((record) => {
      if (record.kind === "legacy-memory" && record.canonicalMirrorOf?.some((id) => truthIds.has(id))) {
        addDrop(diagnostics, "canonical_mirror");
        return false;
      }
      if (record.sourceIds.some((id) => liveIds.has(id)) || liveTexts.has(normalize(record.content))) {
        addDrop(diagnostics, "live_source_duplicate");
        return false;
      }
      return true;
    })
    .map((record) => {
      const query = normalize(input.queryText || "");
      const matchingTokens = tokens(input.queryText || "").filter((token) => normalize(record.content).includes(token));
      const relevance = query && normalize(record.content).includes(query) ? 8 : matchingTokens.length * 2;
      return { record, relevance };
    })
    .sort((left, right) => right.relevance - left.relevance
      || authorityRank[right.record.kind] - authorityRank[left.record.kind]
      || (right.record.recordedAt || 0) - (left.record.recordedAt || 0)
      || left.record.id.localeCompare(right.record.id));

  const selected: CharacterMemoryReadRecord[] = [];
  const maxItems = Math.max(1, Math.floor(input.maxItems ?? 8));
  const maxCharacters = Math.max(120, Math.floor(input.maxCharacters ?? 4800));
  for (const candidate of candidates) {
    if (selected.length >= maxItems) {
      addDrop(diagnostics, "budget");
      continue;
    }
    const strongerSource = selected.find((item) => hasSourceOverlap(candidate.record, item));
    if (strongerSource) {
      const group = Array.from(new Set([strongerSource.id, candidate.record.id]));
      diagnostics.duplicateGroups.push(group);
      addDrop(diagnostics, candidate.record.kind === "summary" && strongerSource.kind === "truth" ? "duplicate_source" : "legacy_low_authority");
      continue;
    }
    const cost = Math.max(1, candidate.record.content.length);
    if (selected.length > 0 && diagnostics.estimatedSelectedCharacters + cost > maxCharacters) {
      addDrop(diagnostics, "budget");
      continue;
    }
    selected.push(candidate.record);
    diagnostics.selectedReasons[candidate.record.id] = candidate.record.kind === "truth"
      ? "truth_authority"
      : candidate.record.kind === "summary"
        ? "source_backed"
        : candidate.record.kind === "event" ? "recent" : "fallback_legacy";
  }

  diagnostics.duplicateGroups = diagnostics.duplicateGroups
    .filter((group, index, all) => index === all.findIndex((other) => other.join("\u0000") === group.join("\u0000")));
  diagnostics.selectedCount = selected.length;
  diagnostics.selectedByKind = count(selected.map((record) => record.kind));
  diagnostics.estimatedSelectedCharacters = selected.reduce((total, record) => total + record.content.length, 0);
  diagnostics.missingTemporalCount = read.records.filter((record) => record.scopeStatus === "exact"
    && record.temporalStatus === undefined && record.occurredAt === undefined && record.validFrom === undefined && record.validTo === undefined).length;
  return { records: selected, diagnostics };
}

export interface DirectChatExistingSelection {
  id: string;
  kind: CharacterMemoryReadKind;
  sourceIds?: readonly string[];
}

export interface DirectChatMemoryShadowComparison {
  productionSelectedIds: string[];
  shadowSelectedIds: string[];
  onlyInProduction: string[];
  onlyInShadow: string[];
  kindMismatches: Array<{ id: string; production: CharacterMemoryReadKind; shadow: CharacterMemoryReadKind }>;
  sourceMismatches: string[];
  shadowDiagnostics: MemorySelectionDiagnostics;
}

export function compareDirectChatMemoryShadow(
  production: readonly DirectChatExistingSelection[],
  shadow: DirectChatMemoryView,
): DirectChatMemoryShadowComparison {
  const shadowById = new Map(shadow.records.map((record) => [record.id, record]));
  const productionById = new Map(production.map((record) => [record.id, record]));
  const productionIds = production.map((record) => record.id);
  const shadowIds = shadow.records.map((record) => record.id);
  const onlyInProduction = productionIds.filter((id) => !shadowById.has(id));
  const onlyInShadow = shadowIds.filter((id) => !productionById.has(id));
  const kindMismatches = production
    .flatMap((record) => {
      const shadowRecord = shadowById.get(record.id);
      return shadowRecord && shadowRecord.kind !== record.kind
        ? [{ id: record.id, production: record.kind, shadow: shadowRecord.kind }]
        : [];
    });
  const sourceMismatches = production.flatMap((record) => {
    const shadowRecord = shadowById.get(record.id);
    return shadowRecord && record.sourceIds && record.sourceIds.join("\u0000") !== shadowRecord.sourceIds.join("\u0000") ? [record.id] : [];
  });
  return { productionSelectedIds: productionIds, shadowSelectedIds: shadowIds, onlyInProduction, onlyInShadow, kindMismatches, sourceMismatches, shadowDiagnostics: shadow.diagnostics };
}
