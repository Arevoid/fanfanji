import type {KnowledgeClaim} from "./characterKnowledgeTypes";
export function resolveMemoryRetentionDisagreement(claim:KnowledgeClaim,raw:unknown):'retain'|'skip'|'review' {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'review';
 const value=raw as Record<string,unknown>,quote=claim.source.evidenceQuote||claim.statement;
 if(typeof value.quote!=='string'||!value.quote.trim()||!quote.includes(value.quote)||typeof value.confidence!=='number'||!Number.isFinite(value.confidence)
  ||value.confidence<.92||value.confidence>1||typeof value.reason!=='string'||!value.reason.trim()
  ||![value.hasDurableInformation,value.meaningfulChange,value.explicitCommitment].every(v=>typeof v==='boolean'))return 'review';
 if(value.hasDurableInformation||value.meaningfulChange||value.explicitCommitment)return 'retain';
 return value.confidence>=.95?'skip':'review';
}
