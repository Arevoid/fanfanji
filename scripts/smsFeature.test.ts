import assert from "node:assert/strict";
import { createAnchoredSmsTimeline, createUnanchoredSmsTimeline } from "../src/features/sms/smsTimeline";
import { buildSmsSystemPrompt, selectSmsWorldBookEntries } from "../src/features/sms/smsPrompt";
import { getSmsPhone, loadSmsStore, saveSmsStore, upsertSmsPhone } from "../src/core/storage/repositories/smsRepository";
import { isSmsPhoneNumber, smsScopeKey, type SmsStore } from "../src/domain/sms/smsTypes";
import type { Character, UserIdentity, WorldBookEntry } from "../src/types";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });

assert.equal(isSmsPhoneNumber("1380000000000"), true);
assert.equal(isSmsPhoneNumber("13800000000"), false, "SMS phone numbers require 13 digits");
assert.equal(isSmsPhoneNumber("13800000000000"), false);

const identity: UserIdentity = { id: "identity-a", name: "饭饭", avatar: "🙂", signature: "", bio: "" };
const character: Character = { id: "character-a", name: "周树生", avatar: "🌱", personality: "谨慎、慢热", backstory: "现在是总裁，过去曾是学生。", remark: "周树生" };
const worldBook: WorldBookEntry[] = [{ id: "wb-a", title: "时间边界", content: "现在的身份不能倒灌到过去。", category: "general", timestamp: Date.now(), isActive: true, purpose: "persona_rule", characterId: character.id }];

let store: SmsStore = loadSmsStore().value;
store = upsertSmsPhone(store, identity.id, "1380000000000");
assert.equal(getSmsPhone(store, identity.id), "1380000000000");
assert.notEqual(smsScopeKey(identity.id, getSmsPhone(store, identity.id), character.id, "line-a"), smsScopeKey("identity-b", getSmsPhone(store, "identity-b"), character.id, "line-a"), "identities use separate storage scopes");
assert.equal(saveSmsStore(store).success, true);
assert.equal(loadSmsStore().value.phones.length, 1);

const explore = createUnanchoredSmsTimeline({ ownerIdentityId: identity.id, phoneNumber: "1380000000000", characterId: character.id });
assert.equal(explore.mode, "unanchored");
assert.equal(explore.knowsCurrentTimeline, false);
const future = createAnchoredSmsTimeline({ ownerIdentityId: identity.id, phoneNumber: "1380000000000", characterId: character.id, label: "独立未来", kind: "independent_future", timelineTime: "十年后", knowsCurrentTimeline: false });
assert.equal(future.mode, "anchored");
assert.equal(future.knowsCurrentTimeline, false);

const visibleWorldBook = selectSmsWorldBookEntries(worldBook, character.id, identity.id);
assert.equal(visibleWorldBook.length, 1);
const prompt = buildSmsSystemPrompt({ character, timeline: explore, activeIdentity: identity, worldBookEntries: visibleWorldBook });
assert.match(prompt, /未锚定探索模式优先保持陌生/);
assert.match(prompt, /不知道对方姓名/);
assert.match(prompt, /现在的身份不能倒灌到过去/);
assert.match(prompt, /不要读取、复述或暗示普通聊天/);
assert.doesNotMatch(prompt, /饭饭是我的恋人/);
assert.doesNotMatch(prompt, /饭饭/);

console.log("PASS SMS phone isolation, timeline modes, world-book boundaries, and stranger prompt");
