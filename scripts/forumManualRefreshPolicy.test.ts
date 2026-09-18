import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appForum = await readFile(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
assert.doesNotMatch(appForum, /trigger:\s*["']lazy["']/);
assert.match(appForum, /const plannedCount = 4 \+ Math\.floor\(Math\.random\(\) \* 5\)/);
assert.match(appForum, /Math\.min\(8, generationCategoryTargets\.length\)/);
assert.match(appForum, /generated\.threads\.length < 4/);
assert.match(appForum, /FORUM_RECOMMENDATION_CATEGORY/);
assert.match(appForum, /FORUM_DEFAULT_POST_CATEGORIES/);
assert.match(appForum, /trigger:\s*["']refresh["']/);
assert.doesNotMatch(appForum, /setNotice\(`已生成 \$\{generated\.threads\.length\}/);
assert.doesNotMatch(appForum, /setNotice\(["']发现了新的回复["']\)/);
assert.doesNotMatch(appForum, /\? "楼主发布了新动态" : "发现了新的回复"/);

const generationService = await readFile(new URL("../src/features/forum/services/forumGenerationService.ts", import.meta.url), "utf8");
assert.match(generationService, /replies 必须为 3-8 条/);
assert.match(generationService, /generated\.replies\.length < FORUM_INITIAL_REPLY_MIN/);

console.log("forum manual refresh policy tests passed");
