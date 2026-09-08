import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/features/settings/hooks/useSettingsCssTemplateCopy.ts", "utf8");
const page = readFileSync("src/components/AppSettings.tsx", "utf8");
assert.match(hook, /navigator\.clipboard\?\.writeText/);
assert.match(hook, /document\.execCommand\("copy"\)/);
assert.match(hook, /setCopied\(true\)/);
assert.match(hook, /setTimeout\(\(\) => setCopied\(false\), 1500\)/);
assert.match(page, /useSettingsCssTemplateCopy\(\{/);
assert.doesNotMatch(page, /const copyGlobalChatCssTemplate = async/);

console.log("Settings CSS template copy Hook: clipboard fallback and feedback contract passed");
