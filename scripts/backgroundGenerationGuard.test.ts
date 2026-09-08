import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(source, /backgroundGenerationBlockedRef = useRef\(false\)/);
assert.match(source, /backgroundGenerationBlockedRef\.current = false;[\s\S]*settings\.apiKey/);
assert.match(source, /if \(backgroundGenerationBlockedRef\.current \|\| activeRelationships\.length === 0\) return/);
assert.match(source, /if \(backgroundGenerationBlockedRef\.current \|\| isOfflineStoryActiveFor\(relationId\)/);
assert.match(source, /if \(isAuthError\) backgroundGenerationBlockedRef\.current = true/);

console.log("PASS background generation stops after authentication failure and resumes after settings change");
