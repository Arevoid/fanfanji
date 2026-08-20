import assert from "node:assert/strict";
import { runGroupChatReplyPipeline } from "../src/features/chat/services/groupChatReplyPipeline";
import type { Character, UserSettings } from "../src/types";

const group: Character = { id: "group-1", name: "群聊", avatar: "", personality: "", backstory: "", isGroupChat: true, memberIds: [] };
let generationCalled = false;
const result = await runGroupChatReplyPipeline({
  activeCharacter: group,
  characters: [],
  relationships: [],
  activeIdentityId: "identity-1",
  memories: [],
  claims: [],
  summaries: [],
  corrections: [],
  worldBookEntries: [],
  currentMessages: [],
  userMessage: null,
  userName: "机主",
  userBio: "",
  settings: { name: "机主", bio: "", apiKey: "", selectedModel: "test" } as UserSettings,
  recallLimit: 5,
  timeAwarenessEnabled: false,
  disableBracketActions: false,
  generateTurn: async () => { generationCalled = true; throw new Error("must not generate without group members"); },
  createRouteId: () => "route",
  createReplyId: () => "reply",
  currentTime: () => 1,
});
assert.deepEqual(result.groupMembers, []);
assert.equal(result.result, null);
assert.equal(generationCalled, false);
console.log("Group chat reply pipeline: empty-group guard passed");
