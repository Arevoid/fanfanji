import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDevLoopbackOrigin, isLoopbackHostname } from "../src/core/runtime/devOrigin";

const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

assert.equal(isLoopbackHostname("localhost"), true);
assert.equal(isLoopbackHostname("127.0.0.1"), true);
assert.equal(isLoopbackHostname("127.0.0.2"), true);
assert.equal(isLoopbackHostname("127.255.255.254"), true);
assert.equal(isLoopbackHostname("::1"), true);
assert.equal(isLoopbackHostname("[::1]"), true);
assert.equal(isLoopbackHostname("127.0.0.999"), false);
assert.equal(isLoopbackHostname("127.0.0"), false);
assert.equal(isLoopbackHostname("127.0.a.1"), false);
assert.equal(isLoopbackHostname("example.com"), false);

assert.equal(isDevLoopbackOrigin("localhost", true), true);
assert.equal(isDevLoopbackOrigin("127.0.0.2", true), true);
assert.equal(isDevLoopbackOrigin("127.10.20.30", true), true);
assert.equal(isDevLoopbackOrigin("::1", true), true);
assert.equal(isDevLoopbackOrigin("localhost", false), false);
assert.equal(isDevLoopbackOrigin("127.0.0.2", false), false);
assert.equal(isDevLoopbackOrigin("example.com", true), false);

assert.match(mainSource, /isDevLoopbackOrigin\(\s*window\.location\.hostname,\s*\n?\s*Boolean\(typeof import\.meta\.env/);
assert.match(mainSource, /registration\.unregister\(\)/);
assert.doesNotMatch(mainSource, /caches\.delete\(/);
assert.match(mainSource, /navigator\.serviceWorker\.register\("\/sw\.js"/);

console.log("PASS dev-origin Service Worker policy: loopback unregister is dev-only and production registration remains");
