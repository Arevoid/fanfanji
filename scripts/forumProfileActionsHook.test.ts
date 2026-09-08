import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appForum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/forum/hooks/useForumProfileActions.ts", import.meta.url), "utf8");

assert.match(appForum, /useForumProfileActions\(/);
assert.doesNotMatch(appForum, /const saveProfile = \(\) =>/);
assert.doesNotMatch(appForum, /const uploadProfileAvatar = async/);
assert.match(hook, /ownerIdentityId !== activeIdentityId/);
assert.match(hook, /displayName\.slice\(0, 32\)/);
assert.match(hook, /profileBio\.trim\(\)\.slice\(0, 160\)/);
assert.match(hook, /forum-profile-avatar-\$\{activeIdentityId\}/);
assert.match(hook, /compressImage\(file\)/);
assert.match(hook, /头像保存失败，请重试/);

console.log("PASS forum profile persistence and avatar actions are isolated behind a scoped hook");
