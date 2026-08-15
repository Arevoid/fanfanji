import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const stickers = readFileSync(new URL("../src/components/StickerSettings.tsx", import.meta.url), "utf8");

const selectorStart = chat.indexOf("{/* Sticker Selector Panel */}");
const selectorEnd = chat.indexOf("</ChatComposer>", selectorStart);
const selector = chat.slice(selectorStart, selectorEnd);
assert.ok(selectorStart >= 0 && selectorEnd > selectorStart);
assert.doesNotMatch(selector, /onTouchStart=/, "chat sticker picker must not delete on long press");
assert.doesNotMatch(selector, /确认要在分组中删除表情/, "chat sticker picker must not expose deletion");
assert.match(selector, /sendStickerMessage\(sticker\)/, "sending a sticker must enter the semantic/reply pipeline");
assert.doesNotMatch(selector, /triggerReply:\s*false/, "sticker sends must no longer suppress the character reply");
assert.match(chat, /semanticDescription/, "chat must cache and pass multimodal sticker meaning instead of a blob URL");
assert.match(chat, /const sendStickerMessage = \(sticker: Sticker\) =>/, "sticker delivery must not wait for visual analysis");
assert.match(chat, /sendCustomMessage\(\s*`\[表情\]\|\$\{sticker\.name\}/, "sticker markup must be sent immediately");
assert.match(chat, /void enrichStickerSemanticDescription\(sticker\)/, "sticker semantic analysis must run in the background");
assert.match(chat, /stickerSemanticAnalysisInFlightRef/, "duplicate sticker analysis requests must be coalesced");

const textImageModalStart = chat.indexOf("{showImageGenerator && (");
const textImageModalEnd = chat.indexOf("{/* Active Chat Footer Input form */}", textImageModalStart);
const textImageModal = chat.slice(textImageModalStart, textImageModalEnd);
assert.match(textImageModal, /发送文字图/);
assert.match(textImageModal, /sendTextImage/);
assert.doesNotMatch(textImageModal, /generateAndSendCharacterImage/, "text-image UI must not call the image API path");

assert.match(chat, /mainTabsViewportRef\.current\?\.scrollTo\(\{ top: 0 \}\)/);
assert.match(stickers, /absolute top-1 right-1/);

console.log("PASS sticker management layout, picker safety, and local text-image sending");
