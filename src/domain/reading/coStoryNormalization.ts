import { createEmptyReadingCoStoryStore, READING_CO_STORY_STORE_VERSION, type ReadingCoStoryStore } from "./coStoryTypes";

const text = (value: unknown, max = 12000): string => typeof value === "string" ? value.trim().slice(0, max) : "";
const list = (value: unknown, max = 100): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 1000)).slice(0, max) : [];
const scopeValid = (item: Record<string, unknown>): boolean => ["userIdentityId", "coStoryId", "relationId", "characterId"].every((key) => typeof item[key] === "string" && Boolean((item[key] as string).trim()));

export function normalizeReadingCoStoryStore(value: unknown): ReadingCoStoryStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createEmptyReadingCoStoryStore();
  const source = value as Record<string, unknown>;
  const stories = Array.isArray(source.stories)
    ? source.stories.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).filter(scopeValid).map((item) => {
      const friend = item.aiFriend && typeof item.aiFriend === "object" && !Array.isArray(item.aiFriend) ? item.aiFriend as Record<string, unknown> : {};
      return {
        ...item,
        userIdentityId: text(item.userIdentityId, 200),
        coStoryId: text(item.coStoryId, 200),
        relationId: text(item.relationId, 200),
        characterId: text(item.characterId, 200),
        universeStoryId: text(item.universeStoryId, 200) || undefined,
        title: text(item.title, 500),
        length: item.length,
        status: item.status,
        currentChapter: Math.max(0, Number(item.currentChapter) || 0),
        targetChapters: Math.max(1, Number(item.targetChapters) || 1),
        currentLocation: text(item.currentLocation, 500),
        currentTime: text(item.currentTime, 200),
        userCharacterName: text(item.userCharacterName, 200),
        userCharacterRole: text(item.userCharacterRole, 500) || undefined,
        userGoals: list(item.userGoals, 30),
      aiFriend: {
          relationId: text(friend.relationId, 200),
          characterId: text(friend.characterId, 200),
          displayName: text(friend.displayName, 200),
          characterName: text(friend.characterName, 200),
          characterRole: text(friend.characterRole, 500) || undefined,
          personaSummary: text(friend.personaSummary, 3000),
          knownIntel: list(friend.knownIntel, 100),
        knownTurnIds: list(friend.knownTurnIds, 200),
      },
      activeActor: item.activeActor,
      pendingApproval: item.pendingApproval && typeof item.pendingApproval === "object" && !Array.isArray(item.pendingApproval) ? (() => {
        const pending = item.pendingApproval as Record<string, unknown>;
        return pending.actor === "ai_friend" && pending.risk === "major" && text(pending.actionId, 200) && text(pending.action, 2000)
          ? { actionId: text(pending.actionId, 200), actor: "ai_friend" as const, action: text(pending.action, 2000), reason: text(pending.reason, 2000), risk: "major" as const, createdAt: Number(pending.createdAt) || Date.now() }
          : undefined;
      })() : undefined,
      createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
      };
    }).filter((item) => item.coStoryId && item.title && ["short", "medium", "long"].includes(String(item.length)) && ["active", "completed", "paused"].includes(String(item.status)) && item.userCharacterName && item.aiFriend.relationId && item.aiFriend.characterId)
    : [];
  const turns = Array.isArray(source.turns)
    ? source.turns.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).filter(scopeValid).map((item) => ({
      ...item,
      userIdentityId: text(item.userIdentityId, 200),
      coStoryId: text(item.coStoryId, 200),
      relationId: text(item.relationId, 200),
      characterId: text(item.characterId, 200),
      turnId: text(item.turnId, 200),
      turnIndex: Math.max(0, Number(item.turnIndex) || 0),
      actor: item.actor,
      actionMode: item.actionMode,
      action: text(item.action, 2000) || undefined,
      narrative: text(item.narrative),
      dialogue: Array.isArray(item.dialogue) ? item.dialogue.slice(0, 50).filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry))).map((entry) => ({ speaker: text(entry.speaker, 200), text: text(entry.text, 2000) })).filter((entry) => entry.speaker && entry.text) : [],
      choices: Array.isArray(item.choices) ? item.choices.slice(0, 8).filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry))).map((entry) => ({ id: text(entry.id, 100), label: text(entry.label, 500), consequenceHint: text(entry.consequenceHint, 500) || undefined })).filter((entry) => entry.id && entry.label) : [],
      risk: item.risk,
      requiresUserApproval: Boolean(item.requiresUserApproval),
      visibleTo: Array.isArray(item.visibleTo) ? item.visibleTo.filter((entry): entry is "user" | "ai_friend" => entry === "user" || entry === "ai_friend") : ["user"],
      createdAt: Number(item.createdAt) || Date.now(),
    })).filter((item) => item.turnId && item.coStoryId && item.narrative && ["user", "ai_friend", "system"].includes(String(item.actor)) && ["low", "major"].includes(String(item.risk)))
    : [];
  return { version: READING_CO_STORY_STORE_VERSION, stories: stories as ReadingCoStoryStore["stories"], turns: turns as ReadingCoStoryStore["turns"] };
}
