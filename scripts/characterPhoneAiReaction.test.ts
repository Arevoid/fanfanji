import assert from "node:assert/strict";
import {
  buildCharacterPhoneAwarenessAiPrompt,
  buildCharacterPhoneBrowserReflectionAiPrompt,
  buildCharacterPhoneDiscoveryAiPrompt,
  generateCharacterPhoneBrowserReflection,
  generateCharacterPhoneDiscoveryMessage,
} from "../src/features/characterPhone/characterPhoneAiReaction";

const character = {
  id: "character-ai-1",
  name: "谌澈",
  personality: "嘴硬、敏感，习惯先观察再开口",
  backstory: "不喜欢被人越过边界，但在意熟人的情绪",
} as any;
const action = {
  id: "phone-action-ai-1",
  kind: "chat_sent_as_character",
  app: "chat",
  detail: "向老妈发送消息",
  contentSnapshot: "我马上回去",
  timestamp: 1,
  actor: "user",
  detectability: "possible",
} as any;

const discoveryPrompt = buildCharacterPhoneDiscoveryAiPrompt({
  character,
  action,
  relationshipContext: "与用户是恋人，最近因为边界问题有过争执",
  worldBookContext: ["角色不轻易承认自己在意，但会用反问表达关心"],
  recentConversation: ["用户：你最近是不是在躲我？"],
  recentDiscoveries: ["你动过我的手机吗？"],
  now: 123,
});
assert.match(discoveryPrompt.message, /人物性格/u);
assert.match(discoveryPrompt.message, /手机操作证据/u);
assert.match(discoveryPrompt.message, /不能重复/u);
assert.match(discoveryPrompt.systemInstruction, /不能断言对方就是操作者/u);
assert.match(discoveryPrompt.systemInstruction, /必须与给出的历史发现消息不同/u);

const reflectionPrompt = buildCharacterPhoneBrowserReflectionAiPrompt({
  character,
  query: "微博小号怎么隐藏不被发现",
  title: "关于微博小号怎么隐藏不被发现的搜索结果",
  relationshipContext: "与用户关系暧昧，最近担心隐私边界",
  worldBookContext: ["角色有一个不想被熟人发现的小号"],
  recentConversation: ["用户：你是不是还有事情瞒着我？"],
  recentReflections: ["我先把账号和现实生活分开，能不牵连的地方就别留下线索。"],
  now: 456,
});
assert.match(reflectionPrompt.message, /搜索词/u);
assert.match(reflectionPrompt.message, /最近的浏览心声/u);
assert.match(reflectionPrompt.systemInstruction, /第一人称心声/u);
assert.match(reflectionPrompt.systemInstruction, /不要机械复述搜索词/u);

const awarenessPrompt = buildCharacterPhoneAwarenessAiPrompt({
  character,
  level: 2,
  attemptCount: 4,
  relationshipContext: "与用户是普通朋友",
  worldBookContext: ["角色不喜欢别人未经允许碰自己的东西"],
  recentConversation: ["用户：我只是随便看看"],
  recentAwarenessMessages: ["谁动过我的手机？"],
  now: 789,
});
assert.match(awarenessPrompt.message, /手机已经暂时锁定/u);
assert.match(awarenessPrompt.message, /普通朋友/u);
assert.match(awarenessPrompt.systemInstruction, /没有证据时不能断言/u);

assert.equal(
  await generateCharacterPhoneDiscoveryMessage({ character, action }),
  null,
  "missing API configuration uses the caller's fallback path",
);
assert.equal(
  await generateCharacterPhoneBrowserReflection({ character, query: "天气" }),
  null,
  "missing API configuration uses the browser fallback path",
);

console.log("characterPhoneAiReaction.test.ts passed");
