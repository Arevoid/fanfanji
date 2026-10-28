import { loadMemories } from "../../../core/storage/repositories/memoryRepository";
import {loadDiaryEntries} from "../../../core/storage/repositories/diaryRepository";
import { loadKnowledgeClaims, saveKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { maintainKnowledgeRetention } from "../../../domain/characterKnowledge/knowledgeRetentionPolicy";
import {assessKnowledgeValue} from "../../../domain/characterKnowledge/knowledgeValueAssessment";
import type { CharacterTruthScope } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
export function setCoreMemory(id: string, scope: CharacterTruthScope, pinned: boolean,relatedIds:readonly string[]=[]) {
  const read = loadKnowledgeClaims();
  const target = read.value.find((claim) => claim.id === id && isExactTruthScope(claim, scope));
  if (!read.valid || !target || target.status !== "active") return { success: false, error: "validation" as const };
  return saveKnowledgeClaims(read.value.map((claim) => claim.status==="active"&&isExactTruthScope(claim,scope)&&(claim.id===id||relatedIds.includes(claim.id)) ? { ...claim, coreMemory: pinned, archivedAt: undefined }:claim));
}
export function maintainStoredMemories(now = Date.now()) {
  const read = loadKnowledgeClaims(); if (!read.valid) return { success: false, error: "validation" as const };
  const reviewed=read.value.map(claim=>claim.legacyCompatible?claim:claim.status==="active"&&(claim.source.kind==="manual"||claim.coreMemory)?{...claim,admissionStatus:"retained" as const}:claim.status!=="active"||claim.admissionStatus!==undefined?claim:
    assessKnowledgeValue(claim,claim.valueAssessment).claim);
  const next = maintainKnowledgeRetention(reviewed, now);
  if (JSON.stringify(next) === JSON.stringify(read.value)) return { success: true };
  return saveKnowledgeClaims(next);
}
export const getRemainingLegacyMemories = () => loadMemories([]).value;
/** Browsing only: diary bodies never become retrieval documents. */
export const getMemoryDiaryHistory=(identityId:string,characterId:string,relationId:string,query:string)=>loadDiaryEntries().value.filter(entry=>entry.authorType==="character"&&entry.ownerIdentityId===identityId
 &&(characterId==="all"||entry.characterId===characterId)&&(relationId==="all"||entry.relationId===relationId)
 &&`${entry.title||""}\n${entry.body}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>b.createdAt-a.createdAt);
export { loadCharacterContinuity as readMemoryContinuityBackup } from "../../../core/storage/repositories/characterContinuityRepository";
export { confirmMemoryPersistence } from "../../../core/storage/memoryStoreTransaction";
