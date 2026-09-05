import assert from "node:assert/strict";
import { resolveChatRoutine, resolveChatTurnSettings } from "../src/features/chat/services/chatTurnSettings";

const character = { enableTimeAwareness: false, disableBracketActions: false };
assert.deepEqual(resolveChatTurnSettings(character), { enableTimeAwareness: false, disableBracketActions: false });
character.enableTimeAwareness = true;
assert.equal(resolveChatTurnSettings(character).enableTimeAwareness, true);
character.disableBracketActions = true;
assert.equal(resolveChatTurnSettings(character).disableBracketActions, true);
character.disableBracketActions = false;
assert.equal(resolveChatTurnSettings(character).disableBracketActions, false);

const routine = { timezone: "Asia/Shanghai", sleepStart: "22:00", sleepEnd: "07:00" } as any;
assert.equal(resolveChatRoutine(routine, true), routine);
assert.equal(resolveChatRoutine(routine, false), undefined, "disabled time awareness must not leak routine state");
console.log("chatTurnSettings.test.ts passed");
