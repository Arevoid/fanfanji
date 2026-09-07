import { strict as assert } from "node:assert";
import {
  boundOfflinePrompt,
  estimatePromptTokens,
  truncatePromptTextToEstimatedTokens,
} from "../src/domain/offlineStory/offlinePromptBudget";

const history = Array.from({ length: 80 }, (_, index) => ({
  role: index % 2 === 0 ? "user" : "model",
  text: `第 ${index} 段剧情：` + "角色继续推进当前场景。".repeat(180),
}));
const bounded = boundOfflinePrompt({
  history,
  systemInstruction: "系统规则与人设。".repeat(2_000),
  message: "请继续。".repeat(1_000),
});

assert.equal(bounded.historyWasTrimmed, true);
assert.equal(bounded.systemWasTrimmed, true);
assert.equal(bounded.messageWasTrimmed, true);
assert.ok(estimatePromptTokens(bounded.systemInstruction) <= 6_500);
assert.ok(estimatePromptTokens(bounded.message) <= 1_200);
assert.ok(bounded.history[0].text.includes("较早剧情已压缩"));
assert.ok(estimatePromptTokens(truncatePromptTextToEstimatedTokens("你好".repeat(1_000), 300)) <= 300);

console.log("Offline prompt budget: context is bounded without mutating the source history");
