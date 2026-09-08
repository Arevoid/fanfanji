import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useChatProfileState.ts", import.meta.url), "utf8");
const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(hook, /meActiveSubView/);
assert.match(hook, /topUpAmount/);
assert.match(hook, /editGlobalChatStylePreset/);
assert.match(hook, /isEditingProfile/);
assert.match(appChat, /useChatProfileState/);
assert.doesNotMatch(appChat, /const \[editMyName, setEditMyName\] = useState/);

console.log("PASS chat profile and Me-tab draft state is isolated behind its hook");
