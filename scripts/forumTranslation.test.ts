import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deleteForumTranslationForReply,
  getForumTranslation,
  loadForumTranslations,
} from "../src/core/storage/repositories/forumTranslationRepository";
import { translateForumContent } from "../src/features/forum/services/forumTranslationService";
import type { UserSettings } from "../src/types";

const values = new Map<string, string>();
const localStorageStub = {
  get length() { return values.size; }, getItem: (key: string) => values.get(key) ?? null,
  key: (index: number) => [...values.keys()][index] ?? null, removeItem: (key: string) => { values.delete(key); },
  setItem: (key: string, value: string) => { values.set(key, String(value)); },
};
Object.defineProperty(globalThis, "window", { value: { localStorage: localStorageStub }, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: localStorageStub, configurable: true });

const settings = { apiKey: "test-key", selectedModel: "test-model" } as UserSettings;
let calls = 0;
const fakeTranslate = async (params: { text: string; targetLanguage?: string; proxyOnly?: boolean }) => {
  calls += 1;
  assert.equal(params.proxyOnly, true);
  assert.equal(params.targetLanguage, "en");
  assert.doesNotMatch(params.text, /relationId|Memory|WorldBook|privateAuthor/i);
  return { text: "[FORUM_TITLE]Translated title\n[FORUM_BODY]Translated body" };
};

const base = {
  ownerIdentityId: "identity-a", contentType: "thread" as const, contentId: "thread-a",
  title: "原始标题", body: "原始正文", targetLanguage: "en", settings, now: 100,
  translate: fakeTranslate as never,
};
const first = await translateForumContent(base);
assert.equal(first.translatedTitle, "Translated title");
assert.equal(first.translatedBody, "Translated body");
const second = await translateForumContent({ ...base, now: 200 });
assert.equal(calls, 1, "same hash and target language reuses the cache");
assert.equal(second.translatedBody, "Translated body");
await translateForumContent({ ...base, body: "修改后的正文", now: 300 });
await translateForumContent({ ...base, targetLanguage: "ja", now: 400, translate: async () => ({ text: "訳文" }) as never });
assert.equal(calls, 2, "changed source invalidates the old cache");
assert.equal(loadForumTranslations().value.length, 3, "different language uses a different cache entry");

const reply = await translateForumContent({
  ownerIdentityId: "identity-a", contentType: "reply", contentId: "reply-a", body: "公开回复", targetLanguage: "en", settings, now: 500,
  translate: async () => ({ text: "Public reply" }) as never,
});
assert.equal(reply.translatedBody, "Public reply");
assert.equal(deleteForumTranslationForReply("identity-a", "reply-a").success, true);
assert.equal(loadForumTranslations().value.some((entry) => entry.contentId === "reply-a"), false);
assert.equal(getForumTranslation({
  ownerIdentityId: "identity-b", contentType: "thread", contentId: "thread-a",
  sourceContentHash: first.sourceContentHash, targetLanguage: "en",
}), undefined, "translations are identity isolated");

const settingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(settingsSource, /"phone_forum_translations"/);
const helperSource = readFileSync(new URL("../src/utils/apiHelper.ts", import.meta.url), "utf8");
assert.match(helperSource, /proxyOnly/);
console.log("PASS forum translations cache, identity isolation, invalidation, deletion, and proxy-only boundary");
