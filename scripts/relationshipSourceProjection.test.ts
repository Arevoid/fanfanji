import assert from "node:assert/strict";
import { projectRelationshipSource } from "../src/features/relationshipNetwork/services/relationshipSourceProjection";
const raw = `Character:
  Name: 小舟
  Background:
    李老师是导师。母亲经营花店。
  Intimacy_and_NSFW:
    私密内容不会用于人物关系提取。
    行为: 自慰以及相关描写。
  Friends:
    同事林雨喜欢读书。
  Communication:
    聊天时必须扮演角色，不要输出JSON。
  Family:
    父亲叫周明。
`;
const projected = projectRelationshipSource(raw);
assert.match(projected, /李老师|母亲/); assert.match(projected, /同事林雨/); assert.match(projected, /父亲叫周明/);
assert.doesNotMatch(projected, /NSFW|私密内容|自慰|不要输出JSON/);
assert.match(raw, /NSFW/, "the stored original must never be edited");
assert.equal(projectRelationshipSource("小舟的父亲叫周明。后面是自慰描写。导师是李老师。"), "小舟的父亲叫周明。导师是李老师。");
assert.equal(projectRelationshipSource("普通世界观资料，家族和朋友的背景。"), "普通世界观资料，家族和朋友的背景。");
console.log("PASS relation-specific projection retains social facts, excludes unrelated private/style sections, and never mutates originals");
