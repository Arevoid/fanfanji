import assert from "node:assert/strict";
import {migrateMemoryContinuity} from "../src/features/characterKnowledge/services/memoryContinuityMigrationService";
import {saveMemories,loadMemories} from "../src/core/storage/repositories/memoryRepository";
import {loadKnowledgeClaims} from "../src/core/storage/repositories/characterKnowledgeRepository";
import type {Character} from "../src/types";
import type {CharacterRelationship} from "../src/domain/relationship/characterRelationship";
const values=new Map<string,string>();Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}}});
const relation={id:"r",characterId:"a",userIdentityId:"u",conversationId:"c",relationship:"friend",createdAt:1,updatedAt:1} as CharacterRelationship;
const original={id:"old",characterId:"a",relationId:"r",content:"用户喜欢咖啡",timestamp:1};
saveMemories([original]);let edited=false;
const input={characters:[{id:"a",name:"测试角色"} as Character],relationships:[relation],consent:true,onProgress:(p:{status:string;completed:number})=>{
 if(!edited&&p.status==="running"&&p.completed===1){edited=true;saveMemories([{...original,content:"用户不喜欢咖啡",timestamp:2}]);}
}};
assert.equal((await migrateMemoryContinuity(input))?.status,"completed");
assert.equal(loadMemories([]).value.length,0);
const records=loadKnowledgeClaims().value;
assert.ok(records.some(c=>c.status==="active"&&c.statement==="用户不喜欢咖啡"));
assert.ok(!records.some(c=>c.status==="active"&&c.statement==="用户喜欢咖啡"));
assert.ok(values.get("phone_memory_continuity_legacy_snapshot_v1")?.includes("用户喜欢咖啡"),"original version remains recoverable history");
const before=JSON.stringify(records);await migrateMemoryContinuity({...input,consent:false});assert.equal(JSON.stringify(loadKnowledgeClaims().value),before);
values.clear();saveMemories([original]);let deleted=false;
assert.equal((await migrateMemoryContinuity({...input,onProgress:p=>{if(!deleted&&p.status==="running"&&p.completed===1){deleted=true;saveMemories([]);}}}))?.status,"completed");
assert.ok(!loadKnowledgeClaims().value.some(claim=>claim.status==="active"&&claim.source.sourceRecordId===original.id),"deleting during migration never resurrects the source");
console.log("PASS migration same-ID edits: latest version migrated, old version retired, original snapshot preserved and retries converge");
