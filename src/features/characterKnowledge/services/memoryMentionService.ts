import type {CharacterTruthScope,KnowledgeClaim} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {isExactTruthScope} from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import {semanticClaimRevision,normalizeEmbeddingVector,type SemanticMemoryIndex} from "../../../domain/memory/semanticMemoryIndex";
import {sourceRevision} from "../../../domain/characterKnowledge/knowledgeEvolution";
import {chunkSemanticDocument} from "../../../domain/memory/semanticMemoryDocuments";
import {loadMemoryMentions,saveMemoryMentions,type MemoryMention} from "../../../core/storage/repositories/memoryMentionRepository";
export interface ActualAssistantTurn {id:string;text:string;at:number}
const normalize=(text:string)=>text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");
/** Evidence is an actual persisted assistant reply, never the injected prompt. */
export function observeMemoryMentions(input:{scope:CharacterTruthScope;claims:readonly KnowledgeClaim[];turns:readonly ActualAssistantTurn[];now:number;channel?:string;index?:SemanticMemoryIndex;vectors?:readonly number[][]}){
 const read=loadMemoryMentions();if(!read.valid)return false;
 let records=read.value;const claims=input.claims.filter(c=>isExactTruthScope(c,input.scope)&&c.status==="active"&&!c.recallDisabled&&!c.supersededById);
 for(const [position,turn] of input.turns.slice(-2).entries()){
  if(!turn.id||!turn.text.trim()||!Number.isFinite(turn.at)||turn.at>input.now||input.now-turn.at>=30*60_000)continue;
  const replyRevision=sourceRevision(turn.text);const vector=normalizeEmbeddingVector(input.vectors?.[position]);
  // Editing an actual reply invalidates its previous mention classification,
  // including when the edited text no longer contains any personal memory.
  records=records.filter(r=>!isExactTruthScope(r.scope,input.scope)||(r.channel||"conversation")!==(input.channel||"conversation")||r.replyId!==turn.id||r.replyRevision===replyRevision);
  const matches=claims.map(claim=>{const statement=claim.source.producer==="semantic-document"?claim.statement.replace(/^\[[^\]]+\]\s*/u,""):claim.statement;
   const text=normalize(statement);const exact=text.length>=4&&normalize(turn.text).includes(text);
   const chunks=new Map(["claim","supplementary"].flatMap(kind=>chunkSemanticDocument(claim,kind)).map(c=>[c.id,semanticClaimRevision(c)]));
   const similarity=vector&&input.index&&isExactTruthScope(input.index.scope,input.scope)?Math.max(0,...input.index.entries.filter(e=>chunks.get(e.claimId)===e.revision&&e.vector.length===vector.length).map(e=>{const v=normalizeEmbeddingVector(e.vector);return v?v.reduce((sum,x,i)=>sum+x*vector[i],0):0;})):0;
   return {claim,exact,similarity};}).sort((a,b)=>Number(b.exact)-Number(a.exact)||b.similarity-a.similarity);
  for(const match of matches){const semantic=match.similarity>=.9&&(!matches[1]||match===matches[0]&&match.similarity-matches[1].similarity>=.04);
   if(!match.exact&&!semantic)continue;
   const existing=records.find(r=>isExactTruthScope(r.scope,input.scope)&&(r.channel||"conversation")===(input.channel||"conversation")&&r.claimId===match.claim.id&&r.replyId===turn.id&&r.replyRevision===replyRevision);
   if(existing)continue;
   const record:MemoryMention={channel:input.channel||"conversation",scope:{...input.scope},claimId:match.claim.id,revision:semanticClaimRevision(match.claim),replyId:turn.id,replyRevision,observedAt:turn.at,expiresAt:turn.at+30*60_000,method:match.exact?"exact":"semantic",confidence:match.exact?1:Math.min(1,match.similarity)};
   records=[...records.filter(r=>!isExactTruthScope(r.scope,input.scope)||(r.channel||"conversation")!==record.channel||r.claimId!==record.claimId||r.replyId!==turn.id),record];
  }
 }
 return saveMemoryMentions(records,input.now).success;
}
