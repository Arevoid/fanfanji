import assert from "node:assert/strict";
import { evaluateCharacterActionCapability } from "../src/features/chat/services/characterActionCapabilities";
import { materializeCharacterAction } from "../src/features/chat/services/characterActionRuntime";

const redPacket = {
  type: "send_red_packet",
  actor: "character",
  amount: 8.88,
  greeting: "收下",
} as const;

assert.deepEqual(evaluateCharacterActionCapability(redPacket, "offline_story"), {
  allowed: true,
  reason: "allowed",
  code: "allowed",
});
assert.equal(
  materializeCharacterAction(redPacket, "offline_story").messageMarkup,
  "[红包]|8.88|收下",
);
assert.equal(
  materializeCharacterAction({ ...redPacket, greeting: "收下|别换行\n" }, "offline_story").messageMarkup,
  "[红包]|8.88|收下 别换行",
);

const transfer = materializeCharacterAction({
  type: "send_transfer",
  actor: "character",
  amount: 5.21,
  memo: "晚饭",
  confirmed: true,
}, "offline_story");
assert.equal(transfer.status, "success");
assert.equal(transfer.messageMarkup, "[转账]|5.21|晚饭|true");

const voice = materializeCharacterAction({
  type: "send_voice",
  actor: "character",
  contentHint: "我已经到楼下了",
}, "offline_story");
assert.equal(voice.status, "success");
assert.match(voice.messageMarkup || "", /^\[语音\]\|\d+\|/u);

const unsupported = materializeCharacterAction({
  type: "call",
  actor: "character",
  reason: "想听听你的声音",
}, "offline_story");
assert.deepEqual(unsupported, {
  status: "rejected",
  code: "offline_action_unsupported:call",
});

const onlineStickerByName = evaluateCharacterActionCapability({
  type: "send_sticker",
  actor: "character",
  stickerName: "开心",
}, "online_chat");
assert.equal(onlineStickerByName.allowed, true);

const offlineStickerNeedsCatalogIdentity = evaluateCharacterActionCapability({
  type: "send_sticker",
  actor: "character",
  stickerName: "开心",
}, "offline_story");
assert.equal(offlineStickerNeedsCatalogIdentity.allowed, false);
assert.equal(offlineStickerNeedsCatalogIdentity.code, "sticker_catalog_reference_missing");

const actorMismatch = materializeCharacterAction({
  type: "send_location",
  actor: "user",
  location: "公司",
}, "offline_story");
assert.deepEqual(actorMismatch, {
  status: "rejected",
  code: "character_action_actor_mismatch",
});

console.log("PASS character action runtime");
