import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useChatPaymentState.ts", import.meta.url), "utf8");
const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(hook, /loadIdentityWalletBalances/);
assert.match(hook, /IDENTITY_WALLET_BALANCES_KEY/);
assert.match(hook, /RED_PACKET_STATUSES_KEY/);
assert.match(hook, /24 \* 3600 \* 1000/);
assert.match(hook, /refundAmountTotal/);
assert.match(appChat, /useChatPaymentState/);
assert.match(appChat, /removePaymentStatusesByRelation/);
assert.doesNotMatch(appChat, /const \[walletBalances, setWalletBalances\]/);
assert.doesNotMatch(appChat, /const \[redPacketStatuses, setRedPacketStatuses\] = useState/);

console.log("PASS chat payment state is isolated behind its hook with expiry/refund coverage");
