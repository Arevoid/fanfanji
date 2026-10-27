import type { Message } from "../../../types";
import { loadCommittedMessages, loadMessages, saveMessages, flushMessages } from "../../../core/storage/repositories/messageRepository";
import { loadKnowledgeClaims, normalizeKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { loadBehaviorCorrections } from "../../../core/storage/repositories/behaviorCorrectionRepository";
import { loadCharacterContinuity, CHARACTER_CONTINUITY_KEY } from "../../../core/storage/repositories/characterContinuityRepository";
import { loadMemories } from "../../../core/storage/repositories/memoryRepository";
import { loadMemoryMentions, MEMORY_MENTION_KEY } from "../../../core/storage/repositories/memoryMentionRepository";
import { readJson } from "../../../core/storage/storageAdapter";
import { replaceMemoryStores } from "../../../core/storage/memoryStoreTransaction";
import { storageKeys } from "../../../core/storage/storageKeys";
import { retractKnowledgeClaimsBySourceMessageIds } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { invalidateMemoryCaches } from "../../../core/storage/memoryCacheInvalidation";

export const SOURCE_MUTATION_KEY = "phone_memory_source_mutation_v1";
interface SourceMutation { version: 1; ids: string[]; targets: Message[]; replacements: Message[] }
const sameSource=(a:Message,b:Message)=>a.id===b.id&&a.characterId===b.characterId&&a.relationId===b.relationId&&a.conversationId===b.conversationId;
const patch = (messages: readonly Message[], operation: SourceMutation) => [
  ...messages.filter(message => !operation.targets.some(target=>sameSource(message,target))), ...operation.replacements,
].sort((a,b)=>a.timestamp-b.timestamp||a.id.localeCompare(b.id));
let busy = false;

/** Memory invalidation and durable source intent commit together. Until the source
 * write finishes, no withdrawn evidence can re-enter a prompt. Startup replays the
 * exact intent before mounting the app; failed writes never lose the intent. */
export async function recoverSourceMessageMutation(): Promise<boolean> {
  const read = readJson<SourceMutation | undefined>(SOURCE_MUTATION_KEY, undefined);
  if (!read.valid) return false;
  if (!read.value) return true;
  const op=read.value;
  if(op.version!==1||!Array.isArray(op.ids)||!op.ids.every(id=>typeof id==="string")||!Array.isArray(op.targets)||op.targets.some(m=>!m||typeof m.id!=="string")||!Array.isArray(op.replacements)
    ||op.replacements.some(message=>!message||typeof message.id!=="string"||typeof message.content!=="string"||!op.targets.some(target=>target.characterId===message.characterId&&target.relationId===message.relationId&&target.conversationId===message.conversationId)))return false;
  const source=await loadCommittedMessages();if(!source.valid)return false;
  if(!saveMessages(patch(source.value,op)).success||!(await flushMessages()).success)return false;
  return replaceMemoryStores({[SOURCE_MUTATION_KEY]:null}).success;
}

export async function mutateSourceMessages(targets: readonly Message[], replacements: readonly Message[] = []): Promise<boolean> {
  if(busy||!targets.length)return false;
  busy=true;
  try {
    if(!await recoverSourceMessageMutation())return false;
    const current=loadMessages([]);
    if(!current.valid||targets.some(target=>!current.value.some(message=>sameSource(message,target)&&JSON.stringify(message)===JSON.stringify(target))))return false;
    const claims=loadKnowledgeClaims(),summaries=loadConversationSummaries(),corrections=loadBehaviorCorrections(),continuity=loadCharacterContinuity(),legacy=loadMemories([]),mentions=loadMemoryMentions();
    if(!claims.valid||!summaries.valid||!corrections.valid||!continuity.valid||!legacy.valid||!mentions.valid)return false;
    const ids=targets.map(message=>message.id),removed=new Set(ids);
    if(new Set(replacements.map(message=>message.id)).size!==replacements.length||replacements.some(message=>!targets.some(target=>target.characterId===message.characterId&&target.relationId===message.relationId&&target.conversationId===message.conversationId)
      ||current.value.some(existing=>existing.id===message.id&&!targets.some(target=>sameSource(existing,target)))))return false;
    const next=normalizeKnowledgeClaims(claims.value.flatMap(claim=>{
      const sourceIds=targets.filter(target=>target.characterId===claim.characterId&&target.relationId===claim.relationId&&target.conversationId===claim.conversationId).map(target=>target.id);
      return retractKnowledgeClaimsBySourceMessageIds([claim],sourceIds,claim);
    }));
    const invalid=new Set(next.filter(claim=>claim.status!=="active"&&claims.value.some(old=>old.id===claim.id&&old.status==="active")).map(claim=>claim.id));
    for(let changed=true;changed;){
      changed=false;
      for(let index=0;index<next.length;index++){
        const claim=next[index];
        if(claim.status!=="active"||!claim.source.supportingClaimIds?.some(id=>invalid.has(id)&&next.some(source=>source.id===id&&source.characterId===claim.characterId&&source.relationId===claim.relationId&&source.userIdentityId===claim.userIdentityId&&source.conversationId===claim.conversationId)))continue;
        next[index]={...claim,status:"retracted",truthStatus:"retracted",retractionReason:"supporting_source_changed"};invalid.add(claim.id);changed=true;
      }
    }
    const scopeMatches=(record:{characterId?:string;relationId?:string;conversationId?:string})=>targets.some(message=>message.characterId===record.characterId&&message.relationId===record.relationId&&message.conversationId===record.conversationId);
    const written=replaceMemoryStores({
      // Replay only needs exact scope keys. Do not duplicate a large chat or
      // base64 image payload into the small synchronous recovery journal.
      [SOURCE_MUTATION_KEY]:{version:1,ids,targets:targets.map(({id,characterId,relationId,conversationId})=>({id,characterId,relationId,conversationId})),replacements},
      [storageKeys.characterKnowledgeClaims]:next,
      [storageKeys.conversationSummaries]:summaries.value.map(record=>scopeMatches(record)&&(record.sourceMessageIds.some(id=>removed.has(id))||record.sourceClaimIds.some(id=>invalid.has(id)))?{...record,status:"stale"}:record),
      [storageKeys.behaviorCorrections]:corrections.value.map(record=>scopeMatches(record)&&record.sourceMessageIds.some(id=>removed.has(id))?{...record,status:"retracted"}:record),
      [storageKeys.memoryVaultItems]:legacy.value.filter(record=>!record.sourceKnowledgeClaimIds?.some(id=>invalid.has(id))),
      [MEMORY_MENTION_KEY]:mentions.value.filter(record=>!scopeMatches(record.scope)||!removed.has(record.replyId.replace(/^chat:/u,""))&&!invalid.has(record.claimId)),
      [CHARACTER_CONTINUITY_KEY]:{...continuity.value,revision:continuity.value.revision+1,
        impressions:continuity.value.impressions.map(record=>scopeMatches(record.scope)&&record.sourceClaimIds.some(id=>invalid.has(id))?{...record,status:"invalid"}:record)},
    });
    if(!written.success)return false;
    invalidateMemoryCaches();
    return await recoverSourceMessageMutation();
  } finally {busy=false;}
}
