import assert from "node:assert/strict";
import type { Message, OfflineStory } from "../src/types";
import { buildChatHistoryCandidates, searchChatHistory } from "../src/features/chat/services/chatHistorySearch";
import { createCallRecordMarkup } from "../src/features/chat/services/messageParser";
import { readChatTimelinePage, selectChatTimeline } from "../src/domain/chat/chatTimelineIndex";
const scope = { characterId: "c", relationId: "r", conversationId: "conv", userIdentityId: "u" };
const make = (id: string, content: string, patch: Partial<Message> = {}): Message => ({ ...scope, id, content, sender: "user", timestamp: 1000, ...patch });
const records = [make("old", "千条消息前的生日约定"), ...Array.from({ length: 10_000 }, (_, i) => make(`noise-${i}`, `普通消息 ${i}`, { timestamp: 2000 + i })),
  make("sticker", "[表情]|快乐猫猫|sticker://secret-id"), make("image", "data:image/png;base64,DO_NOT_INDEX_BINARY"),
  make("call", createCallRecordMarkup({ callType: "语音通话", status: "completed", direction: "outgoing", duration: "01:00", transcript: [{ id: "turn", sender: "user", content: "电话里说了晚安", timestamp: 1000 }] })),
  make("removed", "撤回前的秘密", { recalledAt: 2000 }), make("foreign", "另一段关系的生日秘密", { relationId: "foreign" }),
  make("foreign-character", "错误角色的生日秘密", { characterId: "foreign" }), make("foreign-conv", "另一会话的生日秘密", { conversationId: "foreign" })];
const story = { id: "story", ...scope, ownerIdentityId: "u", title: "湖边散步", messages: [make("offline-source", "在线下约定看日出", { isOffline: true }), make("import", "导入原文不重复出现", { isImportedContext: true })] } as unknown as OfflineStory;
const entries = buildChatHistoryCandidates(records, [story, { ...story, id: "other-owner", ownerIdentityId: "foreign" }, { ...story, id: "other-role", relationId: "foreign" }], scope);
const find = async (query: string, category: Parameters<typeof searchChatHistory>[1]["category"] = "all") => searchChatHistory(entries, { query, category });
assert.deepEqual((await find("生日")).results.map(r => r.messageId), ["old"]);
assert.equal((await find("晚安", "call")).results[0]?.messageId, "call");
assert.equal((await find("猫猫", "sticker")).results.length, 1);
assert.equal((await find("DO_NOT_INDEX_BINARY")).results.length, 0);
assert.equal((await find("secret-id")).results.length, 0);
assert.equal((await find("撤回前")).results.length, 0);
assert.equal((await find("日出", "offline")).results[0]?.storyId, "story");
assert.equal((await find("导入原文")).results.length, 0);
const page = await find(""); assert.equal(page.results.length, 50); assert.equal(page.hasMore, true);
const next = await searchChatHistory(entries, { query: "", category: "all", before: page.cursor });
assert.equal(next.results.some(result => page.results.some(previous => previous.key === result.key)), false);
const abort = new AbortController(); abort.abort(); await assert.rejects(searchChatHistory(entries, { query: "absent", category: "all", signal: abort.signal }), { name: "AbortError" });
const selected = selectChatTimeline(records, scope);
assert.equal(selectChatTimeline(records, scope), selected, "same immutable version and scope reuses its indexed view");
assert.equal(selected.some(row => row.id.startsWith("foreign")), false);
const first = readChatTimelinePage(selected, { limit: 50 });
const changed = [...selected.filter(message => message.id !== first.items.at(-1)?.id), make("new", "新消息", { timestamp: 50_000 })];
const older = readChatTimelinePage(changed, { limit: 50, before: first.cursor });
assert.equal(older.items.some(row => first.items.some(original => original.id === row.id)), false, "cursor is stable after append/delete");
const edited = records.map(row => row.id === "old" ? { ...row, content: "已修改为新的约定" } : row);
assert.equal((await searchChatHistory(buildChatHistoryCandidates(edited, [], scope), { query: "生日", category: "all" })).results.length, 0);
console.log("PASS 10,000-message indexed history: all six categories, old-source search, scope/privacy, recalled/edit/delete, stable cursors, bounded results and cancellation");
