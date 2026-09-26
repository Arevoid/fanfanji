import type { CharacterRelationship } from "./characterRelationship";

/** Communication direction is persisted independently from the relationship label. */
export type RelationshipBlockDirection = "user" | "character";
export type RelationshipCommunicationStatus = "active" | "blocked";

export type FriendRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "ignored"
  | "abandoned"
  | "permanently_rejected";

export interface FriendRequestRecord {
  id: string;
  relationId: string;
  characterId: string;
  userIdentityId: string;
  direction: "character_to_user" | "user_to_character";
  status: FriendRequestStatus;
  remark: string;
  reason?: string;
  attempt: number;
  blockCycleId?: string;
  createdAt: number;
  handledAt?: number;
  handledBy?: "character" | "user_assisted_character" | "user";
}

export type BlockedDeliveryKind = "message" | "voice_call" | "video_call" | "moment_comment" | "proactive";

export interface BlockedDeliveryRecord {
  id: string;
  relationId: string;
  characterId: string;
  userIdentityId: string;
  direction: "user_to_character" | "character_to_user";
  kind: BlockedDeliveryKind;
  content: string;
  summary: string;
  createdAt: number;
  blockCycleId?: string;
  sourceMessageId?: string;
  visibleToUser: boolean;
}

export const MAX_FRIEND_REQUEST_ATTEMPTS = 5;

export function isRelationshipBlocked(relation?: Pick<CharacterRelationship, "communicationStatus"> | null): boolean {
  return relation?.communicationStatus === "blocked";
}

export function createBlockCycleId(relationId: string, now = Date.now()): string {
  return `block-cycle-${relationId}-${now}`;
}

export function getBlockedDirection(relation?: Pick<CharacterRelationship, "blockedBy"> | null): RelationshipBlockDirection | undefined {
  return relation?.blockedBy;
}

/**
 * A block is directional: the person who was blocked cannot deliver to the
 * person who blocked them, while the blocker can still send messages through.
 */
export function isBlockedDeliveryDirection(
  relation: Pick<CharacterRelationship, "communicationStatus" | "blockedBy"> | null | undefined,
  direction: "user_to_character" | "character_to_user",
): boolean {
  if (!isRelationshipBlocked(relation)) return false;
  if (relation?.blockedBy === "user") return direction === "character_to_user";
  if (relation?.blockedBy === "character") return direction === "user_to_character";
  return false;
}

export function canCreateFriendRequest(attempt: number): boolean {
  return attempt < MAX_FRIEND_REQUEST_ATTEMPTS;
}

export function buildBlockedDeliverySummary(content: string, kind: BlockedDeliveryKind): string {
  const normalized = content.replace(/\s+/gu, " ").trim();
  const preview = normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
  if (kind === "voice_call") return "语音通话请求未送达";
  if (kind === "video_call") return "视频通话请求未送达";
  if (kind === "moment_comment") return "朋友圈评论未送达";
  if (kind === "proactive") return "主动联系未送达";
  return preview ? `消息未送达：${preview}` : "消息未送达";
}

export function createBlockedDeliveryRecord(input: {
  id: string;
  relationId: string;
  characterId: string;
  userIdentityId: string;
  direction: BlockedDeliveryRecord["direction"];
  kind?: BlockedDeliveryKind;
  content: string;
  createdAt?: number;
  blockCycleId?: string;
  sourceMessageId?: string;
}): BlockedDeliveryRecord {
  const kind = input.kind || "message";
  return {
    id: input.id,
    relationId: input.relationId,
    characterId: input.characterId,
    userIdentityId: input.userIdentityId,
    direction: input.direction,
    kind,
    content: input.content,
    summary: buildBlockedDeliverySummary(input.content, kind),
    createdAt: input.createdAt || Date.now(),
    ...(input.blockCycleId ? { blockCycleId: input.blockCycleId } : {}),
    ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
    visibleToUser: true,
  };
}

export function createFriendRequestRecord(input: {
  id: string;
  relation: Pick<CharacterRelationship, "id" | "characterId" | "userIdentityId">;
  direction: FriendRequestRecord["direction"];
  remark: string;
  reason?: string;
  attempt?: number;
  blockCycleId?: string;
  createdAt?: number;
}): FriendRequestRecord {
  return {
    id: input.id,
    relationId: input.relation.id,
    characterId: input.relation.characterId,
    userIdentityId: input.relation.userIdentityId,
    direction: input.direction,
    status: "pending",
    remark: input.remark.trim() || "我想和你重新联系。",
    ...(input.reason ? { reason: input.reason } : {}),
    attempt: Math.max(1, input.attempt || 1),
    ...(input.blockCycleId ? { blockCycleId: input.blockCycleId } : {}),
    createdAt: input.createdAt || Date.now(),
  };
}

export function updateFriendRequestStatus(
  request: FriendRequestRecord,
  status: FriendRequestStatus,
  handledBy: FriendRequestRecord["handledBy"],
  now = Date.now(),
): FriendRequestRecord {
  return {
    ...request,
    status,
    handledBy,
    handledAt: now,
  };
}
