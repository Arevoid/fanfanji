import assert from "node:assert/strict";
import { mergeOnlineMessagesIntoOfflineStory } from "../src/domain/offlineStory/offlineStoryResumePolicy";
import type { Message, OfflineStory } from "../src/types";

const online = (id: string, timestamp: number, content: string, extras: Partial<Message> = {}): Message => ({
  id,
  characterId: "character-a",
  relationId: "relation-a",
  conversationId: "conversation-a",
  sender: "user",
  content,
  timestamp,
  ...extras,
});

const story: OfflineStory = {
  id: "story-resume-merge",
  characterId: "character-a",
  relationId: "relation-a",
  conversationId: "conversation-a",
  title: "旧剧本",
  createdAt: 1,
  updatedAt: 100,
  mode: "continue",
  sourceChatId: "character-a",
  sourceChatMsgCount: 1,
  messages: [{
    id: "offline-scene",
    characterId: "character-a",
    relationId: "relation-a",
    sender: "character",
    content: "线下场景",
    timestamp: 90,
    isOffline: true,
  }],
  importedContext: {
    messages: [{ ...online("online-old", 50, "旧线上内容"), id: "offline-import-old", sourceMessageId: "online-old", isOffline: true, isImportedContext: true }],
    memories: ["旧记忆"],
    worldBook: ["世界书"],
    importedAt: 50,
  },
  onlineHandoff: {
    status: "acknowledged",
    createdAt: 100,
    startedAt: 90,
    endedAt: 100,
    sourceMessageIds: ["offline-scene"],
    deliveredReplyCount: 3,
  },
};

const merged = mergeOnlineMessagesIntoOfflineStory(story, [
  online("online-before", 99, "不应重复导入"),
  online("online-new", 120, "线上新增内容"),
  online("online-new", 120, "线上新增内容"),
  online("online-narration", 121, "旁白", { isNarration: true }),
], 200);

assert.equal(merged.importedContext?.messages.length, 2, "only the post-handoff online message is imported");
assert.equal(merged.importedContext?.messages[1]?.sourceMessageId, "online-new");
assert.equal(merged.importedContext?.messages[1]?.isImportedContext, true);
assert.equal(merged.importedContext?.messages[1]?.isOffline, true);
assert.equal(merged.sourceChatMsgCount, 2);
assert.equal(merged.updatedAt, 200);
assert.equal(mergeOnlineMessagesIntoOfflineStory(merged, [online("online-new", 120, "线上新增内容")], 300), merged, "repeating resume is idempotent");
const noHandoffStory = { ...story, onlineHandoff: undefined };
assert.equal(mergeOnlineMessagesIntoOfflineStory(noHandoffStory, [online("online-new", 120, "线上新增内容")]), noHandoffStory, "stories without a handoff remain unchanged");

console.log("PASS offline resume merges post-handoff online context without duplication or memory leakage");
