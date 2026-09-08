import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/chat/hooks/useChatStickerState.ts"), "utf8");
const appChat = fs.readFileSync(path.join(root, "src/components/AppChat.tsx"), "utf8");

assert.match(hook, /stickerSemanticAnalysisInFlightRef/);
assert.match(hook, /triggerCreateStickerGroupRef/);
assert.match(hook, /stickerDb\.getGroups\(\)/);
assert.match(hook, /default-sticker-group/);
assert.match(appChat, /useChatStickerState/);
assert.doesNotMatch(appChat, /const \[stickerGroups, setStickerGroups\] = useState/);

console.log("chat sticker state hook contract passed");
