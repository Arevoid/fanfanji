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

console.log("memory extraction model fallback tests passed");
