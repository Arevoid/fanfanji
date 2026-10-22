import type { Character, Message, OfflineStory, UserSettings } from "../../../types";
import { initializeCharacterRepository, saveCharacters, flushCharacters } from "../../../core/storage/repositories/characterRepository";
import { initializeMessages, saveMessages, flushMessages } from "../../../core/storage/repositories/messageRepository";
import { saveRelationships } from "../../../core/storage/repositories/relationshipRepository";
import { saveSettingsAsync } from "../../../core/storage/repositories/settingsRepository";
import { saveOfflineStories } from "../../../core/storage/repositories/offlineRepository";
import { readJson, writeJson } from "../../../core/storage/storageAdapter";
import { createCallRecordMarkup } from "../services/messageParser";

const prefix = "chat-perf-20261023", manifestKey = "chat_perf_synthetic_fixture_v1";
/** Dedicated dev-only origin. Never overwrites a real profile or imports a backup. */
export async function prepareChatPerformanceFixture(defaults: UserSettings) {
  if (location.hostname !== "127.0.0.3" || location.port !== "3103") throw Error("fixture_origin_rejected");
  const query = new URLSearchParams(location.search);
  const count = Math.max(1000, Math.min(10_000, Number(query.get("count")) || 10_000));
  if (readJson<{ count?: number }>(manifestKey, {}).value.count === count) return;
  const [characters, messages] = await Promise.all([initializeCharacterRepository([]), initializeMessages([])]);
  if (!characters.valid || !messages.valid || characters.value.some(value => !value.id.startsWith(prefix)) || messages.value.some(value => !value.id.startsWith(prefix))) throw Error("fixture_requires_empty_synthetic_origin");
  const now = Date.now(), characterId = `${prefix}-character`, relationId = `${prefix}-relation`, conversationId = `direct:${relationId}`;
  const scope = { characterId, relationId, conversationId };
  const avatar = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#dbeafe"/><text x="48" y="60" text-anchor="middle" font-size="36">验</text></svg>');
  const character: Character = { id: characterId, name: "性能验收角色", ownerIdentityId: "identity-1", syntheticFixtureId: prefix, avatar, personality: "仅用于隔离性能验收", backstory: "合成数据，无真实用户资料", chatHistoryPageSize: 50 };
  const rows: Message[] = Array.from({ length: count }, (_, i) => ({ ...scope, id: `${prefix}-message-${i}`, sender: i % 2 ? "character" : "user", authorIdentityId: i % 2 ? undefined : "identity-1",
    content: i === 13 ? "很久以前约好了生日一起看海" : `合成聊天第 ${i + 1} 条。这是一段用于滚动、分页和查找的普通文字。`, timestamp: now - (count - i) * 60_000 }));
  rows[20] = { ...rows[20], content: "[表情]|验收小猫|sticker://synthetic" };
  rows[21] = { ...rows[21], content: createCallRecordMarkup({ callType: "语音通话", status: "completed", direction: "outgoing", duration: "01:00", transcript: [{ id: "synthetic-turn", sender: "user", content: "电话里约好了去书店", timestamp: rows[21].timestamp }] }) };
  rows[22] = { ...rows[22], content: avatar };
  const offline: OfflineStory = { id: `${prefix}-story`, ...scope, ownerIdentityId: "identity-1", title: "合成线下散步", mode: "if", createdAt: now - 86400_000, updatedAt: now - 1000,
    messages: Array.from({ length: 140 }, (_, i) => ({ ...scope, id: `${prefix}-offline-${i}`, sender: i % 2 ? "character" : "user", content: i === 5 ? "山顶日出约定" : `合成线下片段 ${i}`, timestamp: now - (200 - i) * 60_000, isOffline: true })) };
  const settings = await saveSettingsAsync({ ...defaults, name: "隔离验收用户", avatar, activeIdentityId: "identity-1", identities: [{ id: "identity-1", rootIdentityId: "identity-1", kind: "primary", name: "隔离验收用户", avatar, bio: "合成性能验收资料", signature: "合成资料" }], apiKey: "", apiEndpoint: "", apiPresets: [] });
  if (!settings.success || !saveCharacters([character]).success || !saveRelationships([{ id: relationId, ...scope, userIdentityId: "identity-1", relationship: "friend", createdAt: now, updatedAt: now, syntheticFixtureId: prefix }]).success
    || !saveMessages(rows).success || !saveOfflineStories([offline]).success) throw Error("fixture_save_failed");
  if (!(await flushCharacters()).success || !(await flushMessages()).success) throw Error("fixture_flush_failed");
  writeJson(manifestKey, { synthetic: true, count, version: prefix });
}
