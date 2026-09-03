import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatTtsPlaybackState.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatTtsPlaybackState\(\)/);
assert.doesNotMatch(appChat, /const \[playingMessageId, setPlayingMessageId\]/);
assert.doesNotMatch(appChat, /const \[audioLoadingMessageId, setAudioLoadingMessageId\]/);
assert.doesNotMatch(appChat, /const \[activeTtsAudio, setActiveTtsAudio\]/);
assert.match(hook, /playingMessageId/);
assert.match(hook, /audioLoadingMessageId/);
assert.match(hook, /activeTtsAudio/);
assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB|Audio\(/);

console.log("PASS AppChat TTS playback indicators are isolated without moving audio behavior");
