import type { Character, UserSettings,MemoryVaultSettings } from "../../../types";
import {archivePendingCompletedCall} from "./completedCallMemoryService";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { runForegroundCharacterContinuity } from "./characterContinuityService";
import { maintainStoredMemories } from "./memoryManagementService";
import { contributeSemanticDirectReplyTruthContext } from "./semanticMemoryRecallService";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { canWriteMemoryStorage } from "../../../core/storage/memoryWriterCoordination";
import {processSemanticMemoryCleanup} from "../../../core/storage/repositories/semanticMemoryIndexRepository";
import {isCompletingMemoryMigration} from "./completeMemoryMigrationService";
import {deferForegroundTask} from "../../../core/runtime/deferredForegroundTask";
import {archivePendingDiaryReflection,syncDiaryReflections} from "./diaryMemoryService";
import {ensureMemorySystemReady} from "./memorySystemService";
import {readMemorySystem} from "../../../core/storage/repositories/memorySystemRepository";

/** Runs independently of a chat screen. Visibility and durable daily leases bound all work. */
export function startCharacterContinuityRuntime(input: { characters: readonly Character[]; relationships: readonly CharacterRelationship[];
  settings: UserSettings; recallSettings?:MemoryVaultSettings; visible?: () => boolean; run?: typeof runForegroundCharacterContinuity }) {
  const runtimeStartedAt=Date.now();
  ensureMemorySystemReady([...input.characters],[...input.relationships]);
  let stopped = false; let running = false;let drainTimer:ReturnType<typeof setTimeout>|undefined;
  const visible = input.visible || (() => typeof document !== "undefined" && document.visibilityState === "visible");
  const evidence = () => {
    const rows=loadKnowledgeClaims().value.filter(c=>c.status==="active"&&!c.recallDisabled&&!c.organizationSourceId&&!c.organizationOriginal
      &&["user_message","offline_story"].includes(c.source.kind)&&c.source.messageIds?.length&&c.source.app!=="diary"&&!c.source.experience);
    return new Map(input.relationships.map(r=>[r.id,JSON.stringify(rows.filter(c=>c.relationId===r.id&&c.characterId===r.characterId&&c.userIdentityId===r.userIdentityId)
      .map(c=>[c.id,c.statement,c.source.messageRevisions]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))]));
  };
  let seenEvidence=evidence();
  const resetEvidence=()=>{seenEvidence=evidence();};
  const tick = async (explicit=false) => {
    if (stopped || running || isCompletingMemoryMigration() || !visible() || !canWriteMemoryStorage("phone_character_memory_continuity_v1")) return;
    const currentEvidence=evidence();
    const changed=new Set([...currentEvidence].filter(([id,value])=>{
      if(seenEvidence.get(id)===value)return false;
      const prior=new Map<string,string>((JSON.parse(seenEvidence.get(id)||"[]") as unknown[][]).map(row=>[String(row[0]),JSON.stringify(row)]));
      return (JSON.parse(value) as unknown[][]).some(row=>prior.get(String(row[0]))!==JSON.stringify(row));
    }).map(([id])=>id));
    seenEvidence=currentEvidence;
    if(!explicit&&!changed.size)return;
    const migrationRun=readMemorySystem().value.migrationRequests?.runId;
    const sameMigration=()=>migrationRun===readMemorySystem().value.migrationRequests?.runId&&!isCompletingMemoryMigration();
    running = true;
    let organizationAdvanced=false;
    try {
      maintainStoredMemories();
      syncDiaryReflections();
      if(sameMigration())await archivePendingDiaryReflection(input.settings);
      await processSemanticMemoryCleanup();
      for (const relation of input.relationships) {
        if (stopped || !sameMigration() || !visible()) break;
        if(!explicit&&!changed.has(relation.id))continue;
        const character = input.characters.find((record) => record.id === relation.characterId && !record.isContactInstance && !record.isGroupChat);
        if (!character || !relation.conversationId) continue;
        const scope = { characterId: relation.characterId, relationId: relation.id, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId };
        // Text extraction already judges value, facts and optional impressions in one response.
        // Reading or ticking this runtime must not purchase a second review.
        if (input.settings.memoryEmbedding?.enabled) {const indexing=await contributeSemanticDirectReplyTruthContext({ indexOnly: true, visible: true,
          configuration: input.settings.memoryEmbedding, retrieval: { scope, queryText: "", claims: loadKnowledgeClaims().value,
            summaries: loadConversationSummaries().value, corrections: [], scenario: "private" } });
          organizationAdvanced ||= "indexHasMore" in indexing&&indexing.indexHasMore===true;
        }
      }
    } finally {
      running = false;
      if(organizationAdvanced&&!stopped&&visible())drainTimer=setTimeout(()=>void tick(),250);
    }
  };
  let cancelTick = () => {};
  const advanceLife = async (event: Event) => {
    const detail=(event as CustomEvent<{characterId:string;userIdentityId:string;relationId:string}>).detail;
    if(!detail)return;
    if(stopped||running||isCompletingMemoryMigration()||!visible()||!canWriteMemoryStorage("phone_character_memory_continuity_v1")){document.dispatchEvent(new CustomEvent("fanfanji:life-advance-result",{detail:{...detail,result:"limited"}}));return;}
    const relation=input.relationships.find(r=>r.id===detail.relationId&&r.characterId===detail.characterId&&r.userIdentityId===detail.userIdentityId);
    const character=input.characters.find(c=>c.id===relation?.characterId&&!c.isGroupChat&&!c.isContactInstance);
    if(!relation?.conversationId||!character)return;
    running=true;
    try {const result=await (input.run||runForegroundCharacterContinuity)({character,scope:{characterId:character.id,userIdentityId:relation.userIdentityId,relationId:relation.id,conversationId:relation.conversationId},settings:input.settings,visible:true,intent:"life",singlePass:true});
      document.dispatchEvent(new CustomEvent("fanfanji:life-advance-result",{detail:{...detail,result}}));
    } catch {document.dispatchEvent(new CustomEvent("fanfanji:life-advance-result",{detail:{...detail,result:"failed"}}));} finally {running=false;}
  };
  const trigger = () => { cancelTick(); cancelTick = deferForegroundTask(() => { void tick(); }); };
  let callRunning=false;
  const resumeCalls=async()=>{
    if(stopped||callRunning||isCompletingMemoryMigration()||!visible())return;
    callRunning=true;
    try{await archivePendingCompletedCall({...input,visible:true,notBefore:runtimeStartedAt});}catch{/* durable source tasks remain retryable */}
    finally{callRunning=false;}
  };
  let cancelCalls = () => {};
  const scheduleCalls = () => { cancelCalls(); cancelCalls = deferForegroundTask(() => { void resumeCalls(); }); };
  const timer = setInterval(trigger, 5 * 60_000);
  const callTimer=setInterval(scheduleCalls,30_000);
  if (typeof document !== "undefined") {
    document.addEventListener("fanfanji:life-advance", advanceLife);
    document.addEventListener("fanfanji:memory-migration-finished", resetEvidence);
    document.addEventListener("visibilitychange", trigger);
    document.addEventListener("visibilitychange",scheduleCalls);
    document.addEventListener("fanfanji:memory-evidence-updated", trigger);
  }
  trigger();
  scheduleCalls();
  return { check:()=>tick(false), tick:()=>tick(true), stop: () => {
    stopped = true; cancelTick(); cancelCalls(); clearInterval(timer);clearInterval(callTimer);if(drainTimer)clearTimeout(drainTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("fanfanji:life-advance", advanceLife);
      document.removeEventListener("fanfanji:memory-migration-finished", resetEvidence);
      document.removeEventListener("visibilitychange", trigger);
      document.removeEventListener("visibilitychange",scheduleCalls);
      document.removeEventListener("fanfanji:memory-evidence-updated", trigger);
    }
  } };
}
