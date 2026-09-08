import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/chat/hooks/useChatSettingsPanelState.ts"), "utf8");
const appChat = fs.readFileSync(path.join(root, "src/components/AppChat.tsx"), "utf8");

assert.match(hook, /ChatAdvancedSettingsSection/);
assert.match(hook, /isShowingCardModal/);
assert.match(hook, /advancedSettingsSection/);
assert.match(hook, /advancedSettingsTitle/);
assert.match(appChat, /useChatSettingsPanelState/);
assert.doesNotMatch(appChat, /const \[isShowingCardModal, setIsShowingCardModal\] = useState/);

console.log("chat settings panel state hook contract passed");
