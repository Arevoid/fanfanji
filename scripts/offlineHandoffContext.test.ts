import assert from "node:assert/strict";
import type { Message } from "../src/types";
import { buildOfflineHandoffFacts, formatOfflineHandoffFactsForPrompt } from "../src/domain/offlineStory/offlineHandoffContext";

const base = new Date("2026-08-18T10:00:00").getTime();
const message = (id: string, sender: Message["sender"], content: string, offset: number): Message => ({
  id,
  characterId: "char-1",
  relationId: "relation-1",
  sender,
  content,
  timestamp: base + offset * 60_000,
});

const messages: Message[] = [
  message("old-plan", "user", "明天上半天班，明晚我们吃火锅。", 0),
  message("food-plan", "user", "我想吃螺蛳粉。", 1),
  ...Array.from({ length: 48 }, (_, index) => message(`filler-${index}`, "character", `收到第${index}条消息。`, index + 2)),
];

const facts = buildOfflineHandoffFacts(messages);
assert.equal(facts.length >= 2, true, "facts should survive a 50-message handoff");
assert.equal(facts.some((fact) => fact.content.includes("上半天班") && fact.content.includes("火锅")), true);
assert.equal(facts.some((fact) => fact.content.includes("螺蛳粉")), true);
assert.match(facts.find((fact) => fact.content.includes("火锅"))?.normalizedTime || "", /2026-08-19/);

const prompt = formatOfflineHandoffFactsForPrompt(facts);
assert.match(prompt, /线上交接事实/);
assert.match(prompt, /不得改写、替换/);
assert.match(prompt, /明天上半天班/);
assert.match(prompt, /明晚我们吃火锅/);
assert.match(prompt, /螺蛳粉/);

console.log("PASS offline handoff keeps older plans, food preferences, and normalized relative dates");
