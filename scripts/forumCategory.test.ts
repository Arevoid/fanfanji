import assert from "node:assert/strict";
import type { UserIdentity } from "../src/types";
import {
  createForumThread,
  FORUM_RECOMMENDATION_CATEGORY,
  inferForumThreadCategory,
  resolveForumThreadCategory,
} from "../src/domain/forum/forumData";

const identity: UserIdentity = {
  id: "identity-forum-category",
  name: "用户",
  avatar: "",
  signature: "",
  bio: "",
};

assert.equal(inferForumThreadCategory({ title: "求助，电视剧突然看不了", body: "有没有人知道怎么处理？" }), "求助");
assert.equal(inferForumThreadCategory({ title: "热搜上的录音是真的吗", body: "吃瓜但不想把传闻当事实。" }), "八卦");
assert.equal(resolveForumThreadCategory({ category: FORUM_RECOMMENDATION_CATEGORY, title: "分手后一直睡不着", body: "想听听大家的建议。" }), "情感");
assert.equal(resolveForumThreadCategory({ category: "自定义世界", title: "普通帖子", body: "这条已有明确分类。" }), "自定义世界");

const migrated = createForumThread({
  id: "thread-category-migration",
  identity,
  title: "邻居半夜装修太吵了",
  body: "想问下大家有没有合理的处理办法。",
  category: FORUM_RECOMMENDATION_CATEGORY,
  anonymous: false,
  now: 100,
});
assert.notEqual(migrated.category, FORUM_RECOMMENDATION_CATEGORY);
assert.equal(migrated.category, "求助");

console.log("PASS forum recommendation is an aggregate feed and concrete labels are inferred for legacy/user posts");
