import assert from "node:assert/strict";
import type { StoryEventInput } from "../src/domain/forumStory/forumStoryTypes";

const values = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => { values.clear(); },
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  get length() { return values.size; },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: localStorageStub } });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorageStub });

const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");

const makeEvent = (storyId: string, id: string, occurredAt: number, storyVersion = 1): StoryEventInput => ({
  id,
  storyId,
  type: "story_progressed",
  source: "system",
  status: "confirmed",
  summary: `${storyId}:${id}`,
  storyVersion,
  occurredAt,
  createdAt: occurredAt,
  idempotencyKey: `${storyId}:${id}`,
});

const firstWrite = StoryEventRepository.appendEvent({ ...makeEvent("story-a", "event-1", 100), sequence: 99 });
assert.equal(firstWrite.success, true);
assert.equal(firstWrite.event?.sequence, 1, "repository must assign the first sequence");
assert.equal(firstWrite.event?.storyVersion, 1);

const secondWrite = StoryEventRepository.appendEvent({ ...makeEvent("story-a", "event-2", 100), sequence: 1 });
assert.equal(secondWrite.success, true);
assert.equal(secondWrite.event?.sequence, 2, "repository must ignore caller sequence");
assert.deepEqual(StoryEventRepository.listEvents("story-a").map((event) => event.sequence), [1, 2]);

const otherStoryWrite = StoryEventRepository.appendEvent(makeEvent("story-b", "event-1", 1));
assert.equal(otherStoryWrite.success, true);
assert.equal(otherStoryWrite.event?.sequence, 1, "each story has an independent sequence");
assert.deepEqual(StoryEventRepository.listEvents("story-b").map((event) => event.sequence), [1]);

const historyBeforeDuplicate = JSON.parse(JSON.stringify(StoryEventRepository.listEvents("story-a")));
assert.equal(StoryEventRepository.appendEvent({ ...makeEvent("story-a", "event-1", 101), summary: "tampered" }).success, false);
assert.deepEqual(StoryEventRepository.listEvents("story-a"), historyBeforeDuplicate, "duplicate events cannot modify history");

assert.equal(StoryEventRepository.appendEvent(makeEvent("story-a", "event-too-early", 99)).success, false);
assert.deepEqual(StoryEventRepository.listEvents("story-a").map((event) => event.sequence), [1, 2]);

const mutableInput = makeEvent("story-a", "event-3", 101, 2);
const thirdWrite = StoryEventRepository.appendEvent(mutableInput);
assert.equal(thirdWrite.success, true);
(mutableInput as unknown as { summary: string }).summary = "mutated after append";
assert.equal(StoryEventRepository.listEvents("story-a").find((event) => event.id === "event-3")?.summary, "story-a:event-3");
assert.equal(StoryEventRepository.listEvents("story-a").find((event) => event.id === "event-3")?.storyVersion, 2);

assert.equal(StoryEventRepository.appendEvent({ ...makeEvent("story-a", "invalid-version", 102), storyVersion: 0 }).success, false);
console.log("forum story event timeline tests passed");
