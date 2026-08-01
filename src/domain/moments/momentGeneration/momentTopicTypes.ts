export const MOMENT_TOPIC_SCOPE = "character-public" as const;

export type MomentTopicScope = typeof MOMENT_TOPIC_SCOPE;

export type MomentTopicCategory =
  | "daily_life"
  | "hobby"
  | "work"
  | "emotion"
  | "social"
  | "reflection"
  | "other";

/** A small public-generation hint, not a Memory or a CharacterEvent. */
export interface MomentTopicRecord {
  topic: string;
  category: MomentTopicCategory;
  generatedAt: number;
  momentId: string;
  characterId: string;
  scope: MomentTopicScope;
}

export interface CreateMomentTopicRecordInput {
  topic: string;
  category: MomentTopicCategory;
  generatedAt: number;
  momentId: string;
  characterId: string;
  scope?: MomentTopicScope;
}

export interface MomentTopicQueryOptions {
  limit?: number;
  now?: number;
  withinMs?: number;
}

export interface MomentTopicPolicyOptions extends MomentTopicQueryOptions {
  duplicateWindowMs?: number;
  cooldownMs?: number;
  similarThreshold?: number;
}

export type MomentTopicDecisionReason = "allowed" | "duplicate" | "similar" | "cooldown";

export interface MomentTopicDecision {
  avoid: boolean;
  reason: MomentTopicDecisionReason;
  matchedTopic?: MomentTopicRecord;
}
