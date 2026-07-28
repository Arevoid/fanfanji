import assert from "node:assert/strict";
import { buildCharacterExport, characterExportFilename } from "../src/features/archives/characterExport";

const character = { id: "char-a", name: "祁澈", avatar: "avatar", personality: "克制", backstory: "背景", greeting: "你好", album: [], references: [] };
const entries = [
  { id: "bound", characterId: "char-a", title: "专属设定", category: "祁澈世界书", content: "只属于祁澈", timestamp: 1, keywords: "祁澈,基地", isActive: true, triggerType: "keys" as const },
  { id: "other", characterId: "char-b", title: "其他角色", category: "其他", content: "不应导出", timestamp: 1 },
  { id: "global", characterId: "global", title: "全局", category: "全局", content: "不应导出", timestamp: 1 },
];

const withBook = buildCharacterExport(character, entries, true);
assert.equal(withBook.spec, "chara_card_v2");
assert.equal(withBook.data.extensions.fanfanji.character.id, "char-a");
assert.deepEqual(Object.keys(withBook.data.character_book?.entries || {}), ["0"]);
assert.equal(withBook.data.character_book?.entries?.["0"].content, "只属于祁澈");
assert.equal("character_book" in buildCharacterExport(character, entries, false).data, false);
assert.equal(characterExportFilename('祁/澈'), "祁_澈-角色卡.json");

console.log("character export tests passed");
