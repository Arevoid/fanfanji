import { Character, Message, UserSettings } from "../../../types";
import type { MemoryArchiveStats } from "../../../types";
import type { ConversationSummaryRecord } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { useRef } from "react";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { createId } from "../../../core/id/createId";
import { appendMany as appendKnowledgeClaims, loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { conversationSummaryRepository } from "../../../core/storage/repositories/conversationSummaryRepository";
import { createConversationSummaryRecord } from "../../characterKnowledge/services/conversationSummaryService";
import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { MemoryService, formatDelicateMemoryDiary, formatExtractedMemorySummary } from "../../../domain/memory/MemoryService";
import { commitMemoryWriteBundle } from "../../../domain/memory/memoryWriteCoordinator";
import { buildCanonicalMemoryCommitSnapshot, type CanonicalMemoryCommitSnapshot } from "../../../domain/memory/canonicalMemoryCommitSnapshot";
import { resolveDirectChatSummaryCutover, type DirectChatSummaryCutoverDecision } from "../../../domain/memory/directChatSummaryCutoverPolicy";
import {
  enqueueConversationSummaryProjection,
  type MemoryProjectionEnqueueResult,
} from "../../../core/memory/memoryProjectionEnqueue";
import { apiChat, apiExtractMemoriesWithModelFallback } from "../../../utils/apiHelper";
import { createAiActionId } from "../../../core/monitoring/aiRequestLedger";
import { observeDirectChatMemoryAdmissionShadow } from "../services/directChatMemoryAdmissionShadow";
import {
  isDirectChatMemoryAdmissionShadowEvidenceEnabled,
  recordDirectChatMemoryAdmissionShadowEvidence,
} from "../services/directChatMemoryAdmissionShadowTelemetry";
import {
  configureDirectChatMemorySafetyVetoShadow,
  evaluateDirectChatSafetyVetoShadowForExtraction,
  isDirectChatMemorySafetyVetoShadowEnabled,
} from "../services/directChatMemorySafetyVetoShadow";
import {
  applyDirectChatMemorySafetyVetoCanary,
  isDirectChatMemorySafetyVetoCanaryEnabled,
  type DirectChatMemorySafetyVetoCanaryResult,
} from "../services/directChatMemorySafetyVetoCanary";
import type { DirectChatMemoryAdmissionShadowResult } from "../services/directChatMemoryAdmissionShadow";
import type { DirectChatMemorySafetyVetoShadowEvaluation } from "../services/directChatMemorySafetyVetoShadow";
import {
  getDirectChatMemoryLongEvidenceCollectorInstanceOrdinal,
  getDirectChatMemoryLongEvidenceSummary,
  isDirectChatMemoryLongEvidenceCollectorEnabled,
  observeDirectChatMemoryLongEvidenceRuntime,
  readDirectChatMemoryCanonicalReadback,
} from "../services/directChatMemoryLongEvidenceRuntime";
import { recordDirectChatMemoryEvidenceTrace } from "../services/directChatMemoryEvidenceTrace";

type DirectScope = { characterId: string; relationId: string; userIdentityId: string; conversationId: string };

export type MemoryExtractionPersistenceMode = "production_equivalent_write" | "observation_only";

export interface MemoryExtractionRunOptions {
  persistenceMode?: MemoryExtractionPersistenceMode;
  /** Dev-only characterization may opt into the additive V2 prompt. */
  enableV2Metadata?: boolean;
}

export interface MemoryExtractionRunDiagnostics {
  status: "completed" | "ACTIVE_DIRECT_SCOPE_UNAVAILABLE" | "NO_MESSAGES" | "FAILED";
  scopeAvailable: boolean;
  messageCount: number;
  providerRequestObserved: boolean;
  candidateCount: number;
  persistenceMode: MemoryExtractionPersistenceMode;
}

/**
 * Selects only the part of a chat that has not crossed the last successful
 * archive marker. An explicit message list is used by the automatic pipeline
 * and is already scoped by its caller, so it bypasses the marker lookup.
 */
export function selectUnarchivedChatMessages(
  messages: readonly Message[],
  lastArchivedMessageId?: string,
  explicitMessages?: readonly Message[],
): Message[] {
  const candidates = Array.from(explicitMessages || messages);
  if (explicitMessages || !lastArchivedMessageId) return candidates;

  const markerIndex = candidates.findIndex((message) => message.id === lastArchivedMessageId);
  // If the marker is not in the loaded scope (for example, after an old
  // cleanup), reprocess the loaded scope. The canonical writer and memory
  // merge policy keep this recoverable and avoid losing unarchived content.
  return markerIndex === -1 ? candidates : candidates.slice(markerIndex + 1);
}

export function splitChatArchiveBatches(messages: readonly Message[], batchSize: number): Message[][] {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: Message[][] = [];
  for (let index = 0; index < messages.length; index += safeBatchSize) {
    batches.push(Array.from(messages.slice(index, index + safeBatchSize)));
  }
  return batches;
}

export interface ChatMemoryExtractionOptions {
  activeChatCharId?: string | null;
  activeCharacter?: Character | null;
  activeDirectScope?: DirectScope | null;
  currentChatMessages: Message[];
  memories?: any[] | null;
  settings: UserSettings;
  recallSettings?: any;
  setIsCompressingMemory: (value: boolean) => void;
  onSaveMemories: (memories: any[]) => void;
  onSaveRelationships?: (updater: (previous: CharacterRelationship[]) => CharacterRelationship[]) => void;
  onUpdateCharacter?: (characterId: string, patch: Partial<Character>) => void | Promise<boolean>;
  groupMembers?: readonly Character[];
  characters?: readonly Character[];
  relationships?: readonly CharacterRelationship[];
  activeIdentityId?: string;
}

export function useChatMemoryExtraction({
  activeChatCharId,
  activeCharacter,
  activeDirectScope,
  currentChatMessages,
  memories,
  settings,
  recallSettings,
  setIsCompressingMemory,
  onSaveMemories,
  onSaveRelationships,
  onUpdateCharacter,
  groupMembers = [],
  characters = [],
  relationships = [],
  activeIdentityId,
}: ChatMemoryExtractionOptions) {
  const lastArchiveFeedbackRef = useRef<MemoryArchiveStats | null>(null);
  const lastRunDiagnosticsRef = useRef<MemoryExtractionRunDiagnostics>({
    status: "NO_MESSAGES",
    scopeAvailable: false,
    messageCount: 0,
    providerRequestObserved: false,
    candidateCount: 0,
    persistenceMode: "production_equivalent_write",
  });

  const handleExtractMemories = async (
    manualMessagesOverride?: Message[],
    runOptions: MemoryExtractionRunOptions = {},
  ) => {
    const persistenceMode = runOptions.persistenceMode || "production_equivalent_write";
    const scopeAvailable = Boolean(activeDirectScope && activeCharacter && !activeCharacter.isGroupChat);
    if (!activeChatCharId || !activeCharacter) {
      lastRunDiagnosticsRef.current = {
        status: "ACTIVE_DIRECT_SCOPE_UNAVAILABLE",
        scopeAvailable: false,
        messageCount: 0,
        providerRequestObserved: false,
        candidateCount: 0,
        persistenceMode,
      };
      return 0;
    }

    lastArchiveFeedbackRef.current = null;
    lastRunDiagnosticsRef.current = {
      status: "NO_MESSAGES",
      scopeAvailable,
      messageCount: 0,
      providerRequestObserved: false,
      candidateCount: 0,
      persistenceMode,
    };
    setIsCompressingMemory(true);
    try {
      const activeRelationship = activeDirectScope
        ? relationships.find((relationship) => relationship.id === activeDirectScope.relationId)
        : undefined;
      const lastArchivedMessageId = activeCharacter.isGroupChat
        ? activeCharacter.lastImmediateSummaryMsgId
        : activeRelationship?.lastImmediateSummaryMsgId;
      const unarchivedMessages = selectUnarchivedChatMessages(
        currentChatMessages,
        lastArchivedMessageId,
        manualMessagesOverride,
      );
      if (unarchivedMessages.length === 0) {
        lastRunDiagnosticsRef.current = {
          status: "NO_MESSAGES",
          scopeAvailable,
          messageCount: 0,
          providerRequestObserved: false,
          candidateCount: 0,
          persistenceMode,
        };
        return 0;
      }
      const configuredBatchSize = Number.isFinite(activeCharacter.historyMemoryLimit)
        ? Math.round(activeCharacter.historyMemoryLimit as number)
        : 100;
      const archiveBatchSize = Math.min(200, Math.max(10, configuredBatchSize));
      const archiveBatches = splitChatArchiveBatches(unarchivedMessages, archiveBatchSize);
      // A formal long-evidence window needs the same admission observation
      // seam even when the standalone Shadow/Canary toggles are off. This is
      // dev-only metadata ingestion; it does not grant write authority or
      // alter the production extraction result.
      const longEvidenceEnabled = !activeCharacter.isGroupChat
        && activeDirectScope !== undefined
        && manualMessagesOverride === undefined
        && isDirectChatMemoryLongEvidenceCollectorEnabled();
      const longEvidenceCollectorSummary = getDirectChatMemoryLongEvidenceSummary();
      recordDirectChatMemoryEvidenceTrace({
        stage: "long_evidence_gate_checked",
        timestamp: Date.now(),
        longEvidenceEnabled,
        collectorActive: longEvidenceCollectorSummary.enabled,
        hasWindow: longEvidenceCollectorSummary.windowState === "active",
        collectorInstanceOrdinal: getDirectChatMemoryLongEvidenceCollectorInstanceOrdinal(),
      });
      let totalExtracted = 0;
      const archiveStats: MemoryArchiveStats = {
        sourceMessageCount: 0,
        acceptedTruthCount: 0,
        summaryCount: 0,
        ruleCount: 0,
        compatibilityCount: 0,
        rejectedCandidateCount: 0,
      };
      const canaryEnabled = !activeCharacter.isGroupChat
        && activeDirectScope !== undefined
        && manualMessagesOverride === undefined
        && isDirectChatMemorySafetyVetoCanaryEnabled();
      if (canaryEnabled) {
        // A developer/local Canary opt-in requires the existing fail-open
        // Safety shadow to produce the same-operation validator result. This
        // configuration is dev-gated and has no effect in production builds.
        configureDirectChatMemorySafetyVetoShadow({ enabled: true });
      }
      const admissionShadowEnabled = manualMessagesOverride === undefined && isDirectChatMemoryAdmissionShadowEvidenceEnabled();
      const safetyShadowEnabled = manualMessagesOverride === undefined
        && (isDirectChatMemorySafetyVetoShadowEnabled() || canaryEnabled);
      const admissionObservationEnabled = admissionShadowEnabled
        || safetyShadowEnabled
        || canaryEnabled
        || longEvidenceEnabled;
      const markArchiveProgress = async (lastMessage: Message): Promise<boolean> => {
        if (activeCharacter.isGroupChat) {
          if (onUpdateCharacter) {
            await onUpdateCharacter(activeCharacter.id, { lastImmediateSummaryMsgId: lastMessage.id });
            return true;
          }
          return false;
        }
        if (activeDirectScope && onSaveRelationships) {
          onSaveRelationships((previous) => previous.map((relation) => relation.id === activeDirectScope.relationId
            ? { ...relation, lastImmediateSummaryMsgId: lastMessage.id, updatedAt: Date.now() }
            : relation));
          return true;
        }
        return false;
      };

      if (activeCharacter.isGroupChat) {
        for (const messagesToCompress of archiveBatches) {
          archiveStats.sourceMessageCount += messagesToCompress.length;
          const transcript = messagesToCompress.map((message) => `${message.sender === "user" ? settings.name : message.senderId || "成员"}：${message.content}`).join("\n");
          const summary = await apiChat({
            message: `请把下面这段群聊整理成一段简短、具体、可长期记忆的摘要。只保留已经发生的事实、重要决定和关系变化，不要逐句复述，不要添加推测，不要输出标题或解释。\n\n${transcript.slice(-12000)}`,
            history: [],
            systemInstruction: "你是群聊记忆整理器。输出 80 到 180 字的中文摘要。",
            apiKey: settings.apiKey,
            model: (!recallSettings?.extractModel || recallSettings.extractModel === "default-chat-model") ? (settings.selectedModel || "gemini-3.5-flash") : recallSettings.extractModel,
            apiEndpoint: settings.apiEndpoint,
            purpose: "memory_extract",
            characterId: activeChatCharId,
            conversationId: `group:${activeChatCharId}`,
          });
          const summaryText = summary.text.trim();
          if (!summaryText) return -1;
          const generatedAt = Date.now();
          const sourceMessageIds = messagesToCompress.map((message) => message.id);
          const groupConversationId = `group:${activeChatCharId}`;
          const groupRecords = groupMembers.flatMap((member) => {
            const relation = findRelationshipForCanonicalCharacter(relationships, activeIdentityId || "", member.id, characters);
            if (!relation || !activeIdentityId) return [];
            const recordKey = `${activeChatCharId}:${member.id}:${sourceMessageIds[0]}:${sourceMessageIds[sourceMessageIds.length - 1]}`;
            const scope = {
              characterId: member.id,
              relationId: relation.id,
              userIdentityId: activeIdentityId,
              conversationId: groupConversationId,
            };
            const decision = evaluateKnowledgeWrite({
              id: `group-summary-claim:${recordKey}`,
              ...scope,
              kind: "fact",
              subject: "relationship",
              statement: `群聊「${activeCharacter.name}」中发生：${summaryText}`,
              temporalStatus: "past",
              source: {
                kind: "automatic_summary",
                authorship: "system",
                messageIds: sourceMessageIds,
                producer: "group-chat-summary.v1",
                evidenceKey: `group-summary:${recordKey}`,
              },
              confidence: 0.6,
              importance: 4,
              occurredAt: messagesToCompress[messagesToCompress.length - 1]?.timestamp,
              recordedAt: generatedAt,
            });
            if (decision.accepted === false) {
              console.warn("Group chat summary was rejected by the canonical write policy:", decision.reason);
              return [];
            }
            const summaryRecord = createConversationSummaryRecord({
              scope,
              claims: [decision.claim],
              sourceMessageIds,
              generatedAt,
              generator: "group-chat-summary.v1",
              rangeStartAt: messagesToCompress[0]?.timestamp,
              rangeEndAt: messagesToCompress[messagesToCompress.length - 1]?.timestamp,
            });
            return [{ claim: decision.claim, summary: summaryRecord }];
          });
          const claims = groupRecords.map((record) => record.claim);
          const summaries = groupRecords.flatMap((record) => record.summary ? [record.summary] : []);
          archiveStats.acceptedTruthCount += claims.length;
          archiveStats.summaryCount += summaries.length;
          if (claims.length > 0 || summaries.length > 0) {
            const write = await commitMemoryWriteBundle({
              claims,
              summaries,
              appendClaims: appendKnowledgeClaims,
              appendSummaries: (next) => conversationSummaryRepository.appendMany(next),
            });
            if (!write.canonicalWritten || !write.summaryWritten) {
              console.error("Group chat canonical memory bundle could not be persisted:", write.error || write.summaryError);
              return -1;
            }
          }
          totalExtracted += claims.length;
          await markArchiveProgress(messagesToCompress[messagesToCompress.length - 1]);
        }
        lastArchiveFeedbackRef.current = { ...archiveStats };
        return totalExtracted;
      }

      if (!activeDirectScope) {
        lastRunDiagnosticsRef.current = {
          status: "ACTIVE_DIRECT_SCOPE_UNAVAILABLE",
          scopeAvailable: false,
          messageCount: unarchivedMessages.length,
          providerRequestObserved: false,
          candidateCount: 0,
          persistenceMode,
        };
        return 0;
      }
      const extractionScope = activeDirectScope;
      for (const messagesToCompress of archiveBatches) {
        archiveStats.sourceMessageCount += messagesToCompress.length;
        const longEvidenceBefore = longEvidenceEnabled
          ? await readDirectChatMemoryCanonicalReadback(extractionScope).catch(() => undefined)
          : undefined;
        recordDirectChatMemoryEvidenceTrace({
          stage: "before_snapshot_present",
          timestamp: Date.now(),
          longEvidenceEnabled,
          collectorActive: getDirectChatMemoryLongEvidenceSummary().enabled,
          hasWindow: getDirectChatMemoryLongEvidenceSummary().windowState === "active",
          hasLongEvidenceBefore: Boolean(longEvidenceBefore),
        });
        const extractionStartedAt = longEvidenceEnabled ? Date.now() : undefined;
        const logicalActionId = longEvidenceEnabled ? createAiActionId() : undefined;
        recordDirectChatMemoryEvidenceTrace({
          stage: "logical_action_id_created",
          timestamp: Date.now(),
          longEvidenceEnabled,
          collectorActive: getDirectChatMemoryLongEvidenceSummary().enabled,
          hasWindow: getDirectChatMemoryLongEvidenceSummary().windowState === "active",
          hasLogicalActionId: Boolean(logicalActionId),
        });
        const isDelicate = activeCharacter.archiveTemplateType === "delicate";
        const headerLabel = isDelicate ? "【心境日记归档 (细腻版)】" : "【精炼归档事件日志 (精炼版)】";
        lastRunDiagnosticsRef.current = {
          ...lastRunDiagnosticsRef.current,
          providerRequestObserved: true,
          messageCount: unarchivedMessages.length,
        };
        const result = await MemoryService.extractMemories({
          character: activeCharacter,
          characterId: activeChatCharId,
          relationId: extractionScope.relationId,
          userIdentityId: extractionScope.userIdentityId,
          conversationId: extractionScope.conversationId,
          recentMessages: messagesToCompress,
          existingMemories: [],
          scenario: "chat",
          // The controller supplies an explicit eligible batch for automatic
          // Direct Chat extraction; manual archive actions leave this off.
          ...(manualMessagesOverride !== undefined || runOptions.enableV2Metadata || canaryEnabled
            ? { enableMemoryExtractionV2Shadow: true }
            : {}),
          // Stage 4D-2 observation derives a V2 candidate from this same
          // response without changing the extraction Prompt or Provider call.
          ...(admissionObservationEnabled
            ? { enableAdmissionShadowObservation: true }
            : {}),
          apiKey: settings.apiKey,
          model: (!recallSettings?.extractModel || recallSettings.extractModel === "default-chat-model") ? (settings.selectedModel || "gemini-3.5-flash") : recallSettings.extractModel,
          apiEndpoint: settings.apiEndpoint,
          templateType: activeCharacter.archiveTemplateType,
          createId: () => createId("moment"),
          currentTime: () => Date.now(),
          formatContent: (items, formatOptions) => isDelicate
            ? formatDelicateMemoryDiary(headerLabel, formatOptions?.displayItems || items)
            : formatExtractedMemorySummary(headerLabel, items),
        }, (params) => apiExtractMemoriesWithModelFallback(
          logicalActionId ? { ...params, logicalActionId } : params,
          settings.selectedModel,
        ));
        if (result.apiError) {
          console.error("Extract memory API error:", result.apiError);
          lastRunDiagnosticsRef.current = {
            ...lastRunDiagnosticsRef.current,
            status: "FAILED",
            messageCount: unarchivedMessages.length,
          };
          return -1;
        }
        recordDirectChatMemoryEvidenceTrace({
          stage: "extraction_completed",
          timestamp: Date.now(),
          longEvidenceEnabled,
          collectorActive: getDirectChatMemoryLongEvidenceSummary().enabled,
          hasWindow: getDirectChatMemoryLongEvidenceSummary().windowState === "active",
          hasLogicalActionId: Boolean(logicalActionId),
          hasLongEvidenceBefore: Boolean(longEvidenceBefore),
          shadowCandidateCount: Array.isArray(result.shadowCandidatesV2) ? result.shadowCandidatesV2.length : 0,
        });
        lastRunDiagnosticsRef.current = {
          ...lastRunDiagnosticsRef.current,
          candidateCount: lastRunDiagnosticsRef.current.candidateCount
            + (result.shadowCandidatesV2?.length ?? result.acceptedClaims.length + result.rejectedCandidateCount),
          messageCount: unarchivedMessages.length,
        };
        let canaryFilteredAcceptedClaims = result.acceptedClaims;
        let canarySuppressedCount = 0;
        let shadowResult: DirectChatMemoryAdmissionShadowResult | undefined;
        let safetyEvaluation: DirectChatMemorySafetyVetoShadowEvaluation | undefined;
        let canaryResult: DirectChatMemorySafetyVetoCanaryResult | undefined;
        if (admissionObservationEnabled) {
          try {
            shadowResult = observeDirectChatMemoryAdmissionShadow({
              extraction: result,
              scope: extractionScope,
              lineage: {
                ...(result.sourceEnvelope?.parentActionId ? { parentActionId: result.sourceEnvelope.parentActionId } : {}),
                ...(result.sourceEnvelope?.extractionActionId ? { producerActionId: result.sourceEnvelope.extractionActionId } : {}),
              },
              sourceEnvelope: result.sourceEnvelope,
              recordedAt: Date.now(),
            });
            recordDirectChatMemoryEvidenceTrace({
              stage: "shadow_result_present",
              timestamp: Date.now(),
              longEvidenceEnabled,
              collectorActive: getDirectChatMemoryLongEvidenceSummary().enabled,
              hasWindow: getDirectChatMemoryLongEvidenceSummary().windowState === "active",
              hasLogicalActionId: Boolean(logicalActionId),
              hasLongEvidenceBefore: Boolean(longEvidenceBefore),
              hasShadowResult: true,
              shadowCandidateCount: Array.isArray(result.shadowCandidatesV2) ? result.shadowCandidatesV2.length : 0,
            });
            if (admissionShadowEnabled) {
              recordDirectChatMemoryAdmissionShadowEvidence({
                scope: extractionScope,
                result: shadowResult,
                evidenceOrigin: "real_runtime",
              });
            }
            safetyEvaluation = safetyShadowEnabled
              ? evaluateDirectChatSafetyVetoShadowForExtraction({
                ...shadowResult,
                featureScope: "automatic_direct_chat",
              })
              : undefined;
            if (canaryEnabled) {
              canaryResult = applyDirectChatMemorySafetyVetoCanary({
                claims: result.acceptedClaims,
                bridgeShadow: shadowResult.bridgeShadow,
                safetyEvaluation,
              });
              canaryFilteredAcceptedClaims = canaryResult.filteredAcceptedClaims;
              canarySuppressedCount = canaryResult.suppressed;
            }
          } catch {
            // Both shadow paths are fail-open and cannot affect the established
            // canonical write or archive cursor.
          }
        }
        if (persistenceMode === "observation_only") {
          // The real Provider/parser/source-binding/Shadow path has completed,
          // but this explicit dev run must not write canonical claims,
          // summaries, projection jobs, or archive cursors.
          archiveStats.acceptedTruthCount += canaryFilteredAcceptedClaims.length;
          archiveStats.rejectedCandidateCount += result.rejectedCandidateCount;
          totalExtracted += canaryFilteredAcceptedClaims.length;
          continue;
        }
        let finalCanonicalClaims = canaryFilteredAcceptedClaims;
        const isAutomaticDirectChat = manualMessagesOverride === undefined;
        let canonicalSnapshotAvailable = false;
        let finalCanonicalSnapshot: CanonicalMemoryCommitSnapshot | undefined;
        let extractedSummary: ConversationSummaryRecord | undefined;
        let enqueueResult: MemoryProjectionEnqueueResult | undefined;
        let cutoverDecision: DirectChatSummaryCutoverDecision | undefined = isAutomaticDirectChat && canaryFilteredAcceptedClaims.length === 0
          ? resolveDirectChatSummaryCutover({ automatic: true, canonicalSnapshotAvailable: true, zeroCandidates: true })
          : undefined;
        const write = await commitMemoryWriteBundle({
          claims: canaryFilteredAcceptedClaims,
          buildSummary: () => {
            if (isAutomaticDirectChat && (!cutoverDecision || !cutoverDecision.writeSynchronousSummary)) {
              return undefined;
            }
            const canonicalSnapshot = finalCanonicalSnapshot;
            extractedSummary = createConversationSummaryRecord({
              scope: extractionScope,
              // Normal automatic Direct Chat uses the same exact-scope final
              // canonical snapshot as the durable projection. Manual archive
              // remains on its historical batch-local path.
              claims: canonicalSnapshot?.activeClaims || canaryFilteredAcceptedClaims,
              sourceMessageIds: canonicalSnapshot?.sourceMessageIds || messagesToCompress.map((message) => message.id),
              ...(canonicalSnapshot ? { canonicalRevision: canonicalSnapshot.canonicalRevision } : {}),
              generatedAt: Date.now(),
            });
            return extractedSummary;
          },
          appendClaims: appendKnowledgeClaims,
          appendSummaries: (summaries) => conversationSummaryRepository.appendMany(summaries),
          ...(isAutomaticDirectChat ? { afterCanonicalWrite: async () => {
            const loaded = loadKnowledgeClaims();
            if (!loaded.valid) {
              canonicalSnapshotAvailable = false;
              enqueueResult = { kind: "unavailable", error: loaded.error };
              cutoverDecision = resolveDirectChatSummaryCutover({
                automatic: true,
                canonicalSnapshotAvailable: false,
                enqueueKind: enqueueResult.kind,
              });
              return;
            }
            finalCanonicalClaims = loaded.value;
            finalCanonicalSnapshot = buildCanonicalMemoryCommitSnapshot({
              scope: extractionScope,
              claims: finalCanonicalClaims,
            });
            canonicalSnapshotAvailable = true;
            try {
              enqueueResult = await enqueueConversationSummaryProjection({
                scope: extractionScope,
                snapshot: finalCanonicalSnapshot,
                canonicalStateResolved: true,
              });
            } catch (error) {
              enqueueResult = { kind: "unavailable", error };
            }
            cutoverDecision = resolveDirectChatSummaryCutover({
              automatic: true,
              canonicalSnapshotAvailable,
              enqueueKind: enqueueResult.kind,
            });
            if (cutoverDecision.outcome === "DURABLE_PROJECTION_UNAVAILABLE_SYNC_FALLBACK") {
              console.warn("[memory-projection] Durable projection unavailable; using synchronous canonical Summary fallback.");
            }
          } } : {}),
        });
        if (!write.canonicalWritten) {
          console.error("Knowledge claims could not be persisted.", write.error);
          return -1;
        }
        const fallbackSummaryWritten = Boolean(
          write.summaryWritten
          && finalCanonicalSnapshot
          && (finalCanonicalSnapshot.activeClaims.length === 0 || extractedSummary),
        );
        const finalCutoverDecision = isAutomaticDirectChat
          ? resolveDirectChatSummaryCutover({
            automatic: true,
            canonicalSnapshotAvailable,
            enqueueKind: enqueueResult?.kind,
            zeroCandidates: canaryFilteredAcceptedClaims.length === 0,
            fallbackSummaryWritten,
          })
          : resolveDirectChatSummaryCutover({ automatic: false, canonicalSnapshotAvailable: true });
        if (!write.summaryWritten && (!isAutomaticDirectChat || finalCutoverDecision.requiresSynchronousFallback)) {
          // Do not move the archive marker past a batch whose derived summary
          // did not persist. A later retry can safely rebuild the canonical
          // summary without deleting the original chat history.
          console.error("Conversation summary cache could not be persisted:", write.summaryError);
          return -1;
        }
        if (isAutomaticDirectChat && !finalCutoverDecision.canAdvanceCursor) {
          console.error("[memory-projection] Direct Chat archive cursor held:", finalCutoverDecision.outcome);
          return -1;
        }
        archiveStats.acceptedTruthCount += canaryFilteredAcceptedClaims.length;
        archiveStats.summaryCount += write.summaryWritten ? 1 : 0;
        archiveStats.rejectedCandidateCount += result.rejectedCandidateCount + canarySuppressedCount;
        totalExtracted += canaryFilteredAcceptedClaims.length;
        const cursorAdvanced = await markArchiveProgress(messagesToCompress[messagesToCompress.length - 1]);
        const observerGateReason = !longEvidenceEnabled
          ? "long_evidence_disabled" as const
          : !logicalActionId
            ? "logical_action_missing" as const
            : !longEvidenceBefore
              ? "before_snapshot_missing" as const
              : !shadowResult
                ? "shadow_result_missing" as const
                : undefined;
        if (observerGateReason) {
          recordDirectChatMemoryEvidenceTrace({
            stage: "observer_skipped",
            timestamp: Date.now(),
            reason: observerGateReason,
            longEvidenceEnabled,
            collectorActive: getDirectChatMemoryLongEvidenceSummary().enabled,
            hasWindow: getDirectChatMemoryLongEvidenceSummary().windowState === "active",
            hasLogicalActionId: Boolean(logicalActionId),
            hasLongEvidenceBefore: Boolean(longEvidenceBefore),
            hasShadowResult: Boolean(shadowResult),
          });
        } else {
          recordDirectChatMemoryEvidenceTrace({
            stage: "observer_call_attempted",
            timestamp: Date.now(),
            longEvidenceEnabled: true,
            collectorActive: getDirectChatMemoryLongEvidenceSummary().enabled,
            hasWindow: getDirectChatMemoryLongEvidenceSummary().windowState === "active",
            hasLogicalActionId: true,
            hasLongEvidenceBefore: true,
            hasShadowResult: true,
          });
          const canonicalAfter = await readDirectChatMemoryCanonicalReadback(extractionScope).catch(() => undefined);
          recordDirectChatMemoryEvidenceTrace({
            stage: "canonical_after_present",
            timestamp: Date.now(),
            longEvidenceEnabled: true,
            collectorActive: getDirectChatMemoryLongEvidenceSummary().enabled,
            hasWindow: getDirectChatMemoryLongEvidenceSummary().windowState === "active",
            hasLogicalActionId: true,
            hasLongEvidenceBefore: true,
            hasShadowResult: true,
            hasCanonicalAfter: Boolean(canonicalAfter),
          });
          if (canonicalAfter) {
            await observeDirectChatMemoryLongEvidenceRuntime({
              scope: extractionScope,
              extraction: result,
              admissionShadow: shadowResult,
              safetyEvaluation,
              canaryResult,
              acceptedClaimsBefore: result.acceptedClaims,
              filteredAcceptedClaims: canaryFilteredAcceptedClaims,
              canonicalBefore: longEvidenceBefore,
              canonicalAfter,
              canonicalWriteSucceeded: write.canonicalWritten,
              cursorAdvanced,
              logicalActionId,
              extractionLatencyMs: extractionStartedAt === undefined ? undefined : Date.now() - extractionStartedAt,
            });
          } else {
            recordDirectChatMemoryEvidenceTrace({
              stage: "observer_skipped",
              timestamp: Date.now(),
              reason: "canonical_after_missing",
              longEvidenceEnabled: true,
              collectorActive: getDirectChatMemoryLongEvidenceSummary().enabled,
              hasWindow: getDirectChatMemoryLongEvidenceSummary().windowState === "active",
              hasLogicalActionId: true,
              hasLongEvidenceBefore: true,
              hasShadowResult: true,
              hasCanonicalAfter: false,
            });
          }
        }
      }
      lastArchiveFeedbackRef.current = { ...archiveStats };
      lastRunDiagnosticsRef.current = {
        ...lastRunDiagnosticsRef.current,
        status: "completed",
        messageCount: unarchivedMessages.length,
      };
      return totalExtracted;
    } catch (err: any) {
      console.error("Memory extraction error:", err);
      lastRunDiagnosticsRef.current = {
        ...lastRunDiagnosticsRef.current,
        status: "FAILED",
      };
    } finally {
      setIsCompressingMemory(false);
    }
    return -1;
  };

  return {
    handleExtractMemories,
    getLastArchiveFeedback: () => lastArchiveFeedbackRef.current,
    getLastMemoryExtractionRunDiagnostics: () => lastRunDiagnosticsRef.current,
  };
}
