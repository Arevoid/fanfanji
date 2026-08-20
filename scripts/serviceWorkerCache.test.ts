import assert from "node:assert/strict";
import { createServiceWorkerCacheName, replaceServiceWorkerCacheName } from "./generateServiceWorkerCache";

const name = createServiceWorkerCacheName("1.2.3", "source-a");
assert.match(name, /^fanfan-phone-1\.2\.3-[a-f0-9]{12}$/);
assert.notEqual(name, createServiceWorkerCacheName("1.2.3", "source-b"));
const updated = replaceServiceWorkerCacheName('const CACHE_NAME = "old";\nself.addEventListener("fetch", () => {});', name);
assert.match(updated, new RegExp(`CACHE_NAME = "${name}"`));
assert.throws(() => replaceServiceWorkerCacheName("self.addEventListener(\"fetch\", () => {});", name), /CACHE_NAME/);
console.log("PASS Service Worker cache names are derived from the release source fingerprint");
