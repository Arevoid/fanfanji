import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appForum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/forum/hooks/useForumCommunityNpcActions.ts", import.meta.url), "utf8");

assert.match(appForum, /useForumCommunityNpcActions\(/);
assert.doesNotMatch(appForum, /const (saveCommunityNpc|updateCommunityNpc|exportCommunityNpcs|importCommunityNpcs) =/);
assert.match(hook, /ownerIdentityId: activeIdentityId/);
assert.match(hook, /forum-community-npc\/v1/);
assert.match(hook, /JSON\.parse\(await file\.text\(\)\)/);
assert.match(hook, /URL\.revokeObjectURL/);
assert.match(hook, /未找到可导入的论坛 NPC 角色卡/);

console.log("PASS forum community-NPC file and persistence actions are isolated behind a scoped hook");
