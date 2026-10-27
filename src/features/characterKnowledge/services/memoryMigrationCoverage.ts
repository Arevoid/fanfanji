import {readJson} from "../../../core/storage/storageAdapter";
import {loadKnowledgeClaims} from "../../../core/storage/repositories/characterKnowledgeRepository";
import type {KnowledgeClaim} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {readMemoryOrganization} from "./memoryOrganizationService";
import {organizationSourceRevision,finalizeLegacySourceCutover} from "../../../domain/characterKnowledge/knowledgeOrganization";
import {readMemorySystem} from "../../../core/storage/repositories/memorySystemRepository";
/** Historical presence alone must not keep a completed migration visible. */
export function hasUnprocessedLegacyMemory(){
 const settled=readMemorySystem();if(settled.valid&&(settled.value.migrationFinished||settled.value.choice==="declined"))return false;
 const coverage=readMemoryMigrationCoverage(),system=readMemorySystem(),claims=loadKnowledgeClaims();
 if(!coverage.valid||!system.valid||!claims.valid)return true;
 if(coverage.pending+coverage.awaitingReview+coverage.missing>0)return true;
 if(coverage.total>0)return false;
 if(claims.value.some(c=>c.status==="active"&&!c.recallDisabled&&!c.supersededById&&c.admissionStatus!=="skipped"&&!(c.intervention&&c.admissionStatus==="retained")&&c.legacyCompatible))return true;
 return coverage.total===0&&system.value.hasLegacy&&system.value.choice!=="accepted";
}
/** Counts only sources in the consent snapshot; new chat writes don't move the goalpost. */
export function readMemoryMigrationCoverage(){
 const snapshot=readJson<{claims?:KnowledgeClaim[]}>("phone_memory_continuity_legacy_snapshot_v1",{}),live=loadKnowledgeClaims(),organization=readMemoryOrganization();
 if(!snapshot.valid||!snapshot.value||snapshot.value.claims!==undefined&&!Array.isArray(snapshot.value.claims)||!live.valid||!organization.valid)return {valid:false,total:0,organized:0,preserved:0,filtered:0,inactive:0,pending:0,awaitingReview:0,missing:0,savedBatches:0,failedBatches:0};
 const sources=snapshot.value.claims||[];
 const projected=finalizeLegacySourceCutover(live.value,organization.value.processed,new Set(organization.value.reviewIds));
 let organized=0,preserved=0,filtered=0,inactive=0,pending=0,awaitingReview=0,missing=0;
 const organizedSourceIds:string[]=[];
 for(const source of sources){
  const current=projected.find(c=>c.id===source.id||c.mergedClaimIds?.includes(source.id));
  if(!current){missing++;continue;}
  if(current.status!=="active"||current.recallDisabled||current.supersededById){inactive++;continue;}
  if(current.legacyCompatible&&current.organizationOriginal&&(organization.value.processed[current.id]===organizationSourceRevision(current)
    ||organization.value.unresolved?.[current.id]?.revision===organizationSourceRevision(current)&&organization.value.unresolved[current.id].attempts>=3)){preserved++;continue;}
  if(current.admissionStatus==="skipped"){filtered++;continue;}
  const children=live.value.filter(c=>c.organizationSourceId===current.id&&c.status==="active"&&!c.recallDisabled);
  if(organization.value.processed[current.id]===organizationSourceRevision(current)&&!current.legacyCompatible
    &&(current.admissionStatus==="retained"||children.length>0&&children.every(c=>c.admissionStatus==="retained"||c.admissionStatus==="skipped"))||current.coreMemory||current.source.kind==="manual"||current.intervention&&current.admissionStatus==="retained"){organized++;organizedSourceIds.push(source.id);}
  else if(organization.value.processed[current.id]===organizationSourceRevision(current)||organization.value.unresolved?.[current.id]?.revision===organizationSourceRevision(current)&&organization.value.unresolved[current.id].attempts>=3)awaitingReview++;
  else pending++;
 }
 const batches=organization.value.jobs.filter(job=>job.migration);
 return {valid:true,total:sources.length,organized,organizedSourceIds,preserved,filtered,inactive,pending,awaitingReview,missing,savedBatches:batches.filter(j=>j.status==="completed").length,failedBatches:batches.filter(j=>j.status==="failed").length};
}
