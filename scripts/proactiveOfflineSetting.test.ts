import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createProactiveOfflinePreferencePatch, isProactiveOfflineEnabled } from "../src/domain/schedule/proactiveOfflinePreference";

assert.equal(isProactiveOfflineEnabled(undefined), false, "the feature must remain disabled for legacy relationships");
assert.equal(isProactiveOfflineEnabled({}), false);
assert.equal(isProactiveOfflineEnabled({ enableProactiveOffline: true }), true);
assert.deepEqual(createProactiveOfflinePreferencePatch(false), { enableProactiveOffline: undefined });
assert.deepEqual(createProactiveOfflinePreferencePatch(true), { enableProactiveOffline: true });

const chatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const offlineSettingIndex = chatSource.indexOf("主动发起线下");
const proactiveChatIndex = chatSource.indexOf("主动联络", offlineSettingIndex);
assert.ok(offlineSettingIndex >= 0, "chat settings expose the proactive offline toggle");
assert.ok(proactiveChatIndex > offlineSettingIndex, "the proactive offline toggle is shown above proactive contact");
assert.match(chatSource, /!activeCharacter\.isGroupChat && activeRelationship/);
assert.match(chatSource, /createProactiveOfflinePreferencePatch\(draftEnableProactiveOffline\)/);

const draftSource = readFileSync(new URL("../src/features/chat/hooks/useChatSettingsDraft.ts", import.meta.url), "utf8");
assert.match(draftSource, /loadCharacterDraft = \(character: Character, relationship\?: CharacterRelationship\)/);
assert.match(draftSource, /isProactiveOfflineEnabled\(relationship\)/);

console.log("PASS proactive offline preference is opt-in, relationship-scoped, group-safe, and placed above proactive contact");
