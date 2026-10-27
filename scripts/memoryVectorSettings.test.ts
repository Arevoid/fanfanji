import assert from "node:assert/strict";
import { fetchMemoryVectorModels, normalizeMemoryVectorConfiguration } from "../src/features/characterKnowledge/services/memoryVectorSettingsService";
const config = normalizeMemoryVectorConfiguration({ enabled: false, apiEndpoint: " https://provider.test/v1/embeddings/ ", apiKey: " synthetic-key ", model: " BAAI/bge-m3 ", minimumSimilarity: 0.5 });
assert.equal(config.enabled, true); assert.equal(config.apiEndpoint, "https://provider.test/v1"); assert.equal(config.model, "BAAI/bge-m3");
assert.throws(() => normalizeMemoryVectorConfiguration({ ...config, apiEndpoint: "https://user:password@provider.test/v1" }));
assert.throws(() => normalizeMemoryVectorConfiguration({ ...config, apiKey: "" }));
assert.throws(() => normalizeMemoryVectorConfiguration({ ...config, apiEndpoint: "https://provider.test/v1?key=synthetic" }));
let called = 0;
const models = await fetchMemoryVectorModels(config, async (params) => {
  called++; assert.equal(params.apiEndpoint, "https://provider.test/v1"); assert.equal(params.apiKey, "synthetic-key");
  return ["chat-model", "BAAI/bge-m3", "BAAI/bge-m3", "", "custom-embedding", "rerank-model"];
});
assert.equal(called, 1); assert.equal(models[0], "BAAI/bge-m3"); assert.equal(models.filter((model) => model === "BAAI/bge-m3").length, 1);
assert.ok(models.includes("chat-model"), "unknown custom model names remain selectable, no guessed capability prohibition");
await assert.rejects(fetchMemoryVectorModels({ apiKey: "", apiEndpoint: config.apiEndpoint }, async () => { called++; return []; }));
assert.equal(called, 1);
await assert.rejects(fetchMemoryVectorModels(config, async () => []), /手动填写/);
console.log("PASS vector settings: enable on save, endpoint normalization, credential URL rejection, model list, deduplication and manual fallback");
