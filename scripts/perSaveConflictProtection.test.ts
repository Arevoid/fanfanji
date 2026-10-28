import assert from "node:assert/strict";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { MemoryContentStore } from "../src/core/storage/memoryContentStore";
import { LocalSaveGuard } from "../src/core/storage/localSaveGuard";
import { MessageEntryDB } from "../src/core/storage/messageEntryDb";
import { OfflineStoryEntryDB } from "../src/core/storage/offlineStoryEntryDb";
import type { Message, OfflineStory } from "../src/types";
class Legacy implements Storage {
  values = new Map<string,string>();
  get length() {return this.values.size;}
  getItem(key:string) {return this.values.get(key)??null;}
  setItem(key:string,value:string) {this.values.set(key,value);}
  removeItem(key:string) {this.values.delete(key);}
  clear() {this.values.clear();}
  key(index:number) {return [...this.values.keys()][index]??null;}
}
const factory = new IDBFactory(), legacy = new Legacy();
const key = "phone_conversation_summaries", other = "phone_memory_mentions_v1";
const a = new MemoryContentStore(), b = new MemoryContentStore();
await Promise.all([a,b].map(store => store.initialize({factory,legacy,writable:true})));
const left = a.stage({[key]:JSON.stringify([{id:"one",content:"newer"}])});
assert.equal((await left.durable!).success,true);
const stale = b.stage({[key]:JSON.stringify([{id:"one",content:"stale"}]),[other]:"[]"});
assert.equal((await stale.durable!).error,"conflict","entire stale bundle must abort");
assert.equal(b.status.phase,"ready","conflict does not lock the page");
assert.equal((await b.stage({[other]:"[]"}).durable!).success,true,"unrelated datasets remain writable");
const check = new MemoryContentStore(); await check.initialize({factory,legacy,writable:true});
assert.equal(JSON.parse(check.read(key).value!)[0].content,"newer");
a.close();b.close();check.close();

const localA = new LocalSaveGuard(), localB = new LocalSaveGuard();
await Promise.all([localA.initialize(factory),localB.initialize(factory)]);
legacy.setItem("characters","old");
assert.equal(localA.read(legacy,"characters"),"old"); assert.equal(localB.read(legacy,"characters"),"old");
const save = (guard:LocalSaveGuard,k:string,v:string) => guard.stage(legacy,k,v,()=>{legacy.setItem(k,v);return {success:true};});
const [savedA,savedB] = await Promise.all([save(localA,"characters","A").durable!,save(localB,"characters","B").durable!]);
assert.equal([savedA,savedB].filter(result=>result.success).length,1,"atomic guard permits one conflicting LocalStorage save");
assert.equal(legacy.getItem("characters"),"A");
assert.equal((await save(localB,"another-dataset","works").durable!).success,true);

Object.defineProperty(globalThis,"indexedDB",{value:factory,configurable:true});
Object.defineProperty(globalThis,"IDBKeyRange",{value:IDBKeyRange,configurable:true});
const first = new MessageEntryDB(), second = new MessageEntryDB();
await Promise.all([first.loadAll(),second.loadAll()]);
const message = {id:"m1",characterId:"c",sender:"user",content:"saved",timestamp:1} as Message;
await first.saveSnapshot([message]);
await assert.rejects(()=>second.saveSnapshot([{...message,content:"stale"}]));
assert.equal((await first.loadAll())[0].content,"saved");
await first.saveSnapshot([{...message,content:"updated"}]);
assert.equal((await first.loadAll())[0].content,"updated","same page can save repeatedly");
const offA = new OfflineStoryEntryDB(), offB = new OfflineStoryEntryDB();
await Promise.all([offA.loadAll(),offB.loadAll()]);
const story = {id:"story",characterId:"c",title:"story",mode:"continue",messages:[message],createdAt:1,updatedAt:1} as OfflineStory;
await offA.save(story);
await assert.rejects(()=>offB.save({...story,title:"stale"}));
await offA.save({...story,title:"new title"});
assert.equal((await offA.loadAll())[0].title,"new title");
const reloaded = new OfflineStoryEntryDB(); await reloaded.loadAll(); await reloaded.save({...story,title:"after reload"});
assert.equal((await reloaded.loadAll())[0].title,"after reload","freshly loaded page data can be saved");
console.log("PASS per-save protection: concurrent migration, atomic stale bundles, LocalStorage race, message/offline conflicts, repeated saves; no page lease");
