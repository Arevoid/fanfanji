import assert from "node:assert/strict";
import { apiExtractMemoriesWithModelFallback } from "../src/utils/apiHelper";

const base = {
  history: [{ id: "message-1", role: "user" as const, text: "明天一起吃饭。" }],
  characterName: "角色",
  apiKey: "test",
  model: "unavailable-extractor-model",
};

const requestedModels: string[] = [];
const recovered = await apiExtractMemoriesWithModelFallback(base, "working-chat-model", async (params) => {
  requestedModels.push(params.model);
  return params.model === "working-chat-model"
    ? { text: "", items: [], candidates: [] }
    : { text: "", items: [], error: "model not found" };
});
assert.deepEqual(requestedModels, ["unavailable-extractor-model", "working-chat-model"]);
assert.equal(recovered.error, undefined);

let emptyCalls = 0;
await apiExtractMemoriesWithModelFallback(base, "working-chat-model", async () => {
  emptyCalls += 1;
  return { text: "", items: [], candidates: [] };
});
assert.equal(emptyCalls, 1, "a valid empty extraction must not be retried as an API failure");

const malformedModels: string[] = [];
const malformedRecovered = await apiExtractMemoriesWithModelFallback(base, "working-chat-model", async (params) => {
  malformedModels.push(params.model);
  return params.model === "working-chat-model"
    ? { text: '{"statement":"角色与用户约定明天一起吃饭。"}', items: [{ statement: "角色与用户约定明天一起吃饭。", kind: "plan" as const, subject: "relationship" as const, temporalStatus: "future" as const, sourceMessageIds: ["message-1"], evidenceQuote: "明天一起吃饭。" }] }
    : { text: "我来总结一下这段记忆。", items: [], candidates: [] };
});
assert.deepEqual(malformedModels, ["unavailable-extractor-model", "working-chat-model"]);
assert.equal(malformedRecovered.items[0]?.statement, "角色与用户约定明天一起吃饭。");
assert.equal(malformedRecovered.error, undefined);

const malformedFinal = await apiExtractMemoriesWithModelFallback(base, "working-chat-model", async () => ({
  text: "这是一段没有遵循 JSONL 格式的普通文本。",
  items: [],
  candidates: [],
}));
assert.match(malformedFinal.error || "", /无法识别的结构化结果/);

console.log("memory extraction model fallback tests passed");
