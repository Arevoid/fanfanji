import assert from "node:assert/strict";
import fs from "node:fs";
import { createManualKnowledgeClaim } from "../src/features/characterKnowledge/services/manualKnowledgeService";
import { createDeterministicArtifactClaim } from "../src/features/characterKnowledge/services/deterministicKnowledgeCapture";

const scope = {
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
};
const manual = createManualKnowledgeClaim({
  id: "manual-claim",
  scope,
  statement: "用户的生日是 3 月 12 日。",
  sourceRecordId: "memory-ui-1",
  recordedAt: 100,
});
assert.ok(manual);
assert.equal(manual?.truthStatus, "confirmed");
assert.equal(manual?.source.kind, "manual");
assert.equal(manual?.userConfirmed, true);

const redPacket = createDeterministicArtifactClaim({
  scope,
  message: {
    id: "red-packet-1",
    characterId: scope.characterId,
    relationId: scope.relationId,
    conversationId: scope.conversationId,
    sender: "user",
    content: "[红包]|8.88|祝福",
    timestamp: 101,
  },
});
assert.equal(redPacket?.truthStatus, "confirmed");
assert.equal(redPacket?.source.kind, "deterministic_action");
assert.match(redPacket?.statement || "", /发送了金额为 8\.88 元的红包/);
assert.equal(createDeterministicArtifactClaim({
  scope: { ...scope, relationId: "relation-b" },
  message: {
    id: "cross-scope",
    characterId: scope.characterId,
    relationId: scope.relationId,
    conversationId: scope.conversationId,
    sender: "user",
    content: "[音乐]|Song|Artist",
    timestamp: 102,
  },
}), undefined, "deterministic capture rejects cross-relation messages");

const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const chatMemoryExtraction = fs.readFileSync(new URL("../src/features/chat/hooks/useChatMemoryExtraction.ts", import.meta.url), "utf8");
const offline = fs.readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const offlineMemorySync = fs.readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryMemorySyncActions.ts", import.meta.url), "utf8");
const memoryUi = fs.readFileSync(new URL("../src/components/AppMemory.tsx", import.meta.url), "utf8");

assert.match(app, /appendKnowledgeClaims\(result\.acceptedClaims\)/, "immediate summary writes Truth before compatibility Memory");
assert.match(chatMemoryExtraction, /appendKnowledgeClaims\(result\.acceptedClaims\)/, "chat extraction writes Truth before compatibility Memory");
assert.match(offlineMemorySync, /appendKnowledgeClaims\(result\.acceptedClaims\)/, "offline extraction writes Truth before compatibility Memory");
assert.match(offlineMemorySync, /const offlineStoryPolicyInput =/, "offline extraction reuses the existing story Fact Policy");
assert.match(memoryUi, /appendKnowledgeClaim\(claim\)/, "manual add writes a confirmed claim");
assert.match(memoryUi, /supersedeKnowledgeClaim/, "manual edit preserves the supersession chain");
assert.match(memoryUi, /retractKnowledgeClaim/, "manual deletion retracts authoritative claims");
assert.match(chat, /behaviorCorrectionRepository\.append/, "OOC writes the dedicated correction model");
assert.doesNotMatch(chat, /createOocCorrectionMemory/, "new OOC writes no longer create MemoryItem records");
assert.match(chat, /createDeterministicArtifactClaim/, "special chat actions use deterministic capture instead of AI extraction");

console.log("PASS Character Truth production write integration and OOC separation coverage");
