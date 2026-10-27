import { readingAssetDb } from "../readingAssetDb";
import type { CharacterTruthScope } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isSemanticMemoryIndex, type SemanticMemoryIndex } from "../../../domain/memory/semanticMemoryIndex";
import { canWriteMemoryStorage } from "../memoryWriterCoordination";
import {readJson,writeJson} from "../storageAdapter";
export const MEMORY_INDEX_CLEANUP_KEY="phone_memory_index_cleanup_v1";
export interface MemoryIndexCleanupJob {id:string;relationIds:string[];characterIds:string[]}
export function readSemanticMemoryCleanupQueue(){
  const read=readJson<MemoryIndexCleanupJob[]>(MEMORY_INDEX_CLEANUP_KEY,[]);
  const valid=read.valid&&Array.isArray(read.value)&&read.value.every(job=>job&&typeof job.id==="string"&&Array.isArray(job.relationIds)&&job.relationIds.every(id=>typeof id==="string")&&Array.isArray(job.characterIds)&&job.characterIds.every(id=>typeof id==="string"));
  return {...read,valid,value:valid?read.value:[]};
}
let cleanup:Promise<boolean>|undefined;
export function processSemanticMemoryCleanup():Promise<boolean>{
  if(cleanup)return cleanup;
  cleanup=(async()=>{if(!canWriteMemoryStorage(MEMORY_INDEX_CLEANUP_KEY))return false;const read=readSemanticMemoryCleanupQueue();if(!read.valid)return false;
    for(const job of read.value){try{await readingAssetDb.deleteMetadataMatching(key=>{
      if(!key.startsWith("memory-semantic-index.v1:"))return false;
      try{const scope=JSON.parse(key.slice("memory-semantic-index.v1:".length));return Array.isArray(scope)&&typeof scope[0]==="string"&&typeof scope[1]==="string"&&(job.characterIds.includes(scope[0])||job.relationIds.includes(scope[1]));}catch{return false;}});
      const latest=readSemanticMemoryCleanupQueue();if(!latest.valid||!writeJson(MEMORY_INDEX_CLEANUP_KEY,latest.value.filter(item=>item.id!==job.id)).success)return false;
    }catch{return false;}}return true;})().finally(()=>{cleanup=undefined;});return cleanup;
}

const keyFor = (scope: CharacterTruthScope, provider: string) => `memory-semantic-index.v1:${JSON.stringify([scope.characterId,
  scope.relationId, scope.userIdentityId, scope.conversationId, provider])}`;
export async function loadSemanticMemoryIndex(scope: CharacterTruthScope, provider: string): Promise<SemanticMemoryIndex> {
  const value = await readingAssetDb.loadMetadataValue<unknown>(keyFor(scope, provider));
  if (value !== null && !isSemanticMemoryIndex(value, scope, provider)) throw new Error("invalid_semantic_index");
  return value as SemanticMemoryIndex || { version: 1, scope: { ...scope }, provider, entries: [] };
}
export async function saveSemanticMemoryIndex(index: SemanticMemoryIndex): Promise<void> {
  if (!canWriteMemoryStorage("phone_memory_semantic_index")) throw new Error("memory_readonly_window");
  if (!isSemanticMemoryIndex(index, index.scope, index.provider)) throw new Error("invalid_semantic_index");
  await readingAssetDb.saveMetadataValue(keyFor(index.scope, index.provider), index);
}
