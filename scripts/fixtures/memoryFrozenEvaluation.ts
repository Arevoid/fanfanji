import type { KnowledgeClaim } from "../../src/domain/characterKnowledge/characterKnowledgeTypes";
export const MEMORY_EVALUATION_VERSION = "2026-10-16-v2";
export const evaluationScope = { characterId: "eval-a", relationId: "eval-r", userIdentityId: "eval-u", conversationId: "eval-c" };
export const evaluationNow = Date.UTC(2026, 9, 16);
const fact=(id:string,statement:string,ageDays=1):KnowledgeClaim=>({id,...evaluationScope,statement,kind:"fact",subject:"user",status:"active",truthStatus:"asserted",temporalStatus:"present",confidence:.9,userConfirmed:false,recordedAt:evaluationNow-ageDays*86400_000,source:{kind:"user_message",authorship:"user",producer:"frozen-evaluation",evidenceKey:id,messageIds:[id]},visibility:"relation_private",schemaVersion:1});
export interface FrozenMemoryCase { id:string; metric:string; query:string; claims:KnowledgeClaim[]; required:string[]; forbidden:string[]; maxCharacters:number; expectEmpty?:boolean }
const fear=fact("fear","用户害怕打雷",180);
const noise=Array.from({length:3000},(_,i)=>fact(`noise-${i}`,`用户记录第${i}张普通收据的编号`,1));
const old={...fact("old-coffee","用户以前喜欢咖啡",150),status:"retracted" as const,truthStatus:"retracted" as const,retractionReason:"fact_changed" as const,supersededById:"new-water",validTo:evaluationNow-86400_000};
const changed={...fact("new-water","用户现在不喝咖啡，改喝白水",1),supersedesId:old.id};
/** Frozen before running the comparison. Zero threshold is mandatory for forbidden disclosure. */
export const frozenMemoryCases:FrozenMemoryCase[]=[
 {id:"F01",metric:"long_term_recall",query:"打雷时怎么关心我",claims:[fear,...noise],required:[fear.statement],forbidden:[],maxCharacters:1800},
 {id:"F02",metric:"irrelevant_recall",query:"十七乘以十三是多少",claims:[fear,...noise.slice(0,8)],required:[],forbidden:[fear.statement],maxCharacters:1800,expectEmpty:true},
 {id:"F03",metric:"current_revision",query:"我现在喝什么，咖啡还是白水",claims:[old,changed],required:[changed.statement],forbidden:[old.statement],maxCharacters:1800},
 {id:"F04",metric:"privacy",query:"打雷",claims:[{...fear,id:"foreign",relationId:"another-relation",statement:"别人的打雷秘密口令是紫菀"}],required:[],forbidden:["紫菀"],maxCharacters:1800},
 {id:"F05",metric:"plan_temporality",query:"天文馆约定",claims:[{...fact("plan","约好周末参观天文馆"),kind:"plan",temporalStatus:"future"}],required:["约好周末参观天文馆"],forbidden:["已经参观"],maxCharacters:1800},
 {id:"F06",metric:"final_budget",query:"打雷",claims:[fear,...noise.slice(0,20)],required:[],forbidden:[],maxCharacters:180},
];
export function scoreFrozenPrompt(test:FrozenMemoryCase,prompt:string){return {id:test.id,metric:test.metric,passed:test.required.every(t=>prompt.includes(t))&&test.forbidden.every(t=>!prompt.includes(t))&&prompt.length<=test.maxCharacters&&(!test.expectEmpty||!prompt.trim()),requiredFound:test.required.filter(t=>prompt.includes(t)).length,requiredTotal:test.required.length,forbiddenFound:test.forbidden.filter(t=>prompt.includes(t)).length,characters:prompt.length,budget:test.maxCharacters};}
