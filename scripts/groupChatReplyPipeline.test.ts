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

const memberA: Character = { id: "member-a", name: "甲", avatar: "", personality: "", backstory: "" };
const memberB: Character = { id: "member-b", name: "乙", avatar: "", personality: "", backstory: "" };
const oneRequestGroup: Character = { ...group, id: "group-2", memberIds: [memberA.id, memberB.id] };
let requestCount = 0;
const oneRequestResult = await runGroupChatReplyPipeline({
  activeCharacter: oneRequestGroup,
  characters: [oneRequestGroup, memberA, memberB],
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
  generateTurn: async (input) => {
    requestCount += 1;
    assert.equal(input.members.length, 2);
    return {
      members: [memberA, memberB],
      messages: [
        { id: "reply-a", characterId: "group-2", senderId: "member-a", conversationId: "group:group-2", sender: "character", content: "甲的回复", timestamp: 1 },
        { id: "reply-b", characterId: "group-2", senderId: "member-b", conversationId: "group:group-2", sender: "character", content: "乙的回复", timestamp: 1 },
      ],
    };
  },
  createRouteId: () => "route",
  createReplyId: () => "reply",
  currentTime: () => 1,
});
assert.equal(requestCount, 1, "multiple group members must be generated in one API request");
assert.deepEqual(oneRequestResult.result?.messages.map((message) => message.senderId), ["member-a", "member-b"]);
console.log("Group chat reply pipeline: empty-group guard and single-request multi-member generation passed");
