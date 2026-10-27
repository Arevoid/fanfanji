import assert from 'node:assert/strict';
import {createMemorySettingReviewer} from '../src/features/characterKnowledge/services/memorySettingReviewService';
import {resolveMemoryRetentionDisagreement} from '../src/domain/characterKnowledge/memoryRetentionDisagreement';
import type {KnowledgeClaim} from '../src/domain/characterKnowledge/characterKnowledgeTypes';
import type {Character,UserSettings} from '../src/types';
const values=new Map<string,string>();Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
const scope={characterId:'c',relationId:'r',userIdentityId:'u',conversationId:'conv'};
const source='我一直喜欢咖啡，每天早晨都会喝一杯。';
const claim={...scope,id:'claim',statement:'用户每天早晨喝咖啡',kind:'preference',subject:'user',temporalStatus:'present',truthStatus:'asserted',status:'active',admissionStatus:'retained',confidence:.85,userConfirmed:false,recordedAt:1,schemaVersion:1,visibility:'relation_private',valueAssessment:{quote:source,reason:'持续习惯',impact:1,durability:3,novelty:1,confidence:.95},source:{kind:'user_message',authorship:'user',producer:'synthetic',evidenceKey:'e',messageIds:['m'],evidenceQuote:source}} as KnowledgeClaim;
for(const mode of ['durable','fleeting','uncertain','timeout','forged-quote'] as const){
 let calls=0;const review=createMemorySettingReviewer({id:'c',name:'角色',personality:'',backstory:''} as Character,scope,'chat',{apiKey:'synthetic',selectedModel:'synthetic'} as UserSettings,async params=>{
  calls++;const body=JSON.parse(params.message);
  if(body.candidates)return {text:JSON.stringify({reviews:[{id:'C1',decision:'ephemeral',sourceQuote:source,confidence:.99,reason:'合成的错误一次性判断'}]})};
  assert.equal(body.sources[0].text,source);assert.doesNotMatch(params.message,/ephemeral|持续习惯/,'independent review does not inherit prior rating');
  if(mode==='timeout')throw Error('synthetic unavailable');
  return {text:JSON.stringify({reviews:[{id:'D1',hasDurableInformation:mode==='durable',meaningfulChange:false,explicitCommitment:false,quote:mode==='forged-quote'?'伪造原话':source,confidence:mode==='uncertain'?.6:.99,reason:'独立对照原文判断'}]})};
 });
 const result=await review([claim]);assert.equal(calls,2);
 if(mode==='durable'){assert.equal(result.skipped,0);assert.equal(result.claims[0].admissionStatus,'retained');assert.equal(result.claims[0].truthStatus,'asserted');}
 else if(mode==='fleeting'){assert.equal(result.skipped,1);assert.equal(result.claims.length,0);}
 else{assert.equal(result.skipped,0);assert.equal(result.claims[0].admissionStatus,'review');}
}
assert.equal(resolveMemoryRetentionDisagreement(claim,{hasDurableInformation:true,meaningfulChange:false,explicitCommitment:false,quote:source,confidence:'high',reason:'无效评分'}),'review');
console.log('PASS retention disagreements: independent source-only review; durable retained, fleeting skipped, timeout/uncertain/forged evidence held; truth authority unchanged');
