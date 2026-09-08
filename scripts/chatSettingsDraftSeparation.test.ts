import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatSettingsDraft.ts", import.meta.url), "utf8");
assert.match(appChat, /useChatSettingsDraft\(\)/);
assert.match(appChat, /loadCharacterDraft\(activeCharacter, activeRelationship\)/);
assert.doesNotMatch(appChat, /setDraftRemark\(activeCharacter\.isGroupChat/);
assert.match(hook, /character\.customChatCSS \|\| character\.customCss/);
assert.doesNotMatch(hook, /draftAutoArchive|draftEnableAutoArchive|enableAutoArchive/);
assert.match(hook, /sanitizeChatIcons\(character\.customChatIcons\)/);
assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB/);

console.log("Chat settings draft separation: 7 acceptance checks passed");
