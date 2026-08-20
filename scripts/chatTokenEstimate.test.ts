import assert from "node:assert/strict";
import { estimateChatTokens } from "../src/features/chat/services/chatTokenEstimate";

const character = { id: "c1", name: "范千", backstory: "背景", personality: "温柔" } as any;
const messages = [{ id: "m1", content: "你好" }, { id: "m2", content: "很长的消息" }] as any;
const memories = [{ id: "memory-a", relationId: "r1", content: "关系记忆" }, { id: "memory-b", characterId: "c1", content: "群聊记忆" }] as any;
assert.deepEqual(estimateChatTokens({ character: undefined, messages, contextLimit: 10, memories }), { total: 0, context: 0, retrieval: 0, persona: 0 });
const estimate = estimateChatTokens({ character, relationshipCompressedMemory: "压缩", messages, contextLimit: 1, memories, relationId: "r1", recallCount: 1 });
assert.equal(estimate.context, Math.round("很长的消息".length * 1.6));
assert.equal(estimate.retrieval, Math.round("关系记忆".length * 1.6));
assert.ok(estimate.total >= 250);
console.log("PASS chat token estimation is pure, bounded by the active history window, and relation-aware");
