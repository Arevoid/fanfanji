import assert from "node:assert/strict";
import { apiChat } from "../src/utils/apiHelper";
import { buildModelDirectIdentity, REQUEST_MODEL_TOKEN } from "../src/domain/prompt/modelDirectIdentity";
const originalFetch = globalThis.fetch;
const systemInstruction = buildModelDirectIdentity({ nickname: "Claude", preferences: "温柔" });
const captured: any[] = [];
try {
  globalThis.fetch = (async (_url, init) => { captured.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ text: "synthetic" }), { headers: { "content-type": "application/json" } }); }) as typeof fetch;
  for (const model of ["gemini-test", "gpt-test", "grok-test", "private-custom"]) {
    await apiChat({ message: "你是谁", history: [], apiKey: "synthetic", model, systemInstruction });
    const body = captured.at(-1); assert.equal(body.model, model); assert.ok(body.systemInstruction.includes(JSON.stringify(model))); assert.ok(!body.systemInstruction.includes(REQUEST_MODEL_TOKEN));
  }
  assert.ok(systemInstruction.includes(REQUEST_MODEL_TOKEN), "request binding never mutates the reusable source prompt");
  let calls = 0;
  globalThis.fetch = (async (_url, init) => {
    if (++calls === 1) throw new TypeError("Failed to fetch");
    const body = JSON.parse(String(init?.body)); assert.equal(body.model, "fallback-configured-model");
    assert.ok(body.messages.some((message: any) => message.role === "system" && message.content.includes('"fallback-configured-model"')));
    return new Response(JSON.stringify({ choices: [{ message: { content: "synthetic direct fallback" } }] }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  await apiChat({ message: "你是谁", history: [], apiKey: "synthetic", apiEndpoint: "https://synthetic.test/v1", model: "fallback-configured-model", systemInstruction });
  assert.equal(calls, 2);
} finally { globalThis.fetch = originalFetch; }
console.log("PASS configured model binding across Gemini/GPT/Grok/custom requests and browser transport fallback; source prompts and credentials remain isolated");
