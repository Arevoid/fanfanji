import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const cleanupActions = readFileSync(new URL("../src/features/chat/hooks/useChatMessageCleanupActions.ts", import.meta.url), "utf8");
assert.match(app, /removeImageGenerationRecordsByCharacter/);
assert.match(app, /imageAssetDb\.deleteImage/);
assert.match(chat, /removeImageGenerationRecordsByRelation/);
assert.match(cleanupActions, /removeImageGenerationRecordByMessage/);
assert.match(cleanupActions, /imageAssetDb\.deleteImage/);
console.log("imageGenerationCleanup.test passed");
