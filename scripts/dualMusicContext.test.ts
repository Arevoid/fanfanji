import assert from "node:assert/strict";
import { buildRelationMusicContext, isMusicTopic } from "../src/domain/prompt/musicContext";

assert.equal(isMusicTopic("今天天气不错"), false);
assert.equal(isMusicTopic("你正在听什么歌"), true);
const tracks: any[] = [
  { id: "mine", title: "My Song", artist: "Mine", url: "", isLocal: false },
  { id: "friend-a", title: "A Song", artist: "A", url: "", isLocal: false },
  { id: "friend-b", title: "B Song", artist: "B", url: "", isLocal: false },
];
const context = buildRelationMusicContext({
  userText: "推荐一首歌",
  ownerIdentityId: "identity-a",
  relationId: "rel-a",
  tracks,
  identityStates: [{ ownerIdentityId: "identity-a", currentTrackId: "mine", recentTrackIds: ["mine"], updatedAt: 1 }],
  relationshipStates: [
    { relationId: "rel-a", conversationId: "direct:rel-a", characterId: "char", currentTrackId: "friend-a", recentTrackIds: ["friend-a"], updatedAt: 1 },
    { relationId: "rel-b", conversationId: "direct:rel-b", characterId: "char", currentTrackId: "friend-b", recentTrackIds: ["friend-b"], updatedAt: 1 },
  ],
});
assert.match(context, /My Song/);
assert.match(context, /A Song/);
assert.doesNotMatch(context, /B Song/);
assert.equal(buildRelationMusicContext({ userText: "你好", ownerIdentityId: "identity-a", relationId: "rel-a", tracks, identityStates: [], relationshipStates: [] }), "");
console.log("dual music context tests passed");
