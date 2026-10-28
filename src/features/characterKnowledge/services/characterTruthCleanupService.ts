import {loadKnowledgeClaims} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {loadConversationSummaries} from "../../../core/storage/repositories/conversationSummaryRepository";
import {loadBehaviorCorrections} from "../../../core/storage/repositories/behaviorCorrectionRepository";
import {loadCharacterContinuity,CHARACTER_CONTINUITY_KEY} from "../../../core/storage/repositories/characterContinuityRepository";
import {replaceMemoryStores,confirmMemoryPersistence} from "../../../core/storage/memoryStoreTransaction";
import {storageKeys} from "../../../core/storage/storageKeys";
import {MEMORY_INDEX_CLEANUP_KEY,readSemanticMemoryCleanupQueue,processSemanticMemoryCleanup} from "../../../core/storage/repositories/semanticMemoryIndexRepository";
import {createId} from "../../../core/id/createId";
import {MEMORY_MENTION_KEY,loadMemoryMentions} from "../../../core/storage/repositories/memoryMentionRepository";
import {invalidateMemoryCaches} from "../../../core/storage/memoryCacheInvalidation";

export interface CharacterTruthCleanupResult {
  durable?: Promise<{success:boolean}>;
  claimsRemoved: boolean;
  summariesRemoved: boolean;
  correctionsRemoved: boolean;
  continuityRemoved: boolean;
}
/** Relationship deletion is the privacy boundary, so all truth stores are cleared together. */
export function removeCharacterTruthForRelations(relationIds: readonly string[],characterIds:readonly string[]=[]): CharacterTruthCleanupResult {
  const claims=loadKnowledgeClaims(),summaries=loadConversationSummaries(),corrections=loadBehaviorCorrections(),continuity=loadCharacterContinuity();
  const removed=new Set(relationIds);
  const deletedCharacters=new Set(characterIds);
  const queue=readSemanticMemoryCleanupQueue();
  const mentions=loadMemoryMentions();
  if(!claims.valid||!summaries.valid||!corrections.valid||!continuity.valid||!queue.valid||!mentions.valid)return {claimsRemoved:false,summariesRemoved:false,correctionsRemoved:false,continuityRemoved:false};
  const store=continuity.value;
  const write=replaceMemoryStores({[storageKeys.characterKnowledgeClaims]:claims.value.filter(c=>!removed.has(c.relationId)&&!deletedCharacters.has(c.characterId)),
    [storageKeys.conversationSummaries]:summaries.value.filter(c=>!removed.has(c.relationId)&&!deletedCharacters.has(c.characterId)),[storageKeys.behaviorCorrections]:corrections.value.filter(c=>!removed.has(c.relationId)&&!deletedCharacters.has(c.characterId)),
    [MEMORY_INDEX_CLEANUP_KEY]:[...queue.value,{id:createId("memory-cleanup"),relationIds:[...relationIds],characterIds:[...characterIds]}],
    [MEMORY_MENTION_KEY]:mentions.value.filter(r=>!removed.has(r.scope.relationId)&&!deletedCharacters.has(r.scope.characterId)),
    [CHARACTER_CONTINUITY_KEY]:{...store,revision:store.revision+1,impressions:store.impressions.filter(c=>!removed.has(c.scope.relationId)&&!deletedCharacters.has(c.scope.characterId)),
      tasks:store.tasks.filter(c=>!removed.has(c.scope.relationId)&&!deletedCharacters.has(c.scope.characterId)),
      life:store.life.filter(c=>!deletedCharacters.has(c.characterId)),lifeStates:store.lifeStates?.filter(c=>!deletedCharacters.has(c.characterId)),
      lifeWitnesses:store.lifeWitnesses?.filter(c=>!deletedCharacters.has(c.ownerCharacterId)),forgotten:store.forgotten.filter(c=>!deletedCharacters.has(c.scope.characterId)),
      suppressedImpressions:store.suppressedImpressions?.filter(c=>!removed.has(c.scope.relationId)&&!deletedCharacters.has(c.scope.characterId))}});
  if(write.success){invalidateMemoryCaches();void processSemanticMemoryCleanup();}
  return {claimsRemoved:write.success,summariesRemoved:write.success,correctionsRemoved:write.success,continuityRemoved:write.success,...(write.durable?{durable:write.durable}:{})};
}
export async function removeCharacterTruthForRelationsDurable(relationIds:readonly string[],characterIds:readonly string[]=[]):Promise<CharacterTruthCleanupResult>{
  const result=removeCharacterTruthForRelations(relationIds,characterIds);
  const committed=await confirmMemoryPersistence({success:result.claimsRemoved&&result.summariesRemoved&&result.correctionsRemoved&&result.continuityRemoved});
  return committed.success?result:{claimsRemoved:false,summariesRemoved:false,correctionsRemoved:false,continuityRemoved:false};
}
