import type { Moment } from "../../types";

export const RELATIONSHIP_NETWORK_SCHEMA_VERSION = 1 as const;

export type RelationshipNetworkEntityType = "identity" | "character" | "npc";
export type RelationshipNetworkEdgeDirection = "forward" | "reverse" | "both";
export type RelationshipNetworkMomentCommentFrequency = "low" | "normal" | "high";
export type RelationshipNetworkInteractionAction = "comment" | "like" | "reply";
export type RelationshipNetworkInteractionStatus = "completed" | "failed" | "skipped" | "pending";
export type RelationshipNetworkInteractionApprovalMode = "automatic" | "confirm";
export type RelationshipNetworkNpcMomentApprovalMode = "automatic" | "confirm";
export type RelationshipNetworkNpcMomentAutoMode = "manual" | "scheduled" | "event" | "scheduled_and_event";
export type RelationshipNetworkNpcMomentAutoFrequency = "low" | "normal" | "high";

export interface RelationshipNetworkNpc {
  id: string;
  ownerIdentityId: string;
  name: string;
  avatar?: string;
  summary: string;
  role?: string;
  personality?: string;
  motivation?: string;
  tags?: string[];
  linkedCharacterId?: string;
  /** Optional for backwards compatibility; absent means the NPC post publishes automatically. */
  momentApprovalMode?: RelationshipNetworkNpcMomentApprovalMode;
  /** Automatic Moment trigger source; absent/manual keeps the existing opt-in behavior. */
  momentAutoMode?: RelationshipNetworkNpcMomentAutoMode;
  /** Automatic Moment cooldown; absent uses the normal cadence. */
  momentAutoFrequency?: RelationshipNetworkNpcMomentAutoFrequency;
  createdAt: number;
  updatedAt: number;
}

export interface RelationshipNetworkChatLink {
  ownerIdentityId: string;
  npcId: string;
  characterId: string;
  relationId: string;
  createdAt: number;
  updatedAt: number;
}

/** Behavior permissions are separate from the visual edge so a line remains presentation-only until enabled. */
export interface RelationshipNetworkSocialLink {
  id: string;
  ownerIdentityId: string;
  sourceEntityType: RelationshipNetworkEntityType;
  sourceEntityId: string;
  targetEntityType: RelationshipNetworkEntityType;
  targetEntityId: string;
  relationshipLabel: string;
  enabled: boolean;
  canViewMoments: boolean;
  canCommentMoments: boolean;
  /** Optional for backwards compatibility; absent means the NPC cannot like. */
  canLikeMoments?: boolean;
  /** Optional for backwards compatibility; absent means the NPC cannot reply. */
  canReplyMoments?: boolean;
  /** Optional for backwards compatibility; absent means generated text publishes automatically. */
  interactionApprovalMode?: RelationshipNetworkInteractionApprovalMode;
  commentFrequency: RelationshipNetworkMomentCommentFrequency;
  networkEdgeId?: string;
  createdAt: number;
  updatedAt: number;
}

/** A compact audit trail for social automation; prompts and private context are never stored here. */
export interface RelationshipNetworkInteractionRecord {
  id: string;
  ownerIdentityId: string;
  socialLinkId: string;
  sourceNpcId: string;
  sourceCharacterId: string;
  /** Stable lightweight-NPC relation scope; absent on older audit records. */
  sourceRelationId?: string;
  /** Exactly one target id is set. targetCharacterId remains optional for user-owned Moments. */
  targetCharacterId?: string;
  targetIdentityId?: string;
  targetMomentId: string;
  /** Set for reply records so the audit trail points to the exact public comment. */
  targetCommentId?: string;
  action: RelationshipNetworkInteractionAction;
  status: RelationshipNetworkInteractionStatus;
  content?: string;
  reason?: string;
  occurredAt: number;
}

/** A generated public comment/reply waiting for the owner to publish or reject it. */
export interface RelationshipNetworkPendingInteraction {
  id: string;
  ownerIdentityId: string;
  socialLinkId: string;
  sourceNpcId: string;
  sourceCharacterId: string;
  /** Optional for pending records created before relation metadata was added. */
  sourceRelationId?: string;
  targetCharacterId?: string;
  targetIdentityId?: string;
  targetMomentId: string;
  targetCommentId?: string;
  action: "comment" | "reply";
  content: string;
  authorName: string;
  authorAvatar: string;
  replyToCommentId?: string;
  createdAt: number;
}

/** A generated NPC Moment waiting for the owner to publish or reject it. */
export interface RelationshipNetworkPendingMoment {
  id: string;
  ownerIdentityId: string;
  npcId: string;
  sourceCharacterId: string;
  sourceRelationId: string;
  moment: Moment;
  createdAt: number;
}

export interface RelationshipNetworkNode {
  id: string;
  entityType: RelationshipNetworkEntityType;
  entityId: string;
  x: number;
  y: number;
}

export interface RelationshipNetworkEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  direction: RelationshipNetworkEdgeDirection;
  forwardLabel?: string;
  reverseLabel?: string;
  category?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RelationshipNetworkMap {
  id: string;
  ownerIdentityId: string;
  name: string;
  nodes: RelationshipNetworkNode[];
  edges: RelationshipNetworkEdge[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: typeof RELATIONSHIP_NETWORK_SCHEMA_VERSION;
}

export function createEmptyRelationshipNetwork(input: {
  id: string;
  ownerIdentityId: string;
  identityNodeId: string;
  now: number;
}): RelationshipNetworkMap {
  return {
    id: input.id,
    ownerIdentityId: input.ownerIdentityId,
    name: "我的关系网",
    nodes: [{
      id: input.identityNodeId,
      entityType: "identity",
      entityId: input.ownerIdentityId,
      x: 120,
      y: 120,
    }],
    edges: [],
    createdAt: input.now,
    updatedAt: input.now,
    schemaVersion: RELATIONSHIP_NETWORK_SCHEMA_VERSION,
  };
}

export function createRelationshipNetworkNpc(input: {
  id: string;
  ownerIdentityId: string;
  name: string;
  avatar?: string;
  summary?: string;
  role?: string;
  personality?: string;
  motivation?: string;
  tags?: string[];
  momentApprovalMode?: RelationshipNetworkNpcMomentApprovalMode;
  momentAutoMode?: RelationshipNetworkNpcMomentAutoMode;
  momentAutoFrequency?: RelationshipNetworkNpcMomentAutoFrequency;
  now: number;
}): RelationshipNetworkNpc {
  return {
    id: input.id,
    ownerIdentityId: input.ownerIdentityId,
    name: input.name.trim(),
    ...(input.avatar?.trim() ? { avatar: input.avatar.trim() } : {}),
    summary: (input.summary || "").trim(),
    ...(input.role?.trim() ? { role: input.role.trim() } : {}),
    ...(input.personality?.trim() ? { personality: input.personality.trim() } : {}),
    ...(input.motivation?.trim() ? { motivation: input.motivation.trim() } : {}),
    ...(input.tags?.length ? { tags: input.tags.map((tag) => tag.trim()).filter(Boolean) } : {}),
    ...(input.momentApprovalMode ? { momentApprovalMode: input.momentApprovalMode } : {}),
    ...(input.momentAutoMode ? { momentAutoMode: input.momentAutoMode } : {}),
    ...(input.momentAutoFrequency ? { momentAutoFrequency: input.momentAutoFrequency } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  };
}
