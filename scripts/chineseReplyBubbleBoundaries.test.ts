import assert from "node:assert/strict";
import { createDirectReplyCandidates } from "../src/features/chat/services/directChatService";
import { createRegeneratedReplyCandidates } from "../src/features/chat/services/regenerateService";

const paragraphs = ["哎呀？", "刚睡醒摸到手机，一眼看到你的消息。", "先把话说清楚，你想去哪个公园？", "……等等，你该不会是在问我吧？"];
const context = {
  characterId: "synthetic-character", rawText: paragraphs.join("\n\n"),
  disableBracketActions: false, keepPeriods: true,
  createId: (index: number) => `reply-${index}`, currentTime: (index: number) => index,
};
for (const build of [createDirectReplyCandidates, createRegeneratedReplyCandidates]) {
  const baseline = build(context);
  assert.deepEqual(baseline.messages.map(message => message.content), paragraphs);
  for (const translationText of ["", "整段中文的额外翻译。", "A redundant translation with unmatched paragraph boundaries."]) {
    const result = build({ ...context, translationText });
    assert.deepEqual(result.messages.map(message => message.content), paragraphs,
      "unused translation must not merge Chinese reply paragraphs");
    assert.ok(result.messages.every(message => !message.translation));
    assert.equal(new Set(result.messages.map(message => message.id)).size, paragraphs.length);
  }
}
console.log("Chinese character replies retain paragraph boundaries despite redundant translations.");
