import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { projectCharacterPrompt } from "../src/domain/prompt/characterPromptProjector";
import { buildGroupChatSystemInstruction, buildGroupChatTaskMessage, buildProactiveChatSystemInstruction, finalizeCharacterChatSystemInstruction } from "../src/features/chat/prompts/chatPromptBuilders";

const group = buildGroupChatSystemInstruction({ userName: "用户", groupName: "群", worldContext: "世界", memberDefinitions: "成员" });
assert.equal(group.includes("机主“用户”"), true);
assert.equal(group.includes("群名为“群”"), true);
assert.equal(group.includes("[SENDER_NAME: 角色名字]"), true);
assert.equal(buildGroupChatTaskMessage("历史", true).includes("不返回任何回复"), true);
assert.equal(buildGroupChatTaskMessage("", false).includes("不要保持沉默"), true);

const proactive = buildProactiveChatSystemInstruction({ characterName: "角色", description: "DESC_MARK", personality: "PERSONA_MARK", relationship: "RELATION_MARK", userName: "用户", userBio: "简介", worldBook: "世界书", timeContext: "时间", knowledgeBoundary: "边界", truthPrompt: "事实", conversationGuidance: "会话", taskPrompt: "任务", instructionsPrompt: "格式" });
assert.equal(proactive.indexOf("DESC_MARK") < proactive.indexOf("PERSONA_MARK"), true);
assert.equal(proactive.indexOf("PERSONA_MARK") < proactive.indexOf("RELATION_MARK"), true);
assert.equal(proactive.includes("世界书背景设定"), true);
assert.equal(proactive.includes("发送前确认"), true);

const projection = projectCharacterPrompt({ id: "c", name: "角色", personality: "活泼", backstory: "背景" }, "friend");
const finalized = finalizeCharacterChatSystemInstruction({ instructions: [projection.description.content, projection.personality.content, projection.personality.content], characterProjection: projection, characterDescriptionText: projection.description.content, diagnosticLabel: "direct chat prompt" });
assert.equal(finalized.split("[Character Personality / 角色性格与行为]").length - 1, 1);

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appChat, /buildGroupChatSystemInstruction/);
assert.match(appChat, /buildProactiveChatSystemInstruction/);
assert.doesNotMatch(appChat, /你正在扮演微信群聊中的多位群成员/);

console.log("Chat prompt builders: 13 acceptance checks passed");
