import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatMemoryExtraction.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatMemoryExtraction\(\{/);
assert.doesNotMatch(appChat, /const handleExtractMemories = async/);
assert.match(hook, /MemoryService\.extractMemories/);
assert.match(hook, /commitMemoryWriteBundle/);
assert.match(hook, /appendClaims: appendKnowledgeClaims/);
assert.match(hook, /appendSummaries/);
assert.match(hook, /createConversationSummaryRecord/);
assert.match(hook, /kind: "automatic_summary"/);
assert.match(hook, /summaries,/);
assert.match(hook, /Do not move the archive marker past a batch/);
assert.match(hook, /setIsCompressingMemory\(false\)/);

console.log("PASS chat memory extraction is isolated behind a relationship-scoped hook");
