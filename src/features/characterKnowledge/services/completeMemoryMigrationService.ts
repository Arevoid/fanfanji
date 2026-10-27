import { isLegacyMigrationSource } from "./memoryMigrationEstimate";
import type { Character, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { migrateMemoryContinuity } from "./memoryContinuityMigrationService";
import { organizeLegacyMemory, readMemoryOrganization,MEMORY_MIGRATION_REQUEST_TIMEOUT_MS,MEMORY_ORGANIZATION_POLICY_VERSION } from "./memoryOrganizationService";
import { createMemorySettingReviewer } from "./memorySettingReviewService";
import { maintainStoredMemories } from "./memoryManagementService";
import { readJson, writeJson } from "../../../core/storage/storageAdapter";
import { MEMORY_ORGANIZATION_KEY } from "./memoryOrganizationService";
import type { MemoryOrganizationFailure } from "./memoryOrganizationFailure";
import { readMemoryMigrationBudget, withMemoryMigrationBudget } from "./memoryMigrationBudgetService";
import {chooseMemoryMigration,readMemorySystem} from "../../../core/storage/repositories/memorySystemRepository";
import {beginMigrationRequests,trackedMigrationRequest} from "./memoryMigrationRequests";
import {readMemoryMigrationCoverage} from "./memoryMigrationCoverage";
import {resolveCharacterTextSettings} from "../../../domain/character/characterTextApiRouting";
import {finalizeMemoryMigration} from "./memoryMigrationFinalization";
import {organizationSourceRevision} from "../../../domain/characterKnowledge/knowledgeOrganization";
import {ensureMemorySystemReady} from "./memorySystemService";
import {reconcileLegacySourceCutover} from "./memoryOrganizationService";

export interface MigrationOrganizationProgress { completed: number; total: number; status: "running"|"completed"|"needs_review"|"failed";alreadyProcessed?:boolean;failure?:MemoryOrganizationFailure; }
let active: Promise<MigrationOrganizationProgress> | undefined;
export const isCompletingMemoryMigration=()=>Boolean(active);
/** Confirm owns the entire pipeline, rather than merely scheduling one background batch. */
export function completeMemoryMigration(input: { characters: Character[]; relationships: CharacterRelationship[]; settings?: UserSettings;
  consent: boolean; onProgress?: (progress: MigrationOrganizationProgress) => void;
  organize?: typeof organizeLegacyMemory }): Promise<MigrationOrganizationProgress> {
  if(active)return active;
  if(readMemorySystem().value.migrationFinished)return Promise.resolve({completed:0,total:0,status:"completed",alreadyProcessed:true});
  let organizedBefore:string[]=[];
  const task=async()=>{
    if(!ensureMemorySystemReady(input.characters,input.relationships).success||input.consent&&!chooseMemoryMigration("accepted").success)return {completed:0,total:0,status:"failed" as const,failure:{code:"storage" as const}};
    const session=beginMigrationRequests();
    if(!session.success)return {completed:0,total:0,status:"failed" as const,failure:{code:"storage" as const}};
    const migrationRequest=trackedMigrationRequest(session.runId);
    const base=await migrateMemoryContinuity({characters:input.characters,relationships:input.relationships,consent:input.consent});
    maintainStoredMemories();
    if(!reconcileLegacySourceCutover().success)return {completed:0,total:0,status:"failed" as const,failure:{code:"storage" as const}};
    const legacySourceIds=new Set((readJson<{claims?:import("../../../domain/characterKnowledge/characterKnowledgeTypes").KnowledgeClaim[]}>("phone_memory_continuity_legacy_snapshot_v1",{}).value.claims||[]).filter(isLegacyMigrationSource).map(c=>c.id));
    const scopes=[...new Map(loadKnowledgeClaims().value.filter(claim=>claim.status==="active"&&!claim.recallDisabled).map(claim=>{
      const scope={characterId:claim.characterId,relationId:claim.relationId,userIdentityId:claim.userIdentityId,conversationId:claim.conversationId};
      return [JSON.stringify([scope.characterId,scope.relationId,scope.userIdentityId,scope.conversationId]),scope] as const;
    })).entries()];
    organizedBefore=readMemoryMigrationCoverage().organizedSourceIds||[];
    let completed=0;let review=base?.status==="needs_review";let failed=false;let consecutiveFailures=0;
    let failure:MemoryOrganizationFailure|undefined;
    const report=(status:MigrationOrganizationProgress["status"])=>{const progress={completed,total:scopes.length,status,...(status==="failed"?{failure:failure||{code:"unknown" as const}}:{})};input.onProgress?.(progress);return progress;};
    report("running");
    if(!base||!["completed","needs_review"].includes(base.status)||!input.settings){failure={code:!input.settings?"missing_api":"storage"};return report("failed");}
    const settings=input.settings;
    const organization=readMemoryOrganization();
    if(!organization.valid){failure={code:"storage"};return report("failed");}
    if(organization.value.migrationPolicyVersion!==MEMORY_ORGANIZATION_POLICY_VERSION&&!writeJson(MEMORY_ORGANIZATION_KEY,{...organization.value,migrationPolicyVersion:MEMORY_ORGANIZATION_POLICY_VERSION,
      migrationScopes:{},processed:{},offsets:{},associated:{},valueReviewed:{},unresolved:{},reviewIds:[]}).success){failure={code:"storage"};return report("failed");}
    let stop=false;
    const runScope=async([key,scope]:typeof scopes[number])=>{
      const character=input.characters.find(record=>record.id===scope.characterId);
      if(!character){review=true;return;}
      const prior=readMemoryOrganization();
      // A global resume is not an instruction to re-review unchanged held
      // evidence. Explicit per-source retry in the review UI owns that reset.
      const changedSource=loadKnowledgeClaims().value.some(c=>c.characterId===scope.characterId&&c.relationId===scope.relationId&&c.userIdentityId===scope.userIdentityId&&c.conversationId===scope.conversationId
        &&c.status==="active"&&!c.recallDisabled&&!c.supersededById&&!c.organizationSourceId&&!c.coreMemory&&c.source.kind!=="manual"
        &&(c.legacyCompatible||c.organizationOriginal||c.source.kind==="legacy_memory"||c.source.kind==="import"||c.admissionStatus==="review")
        &&prior.value.processed[c.id]!==organizationSourceRevision(c)
        &&!(prior.value.unresolved?.[c.id]?.revision===organizationSourceRevision(c)&&prior.value.unresolved[c.id].attempts>=3));
      if(prior.value.migrationScopes?.[key]&&changedSource){
        const migrationScopes={...prior.value.migrationScopes};delete migrationScopes[key];
        if(!writeJson(MEMORY_ORGANIZATION_KEY,{...prior.value,migrationScopes}).success){failed=true;failure={code:"storage"};stop=true;return;}
      }
      let iterations=0;
      let waitingSince=Date.now();
      while(!stop&&!readMemoryOrganization().value.migrationScopes?.[key]){
        if(!resolveCharacterTextSettings(settings,character).apiKey){failed=true;failure={code:"missing_api"};break;}
        const budget=readMemoryMigrationBudget();
        if(!budget.valid||budget.value.paused||budget.value.used>=budget.value.limit){failed=true;failure={code:"budget"};stop=true;break;}
        const result=await (input.organize||organizeLegacyMemory)({scope,settings,request:migrationRequest,sourceIds:[...legacySourceIds],visible:true,migrationDrain:true,singlePassMigration:true,retryFailedMigration:true,
          reviewAuthorizedSettings:createMemorySettingReviewer(character,scope,"chat",settings,withMemoryMigrationBudget(),{maxOutputTokens:8192,timeoutMs:MEMORY_MIGRATION_REQUEST_TIMEOUT_MS,assessRetention:true})});
        if(result==="limited"&&Date.now()-waitingSince<125_000){await new Promise(resolve=>setTimeout(resolve,500));continue;}
        if(result!=="completed"||++iterations>1000){failed=true;failure=result==="limited"?{code:"busy"}:readMemoryOrganization().value.jobs.filter(job=>job.owner===JSON.stringify([scope.characterId,scope.userIdentityId])&&job.status==="failed").at(-1)?.failure||{code:"unknown"};break;}
        waitingSince=Date.now();
        report("running");
      }
      if(!readMemoryOrganization().value.migrationScopes?.[key]){
        if(!stop&&++consecutiveFailures>=3)stop=true;
        return;
      }
      consecutiveFailures=0;
      review ||=readMemoryOrganization().value.migrationScopes?.[key]==="needs_review";
      completed++;report("running");
    };
    // Independent owners can progress together. Relationships of the same
    // character/identity keep the existing owner lock and run in order.
    const owners=new Map<string,typeof scopes>();
    for(const entry of scopes){const scope=entry[1],owner=JSON.stringify([scope.characterId,scope.userIdentityId]);owners.set(owner,[...(owners.get(owner)||[]),entry]);}
    const groups=[...owners.values()];let next=0;
    const worker=async()=>{while(!stop){const group=groups[next++];if(!group)return;for(const entry of group){if(stop)return;await runScope(entry);}}};
    await Promise.all(Array.from({length:Math.min(2,groups.length)},()=>worker()));
    return report(failed?"failed":review?"needs_review":"completed");
  };
  active=Promise.resolve().then(task).catch(()=>({completed:0,total:0,status:"failed" as const,failure:{code:"unknown" as const}})).then(result=>{
    if(result.failure?.code!=="storage"&&readMemorySystem().value.choice==="accepted"&&!finalizeMemoryMigration({organizedBefore,failure:result.failure}).success)
      return {completed:result.completed,total:result.total,status:"failed" as const,failure:{code:"storage" as const}};
    return result;
  }).finally(()=>{active=undefined;});return active;
}
