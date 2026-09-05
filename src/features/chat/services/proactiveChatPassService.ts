import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import { getScheduledContactTime } from "./chatTime";

interface ProactiveChatPassDependencies {
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  messages: readonly Message[];
  settingsName: string;
  isOfflineStoryActiveFor: (relationId: string) => boolean;
  processedCatchups: Set<string>;
  scheduleNextProactiveMessage: (character: Character) => number;
  updateRelationshipSession: (relationId: string, patch: Partial<CharacterRelationship>) => void;
  triggerProactiveFor: (relationId: string, customTaskText?: string, backdateTimestamp?: number) => void | Promise<void>;
  checkAndTriggerCharacterMoments: () => void | Promise<void>;
  runRelationshipNetworkNpcAutomationPass?: () => void | Promise<void>;
  now?: () => number;
  random?: () => number;
}

function findFriend(deps: ProactiveChatPassDependencies, relation: CharacterRelationship): Character | undefined {
  return deps.characters.find((character) => character.id === resolveCanonicalCharacterId(relation.characterId, deps.characters));
}

export function runProactiveCatchupPass(deps: ProactiveChatPassDependencies): void {
  const now = deps.now?.() ?? Date.now();
  deps.relationships.forEach((relation) => {
    const friend = findFriend(deps, relation);
    if (!friend || friend.isGroupChat || !friend.enableProactiveChat || deps.isOfflineStoryActiveFor(relation.id)) return;
    if (deps.processedCatchups.has(relation.id)) return;
    deps.processedCatchups.add(relation.id);
    const scheduled = relation.scheduledProactiveTime;
    if (!scheduled) {
      deps.updateRelationshipSession(relation.id, { scheduledProactiveTime: deps.scheduleNextProactiveMessage(friend) });
      return;
    }
    if (scheduled < now) {
      deps.updateRelationshipSession(relation.id, {
        scheduledProactiveTime: deps.scheduleNextProactiveMessage(friend),
        lastActiveTime: now,
      });
      const missedTime = new Date(scheduled).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      deps.triggerProactiveFor(
        relation.id,
        `This is a catchup/missed message that was scheduled to be sent to the user at exactly ${missedTime} today while they were offline/away. You are proactively initiating contact to check in on them, share something interesting about your day/life, or show your warmth. Keep it perfectly natural, spontaneous, and matching your character profile.`,
        scheduled,
      );
    }
  });
}

export async function runBackgroundProactivePass(deps: ProactiveChatPassDependencies): Promise<void> {
  const now = deps.now?.() ?? Date.now();
  const current = new Date(now);
  const currentHM = `${current.getHours().toString().padStart(2, "0")}:${current.getMinutes().toString().padStart(2, "0")}`;
  deps.relationships.forEach((relation) => {
    const friend = findFriend(deps, relation);
    if (!friend || friend.isGroupChat || !friend.enableProactiveChat || deps.isOfflineStoryActiveFor(relation.id)) return;
    if (relation.scheduledProactiveTime && now >= relation.scheduledProactiveTime) {
      deps.updateRelationshipSession(relation.id, { scheduledProactiveTime: deps.scheduleNextProactiveMessage(friend), lastActiveTime: now });
      deps.triggerProactiveFor(relation.id);
      return;
    }
    const relationMessages = deps.messages.filter((message) => message.relationId === relation.id);
    const schedule = getScheduledContactTime(relationMessages, deps.settingsName);
    if (schedule) {
      const lastMessage = relationMessages[relationMessages.length - 1];
      const isSilent = lastMessage ? now - lastMessage.timestamp >= 2 * 60 * 1000 : true;
      if (now >= schedule.triggerTime && (!lastMessage || lastMessage.timestamp < schedule.triggerTime) && isSilent) {
        deps.updateRelationshipSession(relation.id, { scheduledProactiveTime: deps.scheduleNextProactiveMessage(friend), lastActiveTime: now });
        deps.triggerProactiveFor(relation.id, "You and the user previously agreed that you would contact or chat with them after a certain amount of time (which has now passed). You are proactively initiating contact exactly as promised/agreed. Please follow up on what they went to do, show concern, or start a fresh, warm conversation as promised, keeping it spontaneous, natural, and perfectly matching your character profile.");
        return;
      }
    }
    const startTime = friend.proactiveStartTime || "09:00";
    const endTime = friend.proactiveEndTime || "22:00";
    const isWithinRange = startTime === endTime
      || (startTime < endTime ? currentHM >= startTime && currentHM <= endTime : currentHM >= startTime || currentHM <= endTime);
    if (!isWithinRange) return;
    const lastActive = relation.lastActiveTime || (now - 4 * 60 * 60 * 1000);
    if (now - lastActive < 2 * 60 * 60 * 1000 || (deps.random?.() ?? Math.random()) >= 0.005) return;
    deps.updateRelationshipSession(relation.id, { scheduledProactiveTime: deps.scheduleNextProactiveMessage(friend), lastActiveTime: now });
    deps.triggerProactiveFor(relation.id);
  });
  await deps.checkAndTriggerCharacterMoments();
  await deps.runRelationshipNetworkNpcAutomationPass?.();
}
