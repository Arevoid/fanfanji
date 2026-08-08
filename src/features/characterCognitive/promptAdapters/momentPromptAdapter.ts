import {
  projectPromptPersona,
  projectPromptTime,
  selectChatPromptFacts,
  selectMomentPublicFacts,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { MomentPromptAdapterOptions, MomentPromptContext } from "./types";
import type {
  CharacterCognitiveContext,
  CharacterCognitiveRoutineContext,
} from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { MomentPublicCognitiveContext } from "../../../domain/momentCognitive/momentPublicCognitiveTypes";

const DEFAULT_PUBLIC_HISTORY_LIMIT = 8;
const DEFAULT_PUBLIC_COMMENT_LIMIT = 12;
const MAX_PUBLIC_HISTORY_ITEM_LENGTH = 180;

const bounded = (requested: number | undefined, fallback: number): number =>
  Math.max(0, Math.floor(requested ?? fallback));

const compactPublicText = (value: string): string => value.trim().slice(0, MAX_PUBLIC_HISTORY_ITEM_LENGTH);

type MomentPromptContextWithRoutine = MomentPromptContext & {
  routineContext?: CharacterCognitiveRoutineContext;
  topicContext?: {
    recentTopics: readonly string[];
    repeatedTopics: readonly string[];
    cooldownTopics: readonly string[];
  };
};

function projectRelationMomentContext(options: MomentPromptAdapterOptions | undefined): Pick<
  MomentPromptContext,
  "relationship" | "relationFacts" | "relationEvents"
> {
  const context = options?.relationContext;
  if (!context) return { relationFacts: [], relationEvents: [] };
  return {
    // A Moment may use the relationship stage as immediate context, but a
    // legacy summary is intentionally omitted: only confirmed facts/events
    // are eligible material for a relationship-scoped Moment.
    relationship: { stage: context.relationship.stage },
    relationFacts: selectChatPromptFacts(context, options),
    relationEvents: selectSafePromptEvents(context, options),
  };
}

function projectMomentRoutineContext(
  context: CharacterCognitiveContext | undefined,
  options?: MomentPromptAdapterOptions,
): Pick<MomentPromptContextWithRoutine, "routineContext"> {
  const routine = context?.routineContext || options?.publicContext?.routineContext;
  if (!routine) return {};
  return {
    routineContext: {
      period: routine.period,
      state: routine.state,
    },
  };
}

function projectPublicMomentPersona(
  context: CharacterCognitiveContext | undefined,
  options: MomentPromptAdapterOptions | undefined,
) {
  const profile = options?.publicContext?.publicCharacterProfile;
  if (!profile) {
    if (context) return projectPromptPersona(context);
    return { name: "", personality: "", backstory: "" };
  }
  return {
    name: profile.name,
    ...(profile.age === undefined ? {} : { age: profile.age }),
    ...(profile.gender === undefined ? {} : { gender: profile.gender }),
    ...(profile.mbti === undefined ? {} : { mbti: profile.mbti }),
    personality: profile.personality,
    backstory: profile.backstory,
  };
}

function projectPublicMomentTime(
  context: CharacterCognitiveContext | undefined,
  options: MomentPromptAdapterOptions | undefined,
) {
  const currentTime = options?.publicContext?.currentTime;
  if (!currentTime) {
    if (context) return projectPromptTime(context);
    return { date: "", time: "" };
  }
  return {
    date: currentTime.date,
    time: currentTime.time,
    ...(currentTime.timezone ? { timezone: currentTime.timezone } : {}),
    ...(currentTime.period ? { period: currentTime.period } : {}),
  };
}

function boundedTopicHints(topics: readonly string[] | undefined, limit: number): string[] {
  if (!topics) return [];
  return topics
    .map((topic) => compactPublicText(topic))
    .filter(Boolean)
    .slice(0, limit);
}

function projectMomentTopicContext(
  context: CharacterCognitiveContext | undefined,
  options: MomentPromptAdapterOptions | undefined,
): Pick<MomentPromptContextWithRoutine, "topicContext"> {
  const topicContext = options?.publicContext?.topicContext;
  if (!topicContext) return {};
  return {
    topicContext: {
      recentTopics: boundedTopicHints(topicContext.recentTopics, DEFAULT_PUBLIC_HISTORY_LIMIT),
      repeatedTopics: boundedTopicHints(topicContext.repeatedTopics, 4),
      cooldownTopics: boundedTopicHints(topicContext.cooldownTopics, DEFAULT_PUBLIC_HISTORY_LIMIT),
    },
  };
}

/**
 * Builds a deny-by-default public Moment projection. `safe` relation facts
 * are intentionally not public: only the dedicated public context may supply
 * events or world knowledge to a public post.
 */
export function buildMomentPromptContext(
  context: CharacterCognitiveContext | undefined,
  options?: MomentPromptAdapterOptions,
): MomentPromptContextWithRoutine {
  const publicContext = options?.publicContext;
  const publicMomentHistory = publicContext
    ? [...publicContext.publicMomentHistory]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, bounded(options?.maxPublicHistory, DEFAULT_PUBLIC_HISTORY_LIMIT))
      .map(({ authorName, content, timestamp, imageDescription }) => ({
        authorName,
        content: compactPublicText(content),
        timestamp,
        ...(imageDescription ? { imageDescription: compactPublicText(imageDescription) } : {}),
      }))
    : [];
  const publicCommentHistory = publicContext
    ? [...publicContext.publicCommentHistory]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, bounded(options?.maxPublicComments, DEFAULT_PUBLIC_COMMENT_LIMIT))
      .map(({ authorName, content, timestamp }) => ({
        authorName,
        content: compactPublicText(content),
        timestamp,
      }))
    : [];
  return {
    persona: projectPublicMomentPersona(context, options),
    ...projectRelationMomentContext(options),
    publicFacts: publicContext?.authorizedPublicFacts.map(({ content }) => ({ content })) ?? selectMomentPublicFacts(context),
    publicEvents: publicContext?.publicEvents.map(({ kind, summary, occurredAt, confidence }) => ({
      kind,
      summary,
      occurredAt,
      confidence,
    })) ?? [],
    // Callers pass only WorldBook entries already filtered for the same
    // character, identity and relation. The adapter removes all scope IDs.
    publicWorldKnowledge: [...(options?.relationWorldKnowledge || [])]
      .map(({ title, content }) => ({ title, content }))
      .filter(({ title, content }) => Boolean(title.trim() && content.trim())),
    publicMomentHistory,
    publicCommentHistory,
    behaviorConstraints: publicContext?.publicBehaviorConstraints.map(({ description }) => ({ description })) ?? [],
    time: projectPublicMomentTime(context, options),
    ...projectMomentRoutineContext(context, options),
    ...projectMomentTopicContext(context, options),
  };
}

/**
 * Public Moment entry point. It accepts only the dedicated public snapshot,
 * so a public generation caller cannot accidentally provide relation-scoped
 * Memory, RelationshipState, CharacterEvent, or InnerVoice.
 */
export function buildMomentPromptContextFromPublicContext(
  publicContext: MomentPublicCognitiveContext,
  options?: Omit<MomentPromptAdapterOptions, "publicContext">,
): MomentPromptContextWithRoutine {
  return buildMomentPromptContext(undefined, { ...options, publicContext });
}

/** Appends the public projection while preserving the caller's task prompt. */
export function appendMomentPublicPromptContext<T extends { systemInstruction?: string }>(
  request: T,
  publicContext: MomentPublicCognitiveContext | undefined,
  options?: Omit<MomentPromptAdapterOptions, "publicContext">,
): T {
  if (!publicContext && !options?.relationContext && !(options?.relationWorldKnowledge?.length)) return request;
  const supplement = formatMomentPromptContext(buildMomentPromptContext(
    options?.relationContext,
    { ...options, publicContext },
  ));
  if (!supplement) return request;
  return {
    ...request,
    systemInstruction: [request.systemInstruction, supplement].filter(Boolean).join("\n\n"),
  };
}

/**
 * Formats the deliberately public-safe Moment supplement. The existing Moment
 * prompt remains responsible for the task, history, WorldBook, and UI-facing
 * wording; this block supplies only adapter-projected context.
 */
export function formatMomentPromptContext(context: MomentPromptContextWithRoutine | undefined): string {
  if (!context) return "";

  const persona = [
    `- Name: ${context.persona.name}`,
    ...(context.persona.personality ? [`- Personality: ${context.persona.personality}`] : []),
    ...(context.persona.backstory ? [`- Background: ${context.persona.backstory}`] : []),
  ];
  const relationship = context.relationship
    ? [
      "Current relationship context (only this character and this user identity):",
      `- Relationship stage: ${context.relationship.stage}`,
      ...(context.relationship.legacySummary ? [`- Historical relationship note (weak reference): ${context.relationship.legacySummary.content}`] : []),
    ]
    : [];
  const relationFacts = context.relationFacts.map((fact) => `- ${fact.content}`);
  const relationEvents = context.relationEvents.map((event) => `- ${event.summary}`);
  const facts = context.publicFacts.map((fact) => `- ${fact.content}`);
  const events = context.publicEvents.map((event) => `- ${event.summary}`);
  const worldKnowledge = context.publicWorldKnowledge.map((setting) => `- ${setting.title}: ${setting.content}`);
  const momentHistory = context.publicMomentHistory.map((moment) => `- ${moment.authorName}: ${moment.content}`);
  const commentHistory = context.publicCommentHistory.map((comment) => `- ${comment.authorName}: ${comment.content}`);
  const constraints = context.behaviorConstraints.map((constraint) => `- ${constraint.description}`);
  const topicContext = context.topicContext;
  const recentTopics = topicContext?.recentTopics.map((topic) => `- ${topic}`) ?? [];
  const repeatedTopics = topicContext?.repeatedTopics.map((topic) => `- ${topic}`) ?? [];
  const cooldownTopics = topicContext?.cooldownTopics.map((topic) => `- ${topic}`) ?? [];
  const topicGuidance = topicContext && (recentTopics.length > 0 || repeatedTopics.length > 0 || cooldownTopics.length > 0)
    ? [
      "Topic diversity guidance (hints only; not facts or hard bans):",
      ...(recentTopics.length > 0 ? ["Recent public topics:", ...recentTopics] : []),
      ...(repeatedTopics.length > 0 ? ["Recently repeated topics:", ...repeatedTopics] : []),
      ...(cooldownTopics.length > 0 ? ["Topics currently in cooldown:", ...cooldownTopics] : []),
      "Vary the next topic when possible without inventing private experiences.",
    ]
    : [];
  const routine = context.routineContext;
  const routineContext = routine ? [
    "Routine context (behavior reference only):",
    `- Current time period: ${routine.period}`,
    `- Current routine state: ${routine.state}`,
    ...(routine.state === "sleeping"
      ? ["- Prefer quiet, low-activity topics; do not invent a high-activity scene and do not block generation."]
      : []),
  ] : [];

  return [
    "[MOMENT COGNITIVE CONTEXT]",
    "Use only the scoped, confirmed information below when directly relevant. Do not invent shared scenes, locations, actions, or user experiences.",
    "Character focus:",
    ...persona,
    ...relationship,
    ...(relationEvents.length > 0 ? ["Confirmed events in this relationship:", ...relationEvents] : []),
    ...(relationFacts.length > 0 ? ["Remembered facts in this relationship:", ...relationFacts] : []),
    ...(facts.length > 0 ? ["Verified public facts:", ...facts] : []),
    ...(events.length > 0 ? ["Verified public events:", ...events] : []),
    ...(worldKnowledge.length > 0 ? ["Public world knowledge:", ...worldKnowledge] : []),
    ...(momentHistory.length > 0 ? ["Recent public Moment history (avoid repeating these topics):", ...momentHistory] : []),
    ...(commentHistory.length > 0 ? ["Recent public comment history:", ...commentHistory] : []),
    ...topicGuidance,
    ...(constraints.length > 0 ? ["Behavior constraints:", ...constraints] : []),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
    ...routineContext,
  ].join("\n");
}
