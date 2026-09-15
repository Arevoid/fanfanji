import assert from "node:assert/strict";
import { generateInnerVoice } from "../src/features/chat/services/innerVoiceService";

const originalFetch = globalThis.fetch;
let providerCalls = 0;

globalThis.fetch = async (input) => {
  const url = String(input);
  if (url === "/api/chat") return new Response("", { status: 404 });
  assert.equal(url, "https://provider.test/v1/chat/completions");
  providerCalls += 1;
  const text = providerCalls === 1
    ? "我会直接说一段普通文本"
    : JSON.stringify({ content: "其实有点开心", emotionalState: "嘴上不说，心里已经悄悄软下来了" });
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

try {
  const result = await generateInnerVoice({
    character: { id: "character-1", name: "角色", personality: "温柔", backstory: "" } as any,
    relationship: {
      id: "relation-1",
      characterId: "character-1",
      userIdentityId: "identity-1",
      conversationId: "conversation:relation-1",
      relationship: "friend",
      createdAt: 1,
      updatedAt: 1,
    },
    triggerMessage: {
      id: "message-1",
      characterId: "character-1",
      relationId: "relation-1",
      conversationId: "conversation:relation-1",
      sender: "user",
      content: "你好",
      timestamp: 1,
    },
    recentMessages: [],
    conversationId: "conversation:relation-1",
    relationId: "relation-1",
    settings: {
      name: "用户",
      apiKey: "test-key",
      selectedModel: "test-model",
      apiEndpoint: "https://provider.test/v1",
      apiTemperature: 0.7,
      streamCompatible: false,
    } as any,
    worldBookEntries: [],
  });

  assert.equal(providerCalls, 2, "an invalid first response should trigger one format retry");
  assert.deepEqual(result && {
    content: result.content,
    emotionalState: result.emotionalState,
  }, {
    content: "其实有点开心",
    emotionalState: "嘴上不说，心里已经悄悄软下来了",
  });
  console.log("PASS standalone inner voice retries invalid provider format once");
} finally {
  globalThis.fetch = originalFetch;
}
