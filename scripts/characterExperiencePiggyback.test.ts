import assert from "node:assert/strict";
import { normalizeCharacterExperience } from "../src/domain/memory/characterExperience";
import { saveCharacterExperience } from "../src/features/characterKnowledge/services/characterExperienceService";
import { requestCinemaMemoryReply } from "../src/features/cinema/cinemaMemoryReply";
import { loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { saveCinemaStore } from "../src/core/storage/repositories/cinemaRepository";
import { memoryGalleryCategories, MEMORY_GALLERY_CATEGORIES } from "../src/domain/memory/memoryGallery";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character, Message, UserSettings } from "../src/types";
const body = "看着这个片段，我才意识到，我一直把求助当成软弱，其实也可以试着相信别人。";
const experience = { kind: "insight", reflection: "那段关于求助的讨论，让TA开始重新理解自己一直以来的逞强。",
  quote: body, significance: .9, reason: "角色明确回顾了自己的固有理解，并提出不同于原先的新认识。" };
assert.ok(normalizeCharacterExperience(experience, body));
for (const raw of [null, {}, { ...experience, significance: .4 }, { ...experience, significance: NaN }, { ...experience, quote: "作品里另一个人经历的故事" }])
  assert.equal(normalizeCharacterExperience(raw, body), undefined);
assert.ok(!MEMORY_GALLERY_CATEGORIES.some(item => item.id === "changes"));
assert.equal(MEMORY_GALLERY_CATEGORIES.find(item => item.id === "life")?.title, "TA的经历");
const values = new Map<string,string>();
const localStorage = { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => values.set(key,value), removeItem: (key:string) => values.delete(key) };
Object.defineProperty(globalThis, "window", { configurable:true, value:{ localStorage } });
const scope = { characterId:"a", userIdentityId:"u", relationId:"r", conversationId:"c" };
const discussion = { ...scope, id:"discussion", roomId:"room", mediaId:"film", userText:"你怎么看", characterText:body, createdAt:1, positionMs:0 };
assert.equal(saveCinemaStore({schemaVersion:1,media:[],rooms:[],discussions:[discussion]}),true);
const input = { scope, app:"cinema" as const, sourceId:discussion.id, body, experience, now:2 };
assert.equal(saveCharacterExperience(input),true);
assert.equal(saveCharacterExperience(input),true);
let claims = loadKnowledgeClaims().value;
assert.equal(claims.length,1); assert.equal(claims[0].kind,"belief"); assert.equal(claims[0].truthStatus,"inferred");
assert.deepEqual(memoryGalleryCategories(claims[0]),["life"]);
assert.equal(claims[0].userConfirmed,false);
assert.equal(saveCharacterExperience({...input,experience:null}),false);
saveCinemaStore({schemaVersion:1,media:[],rooms:[],discussions:[{...discussion, characterText:"普通评论"}]});
assert.equal(loadKnowledgeClaims().value[0].status,"retracted","edited source cannot leave an active experience");
saveCinemaStore({schemaVersion:1,media:[],rooms:[],discussions:[]});
assert.equal(loadKnowledgeClaims().value[0].status,"retracted","deleted source cannot be recalled");
let calls=0;
const response=await requestCinemaMemoryReply({characterId:"a",userIdentityId:"u",settings:{} as UserSettings,query:"观影",params:{message:"讨论",history:[],apiKey:"synthetic",model:"synthetic"},
  request:async params=>{calls++;assert.match(params.systemInstruction||"",/默认 null/);return {text:JSON.stringify({body,experience})};}});
assert.equal(calls,1);assert.equal(response.text,body);assert.ok(response.experience);
await requestCinemaMemoryReply({characterId:"a",userIdentityId:"u",settings:{} as UserSettings,query:"观影",params:{message:"讨论",history:[],apiKey:"synthetic",model:"synthetic"},
  request:async()=>{calls++;return {text:JSON.stringify({body,experience:{bad:true}})};}});
assert.equal(calls,2,"invalid optional experience never causes a repair API call");
const message:Message={id:"m",characterId:"a",relationId:"r",conversationId:"c",sender:"character",senderId:"a",content:body,timestamp:1};
let extractionCalls=0,reviewCalls=0;
const extracted=await MemoryService.extractMemories({...scope, character:{id:"a",name:"甲",avatar:"",personality:"",backstory:""} as Character,
  recentMessages:[message],existingMemories:[],existingClaims:[],scenario:"chat",apiKey:"synthetic",model:"synthetic",
  currentTime:()=>2,createId:()=>"synthetic",formatContent:text=>text.join("\n"),reviewAuthorizedSettings:async claims=>{reviewCalls++;return {claims:[...claims],skipped:0};}},
  async()=>{extractionCalls++;return {items:[{statement:experience.reflection,kind:"belief",subject:"character",temporalStatus:"past",
    sourceMessageIds:["M1"],evidenceQuote:body,experience,valueAssessment:{quote:body,impact:3,durability:3,novelty:2,confidence:.9,reason:experience.reason}}]};});
assert.equal(extractionCalls,1);assert.equal(reviewCalls,0,"own experience never adds setting-review API");
assert.equal(extracted.acceptedClaims.length,1,JSON.stringify(extracted));
assert.equal(extracted.acceptedClaims[0].source.authorship,"character");
assert.ok(extracted.acceptedClaims[0].source.experience);
assert.deepEqual(memoryGalleryCategories(extracted.acceptedClaims[0]),["life"]);
assert.equal(extracted.extractedMemories.length,0,"subjective output must not be dual-written as confirmed legacy fact");
delete (globalThis as {window?:unknown}).window;
console.log("character experience piggyback acceptance passed");
