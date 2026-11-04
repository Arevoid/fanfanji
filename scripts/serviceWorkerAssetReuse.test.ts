import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const handlers: Record<string,(event:any)=>void> = {};
const cached = new Map<string,Response>();
let networkCalls=0;
const context = { self:{location:{origin:"https://phone.test"},addEventListener:(name:string,handler:any)=>handlers[name]=handler},URL,Response,console,
  caches:{open:async()=>({match:async(request:Request)=>cached.get(request.url)?.clone(),put:async(request:Request,response:Response)=>{cached.set(request.url,response);}})},
  fetch:async()=>{networkCalls++;return new Response("release-A",{headers:{"content-type":"application/javascript"}});},
};
vm.runInNewContext(readFileSync(new URL("../public/sw.js",import.meta.url),"utf8"),context);
const asset=async(path:string)=>{let result!:Promise<Response>;handlers.fetch({request:new Request(`https://phone.test${path}`),respondWith:(promise:Promise<Response>)=>result=promise});return result;};
assert.equal(await (await asset("/assets/App-abcdefgh.js")).text(),"release-A");
assert.equal(await (await asset("/assets/App-abcdefgh.js")).text(),"release-A");assert.equal(networkCalls,1,"same version opens from cache");
await asset("/assets/App-ijklmnop.js");assert.equal(networkCalls,2,"another release hash cannot reuse the old asset");
console.log("PASS immutable release asset cache avoids repeat network requests without crossing hashes");
