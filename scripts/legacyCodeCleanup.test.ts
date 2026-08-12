import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const chatSource = readFileSync("src/components/AppChat.tsx", "utf8");
const ttsSource = readFileSync("src/utils/minimaxTts.ts", "utf8");
const parserSource = readFileSync("src/utils/pngParser.ts", "utf8");
const apiSource = readFileSync("src/utils/apiHelper.ts", "utf8");
const storyReplySource = readFileSync("src/features/forumStory/storyReplyRepository.ts", "utf8");

assert.doesNotMatch(chatSource, /const CHARACTER_CSS_EXAMPLE_TEMPLATE\s*=/, "the replaced full character CSS template must not return");
assert.match(chatSource, /COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE/, "the single live character CSS template must remain");
assert.doesNotMatch(ttsSource, /MINIMAX_DEFAULT_VOICES|MiniMaxTtsOptions|initAudioContextPermission/, "unused legacy TTS APIs must stay removed");
assert.doesNotMatch(parserSource, /splitTextToOfflineSegments/, "the replaced offline segment parser must stay removed");
assert.doesNotMatch(apiSource, /estimateTokenCount/, "the unused duplicate token estimator must stay removed");
assert.doesNotMatch(storyReplySource, /StoryReplyRepository|storyForumReplyRepository|type StoryReply\s*=/, "unused story-repository aliases must stay removed");
assert.equal(existsSync("src/features/promptDebug/components/PromptDebugPanel.tsx"), false, "the removed prompt diagnostics UI must not be bundled again");

console.log("PASS dead legacy templates, utilities, aliases, and diagnostics UI remain removed");
