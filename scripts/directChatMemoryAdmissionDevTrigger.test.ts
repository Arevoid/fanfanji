import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DIRECT_CHAT_MEMORY_ADMISSION_SYNTHETIC_WRITE_TOKEN,
  DIRECT_CHAT_MEMORY_ADMISSION_TEST_GLOBAL,
  isDirectChatMemoryAdmissionDevRuntime,
} from "../src/features/chat/services/directChatMemoryAdmissionDevTrigger";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatMemoryExtraction.ts", import.meta.url), "utf8");
const trigger = readFileSync(new URL("../src/features/chat/services/directChatMemoryAdmissionDevTrigger.ts", import.meta.url), "utf8");

assert.equal(DIRECT_CHAT_MEMORY_ADMISSION_TEST_GLOBAL, "__fanfanjiMemoryAdmissionTest");
assert.equal(isDirectChatMemoryAdmissionDevRuntime(), false, "test/production module evaluation must not expose the dev runtime");
assert.match(trigger, /import\.meta/);
assert.match(trigger, /env\?\.DEV/);
assert.equal(DIRECT_CHAT_MEMORY_ADMISSION_SYNTHETIC_WRITE_TOKEN, "stage4d11h-synthetic-write");
assert.match(appChat, /DIRECT_CHAT_MEMORY_ADMISSION_TEST_GLOBAL/);
assert.match(appChat, /activeDirectScope/);
assert.match(appChat, /extractNow: \(options = \{\}\) => runAdmissionExtraction\(options\.persistenceMode \|\| "production_equivalent_write"\)/);
assert.match(appChat, /extractSyntheticCanaryWrite: \(token: string\)/);
assert.match(appChat, /DIRECT_CHAT_MEMORY_ADMISSION_SYNTHETIC_WRITE_TOKEN/);
assert.match(appChat, /activeCharacter\?\.name\?\.startsWith\("Stage4D3"\)/);
assert.match(appChat, /isDirectChatMemorySafetyVetoCanaryEnabled\(\)/);
assert.match(appChat, /options\.persistenceMode \|\| "production_equivalent_write"/);
assert.match(appChat, /handleExtractMemories\(undefined, \{ persistenceMode \}\)/);
assert.doesNotMatch(appChat.slice(appChat.indexOf("const runAdmissionExtraction"), appChat.indexOf("const api:")), /enableV2Metadata/);
assert.match(appChat, /ACTIVE_DIRECT_SCOPE_UNAVAILABLE/);
assert.match(appChat, /delete runtime\[DIRECT_CHAT_MEMORY_ADMISSION_TEST_GLOBAL\]/);

const observationOnlyIndex = hook.indexOf('if (persistenceMode === "observation_only")');
const canonicalWriteIndex = hook.indexOf("const write = await commitMemoryWriteBundle({", observationOnlyIndex);
assert.ok(observationOnlyIndex > 0 && canonicalWriteIndex > observationOnlyIndex, "observation-only exits before canonical persistence");
const observationOnlyBlock = hook.slice(observationOnlyIndex, canonicalWriteIndex);
assert.match(observationOnlyBlock, /continue;/);
assert.doesNotMatch(observationOnlyBlock, /commitMemoryWriteBundle|enqueueConversationSummaryProjection|markArchiveProgress/);
assert.match(hook, /MemoryService\.extractMemories/);
assert.match(hook, /apiExtractMemoriesWithModelFallback/);
assert.match(hook, /recordDirectChatMemoryAdmissionShadowEvidence/);
assert.match(hook, /getLastMemoryExtractionRunDiagnostics/);
assert.doesNotMatch(trigger, /content|prompt|response|sourceMessageIds|apiKey|Authorization/iu);

console.log("PASS dev-only real Direct Chat memory extraction trigger is guarded, scoped and reuses production-equivalent writer path");
