import { normalizeCharacterExperience } from "../../../domain/memory/characterExperience";
import type { CharacterTruthScope, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { MemorySourceApp } from "../../../domain/memory/memoryModel";
import { sourceRevision } from "../../../domain/characterKnowledge/knowledgeEvolution";
import { loadKnowledgeClaims, appendMany, supersedeMany } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadCharacterContinuity } from "../../../core/storage/repositories/characterContinuityRepository";
import { isForgottenKnowledge } from "../../../domain/memory/characterContinuity";

/** Piggybacks a validated existing reply; no provider, retry, timer or embedding calls. */
export function saveCharacterExperience(input: { scope: CharacterTruthScope; app: MemorySourceApp; sourceId: string; body: string; experience: unknown; now?: number }) {
  const experience = normalizeCharacterExperience(input.experience, input.body);
  if (!experience || !input.sourceId || ![input.scope.characterId,input.scope.relationId,input.scope.userIdentityId,input.scope.conversationId].every(Boolean)) return false;
  const read = loadKnowledgeClaims(), continuity = loadCharacterContinuity();
  if (!read.valid || !continuity.valid) return false;
  const revision = sourceRevision(input.body), now = input.now ?? Date.now();
  const key = JSON.stringify([input.scope.characterId,input.scope.relationId,input.scope.userIdentityId,input.scope.conversationId,input.app,input.sourceId]);
  const claim: KnowledgeClaim = { ...input.scope, id: `experience:${sourceRevision(key)}:${revision}`, schemaVersion: 1,
    statement: experience.reflection, kind: "belief", subject: "character", temporalStatus: "past", truthStatus: "inferred",
    confidence: .5, userConfirmed: false, status: "active", visibility: "relation_private", admissionStatus: "retained",
    continuityVersion: 1, importance: 6, recordedAt: now,
    source: { kind: "automatic_summary", authorship: "character", app: input.app, producer: "character-experience.v1",
      sourceRecordId: input.sourceId, evidenceKey: key, evidenceQuote: experience.quote, retainedSnapshot: true,
      messageRevisions: { [input.sourceId]: revision }, experience } };
  if (isForgottenKnowledge(claim, continuity.value.forgotten)) return false;
  if (read.value.some(item => item.id === claim.id || item.source.evidenceKey === key && item.statement === claim.statement)) return true;
  const previous = read.value.filter(item => item.source.producer === "character-experience.v1" && item.source.evidenceKey === key && item.status === "active" && !item.supersededById);
  return previous.length ? supersedeMany(input.scope, previous.map(item => item.id), claim, "correction").success : appendMany([claim]).success;
}
