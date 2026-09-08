import { strict as assert } from "node:assert";
import { PromptComposer } from "../src/domain/prompt/PromptComposer";
import { clearPromptDebugSnapshots, listPromptDebugSnapshots } from "../src/domain/prompt/promptDebugRegistry";
import { resolveCharacterReplyLanguage } from "../src/domain/prompt/characterLanguage";
import { prepareGeminiPromptTransport, prepareOpenAiPromptTransport, toGeminiHistoryEntry, toOpenAiHistoryEntry } from "../src/domain/prompt/promptTransport";
import { mapSillyTavernEntry } from "../src/utils/pngParser";
import { buildWorldBookSystemBlocks, getVisibleWorldBookEntries } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

const base: WorldBookEntry = { id: "normal", title: "普通", content: "普通内容", category: "test", characterId: "global", triggerType: "constant", isActive: true, timestamp: 1, position: "before_chat_history", depth: 2 };
const depth: WorldBookEntry = { ...base, id: "depth", title: "深度", content: "深度内容", position: "at_depth", depth: 1 };
const blocks = buildWorldBookSystemBlocks([base, depth], "character", "", { scenario: "chat", characterId: "character" });
assert.equal(blocks.before_chat_history.length, 1);
assert.equal(blocks.at_depth.length, 1);
assert.equal(blocks.formattedAll.includes("普通内容"), true);
assert.equal(blocks.formattedAll.includes("深度内容"), false);
assert.equal(blocks.allTriggered.length, 2);
const dormantLanguage = { ...base, id: "language", title: "角色资料", content: "国籍：日本", triggerType: "keys" as const, keywords: "国籍" };
assert.equal(buildWorldBookSystemBlocks([dormantLanguage], "character", "早上好", { scenario: "chat", characterId: "character" }).allTriggered.length, 0);
const visibleLanguageEntries = getVisibleWorldBookEntries([dormantLanguage], "character", { scenario: "chat", characterId: "character" });
assert.deepEqual(visibleLanguageEntries.map((entry) => entry.id), ["language"], "language metadata remains readable without a chat keyword trigger");
assert.equal(resolveCharacterReplyLanguage(
  { personality: "沉稳寡言", backstory: "" },
  visibleLanguageEntries.map((entry) => `${entry.title}\n${entry.content}`),
), "Japanese", "a dormant Japanese nationality entry still controls the reply language");
assert.equal(mapSillyTavernEntry({ uid: 3, comment: "导入", content: "内容", constant: true, position: 4, depth: 3 }, "character").position, "at_depth");

clearPromptDebugSnapshots();
const original = [{ role: "user", text: "一" }, { role: "model", text: "二" }, { role: "user", text: "三" }, { role: "model", text: "四" }];
const composed = PromptComposer.compose({ scenario: "direct-chat", message: "现在", history: original, systemInstruction: "系统", historyInjections: [
  { id: "near", depth: 1, content: "近" },
  { id: "far", depth: 4, content: "远" },
] });
assert.deepEqual(original.map((entry) => entry.text), ["一", "二", "三", "四"]);
assert.deepEqual(composed.history.map((entry) => entry.role), ["system", "user", "model", "user", "system", "model"]);
assert.equal(composed.history[0].text.includes("远"), true);
assert.equal(composed.history[4].text.includes("近"), true);
assert.equal(listPromptDebugSnapshots().length, 1);
assert.deepEqual(listPromptDebugSnapshots()[0].historyInjections.map((item) => item.insertionIndex), [0, 4]);

const anchoredSystem = `BASE\n\n[FINAL OUTPUT LANGUAGE — HIGHEST PRIORITY]\nJapanese only`;
const geminiTransport = prepareGeminiPromptTransport([{ role: "system", text: "DEPTH" }], anchoredSystem);
assert.equal(geminiTransport.systemInstruction?.endsWith("Japanese only"), true);
assert.ok((geminiTransport.systemInstruction || "").indexOf("DEPTH") < (geminiTransport.systemInstruction || "").indexOf("Japanese only"));
const openAiTransport = prepareOpenAiPromptTransport([{ role: "system", text: "DEPTH" }], anchoredSystem);
assert.equal(openAiTransport.finalSystemInstruction?.endsWith("Japanese only"), true);
assert.deepEqual(toOpenAiHistoryEntry({ role: "system", text: "规则" }), { role: "system", content: "规则" });
assert.equal(toGeminiHistoryEntry({ role: "system", text: "规则" }), null);
const geminiPrompt = prepareGeminiPromptTransport(composed.history, composed.systemInstruction);
assert.equal(geminiPrompt.history.some((entry) => entry.role === "system"), false);
assert.equal(geminiPrompt.systemInstruction?.includes("规则"), false);
assert.equal(geminiPrompt.systemInstruction?.includes("近"), true);
assert.equal(geminiPrompt.systemInstruction?.includes("远"), true);

console.log("World Book at_depth: 18 acceptance checks passed");
