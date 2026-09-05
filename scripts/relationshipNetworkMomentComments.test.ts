import assert from "node:assert/strict";
import type { Character, Moment } from "../src/types";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import {
  findRelationshipNetworkCharacterMomentCommentCandidate,
  listRelationshipNetworkCharacterMomentCommentCandidates,
  listRelationshipNetworkMomentCommentCandidates,
  shouldGenerateRelationshipNetworkMomentComment,
} from "../src/features/moments/services/relationshipNetworkMomentCommentService";
import { upsertRelationshipNetworkChatLink } from "../src/core/storage/repositories/relationshipNetworkChatLinkRepository";
import { createRelationshipNetworkNpc } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";
import { upsertRelationshipNetworkNpc } from "../src/core/storage/repositories/relationshipNetworkRepository";
import { upsertRelationshipNetworkSocialLink } from "../src/core/storage/repositories/relationshipNetworkSocialLinkRepository";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });

const ownerIdentityId = "identity-a";
const npc = createRelationshipNetworkNpc({
  id: "npc-a",
  ownerIdentityId,
  name: "周医生",
  avatar: "🩺",
  summary: "社区医生",
  role: "医生",
  now: 1,
});
const sourceCharacter: Character = {
  id: "character-npc-a",
  ownerIdentityId,
  relationshipNetworkNpcId: npc.id,
  name: npc.name,
  avatar: npc.avatar || "👤",
  personality: "温和、谨慎",
  backstory: "",
};
const targetCharacter: Character = {
  id: "character-target-a",
  ownerIdentityId,
  name: "林默",
  avatar: "🌿",
  personality: "安静",
  backstory: "",
};
const sourceRelationship = createRelationship({
  id: "relation-npc-a",
  characterId: sourceCharacter.id,
  userIdentityId: ownerIdentityId,
  now: 2,
  relationship: "friend",
});
const targetRelationship = createRelationship({
  id: "relation-target-a",
  characterId: "character-target-a",
  userIdentityId: ownerIdentityId,
  now: 2,
  relationship: "friend",
});
const targetMoment: Moment = {
  id: "moment-target-a-1",
  characterId: targetCharacter.id,
  relationId: "relation-target-a",
  ownerIdentityId,
  authorName: targetCharacter.name,
  authorAvatar: targetCharacter.avatar,
  content: "今天终于把窗边的旧书整理好了。",
  timestamp: 10,
  likes: [],
  comments: [],
};

assert.equal(upsertRelationshipNetworkNpc({ ...npc, linkedCharacterId: sourceCharacter.id }).success, true);
assert.equal(upsertRelationshipNetworkChatLink({
  ownerIdentityId,
  npcId: npc.id,
  characterId: sourceCharacter.id,
  relationId: sourceRelationship.id,
  createdAt: 2,
  updatedAt: 2,
}).success, true);
assert.equal(upsertRelationshipNetworkSocialLink({
  id: "social-a",
  ownerIdentityId,
  sourceEntityType: "npc",
  sourceEntityId: npc.id,
  targetEntityType: "character",
  targetEntityId: targetCharacter.id,
  relationshipLabel: "好友",
  enabled: true,
  canViewMoments: true,
  canCommentMoments: true,
  commentFrequency: "normal",
  createdAt: 2,
  updatedAt: 2,
}).success, true);

const candidates = listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship],
  existingMoments: [],
});
assert.equal(candidates.length, 1);
assert.equal(candidates[0]?.npc.name, "周医生");
assert.equal(candidates[0]?.sourceRelationship.id, sourceRelationship.id);
assert.equal(candidates[0]?.targetCharacter?.id, targetCharacter.id);

const npcMoment: Moment = {
  ...targetMoment,
  id: "moment-npc-a-1",
  characterId: sourceCharacter.id,
  relationshipNetworkNpcId: npc.id,
  authorName: npc.name,
  authorAvatar: npc.avatar || "👤",
};
const characterCommentCandidates = listRelationshipNetworkCharacterMomentCommentCandidates({
  ownerIdentityId,
  moment: npcMoment,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship, targetRelationship],
});
assert.equal(characterCommentCandidates.length, 1, "a linked character can be selected to comment on an NPC Moment");
assert.equal(characterCommentCandidates[0]?.targetCharacter.id, targetCharacter.id);
assert.equal(findRelationshipNetworkCharacterMomentCommentCandidate({
  ownerIdentityId,
  npcId: npc.id,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship, targetRelationship],
})?.targetRelationship.id, targetRelationship.id);

assert.equal(upsertRelationshipNetworkSocialLink({
  id: "social-identity-a",
  ownerIdentityId,
  sourceEntityType: "npc",
  sourceEntityId: npc.id,
  targetEntityType: "identity",
  targetEntityId: ownerIdentityId,
  relationshipLabel: "关注",
  enabled: true,
  canViewMoments: true,
  canCommentMoments: true,
  commentFrequency: "high",
  createdAt: 2,
  updatedAt: 2,
}).success, true);
const userMoment: Moment = {
  id: "moment-user-a-1",
  ownerIdentityId,
  authorName: "饭饭",
  authorAvatar: "👤",
  content: "今天去公园走了一圈。",
  timestamp: 10,
  likes: [],
  comments: [],
};
const identityCandidates = listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetIdentityId: ownerIdentityId,
  targetIdentityName: "饭饭",
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship],
  existingMoments: [],
  currentMoment: userMoment,
  force: true,
});
assert.equal(identityCandidates.length, 1);
assert.equal(identityCandidates[0]?.targetEntityType, "identity");
assert.equal(identityCandidates[0]?.targetIdentityId, ownerIdentityId);
assert.equal(listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetIdentityId: ownerIdentityId,
  targetIdentityName: "饭饭",
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship],
  existingMoments: [],
  currentMoment: {
    ...userMoment,
    comments: [{
      id: "comment-npc-user-1",
      characterId: sourceCharacter.id,
      relationId: sourceRelationship.id,
      authorName: npc.name,
      authorAvatar: npc.avatar || "👤",
      content: "这次已经来过啦。",
      timestamp: 11,
    }],
  },
  force: true,
}).length, 0, "manual retry must not duplicate an NPC comment on the same Moment");

assert.equal(upsertRelationshipNetworkSocialLink({
  id: "social-like-character-a",
  ownerIdentityId,
  sourceEntityType: "npc",
  sourceEntityId: npc.id,
  targetEntityType: "character",
  targetEntityId: targetCharacter.id,
  relationshipLabel: "关注",
  enabled: true,
  canViewMoments: true,
  canCommentMoments: false,
  canLikeMoments: true,
  commentFrequency: "normal",
  createdAt: 3,
  updatedAt: 3,
}).success, true);
const likeCandidates = listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship],
  existingMoments: [],
  currentMoment: targetMoment,
  force: true,
  action: "like",
});
assert.equal(likeCandidates.length, 1);
assert.equal(likeCandidates[0]?.targetEntityType, "character");
assert.equal(shouldGenerateRelationshipNetworkMomentComment({
  existingMoments: [{ ...targetMoment, timestamp: 20, likes: [npc.name] }],
  targetCharacterId: targetCharacter.id,
  sourceCharacterId: sourceCharacter.id,
  sourceRelationId: sourceRelationship.id,
  ownerIdentityId,
  frequency: "normal",
  action: "like",
  sourceDisplayName: npc.name,
}), false, "normal like frequency waits for one more target post after a like");
assert.equal(listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship],
  existingMoments: [],
  currentMoment: { ...targetMoment, likes: [npc.name] },
  force: true,
  action: "like",
}).length, 0, "manual retry must not duplicate an NPC like on the same Moment");

const firstComment: Moment = {
  ...targetMoment,
  id: "moment-target-a-2",
  timestamp: 20,
  comments: [{
    id: "comment-npc-a-1",
    characterId: sourceCharacter.id,
    relationId: sourceRelationship.id,
    authorName: npc.name,
    authorAvatar: npc.avatar || "👤",
    content: "整理完看起来舒服多了。",
    timestamp: 21,
  }],
};
assert.equal(shouldGenerateRelationshipNetworkMomentComment({
  existingMoments: [firstComment],
  targetCharacterId: targetCharacter.id,
  sourceCharacterId: sourceCharacter.id,
  sourceRelationId: sourceRelationship.id,
  ownerIdentityId,
  frequency: "normal",
}), false, "normal frequency waits for one more target post after a comment");
assert.equal(shouldGenerateRelationshipNetworkMomentComment({
  existingMoments: [firstComment, { ...targetMoment, id: "moment-target-a-3", timestamp: 30 }],
  targetCharacterId: targetCharacter.id,
  sourceCharacterId: sourceCharacter.id,
  sourceRelationId: sourceRelationship.id,
  ownerIdentityId,
  frequency: "normal",
}), true);
assert.equal(shouldGenerateRelationshipNetworkMomentComment({
  existingMoments: [firstComment],
  targetCharacterId: targetCharacter.id,
  sourceCharacterId: sourceCharacter.id,
  sourceRelationId: sourceRelationship.id,
  ownerIdentityId,
  frequency: "high",
}), true);

assert.equal(listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship],
  existingMoments: [firstComment],
}).length, 0, "normal cadence suppresses the immediate next post");

assert.equal(upsertRelationshipNetworkSocialLink({
  id: "social-reply-character-a",
  ownerIdentityId,
  sourceEntityType: "npc",
  sourceEntityId: npc.id,
  targetEntityType: "character",
  targetEntityId: targetCharacter.id,
  relationshipLabel: "关注",
  enabled: true,
  canViewMoments: true,
  canCommentMoments: false,
  canReplyMoments: true,
  commentFrequency: "normal",
  createdAt: 4,
  updatedAt: 4,
}).success, true);
const userComment = {
  id: "comment-user-a-1",
  authorName: "饭饭",
  authorAvatar: "👤",
  content: "你也觉得整理后舒服多了吗？",
  timestamp: 31,
};
const replyCandidates = listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship],
  existingMoments: [],
  currentMoment: { ...targetMoment, timestamp: 30, comments: [userComment] },
  force: true,
  action: "reply",
});
assert.equal(replyCandidates.length, 1);
assert.equal(replyCandidates[0]?.replyingTo?.id, userComment.id);
const characterComment = {
  id: "comment-character-a-1",
  characterId: targetCharacter.id,
  relationId: targetRelationship.id,
  authorName: targetCharacter.name,
  authorAvatar: targetCharacter.avatar,
  content: "你说得对，整理完确实舒服多了。",
  timestamp: 33,
};
const replyToCharacterCandidates = listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship, targetRelationship],
  existingMoments: [],
  currentMoment: { ...targetMoment, timestamp: 30, comments: [characterComment] },
  force: true,
  action: "reply",
});
assert.equal(replyToCharacterCandidates.length, 1, "an NPC can continue a thread after the linked character replies");
assert.equal(replyToCharacterCandidates[0]?.replyingTo?.id, characterComment.id);
const npcPostReplyCandidates = listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship, targetRelationship],
  existingMoments: [],
  currentMoment: { ...npcMoment, comments: [characterComment] },
  force: true,
  action: "reply",
});
assert.equal(npcPostReplyCandidates.length, 1, "an NPC can reply after a character comments on the NPC's Moment");
assert.equal(npcPostReplyCandidates[0]?.replyingTo?.id, characterComment.id);
assert.equal(listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: targetCharacter.id,
  characters: [sourceCharacter, targetCharacter],
  relationships: [sourceRelationship],
  existingMoments: [],
  currentMoment: {
    ...targetMoment,
    timestamp: 30,
    comments: [
      userComment,
      {
        id: "comment-reply-a-1",
        characterId: sourceCharacter.id,
        relationId: sourceRelationship.id,
        authorName: npc.name,
        authorAvatar: npc.avatar || "👤",
        content: `回复${userComment.authorName}：我也这么觉得。`,
        replyToCommentId: userComment.id,
        timestamp: 32,
      },
    ],
  },
  force: true,
  action: "reply",
}).length, 0, "manual retry must not duplicate an NPC reply to the same comment");

console.log("relationship network moment comment tests passed");
