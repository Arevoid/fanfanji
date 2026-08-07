import assert from "node:assert/strict";
import { resolveChatTurnSettings } from "../src/features/chat/services/chatTurnSettings";

const character = { enableTimeAwareness: false, disableBracketActions: false };
assert.deepEqual(resolveChatTurnSettings(character), { enableTimeAwareness: false, disableBracketActions: false });
character.enableTimeAwareness = true;
assert.equal(resolveChatTurnSettings(character).enableTimeAwareness, true);
character.disableBracketActions = true;
assert.equal(resolveChatTurnSettings(character).disableBracketActions, true);
character.disableBracketActions = false;
assert.equal(resolveChatTurnSettings(character).disableBracketActions, false);
console.log("chatTurnSettings.test.ts passed");
