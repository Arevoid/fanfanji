import type {CharacterTruthScope,KnowledgeClaim} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {isExactTruthScope} from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import {semanticClaimRevision} from "../../../domain/memory/semanticMemoryIndex";
import {readJson,writeJson} from "../storageAdapter";
export const MEMORY_MENTION_KEY="phone_memory_mentions_v1";
export interface MemoryMention {channel?:string;scope:CharacterTruthScope;claimId:string;revision:string;replyId:string;replyRevision:string;observedAt:number;expiresAt:number;method:"exact"|"semantic";confidence:number}
export function loadMemoryMentions(){const read=readJson<MemoryMention[]>(MEMORY_MENTION_KEY,[]);
 const valid=read.valid&&Array.isArray(read.value)&&read.value.every(r=>r&&(r.channel===undefined||typeof r.channel==="string"&&r.channel.length>0&&r.channel.length<=300)&&r.scope&&[r.scope.characterId,r.scope.relationId,r.scope.userIdentityId,r.scope.conversationId,r.claimId,r.revision,r.replyId,r.replyRevision].every(v=>typeof v==="string"&&v.length>0)&&Number.isFinite(r.observedAt)&&Number.isFinite(r.expiresAt)&&r.expiresAt>r.observedAt&&["exact","semantic"].includes(r.method)&&r.confidence>=0&&r.confidence<=1);
 return {...read,valid,value:valid?read.value:[]};}
export function saveMemoryMentions(records:readonly MemoryMention[],now:number){return writeJson(MEMORY_MENTION_KEY,records.filter(r=>r.expiresAt>now).slice(-1000));}
export function recentlyMentioned(claim:KnowledgeClaim,now:number,records=loadMemoryMentions().value,channel="conversation"){return records.some(r=>(r.channel||"conversation")===channel&&isExactTruthScope(r.scope,claim)&&r.claimId===claim.id&&r.revision===semanticClaimRevision(claim)&&r.observedAt<=now&&r.expiresAt>now);}
export function removeMentionsForReplies(replyIds:readonly string[],scope?:CharacterTruthScope){
 const read=loadMemoryMentions();if(!read.valid)return {success:false,error:"validation" as const};
 const next=read.value.filter(record=>!replyIds.some(id=>record.replyId===id||record.replyId===`chat:${id}`||record.channel?.startsWith("group:")&&record.replyId===`${record.channel}:${id}`)||scope&&!isExactTruthScope(record.scope,scope));
 return next.length===read.value.length?{success:true}:saveMemoryMentions(next,Date.now());
}
