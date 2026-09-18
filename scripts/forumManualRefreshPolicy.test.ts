import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appForum = await readFile(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
assert.doesNotMatch(appForum, /trigger:\s*["']lazy["']/);
assert.match(appForum, /const plannedCount = 3 \+ Math\.floor\(Math\.random\(\) \* 4\)/);
assert.match(appForum, /Math\.min\(6, generationCategoryTargets\.length\)/);
assert.match(appForum, /generated\.threads\.length < 3/);
assert.match(appForum, /FORUM_RECOMMENDATION_CATEGORY/);
assert.match(appForum, /FORUM_DEFAULT_POST_CATEGORIES/);
assert.match(appForum, /trigger:\s*["']refresh["']/);
assert.doesNotMatch(appForum, /setNotice\(`已生成 \$\{generated\.threads\.length\}/);

console.log("forum manual refresh policy tests passed");
