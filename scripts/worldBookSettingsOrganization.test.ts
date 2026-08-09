import assert from "node:assert/strict";
import { normalizeImportedWorldBookPosition } from "../src/domain/worldbook/worldBookPosition";
import { getSettingsBackTarget, getSettingsHeaderTitle } from "../src/features/settings/settingsNavigation";

assert.equal(normalizeImportedWorldBookPosition(0), "before_char_def");
assert.equal(normalizeImportedWorldBookPosition(2), "after_char_def");
assert.equal(normalizeImportedWorldBookPosition(4), "at_depth");
assert.equal(normalizeImportedWorldBookPosition("author_note"), "after_char_def");
assert.equal(normalizeImportedWorldBookPosition("before_chat_history"), "before_chat_history");
assert.equal(normalizeImportedWorldBookPosition("main", "silly-tavern"), "after_main_prompt");
assert.equal(normalizeImportedWorldBookPosition(2, "silly-tavern"), "before_chat_history");
assert.equal(normalizeImportedWorldBookPosition(4, "silly-tavern"), "at_depth");

assert.equal(getSettingsHeaderTitle(null), "设置");
assert.equal(getSettingsHeaderTitle("prompt_debug"), "提示词检查器");
assert.equal(getSettingsBackTarget("prompt_debug"), "system_config");
assert.equal(getSettingsBackTarget("api"), null);
assert.equal(getSettingsBackTarget(null), "close");

console.log("worldbook/settings organization tests passed");
