import assert from "node:assert/strict";
import type { Message } from "../src/types";
import { getPaymentStatusKey, loadIdentityWalletBalances, readRedPacketStatus, removePaymentStatusesByRelation, removePaymentStatusesForMessages, writeRedPacketStatus } from "../src/features/chat/services/paymentScope";

const packet = (relationId: string): Message => ({
  id: "same-payment-id",
  characterId: "char",
  relationId,
  conversationId: `direct:${relationId}`,
  sender: "character",
  content: "[红包]|8.88|开心",
  timestamp: 1,
});
const packetA = packet("rel-a");
const packetB = packet("rel-b");
assert.notEqual(getPaymentStatusKey(packetA), getPaymentStatusKey(packetB));

const statuses = writeRedPacketStatus({}, packetA, "claimed");
assert.equal(readRedPacketStatus(statuses, packetA), "claimed");
assert.equal(readRedPacketStatus(statuses, packetB), undefined, "same payment messageId cannot cross relationships");
assert.deepEqual(removePaymentStatusesByRelation(statuses, "rel-a"), {});
assert.deepEqual(removePaymentStatusesForMessages({ [packetA.id]: "claimed", [getPaymentStatusKey(packetA)]: "claimed" }, [packetA]), {}, "cleanup removes scoped and legacy status keys");

assert.deepEqual(loadIdentityWalletBalances(null, "12.50"), { "identity-1": 12.5 }, "legacy wallet maps only to the primary identity");
assert.deepEqual(loadIdentityWalletBalances(JSON.stringify({ "identity-a": 5, "identity-b": 9 }), "99"), { "identity-a": 5, "identity-b": 9 });

console.log("special message relation isolation tests passed");
