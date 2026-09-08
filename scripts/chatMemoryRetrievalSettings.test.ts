import assert from "node:assert/strict";
import {
  DEFAULT_CHAT_CONTEXT_MEMORY_LIMIT,
  DEFAULT_CHAT_LONG_TERM_MEMORY_LIMIT,
  MAX_CHAT_CONTEXT_MEMORY_LIMIT,
  MAX_CHAT_LONG_TERM_MEMORY_LIMIT,
  MIN_CHAT_CONTEXT_MEMORY_LIMIT,
  resolveChatLongTermMemoryLimit,
  resolveChatContextMemoryLimit,
} from "../src/features/chat/services/chatMemoryRetrievalSettings";

assert.equal(DEFAULT_CHAT_CONTEXT_MEMORY_LIMIT, 150);
assert.equal(resolveChatContextMemoryLimit(undefined), 150);
assert.equal(resolveChatContextMemoryLimit(150), 150);
assert.equal(resolveChatContextMemoryLimit(1), MIN_CHAT_CONTEXT_MEMORY_LIMIT);
assert.equal(resolveChatContextMemoryLimit(999), MAX_CHAT_CONTEXT_MEMORY_LIMIT);
assert.equal(DEFAULT_CHAT_LONG_TERM_MEMORY_LIMIT, 50);
assert.equal(resolveChatLongTermMemoryLimit(undefined), 50);
assert.equal(resolveChatLongTermMemoryLimit(50), 50);
assert.equal(resolveChatLongTermMemoryLimit(1), 10);
assert.equal(resolveChatLongTermMemoryLimit(999), MAX_CHAT_LONG_TERM_MEMORY_LIMIT);
assert.equal(resolveChatLongTermMemoryLimit(50.6), 51);
console.log("PASS chat long-term memory retrieval settings use a bounded per-turn default of 50 items");
