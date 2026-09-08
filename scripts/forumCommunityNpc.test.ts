import assert from "node:assert/strict";

const values = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => { values.clear(); },
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  get length() { return values.size; },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: localStorageStub } });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorageStub });

const { createForumCommunityNpc, toForumCommunityNpcAuthor, toForumCommunityNpcProfile } = await import("../src/features/forum/forumCommunityNpcData");
const { listForumCommunityNpcsForIdentity, removeForumCommunityNpc, upsertForumCommunityNpc } = await import("../src/core/storage/repositories/forumCommunityNpcRepository");

const first = createForumCommunityNpc({
  id: "forum-npc-a",
  ownerIdentityId: "identity-a",
  displayName: "热心网友",
  avatar: "https://example.test/avatar.png",
  personaSummary: "夜猫子，回答前爱说谢邀。",
  now: 1,
});
const second = createForumCommunityNpc({
  id: "forum-npc-b",
  ownerIdentityId: "identity-b",
  displayName: "隔壁楼路人",
  personaSummary: "只参与另一个论坛身份。",
  now: 2,
});

assert.equal(upsertForumCommunityNpc(first).success, true);
assert.equal(upsertForumCommunityNpc(second).success, true);
assert.deepEqual(listForumCommunityNpcsForIdentity("identity-a").map((item) => item.id), [first.id]);
assert.equal(listForumCommunityNpcsForIdentity("identity-b").length, 1);
assert.equal(toForumCommunityNpcAuthor(first).displayName, "热心网友");
assert.equal(toForumCommunityNpcProfile(first).publicStyle.includes("谢邀"), true);
assert.equal(values.has("phone_characters_v3"), false, "forum NPC must not create a real Character");
assert.equal(values.has("phone_relationships"), false, "forum NPC must not create a Relationship");

assert.equal(upsertForumCommunityNpc({ ...first, enabled: false, updatedAt: 3 }).success, true);
assert.equal(listForumCommunityNpcsForIdentity("identity-a")[0].enabled, false);
assert.equal(removeForumCommunityNpc("identity-a", first.id).success, true);
assert.equal(listForumCommunityNpcsForIdentity("identity-a").length, 0);
assert.equal(listForumCommunityNpcsForIdentity("identity-b").length, 1, "deletion must remain identity-scoped");

console.log("forum community NPC repository tests passed");
