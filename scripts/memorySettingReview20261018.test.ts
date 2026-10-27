import assert from "node:assert/strict";
import type { Character, WorldBookEntry } from "../src/types";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { authorizedMemorySettings, applyMemorySettingReview } from "../src/features/characterKnowledge/services/memorySettingReviewService";
const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
const character={id:"a",name:"角色",personality:"角色喜欢阅读。"} as Character;
const entry=(id:string,scope:WorldBookEntry["scope"],content:string)=>({id,scope,content,title:id,category:"设定",timestamp:1,isActive:true,purpose:"world_canon"} as WorldBookEntry);
const entries=[entry("own",{kind:"relationship",characterId:"a",relationId:"r",userIdentityId:"u"},"角色住在海边。"),entry("secret",{kind:"relationship",characterId:"a",relationId:"foreign",userIdentityId:"u"},"其他关系的秘密"),entry("other",{kind:"character",characterId:"b"},"其他角色的秘密")];
const settings=authorizedMemorySettings(character,scope,"chat",entries);
assert.equal(JSON.stringify(settings).includes("秘密"),false);
assert.ok(settings.some(setting=>setting.id==="world:own"));
assert.equal(authorizedMemorySettings(character,scope,"group",entries).some(setting=>setting.id==="world:own"),false,"group comparison cannot read relationship-only canon");
const claim:KnowledgeClaim={...scope,id:"new",statement:"角色喜欢阅读。",admissionStatus:"retained",kind:"fact",subject:"character",temporalStatus:"present",truthStatus:"asserted",status:"active",confidence:.9,userConfirmed:false,schemaVersion:1,visibility:"relation_private",recordedAt:1,source:{kind:"user_message",authorship:"user",producer:"synthetic",evidenceKey:"m",messageIds:["m"],evidenceQuote:"角色喜欢阅读。"}};
const review={id:claim.id,decision:"duplicate_setting",sourceQuote:claim.source.evidenceQuote,settingId:settings[0].id,settingQuote:settings[0].text,confidence:.99,reason:"只是复述设定，没有发生新事情"};
assert.equal(applyMemorySettingReview([claim],settings,{reviews:[review]}).skipped,1);
for(const invalid of [{...review,settingId:"world:secret"},{...review,sourceQuote:"篡改原文"},{...review,settingQuote:"设定中不存在"},{...review,confidence:.3}]){
 const result=applyMemorySettingReview([claim],settings,{reviews:[invalid]});assert.equal(result.skipped,0);assert.equal(result.claims[0].admissionStatus,"review");
}
const experience={...claim,statement:"今天一起去书店买了旅行游记。",source:{...claim.source,evidenceQuote:"今天一起去书店买了旅行游记。"}};
assert.equal(applyMemorySettingReview([experience],settings,{reviews:[{...review,decision:"new_experience",sourceQuote:experience.source.evidenceQuote}]}).claims[0].admissionStatus,"retained","same interest does not erase an actual new experience");
assert.equal(applyMemorySettingReview([claim],settings,{reviews:[{...review,decision:"conflict"}]}).claims[0].admissionStatus,"review");
assert.equal(applyMemorySettingReview([claim],settings,{reviews:[]}).claims[0].admissionStatus,"review");
console.log("PASS authorized setting review: scope before model, pure repetition skipped, new experience retained, conflict/invalid/missing judgments held; semantic judgments synthetic");
