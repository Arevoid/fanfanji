import assert from "node:assert/strict";
import type { Moment } from "../src/types";
import { isMomentPublic, isMomentVisibleToUser } from "../src/features/moments/services/momentVisibility";

const base: Moment = {
  id: "phone-moment-1",
  characterId: "character-1",
  ownerIdentityId: "identity-1",
  authorName: "步随影",
  authorAvatar: "avatar",
  content: "一条角色手机动态",
  timestamp: 1,
  likes: [],
  comments: [],
};

assert.equal(isMomentVisibleToUser(base, "identity-1"), true, "legacy moments remain public");
assert.equal(isMomentPublic(base), true);
assert.equal(isMomentVisibleToUser({ ...base, visibility: "private" }, "identity-1"), false);
assert.equal(isMomentPublic({ ...base, visibility: "user" }), false);
assert.equal(isMomentVisibleToUser({ ...base, visibility: "user" }, "identity-1"), true);
assert.equal(isMomentVisibleToUser({ ...base, visibility: "specific", visibilityTargetIds: ["character-2"] }, "identity-1"), false);
assert.equal(isMomentPublic({ ...base, visibility: "specific", visibilityTargetIds: ["character-2"] }), false);

console.log("moment visibility tests passed");
