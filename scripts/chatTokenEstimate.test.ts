import assert from "node:assert/strict";
import { estimateChatRequestTokens, estimateChatTokens, estimatePromptTextTokens } from "../src/features/chat/services/chatTokenEstimate";

const character = { id: "c1", name: "范千", backstory: "背景", personality: "温柔" } as any;
const messages = [{ id: "m1", content: "你好" }, { id: "m2", content: "很长的消息" }] as any;
const memories = [{ id: "memory-a", characterId: "c1", relationId: "r1", content: "关系记忆" }, { id: "memory-b", characterId: "c1", content: "群聊记忆" }] as any;
assert.deepEqual(estimateChatTokens({ character: undefined, messages, contextLimit: 10, memories }), { total: 0, context: 0, retrieval: 0, persona: 0 });
const estimate = estimateChatTokens({ character, relationshipCompressedMemory: "压缩", messages, contextLimit: 1, memories, relationId: "r1", recallCount: 1 });
assert.equal(estimate.context, Math.round("很长的消息".length * 1.6));
assert.equal(estimate.retrieval, Math.round("关系记忆".length * 1.6));
assert.ok(estimate.total >= 250);
const canonicalPreviewText = "[已确认事实]\n用户确认喜欢电影\n[行为修正]\n保持克制";
const canonicalPreview = estimateChatTokens({
  character,
  messages,
  contextLimit: 1,
  memories,
  relationId: "r1",
  recallCount: 1,
  retrievalText: canonicalPreviewText,
});
assert.equal(canonicalPreview.retrieval, estimatePromptTextTokens(canonicalPreviewText), "preview includes canonical Truth-side prompt records");
const fullRequest = estimateChatRequestTokens({
  systemInstruction: "角色人设\n长期记忆\n世界书动态区块".repeat(80),
  history: [{ role: "user", text: "之前的消息" }],
  message: "当前消息",
  historyInjections: [{ content: "深度世界书注入" }],
  retrievalText: "长期记忆".repeat(200),
});
assert.ok(fullRequest.total > 250);
assert.ok(fullRequest.context > 0 && fullRequest.retrieval > 0 && fullRequest.persona > 0);
const withoutSeparateRetrieval = estimateChatRequestTokens({
  systemInstruction: "角色人设",
  history: [],
  message: "当前消息",
});
const withSeparateRetrieval = estimateChatRequestTokens({
  systemInstruction: "角色人设",
  history: [],
  message: "当前消息",
  retrievalText: "长期记忆".repeat(200),
});
assert.ok(withSeparateRetrieval.total > withoutSeparateRetrieval.total, "未嵌入 system 的长期记忆必须计入总消耗");
const withEmbeddedRetrieval = estimateChatRequestTokens({
  systemInstruction: `角色人设\n${"长期记忆".repeat(200)}`,
  history: [],
  message: "当前消息",
  retrievalText: "长期记忆".repeat(200),
});
assert.equal(withEmbeddedRetrieval.total, estimateChatRequestTokens({
  systemInstruction: `角色人设\n${"长期记忆".repeat(200)}`,
  history: [],
  message: "当前消息",
}).total, "已经属于 system 的检索块不得重复计数");
const withExplicitlyEmbeddedRetrieval = estimateChatRequestTokens({
  systemInstruction: "角色人设\n格式化后的 Truth 检索块",
  history: [],
  message: "当前消息",
  retrievalText: "Truth 检索块",
  retrievalIncludedInSystem: true,
});
assert.equal(withExplicitlyEmbeddedRetrieval.total, estimateChatRequestTokens({
  systemInstruction: "角色人设\n格式化后的 Truth 检索块",
  history: [],
  message: "当前消息",
}).total, "explicit embedding metadata prevents retrieval double counting even when formatting differs");
console.log("PASS chat token estimation is pure, bounded by the active history window, and relation-aware");
