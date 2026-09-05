import assert from "node:assert/strict";
import {
  applyRelationshipRecommendation,
  chooseLocalLibraryTrack,
  recommendDualMusicTrack,
} from "../src/features/music/services/dualMusicRecommendationService";

const tracks: any[] = [
  { id: "song-a", title: "A", artist: "Artist A", url: "https://a", isLocal: false },
  { id: "song-b", title: "B", artist: "Artist B", url: "https://b", isLocal: false },
];
assert.equal(chooseLocalLibraryTrack(tracks, ["song-a"], () => 0), "song-b");

const base: any = {
  tracks,
  character: { id: "char", name: "Friend", personality: "quiet", backstory: "" },
  relationship: { id: "rel-a", characterId: "char", userIdentityId: "identity-a", conversationId: "direct:rel-a", relationship: "friend", compressedMemory: "PRIVATE legacy summary" },
  messages: [{ id: "m", characterId: "char", relationId: "rel-b", sender: "user", content: "other relation", timestamp: 1 }],
  memories: [{ id: "mem", characterId: "char", relationId: "rel-b", content: "other memory", timestamp: 1 }],
  settings: { apiKey: "key", selectedModel: "model" },
};
const aiResult = await recommendDualMusicTrack({
  ...base,
  requestAi: async (request: any) => {
    assert.doesNotMatch(request.systemInstruction, /other relation|other memory/);
    assert.doesNotMatch(request.systemInstruction, /PRIVATE legacy summary/);
    return { text: '{"trackId":"song-b","reason":"fits"}' };
  },
});
assert.equal(aiResult?.trackId, "song-b");
assert.equal(aiResult?.source, "ai");

const invalid = await recommendDualMusicTrack({
  ...base,
  currentState: { relationId: "rel-a", conversationId: "direct:rel-a", characterId: "char", currentTrackId: "song-a", recentTrackIds: ["song-a"], updatedAt: 1 },
  requestAi: async () => ({ text: '{"trackId":"invented"}' }),
});
assert.equal(invalid?.trackId, "song-a", "invalid AI output must preserve a valid existing selection");

const applied = applyRelationshipRecommendation([], { relationship: base.relationship, characterId: "char", recommendation: aiResult!, now: 100 });
assert.equal(applied[0].nextRefreshAt, 100 + 24 * 60 * 60 * 1000);
console.log("dual music recommendation tests passed");
