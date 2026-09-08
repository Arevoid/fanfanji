import {
  PUBLIC_FORUM_COGNITIVE_CONTEXT_SCHEMA_VERSION,
  type BuildPublicForumCognitiveContextInput,
  type PublicCharacterProfile,
  type PublicForumCognitiveContext,
  type PublicForumKnowledgeBoundary,
  type PublicForumTimeContext,
} from "./publicForumCognitiveTypes";
import { selectPublicEvents, selectPublicWorldSettings } from "./publicVisibilityPolicy";

const DEFAULT_PUBLIC_KNOWLEDGE_BOUNDARY: PublicForumKnowledgeBoundary = {
  known: ["Explicitly public character profile, public events, and public world settings."],
  unknown: ["Private facts from any relationship, conversation, Memory, InnerVoice, or OfflineStory."],
  forbidden: ["Internal IDs, private events, relationship facts, inferred shared scenes, and unverified experiences."],
};

function projectPublicCharacterProfile(input: BuildPublicForumCognitiveContextInput): PublicCharacterProfile {
  const { character } = input;
  return {
    name: character.name,
    ...(character.age === undefined ? {} : { age: character.age }),
    ...(character.gender === undefined ? {} : { gender: character.gender }),
    ...(character.mbti === undefined ? {} : { mbti: character.mbti }),
    personality: character.personality,
    backstory: character.backstory,
  };
}

function projectCurrentTime(input: BuildPublicForumCognitiveContextInput): PublicForumTimeContext {
  const { currentTime } = input;
  const iso = new Date(currentTime.now).toISOString();
  return {
    now: currentTime.now,
    date: currentTime.date || iso.slice(0, 10),
    time: currentTime.time || iso.slice(11, 16),
    ...(currentTime.timezone ? { timezone: currentTime.timezone } : {}),
    ...(currentTime.period ? { period: currentTime.period } : {}),
  };
}

function buildPublicKnowledgeBoundary(
  input: BuildPublicForumCognitiveContextInput,
): PublicForumKnowledgeBoundary {
  const override = input.publicKnowledgeBoundary;
  return {
    known: [...(override?.known || DEFAULT_PUBLIC_KNOWLEDGE_BOUNDARY.known)],
    unknown: [...(override?.unknown || DEFAULT_PUBLIC_KNOWLEDGE_BOUNDARY.unknown)],
    forbidden: [...(override?.forbidden || DEFAULT_PUBLIC_KNOWLEDGE_BOUNDARY.forbidden)],
  };
}

/**
 * Pure public-domain builder. The input deliberately has no relationship,
 * identity, conversation, Memory, InnerVoice, or OfflineStory parameter.
 */
export function buildPublicForumCognitiveContext(
  input: BuildPublicForumCognitiveContextInput,
): PublicForumCognitiveContext {
  return {
    schemaVersion: PUBLIC_FORUM_COGNITIVE_CONTEXT_SCHEMA_VERSION,
    createdAt: input.currentTime.now,
    publicCharacterProfile: projectPublicCharacterProfile(input),
    publicEvents: selectPublicEvents(input.events || []),
    publicWorldSettings: selectPublicWorldSettings(input.worldSettings || []),
    publicKnowledgeBoundary: buildPublicKnowledgeBoundary(input),
    currentTime: projectCurrentTime(input),
  };
}
