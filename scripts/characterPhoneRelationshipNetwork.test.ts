import assert from "node:assert/strict";
import { ensureCharacterPhoneContent } from "../src/features/characterPhone/characterPhoneContent";
import { listCharacterPhoneRelationshipNetworkContacts } from "../src/features/characterPhone/characterPhoneRelationshipNetwork";
import type { Character, Moment, UserIdentity } from "../src/types";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";
import type { RelationshipNetworkMap, RelationshipNetworkNpc } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";

const identity: UserIdentity = { id: "identity-network", name: "用户", avatar: "", signature: "", bio: "" };
const role: Character = {
  id: "character-role-network",
  name: "步随影",
  avatar: "🕯️",
  personality: "克制、寡言",
  backstory: "",
  ownerIdentityId: identity.id,
};
const promotedNpcCharacter: Character = {
  id: "character-promoted-network-npc",
  name: "林深",
  avatar: "🌲",
  personality: "话少但可靠",
  backstory: "关系网 NPC 档案",
  ownerIdentityId: identity.id,
  relationshipNetworkNpcId: "npc-linshen",
};
const npc: RelationshipNetworkNpc = {
  id: "npc-linshen",
  ownerIdentityId: identity.id,
  name: "林深",
  avatar: "🌲",
  summary: "替步随影处理旧物的朋友。",
  role: "旧识",
  personality: "话少但可靠",
  motivation: "把东西送到他手里",
  createdAt: 1,
  updatedAt: 1,
};
const network: RelationshipNetworkMap = {
  id: "network-a",
  ownerIdentityId: identity.id,
  name: "我的关系网",
  nodes: [
    { id: "node-role", entityType: "character", entityId: role.id, x: 0, y: 0 },
    { id: "node-npc", entityType: "npc", entityId: npc.id, x: 200, y: 0 },
  ],
  edges: [{
    id: "edge-role-npc",
    sourceNodeId: "node-role",
    targetNodeId: "node-npc",
    direction: "both",
    forwardLabel: "旧识",
    reverseLabel: "偶尔联系",
    createdAt: 1,
    updatedAt: 1,
  }],
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: 1,
};

const linked = listCharacterPhoneRelationshipNetworkContacts({
  character: role,
  ownerIdentityId: identity.id,
  characters: [role, promotedNpcCharacter],
  npcs: [npc],
  maps: [network],
});
assert.equal(linked.length, 1);
assert.equal(linked[0]?.npc.id, npc.id);
assert.deepEqual(linked[0]?.relationLabels, ["旧识"]);
assert.equal(linked[0]?.linkedCharacterId, promotedNpcCharacter.id);

function emptyPhone(): CharacterPhoneRecord {
  return {
    id: "phone-network",
    ownerIdentityId: identity.id,
    characterId: role.id,
    passcode: "0000",
    failedAttempts: 0,
    createdAt: 1,
    updatedAt: 1,
    wallpaper: "#fff",
    appOrder: ["chat", "moments"],
    messages: [],
    contacts: [],
    threadMessages: [],
    posts: [],
    browserHistory: [],
    diaryEntries: [],
    scheduleItems: [],
    galleryItems: [],
    activities: [],
  };
}

const npcMoment: Moment = {
  id: "moment-linshen",
  characterId: promotedNpcCharacter.id,
  relationshipNetworkNpcId: npc.id,
  ownerIdentityId: identity.id,
  authorName: npc.name,
  authorAvatar: npc.avatar || "👤",
  content: "东西放在门口了。",
  timestamp: 10,
  likes: [],
  comments: [],
};
const phone = ensureCharacterPhoneContent({
  phone: emptyPhone(),
  character: role,
  characters: [role, promotedNpcCharacter],
  activeIdentity: identity,
  relationships: [],
  messages: [],
  moments: [npcMoment],
  worldBookEntries: [],
  relationshipNetworkNpcs: [npc],
  relationshipNetworkMaps: [network],
  now: 100,
});
const networkContact = phone.contacts.find((contact) => contact.relationshipNetworkNpcId === npc.id);
assert.ok(networkContact, "a directly connected lightweight NPC becomes a role-phone contact");
assert.equal(networkContact?.linkedCharacterId, promotedNpcCharacter.id);
assert.ok(phone.posts.some((post) => post.sourceMomentId === npcMoment.id), "a connected NPC Moment is projected into the role phone");

const unrelatedNetwork: RelationshipNetworkMap = {
  ...network,
  id: "network-unrelated",
  nodes: [
    { id: "node-other-role", entityType: "character", entityId: "character-other", x: 0, y: 0 },
    { id: "node-other-npc", entityType: "npc", entityId: npc.id, x: 200, y: 0 },
  ],
  edges: [{ ...network.edges[0], id: "edge-unrelated", sourceNodeId: "node-other-role", targetNodeId: "node-other-npc" }],
};
assert.equal(listCharacterPhoneRelationshipNetworkContacts({
  character: role,
  ownerIdentityId: identity.id,
  characters: [role, promotedNpcCharacter],
  npcs: [npc],
  maps: [unrelatedNetwork],
}).length, 0, "an NPC connected to another character does not leak into this role phone");

console.log("character phone relationship-network projection tests passed");

