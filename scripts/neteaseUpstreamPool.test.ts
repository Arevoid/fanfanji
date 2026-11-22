import assert from "node:assert/strict";
import { isNeteaseUpstreamRetryable, NeteaseUpstreamPool, parseNeteaseUpstreamUrls } from "../src/server/neteaseUpstreamPool";

assert.deepEqual(parseNeteaseUpstreamUrls(" https://primary.test/ ", "https://backup.test,\nhttps://primary.test/"), ["https://primary.test", "https://backup.test"]);
assert.equal(isNeteaseUpstreamRetryable({ status: 503 }), true);
assert.equal(isNeteaseUpstreamRetryable({ status: 429 }), true);
assert.equal(isNeteaseUpstreamRetryable({ code: 502 }), true);
assert.equal(isNeteaseUpstreamRetryable({ status: 401 }), false);

const pool = new NeteaseUpstreamPool(["https://primary.test", "https://backup.test"]);
assert.deepEqual((await pool.getCandidates("https://primary.test")).map((target) => target.baseUrl), ["https://primary.test", "https://backup.test"]);
pool.markFailure(pool.targets[0]);
assert.deepEqual((await pool.getCandidates("https://primary.test")).map((target) => target.baseUrl), ["https://backup.test"]);
pool.markSuccess(pool.targets[0]);
assert.equal(pool.healthSnapshot()[0].healthy, true);

const capabilityPool = new NeteaseUpstreamPool(["https://zmusic.example.test", "https://compatible.example.test"]);
capabilityPool.setCapabilityProbe(async (target) => target.baseUrl.includes("zmusic")
  ? { status: "incompatible", reason: "当前 API 仅限 ZMusic 使用" }
  : { status: "compatible" });
assert.deepEqual((await capabilityPool.getCandidates()).map((target) => target.baseUrl), ["https://compatible.example.test"]);
assert.equal(capabilityPool.healthSnapshot()[0].capability, "incompatible");
assert.equal(capabilityPool.healthSnapshot()[1].capability, "compatible");

console.log("neteaseUpstreamPool tests passed");
