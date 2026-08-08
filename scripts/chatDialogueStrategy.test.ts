import assert from "node:assert/strict";
import { analyzeConversationFlow } from "../src/domain/prompt/conversationFlow";
import { decideChatDialogueStrategy } from "../src/features/chat/services/chatDialogueStrategy";
import { trackShortTermChatEmotion } from "../src/features/chat/services/chatEmotionTracker";
import { formatChatDialogueStrategyGuidance } from "../src/features/characterCognitive/promptAdapters/chatPromptAdapter";
import type { Message } from "../src/types";

const characterId = "strategy-character";
const message = (id: string, sender: Message["sender"], content: string, timestamp: number): Message => ({
  id,
  characterId,
  sender,
  content,
  timestamp,
});
const decide = (messages: readonly Message[]) => decideChatDialogueStrategy({
  flow: analyzeConversationFlow(messages, characterId),
  emotions: trackShortTermChatEmotion(messages, characterId),
  messages,
  characterId,
});

assert.equal(decide([message("u1", "user", "我今天好累，也有点难过", 1)]).strategy, "comfort");
assert.equal(decide([message("u1", "user", "我今天下班路上遇到一只小猫", 1)]).strategy, "ask");

const repeatedJoke = [
  message("u1", "user", "哈哈你又逗我", 1),
  message("c1", "character", "我哪有，明明是你先逗我的", 2),
  message("u2", "user", "哈哈你又逗我", 3),
  message("c2", "character", "还说我逗你，明明你自己笑了", 4),
  message("u3", "user", "哈哈你又逗我", 5),
];
assert.equal(decide(repeatedJoke).strategy, "transition");

assert.equal(decide([message("u1", "user", "你今天还顺利吗？", 1)]).strategy, "share");
assert.equal(decide([message("u1", "user", "我在整理房间", 1)]).strategy, "continue");

const guidance = formatChatDialogueStrategyGuidance({ strategy: "transition" });
assert.match(guidance, /Selected strategy: transition/);
assert.match(guidance, /Preserve the existing character persona/);
assert.equal(guidance.includes("relationId"), false);
assert.equal(guidance.includes("Memory"), false);

console.log("PASS chat dialogue strategy: comfort, ask, transition, share, continue, and prompt-only scope");
