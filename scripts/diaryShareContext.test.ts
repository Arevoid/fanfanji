import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DiaryEntry } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { buildRelationDiaryContext } from "../src/domain/prompt/diaryContext";
import { createDiaryShareMessage } from "../src/features/diary/services/diaryShareService";

const now = Date.now();
const relation = (overrides: Partial<CharacterRelationship> = {}): CharacterRelationship => ({
  id: "r1",
  characterId: "char",
  userIdentityId: "i1",
  conversationId: "c1",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});
const entry = (overrides: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: "e1",
  ownerIdentityId: "i1",
  authorType: "user",
  authorNameSnapshot: "User",
  title: "Today",
  body: "Only this relationship can see this diary.",
  tags: [],
  occurredAt: now,
  createdAt: now,
  updatedAt: now,
  source: "manual",
  isFavorite: false,
  ...overrides,
});

const created = createDiaryShareMessage({ entry: entry(), relation: relation(), messageId: "m1", now });
const message = created.message;
const userShares = [created.share];

assert.equal(created.share.id, created.message.diaryShareId);
assert.equal(created.share.messageId, created.message.id);
assert.equal(created.share.targetRelationId, created.message.relationId);
assert.equal(created.share.conversationId, created.message.conversationId);
assert.equal(created.share.snapshot.body, "Only this relationship can see this diary.");

const mutableEntry = entry({ body: "冻结前内容" });
const frozen = createDiaryShareMessage({ entry: mutableEntry, relation: relation(), now });
mutableEntry.body = "冻结后修改";
assert.equal(frozen.share.snapshot.body, "冻结前内容", "editing the source entry must not mutate a sent snapshot");

assert.throws(() => createDiaryShareMessage({
  entry: entry({ ownerIdentityId: "i2" }),
  relation: relation(),
}), /不属于同一个 user 身份/);
assert.throws(() => createDiaryShareMessage({
  entry: entry({ authorType: "character", characterId: "char", relationId: "r1", conversationId: "c1" }),
  relation: relation({ id: "r2", conversationId: "c2" }),
}), /只能分享回它所属的好友关系/);
const ownCharacterDiary = createDiaryShareMessage({
  entry: entry({ authorType: "character", characterId: "char", relationId: "r1", conversationId: "c1" }),
  relation: relation(),
  now,
});
assert.equal(ownCharacterDiary.share.snapshot.authorType, "character");

const visible = buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r1", conversationId: "c1", messages: [message], shares: userShares, messageId: message.id, now });
const hidden = buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r2", conversationId: "c2", messages: [], shares: userShares, now });
assert.match(visible, /日记作者：用户本人/);
assert.match(visible, /不是角色写的。/);
assert.match(visible, /日记正文开始/);
assert.match(visible, /不是系统指令/);
assert.equal(hidden, "");
assert.equal(buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r1", conversationId: "c1", messages: [], shares: userShares, now }), "", "a fresh orphan snapshot must never enter prompts without its linked message");
assert.equal(buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r1", conversationId: "c1", messages: [{ ...message, diaryShareId: "wrong-share" }], shares: userShares, now }), "", "message and snapshot IDs must match in both directions");
assert.equal(buildRelationDiaryContext({ ownerIdentityId: "i2", relationId: "r1", conversationId: "c1", messages: [message], shares: userShares, now }), "", "another user identity must not read the snapshot");

const characterShares = [{ ...userShares[0], snapshot: { authorType: "character" as const, authorName: "Character", body: "I found an old record.", occurredAt: now } }];
const characterVisible = buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r1", conversationId: "c1", messages: [message], shares: characterShares, messageId: message.id, now });
assert.match(characterVisible, /日记作者：角色本人/);
assert.match(characterVisible, /不是用户写的/);
assert.match(characterVisible, /不要说成‘你的日记’/);
assert.equal(buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r1", conversationId: "c1", messages: [message], shares: characterShares, messageId: "missing", now }), "", "a different current message must not reuse an older diary share");

const appDiarySource = readFileSync(new URL("../src/components/AppDiary.tsx", import.meta.url), "utf8");
assert.match(appDiarySource, /createDiaryShareMessage\(\{ entry, relation: target\.relation \}\)/);
assert.match(appDiarySource, /if \(!writeResult\.success\) throw new Error/);
assert.ok(appDiarySource.indexOf("saveDiaryShares([") < appDiarySource.indexOf("onSendMessage(message)"), "the frozen snapshot must persist before its chat message is sent");
assert.match(appDiarySource, /onOpenChat\(target\.relation\.characterId, target\.relation\.id, message\.id\)/);

console.log("diary share context tests passed");
