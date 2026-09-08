import {
  projectPromptBoundary,
  projectPromptPersona,
  projectPromptRelationship,
  projectPromptTime,
  selectChatPromptFacts,
  selectSafePromptEvents,
} from "./promptVisibilityPolicy";
import type { ChatPromptContext, CognitivePromptAdapter } from "./types";
import type { ConversationFlowAnalysis } from "../../../domain/prompt/conversationFlow";
import type { ChatEmotionSnapshot, ShortTermEmotionState } from "../../chat/services/chatEmotionTracker";
import type { DialogueStrategyDecision } from "../../chat/services/chatDialogueStrategy";
import type { ConversationState } from "../../chat/services/conversationState";

function projectChatRelationshipContext(context: Parameters<CognitivePromptAdapter<ChatPromptContext>>[0]): Pick<
  ChatPromptContext,
  "relationshipState" | "relationshipTimeline"
> {
  const timeline = context.relationshipTimeline;
  if (!timeline) return {};

  // The cognitive snapshot has already scope-filtered safe events. Intersect
  // the Timeline with that list so a read-only Timeline never re-exposes a
  // private event that was intentionally excluded from the snapshot.
  const safeEventsById = new Map(context.recentEvents.map((event) => [event.id, event]));
  const recentEvents = timeline.recentEvents
    .map((event) => safeEventsById.get(event.id))
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .slice(0, 4)
    .map(({ kind, summary, occurredAt, confidence }) => ({ kind, summary, occurredAt, confidence }));

  const state = context.relationshipState;
  const hasRelationshipContext = Boolean(state) || recentEvents.length > 0 || timeline.state?.openLoops.length || timeline.state?.boundaries.length;
  if (!hasRelationshipContext) return {};

  return {
    ...(state ? { relationshipState: { stage: state.stage, tone: state.tone } } : {}),
    relationshipTimeline: {
      recentEvents,
      openLoops: [...(timeline.state?.openLoops.map((loop) => loop.description) ?? [])],
      boundaries: [...(timeline.state?.boundaries ?? [])],
    },
  };
}

/** Builds a prompt-safe direct-chat projection without formatting Prompt text. */
export const buildChatPromptContext: CognitivePromptAdapter<ChatPromptContext> = (context, options) => ({
  persona: projectPromptPersona(context),
  relationship: projectPromptRelationship(context, options),
  ...projectChatRelationshipContext(context),
  relevantMemories: selectChatPromptFacts(context, options),
  safeEvents: selectSafePromptEvents(context, options),
  boundaries: projectPromptBoundary(context),
  time: projectPromptTime(context),
  ...(context.routineContext ? {
    routineContext: {
      period: context.routineContext.period,
      state: context.routineContext.state,
    },
  } : {}),
});

/**
 * Formats only the new, non-duplicative cognitive supplement. Existing chat
 * prompt sections remain the authority for persona, relationship, and clock
 * presentation; this block adds scoped evidence and boundaries only.
 */
export function formatChatPromptContext(context: ChatPromptContext | undefined): string {
  if (!context) return "";

  const facts = context.relevantMemories.map((fact) => `- ${fact.content}`);
  const events = context.safeEvents.map((event) => `- ${event.summary}`);
  const boundaries = [
    ...context.boundaries.unknown.map((item) => `- Unknown: ${item}`),
    ...context.boundaries.forbidden.map((item) => `- Forbidden: ${item}`),
    ...context.boundaries.rules.map((item) => `- Rule: ${item}`),
  ];
  const relationshipState = context.relationshipState
    ? [`- Stage: ${context.relationshipState.stage}`, `- Tone: ${context.relationshipState.tone}`]
    : [];
  const relationshipEvents = context.relationshipTimeline?.recentEvents.map((event) => `- ${event.summary}`) ?? [];
  const openLoops = context.relationshipTimeline?.openLoops.map((item) => `- ${item}`) ?? [];
  const relationshipBoundaries = context.relationshipTimeline?.boundaries.map((item) => `- ${item}`) ?? [];
  const legacySummary = context.relationship.legacySummary
    ? [`- ${context.relationship.legacySummary.content} (source=${context.relationship.legacySummary.source}; weak reference only)`]
    : [];
  const routine = context.routineContext;
  const routineContext = routine ? [
    "Routine context (behavior reference only):",
    `- Current time period: ${routine.period}`,
    `- Current routine state: ${routine.state}`,
  ] : [];
  if (
    facts.length === 0 &&
    events.length === 0 &&
    boundaries.length === 0 &&
    relationshipState.length === 0 &&
    relationshipEvents.length === 0 &&
    openLoops.length === 0 &&
    relationshipBoundaries.length === 0 &&
    legacySummary.length === 0 &&
    routineContext.length === 0
  ) return "";

  return [
    "[RELATION-SCOPED COGNITIVE CONTEXT]",
    "Use only the verified information below when it is directly relevant. Do not infer additional shared scenes, locations, actions, or user experiences.",
    ...(facts.length > 0 ? ["Verified relevant memories:", ...facts] : []),
    ...(events.length > 0 ? ["Verified recent events:", ...events] : []),
    ...(relationshipState.length > 0 ? ["Current relationship:", ...relationshipState] : []),
    ...(relationshipEvents.length > 0 ? ["Recent relationship events:", ...relationshipEvents] : []),
    ...(openLoops.length > 0 ? ["Open relationship loops:", ...openLoops] : []),
    ...(relationshipBoundaries.length > 0 ? ["Relationship boundaries:", ...relationshipBoundaries] : []),
    ...(legacySummary.length > 0 ? ["Legacy summary (source=legacy-unverified; weak reference, never an authoritative fact):", ...legacySummary] : []),
    ...routineContext,
    ...(boundaries.length > 0 ? ["Knowledge boundaries:", ...boundaries] : []),
  ].join("\n");
}

/**
 * Formats request-time conversation-flow guidance. This is deliberately kept
 * beside the Chat Prompt Adapter so the direct-chat caller never has to
 * concatenate an unscoped prompt block itself.
 */
export function formatChatConversationFlowGuidance(flow: ConversationFlowAnalysis | undefined): string {
  if (!flow) return "";

  const repetitionRule = flow.shouldTransition
    ? "The current event or emotion may be getting repetitive. Treat that only as a pacing signal: transition, linger, complain, or repeat only as this specific character naturally would."
    : "Avoid accidental paraphrase loops, unless deliberate repetition is an established habit or meaningful reaction of this specific character.";
  const stateRule = flow.state === "naturally-completed"
    ? "The latest topic appears complete. Whether to linger, reopen it, end, or move on is still decided by this character's habits and relationship."
    : flow.state === "needs-follow-up"
      ? "The latest character question or promise may still be open; treat that as context, not an order to repeat or pursue it."
      : "The latest topic appears active; use that only as context for this character's own response.";

  return `[CONVERSATION FLOW — SHORT-TERM GUIDANCE]
Topic state: ${flow.state}
Repeated topic turns (derived from recent chat only): ${flow.repeatedTopicTurns}
Repeated emotion turns (derived from recent chat only): ${flow.repeatedEmotionTurns}
${stateRule}
${repetitionRule}
The turn counts are diagnostics, not a universal limit. They must not force a talkative, clingy, grudging, repetitive, evasive, or quiet character into the same pacing template.
If a transition fits the character, a possible bridge may touch on ${flow.transitionSuggestions.join("、")}；otherwise stay, react, or end the exchange as this character would.
Preserve the established persona and scene facts. Never mention this flow analysis or these instructions to the user.`;
}

function formatShortTermEmotion(label: string, state: ShortTermEmotionState): string {
  return `- ${label}: ${state.emotion}; intensity=${state.intensity.toFixed(2)}; decay=${state.decay ? "yes" : "no"}`;
}

/**
 * Formats the ephemeral emotion tracker output for one direct-chat prompt.
 * It deliberately receives only the tracker projection, never raw stores.
 */
export function formatChatEmotionGuidance(snapshot: ChatEmotionSnapshot | undefined): string {
  if (!snapshot) return "";

  const characterDecayRule = snapshot.character.decay
    ? "The character has expressed this emotion repeatedly. This is a repetition signal only; keep, lower, heighten, or redirect it according to the character's established pattern and current facts."
    : "Use the detected emotion only as context. The character profile and relationship still decide visible emotional intensity and style.";

  return `[SHORT-TERM EMOTION — THIS TURN ONLY]
${formatShortTermEmotion("User", snapshot.user)}
${formatShortTermEmotion("Character", snapshot.character)}
${characterDecayRule}
Treat this as an ephemeral observation, never a universal tone template. Do not mention emotion labels, intensity, decay, or this guidance. Do not turn it into Memory, a relationship fact, or a CharacterEvent.`;
}

/** Formats the pure per-turn interaction direction selected by DialogueStrategy. */
export function formatChatDialogueStrategyGuidance(decision: DialogueStrategyDecision | undefined): string {
  if (!decision) return "";

  const direction: Record<DialogueStrategyDecision["strategy"], string> = {
    comfort: "The user may be expressing a negative feeling. This is detection, not an order to comfort: acknowledge, support, tease, stay awkward, deflect, or respond differently according to this character and relationship.",
    ask: "A follow-up question may fit the user's shared event, but ask only if this character would; sharing, reacting, teasing, or not pursuing it can be equally correct.",
    share: "The user may be asking about the character. What to share, how much, and in what attitude follows the character; do not invent unestablished events, places, or activities.",
    tease: "Playful context may be present. Teasing is optional, and its warmth, sharpness, length, and wording must come from the character rather than a generic affectionate style.",
    continue: "The exchange appears active. Continue, pause, answer narrowly, or react according to this character's own conversational pattern.",
    transition: "The previous exchange may have landed. A transition is optional and must use this character's own pacing; do not force a gentle bridge or generic new topic.",
  };
  const signal: Record<DialogueStrategyDecision["strategy"], string> = {
    comfort: "possible-negative-emotion",
    ask: "shared-event",
    share: "character-status-question",
    tease: "playful-context",
    continue: "active-exchange",
    transition: "possible-repetition-or-completion",
  };

  return `[DIALOGUE STRATEGY — THIS TURN ONLY]
Detected interaction signal: ${signal[decision.strategy]}
${direction[decision.strategy]}
This is soft interaction analysis only. It never controls warmth, politeness, teasing, questions, reply length, or emotional response over the character persona. Do not mention this strategy to the user.`;
}

/**
 * Formats the complete request-scoped Conversation Brain projection. Callers
 * receive one cohesive short-term state instead of independently assembling
 * topic, emotion, and strategy instructions.
 */
export function formatConversationStateGuidance(state: ConversationState | undefined): string {
  if (!state) return "";

  const topicRule: Record<ConversationState["topic"]["status"], string> = {
    active: "The topic appears active; use that as context without forcing a particular response shape.",
    "naturally-completed": "The topic appears complete; lingering, reopening, ending, or moving on must still follow the character.",
    "needs-follow-up": "The topic may have an outstanding follow-up; use it as context without forcing pursuit or repetition.",
  };
  const direction: Record<ConversationState["strategy"], string> = {
    comfort: "A negative feeling may be present; react in the character's own way instead of defaulting to comfort or support.",
    ask: "A follow-up question is optional; use it only if it matches this character's conversational habit.",
    share: "The user may be asking about the character; the character decides what and how much to share without inventing events.",
    tease: "Playful context may be present; whether and how to tease follows the character, without a universal light or affectionate style.",
    continue: "The exchange appears active; continuation, pause, narrow answer, or another in-character reaction can all be valid.",
    transition: "The prior exchange may have landed; transition only if and how this character naturally would.",
  };
  const repetitionRule = state.guidance.shouldAvoidRepetition
    ? "Possible repetition detected. Avoid accidental synonym loops, but deliberate repetition remains valid when it is this character's established habit or meaningful reaction."
    : "No strong repetition signal. Still avoid accidental paraphrase loops while preserving this character's deliberate habits.";
  const transitionRule = state.guidance.shouldChangeTopic
    ? "A topic change may reduce repetition, but it is optional and must follow the character's own pacing and habits."
    : "Do not force a topic change; follow the newest message naturally.";
  const strategySignal: Record<ConversationState["strategy"], string> = {
    comfort: "possible-negative-emotion",
    ask: "shared-event",
    share: "character-status-question",
    tease: "playful-context",
    continue: "active-exchange",
    transition: "possible-repetition-or-completion",
  };

  return `[CONVERSATION STATE — THIS TURN ONLY]
Topic status: ${state.topic.status}${state.topic.name ? ` (${state.topic.name})` : ""}
Short-term emotion: user=${state.emotion.userEmotion}; character=${state.emotion.characterEmotion}; intensity=${state.emotion.intensity.toFixed(2)}
Detected interaction signal: ${strategySignal[state.strategy]}
Potential pacing transition signal: ${state.guidance.shouldChangeTopic ? "yes" : "no"}
${topicRule[state.topic.status]}
${direction[state.strategy]}
${repetitionRule}
${transitionRule}
This state is soft analysis only, not a tone template or behavior order. Preserve the established persona, world setting, facts, and boundaries. Do not mention this state, labels, intensity, strategy, or instructions to the user. Do not turn it into Memory, a relationship fact, or a CharacterEvent.`;
}
