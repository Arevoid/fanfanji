import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "src/components/AppSettings.tsx"), "utf8");
const beautySection = source.slice(source.indexOf("{/* BEAUTY SETTINGS TAB */}"), source.indexOf("{/* 1. 桌面模块 */}"));

assert.match(beautySection, /bg-\[var\(--surface-muted\)\] border border-\[var\(--segmented-border\)\]/);
assert.equal((beautySection.match(/bg-\[var\(--segmented-active-bg\)\] text-\[var\(--segmented-active-text\)\]/g) || []).length, 3);
assert.equal((beautySection.match(/bg-\[var\(--segmented-inactive-bg\)\] text-\[var\(--segmented-inactive-text\)\]/g) || []).length, 3);
assert.match(beautySection, /setBeautySubTab\("desktop"\)/);
assert.match(beautySection, /setBeautySubTab\("chat"\)/);
assert.match(beautySection, /setBeautySubTab\("preset"\)/);
assert.equal((beautySection.match(/beauty-segment-control/g) || []).length, 3);
assert.match(beautySection, />\s*桌面布局\s*</);
assert.match(beautySection, />\s*聊天页面\s*</);
assert.match(beautySection, />\s*主题预设\s*</);
assert.doesNotMatch(beautySection, /桌面模块|聊天页面模块|主题预设模块/);
assert.doesNotMatch(beautySection, /bg-white text-slate-900/);

console.log("themeBeautifyTabs.test.ts passed");
