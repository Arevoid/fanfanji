import assert from "node:assert/strict";
import type { UserSettings } from "../src/types";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });

const { getOrCreateInnerVoice, parseInnerVoicePayload, resetInnerVoiceRuntimeForTests } = await import("../src/features/chat/services/innerVoiceService");
const { deleteInnerVoicesByCharacter, findInnerVoiceByRelationAndMessage, listInnerVoicesByCharacter, listInnerVoicesByRelation, saveInnerVoiceRecords } = await import("../src/core/storage/repositories/innerVoiceRepository");
const { createStableRelationId } = await import("../src/domain/relationship/relationshipService");

const relationA = createStableRelationId("character-canonical", "identity-lily");
const relationB = createStableRelationId("character-canonical", "identity-fanfan");
const defaultRelation = createStableRelationId("character-canonical", "identity-1");

const character = {
  id: "contact-copy",
  profileSourceId: "character-canonical",
  name: "杨丞",
  avatar: "avatar.png",
  personality: "克制、可靠",
  backstory: "邻居",
};
const message = {
  id: "message-1",
  characterId: "chat-1",
  sender: "character" as const,
  content: "还好，你不用担心。",
  timestamp: 1,
};
let requests = 0;
const params = {
  character,
  triggerMessage: message,
  recentMessages: [{ ...message, sender: "user" as const, id: "user-1", content: "今天是不是很累？" }, message],
  conversationId: "chat-1",
  relationId: relationA,
  settings: { apiKey: "", selectedModel: "test" } as UserSettings,
  requestAi: async () => {
    requests += 1;
    return { text: '{"state":"在喝水，刚结束工作","content":"其实今天有一点累，但看到她关心我就轻松了很多。"}' };
  },
};

const [first, concurrent] = await Promise.all([getOrCreateInnerVoice(params), getOrCreateInnerVoice(params)]);
assert.ok(first);
assert.equal(first?.id, concurrent?.id, "同一条消息必须复用同一条心声记录");
assert.equal(requests, 1, "并发点击同一头像只能调用一次 AI");
assert.equal(first?.characterId, "character-canonical", "必须保存 canonical characterId");
assert.equal(first?.state, "在喝水，刚结束工作", "状态应保留上下文动作描述，而不局限于单个情绪词");
assert.equal(first?.relationId, relationA);
assert.equal(findInnerVoiceByRelationAndMessage(relationA, message.id)?.id, first?.id);

const reused = await getOrCreateInnerVoice(params);
assert.equal(reused?.id, first?.id, "再次点击必须读取已保存记录");
assert.equal(requests, 1);
assert.equal(listInnerVoicesByRelation(relationA, 20).length, 1);
const otherIdentity = await getOrCreateInnerVoice({ ...params, relationId: relationB, conversationId: "chat-2" });
assert.ok(otherIdentity);
assert.notEqual(otherIdentity?.id, first?.id);
assert.equal(requests, 2);
assert.equal(listInnerVoicesByRelation(relationB, 20).length, 1);
saveInnerVoiceRecords([{ ...first!, id: "legacy-inner-voice", relationId: undefined }]);
assert.equal(findInnerVoiceByRelationAndMessage(defaultRelation, message.id)?.id, "legacy-inner-voice");
assert.equal(findInnerVoiceByRelationAndMessage(relationA, message.id), undefined);
assert.equal(parseInnerVoicePayload("not json"), null, "解析失败不得产生可保存记录");
assert.equal(deleteInnerVoicesByCharacter("character-canonical").success, true);
assert.equal(listInnerVoicesByCharacter("character-canonical", 20).length, 0, "删除角色时应清除其心声记录");

resetInnerVoiceRuntimeForTests();
console.log("PASS inner voice caches by canonical characterId + messageId and persists a single record");
