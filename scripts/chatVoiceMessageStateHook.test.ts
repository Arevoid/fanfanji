import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/chat/hooks/useChatVoiceMessageState.ts"), "utf8");
const appChat = fs.readFileSync(path.join(root, "src/components/AppChat.tsx"), "utf8");

assert.match(hook, /voicePlayed/);
assert.match(hook, /voiceTranscribed/);
assert.match(appChat, /useChatVoiceMessageState/);
assert.doesNotMatch(appChat, /const \[voicePlayed, setVoicePlayed\] = useState/);
assert.doesNotMatch(appChat, /const \[voiceTranscribed, setVoiceTranscribed\] = useState/);

console.log("chat voice message state hook contract passed");
