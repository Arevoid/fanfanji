import { strict as assert } from "node:assert";
import { PromptComposer } from "../src/domain/prompt/PromptComposer";
import { clearPromptDebugSnapshots, listPromptDebugSnapshots } from "../src/domain/prompt/promptDebugRegistry";
import { prepareGeminiPromptTransport, toGeminiHistoryEntry, toOpenAiHistoryEntry } from "../src/domain/prompt/promptTransport";
import { mapSillyTavernEntry } from "../src/utils/pngParser";
import { buildWorldBookSystemBlocks } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

const base: WorldBookEntry = { id: "normal", title: "普通", content: "普通内容", category: "test", characterId: "global", triggerType: "constant", isActive: true, timestamp: 1, position: "before_chat_history", depth: 2 };
const depth: WorldBookEntry = { ...base, id: "depth", title: "深度", content: "深度内容", position: "at_depth", depth: 1 };
const blocks = buildWorldBookSystemBlocks([base, depth], "character", "", { scenario: "chat", characterId: "character" });
assert.equal(blocks.before_chat_history.length, 1);
assert.equal(blocks.at_depth.length, 1);
assert.equal(blocks.formattedAll.includes("普通内容"), true);
assert.equal(blocks.formattedAll.includes("深度内容"), false);
assert.equal(blocks.allTriggered.length, 2);
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
assert.deepEqual(toOpenAiHistoryEntry({ role: "system", text: "规则" }), { role: "system", content: "规则" });
assert.equal(toGeminiHistoryEntry({ role: "system", text: "规则" }), null);
const geminiPrompt = prepareGeminiPromptTransport(composed.history, composed.systemInstruction);
assert.equal(geminiPrompt.history.some((entry) => entry.role === "system"), false);
assert.equal(geminiPrompt.systemInstruction?.includes("规则"), false);
assert.equal(geminiPrompt.systemInstruction?.includes("近"), true);
assert.equal(geminiPrompt.systemInstruction?.includes("远"), true);

console.log("World Book at_depth: 18 acceptance checks passed");
