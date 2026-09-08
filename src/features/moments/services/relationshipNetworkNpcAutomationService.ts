import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type {
  RelationshipNetworkNpc,
  RelationshipNetworkNpcMomentAutoFrequency,
  RelationshipNetworkNpcMomentAutoMode,
} from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { Message, Moment } from "../../../types";
import type { RelationshipNetworkNpcAutomationState } from "../../../core/storage/repositories/relationshipNetworkNpcAutomationRepository";

export const RELATIONSHIP_NETWORK_NPC_MOMENT_AUTO_INTERVALS: Record<RelationshipNetworkNpcMomentAutoFrequency, number> = {
  low: 24 * 60 * 60 * 1000,
  normal: 12 * 60 * 60 * 1000,
  high: 4 * 60 * 60 * 1000,
};

export const RELATIONSHIP_NETWORK_NPC_CHAT_QUIET_MS = 2 * 60 * 1000;

export type RelationshipNetworkNpcMomentAutomationTrigger = "schedule" | "chat-event" | "relationship-event";

export interface RelationshipNetworkNpcMomentAutomationCandidate {
  trigger: RelationshipNetworkNpcMomentAutomationTrigger;
  key: string;
  reason: string;
  lastMomentAt: number;
}

export interface RelationshipNetworkNpcMomentAutomationInput {
  npc: RelationshipNetworkNpc;
  relationship: CharacterRelationship;
  messages: readonly Message[];
  moments: readonly Moment[];
  events: readonly CharacterEvent[];
  state?: RelationshipNetworkNpcAutomationState;
  now: number;
}

export const getRelationshipNetworkNpcMomentAutoMode = (npc: RelationshipNetworkNpc): RelationshipNetworkNpcMomentAutoMode =>
  npc.momentAutoMode || "manual";

export const getRelationshipNetworkNpcMomentAutoInterval = (npc: RelationshipNetworkNpc): number =>
  RELATIONSHIP_NETWORK_NPC_MOMENT_AUTO_INTERVALS[npc.momentAutoFrequency || "normal"];

const allowsSchedule = (mode: RelationshipNetworkNpcMomentAutoMode): boolean =>
  mode === "scheduled" || mode === "scheduled_and_event";

const allowsEvents = (mode: RelationshipNetworkNpcMomentAutoMode): boolean =>
  mode === "event" || mode === "scheduled_and_event";

const latestByTime = <T>(items: readonly T[], getTime: (item: T) => number): T | undefined =>
  [...items].sort((left, right) => getTime(right) - getTime(left)).at(0);

/**
 * Chooses at most one deterministic trigger for an NPC. The scheduler can run
 * this every minute without repeatedly calling the AI for the same message,
 * event, or time bucket; the caller persists the returned candidate key.
 */
export function selectRelationshipNetworkNpcMomentAutomationCandidate(
  input: RelationshipNetworkNpcMomentAutomationInput,
): RelationshipNetworkNpcMomentAutomationCandidate | null {
  const mode = getRelationshipNetworkNpcMomentAutoMode(input.npc);
  if (mode === "manual") return null;

  const lastNpcMoment = latestByTime(
    input.moments.filter((moment) =>
      moment.relationshipNetworkNpcId === input.npc.id
      && (moment.ownerIdentityId || "identity-1") === input.relationship.userIdentityId),
    (moment) => moment.timestamp,
  );
  const lastMomentAt = lastNpcMoment?.timestamp || input.npc.createdAt;
  const lastAttemptKey = input.state?.lastAttemptKey;

  if (allowsEvents(mode)) {
    const latestEvent = latestByTime(
      input.events.filter((event) => event.status !== "retracted" && event.occurredAt > lastMomentAt),
      (event) => event.occurredAt,
    );
    if (latestEvent) {
      const key = `relationship-event:${latestEvent.id}`;
      if (key !== lastAttemptKey) {
        return {
          trigger: "relationship-event",
          key,
          reason: `关系事件：${latestEvent.summary}`,
          lastMomentAt,
        };
      }
    }

    const latestMessage = latestByTime(
      input.messages.filter((message) =>
        message.relationId === input.relationship.id
        && !message.isOffline
        && !message.isImportedContext
        && message.timestamp > lastMomentAt),
      (message) => message.timestamp,
    );
    if (latestMessage && input.now - latestMessage.timestamp >= RELATIONSHIP_NETWORK_NPC_CHAT_QUIET_MS) {
      const key = `chat-event:${latestMessage.id}`;
      if (key !== lastAttemptKey) {
        return {
          trigger: "chat-event",
          key,
          reason: "聊天事件：对话出现新消息，且已经暂时安静。",
          lastMomentAt,
        };
      }
    }
  }

  if (allowsSchedule(mode)) {
    const interval = getRelationshipNetworkNpcMomentAutoInterval(input.npc);
    const referenceAt = Math.max(lastMomentAt, input.state?.lastAttemptAt || 0);
    if (input.now - referenceAt >= interval) {
      const key = `schedule:${Math.floor(input.now / interval)}`;
      if (key !== lastAttemptKey) {
        return {
          trigger: "schedule",
          key,
          reason: "时间到了：达到 NPC 的自动发动态频率。",
          lastMomentAt,
        };
      }
    }
  }

  return null;
}
