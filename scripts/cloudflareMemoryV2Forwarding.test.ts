import assert from "node:assert/strict";
import worker from "../src/cloudflare/worker";

const originalFetch = globalThis.fetch;
const requestBodies: Array<Record<string, unknown>> = [];

globalThis.fetch = async (_input, init) => {
  requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
  return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const env = { ASSETS: { fetch: async () => new Response("asset") } } as any;
const request = (body: Record<string, unknown>) => new Request("https://fanfanji.test/api/extract-memories", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: "synthetic-test-key",
    apiEndpoint: "https://provider.test/v1",
    model: "synthetic-model",
    characterName: "synthetic",
    history: [{ id: "M#1", role: "user", text: "synthetic" }],
    ...body,
  }),
});

try {
  const enabledResponse = await worker.fetch(request({ enableV2Shadow: true }), env);
  assert.equal(enabledResponse.status, 200);
  const enabledBody = requestBodies[0];
  const enabledMessages = enabledBody.messages as Array<{ content?: string }>;
  assert.match(enabledMessages.map((message) => message.content || "").join("\n"), /V2|v2|source refs/u, "Worker forwards the V2 prompt mode");

  const offlineResponse = await worker.fetch(request({ enableV2Shadow: true, scenario: "offline" }), env);
  assert.equal(offlineResponse.status, 200);
  const offlineBody = requestBodies[1];
  const offlineMessages = offlineBody.messages as Array<{ content?: string }>;
  assert.doesNotMatch(offlineMessages.map((message) => message.content || "").join("\n"), /V2 shadow|V2候选|V2 metadata/u, "offline remains V2-disabled");
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(requestBodies.length, 2);
console.log("Cloudflare Worker includeV2Shadow forwarding passed");
