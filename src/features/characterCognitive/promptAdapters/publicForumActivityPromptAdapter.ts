import type {
  PublicForumCognitiveContext,
  PublicForumEvent,
  PublicWorldSetting,
} from "../../../domain/publicCognitive/publicForumCognitiveTypes";

/** Prompt-safe public information for one public forum activity actor. */
export interface PublicForumActivityPromptContext {
  character: {
    name: string;
    age?: string | number;
    gender?: string;
    mbti?: string;
    personality: string;
    backstory: string;
  };
  publicEvents: readonly Pick<PublicForumEvent, "kind" | "summary" | "occurredAt" | "confidence">[];
  publicWorldKnowledge: readonly Pick<PublicWorldSetting, "title" | "content">[];
  behaviorConstraints: readonly string[];
  knowledgeBoundary: {
    known: readonly string[];
    unknown: readonly string[];
    forbidden: readonly string[];
  };
  currentTime: {
    date: string;
    time: string;
    timezone?: string;
    period?: string;
  };
}

/** Projects a public-only cognitive snapshot without preserving internal scope. */
export function buildPublicForumActivityPromptContext(
  context: PublicForumCognitiveContext,
): PublicForumActivityPromptContext {
  return {
    character: { ...context.publicCharacterProfile },
    publicEvents: context.publicEvents.map((event) => ({ ...event })),
    publicWorldKnowledge: context.publicWorldSettings.map((setting) => ({ ...setting })),
    behaviorConstraints: [...context.publicKnowledgeBoundary.forbidden],
    knowledgeBoundary: {
      known: [...context.publicKnowledgeBoundary.known],
      unknown: [...context.publicKnowledgeBoundary.unknown],
      forbidden: [...context.publicKnowledgeBoundary.forbidden],
    },
    currentTime: {
      date: context.currentTime.date,
      time: context.currentTime.time,
      ...(context.currentTime.timezone ? { timezone: context.currentTime.timezone } : {}),
      ...(context.currentTime.period ? { period: context.currentTime.period } : {}),
    },
  };
}

/** Formats an optional public supplement for a named public activity slot. */
export function formatPublicForumActivityPromptContext(
  context: PublicForumActivityPromptContext | undefined,
): string {
  if (!context) return "";

  const persona = [
    `- Name: ${context.character.name}`,
    ...(context.character.personality ? [`- Personality: ${context.character.personality}`] : []),
    ...(context.character.backstory ? [`- Background: ${context.character.backstory}`] : []),
  ];
  const events = context.publicEvents.map((event) => `- ${event.summary}`);
  const worldKnowledge = context.publicWorldKnowledge
    .map((setting) => `- ${setting.title}: ${setting.content}`);
  const constraints = context.behaviorConstraints.map((constraint) => `- ${constraint}`);

  return [
    "[PUBLIC FORUM ACTIVITY COGNITIVE CONTEXT]",
    "Generate only public forum content. Do not infer relationships, shared scenes, private messages, user experiences, preferences, or unverified events.",
    "Public character profile:",
    ...persona,
    ...(events.length > 0 ? ["Verified public events:", ...events] : []),
    ...(worldKnowledge.length > 0 ? ["Public world knowledge:", ...worldKnowledge] : []),
    ...(constraints.length > 0 ? ["Public behavior constraints:", ...constraints] : []),
    `Time context: ${context.currentTime.date} ${context.currentTime.time}${context.currentTime.period ? ` (${context.currentTime.period})` : ""}`,
  ].join("\n");
}
