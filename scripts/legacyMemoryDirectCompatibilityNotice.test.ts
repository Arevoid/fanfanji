import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldShowLegacyOfflineReminder, dismissLegacyOfflineReminder, LEGACY_OFFLINE_REMINDER } from "../src/features/characterKnowledge/services/legacyMemoryCompatibilityNoticeService";
import { ensureMemorySystemReady } from "../src/features/characterKnowledge/services/memorySystemService";
import { loadKnowledgeClaims, saveKnowledgeClaims, appendMany } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { readMemorySystem } from "../src/core/storage/repositories/memorySystemRepository";
import { contributeDirectReplyTruthContext } from "../src/features/characterKnowledge/services/directReplyTruthContextContributor";
import { formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
const values=new Map<string,string>();let fail=false,requests=0;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{if(fail)throw Error("quota");values.set(key,value);},removeItem:(key:string)=>values.delete(key)}}});
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw Error("no paid migration allowed");};
try {
 assert.equal(ensureMemorySystemReady().success,true);
 assert.equal(shouldShowLegacyOfflineReminder(),false,"empty new user never sees old-user reminder");
 const scope={characterId:"a",userIdentityId:"u",relationId:"r",conversationId:"c"};
 const old:KnowledgeClaim={...scope,id:"old",statement:"用户一直害怕打雷。",kind:"fact",subject:"user",truthStatus:"asserted",temporalStatus:"present",
  confidence:.85,userConfirmed:false,recordedAt:1,status:"active",visibility:"relation_private",schemaVersion:1,
  source:{kind:"user_message",authorship:"user",messageIds:["old"],producer:"fixture",evidenceKey:"old"}};
 appendMany([{...old,id:"modern",continuityVersion:1,admissionStatus:"retained"}]);
 assert.equal(shouldShowLegacyOfflineReminder(),false,"new-system records do not create a legacy notice");
 values.clear();saveKnowledgeClaims([old]);ensureMemorySystemReady();
 const before=JSON.stringify(loadKnowledgeClaims().value);
 assert.equal(shouldShowLegacyOfflineReminder(),true,"old user sees reminder without approving migration");
 assert.equal(LEGACY_OFFLINE_REMINDER,"如果旧线下记忆有误，建议进入线下剧情重新手动修复同步记忆。");
 assert.match(formatTruthRetrievalForPrompt(contributeDirectReplyTruthContext({scope,claims:loadKnowledgeClaims().value,summaries:[],corrections:[],queryText:"打雷",now:100})),/害怕打雷/);
 fail=true;assert.equal(dismissLegacyOfflineReminder(),false);fail=false;
 assert.equal(shouldShowLegacyOfflineReminder(),true,"failed dismissal must remain retryable");
 assert.equal(dismissLegacyOfflineReminder(),true);
 ensureMemorySystemReady();assert.equal(shouldShowLegacyOfflineReminder(),false,"dismissal survives initialization/reopening");
 assert.equal(readMemorySystem().value.legacyOfflineReminderDismissed,true);
 assert.equal(JSON.stringify(loadKnowledgeClaims().value),before,"dismissal never edits or reorganizes memories");
 assert.equal(requests,0);
 const page=readFileSync(new URL("../src/components/AppMemory.tsx",import.meta.url),"utf8");
 const panel=readFileSync(new URL("../src/features/characterKnowledge/components/MemoryContinuityPanel.tsx",import.meta.url),"utf8");
 const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
 const runtime=readFileSync(new URL("../src/features/characterKnowledge/services/characterContinuityRuntime.ts",import.meta.url),"utf8");
 assert.match(page,/<LegacyMemoryCompatibilityNotice/);
 assert.doesNotMatch(page,/memory-legacy-entry|<MemoryPendingReview|<MemoryMigrationBudget|migrationRequestId/);
 assert.doesNotMatch(panel,/completeMemoryMigration|是否迁移旧记忆|runMigration/);
 assert.doesNotMatch(app,/<MemoryMigrationCompletion/);
 assert.doesNotMatch(runtime,/choice==="accepted"|sourceIds===undefined|migrationDrain:true/);
} finally {globalThis.fetch=originalFetch;}
console.log("PASS direct legacy compatibility, no API, one durable old-user reminder, no migration UI/background drain");
