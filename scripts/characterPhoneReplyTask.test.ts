import assert from "node:assert/strict";
import { enqueuePhoneReply, isPhoneUserContact, mergePhoneDiscovery } from "../src/features/characterPhone/characterPhoneReplyTask";
import { buildCharacterPhoneContactReplyPrompt } from "../src/features/characterPhone/characterPhoneConversation";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";
import type { Character } from "../src/types";

const fixture = (): CharacterPhoneRecord => ({ id: "phone", ownerIdentityId: "owner", characterId: "host",
  contacts: [{ id: "friend", name: "同名", kind: "npc", isNpc: true, relation: "同事", relationshipNetworkNpcId: "npc" }],
  threadMessages: [{ id: "out", contactId: "friend", sender: "character", content: "你好", timestamp: 1 }],
  activities: [], actionLog: [], messages: [], updatedAt: 1 } as unknown as CharacterPhoneRecord);
let phone = fixture();
let calls = 0;
let release!: (text: string) => void;
const notices: string[] = [];
const options = { phone, contactId: "friend", outgoingMessageId: "out", read: () => phone,
  save: (next: CharacterPhoneRecord) => { phone = next; return { success: true }; },
  generate: async () => { calls++; return await new Promise<string>(resolve => { release = resolve; }); },
  notify: (notice: string) => { notices.push(notice); } };
const task = enqueuePhoneReply(options);
assert.equal(enqueuePhoneReply(options), task, "duplicate clicks share one logical request");
await new Promise(resolve => setImmediate(resolve));
// Simulate leaving the screen and another message arriving before the model responds.
phone = { ...phone, threadMessages: [...phone.threadMessages, { id: "new", contactId: "friend", sender: "character", content: "新消息", timestamp: 2 }] };
release("同事的回复"); await task;
assert.equal(calls, 1);
assert.equal(phone.threadMessages.length, 3);
assert.equal(phone.threadMessages.at(-1)?.sender, "contact");
await enqueuePhoneReply(options); assert.equal(calls, 1, "completed reply is idempotent");

phone = fixture();
const removedTask = enqueuePhoneReply(options);
await new Promise(resolve => setImmediate(resolve));
phone = { ...phone, contacts: [] }; release("已删除联系人不能复活"); await removedTask;
assert.equal(phone.threadMessages.length, 1);
assert.match(notices.at(-1)!, /未保存/);

phone = fixture();
await enqueuePhoneReply({ ...options, generate: async () => { throw new Error("请求超时"); } });
assert.match(notices.at(-1)!, /请求超时/);
assert.equal(phone.threadMessages.length, 1);

phone = fixture();
phone.threadMessages.push({ id: "out2", contactId: "friend", sender: "character", content: "第二条", timestamp: 2 });
const contexts: string[][] = [];
const serialOptions = { ...options, generate: async (snapshot: CharacterPhoneRecord) => {
  contexts.push(snapshot.threadMessages.map(message => message.content));
  return contexts.length === 1 ? "第一条回复" : "第二条回复";
} };
await Promise.all([enqueuePhoneReply(serialOptions), enqueuePhoneReply({ ...serialOptions, outgoingMessageId: "out2" })]);
assert.deepEqual(contexts[0], ["你好"], "first request excludes a later queued send");
assert.deepEqual(contexts[1], ["你好", "第二条", "第一条回复"], "second request includes the preceding reply");

const before = fixture();
const current = { ...before, threadMessages: [...before.threadMessages, { id: "reply", contactId: "friend", sender: "contact" as const, content: "保留", timestamp: 3 }] };
const merged = mergePhoneDiscovery(current, before, { ...before, messages: [{ id: "discovery", sender: "主人", body: "发现", timestamp: 4 }] });
assert.equal(merged.threadMessages.length, 2, "delayed discovery cannot overwrite a reply");
assert.equal(merged.messages.length, 1);
assert.equal(isPhoneUserContact({ ...before.contacts[0], kind: "user", source: "user" }), false, "NPC ID overrides stale user flags");

const prompt = buildCharacterPhoneContactReplyPrompt({ phone: before, contact: before.contacts[0],
  character: { id: "host", name: "手机主人" } as Character,
  contactCharacter: { id: "wrong", name: "同名", personality: "错误人物资料" } as Character,
  contactNpc: { id: "npc", ownerIdentityId: "owner", name: "同名", summary: "维修工程师", personality: "爽朗", createdAt: 1, updatedAt: 1 } });
assert.match(prompt.message, /维修工程师/); assert.match(prompt.message, /爽朗/);
assert.doesNotMatch(prompt.message, /错误人物资料/);
assert.match(prompt.systemInstruction, /唯一回复者是联系人/);
console.log("PASS phone reply lifecycle, deduplication, independent identity, failure and concurrent discovery");
