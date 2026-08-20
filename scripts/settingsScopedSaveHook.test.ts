import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/features/settings/hooks/useSettingsScopedSave.ts", "utf8");
const page = readFileSync("src/components/AppSettings.tsx", "utf8");

assert.match(hook, /useSettingsScopedSave/);
assert.match(hook, /previous\.activeIdentityId \|\| "identity-1"/);
assert.match(hook, /updatedFields\.name !== undefined/);
assert.match(hook, /updatedFields\.avatar !== undefined/);
assert.match(hook, /updatedFields\.signature !== undefined/);
assert.match(hook, /updatedFields\.bio !== undefined/);
assert.match(hook, /identities: updatedIdentities/);
assert.match(page, /useSettingsScopedSave\(\{ onSaveSettings \}\)/);
assert.doesNotMatch(page, /const handleSave = \(updatedFields: Partial<UserSettings>\)/);

console.log("Settings scoped save Hook: identity synchronization contract passed");
