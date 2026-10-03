import assert from "node:assert/strict";
import {
  PROACTIVE_IMAGE_COOLDOWN_MS,
  checkProactiveImageGenerationPolicy,
  isProactiveImageGenerationEnabled,
} from "../src/features/chat/services/proactiveImageGenerationPolicy";
import type { Character, ImageGenerationRecord, UserSettings } from "../src/types";

const settings = {
  enableImageGeneration: true,
  enableProactiveImageGeneration: true,
} as Pick<UserSettings, "enableImageGeneration" | "enableProactiveImageGeneration">;
const character = {
  enableImageGeneration: true,
  enableProactiveImageGeneration: true,
} as Pick<Character, "enableImageGeneration" | "enableProactiveImageGeneration">;
const now = new Date(2026, 9, 3, 12, 0, 0).getTime();
const baseInput = { settings, character, records: [] as ImageGenerationRecord[], relationId: "relation-1", now };

assert.equal(isProactiveImageGenerationEnabled(settings, character), true);
assert.deepEqual(checkProactiveImageGenerationPolicy(baseInput), { allowed: true });
assert.deepEqual(checkProactiveImageGenerationPolicy({ ...baseInput, relationId: undefined }), { allowed: false, reason: "missing-relation" });
assert.deepEqual(checkProactiveImageGenerationPolicy({ ...baseInput, settings: { ...settings, enableProactiveImageGeneration: false } }), { allowed: false, reason: "global-disabled" });
assert.deepEqual(checkProactiveImageGenerationPolicy({ ...baseInput, character: { ...character, enableProactiveImageGeneration: false } }), { allowed: false, reason: "character-disabled" });

const recentRecord: ImageGenerationRecord = {
  id: "record-recent",
  messageId: "message-recent",
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "direct:relation-1",
  imageAssetId: "asset-recent",
  trigger: "character-action",
  createdAt: now - 1_000,
};
assert.deepEqual(checkProactiveImageGenerationPolicy({ ...baseInput, records: [recentRecord] }), { allowed: false, reason: "cooldown" });
assert.deepEqual(checkProactiveImageGenerationPolicy({ ...baseInput, records: [recentRecord], now: now + PROACTIVE_IMAGE_COOLDOWN_MS }), { allowed: true });

const dailyRecords = [0, 1, 2].map((index): ImageGenerationRecord => ({
  id: `record-${index}`,
  messageId: `message-${index}`,
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "direct:relation-1",
  imageAssetId: `asset-${index}`,
  trigger: "character-action",
  createdAt: now - (index + 1) * PROACTIVE_IMAGE_COOLDOWN_MS,
}));
assert.deepEqual(checkProactiveImageGenerationPolicy({ ...baseInput, records: dailyRecords }), { allowed: false, reason: "daily-limit" });

console.log("PASS proactive image generation policy");
