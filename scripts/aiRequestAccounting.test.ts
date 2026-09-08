import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apiChat, apiExtractMemories } from "../src/utils/apiHelper";
import { AI_REQUEST_LEDGER_KEY, clearInMemoryAiRequestLedgerForTests, loadAiRequestLedger } from "../src/core/monitoring/aiRequestLedger";
import { requestDirectChatTurn } from "../src/features/chat/controllers/chatGenerationController";
import type { UserSettings } from "../src/types";

const originalFetch = globalThis.fetch;
const storage = new Map<string, string>();
(globalThis as any).window = { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
} };

const settings = { apiKey: "key", selectedModel: "model", apiTemperature: 0.5 } as UserSettings;
const directPrompt = {
  scenario: "direct-chat" as const,
  message: "当前",
  history: [{ role: "user" as const, text: "历史" }],
  systemInstruction: "系统",
  historyInjections: [],
};

function resetLedger(): void {
  storage.clear();
  clearInMemoryAiRequestLedgerForTests();
}

function records() {
  return loadAiRequestLedger(Date.now() + 1_000);
}

try {
  resetLedger();
  globalThis.fetch = (async () => Response.json({ text: "正常回复" })) as typeof fetch;
  await apiChat({ message: "你好", history: [], apiKey: "key", model: "model", parentActionId: "action-normal", characterId: "character-1", relationId: "relation-1", conversationId: "conversation-1" });
  let ledger = records();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].purpose, "chat_reply");
  assert.equal(ledger[0].status, "success");
  assert.equal(ledger[0].providerRequestCount, 1);
  assert.equal(ledger[0].fallbackCount, 0);
  assert.equal(ledger[0].transport, "backend_proxy");
  assert.equal(ledger[0].endpoint, "/api/chat");
  assert.equal(ledger[0].parentActionId, "action-normal");
  assert.doesNotMatch(storage.get(AI_REQUEST_LEDGER_KEY) || "", /key|Authorization|你好/);

  resetLedger();
  let networkCalls = 0;
  globalThis.fetch = (async () => {
    networkCalls += 1;
    if (networkCalls === 1) throw new TypeError("backend unavailable");
    return Response.json({ choices: [{ message: { content: "浏览器回退成功" } }] });
  }) as typeof fetch;
  await apiChat({ message: "回退", history: [], apiKey: "key", model: "model", apiEndpoint: "https://provider.example/v1", parentActionId: "action-fallback" });
  ledger = records();
  assert.equal(networkCalls, 2, "network fallback must preserve the existing two-request behavior");
  assert.equal(ledger[0].providerRequestCount, 2);
  assert.equal(ledger[0].fallbackCount, 1);
  assert.match(ledger[0].fallbackReasons[0], /browser direct/);
  assert.equal(ledger[0].transport, "browser_direct");

  resetLedger();
  let providerErrorCalls = 0;
  globalThis.fetch = (async () => {
    providerErrorCalls += 1;
    return new Response(JSON.stringify({ error: "provider rejected" }), { status: 400, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  await assert.rejects(() => apiChat({ message: "4xx", history: [], apiKey: "key", model: "model", apiEndpoint: "https://provider.example/v1" }));
  ledger = records();
  assert.equal(providerErrorCalls, 1, "an explicit provider 4xx must not be retried through browser direct");
  assert.equal(ledger[0].status, "failure");
  assert.equal(ledger[0].providerRequestCount, 1);
  assert.equal(ledger[0].fallbackCount, 0);
  assert.equal(ledger[0].errorCategory, "provider_4xx");

  resetLedger();
  let formatCalls = 0;
  globalThis.fetch = (async () => {
    formatCalls += 1;
    return Response.json({ text: formatCalls === 1 ? '{"reply":{"unexpected":true}}' : '{"reply":"格式恢复后的回复","innerVoice":{"content":"暂未说出口","emotionalState":"平静"}}' });
  }) as typeof fetch;
  const formatted = await requestDirectChatTurn({ prompt: directPrompt, settings, includeInnerVoice: true });
  assert.equal(formatted.text, "格式恢复后的回复");
  ledger = records();
  assert.equal(formatCalls, 2);
  assert.equal(ledger.length, 2, "format recovery records each existing provider request separately");
  assert.equal(ledger[0].parentActionId, ledger[1].parentActionId);
  assert.equal(ledger[1].retryCount, 1);
  assert.match(ledger[1].retryReasons[0], /format/);

  resetLedger();
  let aliasCalls = 0;
  globalThis.fetch = (async () => {
    aliasCalls += 1;
    return Response.json({ text: aliasCalls === 1 ? "？宝宝你别吓我，我是步随影啊。" : "你找步随影有什么事？我们好像还不熟。" });
  }) as typeof fetch;
  const aliasRecovered = await requestDirectChatTurn({
    prompt: { ...directPrompt, message: "你是步随影？" },
    settings,
    aliasIdentityGuard: {
      aliasName: "老莫",
      primaryName: "饭饭",
      hasPrimaryRelationship: true,
      recognitionState: "unknown",
      currentUserMessage: "你是步随影？",
    },
  });
  assert.equal(aliasRecovered.text, "你找步随影有什么事？我们好像还不熟。");
  ledger = records();
  assert.equal(aliasCalls, 2);
  assert.match(ledger[1].retryReasons[0], /alias/);

  resetLedger();
  let contextCalls = 0;
  globalThis.fetch = (async () => {
    contextCalls += 1;
    if (contextCalls === 1) return new Response(JSON.stringify({ error: "context window exceeded" }), { status: 400, headers: { "content-type": "application/json" } });
    return Response.json({ text: "上下文恢复后的回复" });
  }) as typeof fetch;
  const contextHistory = Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, text: `历史 ${index}` }));
  const recovered = await requestDirectChatTurn({ prompt: { ...directPrompt, history: contextHistory }, settings });
  assert.equal(recovered.text, "上下文恢复后的回复");
  ledger = records();
  assert.ok(contextCalls >= 2);
  assert.ok(ledger.some((entry) => entry.retryCount > 0 && entry.retryReasons.some((reason) => /context/iu.test(reason))));

  resetLedger();
  globalThis.fetch = (async () => Response.json({ candidates: [{ statement: "事实" }] })) as typeof fetch;
  await apiExtractMemories({ history: [{ id: "m1", role: "user", text: "内容" }], characterName: "角色", apiKey: "key", model: "model", parentActionId: "action-memory", characterId: "character-1", relationId: "relation-1", conversationId: "conversation-1" });
  ledger = records();
  assert.equal(ledger[0].purpose, "memory_extract");
  assert.equal(ledger[0].parentActionId, "action-memory");

  resetLedger();
  globalThis.fetch = (async () => Response.json({ text: "{\"title\":\"日记\",\"body\":\"今天\"}" })) as typeof fetch;
  await apiChat({ message: "生成日记", history: [], apiKey: "key", model: "model", purpose: "diary_generate", parentActionId: "action-diary", characterId: "character-1", relationId: "relation-1" });
  ledger = records();
  assert.equal(ledger[0].purpose, "diary_generate");
  assert.equal(ledger[0].parentActionId, "action-diary");

  const controllerSource = readFileSync("src/features/chat/hooks/useChatController.ts", "utf8");
  const sendOnlyBody = controllerSource.slice(controllerSource.indexOf("const handleSendOnly"), controllerSource.indexOf("// Handle Send Message and Trigger AI reply"));
  assert.doesNotMatch(sendOnlyBody, /generateResponseForUserMessage|apiChat/);
  console.log("PASS AI request envelope/ledger accounting: normal, send-only zero, format/context/alias retries, network fallback, explicit 4xx, memory, and diary purposes");
} finally {
  globalThis.fetch = originalFetch;
}
