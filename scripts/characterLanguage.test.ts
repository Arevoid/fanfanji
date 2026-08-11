import assert from "node:assert/strict";
import { formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage } from "../src/domain/prompt/characterLanguage";

const base = { personality: "沉稳寡言", backstory: "" };
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "日语" }), "Japanese", "explicit field wins");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", backstory: "国籍：日本" }), "Japanese", "Japanese nationality is inferred");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", personality: "说话语言：韩语" }), "Korean", "explicit language in persona is inferred");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "", personality: "中国人，但回复语言：English" }), "English", "explicit language outranks nationality");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "" }, ["角色来自法国"]), "French", "active World Book may define nationality");
assert.equal(resolveCharacterReplyLanguage({ ...base, replyLanguage: "" }), "Simplified Chinese", "Chinese is fallback only");

const finalInstruction = formatFinalReplyLanguageInstruction("Japanese");
assert.match(finalInstruction, /Japanese only/);
assert.match(finalInstruction, /prior Chinese conversation history must never change/);

console.log("PASS deterministic character language resolution and final output anchor");
