import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/chat/hooks/useChatNavigationState.ts"), "utf8");
const appChat = fs.readFileSync(path.join(root, "src/components/AppChat.tsx"), "utf8");

assert.match(hook, /ChatTab/);
assert.match(hook, /momentsFilterCharId/);
assert.match(hook, /singleCharacterMomentsId/);
assert.match(hook, /isShowingAddFriendDialog/);
assert.match(appChat, /useChatNavigationState/);
assert.doesNotMatch(appChat, /const \[activeTab, setActiveTab\] = useState/);
assert.doesNotMatch(appChat, /const \[momentsFilterCharId, setMomentsFilterCharId\] = useState/);

console.log("chat navigation state hook contract passed");
