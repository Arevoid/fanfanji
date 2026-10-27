import { resolveCharacterTextSettings } from "../../../domain/character/characterTextApiRouting";
import type {DiaryEntry,UserSettings} from "../../../types";
import type {KnowledgeClaim} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {sourceRevision} from "../../../domain/characterKnowledge/knowledgeEvolution";
import {loadDiaryEntries,saveDiaryEntries} from "../../../core/storage/repositories/diaryRepository";
import {loadKnowledgeClaims,appendMany} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {loadCharacterContinuity} from "../../../core/storage/repositories/characterContinuityRepository";
import {isForgottenKnowledge} from "../../../domain/memory/characterContinuity";
import {apiChat} from "../../../utils/apiHelper";
import {readJson,writeJson} from "../../../core/storage/storageAdapter";

const DIARY_ATTEMPTS_KEY="phone_diary_memory_attempts_v1";
type Attempts={day:string;count:number;nextAt:number};
const visible=()=>typeof document==="undefined"||document.visibilityState!=="hidden";

export function buildDiaryReflection(entry:DiaryEntry):KnowledgeClaim|undefined {
 const reflection=entry.memoryReflection;
 if(entry.authorType!=="character"||!entry.characterId||!entry.relationId||!entry.conversationId||!reflection
  ||reflection.revision!==sourceRevision(entry.body)||typeof reflection.text!=="string"||typeof reflection.quote!=="string"||!reflection.text.trim()||reflection.text.length>400||!reflection.quote.trim()||reflection.quote.length>400||!entry.body.includes(reflection.quote))return;
 return {id:`diary-reflection:${entry.id}:${reflection.revision}`,characterId:entry.characterId,relationId:entry.relationId,userIdentityId:entry.ownerIdentityId,conversationId:entry.conversationId,
  statement:`TA在日记中写下自己的感受：${reflection.text}（这是TA当时的主观看法，不证明其中事件已经发生。）`,
  kind:"belief",subject:"character",truthStatus:"inferred",temporalStatus:"past",confidence:.4,userConfirmed:false,status:"active",visibility:"relation_private",schemaVersion:1,
  admissionStatus:"retained",importance:4,continuityVersion:1,recordedAt:entry.updatedAt,occurredAt:entry.occurredAt,
  source:{kind:"automatic_summary",app:"diary",authorship:"character",sourceRecordId:entry.id,evidenceKey:`diary:${entry.id}:${reflection.revision}`,producer:"diary-reflection.v1",evidenceQuote:reflection.quote,messageRevisions:{[entry.id]:reflection.revision}}};
}
export function syncDiaryReflections(){
 const entries=loadDiaryEntries(),existing=loadKnowledgeClaims(),continuity=loadCharacterContinuity();
 if(!entries.valid||!existing.valid||!continuity.valid)return false;
 const candidates=entries.value.map(buildDiaryReflection).filter((c):c is KnowledgeClaim=>Boolean(c));
 const missing=candidates.filter(claim=>!existing.value.some(record=>record.id===claim.id)&&!isForgottenKnowledge(claim,continuity.value.forgotten));
 return !missing.length||appendMany(missing).success;
}
let running=false;
/** One old/unprocessed diary per visible tick; no diary text is promoted to facts. */
export async function archivePendingDiaryReflection(settings:UserSettings,request=apiChat){
 if(running||!visible())return;
 const entries=loadDiaryEntries();if(!entries.valid)return;
 const budget=readJson<Record<string,Attempts>>(DIARY_ATTEMPTS_KEY,{});
 if(!budget.valid||!budget.value||typeof budget.value!=="object"||Array.isArray(budget.value))return;
 const day=new Date().toISOString().slice(0,10),now=Date.now();
 const entry=entries.value.find(entry=>{const attempt=budget.value[entry.ownerIdentityId];return entry.authorType==="character"&&(!entry.memoryReflection||entry.memoryReflection.revision!==sourceRevision(entry.body))&&(!attempt||attempt.day!==day||attempt.count<4&&attempt.nextAt<=now);});
 if(!entry)return;
 settings=resolveCharacterTextSettings(settings,undefined,entry.characterId);
 if(!settings.apiKey)return;
 const previous=budget.value[entry.ownerIdentityId];
 if(!writeJson(DIARY_ATTEMPTS_KEY,{...budget.value,[entry.ownerIdentityId]:{day,count:(previous?.day===day?previous.count:0)+1,nextAt:now+5*60_000}}).success)return;
 running=true;
 try{
  const result=await request({message:JSON.stringify({body:entry.body}),history:[],systemInstruction:"从这篇日记只提炼一条有持续意义的主观感受或反思。不要确认事件、推断用户性格或生成新事实。仅返回JSON {text,quote}：text不超过200字；quote为正文中不超过200字的连续原话。无持续意义返回null。",apiKey:settings.apiKey,apiEndpoint:settings.apiEndpoint,model:settings.selectedModel,purpose:"memory_extract",characterId:entry.characterId,relationId:entry.relationId,conversationId:entry.conversationId,maxOutputTokens:600,timeoutMs:30000});
  const raw=JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/u,"").replace(/\s*```$/u,""));
  const latest=loadDiaryEntries();if(!visible()||!latest.valid||!latest.value.some(current=>current.id===entry.id&&current.body===entry.body&&current.updatedAt===entry.updatedAt))return;
  const reflection=raw===null?{text:"",quote:"",revision:sourceRevision(entry.body)}:typeof raw?.text==="string"&&typeof raw?.quote==="string"&&raw.text.length<=400&&raw.quote.trim()&&raw.quote.length<=400&&entry.body.includes(raw.quote)?{text:raw.text,quote:raw.quote,revision:sourceRevision(entry.body)}:undefined;
  if(reflection&&saveDiaryEntries(latest.value.map(current=>current.id===entry.id?{...current,memoryReflection:reflection}:current)).success)syncDiaryReflections();
 }catch{/* Source stays in its original diary store for a later bounded retry. */}finally{running=false;}
}
