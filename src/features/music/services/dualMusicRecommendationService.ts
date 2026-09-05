import type {
  Character,
  MemoryItem,
  Message,
  MusicTrack,
  RelationshipMusicState,
  UserSettings,
} from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { serializeMessageContentForPrompt } from "../../chat/prompts/messagePromptSerializer";

export interface MusicRecommendationResult {
  trackId: string;
  reason?: string;
  source: "ai" | "local";
}

interface AiRequest {
  message: string;
  history: Array<{ role: string; text: string }>;
  systemInstruction?: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
}

const parseRecommendation = (text: string, validIds: ReadonlySet<string>) => {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return undefined;
  try {
    const parsed = JSON.parse(jsonText) as { trackId?: unknown; reason?: unknown };
    if (typeof parsed.trackId !== "string" || !validIds.has(parsed.trackId)) return undefined;
    return {
      trackId: parsed.trackId,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 160) : undefined,
    };
  } catch {
    return undefined;
  }
};

export const chooseLocalLibraryTrack = (
  tracks: readonly MusicTrack[],
  recentTrackIds: readonly string[],
  random: () => number = Math.random,
) => {
  const recent = new Set(recentTrackIds);
  const fresh = tracks.filter((track) => !recent.has(track.id));
  const pool = fresh.length ? fresh : [...tracks];
  if (!pool.length) return undefined;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id;
};

export async function recommendDualMusicTrack(input: {
  tracks: readonly MusicTrack[];
  character: Character;
  relationship: CharacterRelationship;
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  currentState?: RelationshipMusicState;
  settings: UserSettings;
  requestAi?: (request: AiRequest) => Promise<{ text: string }>;
  random?: () => number;
}): Promise<MusicRecommendationResult | undefined> {
  if (!input.tracks.length) return undefined;
  const relationMessages = input.messages
    .filter((message) => message.relationId === input.relationship.id && !message.isOffline)
    .slice(-16);
  const relationMemories = input.memories
    .filter((memory) => memory.relationId === input.relationship.id)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8);
  const validIds = new Set(input.tracks.map((track) => track.id));
  const canUseAi = Boolean(input.requestAi && input.settings.apiKey?.trim() && input.settings.selectedModel?.trim());

  if (canUseAi) {
    try {
      const response = await input.requestAi!({
        message: "Select exactly one track from the supplied local library for the character to be listening to now.",
        history: [],
        systemInstruction: `You select music only from a user's existing local library.
Return JSON only: {"trackId":"an exact candidate id","reason":"brief private reason"}.
Never invent a track, id, URL, artist or title.

Character:
${input.character.name}
Personality: ${input.character.personality || ""}
Background: ${input.character.backstory || ""}
Relationship: ${input.relationship.relationship}
Do not infer shared scenes or private facts that are not present in the scoped context below.

Recent direct-chat context:
${relationMessages.map((message) => `${message.sender}: ${serializeMessageContentForPrompt(message, { mode: "history", characterName: input.character.name })}`).join("\n")}

Relevant relation memories:
${relationMemories.map((memory) => `- ${memory.content}`).join("\n")}

Current/recent track ids:
${[input.currentState?.currentTrackId, ...(input.currentState?.recentTrackIds || [])].filter(Boolean).join(", ")}

Candidate library:
${input.tracks.map((track) => `- id=${track.id}; title=${track.title}; artist=${track.artist}`).join("\n")}`,
        apiKey: input.settings.apiKey,
        model: input.settings.selectedModel,
        apiEndpoint: input.settings.apiEndpoint,
        apiTemperature: 0.3,
      });
      const parsed = parseRecommendation(response.text, validIds);
      if (parsed) return { ...parsed, source: "ai" };
    } catch {
      // Existing relation state is stable: an upstream failure must not replace it.
    }
    if (input.currentState?.currentTrackId && validIds.has(input.currentState.currentTrackId)) {
      return {
        trackId: input.currentState.currentTrackId,
        reason: input.currentState.selectionReason,
        source: input.currentState.selectionSource || "local",
      };
    }
  }

  const trackId = chooseLocalLibraryTrack(
    input.tracks,
    [input.currentState?.currentTrackId, ...(input.currentState?.recentTrackIds || [])].filter((id): id is string => Boolean(id)),
    input.random,
  );
  return trackId ? { trackId, reason: "本地音乐库选择", source: "local" } : undefined;
}

export const applyRelationshipRecommendation = (
  states: readonly RelationshipMusicState[],
  input: {
    relationship: CharacterRelationship;
    characterId: string;
    recommendation: MusicRecommendationResult;
    now?: number;
  },
) => {
  const now = input.now ?? Date.now();
  const previous = states.find((state) => state.relationId === input.relationship.id);
  const next: RelationshipMusicState = {
    relationId: input.relationship.id,
    conversationId: input.relationship.conversationId,
    characterId: input.characterId,
    currentTrackId: input.recommendation.trackId,
    recentTrackIds: [
      input.recommendation.trackId,
      ...(previous?.recentTrackIds || []).filter((id) => id !== input.recommendation.trackId),
    ].slice(0, 20),
    selectedAt: now,
    nextRefreshAt: now + 24 * 60 * 60 * 1000,
    selectionReason: input.recommendation.reason,
    selectionSource: input.recommendation.source,
    updatedAt: now,
  };
  return [...states.filter((state) => state.relationId !== input.relationship.id), next];
};
