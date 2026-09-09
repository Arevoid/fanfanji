import assert from "node:assert/strict";
import { evaluateMemoryExtractionCheapFilter } from "../src/domain/memory/memoryExtractionCheapFilter";

const user = (content: string) => ({ sender: "user" as const, content });
const character = (content: string) => ({ sender: "character" as const, content });
const decision = (messages: unknown[]) => evaluateMemoryExtractionCheapFilter(messages);

assert.deepEqual(decision([]), { decision: "skip", reason: "empty_batch" });
assert.deepEqual(decision([user("   "), character("\n")]), { decision: "skip", reason: "empty_batch" });
assert.deepEqual(decision([user("😂"), character("😭😭"), user("❤️")]), { decision: "skip", reason: "reaction_only" });
assert.deepEqual(decision([user("嗯"), character("好的")]), { decision: "skip", reason: "acknowledgement_only" });
assert.deepEqual(decision([user("好"), character("好"), user("好")]), { decision: "skip", reason: "repetition_only" });
assert.deepEqual(decision([user("早安"), character("晚安")]), { decision: "skip", reason: "greeting_only" });
assert.deepEqual(decision([user("谢谢"), character("不客气")]), { decision: "skip", reason: "greeting_only" });

const shouldExtract = [
  "我怀孕了",
  "我们分手吧",
  "我喜欢你",
  "我爸去世了",
  "我下个月去日本",
  "我辞职了",
  "我不吃香菜",
  "我觉得他可能不喜欢我",
  "明晚八点见",
  "我刚刚跟朋友吵架",
  "今天心情很差",
  "我换工作了",
];
for (const text of shouldExtract) {
  assert.equal(decision([user(text)]).decision, "extract", `important short content must extract: ${text}`);
}

assert.equal(decision([user("哈哈"), character("我明天要辞职")]).decision, "extract", "mixed low-value + important extracts");
assert.equal(decision([user("好的"), user("我不吃香菜")]).decision, "extract", "mixed acknowledgement + preference extracts");
assert.equal(decision([user("😂"), character("刚刚跟我妈吵架了")]).decision, "extract", "mixed reaction + event extracts");
assert.equal(decision([user("你还记得我生日吗？")]).decision, "extract", "question-only content fails open");
assert.equal(decision([user("今天好累")]).decision, "extract", "negative mood is not small-talk skipped");
assert.equal(decision([user("これは大切な話です")]).decision, "extract", "unknown language fails open");
assert.equal(decision([character("好的"), character("😂")]).decision, "extract", "assistant-only batch fails open");
assert.equal(decision([{ sender: "user", content: "" , imageAssetId: "asset-1" }]).decision, "extract", "media-only content is not assumed empty");
assert.equal(decision([{ sender: "user", content: "", isVoiceMessage: true }]).decision, "extract", "voice-only content is not assumed empty");
assert.deepEqual(decision([user("哈哈"), character("哈哈哈哈")]), { decision: "skip", reason: "acknowledgement_only" });
assert.deepEqual(decision([user("ok"), character("OK")]), { decision: "skip", reason: "repetition_only" });
assert.equal(decision([user("早安"), character("hello")]).decision, "extract", "unknown-language greetings fail open");
assert.equal(decision([user("我喜欢你"), character("好的")]).decision, "extract", "important content wins over courtesy");
assert.deepEqual(decision(null), { decision: "extract", reason: "unsupported_input" });
assert.deepEqual(decision([{ sender: "system", content: "好的" }]), { decision: "extract", reason: "unsupported_input" });

const first = decision([user("嗯"), character("好的")]);
const second = decision([character("好的"), user("嗯")]);
assert.deepEqual(first, second, "batch classification is deterministic and order-independent for safe categories");

console.log("PASS memory extraction cheap filter safe skips, important guards, media fail-open, and deterministic batch decisions");
