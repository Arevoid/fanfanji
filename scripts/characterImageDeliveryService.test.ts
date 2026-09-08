import assert from "node:assert/strict";
import { generateCharacterImageForDelivery } from "../src/features/chat/services/characterImageDeliveryService";

const character: any = { id: "group-1", name: "群聊", isGroupChat: true, memberIds: ["member-1"] };
const result = await generateCharacterImageForDelivery({
  activeCharacter: character,
  currentMessages: [],
  characters: [character],
  settings: {} as any,
  trigger: "manual",
  userText: "请生成图片",
  createId: () => "image-1",
  isRuntimeCurrent: () => true,
});
assert.deepEqual(result, { status: "missing-context" });
const directResult = await generateCharacterImageForDelivery({
  activeCharacter: { id: "character-1", name: "角色" } as any,
  currentMessages: [],
  characters: [{ id: "character-1", name: "角色" } as any],
  settings: {} as any,
  trigger: "manual",
  userText: "请生成图片",
  createId: () => "image-2",
  isRuntimeCurrent: () => true,
});
assert.deepEqual(directResult, { status: "missing-context" });
console.log("PASS character image delivery keeps group speaker and direct relation context guards");
