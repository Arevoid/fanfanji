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

const parsePromptLocalNow = (date: string, time: string): number => {
  const match = `${date} ${time}`.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return Date.now();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])).getTime();
};

const formatDatedMomentItem = (content: string, occurredAt: number | undefined, now: number): string => {
  if (!occurredAt || !Number.isFinite(occurredAt)) return `- ${content}`;
  const date = new Date(occurredAt);
  const nowDate = new Date(now);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const nowStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const days = Math.round((nowStart - start) / 86_400_000);
  const relative = days === 0 ? "今天" : days === 1 ? "昨天" : days === 2 ? "前天" : days > 2 ? `${days}天前` : "未来时间（不可当作已发生）";
  const absolute = date.toLocaleString("zh-CN", { hour12: false });
  return `- [实际发生于 ${absolute}；相对本条朋友圈为“${relative}”] ${content}`;
};

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
  const selectedFacts = selectChatPromptFacts(context, options);
  return {
    // A Moment may use the relationship stage as immediate context, but a
    // legacy summary is intentionally omitted: only confirmed facts/events
    // are eligible material for a relationship-scoped Moment.
    relationship: { stage: context.relationship.stage },
    relationFacts: selectedFacts.map((fact) => ({
      ...fact,
      timestamp: context.knownFacts.find((candidate) => candidate.content === fact.content)?.timestamp,
    })),
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
 * Builds a public-safe Moment projection. The caller may deliberately supply
 * confirmed facts/events from this exact relationship, while the dedicated
 * public context remains the only source for public history and constraints.
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
    // Callers pass only entries explicitly visible to the public scenario.
    // The adapter removes all storage/scope metadata.
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
 * Public Moment entry point. Public history comes only from the dedicated
 * snapshot. Callers may additionally provide the deliberately projected,
 * confirmed facts/events of this exact relationship; raw stores and chat
 * history are never accepted here.
 */
export function buildMomentPromptContextFromPublicContext(
  publicContext: MomentPublicCognitiveContext,
  options?: Omit<MomentPromptAdapterOptions, "publicContext">,
): MomentPromptContextWithRoutine {
  return buildMomentPromptContext(undefined, { ...options, publicContext });
}

/** Appends the public-safe projection while preserving the caller's task prompt. */
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
  const instruction = request.systemInstruction || "";
  const finalLanguageIndex = instruction.lastIndexOf("[FINAL OUTPUT LANGUAGE — HIGHEST PRIORITY]");
  const baseInstruction = finalLanguageIndex >= 0 ? instruction.slice(0, finalLanguageIndex).trim() : instruction;
  const finalLanguageInstruction = finalLanguageIndex >= 0 ? instruction.slice(finalLanguageIndex).trim() : "";
  return {
    ...request,
    systemInstruction: [baseInstruction, supplement, finalLanguageInstruction].filter(Boolean).join("\n\n"),
  };
}

/**
 * Formats the deliberately public-safe Moment supplement. The existing Moment
 * prompt remains responsible for the task and UI-facing wording; this block
 * supplies public inputs plus explicitly confirmed same-relation facts.
 */
export function formatMomentPromptContext(context: MomentPromptContextWithRoutine | undefined): string {
  if (!context) return "";

  const promptNow = parsePromptLocalNow(context.time.date, context.time.time);

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
  const relationFacts = context.relationFacts.map((fact) => formatDatedMomentItem(fact.content, fact.timestamp, promptNow));
  const relationEvents = context.relationEvents.map((event) => formatDatedMomentItem(event.summary, event.occurredAt, promptNow));
  const facts = context.publicFacts.map((fact) => `- ${fact.content}`);
  const events = context.publicEvents.map((event) => formatDatedMomentItem(event.summary, event.occurredAt, promptNow));
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
    "[PUBLIC-SAFE MOMENT COGNITIVE CONTEXT]",
    "Use only the scoped, confirmed information below when directly relevant. Do not invent shared scenes, locations, actions, or user experiences.",
    "Every supplied occurrence timestamp and its relative-day label is authoritative. Never rewrite a yesterday/earlier event as happening today, this morning, or this noon.",
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
