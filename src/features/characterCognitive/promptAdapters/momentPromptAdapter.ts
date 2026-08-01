import {
  projectPromptPersona,
  projectPromptTime,
  selectMomentPublicFacts,
} from "./promptVisibilityPolicy";
import type { MomentPromptAdapterOptions, MomentPromptContext } from "./types";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";

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
): MomentPromptContext {
  const publicContext = options?.publicContext;
  return {
    persona: projectPublicMomentPersona(context, options),
    publicFacts: selectMomentPublicFacts(context),
    publicEvents: publicContext?.publicEvents.map(({ kind, summary, occurredAt, confidence }) => ({
      kind,
      summary,
      occurredAt,
      confidence,
    })) ?? [],
    publicWorldKnowledge: publicContext?.publicWorldSettings.map(({ title, content }) => ({ title, content })) ?? [],
    // CharacterCognitiveContext constraints are relation-private until a
    // separate explicit public-constraint contract exists.
    behaviorConstraints: [],
    time: projectPublicMomentTime(context, options),
  };
}

/**
 * Formats the deliberately public-safe Moment supplement. The existing Moment
 * prompt remains responsible for the task, history, WorldBook, and UI-facing
 * wording; this block supplies only adapter-projected context.
 */
export function formatMomentPromptContext(context: MomentPromptContext | undefined): string {
  if (!context) return "";

  const persona = [
    `- Name: ${context.persona.name}`,
    ...(context.persona.personality ? [`- Personality: ${context.persona.personality}`] : []),
    ...(context.persona.backstory ? [`- Background: ${context.persona.backstory}`] : []),
  ];
  const facts = context.publicFacts.map((fact) => `- ${fact.content}`);
  const events = context.publicEvents.map((event) => `- ${event.summary}`);
  const worldKnowledge = context.publicWorldKnowledge.map((setting) => `- ${setting.title}: ${setting.content}`);
  const constraints = context.behaviorConstraints.map((constraint) => `- ${constraint.description}`);

  return [
    "[PUBLIC-SAFE MOMENT COGNITIVE CONTEXT]",
    "Use only the verified public-safe information below when directly relevant. Do not invent shared scenes, locations, actions, or user experiences.",
    "Character focus:",
    ...persona,
    ...(facts.length > 0 ? ["Verified public facts:", ...facts] : []),
    ...(events.length > 0 ? ["Verified public events:", ...events] : []),
    ...(worldKnowledge.length > 0 ? ["Public world knowledge:", ...worldKnowledge] : []),
    ...(constraints.length > 0 ? ["Behavior constraints:", ...constraints] : []),
    `Time context: ${context.time.date} ${context.time.time}${context.time.period ? ` (${context.time.period})` : ""}`,
  ].join("\n");
}
