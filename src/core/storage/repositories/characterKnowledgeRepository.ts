import type { CharacterTruthScope, KnowledgeClaim, KnowledgeSourceRef } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  appendKnowledgeClaims,
  deduplicateKnowledgeClaims,
  deduplicateKnowledgeClaimsByMeaning,
  isExactTruthScope,
  removeKnowledgeClaimsByRelations,
  retractKnowledgeClaimsBySourceMessageIds,
  retractKnowledgeClaimsBySourceStoryIds,
  retractKnowledgeClaim,
  supersedeKnowledgeClaim,
} from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { normalizeKnowledgeClaim } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { markConversationSummariesStaleBySourceClaimIds } from "./conversationSummaryRepository";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";
import { loadCharacterContinuity } from "./characterContinuityRepository";
import { isForgottenKnowledge } from "../../../domain/memory/characterContinuity";
import { reconcileOrganizedKnowledge, unprojectOrganizedKnowledge } from "../../../domain/characterKnowledge/knowledgeOrganization";
import { copySemanticTransitionAuthorization } from "../../../domain/characterKnowledge/semanticTransitionReview";
import {removeMentionsForReplies} from "./memoryMentionRepository";
import { readJson } from "../storageAdapter";
import {loadDiaryEntries} from "./diaryRepository";
import {sourceRevision} from "../../../domain/characterKnowledge/knowledgeEvolution";
import { loadCoReadingStore } from "./readingCoReadingRepository";
import { loadCommittedCinemaStore } from "./cinemaRepository";
import { loadForumReplies } from "./forumRepository";
import { loadOfflineStories, readOfflineSourceStories } from "./offlineRepository";
import { reconcileOfflineSources } from "../../../domain/characterKnowledge/offlineSourceValidity";

const loadRawClaims = (): StorageResult<unknown[]> => readArray<unknown>(storageKeys.characterKnowledgeClaims, []);

export function normalizeKnowledgeClaims(values: readonly unknown[]): KnowledgeClaim[] {
  return reconcileOrganizedKnowledge(deduplicateKnowledgeClaimsByMeaning(deduplicateKnowledgeClaims(values
    .map((value) => normalizeKnowledgeClaim(value && typeof value === "object" ? unprojectOrganizedKnowledge(value as KnowledgeClaim) : value))
    .filter((claim): claim is KnowledgeClaim => claim !== undefined))));
}

export const loadKnowledgeClaims = (): StorageResult<KnowledgeClaim[]> => {
  const result = loadRawClaims();
  const base=normalizeKnowledgeClaims(result.value);
  const stories=base.some(claim=>claim.source.storyId)?loadOfflineStories([]):undefined;
  const liveStories=readOfflineSourceStories();
  const normalized=liveStories?reconcileOfflineSources(base,liveStories):stories?.valid?reconcileOfflineSources(base,stories.value):base;
  const diaries=normalized.some(claim=>claim.source.producer==="diary-reflection.v1")?loadDiaryEntries():undefined;
  const experiences = normalized.filter(claim => claim.source.producer === "character-experience.v1");
  const reading = experiences.some(claim => claim.source.app === "reading") ? loadCoReadingStore() : undefined;
  const cinema = experiences.some(claim => claim.source.app === "cinema") ? loadCommittedCinemaStore() : undefined;
  const forum = experiences.some(claim => claim.source.app === "forum") ? loadForumReplies() : undefined;
  const sourceCurrent = (claim: KnowledgeClaim) => {
    const id = claim.source.sourceRecordId;
    const sameBody = (body?: string) => typeof body === "string" && sourceRevision(body) === claim.source.messageRevisions?.[id!];
    if (claim.source.app === "reading") return reading?.valid && [...reading.value.comments, ...reading.value.discussionMessages].some(row =>
      row.id === id && row.author === "ai" && row.characterId === claim.characterId && row.userIdentityId === claim.userIdentityId
      && row.relationId === claim.relationId && row.conversationId === claim.conversationId && sameBody(row.body));
    if (claim.source.app === "cinema") return cinema?.valid && cinema.value.discussions.some(row => row.id === id
      && row.characterId === claim.characterId && row.userIdentityId === claim.userIdentityId && row.relationId === claim.relationId
      && row.conversationId === claim.conversationId && sameBody(row.characterText));
    if (claim.source.app === "forum") return forum?.valid && forum.value.some(row => row.id === id && !row.isDeleted
      && row.ownerIdentityId === claim.userIdentityId && ["ai-character","ai-character-anonymous"].includes(row.source) && sameBody(row.body));
    return true;
  };
  return { ...result, value: normalized.map(claim => {
    if (claim.source.producer === "character-experience.v1" && !sourceCurrent(claim)) return { ...claim, status: "retracted" as const, truthStatus: "retracted" as const, retractionReason: "experience_source_changed" };
    return claim.source.producer==="diary-reflection.v1"&&(!diaries?.valid||!diaries.value.some(entry=>entry.id===claim.source.sourceRecordId&&entry.characterId===claim.characterId&&entry.ownerIdentityId===claim.userIdentityId&&entry.relationId===claim.relationId&&entry.conversationId===claim.conversationId&&sourceRevision(entry.body)===claim.source.messageRevisions?.[entry.id]))?{...claim,status:"retracted" as const,truthStatus:"retracted" as const,retractionReason:"diary_source_changed"}:claim;
  }) };
};

export const saveKnowledgeClaims = (claims: readonly KnowledgeClaim[]): StorageWriteResult =>
  writeArray(storageKeys.characterKnowledgeClaims, normalizeKnowledgeClaims(claims));

const saveKnowledgeClaimsAfterMutation = (
  previous: readonly KnowledgeClaim[],
  next: readonly KnowledgeClaim[],
): StorageWriteResult => {
  const write = saveKnowledgeClaims(next);
  if (!write.success) return write;
  const nextById = new Map(next.map((claim) => [claim.id, claim]));
  const invalidatedSummaryClaimIds = previous
    .filter((claim) => claim.status === "active" && (!nextById.has(claim.id) || nextById.get(claim.id)?.status === "retracted"))
    .map((claim) => claim.id);
  if (invalidatedSummaryClaimIds.length > 0) {
    const summaryWrite = markConversationSummariesStaleBySourceClaimIds(invalidatedSummaryClaimIds);
    if (!summaryWrite.success) {
      // Retrieval also validates source claims, so a cache write failure never
      // turns a retracted claim back into usable truth.
      console.warn("[character truth] Failed to mark derived summaries stale:", summaryWrite.error);
    }
  }
  return write;
};

export const listByRelation = (
  scope: CharacterTruthScope,
  claims: readonly KnowledgeClaim[] = loadKnowledgeClaims().value,
): KnowledgeClaim[] => claims.filter((claim) => isExactTruthScope(claim, scope));

export const findBySource = (
  scope: CharacterTruthScope,
  source: Partial<Pick<KnowledgeSourceRef, "kind" | "evidenceKey" | "eventId" | "storyId" | "sourceRecordId">>,
  claims: readonly KnowledgeClaim[] = loadKnowledgeClaims().value,
): KnowledgeClaim[] => listByRelation(scope, claims).filter((claim) =>
  (source.kind === undefined || claim.source.kind === source.kind)
  && (source.evidenceKey === undefined || claim.source.evidenceKey === source.evidenceKey)
  && (source.eventId === undefined || claim.source.eventId === source.eventId)
  && (source.storyId === undefined || claim.source.storyId === source.storyId)
  && (source.sourceRecordId === undefined || claim.source.sourceRecordId === source.sourceRecordId));

export const appendToKnowledgeClaims = (
  existing: readonly KnowledgeClaim[],
  incoming: readonly KnowledgeClaim[],
): KnowledgeClaim[] => reconcileOrganizedKnowledge(appendKnowledgeClaims(normalizeKnowledgeClaims(existing), incoming
  .map((raw) => { const claim = normalizeKnowledgeClaim(raw); if (claim) copySemanticTransitionAuthorization(raw, claim); return claim; })
  .filter((claim): claim is KnowledgeClaim => claim !== undefined)));

export const append = (claim: KnowledgeClaim): StorageWriteResult =>
  appendMany([claim]);

export const appendMany = (claims: readonly KnowledgeClaim[]): StorageWriteResult => {
  const read = loadKnowledgeClaims();
  const continuity = loadCharacterContinuity();
  if (!read.valid || !continuity.valid) return { success: false, error: "validation" };
  const pending=readJson<{targets:{id:string;characterId:string;relationId?:string;conversationId?:string}[]} | null>("phone_memory_source_mutation_v1",null);
  if(!pending.valid||pending.value&&(!Array.isArray(pending.value.targets)||claims.some(claim=>pending.value!.targets.some(target=>claim.characterId===target.characterId&&claim.relationId===target.relationId&&claim.conversationId===target.conversationId&&claim.source.messageIds?.includes(target.id)))))return {success:false,error:"validation"};
  const admitted = claims.filter((claim) => !isForgottenKnowledge(claim, continuity.value.forgotten));
  return saveKnowledgeClaimsAfterMutation(read.value, appendToKnowledgeClaims(read.value, admitted));
};

export const supersede = (
  scope: CharacterTruthScope,
  previousClaimId: string,
  replacement: KnowledgeClaim,
  mode: "correction" | "change" = "correction",
): StorageWriteResult => {
  const previous = loadKnowledgeClaims().value;
  return saveKnowledgeClaimsAfterMutation(previous, supersedeKnowledgeClaim(
    previous,
    scope,
    previousClaimId,
    replacement,
    mode,
  ));
};

export const retract = (
  scope: CharacterTruthScope,
  claimId: string,
  reason: string,
): StorageWriteResult => {
  const previous = loadKnowledgeClaims().value;
  return saveKnowledgeClaimsAfterMutation(previous, retractKnowledgeClaim(previous, scope, claimId, reason));
};

/** One storage mutation for a visibly grouped proposition; never cross a scope. */
export const retractMany = (scope:CharacterTruthScope,claimIds:readonly string[],reason:string):StorageWriteResult=>{
  const previous=loadKnowledgeClaims().value;
  const next=claimIds.reduce((records,id)=>retractKnowledgeClaim(records,scope,id,reason),previous);
  return saveKnowledgeClaimsAfterMutation(previous,next);
};
export const supersedeMany = (scope:CharacterTruthScope,claimIds:readonly string[],replacement:KnowledgeClaim,mode:"correction"|"change"="correction"):StorageWriteResult=>{
  const previous=loadKnowledgeClaims().value;
  const targets=previous.filter(claim=>claimIds.includes(claim.id)&&isExactTruthScope(claim,scope)&&claim.status==="active").sort((a,b)=>claimIds.indexOf(a.id)-claimIds.indexOf(b.id));
  if(!targets.length)return {success:false,error:"missing"};
  const next=supersedeKnowledgeClaim(previous,scope,targets[0].id,{...replacement,...(targets.some(c=>c.coreMemory)?{coreMemory:true}:{})},mode);
  if(!next.some(c=>c.id===replacement.id))return {success:false,error:"validation"};
  const ids=new Set(targets.map(c=>c.id));
  return saveKnowledgeClaimsAfterMutation(previous,next.map(claim=>ids.has(claim.id)?{...claim,
    supersededById:replacement.id,truthStatus:mode==="change"?claim.truthStatus:"retracted",status:mode==="change"?claim.status:"retracted",
    ...(mode==="change"?{validTo:replacement.recordedAt}:{}),retractionReason:mode==="change"?"fact_changed":"superseded"}:claim));
};

export const remove = (
  scope: CharacterTruthScope,
  claimId: string,
): StorageWriteResult => {
  const previous = loadKnowledgeClaims().value;
  const target = previous.find((claim) => claim.id === claimId && isExactTruthScope(claim, scope));
  if (!target) return { success: false, error: "missing" };
  return saveKnowledgeClaimsAfterMutation(previous, previous.filter((claim) => claim.id !== claimId));
};

export const removeByRelations = (relationIds: readonly string[]): StorageWriteResult =>
  saveKnowledgeClaims(removeKnowledgeClaimsByRelations(loadKnowledgeClaims().value, relationIds));
export const retractBySourceMessageIds = (messageIds: readonly string[], scope?: CharacterTruthScope): StorageWriteResult =>
  (() => {
    const mentionCleanup=removeMentionsForReplies(messageIds,scope);
    if(!mentionCleanup.success)return mentionCleanup;
    const previous = loadKnowledgeClaims().value;
    return saveKnowledgeClaimsAfterMutation(previous, retractKnowledgeClaimsBySourceMessageIds(previous, messageIds, scope));
  })();
export const retractBySourceStoryIds = (storyIds: readonly string[]): StorageWriteResult => {
  const previous = loadKnowledgeClaims().value;
  return saveKnowledgeClaimsAfterMutation(previous, retractKnowledgeClaimsBySourceStoryIds(previous, storyIds));
};

export const characterKnowledgeRepository = {
  load: loadKnowledgeClaims,
  save: saveKnowledgeClaims,
  listByRelation,
  findBySource,
  append,
  appendMany,
  supersede,
  retract,
  remove,
  removeByRelations,
  retractBySourceMessageIds,
  retractBySourceStoryIds,
};
