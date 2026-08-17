import assert from "node:assert/strict";
import { deriveProactiveOfflinePresenceEvidence } from "../src/features/chat/services/proactiveOfflineContext";
import type { Message } from "../src/types";

const message = (id: string, sender: Message["sender"], content: string, timestamp: number, isOffline = false): Message => ({
  id,
  sender,
  content,
  timestamp,
  characterId: "char-1",
  relationId: "relation-1",
  isOffline,
});

const confirmed = deriveProactiveOfflinePresenceEvidence({
  messages: [
    message("u-1", "user", "我开门了，你到了吗？", 1),
    message("c-1", "character", "我就在门口，进来吧。", 2),
  ],
});
assert.equal(confirmed.state, "co_location_confirmed");
assert.equal(confirmed.userConfirmedArrival, true);
assert.equal(confirmed.characterClaimedArrival, true);

const characterOnly = deriveProactiveOfflinePresenceEvidence({
  messages: [message("c-2", "character", "我已经到你家门口了。", 3)],
});
assert.equal(characterOnly.state, "arrival_claimed");
assert.equal(characterOnly.userConfirmedArrival, false);

const futurePlan = deriveProactiveOfflinePresenceEvidence({
  messages: [
    message("u-2", "user", "下次你来我家吧。", 4),
    message("c-3", "character", "我会来找你的。", 5),
  ],
});
assert.equal(futurePlan.state, "remote");

const offlineDoesNotTrigger = deriveProactiveOfflinePresenceEvidence({
  messages: [
    message("offline-u", "user", "我在门口，开门了。", 6, true),
    message("offline-c", "character", "我已经到了。", 7, true),
  ],
});
assert.equal(offlineDoesNotTrigger.state, "remote");

console.log("PASS proactive offline presence requires concrete present-tense evidence from both speakers");
