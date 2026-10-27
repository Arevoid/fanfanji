import assert from "node:assert/strict";
import {apiChat} from "../src/utils/apiHelper";
import {configureMemoryMigrationBudget,readMemoryMigrationBudget,withMemoryMigrationBudget} from "../src/features/characterKnowledge/services/memoryMigrationBudgetService";
const values=new Map<string,string>();Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
let fetches=0;let direct=0;const savedFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{fetches++;if(String(url)==="/api/chat"){
  assert.doesNotMatch(String(options?.body),/beforeAttempt/);throw TypeError("synthetic network unavailable");
}direct++;return new Response(JSON.stringify({choices:[{message:{content:"{}"}}]}),{status:200,headers:{"Content-Type":"application/json"}});};
const request={message:"test",history:[],apiKey:"synthetic",model:"synthetic",apiEndpoint:"https://synthetic.invalid/v1"};
try {
 configureMemoryMigrationBudget(1,false);await assert.rejects(()=>withMemoryMigrationBudget(apiChat)(request));assert.equal(fetches,1);assert.equal(direct,0,"fallback cannot exceed budget");assert.equal(readMemoryMigrationBudget().value.used,1);
 values.clear();fetches=0;configureMemoryMigrationBudget(2,false);await withMemoryMigrationBudget(apiChat)(request);assert.equal(fetches,2);assert.equal(direct,1);assert.equal(readMemoryMigrationBudget().value.used,2,"client proxy + direct fallback counted, server not double counted");
 await assert.rejects(()=>withMemoryMigrationBudget(apiChat)(request));assert.equal(fetches,2,"no N+1 transport attempt");
}finally{globalThis.fetch=savedFetch;}
console.log("PASS migration budget on actual apiChat transport: proxy delivery, fallback ceiling, no secret callback serialization, no N+1 request");
