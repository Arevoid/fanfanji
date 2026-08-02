import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import {
  buildKnowledgeExtractionPrompt,
  parseKnowledgeExtractionOutput,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import type { Character, Message } from "../src/types";

const character: Character = { id: "character-shared", name: "A", avatar: "", personality: "", backstory: "" };
const userMessage: Message = {
  id: "user-plan",
  characterId: character.id,
  relationId: "relation-a",
  conversationId: "direct:relation-a",
  sender: "user",
  content: "以后我们一起去日本。",
  timestamp: 1,
};
const characterMessage: Message = {
  id: "character-fiction",
  characterId: character.id,
  relationId: "relation-a",
  conversationId: "direct:relation-a",
  sender: "character",
  content: "我们去年在海边结婚了。",
  timestamp: 2,
};

const payload = (overrides: Record<string, unknown> = {}) => ({
  statement: "用户计划和角色一起去日本。",
  kind: "plan",
  subject: "relationship",
  temporalStatus: "future",
  sourceMessageIds: [userMessage.id],
  evidenceQuote: userMessage.content,
  ...overrides,
});

const prompt = buildKnowledgeExtractionPrompt({ characterName: character.name, history: [
  { id: userMessage.id, role: "user", text: userMessage.content },
  { id: characterMessage.id, role: "model", text: characterMessage.content },
] });
assert.match(prompt, /messageId="user-plan"/);
assert.match(prompt, /evidenceQuote/);
assert.match(prompt, /plan \+ future/);

const offlinePrompt = buildKnowledgeExtractionPrompt({
  characterName: "范千",
  scenario: "offline",
  history: [
    { id: "offline-character", role: "model", text: "范千带炸鸡来到用户家中。" },
    { id: "offline-user", role: "user", text: "我同意了，男朋友。" },
  ],
});
assert.match(offlinePrompt, /user 和 character 两侧消息/);
assert.match(offlinePrompt, /关系状态变化/);
assert.match(offlinePrompt, /角色名“范千”固定主体/);
assert.match(offlinePrompt, /简洁非露骨表述/);
assert.match(offlinePrompt, /1 至 8 条/);

const delicatePrompt = buildKnowledgeExtractionPrompt({
  characterName: "范千",
  characterProfile: "嘴硬心软，说话直接。",
  templateType: "delicate",
  scenario: "offline",
  history: [{ id: "diary-source", role: "user", text: "我同意做你女朋友。" }],
});
assert.match(delicatePrompt, /每条 JSON 必须增加 "memoryText"/);
assert.match(delicatePrompt, /用户做的事写“\{\{user\}\}”/);
assert.match(delicatePrompt, /绝对不能互换行为、台词、感受或决定的归属/);
assert.match(delicatePrompt, /嘴硬心软，说话直接/);
assert.match(delicatePrompt, /关键事件.*情感转折.*重要信息/);

const parsed = parseKnowledgeExtractionOutput([
  JSON.stringify(payload()),
  JSON.stringify(payload({ sourceMessageIds: ["foreign-message"] })),
  "* legacy prose must be rejected",
].join("\n"), new Set([userMessage.id, characterMessage.id]));
assert.equal(parsed.length, 1);
assert.deepEqual(parsed[0]?.sourceMessageIds, [userMessage.id]);

const baseContext = {
  character,
  characterId: character.id,
  relationId: "relation-a",
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
  recentMessages: [userMessage, characterMessage],
  existingMemories: [],
  scenario: "chat" as const,
  apiKey: "test",
  model: "test",
  createId: () => "extraction-1",
  currentTime: () => 100,
  formatContent: (items: readonly string[]) => items.join("\n"),
};

const trusted = await MemoryService.extractMemories(baseContext, async () => ({ items: [payload()] }));
assert.equal(trusted.acceptedClaims.length, 1);
assert.equal(trusted.acceptedClaims[0]?.truthStatus, "asserted");
assert.equal(trusted.acceptedClaims[0]?.kind, "plan");
assert.equal(trusted.acceptedClaims[0]?.temporalStatus, "future");
assert.equal(trusted.acceptedClaims[0]?.statement, userMessage.content, "verified user evidence is authoritative over AI paraphrase");
assert.deepEqual(trusted.extractedMemories[0]?.sourceKnowledgeClaimIds, [trusted.acceptedClaims[0]?.id]);

const inventedByCharacter = await MemoryService.extractMemories({ ...baseContext, createId: () => "extraction-2" }, async () => ({
  items: [payload({
    statement: "用户和角色去年在海边结婚。",
    kind: "fact",
    temporalStatus: "past",
    sourceMessageIds: [characterMessage.id],
    evidenceQuote: characterMessage.content,
  })],
}));
assert.equal(inventedByCharacter.acceptedClaims[0]?.truthStatus, "inferred");
assert.equal(inventedByCharacter.extractedMemories.length, 0, "character self-authored fiction cannot return to legacy Memory");

const fabricatedQuote = await MemoryService.extractMemories({ ...baseContext, createId: () => "extraction-3" }, async () => ({
  items: [payload({ evidenceQuote: "用户从未说过的内容" })],
}));
assert.equal(fabricatedQuote.acceptedClaims.length, 0, "a fabricated quote has no traceable evidence");
assert.equal(fabricatedQuote.extractedMemories.length, 0, "a fabricated quote cannot return to legacy Memory");

const invalidSource = await MemoryService.extractMemories({ ...baseContext, createId: () => "extraction-4" }, async () => ({
  items: [payload({ sourceMessageIds: ["other-relation-message"] })],
}));
assert.equal(invalidSource.acceptedClaims.length, 0);
assert.equal(invalidSource.rejectedCandidateCount, 1);
assert.equal(invalidSource.extractedMemories.length, 0);

console.log("PASS Character Truth structured extraction, exact provenance, plan semantics, and hallucination quarantine");
