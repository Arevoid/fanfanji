import assert from "node:assert/strict";
import { buildCharacterExport, characterExportFilename, createCharacterFromImportedProfile, createCharacterFromRawDocument } from "../src/features/archives/characterExport";

const character = {
  id: "char-a",
  name: "祁澈",
  age: 28,
  gender: "男",
  mbti: "INTJ",
  avatar: "avatar",
  personality: "克制",
  backstory: "背景",
  replyLanguage: "Japanese",
  greeting: "你好",
  album: ["private-album"],
  references: [{ id: "private-reference", title: "聊天参考", content: "private-reference-content" }],
  remark: "chat-remark",
  isPinned: true,
  chatBg: "private-chat-background",
  momentsCover: "private-moments-cover",
  compressedMemory: "private-compressed-memory",
  enableAutoSummary: true,
  enableProactiveChat: true,
  customChatCSS: "private-chat-css",
  customChatIcons: { send: "private-chat-icon" },
  initialChatContext: "private-initial-context",
  initialChatMode: "context" as const,
  ownerIdentityId: "private-identity",
  isContactInstance: true,
  profileSourceId: "private-profile-source",
  minimaxVoiceId: "private-voice",
  mosslandVoiceId: "private-mossland-voice",
  imageReferenceAssetId: "private-image-asset",
};
const entries = [
  { id: "bound", characterId: "char-a", title: "专属设定", category: "祁澈世界书", content: "只属于祁澈", timestamp: 1, keywords: "祁澈,基地", isActive: true, triggerType: "keys" as const },
  { id: "other", characterId: "char-b", title: "其他角色", category: "其他", content: "不应导出", timestamp: 1 },
  { id: "global", characterId: "global", title: "全局", category: "全局", content: "不应导出", timestamp: 1 },
];

const withBook = buildCharacterExport(character, entries, true);
assert.equal(withBook.spec, "chara_card_v2");
assert.deepEqual(withBook.data.extensions.fanfanji.character, {
  name: "祁澈",
  age: 28,
  avatar: "avatar",
  gender: "男",
  mbti: "INTJ",
  personality: "克制",
  backstory: "背景",
  replyLanguage: "Japanese",
  greeting: "你好",
});
assert.deepEqual(Object.keys(withBook.data.character_book?.entries || {}), ["0"]);
assert.equal(withBook.data.character_book?.entries?.["0"].content, "只属于祁澈");
assert.equal("character_book" in buildCharacterExport(character, entries, false).data, false);
const serialized = JSON.stringify(withBook);
for (const privateValue of [
  "char-a",
  "private-album",
  "private-reference-content",
  "chat-remark",
  "private-chat-background",
  "private-moments-cover",
  "private-compressed-memory",
  "private-chat-css",
  "private-chat-icon",
  "private-initial-context",
  "private-identity",
  "private-profile-source",
  "private-voice",
  "private-mossland-voice",
  "private-image-asset",
]) {
  assert.equal(serialized.includes(privateValue), false, `export leaked non-persona value: ${privateValue}`);
}

const imported = createCharacterFromImportedProfile(character, "new-character");
assert.deepEqual(imported, {
  id: "new-character",
  name: "祁澈",
  age: 28,
  avatar: "avatar",
  gender: "男",
  mbti: "INTJ",
  personality: "克制",
  backstory: "背景",
  replyLanguage: "Japanese",
  greeting: "你好",
  album: [],
  references: [],
});
assert.equal(characterExportFilename('祁/澈'), "祁_澈-角色卡.json");

const rawText = "  姓名：完整姓名\n年龄：27\n性别：女\n↓世界书部分。\n规则：也不要拆分\n\n";
const rawDocument = createCharacterFromRawDocument(rawText, "完整角色.docx", "raw-character");
assert.equal(rawDocument.name, "完整姓名");
assert.equal(rawDocument.age, 27);
assert.equal(rawDocument.gender, "女");
assert.equal(rawDocument.personality, rawText, "TXT/DOCX source text must remain byte-for-byte unchanged after extraction");
assert.equal(rawDocument.backstory, "");
assert.deepEqual(rawDocument.references, []);

const markdownProfile = "解之遥-人设卡\n\n### 【基本信息】\n\n**姓名**：解之遥\n**性别**：男\n**年龄**：24岁\n\n其余原文必须完整保留。";
const markdownDocument = createCharacterFromRawDocument(markdownProfile, "解之遥-人设卡.docx", "markdown-character");
assert.equal(markdownDocument.name, "解之遥");
assert.equal(markdownDocument.age, 24);
assert.equal(markdownDocument.gender, "男");
assert.equal(markdownDocument.personality, markdownProfile);

console.log("character export tests passed");
