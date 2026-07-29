import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(source, /theme-add-contact-dialog bg-\[var\(--surface\)\] text-\[var\(--text-primary\)\]/);
assert.match(source, /正在以「\{settings\.name\}」的身份添加好友/);
assert.match(source, /bg-\[var\(--surface-raised\)\] border border-\[var\(--border\)\] px-3 py-2 text-\[10px\] text-\[var\(--text-secondary\)\]/);
assert.match(source, /button-primary-bg/);
assert.match(source, /button-secondary-bg/);
console.log("PASS add-contact dialog semantic surfaces preserve the existing identity-aware contact flow");
