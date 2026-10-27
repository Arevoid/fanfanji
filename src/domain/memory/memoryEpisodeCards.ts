import type {KnowledgeClaim,ConversationSummaryRecord} from "../characterKnowledge/characterKnowledgeTypes";
import {isExactTruthScope} from "../characterKnowledge/knowledgeConflictPolicy";
import {getConversationSummaryLayer} from "../characterKnowledge/conversationSummaryProjection";
import type {MemoryCenterRecord} from "./memoryCenterModel";
import {memoryGalleryCategories,memoryGalleryDisplayText,memoryGalleryEvidenceLabel,type MemoryGalleryCategory} from "./memoryGallery";

export interface MemoryEpisodeCard extends MemoryCenterRecord {
 memberClaimIds:string[];
 relatedSummaryIds:string[];
 categoryIds:MemoryGalleryCategory[];
 episodeTitle?:string;
 evidenceLabel?:string;
}
/** Build a readable archive-window view. Atomic facts remain independently
 * stored and retrievable; an episode is never a new assertion or permission. */
export function buildMemoryEpisodeCards(input:{records:readonly MemoryCenterRecord[];claims:readonly KnowledgeClaim[];summaries:readonly ConversationSummaryRecord[]}):MemoryEpisodeCard[]{
 const byId=new Map(input.claims.map(claim=>[claim.id,claim]));
 const groups=new Map<string,{records:MemoryCenterRecord[];summaryIds:Set<string>}>();
 const other:MemoryEpisodeCard[]=[];
 for(const record of input.records){
  if(record.recordType!=="truth"){other.push({...record,memberClaimIds:[],relatedSummaryIds:[],categoryIds:[]});continue;}
  const claim=byId.get(record.id);if(!claim||!memoryGalleryCategories(claim).length)continue;
  const lineage=new Set<string>();let cursor:KnowledgeClaim|undefined=claim;
  while(cursor&&!lineage.has(cursor.id)){
   lineage.add(cursor.id);for(const id of cursor.mergedClaimIds||[])lineage.add(id);
   if(cursor.organizationSourceId)lineage.add(cursor.organizationSourceId);
   cursor=cursor.supersedesId?byId.get(cursor.supersedesId):undefined;
   if(cursor&&!isExactTruthScope(cursor,claim))break;
  }
  const related=input.summaries.filter(summary=>summary.status!=="retracted"&&getConversationSummaryLayer(summary)!=="projection"&&isExactTruthScope(summary,claim)
   &&(summary.sourceClaimIds.some(id=>lineage.has(id))||Boolean(summary.sourceRecordId&&summary.sourceRecordId===claim.source.sourceRecordId)))
   .sort((a,b)=>a.sourceClaimIds.length-b.sourceClaimIds.length||b.generatedAt-a.generatedAt||a.id.localeCompare(b.id));
  const source=related[0];
  const boundary=source?`episode:${source.id}`:claim.source.eventId?`event:${claim.source.eventId}`:claim.organizationSourceId?`source:${claim.organizationSourceId}`:claim.source.storyId?`story:${claim.source.storyId}`:`claim:${claim.id}`;
  const key=JSON.stringify([claim.characterId,claim.relationId,claim.userIdentityId,claim.conversationId,boundary]);
  const group=groups.get(key)||{records:[],summaryIds:new Set<string>()};group.records.push(record);for(const summary of related)group.summaryIds.add(summary.id);groups.set(key,group);
 }
 const cards=[...groups.values()].map(group=>{
  const records=group.records.sort((a,b)=>a.recordedAt-b.recordedAt||a.id.localeCompare(b.id));
  const primary=records[0];const claims=records.map(record=>byId.get(record.id)!);
  const text=[...new Set(claims.map(claim=>memoryGalleryDisplayText(claim.statement).replace(/^用户/u,"你")).filter(Boolean))].join("\n");
  const categoryIds=[...new Set(claims.flatMap(claim=>memoryGalleryCategories(claim)))];
  const labels=[...new Set(claims.map(memoryGalleryEvidenceLabel))];
  const source=input.summaries.find(summary=>group.summaryIds.has(summary.id));
  return {...primary,content:text,recordedAt:Math.max(...records.map(record=>record.recordedAt)),importance:Math.max(...records.map(record=>record.importance)),
   memberClaimIds:records.map(record=>record.id),relatedSummaryIds:[...group.summaryIds],categoryIds,evidenceLabel:labels.length===1?labels[0]:"来自相关交流与记录",
   ...(records.length>1?{episodeTitle:categoryIds.includes("offline")?"这段线下相处留下的记忆":source?.generator.startsWith("completed-call")?"这次通话留下的记忆":"这段交流留下的记忆"}:{}),
   provenance:{...primary.provenance,sourceClaimIds:records.map(record=>record.id),sourceMessageIds:[...new Set(records.flatMap(record=>record.provenance.sourceMessageIds||[]))]}};
 });
 return [...cards,...other].sort((a,b)=>b.recordedAt-a.recordedAt||a.id.localeCompare(b.id));
}
