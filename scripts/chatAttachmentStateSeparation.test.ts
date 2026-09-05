import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatAttachmentState.ts", import.meta.url), "utf8");
assert.match(appChat, /useChatAttachmentState\(\)/);
assert.doesNotMatch(appChat, /const \[showAttachPanel, setShowAttachPanel\]/);
assert.match(hook, /const \[callTranscript, setCallTranscript\]/);
assert.match(hook, /const \[openRedPacketDetail, setOpenRedPacketDetail\]/);
assert.match(hook, /const \[voiceTimer, setVoiceTimer\]/);
assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB/);
assert.doesNotMatch(hook, /wallet|RED_PACKET_STATUSES_KEY|writeRedPacketStatus/);

console.log("Chat attachment state separation: 7 acceptance checks passed");
