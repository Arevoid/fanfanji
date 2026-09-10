import assert from "node:assert/strict";
import {
  clearDirectChatMemoryLongEvidenceCollector,
  clearDirectChatMemoryLongEvidenceWindow,
  combineLongEvidenceExports,
  configureDirectChatMemoryLongEvidenceCollector,
  createDirectChatMemoryLongEvidenceWindowToken,
  exportDirectChatMemoryLongEvidenceJson,
  finishDirectChatMemoryLongEvidenceWindow,
  getDirectChatMemoryLongEvidenceRecords,
  recordDirectChatMemoryLongEvidence,
  resumeDirectChatMemoryLongEvidenceWindow,
  startDirectChatMemoryLongEvidenceWindow,
  type DirectChatMemoryLongEvidenceInput,
  type DirectChatMemoryLongEvidenceExport,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";

const tokenA = createDirectChatMemoryLongEvidenceWindowToken();
const tokenB = createDirectChatMemoryLongEvidenceWindowToken();
const baseScope = {
  characterId: "char-a",
  relationId: "relation-a",
  userIdentityId: "user-a",
  conversationId: "conversation-a",
};
const suppressionCandidate = {
  featureScope: "automatic_direct_chat",
  canaryReason: "SAFETY_VETO_CANCELLED_PLAN",
  validatorResult: "allow_veto",
  validatorReason: "SAFETY_VETO_CANCELLED_PLAN",
  bridgeState: "safety_veto",
  bridgeReason: "cancelled_plan_not_active",
  correlationClass: "shared_unique",
  lineageStatus: "shared",
  pairUnique: true,
  exactScope: true,
  provenanceTrusted: true,
  metadataSource: "v2_model_native",
  semanticKind: "plan",
  planLifecycle: "cancelled",
  legacyAccepted: true,
  legacyWriteEligible: true,
  candidateSuppressed: true,
  vetoedCandidateCanonicalAbsent: true,
  failOpen: false,
};
const batch = {
  batchAcceptedBefore: 1,
  batchAcceptedAfter: 0,
  batchZeroCandidates: true,
  survivingCanonicalWritesExpected: false,
  survivingCanonicalWritesObserved: true,
  cursorAdvanced: true,
  canonicalWriteCountDelta: 0,
  summaryDelta: 0,
  projectionDelta: 0,
};
const accounting = {
  providerLogicalRequestCount: 1,
  providerPhysicalAttemptCount: 1,
  accountingShape: "single_row" as const,
  promptDelta: 0,
  canaryProviderDelta: 0,
};
const performance = {
  extractionLatencyBucket: "0_5s" as const,
  canaryFilteringLatencyBucket: "0_10ms" as const,
  privacyStatus: "metadata_only" as const,
};

function input(overrides: Partial<DirectChatMemoryLongEvidenceInput> = {}): DirectChatMemoryLongEvidenceInput {
  return {
    scope: { ...baseScope },
    candidate: { ...suppressionCandidate },
    batch: { ...batch },
    accounting: { ...accounting },
    performance: { ...performance },
    ...overrides,
  };
}

function parseExport(value: string): DirectChatMemoryLongEvidenceExport {
  return JSON.parse(value) as DirectChatMemoryLongEvidenceExport;
}

try {
  // Production default remains OFF and dry-run records cannot enter formal counts.
  configureDirectChatMemoryLongEvidenceCollector({ enabled: false });
  clearDirectChatMemoryLongEvidenceWindow();
  clearDirectChatMemoryLongEvidenceCollector();
  assert.equal(startDirectChatMemoryLongEvidenceWindow(tokenA), null); // 30: production default OFF
  configureDirectChatMemoryLongEvidenceCollector({ enabled: true, explicitDebug: true });
  assert.equal(startDirectChatMemoryLongEvidenceWindow(tokenA), 1);

  const sessionARecord = recordDirectChatMemoryLongEvidence(input({
    logicalActionId: "logical-action-a",
    candidateObservationOrdinal: 1,
  }));
  assert.ok(sessionARecord);
  assert.match(sessionARecord!.windowFingerprint!, /^window-[0-9a-f]{16}$/); // 4: window fingerprint exists
  assert.match(sessionARecord!.sessionFingerprint, /^session-[0-9a-f]{16}$/); // 10: session fingerprint exists
  assert.match(sessionARecord!.evidenceRecordFingerprint, /^evidence-[0-9a-f]{16}$/); // 18: observation fingerprint exists
  assert.equal(sessionARecord!.windowFingerprint, recordDirectChatMemoryLongEvidence(input({
    logicalActionId: "logical-action-a",
    candidateObservationOrdinal: 2,
  }))!.windowFingerprint); // 5: same token is stable
  assert.notEqual(tokenA, tokenB); // 6: generated tokens are distinct
  assert.ok(tokenA.length >= 24 && new Set(tokenA).size >= 10); // 9: high-entropy helper output

  const exportA = exportDirectChatMemoryLongEvidenceJson();
  const parsedA = parseExport(exportA);
  assert.equal(parsedA.records.length, getDirectChatMemoryLongEvidenceRecords().length);
  assert.doesNotMatch(exportA, new RegExp(tokenA)); // 7: raw window token absent
  assert.doesNotMatch(exportA, /sessionNonce|windowToken|logicalActionId|char-a|relation-a|user-a|conversation-a/); // 26/27/40/41/42: privacy

  // A finish/re-entry simulates a reload: the developer re-enters the same token,
  // receives a new nonce/fingerprint, and retains no reliance on an ordinal.
  const sessionAFingerprint = sessionARecord!.sessionFingerprint;
  finishDirectChatMemoryLongEvidenceWindow();
  clearDirectChatMemoryLongEvidenceCollector();
  assert.equal(resumeDirectChatMemoryLongEvidenceWindow(tokenA), 2);
  const sessionBRecord = recordDirectChatMemoryLongEvidence(input({
    scope: { ...baseScope, conversationId: "conversation-b" },
    logicalActionId: "logical-action-b",
    candidateObservationOrdinal: 1,
  }));
  assert.ok(sessionBRecord);
  assert.equal(sessionBRecord!.windowFingerprint, sessionARecord!.windowFingerprint); // 8/9: same window across reload
  assert.notEqual(sessionBRecord!.sessionFingerprint, sessionAFingerprint); // 11/12/13: new session is unique
  const exportB = exportDirectChatMemoryLongEvidenceJson();
  const combined = combineLongEvidenceExports([exportA, exportB]);
  assert.equal(combined.status, "ok");
  assert.equal(combined.windowCount, 1); // 15: window keyed by fingerprint
  assert.equal(combined.formalSessionCount, 2); // 14/27: session count keyed by fingerprint
  assert.equal(combined.distinctExactScopeCount, 2); // 24/25/28: same/different scopes
  assert.equal(combined.extractionBatchCount, 2); // 16/29: distinct batches
  assert.equal(combined.validSuppressionCount, 3); // candidate-level, without export inflation

  // Same session/batch observation fingerprints are stable; candidate ordinals distinguish A/B.
  const recordsA = parsedA.records;
  assert.notEqual(recordsA[0].evidenceRecordFingerprint, recordsA[1].evidenceRecordFingerprint); // 15: candidate observations differ
  assert.equal(recordsA[0].batchActionFingerprint, recordsA[1].batchActionFingerprint); // 16: same batch shares fingerprint
  const repeated = combineLongEvidenceExports([exportA, exportA]);
  assert.equal(repeated.formalSessionCount, 1); // 20: repeated session export does not inflate
  assert.equal(repeated.extractionBatchCount, 1); // 17/21: repeated batch export does not inflate
  assert.equal(repeated.validSuppressionCount, 2); // 13/18/22: evidence record dedup

  // Duplicate local ordinals do not merge authoritative sessions.
  const duplicateOrdinalExport = parseExport(exportB);
  duplicateOrdinalExport.records.forEach((record) => { record.sessionOrdinal = 1; });
  assert.equal(combineLongEvidenceExports([exportA, duplicateOrdinalExport]).formalSessionCount, 2); // 1/2/3/11: ordinal is debug only

  // Deterministic day calculation is based on distinct UTC calendar dates represented.
  const dayExport = parseExport(exportA);
  dayExport.records[0].evidenceDay = "2026-09-01";
  dayExport.records[1].evidenceDay = "2026-09-03";
  const dayReview = combineLongEvidenceExports([dayExport]);
  assert.equal(dayReview.firstEvidenceDay, "2026-09-01"); // 34
  assert.equal(dayReview.lastEvidenceDay, "2026-09-03"); // 35
  assert.equal(dayReview.calendarDaySpan, 2); // 28/33: distinct-date span

  // A second window is explicitly rejected rather than joined by scope/action values.
  clearDirectChatMemoryLongEvidenceWindow();
  assert.equal(startDirectChatMemoryLongEvidenceWindow(tokenB), 3);
  recordDirectChatMemoryLongEvidence(input({ logicalActionId: "logical-action-c" }));
  const exportC = exportDirectChatMemoryLongEvidenceJson();
  const mixed = combineLongEvidenceExports([exportA, exportC]);
  assert.equal(mixed.status, "mixed_window"); // 23: mixed windows rejected
  assert.equal(mixed.windowCount, 2); // 26: cross-window scopes remain unlinkable

  const malformed = combineLongEvidenceExports(["{bad-json", exportA]);
  assert.equal(malformed.status, "malformed"); // 23/37: malformed exports excluded/reported
  assert.equal(malformed.malformedExportCount, 1);

  // Conflicting duplicate accounting is preserved, never first/last-wins.
  const conflictExport = parseExport(exportA);
  conflictExport.records[0].providerPhysicalAttemptCount = 99;
  const conflict = combineLongEvidenceExports([exportA, conflictExport]);
  assert.ok(conflict.accountingConflictCount >= 1); // 25/38: accounting conflict preserved

  // Safety incidents survive review and are not silently upgraded to suppression.
  clearDirectChatMemoryLongEvidenceCollector();
  const incident = recordDirectChatMemoryLongEvidence(input({
    logicalActionId: "logical-incident",
    candidate: { ...suppressionCandidate, vetoedCandidateCanonicalAbsent: false },
  }));
  assert.equal(incident?.classification, "SAFETY_INCIDENT");
  const incidentReview = combineLongEvidenceExports([parseExport(exportDirectChatMemoryLongEvidenceJson())]);
  assert.equal(incidentReview.safetyIncidentCount, 1); // 24/39: incidents preserved

  // Dry-run records remain observations only; no formal window/session/scope is counted.
  finishDirectChatMemoryLongEvidenceWindow();
  clearDirectChatMemoryLongEvidenceCollector();
  const dry = recordDirectChatMemoryLongEvidence(input({ logicalActionId: "dry-run-action" }));
  assert.equal(dry?.windowFingerprint, null);
  const dryReview = combineLongEvidenceExports([parseExport(exportDirectChatMemoryLongEvidenceJson())]);
  assert.equal(dryReview.windowCount, 0); // 29/30: dry-run cannot enter formal
  assert.equal(dryReview.formalSessionCount, 0);

  console.log("PASS formal evidence window identity: stable fingerprints, reload sessions, deduped exports, mixed-window rejection, privacy, incidents, and day review");
} finally {
  configureDirectChatMemoryLongEvidenceCollector({ enabled: false });
  clearDirectChatMemoryLongEvidenceCollector();
  clearDirectChatMemoryLongEvidenceWindow();
}
