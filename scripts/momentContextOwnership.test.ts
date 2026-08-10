import assert from "node:assert/strict";
import { buildKnownMomentsContext } from "../src/domain/prompt/momentContext";
import type { Moment } from "../src/types";

const characterMoment: Moment = {
  id: "moment-1",
  characterId: "character-1",
  ownerIdentityId: "identity-1",
  authorName: "步随影",
  authorAvatar: "avatar",
  content: "猜猜这周六谁要去 TGC",
  timestamp: Date.parse("2026-08-10T00:05:00+08:00"),
  likes: [],
  comments: [
    { id: "comment-user", authorName: "饭饭", authorAvatar: "user", content: "不会是你吧！", timestamp: 2 },
    { id: "comment-character", authorName: "步随影", authorAvatar: "avatar", content: "没错是我", timestamp: 3 },
  ],
};

const context = buildKnownMomentsContext({
  moments: [characterMoment],
  activeCharacterId: "character-1",
  activeIdentityId: "identity-1",
  userName: "饭饭",
  getPublicBody: (moment) => moment.content,
  getPublicComments: (moment) => moment.comments,
});

assert.match(context, /角色本人（你，发布人）/);
assert.match(context, /评论作者 饭饭（机主）: "不会是你吧！"/);
assert.match(context, /评论作者 角色本人（你）: "没错是我"/);
assert.match(context, /禁止把角色要做的事说成机主要做/);
assert.doesNotMatch(context, /饭饭（机主，发布人）/);

console.log("moment context ownership tests passed");
