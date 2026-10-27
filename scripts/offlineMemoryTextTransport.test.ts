import assert from "node:assert/strict";
import { apiExtractMemories } from "../src/utils/apiHelper";

const originalFetch = globalThis.fetch;
const requests: { url: string; body: any }[] = [];
const base = {
  history: [{ id: "source-1", role: "user" as const, text: "A recorded experience." }],
  characterName: "Character",
  apiKey: "test-only-key",
  model: "test-only-model",
  apiEndpoint: "https://example.invalid/v1",
};
try {
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ text: '{"reviews":[]}' });
  }) as typeof fetch;
  for (const streamCompatible of [false, true]) {
    const result = await apiExtractMemories({ ...base, scenario: "offline", semanticReview: [], streamCompatible });
    assert.equal(result.error, undefined);
    assert.deepEqual(result.semanticReviews, []);
    const request = requests.at(-1)!;
    assert.equal(request.url, "/api/chat");
    assert.equal(request.body.streamCompatible, streamCompatible);
    assert.equal(request.body.maxOutputTokens, 8192);
    assert.equal(request.body.model, base.model);
    assert.equal(request.body.apiEndpoint, base.apiEndpoint);
    assert.equal(request.body.apiKey, base.apiKey);
  }
  requests.length = 0;
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ text: JSON.stringify({ statement: "A recorded experience.", kind: "fact", subject: "user", temporalStatus: "past", sourceMessageIds: ["source-1"], evidenceQuote: "A recorded experience." }) });
  }) as typeof fetch;
  const extracted = await apiExtractMemories({ ...base, scenario: "offline" });
  assert.equal(extracted.error, undefined);
  assert.equal(extracted.candidates?.length, 1);
  assert.deepEqual(extracted.candidates?.[0].sourceMessageIds, ["source-1"]);
  assert.equal(requests.length, 1, "valid sourced output does not need a repair request");
  requests.length = 0;
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ error: "gateway refused request" }, { status: 502 });
  }) as typeof fetch;
  const failed = await apiExtractMemories({ ...base, scenario: "offline" });
  assert.ok(failed.error);
  assert.equal(requests.length, 1, "HTTP failure must not trigger another paid transport attempt");
  requests.length = 0;
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ candidates: [] });
  }) as typeof fetch;
  await apiExtractMemories(base);
  assert.equal(requests[0].url, "/api/extract-memories", "other extraction scenarios retain their existing transport");
  console.log("offlineMemoryTextTransport tests passed");
} finally {
  globalThis.fetch = originalFetch;
}
