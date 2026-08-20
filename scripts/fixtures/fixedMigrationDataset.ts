import type { Message, OfflineStory, StickerGroup } from "../../src/types";

export const FIXED_MIGRATION_MESSAGE_COUNT = 1_000;
export const FIXED_MIGRATION_LARGE_STORY_MESSAGE_COUNT = 2_000;
export const FIXED_MIGRATION_NEAR_QUOTA_PAYLOAD_BYTES = 512_000;
export const FIXED_MIGRATION_MIN_SERIALIZED_BYTES = 100_000;

export interface FixedMigrationDataset {
  emptyCollections: {
    identities: never[];
    characters: never[];
    relationships: never[];
    messages: never[];
    stories: never[];
  };
  identities: Array<{ id: string; name: string }>;
  characters: Array<{ id: string; name: string; isGroupChat?: boolean; memberIds?: string[]; ownerIdentityId?: string }>;
  relationships: Array<{ id: string; characterId: string; userIdentityId: string; conversationId: string }>;
  messages: Message[];
  stories: OfflineStory[];
  largeOfflineStory: OfflineStory;
  stickerGroups: StickerGroup[];
  nearQuotaPayload: string;
  duplicateMessages: Message[];
  missingReferenceMessages: Message[];
  malformedBackup: unknown;
}

export function createFixedMigrationDataset(): FixedMigrationDataset {
  const identities = [
    { id: "identity-1", name: "主身份" },
    { id: "identity-2", name: "工作身份" },
    { id: "identity-3", name: "测试身份" },
  ];
  const characters = [
    { id: "character-a", name: "角色 A" },
    { id: "character-b", name: "角色 B" },
    { id: "group-a", name: "固定群聊", isGroupChat: true, memberIds: ["character-a", "character-b"], ownerIdentityId: "identity-1" },
  ];
  const relationships = identities.slice(0, 2).flatMap((identity, identityIndex) => [
    { id: `relation-a-${identityIndex + 1}`, characterId: "character-a", userIdentityId: identity.id, conversationId: `direct:relation-a-${identityIndex + 1}` },
    { id: `relation-b-${identityIndex + 1}`, characterId: "character-b", userIdentityId: identity.id, conversationId: `direct:relation-b-${identityIndex + 1}` },
  ]);
  const messages: Message[] = Array.from({ length: FIXED_MIGRATION_MESSAGE_COUNT }, (_, index) => {
    const isGroup = index >= 800;
    const identityIndex = index % 2;
    const relationId = isGroup ? undefined : `relation-${index % 2 === 0 ? "a" : "b"}-${identityIndex + 1}`;
    return {
      id: `fixed-message-${String(index).padStart(4, "0")}`,
      characterId: isGroup ? "group-a" : index % 2 === 0 ? "character-a" : "character-b",
      ...(relationId ? { relationId, conversationId: `direct:${relationId}` } : { conversationId: "group:group-a" }),
      sender: index % 3 === 0 ? "user" : "character",
      senderId: index % 3 === 0 ? undefined : isGroup && index % 2 === 0 ? "character-a" : undefined,
      content: `固定迁移数据第 ${index} 条：身份隔离、群聊、顺序和长文本回归。${"内容片段 ".repeat(index % 7)}`,
      timestamp: 1_700_000_000_000 + index * 1_000,
      ...(index % 11 === 0 ? { isVoiceMessage: true, audioDuration: 2.5 } : {}),
      ...(index % 17 === 0 ? { imageAssetId: `asset-${index}`, imageMimeType: "image/png" } : {}),
    };
  });
  const stories: OfflineStory[] = [
    {
      id: "fixed-story-direct",
      characterId: "character-a",
      relationId: "relation-a-1",
      conversationId: "direct:relation-a-1",
      characterIds: ["character-a"],
      title: "固定直聊线下故事",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      mode: "continue",
      messages: messages.slice(0, 8),
    },
    {
      id: "fixed-story-group",
      characterId: "group-a",
      conversationId: "group:group-a",
      characterIds: ["character-a", "character-b"],
      participantSnapshots: characters.slice(0, 2).map(({ id, name }) => ({ id, name })),
      title: "固定群聊线下故事",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      mode: "director",
      messages: messages.slice(800, 808),
    },
  ];
  const largeOfflineStory: OfflineStory = {
    ...stories[0],
    id: "fixed-story-large",
    title: "固定超长线下故事",
    messages: Array.from({ length: FIXED_MIGRATION_LARGE_STORY_MESSAGE_COUNT }, (_, index) => ({
      ...messages[index % messages.length],
      id: `fixed-story-message-${String(index).padStart(4, "0")}`,
      content: `超长线下故事第 ${index} 段：${"恢复校验片段 ".repeat((index % 11) + 1)}`,
      timestamp: 1_700_100_000_000 + index * 1_000,
    })),
  };
  const stickerGroups: StickerGroup[] = [{
    id: "fixed-sticker-group",
    name: "固定迁移表情",
    stickers: [{ id: "fixed-sticker-1", name: "固定笑脸", url: "sticker://fixed-sticker-1", semanticDescription: "固定测试表情" }],
  }];
  return {
    emptyCollections: { identities: [], characters: [], relationships: [], messages: [], stories: [] },
    identities,
    characters,
    relationships,
    messages,
    stories,
    largeOfflineStory,
    stickerGroups,
    nearQuotaPayload: "q".repeat(FIXED_MIGRATION_NEAR_QUOTA_PAYLOAD_BYTES),
    duplicateMessages: [messages[0], { ...messages[1], id: messages[0].id }],
    missingReferenceMessages: [{ ...messages[2], id: "fixed-missing-reference", relationId: "relation-does-not-exist" }],
    malformedBackup: { format: "fanfanji-system-backup", version: 3, localStorage: "not-an-object", indexedDb: [] },
  };
}
