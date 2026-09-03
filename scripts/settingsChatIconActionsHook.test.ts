import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/features/settings/hooks/useSettingsChatIconActions.ts", "utf8");
const page = readFileSync("src/components/AppSettings.tsx", "utf8");
assert.match(hook, /value\.trim\(\)/);
assert.match(hook, /else delete next\[key\]/);
assert.match(hook, /handleSave\(\{ chatIcons: next \}\)/);
assert.match(page, /useSettingsChatIconActions\(\{ chatIcons, setChatIcons, handleSave \}\)/);
assert.doesNotMatch(page, /const updateChatIcon = \(key: ChatIconKey/);

console.log("Settings chat icon actions Hook: trim, delete, and persistence contract passed");
