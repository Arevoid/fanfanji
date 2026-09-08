import assert from "node:assert/strict";
import { buildDiaryPrompt } from "../src/domain/prompt/diaryPrompt";

const reserved = buildDiaryPrompt({
  characterName: "沈安",
  occurredAt: Date.UTC(2026, 6, 30, 12),
  characterProfile: "寡言克制，习惯观察细节，不轻易表达情绪。",
  relationshipState: "熟悉",
  context: "用户：今天下雨了。",
});

const lively = buildDiaryPrompt({
  characterName: "闻岚",
  occurredAt: Date.UTC(2026, 6, 30, 12),
  characterProfile: "外向直率，说话轻快，喜欢把情绪说得很明白。",
  relationshipState: "熟悉",
  context: "用户：今天下雨了。",
});

assert.match(reserved, /角色资料不是装饰/);
assert.match(reserved, /措辞、句子长短、叙述节奏/);
assert.match(reserved, /不要套用其他角色的修辞/);
assert.match(reserved, /寡言克制/);
assert.match(lively, /外向直率/);
assert.notEqual(reserved, lively);

console.log("diary prompt persona coverage passed");
