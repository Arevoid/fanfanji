import type {KnowledgeClaim,ConversationSummaryRecord} from "../characterKnowledge/characterKnowledgeTypes";
import {isExactTruthScope,deduplicateKnowledgeClaimsByMeaning} from "../characterKnowledge/knowledgeConflictPolicy";
import {organizationSourceRevision} from "../characterKnowledge/knowledgeOrganization";
export type MemoryGalleryCategory="shared"|"plans"|"impressions"|"changes"|"life"|"offline";
export const MEMORY_GALLERY_CATEGORIES:readonly {id:MemoryGalleryCategory;title:string;description:string}[]=[
 {id:"shared",title:"相处记忆",description:"相处中的事情，与你有关的信息"},
 {id:"plans",title:"未来计划",description:"约定、打算与后续进展"},
 {id:"impressions",title:"对我的认知",description:"相处中逐渐形成的理解与看法"},
 {id:"life",title:"TA的经历",description:"值得留下的经历、感悟与日记记录"},
 {id:"offline",title:"线下经历",description:"一起相处的片段与剧情"},
];
export function isMemoryGalleryOldMaterial(claim:KnowledgeClaim){if(claim.legacyCompatible&&claim.admissionStatus!=="skipped")return false;return claim.admissionStatus==="review"||claim.admissionStatus==="skipped"
 ||claim.truthStatus==="legacy_unverified"&&claim.admissionStatus!=="retained"||claim.organizationOriginal===true;}
export function memoryGalleryCategories(claim:KnowledgeClaim,includeUnreviewed=false):MemoryGalleryCategory[]{
 if((!includeUnreviewed&&isMemoryGalleryOldMaterial(claim))||claim.admissionStatus==="skipped"||claim.organizationOriginal&&!claim.legacyCompatible||claim.status!=="active"||claim.supersededById||claim.source.app==="diary"&&claim.source.producer!=="diary-reflection.v1")return [];
 const categories:MemoryGalleryCategory[]=[];
  const future=(claim.kind==="plan"||claim.temporalStatus==="future")
    && !["cancelled","completed","expired","unfulfilled"].includes(claim.planStatus||claim.event?.state||"");
  if(future)categories.push("plans");
  if(!future){
    if(claim.subject==="character"&&(claim.source.experience || claim.source.app&&claim.source.app!=="chat"))categories.push("life");
    else categories.push("shared");
  }
 if(claim.source.kind==="offline_story"||claim.source.app==="offline"||claim.source.storyId)categories.push("offline");
 return categories;
}
export function memoryGalleryEvidenceLabel(claim:KnowledgeClaim){
 if(claim.source.experience)return claim.source.experience.kind==="insight"?"TA留下的感悟":"TA当时的情绪触动";
 // Epistemic/admission states remain internal; this label describes provenance only.
 if(claim.legacyCompatible||claim.truthStatus==="legacy_unverified")return "来自旧版记忆";
 if(claim.source.authorship==="user")return "你告诉TA的";
 if(claim.source.kind==="offline_story")return "已记录的线下经历";
 if(claim.source.kind==="manual")return "你手动保存的";
 return "有来源的记录";
}
/** Presentation only. Keep provenance/original text unchanged; epistemic state
 * is rendered separately rather than as legacy parser prefixes in the prose. */
export function memoryGalleryDisplayText(text:string){
  return text.split("\n").map(line=>line.replace(/^\s*[-•]?\s*(?:\[(?:已确认事实|已确认约定|用户陈述|待验证|待核验|待核实|待核对|推测|推断|偏好|未来计划|未发生计划)(?:[^\]\n]{0,30})?\]\s*)+/u,"")).join("\n").trim();
}
export function relatedMemorySummaries(claim:KnowledgeClaim,summaries:readonly ConversationSummaryRecord[]){
 const ids=new Set([claim.id,...(claim.mergedClaimIds||[])]);
 return summaries.filter(summary=>summary.status==="active"&&isExactTruthScope(summary,claim)&&summary.sourceClaimIds.some(id=>ids.has(id)));
}
/** A preview is a literal excerpt, never newly generated interpretation. */
export function memoryGalleryTitle(statement:string){const first=statement.trim().split(/[\n。！？]/u).find(Boolean)||"记忆内容";return first.length>26?`${first.slice(0,26)}…`:first;}

/** Presentation grouping only: keep every stored original and its provenance. */
export function deduplicateMemoryGalleryClaims(input:readonly KnowledgeClaim[]):KnowledgeClaim[]{
 const records=deduplicateKnowledgeClaimsByMeaning(input.filter(claim=>!claim.organizationSourceId||!input.some(parent=>parent.id===claim.organizationSourceId&&parent.legacyCompatible))),byId=new Map(records.map(c=>[c.id,c]));
 const parents=new Map(records.map(c=>[c.id,c.id]));
 const root=(id:string):string=>{let current=id;while(parents.get(current)!==current)current=parents.get(current)!;return current;};
 for(const claim of records)for(const association of claim.associations||[]){
   const target=byId.get(association.targetId);
   if(association.relation!=="duplicate"||association.confidence<.95||!target||!isExactTruthScope(claim,target)
     ||claim.status!=="active"||target.status!=="active"||claim.kind!==target.kind||claim.subject!==target.subject
     ||claim.truthStatus!==target.truthStatus||claim.admissionStatus!=="retained"||target.admissionStatus!=="retained"
     ||claim.temporalStatus!==target.temporalStatus||claim.supersededById||target.supersededById
     ||association.targetRevision!==organizationSourceRevision(target)||!claim.statement.includes(association.sourceQuote)||!target.statement.includes(association.targetQuote))continue;
   const roots=[root(claim.id),root(target.id)].sort();parents.set(roots[1],roots[0]);
 }
 const groups=new Map<string,KnowledgeClaim[]>();for(const record of records){const key=root(record.id);groups.set(key,[...(groups.get(key)||[]),record]);}
 return [...groups.values()].map(group=>{
   if(group.length===1)return group[0];
   const winner=[...group].sort((a,b)=>Number(Boolean(b.recallDisabled))-Number(Boolean(a.recallDisabled))||Number(Boolean(b.coreMemory))-Number(Boolean(a.coreMemory))||b.recordedAt-a.recordedAt||a.id.localeCompare(b.id))[0];
   return {...winner,mergedClaimIds:[...new Set(group.flatMap(c=>[c.id,...(c.mergedClaimIds||[])]))].filter(id=>id!==winner.id)};
 });
}
