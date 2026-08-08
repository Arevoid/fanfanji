import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appForum = await readFile(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
assert.doesNotMatch(appForum, /trigger:\s*["']lazy["']/);
assert.match(appForum, /const plannedCount = 1 \+ Math\.floor\(Math\.random\(\) \* 5\)/);
assert.match(appForum, /trigger:\s*["']refresh["']/);

console.log("forum manual refresh policy tests passed");
