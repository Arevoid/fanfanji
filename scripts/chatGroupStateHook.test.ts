import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useChatGroupState.ts", import.meta.url), "utf8");
const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(hook, /selectedGroupMemberIds/);
assert.match(hook, /pendingGroupWelcomeIdRef/);
assert.match(hook, /Message/);
assert.match(appChat, /useChatGroupState/);
assert.doesNotMatch(appChat, /const \[showCreateGroupModal, setShowCreateGroupModal\] = useState/);
assert.doesNotMatch(appChat, /const pendingGroupWelcomeIdRef = useRef/);

console.log("PASS chat group creation and pending welcome state is isolated behind its hook");
