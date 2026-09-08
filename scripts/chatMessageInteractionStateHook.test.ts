import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/chat/hooks/useChatMessageInteractionState.ts"), "utf8");
const appChat = fs.readFileSync(path.join(root, "src/components/AppChat.tsx"), "utf8");

assert.match(hook, /activeMenuMsg/);
assert.match(hook, /selectedMessageIds/);
assert.match(hook, /selectedFileNote/);
assert.match(hook, /showOocCommentModal/);
assert.match(appChat, /useChatMessageInteractionState/);
assert.doesNotMatch(appChat, /const \[activeMenuMsg, setActiveMenuMsg\] = useState/);
assert.doesNotMatch(appChat, /const \[selectedMessageIds, setSelectedMessageIds\] = useState/);

console.log("chat message interaction state hook contract passed");
