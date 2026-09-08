import assert from "node:assert/strict";
import type { Message, OfflineStory } from "../src/types";

const values = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => { values.clear(); },
      key: () => null,
      get length() { return values.size; },
    },
  },
});

const { captureOfflineStoryCompletedEvent } = await import("../src/features/characterLife/services/offlineStoryEventCaptureService");
const { loadCharacterEvents, retractByOfflineStoryIds } = await import("../src/core/storage/repositories/characterEventRepository");
const { storageKeys } = await import("../src/core/storage/storageKeys");

const sourceMessage = (sender: Message["sender"], content: string): Message => ({
  id: `${sender}-${content}`,
  characterId: "character-1",
  sender,
  content,
  timestamp: 1,
  isOffline: true,
});

const story = (id: string, relationId = "relation-1", overrides: Partial<OfflineStory> = {}): OfflineStory => ({
  id,
  characterId: "character-1",
  relationId,
  characterIds: ["character-1"],
  title: "This title must not enter the event summary",
  createdAt: 1,
  updatedAt: 2,
  archivedAt: 3,
  mode: "continue",
  messages: [],
  ...overrides,
});

const capture = (currentStory: OfflineStory, userIdentityId = "identity-1", confirmedFacts?: readonly string[]) =>
  captureOfflineStoryCompletedEvent({
    story: currentStory,
    userIdentityId,
    sourceMessages: [sourceMessage("user", "Confirmed continuation"), sourceMessage("character", "Acknowledged")],
    userConfirmed: true,
    confirmedFacts,
    recordedAt: 4,
  });

const first = capture(story("story-1"));
assert.equal(first.created, true, "allowed story creates an event");
let events = loadCharacterEvents().value;
assert.equal(events.length, 1);
assert.equal(events[0].summary, "用户与角色完成了一次已确认的线下互动剧情。");
assert.equal(events[0].source, "offline_story:story-1:completed");
assert.equal(events[0].summary.includes("This title"), false);

assert.equal(capture(story("if-story", "relation-1", { mode: "if" })).created, false, "IF is rejected");
assert.equal(capture(story("director-story", "relation-1", { mode: "director" })).created, false, "director is rejected");
assert.equal(capture(story("story-1")).created, false, "same completion does not duplicate");
assert.equal(capture(story("story-2")).created, true, "different story creates a separate event");
assert.equal(capture(
  story("story-factual"),
  "identity-1",
  ["用户接受了范千的表白，双方正式确立恋爱关系。", "范千带炸鸡去了用户家。"],
).created, true, "accepted Truth facts create a factual completion event");
assert.equal(capture(story("story-a", "relation-a"), "identity-a").created, true, "different relation remains isolated");

events = loadCharacterEvents().value;
assert.equal(events.length, 4, "only eligible, unique stories are written");
assert.match(
  events.find((event) => event.source === "offline_story:story-factual:completed")?.summary || "",
  /正式确立恋爱关系.*范千带炸鸡去了用户家/,
  "private cognitive consumers receive the confirmed plot facts instead of a generic completion marker",
);
assert.deepEqual(events.filter((event) => event.relationId === "relation-1").map((event) => event.id).sort(), [
  "character-event:relation-1:offline_story:story-1:completed",
  "character-event:relation-1:offline_story:story-2:completed",
  "character-event:relation-1:offline_story:story-factual:completed",
]);
assert.equal(events.filter((event) => event.relationId === "relation-a").length, 1);
assert.equal(retractByOfflineStoryIds(["story-1"]).success, true);
assert.equal(loadCharacterEvents().value.find((event) => event.source === "offline_story:story-1:completed")?.status, "retracted");

values.delete(storageKeys.characterEvents);
console.log("offline story event capture tests passed");
