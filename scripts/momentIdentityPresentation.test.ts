import assert from "node:assert/strict";
import {
  getMomentLikeDisplayNames,
  isMomentLikedByIdentity,
  migrateMomentIdentitySnapshots,
  resolveMomentCommentAuthor,
  toggleMomentLike,
} from "../src/features/moments/services/momentIdentityPresentation";
import type { Moment, UserSettings } from "../src/types";

const previousSettings = {
  name: "旧名字",
  avatar: "old-avatar.png",
  identities: [{ id: "identity-1", name: "旧名字", avatar: "old-avatar.png", signature: "", bio: "", kind: "primary" }],
} as UserSettings;
const nextSettings = {
  ...previousSettings,
  name: "新名字",
  avatar: "new-avatar.png",
  identities: [{ id: "identity-1", name: "新名字", avatar: "new-avatar.png", signature: "", bio: "", kind: "primary" }],
} as UserSettings;

const moment: Moment = {
  id: "moment-identity",
  ownerIdentityId: "identity-1",
  authorIdentityId: "identity-1",
  authorName: "旧名字",
  authorAvatar: "old-avatar.png",
  content: "身份快照",
  timestamp: 1,
  likes: ["旧名字"],
  comments: [{
    id: "comment-identity",
    authorIdentityId: "identity-1",
    authorName: "旧名字",
    authorAvatar: "old-avatar.png",
    content: "旧评论",
    timestamp: 2,
  }],
};

const migrated = migrateMomentIdentitySnapshots(previousSettings, nextSettings, [moment]);
assert.equal(migrated.changed, true);
assert.equal(migrated.moments[0].authorName, "新名字");
assert.equal(migrated.moments[0].authorAvatar, "new-avatar.png");
assert.equal(migrated.moments[0].comments[0].authorName, "新名字");
assert.equal(migrated.moments[0].comments[0].authorAvatar, "new-avatar.png");
assert.deepEqual(migrated.moments[0].likes, ["新名字"]);

const identityBacked = toggleMomentLike({ ...moment, likes: [] }, { identityId: "identity-1", name: "旧名字" });
assert.equal(identityBacked.likeActors?.[0].identityId, "identity-1");
assert.equal(isMomentLikedByIdentity(identityBacked, "identity-1", "新名字"), true);
assert.deepEqual(getMomentLikeDisplayNames(identityBacked, nextSettings), ["新名字"]);
const unliked = toggleMomentLike(identityBacked, { identityId: "identity-1", name: "新名字" });
assert.equal(unliked.likes.length, 0);
assert.equal(unliked.likeActors, undefined);

const author = resolveMomentCommentAuthor(moment.comments[0], nextSettings, []);
assert.deepEqual(author, { name: "新名字", avatar: "new-avatar.png" });

console.log("PASS Moments identity-backed likes, rename migration, and comment presentation");
