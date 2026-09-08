import assert from "node:assert/strict";
import { deriveProactiveOfflineContextEvidence } from "../src/features/chat/services/proactiveOfflineContext";
import type { Message } from "../src/types";

const message = (sender: "user" | "character", content: string): Message => ({
  id: `${sender}-${content}`,
  characterId: "character-a",
  relationId: "relation-a",
  conversationId: "direct:relation-a",
  sender,
  content,
  timestamp: 1,
});

assert.deepEqual(deriveProactiveOfflineContextEvidence({ messages: [message("user", "最近怎么样")], source: "direct_reply" }), {
  hasNaturalLeadIn: false,
  travelFeasibility: "unknown",
});
assert.deepEqual(deriveProactiveOfflineContextEvidence({ messages: [message("user", "周日上午有空，一起吃饭吗")], source: "direct_reply" }), {
  hasNaturalLeadIn: true,
  travelFeasibility: "travel_possible",
});
assert.deepEqual(deriveProactiveOfflineContextEvidence({ messages: [message("user", "我就在你公司楼下")], source: "direct_reply" }), {
  hasNaturalLeadIn: true,
  travelFeasibility: "same_area",
});
assert.equal(deriveProactiveOfflineContextEvidence({ messages: [message("user", "周六不方便，改天吧")], source: "direct_reply" }).userExplicitlyUnavailable, true);
assert.equal(deriveProactiveOfflineContextEvidence({ messages: [], source: "proactive_contact" }).hasNaturalLeadIn, true, "a proactive life-event message may establish its own natural lead-in");
assert.equal(deriveProactiveOfflineContextEvidence({ messages: [message("character", "我在你楼下")], source: "direct_reply" }).travelFeasibility, "unknown", "a character's own unsupported location claim cannot unlock any meeting mode");

console.log("PASS proactive offline context derives conservative invitation and immediate-meeting evidence");
