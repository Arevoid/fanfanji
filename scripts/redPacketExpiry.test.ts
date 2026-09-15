import assert from "node:assert/strict";
import type { Message, RedPacketPayload } from "../src/types";
import {
  readRedPacketClaims,
  resolveRedPacketExpiry,
  type RedPacketClaimsMap,
} from "../src/features/chat/services/paymentScope";

const packet: RedPacketPayload = { mode: "lucky", totalAmount: 8.88, count: 1, greeting: "开心" };
const message: Pick<Message, "sender" | "timestamp" | "id" | "relationId" | "characterId"> = {
  id: "packet-1",
  relationId: "relation-1",
  characterId: "character-1",
  sender: "user",
  timestamp: 1_000,
};
const after24h = message.timestamp + 24 * 3600 * 1000 + 1;

const fullyClaimed = resolveRedPacketExpiry({
  message,
  packet,
  claims: [{ claimantId: "character-1", amount: 8.88, claimedAt: 2_000 }],
  currentStatus: "unclaimed",
  now: after24h,
});
assert.deepEqual(fullyClaimed, { status: "exhausted", refundAmount: 0, notify: false });

const partiallyClaimed = resolveRedPacketExpiry({
  message,
  packet: { ...packet, count: 2 },
  claims: [{ claimantId: "character-1", amount: 3.00, claimedAt: 2_000 }],
  currentStatus: "claimed",
  now: after24h,
});
assert.deepEqual(partiallyClaimed, { status: "expired", refundAmount: 5.88, notify: true });

const neverClaimed = resolveRedPacketExpiry({
  message,
  packet,
  claims: [],
  currentStatus: "unclaimed",
  now: after24h,
});
assert.deepEqual(neverClaimed, { status: "refunded", refundAmount: 8.88, notify: true });

const beforeExpiry = resolveRedPacketExpiry({
  message,
  packet,
  claims: [],
  currentStatus: "unclaimed",
  now: message.timestamp + 24 * 3600 * 1000,
});
assert.deepEqual(beforeExpiry, { status: "unclaimed", refundAmount: 0, notify: false });

const legacyClaims: RedPacketClaimsMap = { [message.id]: [{ claimantId: "character-1", amount: 8.88, claimedAt: 2_000 }] };
assert.equal(readRedPacketClaims(legacyClaims, message).length, 1, "legacy message-id claim keys remain readable");

const claimedStatusWithoutRows = resolveRedPacketExpiry({
  message,
  packet,
  claims: [],
  currentStatus: "claimed",
  now: after24h,
});
assert.deepEqual(claimedStatusWithoutRows, { status: "claimed", refundAmount: 0, notify: false });

console.log("PASS red-packet expiry preserves claims, refunds only the remainder, and reads legacy keys");
