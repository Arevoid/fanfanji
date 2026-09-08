import { canSyncOfflineStoryToMemory } from "../offlineStory/offlineStoryFactPolicy";
import {
  KNOWLEDGE_CLAIM_SCHEMA_VERSION,
  type CharacterTruthScope,
  type KnowledgeClaim,
  type KnowledgeKind,
  type KnowledgeSourceRef,
  type KnowledgeSubject,
  type KnowledgeWriteCandidate,
  type KnowledgeWriteDecision,
  type TemporalStatus,
  type TruthStatus,
} from "./characterKnowledgeTypes";
import { inspectKnowledgeLanguageCues, normalizeKnowledgeTemporalSemantics } from "./knowledgeTemporalPolicy";

const KNOWLEDGE_KINDS = new Set<KnowledgeKind>(["fact", "preference", "plan", "belief", "hypothesis"]);
const KNOWLEDGE_SUBJECTS = new Set<KnowledgeSubject>(["user", "character", "relationship", "other"]);
const KNOWLEDGE_SOURCE_APPS = new Set([
  "chat", "offline", "memory", "moments", "notes", "diary", "cinema", "schedule", "forum",
  "relationship-network", "music", "reading", "worldbook", "archives", "system", "legacy",
]);
const TRUTH_STATUSES = new Set<TruthStatus>(["asserted", "confirmed", "inferred", "disputed", "retracted", "legacy_unverified"]);
const TEMPORAL_STATUSES = new Set<TemporalStatus>(["past", "present", "future", "timeless", "unknown"]);
const SOURCE_KINDS = new Set(["user_message", "automatic_summary", "deterministic_action", "manual", "ooc_correction", "offline_story", "import", "legacy_memory"]);
const SOURCE_AUTHORSHIP = new Set(["user", "character", "system", "unknown"]);
const LOW_SIGNAL_ACKNOWLEDGEMENT = /^(?:好|好啊|好呀|好的|好吧|好耶|嗯+|哦+|行|行啊|可以|没问题|收到|知道了|你等我|来填空吧|来吧|等我|稍等|哈哈+|笑死|谢谢|不客气|晚安|早安|在吗|来了|对|是的|不是|没事)$/u;
const DURABLE_MEANING_CUE = /(?:爱|喜欢|讨厌|不喜欢|想念|想要|需要|计划|打算|答应|约定|明天|今晚|下周|生日|住在|住址|工作|学校|家人|朋友|禁止|不能|过敏|重要|决定|记得|忘记|害怕|生气|难过|开心|约会|见面|旅行|搬家|考试|项目)/u;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const cleanStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => !isNonEmpty(item))) return undefined;
  return Array.from(new Set(value.map((item) => (item as string).trim())));
};

/**
 * A model may return perfectly valid JSON for a greeting, acknowledgement or
 * filler phrase. Those phrases are evidence-bearing chat messages, but they
 * are not durable knowledge and must not become one memory card each.
 */
export function isLowInformationKnowledgeStatement(statement: string): boolean {
  const text = statement.trim().replace(/[\s\u200b]+/gu, "");
  if (!text) return true;
  const withoutPunctuation = text.replace(/[，。！？、,.!?~～…；;：“”‘’"'（）()【】\[\]{}]/gu, "");
  if (LOW_SIGNAL_ACKNOWLEDGEMENT.test(withoutPunctuation)) return true;
  return withoutPunctuation.length <= 6 && !DURABLE_MEANING_CUE.test(withoutPunctuation);
}

export function isCompleteTruthScope(scope: CharacterTruthScope, requireConversation = false): boolean {
  return isNonEmpty(scope.relationId)
    && isNonEmpty(scope.characterId)
    && isNonEmpty(scope.userIdentityId)
    && (!requireConversation || isNonEmpty(scope.conversationId));
}

function normalizeSource(value: unknown): KnowledgeSourceRef | undefined {
  if (!isRecord(value)
    || !SOURCE_KINDS.has(value.kind as string)
    || !SOURCE_AUTHORSHIP.has(value.authorship as string)
    || (value.app !== undefined && (!isNonEmpty(value.app) || !KNOWLEDGE_SOURCE_APPS.has(value.app.trim())))
    || !isNonEmpty(value.producer)
    || !isNonEmpty(value.evidenceKey)) return undefined;
  const messageIds = cleanStringArray(value.messageIds);
  if (value.messageIds !== undefined && messageIds === undefined) return undefined;
  return {
    kind: value.kind as KnowledgeSourceRef["kind"],
    authorship: value.authorship as KnowledgeSourceRef["authorship"],
    ...(typeof value.app === "string" ? { app: value.app as KnowledgeSourceRef["app"] } : {}),
    ...(messageIds ? { messageIds } : {}),
    ...(isNonEmpty(value.eventId) ? { eventId: value.eventId.trim() } : {}),
    ...(isNonEmpty(value.storyId) ? { storyId: value.storyId.trim() } : {}),
    ...(isNonEmpty(value.sourceRecordId) ? { sourceRecordId: value.sourceRecordId.trim() } : {}),
    producer: value.producer.trim(),
    evidenceKey: value.evidenceKey.trim(),
  };
}

function hasTraceableEvidence(source: KnowledgeSourceRef): boolean {
  if (!source.evidenceKey || !source.producer) return false;
  if (source.kind === "user_message") return Boolean(source.messageIds?.length);
  if (source.kind === "offline_story") return Boolean(source.storyId);
  if (source.kind === "legacy_memory") return Boolean(source.sourceRecordId);
  return Boolean(source.messageIds?.length || source.eventId || source.storyId || source.sourceRecordId || source.kind === "manual");
}

const clampConfidence = (value: number | undefined, maximum: number): number =>
  Math.min(maximum, Math.max(0, isFiniteNumber(value) ? value : maximum));

const normalizeImportance = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : Math.min(10, Math.max(1, Math.round(value)));

function resolveTruth(candidate: KnowledgeWriteCandidate): { truthStatus: TruthStatus; userConfirmed: boolean; confidence: number } {
  const { source } = candidate;
  if (source.kind === "legacy_memory") return { truthStatus: "legacy_unverified", userConfirmed: false, confidence: clampConfidence(candidate.confidence, 0.25) };
  if (source.kind === "manual") return { truthStatus: "confirmed", userConfirmed: true, confidence: clampConfidence(candidate.confidence, 1) };
  if (source.kind === "deterministic_action") return { truthStatus: "confirmed", userConfirmed: Boolean(candidate.userConfirmed), confidence: clampConfidence(candidate.confidence, 1) };
  // evaluateKnowledgeWrite has already enforced the narrow offline boundary:
  // direct single-character continuation + explicit user confirmation. Within
  // that boundary, both sides of the story are confirmed relationship canon.
  if (source.kind === "offline_story" && candidate.userConfirmed === true) {
    return { truthStatus: "confirmed", userConfirmed: true, confidence: clampConfidence(candidate.confidence, 0.9) };
  }
  if (source.authorship === "user") {
    const confirmed = candidate.userConfirmed === true;
    return { truthStatus: confirmed ? "confirmed" : "asserted", userConfirmed: confirmed, confidence: clampConfidence(candidate.confidence, confirmed ? 1 : 0.85) };
  }
  return { truthStatus: "inferred", userConfirmed: false, confidence: clampConfidence(candidate.confidence, 0.5) };
}

export function evaluateKnowledgeWrite(candidate: KnowledgeWriteCandidate): KnowledgeWriteDecision {
  if (!isCompleteTruthScope(candidate, true)) return { accepted: false, reason: "invalid_scope" };
  if (!isNonEmpty(candidate.id)
    || !isNonEmpty(candidate.statement)
    || !KNOWLEDGE_KINDS.has(candidate.kind)
    || !KNOWLEDGE_SUBJECTS.has(candidate.subject)
    || !TEMPORAL_STATUSES.has(candidate.temporalStatus)
    || !isFiniteNumber(candidate.recordedAt)) return { accepted: false, reason: "invalid_candidate" };
  const source = normalizeSource(candidate.source);
  if (!source || !hasTraceableEvidence(source)) return { accepted: false, reason: "missing_evidence" };
  if (source.kind === "ooc_correction") return { accepted: false, reason: "behavior_correction_required" };
  const normalizedCandidate = { ...candidate, source };
  if (source.kind === "offline_story"
    && (!candidate.offlineStoryPolicyInput || !canSyncOfflineStoryToMemory(candidate.offlineStoryPolicyInput))) {
    return { accepted: false, reason: "fictional_story_boundary" };
  }

  const cues = inspectKnowledgeLanguageCues(candidate.statement);
  if (isLowInformationKnowledgeStatement(candidate.statement)) return { accepted: false, reason: "low_information" };
  if (candidate.evidenceForm && candidate.evidenceForm !== "statement") return { accepted: false, reason: "question_or_instruction" };
  if (cues.question || cues.suggestion || cues.roleplayOrAction || cues.systemInstruction) {
    return { accepted: false, reason: "question_or_instruction" };
  }

  const temporal = normalizeKnowledgeTemporalSemantics(normalizedCandidate);
  const truth = resolveTruth(normalizedCandidate);
  const adjustments = [...temporal.adjustments];
  if (candidate.requestedTruthStatus === "confirmed" && truth.truthStatus !== "confirmed") adjustments.push("untrusted_confirmation_downgraded");
  if (candidate.kind !== temporal.kind || candidate.temporalStatus !== temporal.temporalStatus) adjustments.push("temporal_semantics_normalized");

  return {
    accepted: true,
    adjustments: Array.from(new Set(adjustments)),
    claim: {
      id: candidate.id.trim(),
      relationId: candidate.relationId.trim(),
      characterId: candidate.characterId.trim(),
      userIdentityId: candidate.userIdentityId.trim(),
      conversationId: candidate.conversationId!.trim(),
      kind: temporal.kind,
      subject: candidate.subject,
      statement: candidate.statement.trim(),
      truthStatus: truth.truthStatus,
      temporalStatus: temporal.temporalStatus,
      source,
      confidence: truth.confidence,
      ...(normalizeImportance(candidate.importance) !== undefined ? { importance: normalizeImportance(candidate.importance) } : {}),
      userConfirmed: truth.userConfirmed,
      ...(candidate.occurredAt !== undefined ? { occurredAt: candidate.occurredAt } : {}),
      recordedAt: candidate.recordedAt,
      ...(candidate.validFrom !== undefined ? { validFrom: candidate.validFrom } : {}),
      ...(candidate.validTo !== undefined ? { validTo: candidate.validTo } : {}),
      status: "active",
      visibility: "relation_private",
      schemaVersion: KNOWLEDGE_CLAIM_SCHEMA_VERSION,
    },
  };
}

/** Strict persisted-record reader. It does not guess missing relationship ownership. */
export function normalizeKnowledgeClaim(value: unknown): KnowledgeClaim | undefined {
  if (!isRecord(value)) return undefined;
  const source = normalizeSource(value.source);
  const scope = value as unknown as CharacterTruthScope;
  if (!isCompleteTruthScope(scope)
    || !isNonEmpty(value.id)
    || !isNonEmpty(value.statement)
    || !KNOWLEDGE_KINDS.has(value.kind as KnowledgeKind)
    || !KNOWLEDGE_SUBJECTS.has(value.subject as KnowledgeSubject)
    || !TRUTH_STATUSES.has(value.truthStatus as TruthStatus)
    || !TEMPORAL_STATUSES.has(value.temporalStatus as TemporalStatus)
    || !source
    || !hasTraceableEvidence(source)
    || !isFiniteNumber(value.confidence)
    || value.confidence < 0
    || value.confidence > 1
    || typeof value.userConfirmed !== "boolean"
    || (value.recallDisabled !== undefined && typeof value.recallDisabled !== "boolean")
    || !isFiniteNumber(value.recordedAt)
    || (value.status !== "active" && value.status !== "retracted")
    || value.visibility !== "relation_private"
    || !isFiniteNumber(value.schemaVersion)
    || !Number.isInteger(value.schemaVersion)
    || value.schemaVersion < 1
    || (value.status === "retracted") !== (value.truthStatus === "retracted")) return undefined;
  const optionalNumbers = [value.occurredAt, value.validFrom, value.validTo];
  if (optionalNumbers.some((item) => item !== undefined && !isFiniteNumber(item))) return undefined;
  if (value.importance !== undefined && (!isFiniteNumber(value.importance) || value.importance < 1 || value.importance > 10)) return undefined;
  return {
    id: value.id.trim(),
    relationId: scope.relationId.trim(),
    characterId: scope.characterId.trim(),
    userIdentityId: scope.userIdentityId.trim(),
    ...(isNonEmpty(scope.conversationId) ? { conversationId: scope.conversationId.trim() } : {}),
    kind: value.kind as KnowledgeKind,
    subject: value.subject as KnowledgeSubject,
    statement: value.statement.trim(),
    truthStatus: value.truthStatus as TruthStatus,
    temporalStatus: value.temporalStatus as TemporalStatus,
    source,
    confidence: value.confidence,
    ...(isFiniteNumber(value.importance) ? { importance: Math.round(value.importance) } : {}),
    userConfirmed: value.userConfirmed,
    ...(value.recallDisabled === true ? { recallDisabled: true } : {}),
    ...(isFiniteNumber(value.occurredAt) ? { occurredAt: value.occurredAt } : {}),
    recordedAt: value.recordedAt,
    ...(isFiniteNumber(value.validFrom) ? { validFrom: value.validFrom } : {}),
    ...(isFiniteNumber(value.validTo) ? { validTo: value.validTo } : {}),
    ...(isNonEmpty(value.supersedesId) ? { supersedesId: value.supersedesId.trim() } : {}),
    ...(isNonEmpty(value.supersededById) ? { supersededById: value.supersededById.trim() } : {}),
    ...(isNonEmpty(value.retractionReason) ? { retractionReason: value.retractionReason.trim() } : {}),
    status: value.status,
    visibility: "relation_private",
    schemaVersion: value.schemaVersion,
  };
}
