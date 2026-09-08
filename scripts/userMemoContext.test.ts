import assert from "node:assert/strict";
import { buildUserMemoPromptContext } from "../src/features/chat/prompts/userMemoContext";

const notes = [
  { id: "note-1", title: "今天的计划", content: "下班后买菜，晚上做饭", timestamp: 1 },
  { id: "note-2", title: "情绪", content: "今天真的很生气，感觉快要崩溃了", timestamp: 2 },
];
const todos = [
  { id: "todo-1", text: "背单词", checked: false },
  { id: "todo-done", text: "已完成事项", checked: true },
];
const diaries = [{
  id: "diary-1",
  ownerIdentityId: "user-1",
  authorType: "user" as const,
  authorNameSnapshot: "我",
  title: "今天的心事",
  body: "今天终于把一直拖着的事情处理完了，心里轻松了很多。",
  emotionalState: "轻松",
  tags: [],
  occurredAt: 3,
  createdAt: 3,
  updatedAt: 3,
  source: "manual" as const,
  isFavorite: false,
}];

const relevant = buildUserMemoPromptContext({
  scopeKey: "relation-a",
  queryText: "今天买菜了吗？",
  hasUserMessage: true,
  nowMs: 10_000,
  notes,
  todos,
  diaryEntries: diaries,
  ownerIdentityId: "user-1",
});
assert.match(relevant.text, /买菜/);
assert.match(relevant.text, /高情绪/);
assert.doesNotMatch(relevant.text, /已完成事项/);
assert.ok(relevant.normalItemIds.includes("note-1"));
assert.ok(relevant.urgentItemIds.includes("note-2"));

const diaryRelevant = buildUserMemoPromptContext({
  scopeKey: "relation-diary",
  ownerIdentityId: "user-1",
  queryText: "你今天处理完那件拖着的事情了吗？",
  hasUserMessage: true,
  nowMs: 10_000,
  notes: [],
  todos: [],
  diaryEntries: diaries,
});
assert.match(diaryRelevant.text, /今天的心事|处理完/u, "relevant user diary content is available to the character");

const throttled = buildUserMemoPromptContext({
  scopeKey: "relation-a",
  queryText: "天气不错。",
  hasUserMessage: true,
  nowMs: 11_000,
  notes,
  todos,
  ledger: relevant.ledger,
  diaryEntries: diaries,
});
assert.doesNotMatch(throttled.text, /【本轮可自然参考的普通事项】/);
assert.doesNotMatch(throttled.text, /【本轮需要优先关心的高情绪内容】/);

console.log("user memo and todo prompt context tests passed");
