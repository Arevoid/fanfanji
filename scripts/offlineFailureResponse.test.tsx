import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {OfflineStory,Character} from "../src/types";
import {apiExtractMemories} from "../src/utils/apiHelper";
import {extractOfflineArchiveWithCheckpoint} from "../src/features/offline/services/offlineArchiveExtraction";
import {readOfflineFailureResponse,rememberOfflineFailureResponse,clearOfflineFailureResponse} from "../src/features/offline/services/offlineFailureResponse";
import {OfflineFailureResponse} from "../src/features/offline/components/OfflineFailureResponse";
const values=new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
const scope={characterId:"c",relationId:"r",userIdentityId:"u",conversationId:"conv"};
const message={id:"m",characterId:"c",sender:"user" as const,content:"我害怕打雷。",timestamp:1};
const story={id:"story",...scope,ownerIdentityId:"u",mode:"continue",title:"test",messages:[message],createdAt:1,updatedAt:1} as OfflineStory;
const raw='private synthetic response <script>untrusted</script>';
const originalFetch=globalThis.fetch;let calls=0;
globalThis.fetch=(async()=>{calls++;return Response.json({text:raw});}) as typeof fetch;
try{
 const result=await extractOfflineArchiveWithCheckpoint({story,character:{id:"c",name:"C"} as Character,scope,
 settings:{apiKey:"synthetic",selectedModel:"synthetic"} as any,context:{...scope,character:{id:"c",name:"C"} as Character,recentMessages:[message],existingMemories:[],existingClaims:[],scenario:"offline",apiKey:"synthetic",model:"synthetic",createId:()=>"id",currentTime:()=>1,formatContent:items=>items.join("\n")},
 extractApi:apiExtractMemories,persist:async()=>{throw Error("failed response must never enter a persisted checkpoint");}});
 assert.ok(result.apiError);assert.equal(calls,1);
 const response=readOfflineFailureResponse(story)!;
 assert.equal(response.text,raw);assert.equal(response.logicalRequests,1);
 assert.equal(response.category,"json_parse_failed");
 assert.ok(!JSON.stringify(result).includes(raw),"raw response cannot enter an archive result");
 assert.ok(!JSON.stringify([...values]).includes(raw),"raw response cannot enter storage or ledger");
 const html=renderToStaticMarkup(<OfflineFailureResponse story={story}/>);
 assert.match(html,/查看本次返回/);assert.ok(!html.includes(raw),"content stays hidden until explicit action");
 assert.equal(readOfflineFailureResponse({...story,ownerIdentityId:"other"}),undefined);
 assert.equal(readOfflineFailureResponse({...story,messages:[{...message,content:"edited"}]}),undefined);
 assert.equal(readOfflineFailureResponse({...story,messages:[]}),undefined);
 clearOfflineFailureResponse(story);assert.equal(readOfflineFailureResponse(story),undefined);
 assert.doesNotMatch(renderToStaticMarkup(<OfflineFailureResponse story={story}/>),/查看本次返回/);
 for(let n=0;n<4;n++)rememberOfflineFailureResponse({...story,id:`s${n}`},{text:raw},1);
 assert.equal(readOfflineFailureResponse({...story,id:"s0"}),undefined,"only three bounded responses retained");
 assert.equal(calls,1,"view/read/clear never trigger a model call");
 console.log("PASS transient offline failure response: real mocked extraction path, no persistence/extra API, scope and source binding, hidden until opened, bounded retention");
}finally{globalThis.fetch=originalFetch;}
