import assert from "node:assert/strict";
import { cachedModule, COMMON_APP_PRELOAD_ORDER, startAppPreloading } from "../src/features/home/appPreloading";
assert.deepEqual(COMMON_APP_PRELOAD_ORDER, ["chat","offline","archives","worldbook","relationship-network","forum","reading"]);
let calls = 0;
let complete!: (value:string) => void;
const module = cachedModule(() => { calls++; return new Promise<string>(resolve => complete=resolve); });
const idle = module();
assert.equal(module(),idle,"navigation must reuse in-flight idle work");
complete("ready"); await idle; assert.equal(await module(),"ready"); assert.equal(calls,1);
let attempts = 0;
const retry = cachedModule(async () => { if (++attempts === 1) throw new Error("offline"); return "ok"; });
await assert.rejects(retry()); assert.equal(await retry(),"ok","failed warm-up must not poison explicit navigation");
const jobs: Array<() => void> = [];
const loaded: string[] = [];
let allowed = true;
let release!: () => void;
const runner = startAppPreloading({
  allowed:()=>allowed,
  schedule:work=>{jobs.push(work);return ()=>{const index=jobs.indexOf(work);if(index>=0)jobs.splice(index,1);};},
  load:async id=>{loaded.push(id);if(id==="chat")await new Promise<void>(resolve=>release=resolve);},
});
jobs.shift()!(); assert.deepEqual(loaded,["chat"]); assert.equal(jobs.length,0,"only one background import at a time");
allowed=false;release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(jobs.length,0);
allowed=true;runner.wake();jobs.shift()!();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(loaded,["chat","offline"]);
runner.stop();assert.equal(jobs.length,0);runner.wake();assert.equal(jobs.length,0,"unmounted scheduler cannot start another job");
console.log("PASS ordered idle preload, pause/resume, cancellation and shared module imports");
