export type ProactiveTopicCategory =
  | "care"
  | "daily_share"
  | "hobby"
  | "reminder"
  | "emotional"
  | "follow_up";

/** Generation-only metadata; this is not Memory, an event, or relationship state. */
export interface ProactiveTopicRecord {
  topic: string;
  category: ProactiveTopicCategory;
  createdAt: number;
  characterId: string;
  relationId: string;
}

export interface CreateProactiveTopicRecordInput {
  topic: string;
  category: ProactiveTopicCategory;
  createdAt: number;
  characterId: string;
  relationId: string;
}

export interface ProactiveTopicQueryOptions {
  limit?: number;
  now?: number;
  withinMs?: number;
}

export interface ProactiveTopicPolicyOptions extends ProactiveTopicQueryOptions {
  duplicateWindowMs?: number;
  cooldownMs?: number;
}
