import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatMessageCleanupActions.ts", import.meta.url), "utf8");

assert.match(source, /useChatMessageCleanupActions/);
assert.match(source, /activeDirectScope/);
assert.doesNotMatch(source, /const deleteMessageAndLinkedImage =/);
assert.doesNotMatch(source, /const clearMessagesAndLinkedArtifacts =/);
assert.match(hook, /isMessageInDirectScope\(targetMessage, activeDirectScope\)/);
assert.match(hook, /removeImageGenerationRecordByMessage/);
assert.match(hook, /removePaymentStatusesForMessages/);
assert.match(hook, /onClearMessages\?\.\(characterId, undefined, relationId\)/);
assert.match(hook, /setSelectedMessageIds\(new Set\(\[initialMessageId\]\)\)/);

console.log("chat message cleanup actions hook contract passed");
