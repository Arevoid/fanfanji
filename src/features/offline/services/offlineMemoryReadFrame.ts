import type { Character, OfflineStory, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { CharacterTruthScope, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { sourceRevision } from "../../../domain/characterKnowledge/knowledgeEvolution";
import { projectKnowledgeReadFrame } from "../../../domain/characterKnowledge/knowledgeReadFrame";
import { emptyCharacterContinuity, reconcileImpressions, type CharacterImpression, type CharacterLifeEpisode } from "../../../domain/memory/characterContinuity";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { loadCharacterContinuity } from "../../../core/storage/repositories/characterContinuityRepository";
import { contributeSemanticDirectReplyTruthContext } from "../../characterKnowledge/services/semanticMemoryRecallService";
import { formatTruthRetrievalForPrompt } from "../../characterKnowledge/services/truthRetrievalService";

interface Ref { id: string; revision: string }
interface ClaimRef extends Ref { groups: string[][]; versions: Record<string, string> }
interface ImpressionRef extends Ref { sourceClaimIds: string[]; confidence: number; status: CharacterImpression["status"]; revisionReason?: string }
interface MemberFrame { scope: CharacterTruthScope; relationship: string; claims: ClaimRef[]; summaries: Ref[]; impressions: ImpressionRef[]; life: Ref[] }
interface OfflineMemoryReadFrame { version: 1; capturedAt: number; members: Record<string, MemberFrame> }
const claimRevision = (claim: KnowledgeClaim) => sourceRevision(JSON.stringify([claim.statement, claim.kind, claim.subject,
  claim.source.kind, claim.source.authorship, claim.source.evidenceQuote, claim.source.sourceRecordId]));
const impressionRevision = (record: CharacterImpression) => sourceRevision(JSON.stringify([record.proposition, record.category, record.themeKey, record.intervention]));
const lifeRevision = (record: CharacterLifeEpisode) => sourceRevision(JSON.stringify({ ...record, supersededById: undefined }));
export const hasExplicitOfflineMemoryImport = (story: Pick<OfflineStory, "sourceChatId" | "sourceAppointmentId" | "importedContext">) => Boolean(story.sourceChatId || story.sourceAppointmentId || story.importedContext);
export function captureOfflineMemoryReadFrame(input: { memberIds: readonly string[]; characters: readonly Character[]; relationships: readonly CharacterRelationship[];
  userIdentityId: string; relationId?: string; now?: number }): OfflineMemoryReadFrame {
  const capturedAt = input.now ?? Date.now(); const claims = loadKnowledgeClaims().value; const summaries = loadConversationSummaries().value; const continuity = loadCharacterContinuity().value;
  const members: Record<string, MemberFrame> = {};
  for (const memberId of input.memberIds) {
    const relation = input.relationId ? input.relationships.find((record) => record.id === input.relationId && record.userIdentityId === input.userIdentityId && record.characterId === memberId)
      : findRelationshipForCanonicalCharacter(input.relationships, input.userIdentityId, memberId, input.characters);
    if (!relation?.conversationId) continue;
    const scope = { characterId: relation.characterId, relationId: relation.id, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId };
    const known = projectKnowledgeReadFrame(claims.filter((claim) => isExactTruthScope(claim, scope)), capturedAt);
    members[relation.characterId] = { scope, relationship: relation.relationship,
      claims: known.filter((claim) => claim.status === "active").map((claim) => ({ id: claim.id, revision: claimRevision(claim),
        groups: claim.source.evidenceGroups || (claim.source.messageIds?.length ? [claim.source.messageIds] : []), versions: claim.source.messageRevisions || {} })),
      summaries: summaries.filter((summary) => isExactTruthScope(summary, scope) && summary.status === "active" && summary.generatedAt <= capturedAt)
        .map((summary) => ({ id: summary.id, revision: sourceRevision(JSON.stringify([summary.summary, summary.sourceClaimIds])) })),
      impressions: reconcileImpressions(continuity.impressions, known, capturedAt).filter((record) => isExactTruthScope(record.scope, scope) && record.recordedAt <= capturedAt && record.status !== "invalid")
        .map((record) => ({ id: record.id, revision: impressionRevision(record), sourceClaimIds: record.sourceClaimIds, confidence: record.confidence, status: record.status, revisionReason: record.revisionReason })),
      life: continuity.life.filter((record) => record.characterId === scope.characterId && record.userIdentityId === scope.userIdentityId && record.recordedAt <= capturedAt)
        .map((record) => ({ id: record.id, revision: lifeRevision(record) })) };
  }
  return { version: 1, capturedAt, members };
}
function readFrame(story: OfflineStory): OfflineMemoryReadFrame | undefined {
  const raw = story.memoryReadFrame as OfflineMemoryReadFrame | undefined;
  if (!raw || raw.version !== 1 || !Number.isFinite(raw.capturedAt) || raw.capturedAt > story.createdAt + 30_000 || !raw.members || typeof raw.members !== "object" || Array.isArray(raw.members)) return undefined;
  const refs = (items: unknown) => Array.isArray(items) && items.every((item) => item && typeof item.id === "string" && typeof item.revision === "string");
  if (!Object.values(raw.members).every((member) => member && member.scope && ["characterId", "relationId", "userIdentityId", "conversationId"].every((key) => typeof (member.scope as unknown as Record<string, unknown>)[key] === "string")
    && refs(member.claims) && member.claims.every((ref) => Array.isArray(ref.groups) && ref.groups.every((group) => Array.isArray(group) && group.every((id) => typeof id === "string")) && ref.versions && typeof ref.versions === "object")
    && typeof member.relationship === "string" && member.relationship.length <= 2000
    && refs(member.summaries) && refs(member.impressions) && member.impressions.every((ref) => Array.isArray(ref.sourceClaimIds) && ref.sourceClaimIds.every((id) => typeof id === "string") && Number.isFinite(ref.confidence) && ref.confidence >= 0 && ref.confidence <= 1
      && ["active", "superseded", "candidate", "invalid"].includes(ref.status) && (ref.revisionReason === undefined || typeof ref.revisionReason === "string"))
    && refs(member.life))) return undefined;
  return raw;
}
export function offlineFrameRelationship(story: OfflineStory, characterId: string): string | undefined { return readFrame(story)?.members[characterId]?.relationship; }
export async function buildOfflineFrameMemoryContext(input: { story: OfflineStory; characterId: string; relation: CharacterRelationship; settings: UserSettings; query: string }) {
  if (!hasExplicitOfflineMemoryImport(input.story)) return "";
  const frame = readFrame(input.story); const member = frame?.members[input.characterId];
  if (!frame || !member || (input.story.ownerIdentityId && input.story.ownerIdentityId !== input.relation.userIdentityId)
    || !isExactTruthScope(member.scope, { characterId: input.relation.characterId, relationId: input.relation.id, userIdentityId: input.relation.userIdentityId, conversationId: input.relation.conversationId })) return "";
  const readClaims = () => projectKnowledgeReadFrame(loadKnowledgeClaims().value.filter((claim) => {
    const ref = member.claims.find((record) => record.id === claim.id || claim.mergedClaimIds?.includes(record.id));
    return ref && isExactTruthScope(claim, member.scope) && !claim.recallDisabled && claimRevision(claim) === ref.revision
      && (!ref.groups.length || ref.groups.some((group) => group.every((id) => claim.source.messageIds?.includes(id) && (ref.versions[id] === undefined || claim.source.messageRevisions?.[id] === ref.versions[id]))));
  }), frame.capturedAt);
  const claims = readClaims(); const current = loadCharacterContinuity().value;
  const lease = JSON.stringify([claims, current, loadConversationSummaries().value]);
  const continuity = { ...emptyCharacterContinuity(), impressions: current.impressions.flatMap((record) => {
    const ref = member.impressions.find((item) => item.id === record.id);
    return ref && isExactTruthScope(record.scope, member.scope) && !record.paused && impressionRevision(record) === ref.revision
      ? [{ ...record, sourceClaimIds: ref.sourceClaimIds, confidence: ref.confidence, status: ref.status, revisionReason: ref.revisionReason, resolvedById: undefined,
        opposingClaimIds: record.opposingClaimIds?.filter((id) => ref.sourceClaimIds.includes(id)) }] : [];
  }), life: current.life.flatMap((record) => {
    const ref = member.life.find((item) => item.id === record.id);
    return ref && record.characterId === member.scope.characterId && record.userIdentityId === member.scope.userIdentityId && lifeRevision(record) === ref.revision
      ? [{ ...record, supersededById: member.life.some((item) => item.id === record.supersededById) ? record.supersededById : undefined }] : [];
  }) };
  const summaries = loadConversationSummaries().value.filter((summary) => isExactTruthScope(summary, member.scope) && member.summaries.some((ref) => ref.id === summary.id && ref.revision === sourceRevision(JSON.stringify([summary.summary, summary.sourceClaimIds]))));
  const result = await contributeSemanticDirectReplyTruthContext({ queryOnly: true, configuration: input.settings.memoryEmbedding, readClaims,
    retrieval: { scope: member.scope,knownAt: frame.capturedAt,mentionChannel:`offline:${input.story.id}`,mentionNow:Date.now(),claims, summaries, corrections: [], continuitySnapshot: continuity, queryText: input.query, maxCharacters: 1800, limit: 6 } });
  // A source/continuity edit during a network request invalidates this read;
  // the next user turn can acquire a fresh lease without sending stale material.
  if (lease !== JSON.stringify([readClaims(), loadCharacterContinuity().value, loadConversationSummaries().value])) return "";
  return formatTruthRetrievalForPrompt(result);
}
