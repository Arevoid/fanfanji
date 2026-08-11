import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assemblePromptBlocks } from "../src/domain/prompt/PromptBlock";
import { CHARACTER_LANGUAGE_POLICY, CHARACTER_PERSONA_PROTECTION, projectCharacterPrompt } from "../src/domain/prompt/characterPromptProjector";
import { assembleChatInstructions } from "../src/features/chat/prompts/chatInstructionAssembler";
import { WORLD_BOOK_CONTEXT_PRIORITY } from "../src/features/chat/prompts/chatPromptPolicy";
import { buildWorldBookSystemBlocks } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

const personality = "热情话痨活泼的大学生妹妹，特别喜欢 user 这个漂亮大姐姐，总是亲昵地叫个不停。";
const projection = projectCharacterPrompt({
  id: "character-a",
  name: "许妍",
  age: 20,
  gender: "女",
  mbti: "ENFP",
  personality,
  backstory: "在大学读书，有稳定的校园生活。",
}, "friend");

assert.doesNotMatch(projection.description.content, new RegExp(personality), "description must not duplicate personality");
assert.match(projection.personality.content, new RegExp(personality), "personality must be preserved verbatim");
assert.match(projection.personality.content, /不得因为“自然”“简短”或“活人感”而变得冷淡|不得无故变成冷淡、敷衍/);
assert.match(projection.relationship?.content || "", /不得因默认状态为 friend 而削弱/);
assert.match(CHARACTER_PERSONA_PROTECTION, /角色卡的明确设定为准/);
assert.match(CHARACTER_LANGUAGE_POLICY, /明确指定.*说话语言/);
assert.match(CHARACTER_LANGUAGE_POLICY, /日本角色默认使用日语/);
assert.match(CHARACTER_LANGUAGE_POLICY, /才默认使用简体中文/);

const assembled = assemblePromptBlocks([
  projection.description,
  projection.personality,
  projection.relationship!,
  { ...projection.personality, id: "duplicate-personality" },
]);
assert.equal(assembled.systemInstruction.split(personality).length - 1, 1, "personality must be injected exactly once");
assert.deepEqual(assembled.diagnostics.duplicateSourceIds, [projection.personality.sourceId]);
assert.ok(assembled.diagnostics.estimatedTokens > 0);

const exactContentDuplicate = assemblePromptBlocks([
  projection.description,
  { id: "same-content", kind: "context", content: projection.description.content },
]);
assert.deepEqual(exactContentDuplicate.diagnostics.duplicateContentBlockIds, ["same-content"]);

const chatAssembly = assembleChatInstructions([
  projection.description.content,
  projection.personality.content,
  projection.personality.content,
  WORLD_BOOK_CONTEXT_PRIORITY,
], [projection.description, projection.personality]);
assert.equal(chatAssembly.systemInstruction.split(personality).length - 1, 1, "chat assembly must inject personality once");
assert.match(chatAssembly.systemInstruction, /WORLD BOOK CONTEXT RULES/);

const longTailProfile = `${"前置资料。".repeat(500)}\n[与 user 的相处方式] 线上会黏着 user 直球说话，绝不使用陌生人的万能问候。`;
const fullProjection = projectCharacterPrompt({
  id: "character-b",
  name: "步随影",
  age: 20,
  gender: "男",
  mbti: "",
  personality: longTailProfile,
  backstory: "",
}, "partner");
assert.match(fullProjection.personality.content, /线上会黏着 user 直球说话/, "the imported role card must not be truncated");

const entry = (id: string, title: string, triggerType: WorldBookEntry["triggerType"]): WorldBookEntry => ({
  id,
  title,
  category: "角色设定",
  content: `${title} 内容`,
  triggerType,
  characterId: "character-a",
  isActive: true,
  timestamp: 1,
});

const blocks = buildWorldBookSystemBlocks([
  entry("identity", "核心身份与关系", "constant"),
  entry("place", "第三食堂", "keys"),
], "character-a", "你好", { scenario: "chat", characterId: "character-a" });
assert.match(blocks.formattedAll, /核心身份与关系/, "persistent identity entries must be available for a short opening");
assert.doesNotMatch(blocks.formattedAll, /第三食堂/, "unrelated entries must stay topic-triggered");

const matchedBlocks = buildWorldBookSystemBlocks([
  entry("place", "第三食堂", "keys"),
], "character-a", "要不要去第三食堂", { scenario: "chat", characterId: "character-a" });
assert.match(matchedBlocks.formattedAll, /第三食堂/, "keyword entries must activate from recent context");

const chatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const chatPromptBuilderSource = readFileSync(new URL("../src/features/chat/prompts/chatPromptBuilders.ts", import.meta.url), "utf8");
const messagePromptSerializerSource = readFileSync(new URL("../src/features/chat/prompts/messagePromptSerializer.ts", import.meta.url), "utf8");
assert.match(chatSource, /projectCharacterPrompt\(activeCharacter, activeRelationship\?\.relationship\)/);
assert.match(chatPromptBuilderSource, /assembleChatInstructions\(input\.instructions/);
assert.match(chatSource, /slice\(-10\)/, "World Book activation must scan roughly ten recent messages");
assert.doesNotMatch(chatSource, /buildStableRoleAnchor/);
assert.doesNotMatch(chatSource, /includeAllVisibleEntries: true/, "direct chat must not inject every visible World Book entry");
assert.doesNotMatch(chatSource, /Do not force warmth/, "base chat prompt must not bias every role toward coldness");
assert.doesNotMatch(chatSource, /Keep replies concise, warm/, "proactive chat must not force a warm and brief persona");
assert.doesNotMatch(chatSource, /温暖、有爱的微信回复|假设 you 听到了我用温暖/, "media events must not force warmth or invent voice tone");
assert.match(messagePromptSerializerSource, /MEDIA_EVENT_PERSONA_RESPONSE_RULE/);
assert.match(chatSource, /projectCharacterPrompt\(friend, relationship\.relationship\)/, "proactive chat must use the same character projection");
assert.doesNotMatch(chatSource, /Absolute Supreme Priority|removeLegacyWorldBookPriorityDirective/);
assert.match(chatSource, /WORLD_BOOK_CONTEXT_PRIORITY/);
assert.doesNotMatch(chatSource, /Speak in Chinese/, "character-facing generation must not force every role to use Chinese");
assert.match(chatSource, /CHARACTER_LANGUAGE_POLICY/, "moment comments must follow the same character language policy");
assert.match(chatPromptBuilderSource, /CHARACTER_LANGUAGE_POLICY/, "group members must keep their individual languages");

console.log("PASS chat prompt projection, deduplication, persona protection, and World Book relevance");
