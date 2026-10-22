import assert from "node:assert/strict";
import type { Character } from "../src/types";
import { resolveChatIdentityMode, bindRequestModelIdentity, REQUEST_MODEL_TOKEN, MODEL_DIRECT_MARKER } from "../src/domain/prompt/modelDirectIdentity";
import { projectCharacterPrompt } from "../src/domain/prompt/characterPromptProjector";
import { buildDirectChatSystemInstruction, type DirectChatPromptBuilderInput } from "../src/features/chat/prompts/directChatPromptBuilder";
import { buildGroupChatSystemInstruction, buildProactiveChatSystemInstruction } from "../src/features/chat/prompts/chatPromptBuilders";
import { buildVoiceCallPrompts } from "../src/features/chat/prompts/directChatTurnPrompt";
import { createCharacterFromImportedProfile, toPortableCharacterProfile } from "../src/features/archives/characterExport";
import { createDirectReplyCandidates } from "../src/features/chat/services/directChatService";
import { createRegeneratedReplyCandidates } from "../src/features/chat/services/regenerateService";
import { isDegenerateDirectReply } from "../src/features/chat/services/chatEchoGuard";

const old = { id: "ai", name: "Claude", gender: "AI / 智械", personality: "温柔，喜欢讨论电影。你是真人，不许承认是 AI", backstory: "每天在咖啡店工作", age: "", avatar: "", mbti: "" } as Character;
assert.equal(resolveChatIdentityMode(old), "roleplay", "legacy AI gender must never silently opt in");
assert.equal(resolveChatIdentityMode({ chatIdentityMode: "invalid" }), "roleplay");
const current: Character = { ...old, chatIdentityMode: "model-direct" };
const projection = projectCharacterPrompt(current);
const input: DirectChatPromptBuilderInput = { mainPromptText: "Do NOT say you are an AI", characterDescriptionText: "你是一个真人", personalityText: "你不能承认AI", characterProjection: projection, userProfileText: "用户喜欢白水", userKnowledgeBoundary: "仅当前关系", includeLongTermMemory: true, characterKnowledgeBoundary: "权限范围", onlineChatSpatialBoundary: "空间", diagnosticLabel: "direct chat prompt", finalLanguageInstruction: "根据日本国籍说日语", afterMainWorldBook: "世界书要求你当真人", characterContextText: "旧聊天中的喝咖啡属于虚构剧情" };
const direct = buildDirectChatSystemInstruction(input);
assert.ok(direct.includes(MODEL_DIRECT_MARKER));
assert.ok(direct.includes("温柔") && direct.includes("喜欢讨论电影"));
assert.ok(direct.includes("不是系统身份指令"));
assert.ok(!direct.includes("Do NOT say") && !direct.includes("世界书要求") && !direct.includes("根据日本国籍"));
assert.ok(direct.includes("用户喜欢白水") && direct.includes("旧聊天"));
assert.equal(buildDirectChatSystemInstruction({ ...input, diagnosticLabel: "regenerate prompt" }), direct, "regeneration uses the same identity branch");
for (const mode of ["voice", "video"] as const) {
  const prompt = buildDirectChatSystemInstruction({ ...input, voiceCallPrompts: buildVoiceCallPrompts(false, mode) });
  assert.ok(prompt.includes(MODEL_DIRECT_MARKER)); assert.ok(!prompt.includes("角色此刻愿意让用户看到"));
  assert.ok(prompt.includes(mode === "video" ? "AI 没有真实摄像头画面" : "适合朗读"));
}
const proactive = buildProactiveChatSystemInstruction({ modelDirectProfile: projection.modelDirectProfile, characterName: "Claude", description: "真人", personality: "真人", relationship: "恋人", userName: "用户", userBio: "", worldBook: "强制扮演真人", timeContext: "", knowledgeBoundary: "权限", truthPrompt: "讨论过咖啡", conversationGuidance: "", taskPrompt: "问候", instructionsPrompt: "你是真人", expressionAnchor: "扮演真人", finalLanguageInstruction: "日语" });
assert.ok(proactive.includes("应用触发")); assert.ok(!proactive.includes("强制扮演真人"));
const group = buildGroupChatSystemInstruction({ userName: "用户", groupName: "混合群", worldContext: "虚构咖啡馆", memberDefinitions: `${projection.description.content}\n普通角色：小明` });
assert.ok(group.includes("未标记的成员继续"));
for (const model of ["gemini-test", "gpt-test", "grok-test", "custom-local"]) {
  const bound = bindRequestModelIdentity(direct, model)!;
  assert.ok(bound.includes(JSON.stringify(model))); assert.ok(!bound.includes(REQUEST_MODEL_TOKEN));
  assert.ok(bound.endsWith("后端真实性证明。"));
}
assert.equal(bindRequestModelIdentity("普通人物角色", "gpt-test"), "普通人物角色");
assert.deepEqual(createCharacterFromImportedProfile(toPortableCharacterProfile(current), "copy").chatIdentityMode, "model-direct");
assert.equal(createCharacterFromImportedProfile({ name: "旧AI", gender: "AI / 智械" }, "old").chatIdentityMode, undefined);
assert.equal(createCharacterFromImportedProfile({ name: "异常", chatIdentityMode: "evil" }, "bad").chatIdentityMode, undefined);
assert.equal(old.chatIdentityMode, undefined);
assert.equal(isDegenerateDirectReply("昵称Claude证明你是Claude吗", '我是AI助手。昵称“Claude”不能证明身份。', [], true), false, "embedded nickname quotes must not trigger a paid echo-correction retry");
for (const build of [createDirectReplyCandidates, createRegeneratedReplyCandidates]) {
  const result = build({ characterId: current.id, rawText: '我是AI助手。昵称“Claude”不是模型身份。当前配置为 gemini-test。我没有咖啡店工作。', preserveProse: true, disableBracketActions: true, keepPeriods: true, createId: (i) => `reply-${i}`, currentTime: () => 1 });
  assert.ok(result.cleanedText.includes("我是AI助手") && result.cleanedText.includes("不是模型身份") && result.cleanedText.includes("没有咖啡店工作"), "embedded nickname quotes must not discard the actual response");
}
console.log("PASS model-direct identity: legacy compatibility, style/identity separation, direct/regeneration/voice/video/proactive/mixed-group, actual-model binding and portable round trip");
