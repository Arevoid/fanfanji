import { strict as assert } from "node:assert";
import { recoverPendingOfflineHandoff } from "../src/features/chat/services/offlineHandoffRecoveryService";
import type { Message, OfflineStory } from "../src/types";

const now = 1_700_000_000_000;
const story = {
  id: "story-1", title: "回到家", mode: "continue", characterId: "char-1", relationId: "rel-1",
  conversationId: "conv-1", archivedAt: now - 60_000, createdAt: now - 120_000,
  messages: [{ id: "offline-msg", sender: "user", content: "到家了", timestamp: now - 120_000 }],
} as unknown as OfflineStory;
const currentMessages = [] as Message[];
let saved: OfflineStory | undefined;
const recovered = recoverPendingOfflineHandoff({
  stories: [story], currentChatMessages: currentMessages, now,
  scope: { isGroup: false, relationId: "rel-1", relationCharacterId: "char-1", conversationId: "conv-1" },
  onSaveOfflineStory: (next) => { saved = next; return true; },
});
assert.equal(recovered?.onlineHandoff?.status, "pending");
assert.equal(saved?.id, "story-1");

console.log("PASS missed offline handoff recovery remains scoped, recent, and persisted");
