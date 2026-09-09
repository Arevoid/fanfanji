import type {
  CharacterMemoryAuthority,
  CharacterMemoryReadKind,
  CharacterMemoryReadRecord,
  CharacterMemoryReadScope,
  CharacterMemoryRepositorySources,
} from "../../../domain/memory/CharacterMemoryRepository";
import { createCharacterMemoryRepository } from "../../../domain/memory/CharacterMemoryRepository";
import type { CharacterTruthScope, ConversationSummaryRecord, KnowledgeClaim, KnowledgePromptProjection } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  buildDirectChatMemoryView,
  type DirectChatExistingSelection,
  type DirectChatMemoryDropReason,
  type DirectChatMemoryView,
  type DirectChatMemoryViewInput,
  type MemorySelectionDiagnostics,
} from "./directChatMemoryShadowView";

/**
 * Finite, deterministic classifications. These are provenance/selection
 * classifications only; no semantic or AI judgement is attempted here.
 */
export type DirectChatMemoryEquivalenceStatus =
  | "equivalent"
  | "equivalent_by_source"
  | "expected_legacy_difference"
  | "budget_difference"
  | "scope_difference"
  | "authority_difference"
  | "temporal_difference"
  | "unclassified_difference";

export type DirectChatMemoryDifferenceKind =
  | "canonical_mirror"
  | "live_source_duplicate"
  | "missing_provenance"
  | "missing_scope"
  | "scope_mismatch"
  | "temporal_ineligible"
  | "superseded"
  | "inactive"
  | "budget"
  | "authority"
  | "provenance_missing";

export interface DirectChatMemoryProductionSelection extends DirectChatExistingSelection {
  authority?: CharacterMemoryAuthority;
  scope?: Partial<CharacterMemoryReadScope>;
  scopeStatus?: CharacterMemoryReadRecord["scopeStatus"];
  temporalStatus?: string;
  status?: CharacterMemoryReadRecord["status"];
  recordedAt?: number;
  contentLength?: number;
  canonical?: boolean;
}

export interface DirectChatMemoryDifference {
  id: string;
  kind: DirectChatMemoryDifferenceKind;
  relatedId?: string;
  reason?: DirectChatMemoryDropReason;
}

export interface DirectChatMemoryAuthorityDifference {
  productionId: string;
  shadowId: string;
  productionKind: CharacterMemoryReadKind;
  shadowKind: CharacterMemoryReadKind;
  productionAuthority?: CharacterMemoryAuthority;
  shadowAuthority: CharacterMemoryAuthority;
}

export interface DirectChatMemoryScopeDifference {
  id: string;
  reason: "scope_mismatch" | "missing_scope";
}

export interface DirectChatMemoryTemporalDifference {
  id: string;
  reason: "temporal_ineligible" | "superseded" | "inactive";
  productionTemporalStatus?: string;
  shadowTemporalStatus?: string;
}

export interface DirectChatMemoryBudgetDifference {
  productionEstimatedCharacters: number;
  shadowEstimatedCharacters: number;
  firstDifferingRecord?: string;
  productionDroppedByBudget: number;
  shadowDroppedByBudget: number;
}

export interface DirectChatMemoryShadowComparison {
  equivalenceStatus: DirectChatMemoryEquivalenceStatus;
  productionSelectedCount: number;
  productionSelectedByKind: Partial<Record<CharacterMemoryReadKind, number>>;
  shadowSelectedCount: number;
  matchedIds: string[];
  productionOnlyIds: string[];
  shadowOnlyIds: string[];
  matchedSourceGroups: string[][];
  duplicateSourceGroups: string[][];
  authorityDifferences: DirectChatMemoryAuthorityDifference[];
  scopeDifferences: DirectChatMemoryScopeDifference[];
  temporalDifferences: DirectChatMemoryTemporalDifference[];
  budgetDifference?: DirectChatMemoryBudgetDifference;
  canonicalMirrorDifferences: DirectChatMemoryDifference[];
  liveSourceDuplicateDifferences: DirectChatMemoryDifference[];
  missingProvenanceDifferences: DirectChatMemoryDifference[];
  missingScopeDifferences: DirectChatMemoryDifference[];
  productionOnlyReasons: Record<string, DirectChatMemoryDifferenceKind[]>;
  productionEstimatedCharacters: number;
  shadowEstimatedCharacters: number;
  shadowDiagnostics: MemorySelectionDiagnostics;
}

export interface DirectChatMemoryShadowObservationInput {
  enabled: boolean;
  production: readonly DirectChatMemoryProductionSelection[];
  shadow: DirectChatMemoryViewInput;
}

export interface DirectReplyTruthShadowObservationInput {
  enabled: boolean;
  retrievalInput: {
    scope: CharacterTruthScope;
    claims: readonly KnowledgeClaim[];
    summaries: readonly ConversationSummaryRecord[];
    queryText?: string;
    alreadyPromptedMessageIds?: readonly string[];
    alreadyPromptedTexts?: readonly string[];
    limit?: number;
    maxCharacters?: number;
    now?: number;
  };
  result: {
    projection: KnowledgePromptProjection;
    summaries: readonly ConversationSummaryRecord[];
  };
  memories?: CharacterMemoryRepositorySources["memories"];
  events?: CharacterMemoryRepositorySources["events"];
  maxItems?: number;
  maxCharacters?: number;
}

const projectionClaims = (projection: KnowledgePromptProjection): KnowledgeClaim[] => Object.values(projection).flatMap((claims) => claims);

const claimSourceIds = (claim: KnowledgeClaim): string[] => Array.from(new Set([
  ...(claim.source.messageIds || []),
  claim.source.sourceRecordId,
  claim.source.eventId,
  claim.source.storyId,
].filter((value): value is string => Boolean(value))));

const claimSelection = (claim: KnowledgeClaim): DirectChatMemoryProductionSelection => ({
  id: claim.id,
  kind: "truth",
  sourceIds: claimSourceIds(claim),
  authority: "authoritative",
  scope: {
    characterId: claim.characterId,
    relationId: claim.relationId,
    userIdentityId: claim.userIdentityId,
    conversationId: claim.conversationId,
  },
  scopeStatus: "exact",
  temporalStatus: claim.temporalStatus,
  status: claim.supersededById ? "superseded" : claim.status === "retracted" ? "retracted" : "active",
  recordedAt: claim.recordedAt,
  contentLength: claim.statement.length,
  canonical: true,
});

const summarySelection = (summary: ConversationSummaryRecord): DirectChatMemoryProductionSelection => ({
  id: summary.id,
  kind: "summary",
  sourceIds: Array.from(new Set([
    ...summary.sourceMessageIds,
    ...summary.sourceClaimIds,
    summary.sourceRecordId,
  ].filter(Boolean))),
  authority: "derived",
  scope: {
    characterId: summary.characterId,
    relationId: summary.relationId,
    userIdentityId: summary.userIdentityId,
    conversationId: summary.conversationId,
  },
  scopeStatus: "exact",
  recordedAt: summary.generatedAt,
  contentLength: summary.summary.length,
  canonical: false,
});

/** Convert the existing Truth result into the same metadata shape as the shadow records. */
export function buildDirectChatProductionMemorySelection(input: {
  projection: KnowledgePromptProjection;
  summaries: readonly ConversationSummaryRecord[];
}): DirectChatMemoryProductionSelection[] {
  return [
    ...projectionClaims(input.projection).map(claimSelection),
    ...input.summaries.map(summarySelection),
  ];
}

const sourceOverlap = (left: { sourceIds?: readonly string[] }, right: { sourceIds: readonly string[] }): string[] => {
  const rightIds = new Set(right.sourceIds);
  return Array.from(new Set((left.sourceIds || []).filter((id) => rightIds.has(id))));
};

const addReason = (reasons: Record<string, DirectChatMemoryDifferenceKind[]>, id: string, kind: DirectChatMemoryDifferenceKind) => {
  const values = reasons[id] || [];
  if (!values.includes(kind)) values.push(kind);
  reasons[id] = values;
};

const droppedIds = (diagnostics: MemorySelectionDiagnostics, reason: DirectChatMemoryDropReason): string[] => diagnostics.droppedRecordIds[reason] || [];

const firstDifferingId = (productionIds: readonly string[], shadowIds: readonly string[]): string | undefined => {
  const length = Math.max(productionIds.length, shadowIds.length);
  for (let index = 0; index < length; index += 1) {
    if (productionIds[index] !== shadowIds[index]) return productionIds[index] || shadowIds[index];
  }
  return undefined;
};

const estimateProductionCharacters = (records: readonly DirectChatMemoryProductionSelection[]): number => records.reduce((total, record) => total + (record.contentLength || 0), 0);

export function compareDirectChatMemoryShadowDetailed(
  production: readonly DirectChatMemoryProductionSelection[],
  shadow: DirectChatMemoryView,
): DirectChatMemoryShadowComparison {
  const shadowById = new Map(shadow.records.map((record) => [record.id, record]));
  const productionById = new Map(production.map((record) => [record.id, record]));
  const productionSelectedIds = production.map((record) => record.id);
  const shadowSelectedIds = shadow.records.map((record) => record.id);
  const matchedIds = productionSelectedIds.filter((id) => shadowById.has(id));
  const productionOnlyIds = productionSelectedIds.filter((id) => !shadowById.has(id));
  const shadowOnlyIds = shadowSelectedIds.filter((id) => !productionById.has(id));
  const matchedSourceGroups: string[][] = [];
  const authorityDifferences: DirectChatMemoryAuthorityDifference[] = [];
  const scopeDifferences: DirectChatMemoryScopeDifference[] = [];
  const temporalDifferences: DirectChatMemoryTemporalDifference[] = [];
  const productionOnlyReasons: Record<string, DirectChatMemoryDifferenceKind[]> = {};
  const canonicalMirrorDifferences: DirectChatMemoryDifference[] = [];
  const liveSourceDuplicateDifferences: DirectChatMemoryDifference[] = [];
  const missingProvenanceDifferences: DirectChatMemoryDifference[] = [];
  const missingScopeDifferences: DirectChatMemoryDifference[] = [];

  for (const id of matchedIds) {
    const left = productionById.get(id)!;
    const right = shadowById.get(id)!;
    const overlap = sourceOverlap(left, right);
    if (overlap.length > 0) matchedSourceGroups.push(overlap);
    if (left.kind !== right.kind || left.authority !== right.authority) {
      authorityDifferences.push({
        productionId: left.id,
        shadowId: right.id,
        productionKind: left.kind,
        shadowKind: right.kind,
        productionAuthority: left.authority,
        shadowAuthority: right.authority,
      });
    }
    if (left.temporalStatus && right.temporalStatus && left.temporalStatus !== right.temporalStatus) {
      temporalDifferences.push({
        id,
        reason: "temporal_ineligible",
        productionTemporalStatus: left.temporalStatus,
        shadowTemporalStatus: right.temporalStatus,
      });
    }
  }

  for (const productionRecord of production.filter((record) => productionOnlyIds.includes(record.id))) {
    const shadowBySource = shadow.records.find((record) => sourceOverlap(productionRecord, record).length > 0
      || (productionRecord.kind === "legacy-memory" && productionRecord.sourceIds?.includes(record.id)));
    const sourceMatch = shadowBySource ? sourceOverlap(productionRecord, shadowBySource) : [];
    if (sourceMatch.length > 0) matchedSourceGroups.push(sourceMatch);
    const canonicalMirror = productionRecord.kind === "legacy-memory"
      && shadowBySource?.kind === "truth"
      && (productionRecord.sourceIds?.includes(shadowBySource.id) || sourceMatch.length > 0);
    if (canonicalMirror) {
      if (shadowBySource && productionRecord.sourceIds?.includes(shadowBySource.id)) {
        matchedSourceGroups.push([shadowBySource.id]);
      }
      const difference = {
        id: productionRecord.id,
        kind: "canonical_mirror" as const,
        relatedId: shadowBySource?.id,
      };
      canonicalMirrorDifferences.push(difference);
      addReason(productionOnlyReasons, productionRecord.id, "canonical_mirror");
      continue;
    }
    const droppedReason = (Object.keys(shadow.diagnostics.droppedRecordIds) as DirectChatMemoryDropReason[])
      .find((reason) => droppedIds(shadow.diagnostics, reason).includes(productionRecord.id));
    if (droppedReason === "canonical_mirror") {
      const difference = { id: productionRecord.id, kind: "canonical_mirror" as const, reason: droppedReason, relatedId: shadowBySource?.id };
      canonicalMirrorDifferences.push(difference);
      addReason(productionOnlyReasons, productionRecord.id, "canonical_mirror");
    } else if (droppedReason === "live_source_duplicate") {
      const difference = { id: productionRecord.id, kind: "live_source_duplicate" as const, reason: droppedReason };
      liveSourceDuplicateDifferences.push(difference);
      addReason(productionOnlyReasons, productionRecord.id, "live_source_duplicate");
    } else if (droppedReason === "missing_provenance") {
      const difference = { id: productionRecord.id, kind: "missing_provenance" as const, reason: droppedReason };
      missingProvenanceDifferences.push(difference);
      addReason(productionOnlyReasons, productionRecord.id, "missing_provenance");
    } else if (droppedReason === "missing_scope" || droppedReason === "scope_mismatch") {
      const difference = { id: productionRecord.id, kind: droppedReason as "missing_scope" | "scope_mismatch", reason: droppedReason };
      missingScopeDifferences.push(difference);
      scopeDifferences.push({ id: productionRecord.id, reason: droppedReason });
      addReason(productionOnlyReasons, productionRecord.id, droppedReason);
    } else if (droppedReason === "temporal_ineligible" || droppedReason === "superseded" || droppedReason === "inactive") {
      temporalDifferences.push({ id: productionRecord.id, reason: droppedReason, productionTemporalStatus: productionRecord.temporalStatus });
      addReason(productionOnlyReasons, productionRecord.id, droppedReason);
    }
  }

  // A source-equivalent projection can have different IDs. Prefer explicit
  // Truth authority over a derived Summary, but never call this semantic
  // equivalence without shared provenance.
  for (const shadowRecord of shadow.records.filter((record) => shadowOnlyIds.includes(record.id))) {
    const productionBySharedSource = production.find((record) => sourceOverlap(record, shadowRecord).length > 0);
    if (!productionBySharedSource) continue;
    const overlap = sourceOverlap(productionBySharedSource, shadowRecord);
    matchedSourceGroups.push(overlap);
    if (productionBySharedSource.kind !== shadowRecord.kind || productionBySharedSource.authority !== shadowRecord.authority) {
      authorityDifferences.push({
        productionId: productionBySharedSource.id,
        shadowId: shadowRecord.id,
        productionKind: productionBySharedSource.kind,
        shadowKind: shadowRecord.kind,
        productionAuthority: productionBySharedSource.authority,
        shadowAuthority: shadowRecord.authority,
      });
    }
  }

  const uniqueGroups = (groups: readonly string[][]): string[][] => groups
    .map((group) => [...new Set(group)].sort())
    .filter((group, index, all) => group.length > 0 && index === all.findIndex((other) => other.join("\u0000") === group.join("\u0000")));
  const sourceGroups = uniqueGroups(matchedSourceGroups);
  const shadowBudgetCount = shadow.diagnostics.droppedByReason.budget || 0;
  const shadowMissingProvenanceIds = shadow.records.filter((record) => record.sourceIds.length === 0).map((record) => record.id);
  for (const id of shadowMissingProvenanceIds) {
    if (!missingProvenanceDifferences.some((difference) => difference.id === id)) {
      missingProvenanceDifferences.push({ id, kind: "missing_provenance" });
    }
  }
  const productionEstimatedCharacters = estimateProductionCharacters(production);
  const shadowEstimatedCharacters = shadow.diagnostics.estimatedSelectedCharacters;
  const hasBudgetDifference = shadowBudgetCount > 0 && productionOnlyIds.length + shadowOnlyIds.length > 0;
  const budgetDifference = hasBudgetDifference
    ? {
      productionEstimatedCharacters,
      shadowEstimatedCharacters,
      firstDifferingRecord: firstDifferingId(productionSelectedIds, shadowSelectedIds),
      productionDroppedByBudget: 0,
      shadowDroppedByBudget: shadowBudgetCount,
    }
    : undefined;

  let equivalenceStatus: DirectChatMemoryEquivalenceStatus = "equivalent";
  if (authorityDifferences.length > 0) equivalenceStatus = "authority_difference";
  else if (scopeDifferences.length > 0) equivalenceStatus = "scope_difference";
  else if (temporalDifferences.length > 0) equivalenceStatus = "temporal_difference";
  else if (budgetDifference) equivalenceStatus = "budget_difference";
  else if (canonicalMirrorDifferences.length > 0 && productionOnlyIds.length > 0) equivalenceStatus = "expected_legacy_difference";
  else if (sourceGroups.length > 0 && (productionOnlyIds.length > 0 || shadowOnlyIds.length > 0)) equivalenceStatus = "equivalent_by_source";
  else if (productionOnlyIds.length > 0 || shadowOnlyIds.length > 0) equivalenceStatus = "unclassified_difference";

  return {
    equivalenceStatus,
    productionSelectedCount: production.length,
    productionSelectedByKind: production.reduce<Partial<Record<CharacterMemoryReadKind, number>>>((counts, record) => {
      counts[record.kind] = (counts[record.kind] || 0) + 1;
      return counts;
    }, {}),
    shadowSelectedCount: shadow.records.length,
    matchedIds,
    productionOnlyIds,
    shadowOnlyIds,
    matchedSourceGroups: sourceGroups,
    duplicateSourceGroups: uniqueGroups(shadow.diagnostics.duplicateGroups),
    authorityDifferences,
    scopeDifferences,
    temporalDifferences,
    ...(budgetDifference ? { budgetDifference } : {}),
    canonicalMirrorDifferences,
    liveSourceDuplicateDifferences,
    missingProvenanceDifferences,
    missingScopeDifferences,
    productionOnlyReasons,
    productionEstimatedCharacters,
    shadowEstimatedCharacters,
    shadowDiagnostics: shadow.diagnostics,
  };
}

/**
 * Opt-in observation adapter. Disabled is a strict guard: no repository read,
 * iteration, sorting, allocation, diagnostics, or persistence occurs.
 */
export function observeDirectChatMemoryShadow(
  input: DirectChatMemoryShadowObservationInput,
): DirectChatMemoryShadowComparison | undefined {
  if (!input.enabled) return undefined;
  const shadow = buildDirectChatMemoryView(input.shadow);
  return compareDirectChatMemoryShadowDetailed(input.production, shadow);
}

export function observeDirectReplyTruthMemoryShadow(
  input: DirectReplyTruthShadowObservationInput,
): DirectChatMemoryShadowComparison | undefined {
  if (!input.enabled) return undefined;
  const sourceOverrides: Partial<CharacterMemoryRepositorySources> = {
    claims: input.retrievalInput.claims,
    summaries: input.retrievalInput.summaries,
    memories: input.memories || [],
    events: input.events || [],
  };
  return observeDirectChatMemoryShadow({
    enabled: true,
    production: buildDirectChatProductionMemorySelection(input.result),
    shadow: {
      scope: input.retrievalInput.scope,
      queryText: input.retrievalInput.queryText,
      liveSourceMessageIds: input.retrievalInput.alreadyPromptedMessageIds,
      liveSourceTexts: input.retrievalInput.alreadyPromptedTexts,
      maxItems: input.maxItems ?? input.retrievalInput.limit,
      maxCharacters: input.maxCharacters ?? input.retrievalInput.maxCharacters,
      now: input.retrievalInput.now,
      repository: createCharacterMemoryRepository(sourceOverrides),
    },
  });
}
