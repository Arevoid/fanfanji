import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { projectCharacterPrompt } from "../src/domain/prompt/characterPromptProjector";
import { buildGroupChatSystemInstruction, buildGroupChatTaskMessage, buildProactiveChatSystemInstruction, finalizeCharacterChatSystemInstruction } from "../src/features/chat/prompts/chatPromptBuilders";
import { formatUserKnowledgeBoundary } from "../src/domain/prompt/userKnowledgeBoundary";
import { DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES } from "../src/features/chat/prompts/chatPromptPolicy";

const group = buildGroupChatSystemInstruction({ userName: "用户", groupName: "群", worldContext: "世界", memberDefinitions: "成员" });
assert.equal(group.includes("机主“用户”"), true);
assert.equal(group.includes("群名为“群”"), true);
assert.equal(group.includes("[SENDER_NAME: 角色名字]"), true);
assert.equal(buildGroupChatTaskMessage("历史", true).includes("不返回任何回复"), true);
assert.equal(buildGroupChatTaskMessage("", false).includes("不要保持沉默"), true);

const proactive = buildProactiveChatSystemInstruction({ characterName: "角色", description: "DESC_MARK", personality: "PERSONA_MARK", relationship: "RELATION_MARK", userName: "用户", userBio: "简介", worldBook: "世界书", timeContext: "时间", knowledgeBoundary: "边界", truthPrompt: "事实", conversationGuidance: "会话", taskPrompt: "任务", instructionsPrompt: "格式", expressionAnchor: "UNIQUE_ANCHOR", finalPersonaRules: ["PERSONA_RULE"], finalLanguageInstruction: "FINAL_LANG" });
assert.equal(proactive.indexOf("DESC_MARK") < proactive.indexOf("PERSONA_MARK"), true);
assert.equal(proactive.indexOf("PERSONA_MARK") < proactive.indexOf("RELATION_MARK"), true);
assert.equal(proactive.includes("世界书背景设定"), true);
assert.equal(proactive.includes("发送前确认"), true);
assert.equal(proactive.indexOf("UNIQUE_ANCHOR") > proactive.indexOf("特殊媒体使用规则"), true);
assert.equal(proactive.indexOf("PERSONA_RULE") > proactive.indexOf("UNIQUE_ANCHOR"), true);
assert.equal(proactive.endsWith("FINAL_LANG"), true);

const projection = projectCharacterPrompt({ id: "c", name: "角色", personality: "活泼", backstory: "背景" }, "friend");
const finalized = finalizeCharacterChatSystemInstruction({ instructions: [projection.description.content, projection.personality.content, projection.personality.content], characterProjection: projection, characterDescriptionText: projection.description.content, diagnosticLabel: "direct chat prompt", finalLanguageInstruction: "FINAL_LANG" });
assert.equal(finalized.split("[Character Personality / 角色性格与行为]").length - 1, 1);
assert.equal(finalized.indexOf("最终角色专属表达锚点") > finalized.indexOf("[Character Personality / 角色性格与行为]"), true);
assert.equal(finalized.endsWith("FINAL_LANG"), true);

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appChat, /buildGroupChatSystemInstruction/);
assert.match(appChat, /buildProactiveChatSystemInstruction/);
assert.doesNotMatch(appChat, /你正在扮演微信群聊中的多位群成员/);

const userBoundary = formatUserKnowledgeBoundary();
assert.match(group, /用户资料留空表示“未知”/);
assert.match(group, /不得转移、镜像或补写到用户身上/);
assert.match(proactive, /角色自己先前对用户作出的猜测/);
assert.match(userBoundary, /用户的职业、学校、课程、工作/);
assert.match(userBoundary, /明天需要早起吗/);
assert.match(userBoundary, /不得装作没说过/);
assert.match(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, /role=user 的内容才是用户说过的话/);
assert.match(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, /绝对不得把你自己说过的评价、问题、承诺或情绪倒算成用户说过/);
assert.match(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, /不得突然升级成厌恶、羞辱、贬低或攻击/);
assert.match(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, /精确时间戳确实显示多日未联系时，可以按事实提及这段间隔/);
assert.match(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, /嘴臭、毒舌或辱追表达可以正常保留/);
assert.equal((appChat.match(/assembledInstructions\.push\(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES\)/g) || []).length, 2);
assert.equal((appChat.match(/assembledInstructions\.push\(userKnowledgeBoundary\)/g) || []).length, 2);

console.log("Chat prompt builders: 20 acceptance checks passed");
