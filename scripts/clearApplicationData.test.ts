import assert from "node:assert/strict";
import { clearApplicationData } from "../src/features/settings/clearApplicationData";

const events: string[] = [];

await clearApplicationData({
  persistentStorage: {
    clear: () => events.push("persistent"),
  },
  sessionStorage: {
    clear: () => events.push("session"),
  },
  cacheStorage: {
    keys: async () => {
      events.push("cache-keys");
      return ["app-shell", "images"];
    },
    delete: async (cacheName: string) => {
      events.push(`cache-delete:${cacheName}`);
      return true;
    },
  },
  binaryStoreClearers: [
    async () => { events.push("audio"); },
    async () => { events.push("images"); },
    async () => { events.push("stickers"); },
  ],
});

assert.deepEqual(events.slice(0, 3), ["audio", "images", "stickers"]);
assert.ok(events.includes("cache-delete:app-shell"));
assert.ok(events.includes("cache-delete:images"));
assert.deepEqual(events.slice(-2), ["session", "persistent"]);

console.log("clear application data tests passed");
