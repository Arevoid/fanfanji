import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useChatCssTemplateCopy.ts", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const draft = readFileSync(new URL("../src/features/chat/hooks/useChatSettingsDraft.ts", import.meta.url), "utf8");
assert.match(hook, /navigator\.clipboard\?\.writeText/);
assert.match(hook, /document\.execCommand\("copy"\)/);
assert.match(hook, /setCssTemplateCopied\(true\)/);
assert.match(chat, /useChatCssTemplateCopy\(\{ showToast \}\)/);
assert.doesNotMatch(chat, /document\.execCommand\("copy"\)/);
assert.doesNotMatch(draft, /cssTemplateCopied/);
console.log("PASS chat CSS template copy is isolated behind a focused hook");
