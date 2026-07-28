import assert from "node:assert/strict";
import {
  bindDualMusicWidget,
  removeMusicDataByRelations,
  upsertIdentityMusicTrack,
} from "../src/core/storage/repositories/musicWidgetRepository";

let configs = bindDualMusicWidget([], { widgetId: "widget", ownerIdentityId: "identity-a", relationId: "rel-a", characterId: "char", now: 1 });
configs = bindDualMusicWidget(configs, { widgetId: "widget", ownerIdentityId: "identity-b", relationId: "rel-b", characterId: "char", now: 2 });
assert.equal(configs.find((item) => item.ownerIdentityId === "identity-a")?.relationId, "rel-a");
assert.equal(configs.find((item) => item.ownerIdentityId === "identity-b")?.relationId, "rel-b");

const states: any[] = [
  { relationId: "rel-a", conversationId: "direct:rel-a", characterId: "char", currentTrackId: "song-a", recentTrackIds: ["song-a"], updatedAt: 1 },
  { relationId: "rel-b", conversationId: "direct:rel-b", characterId: "char", currentTrackId: "song-b", recentTrackIds: ["song-b"], updatedAt: 2 },
];
const cleaned = removeMusicDataByRelations(configs, states, ["rel-a"]);
assert.equal(cleaned.states.length, 1);
assert.equal(cleaned.states[0].relationId, "rel-b");
assert.equal(cleaned.configs.find((item) => item.ownerIdentityId === "identity-a")?.relationId, undefined);
assert.equal(cleaned.configs.find((item) => item.ownerIdentityId === "identity-b")?.relationId, "rel-b");

const identities = upsertIdentityMusicTrack([], "identity-a", "left-song", 3);
assert.equal(identities[0].currentTrackId, "left-song");
console.log("dual music relation isolation tests passed");
