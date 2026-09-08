import assert from "node:assert/strict";
import type { Character, OfflineStory } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { resolveOfflineChatNavigationTarget } from "../src/domain/relationship/offlineChatNavigation";

const group = { id: "group-1", name: "项目群", isGroupChat: true } as Character;
const member = { id: "member-1", name: "成员甲", isGroupChat: false } as Character;
const direct = { id: "direct-1", name: "单聊角色", isGroupChat: false } as Character;
const directRelation = {
  id: "relation-direct-1",
  characterId: direct.id,
  userIdentityId: "identity-1",
  conversationId: "direct:relation-direct-1",
} as CharacterRelationship;

const groupStory = {
  id: "story-group-1",
  characterId: group.id,
  characterIds: [member.id],
  sourceChatId: group.id,
  conversationId: `group:${group.id}`,
} as OfflineStory;

assert.deepEqual(
  resolveOfflineChatNavigationTarget({
    story: groupStory,
    relationships: [directRelation],
    characters: [group, member, direct],
    ownerIdentityId: "identity-1",
  }),
  {
    characterId: group.id,
    conversationId: `group:${group.id}`,
    kind: "group",
  },
  "group stories return to the group container without a direct relation",
);

const directStory = {
  id: "story-direct-1",
  characterId: direct.id,
  relationId: directRelation.id,
  conversationId: directRelation.conversationId,
} as OfflineStory;

assert.deepEqual(
  resolveOfflineChatNavigationTarget({
    story: directStory,
    relationships: [directRelation],
    characters: [group, member, direct],
    ownerIdentityId: "identity-1",
  }),
  {
    characterId: direct.id,
    relationId: directRelation.id,
    conversationId: directRelation.conversationId,
    kind: "direct",
  },
  "direct stories keep their relation-scoped return route",
);

console.log("PASS group and direct offline stories use separate return routes");
