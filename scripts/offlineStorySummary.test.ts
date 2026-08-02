import assert from "node:assert/strict";
import {
  filterOfflineExtractedFacts,
  getMemoryDisplayContent,
  getOfflineStorySummaryMarker,
  isOfflineStoryHandoffMemory,
  sanitizeOfflineMemoryForOnlineUse,
} from "../src/domain/memory/offlineMemorySync";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character, MemoryItem, Message, OfflineStory } from "../src/types";

const character: Character = { id: "character-a", name: "角色A", avatar: "", personality: "", backstory: "" };
const story: OfflineStory = {
  id: "story-summary-a",
  characterId: character.id,
  relationId: "relation-a",
  title: "线下续写",
  createdAt: 1,
  updatedAt: 2,
  mode: "continue",
  sourceChatId: character.id,
  messages: [{
    id: "message-a",
    characterId: character.id,
    relationId: "relation-a",
    sender: "user",
    content: "明天一起通话。",
    timestamp: 2,
  } satisfies Message],
};

const legacy: MemoryItem = {
  id: "legacy-handoff",
  characterId: character.id,
  relationId: "relation-a",
  content: "【线下剧本《线下续写》线上交接】\n[offline-story:story-summary-a:0-1]\n- 线下剧本《线下续写》已结束，双方有过线下互动；具体动作、场景和演出对白不作为线上记忆。",
  timestamp: 3,
};

const canonicalMarker = getOfflineStorySummaryMarker(story);
const confirmedStoryMessages: Message[] = [
  {
    id: "character-chicken",
    characterId: character.id,
    relationId: story.relationId,
    sender: "character",
    content: "范千带着一袋炸鸡来到用户家中，两人一起吃了炸鸡。",
    timestamp: 10,
  },
  {
    id: "user-preference",
    characterId: character.id,
    relationId: story.relationId,
    sender: "user",
    content: "我喜欢这个炸鸡的味道。",
    timestamp: 11,
  },
  {
    id: "character-confession",
    characterId: character.id,
    relationId: story.relationId,
    sender: "character",
    content: "范千向用户告白并询问是否愿意成为恋人。",
    timestamp: 12,
  },
  {
    id: "user-acceptance",
    characterId: character.id,
    relationId: story.relationId,
    sender: "user",
    content: "我同意了，男朋友。",
    timestamp: 13,
  },
  {
    id: "relationship-intimacy",
    characterId: character.id,
    relationId: story.relationId,
    sender: "user",
    content: "用户与范千在双方自愿的情况下发生了性关系。",
    timestamp: 14,
  },
];
const confirmedStory: OfflineStory = { ...story, messages: confirmedStoryMessages };
const tests: Array<[string, () => void | Promise<void>]> = [
  ["A canonical marker remains stable across incremental message counts", () => {
    assert.equal(canonicalMarker, getOfflineStorySummaryMarker({ ...story, messages: [...story.messages, { ...story.messages[0], id: "message-b" }] }));
  }],
  ["B legacy range marker is recognized as this story's replaceable handoff", () => {
    assert.equal(isOfflineStoryHandoffMemory(legacy, story), true);
  }],
  ["C ambiguous pronoun-only extraction cannot create a memory", async () => {
    const result = await MemoryService.extractMemories({
      character,
      characterId: character.id,
      relationId: story.relationId,
      recentMessages: story.messages,
      existingMemories: [],
      scenario: "offline",
      apiKey: "",
      model: "",
      filterItems: filterOfflineExtractedFacts,
      createId: () => "ambiguous",
      currentTime: () => 4,
      formatContent: (items) => items.join("\n"),
    }, async () => ({ items: ["我答应明天陪你。"] }));
    assert.equal(result.extractedMemories.length, 0);
  }],
  ["D confirmed third-person facts produce a canonical summary", async () => {
    const result = await MemoryService.extractMemories({
      character,
      characterId: character.id,
      relationId: story.relationId,
      recentMessages: story.messages,
      existingMemories: [],
      scenario: "offline",
      apiKey: "",
      model: "",
      filterItems: filterOfflineExtractedFacts,
      createId: () => "summary",
      currentTime: () => 4,
      formatContent: (items) => `【线下剧情摘要】\n${items.map((item) => `- ${item}`).join("\n")}\n[${canonicalMarker}]`,
    }, async () => ({ items: ["用户与角色A约定明天通话。"] }));
    assert.equal(result.extractedMemories.length, 1);
    assert.ok(result.extractedMemories[0]?.content.includes(canonicalMarker));
  }],
  ["E replacing handoffs removes all legacy batches for the same story", () => {
    const replacement: MemoryItem = {
      id: "summary",
      characterId: character.id,
      relationId: story.relationId,
      content: `【线下剧情摘要】\n[${canonicalMarker}]\n- 用户与角色A约定明天通话。`,
      timestamp: 4,
    };
    const retained = [legacy, { ...legacy, id: "other-story", content: "[offline-story:other:summary]" }]
      .filter((memory) => !isOfflineStoryHandoffMemory(memory, story));
    const next = MemoryService.mergeMemories(retained, [replacement]);
    assert.deepEqual(next.map((memory) => memory.id), ["summary", "other-story"]);
  }],
  ["F confirmed continuation stores concise normalized key events from both speakers", async () => {
    const candidates = [
      {
        statement: "范千带炸鸡来到用户家中，两人一起吃了炸鸡。",
        kind: "fact" as const,
        subject: "relationship" as const,
        temporalStatus: "past" as const,
        sourceMessageIds: ["character-chicken"],
        evidenceQuote: confirmedStoryMessages[0].content,
      },
      {
        statement: "用户明确表示喜欢范千带来的炸鸡口味。",
        kind: "preference" as const,
        subject: "user" as const,
        temporalStatus: "timeless" as const,
        sourceMessageIds: ["user-preference"],
        evidenceQuote: confirmedStoryMessages[1].content,
      },
      {
        statement: "范千向用户告白，用户接受告白，两人确认恋爱关系。",
        kind: "fact" as const,
        subject: "relationship" as const,
        temporalStatus: "present" as const,
        sourceMessageIds: ["character-confession", "user-acceptance"],
        evidenceQuote: confirmedStoryMessages[3].content,
      },
      {
        statement: "用户与范千在双方自愿的情况下发生了性关系。",
        kind: "fact" as const,
        subject: "relationship" as const,
        temporalStatus: "past" as const,
        sourceMessageIds: ["relationship-intimacy"],
        evidenceQuote: confirmedStoryMessages[4].content,
      },
    ];
    const result = await MemoryService.extractMemories({
      character: { ...character, name: "范千" },
      characterId: character.id,
      relationId: story.relationId,
      userIdentityId: "identity-a",
      conversationId: "direct:relation-a",
      recentMessages: confirmedStoryMessages,
      existingMemories: [],
      scenario: "offline",
      apiKey: "",
      model: "",
      filterItems: filterOfflineExtractedFacts,
      offlineStoryPolicyInput: { story: confirmedStory, userConfirmed: true, sourceMessages: confirmedStoryMessages },
      createId: () => "confirmed-summary",
      currentTime: () => 15,
      formatContent: (items) => `【关键剧情归档】\n${items.map((item) => `- ${item}`).join("\n")}\n[${canonicalMarker}]`,
    }, async () => ({ candidates }));

    assert.equal(result.acceptedClaims.length, 4);
    assert.ok(result.acceptedClaims.every((claim) => claim.truthStatus === "confirmed" && claim.userConfirmed));
    assert.equal(result.extractedMemories.length, 1);
    const content = result.extractedMemories[0].content;
    assert.match(content, /范千带炸鸡来到用户家中/);
    assert.match(content, /用户明确表示喜欢范千带来的炸鸡口味/);
    assert.match(content, /两人确认恋爱关系/);
    assert.match(content, /双方自愿的情况下发生了性关系/);
    assert.doesNotMatch(content, /我同意了/);
    assert.doesNotMatch(getMemoryDisplayContent(content), /offline-story:/);
  }],
  ["G unconfirmed offline story cannot promote model narration to memory", async () => {
    const result = await MemoryService.extractMemories({
      character: { ...character, name: "范千" },
      characterId: character.id,
      relationId: story.relationId,
      userIdentityId: "identity-a",
      conversationId: "direct:relation-a",
      recentMessages: confirmedStoryMessages,
      existingMemories: [],
      scenario: "offline",
      apiKey: "",
      model: "",
      filterItems: filterOfflineExtractedFacts,
      offlineStoryPolicyInput: { story: confirmedStory, userConfirmed: false, sourceMessages: confirmedStoryMessages },
      createId: () => "unconfirmed-summary",
      currentTime: () => 16,
      formatContent: (items) => items.join("\n"),
    }, async () => ({ candidates: [{
      statement: "范千带炸鸡来到用户家中。",
      kind: "fact",
      subject: "relationship",
      temporalStatus: "past",
      sourceMessageIds: ["character-chicken"],
      evidenceQuote: confirmedStoryMessages[0].content,
    }] }));
    assert.equal(result.acceptedClaims.length, 0);
    assert.equal(result.extractedMemories.length, 0);
  }],
  ["H delicate template displays character diary voice without changing factual ownership", async () => {
    const objectiveStatement = "范千向用户告白，用户接受告白，两人确认恋爱关系。";
    const diaryText = "我今天去{{user}}家时，终于把那句告白说出口了。{{user}}答应做我女朋友——啧，算她有眼光。";
    const result = await MemoryService.extractMemories({
      character: { ...character, name: "范千", personality: "嘴硬心软，说话直接。", archiveTemplateType: "delicate" },
      characterId: character.id,
      relationId: story.relationId,
      userIdentityId: "identity-a",
      conversationId: "direct:relation-a",
      recentMessages: confirmedStoryMessages,
      existingMemories: [],
      scenario: "offline",
      apiKey: "",
      model: "",
      templateType: "delicate",
      filterItems: filterOfflineExtractedFacts,
      offlineStoryPolicyInput: { story: confirmedStory, userConfirmed: true, sourceMessages: confirmedStoryMessages },
      createId: () => "delicate-summary",
      currentTime: () => 17,
      formatContent: (items, options) => `【心境归档】\n${(options?.displayItems || items).join("\n\n")}`,
    }, async (params) => {
      assert.equal(params.templateType, "delicate");
      assert.match(params.characterProfile || "", /嘴硬心软/);
      return { candidates: [{
        statement: objectiveStatement,
        memoryText: diaryText,
        kind: "fact",
        subject: "relationship",
        temporalStatus: "present",
        sourceMessageIds: ["character-confession", "user-acceptance"],
        evidenceQuote: confirmedStoryMessages[3].content,
      }] };
    });

    assert.equal(result.acceptedClaims[0]?.statement, objectiveStatement, "truth storage remains objective and actor-safe");
    assert.match(result.extractedMemories[0]?.content || "", /我今天去\{\{user\}\}家/);
    assert.match(result.extractedMemories[0]?.content || "", /算她有眼光/);
    assert.doesNotMatch(result.extractedMemories[0]?.content || "", /- 范千向用户告白/);
  }],
  ["I delicate offline storage shows diary while online recall uses objective fact index", () => {
    const stored = `【心境归档】\n我今天终于向{{user}}告白了，{{user}}答应了。\n[offline-story:${story.id}:summary]\n【事实索引（系统）】\n- 范千向用户告白，用户接受告白，两人确认恋爱关系。`;
    const displayed = getMemoryDisplayContent(stored);
    const recalled = sanitizeOfflineMemoryForOnlineUse(stored);
    assert.match(displayed, /我今天终于向\{\{user\}\}告白/);
    assert.doesNotMatch(displayed, /事实索引|范千向用户告白/);
    assert.match(recalled, /范千向用户告白，用户接受告白/);
    assert.doesNotMatch(recalled, /我今天终于/);
  }],
];

for (const [name, run] of tests) {
  await run();
  console.log(`PASS ${name}`);
}
console.log(`${tests.length} offline story summary checks passed`);
