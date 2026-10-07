import assert from "node:assert/strict";
import type { Moment } from "../src/types";
import { formatMomentVisibilityLabel, isMomentPublic, isMomentVisibleToViewer, isMomentVisibleToUser, normalizeMomentVisibility } from "../src/features/moments/services/momentVisibility";

const base: Moment = {
  id: "moment-test",
  ownerIdentityId: "identity-owner",
  authorName: "用户",
  authorAvatar: "",
  content: "测试",
  timestamp: 1,
  likes: [],
  comments: [],
};

assert.equal(normalizeMomentVisibility(undefined), "public");
assert.equal(isMomentPublic(base), true);
assert.equal(isMomentVisibleToUser(base, "identity-owner"), true);
assert.equal(isMomentVisibleToUser(base, "identity-other"), false);

assert.equal(isMomentVisibleToViewer({ ...base, visibility: "private" }, { ownerIdentityId: "identity-owner" }), true);
assert.equal(isMomentVisibleToViewer({ ...base, characterId: "character-author", visibility: "private" }, { ownerIdentityId: "identity-owner" }), false);
assert.equal(isMomentVisibleToViewer({ ...base, visibility: "user" }, { ownerIdentityId: "identity-owner" }), true);
assert.equal(isMomentVisibleToViewer({ ...base, visibility: "specific", visibilityTargetIds: ["character-target"] }, { ownerIdentityId: "identity-owner" }), true, "the user must see their own special-audience post");
assert.equal(isMomentVisibleToViewer({ ...base, characterId: "character-author", visibility: "public" }, { ownerIdentityId: "identity-owner" }), true);
assert.equal(isMomentVisibleToViewer({ ...base, characterId: "character-author", visibility: "user" }, { ownerIdentityId: "identity-owner" }), true);
assert.equal(isMomentVisibleToViewer({ ...base, visibility: "specific", visibilityTargetIds: ["character-target"] }, { ownerIdentityId: "identity-owner", characterId: "character-target" }), true);
assert.equal(isMomentVisibleToViewer({ ...base, visibility: "specific", visibilityTargetIds: ["character-target"] }, { ownerIdentityId: "identity-owner", characterId: "character-other" }), false);
assert.equal(isMomentVisibleToViewer({ ...base, visibility: "specific", visibilityTargetIds: ["identity-reader"] }, { ownerIdentityId: "identity-owner", identityId: "identity-reader" }), true);
assert.equal(formatMomentVisibilityLabel("public"), "公开");
assert.equal(formatMomentVisibilityLabel("private"), "私密");
assert.equal(formatMomentVisibilityLabel("specific"), "特别的人");
