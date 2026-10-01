import { strict as assert } from "node:assert";
import { getStickerRecommendations } from "../src/features/chat/services/stickerAssociation";
import type { StickerGroup } from "../src/types";

const groups: StickerGroup[] = [{
  id: "default",
  name: "默认",
  stickers: [
    { id: "good-night", name: "晚安", url: "晚安.png" },
    { id: "good-morning", name: "早安", url: "早安.png" },
    { id: "comfort", name: "安慰", url: "安慰.png", semanticDescription: "抱抱和安慰" },
    { id: "duplicate", name: "晚安备用", url: "晚安-2.png" },
  ],
}];

assert.deepEqual(getStickerRecommendations(groups, "", 5), []);
assert.deepEqual(getStickerRecommendations(groups, "发个晚安表情包", 5).map((sticker) => sticker.id), ["good-night", "duplicate"]);
assert.deepEqual(getStickerRecommendations(groups, "抱抱", 5).map((sticker) => sticker.id), ["comfort"]);
assert.equal(getStickerRecommendations(groups, "安", 1).length, 1);
assert.equal(new Set(getStickerRecommendations(groups, "晚安", 5).map((sticker) => sticker.id)).size, 2);

console.log("Sticker association: 5 acceptance checks passed");
