import {
  projectPromptPersona,
  projectPromptTime,
  selectMomentPublicFacts,
} from "./promptVisibilityPolicy";
import type { MomentPromptAdapterOptions, MomentPromptContext } from "./types";
import type {
  CharacterCognitiveContext,
  CharacterCognitiveRoutineContext,
} from "../../../domain/characterCognitive/characterCognitiveTypes";

const DEFAULT_PUBLIC_HISTORY_LIMIT = 8;
const DEFAULT_PUBLIC_COMMENT_LIMIT = 12;
const MAX_PUBLIC_HISTORY_ITEM_LENGTH = 180;

const bounded = (requested: number | undefined, fallback: number): number =>
  Math.max(0, Math.floor(requested ?? fallback));

const compactPublicText = (value: string): string => value.trim().slice(0, MAX_PUBLIC_HISTORY_ITEM_LENGTH);

type MomentPromptContextWithRoutine = MomentPromptContext & {
  routineContext?: CharacterCognitiveRoutineContext;
};

function projectMomentRoutineContext(
  context: CharacterCognitiveContext,
): Pick<MomentPromptContextWithRoutine, "routineContext"> {
  if (!context.routineContext) return {};
  return {
    routineContext: {
      period: context.routineContext.period,
      state: context.routineContext.state,
    },
  };
}

function projectPublicMomentPersona(
  context: CharacterCognitiveContext,
  options: MomentPromptAdapterOptions | undefined,
) {
  const profile = options?.publicContext?.publicCharacterProfile;
  if (!profile) return projectPromptPersona(context);
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
  context: CharacterCognitiveContext,
  options: MomentPromptAdapterOptions | undefined,
) {
  const currentTime = options?.publicContext?.currentTime;
  if (!currentTime) return projectPromptTime(context);
  return {
    date: currentTime.date,
    time: currentTime.time,
    ...(currentTime.timezone ? { timezone: currentTime.timezone } : {}),
    ...(currentTime.period ? { period: currentTime.period } : {}),
  };
}

/**
 * Builds a deny-by-default public Moment projection. `safe` relation facts
 * are intentionally not public: only the dedicated public context may supply
 * events or world knowledge to a public post.
 */
export function buildMomentPromptContext(
  context: CharacterCognitiveContext,
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
    publicFacts: publicContext?.authorizedPublicFacts.map(({ content }) => ({ content })) ?? selectMomentPublicFacts(context),
    publicEvents: publicContext?.publicEvents.map(({ kind, summary, occurredAt, confidence }) => ({
      kind,
      summary,
      occurredAt,
      confidence,
    })) ?? [],
    // MomentPublicCognitiveContext intentionally has no Forum/WorldBook input.
    publicWorldKnowledge: [],
    publicMomentHistory,
    publicCommentHistory,
    behaviorConstraints: publicContext?.publicBehaviorConstraints.map(({ description }) => ({ description })) ?? [],
    time: projectPublicMomentTime(context, options),
    ...projectMomentRoutineContext(context),
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
  const facts = context.publicFacts.map((fact) => `- ${fact.content}`);
  const events = context.publicEvents.map((event) => `- ${event.summary}`);
  const worldKnowledge = context.publicWorldKnowledge.map((setting) => `- ${setting.title}: ${setting.content}`);
  const momentHistory = context.publicMomentHistory.map((moment) => `- ${moment.authorName}: ${moment.content}`);
  const commentHistory = context.publicCommentHistory.map((comment) => `- ${comment.authorName}: ${comment.content}`);
  const constraints = context.behaviorConstraints.map((constraint) => `- ${constraint.description}`);
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
    "Use only the verified public-safe information below when directly relevant. Do not invent shared scenes, locations, actions, or user experiences.",
    "Character focus:",
    ...persona,
    ...(facts.length > 0 ? ["Verified public facts:", ...facts] : []),
    ...(events.length > 0 ? ["Verified public events:", ...events] : []),
    ...(worldKnowledge.length > 0 ? ["Public world knowledge:", ...worldKnowledge] : []),
    ...(momentHistory.length > 0 ? ["Recent public Moment history (avoid repeating these topics):", ...momentHistory] : []),
    ...(commentHistory.length > 0 ? ["Recent public comment history:", ...commentHistory] : []),
    ...(constraints.length > 0 ? ["Behavior constraints:", ...constraints] : []),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
    ...routineContext,
  ].join("\n");
}
