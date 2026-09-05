import assert from "node:assert/strict";
import { formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage } from "../src/domain/prompt/characterLanguage";

const base = { personality: "沉稳寡言", backstory: "" };
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "日语" }), "Japanese", "explicit field wins");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", backstory: "国籍：日本" }), "Japanese", "Japanese nationality is inferred");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", backstory: "國籍：日本" }), "Japanese", "Traditional Chinese nationality labels are inferred");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", personality: "说话语言：韩语" }), "Korean", "explicit language in persona is inferred");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", personality: `前言：作者参考过日文资料。${"普通说明".repeat(30)}\n【绝对】藤堂遥人说出口的台词必须是日语。禁止中文台词。` }), "Japanese", "later mandatory language rules are scanned after an earlier casual mention");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", name: "藤堂 遥人（とうどう はると）" }), "Japanese", "Japanese kana in the character identity is a fallback language signal");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", personality: "中国人，但回复语言：English" }), "English", "explicit language outranks nationality");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "" }, ["角色来自法国"]), "French", "active World Book may define nationality");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", personality: "常用语言：Polski" }), "Polski", "unlisted explicit languages remain supported");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "" }), undefined, "unknown profiles stay in automatic inference mode");

const finalInstruction = formatFinalReplyLanguageInstruction("Japanese");
assert.match(finalInstruction, /Japanese only/);
assert.match(finalInstruction, /prior Chinese conversation history must never change/);
assert.match(formatFinalReplyLanguageInstruction(), /Do not default to Simplified Chinese/);

console.log("PASS deterministic character language resolution and final output anchor");
