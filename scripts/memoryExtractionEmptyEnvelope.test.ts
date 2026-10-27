import assert from "node:assert/strict";
import {parseKnowledgeExtractionOutputWithV2WithTelemetry as parse} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import {normalizeMemoryExtractionResponse, apiExtractMemoriesWithModelFallback} from "../src/utils/apiHelper";
const candidate={statement:"用户害怕打雷。",kind:"fact",subject:"user",temporalStatus:"past",sourceMessageIds:["m1"],evidenceQuote:"我害怕打雷"};
const read=(text:string)=>{const r=parse(text,new Set(["m1"]));return normalizeMemoryExtractionResponse({text,items:r.parsed.candidates,candidates:r.parsed.candidates,structuredOutputTelemetry:r.structuredOutputTelemetry});};
for(const text of ['[]','```json\n[]\n```','{"items":[]}','{"candidates":[]}','{"memories":[]}']){
 assert.equal(read(text).error,undefined,"valid empty collection is not a format error");
 assert.equal(read(text).items.length,0);
}
for(const key of ["items","candidates","memories"]){
 const r=read(JSON.stringify({[key]:[candidate]}));assert.equal(r.error,undefined);assert.equal(r.items.length,1);
 const invalid=read(JSON.stringify({[key]:[{...candidate,sourceMessageIds:["foreign"]}]}));
 assert.match(invalid.error||"",/来源引用/);assert.equal(invalid.items.length,0);
}
for(const text of ['{}','null','{"success":false,"items":[]}','{"error":"refused","items":[]}','{"items":[],"memories":[]}'])assert.ok(read(text).error,"unknown, failed and ambiguous wrappers stay errors");
assert.match(read('not JSON').error||"",/未通过结构校验/);
assert.match(read('{"items":[').error||"",/截断/);
assert.match(read('{"statement":"missing fields"}').error||"",/必要字段/);
assert.equal(read('not JSON').errorDetails?.code,"provider_invalid_response");
let calls=0;
await apiExtractMemoriesWithModelFallback({history:[{id:"m1",role:"user",text:"我害怕打雷"}],characterName:"test",apiKey:"synthetic",model:"test",singlePass:true},"other",async()=>{calls++;return read('[]');});
assert.equal(calls,1,"valid empty response never causes another model request");
console.log("PASS empty collections and explicit envelopes, strict sources, classified errors, zero extra requests");
