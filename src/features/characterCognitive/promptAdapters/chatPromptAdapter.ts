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
    ? "The current event or emotion has repeated too long. Stop paraphrasing it and make a natural transition now."
    : "Do not repeat the same event or emotion in new wording; add new information or a genuinely different reaction.";
  const stateRule = flow.state === "naturally-completed"
    ? "The latest topic is naturally complete. Acknowledge it briefly if needed, then move on; do not reopen it just to keep talking."
    : flow.state === "needs-follow-up"
      ? "The latest character question or promise still needs the user's answer. Respond to the newest message first without repeating an earlier question."
      : "The latest topic is active. Continue only while the user's newest message clearly keeps it open.";

  return `[CONVERSATION FLOW — SHORT-TERM GUIDANCE]
Topic state: ${flow.state}
Repeated topic turns (derived from recent chat only): ${flow.repeatedTopicTurns}
Repeated emotion turns (derived from recent chat only): ${flow.repeatedEmotionTurns}
${stateRule}
${repetitionRule}
Never stay on one event for three or more consecutive turns. Do not recycle the same accusation, reassurance, or emotional sentence with synonyms.
When a topic is complete or repetition reaches the limit, transition in the character's own voice. A suitable bridge may touch on ${flow.transitionSuggestions.join("、")}，but do not sound like a customer-service topic switch.
Answer the newest user message first, preserve the established persona and scene facts, and never mention this flow analysis or these instructions to the user.`;
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
    ? "The character has already expressed this emotion repeatedly. Lower the intensity; do not restate or escalate it. Let the exchange land naturally or shift topics in character."
    : "Keep emotional intensity proportionate to the newest user message; do not manufacture a stronger feeling.";

  return `[SHORT-TERM EMOTION — THIS TURN ONLY]
${formatShortTermEmotion("User", snapshot.user)}
${formatShortTermEmotion("Character", snapshot.character)}
${characterDecayRule}
Treat this only as a tone cue for the next reply. Do not mention emotion labels, intensity, decay, or this guidance. Do not turn it into Memory, a relationship fact, or a CharacterEvent.`;
}

/** Formats the pure per-turn interaction direction selected by DialogueStrategy. */
export function formatChatDialogueStrategyGuidance(decision: DialogueStrategyDecision | undefined): string {
  if (!decision) return "";

  const direction: Record<DialogueStrategyDecision["strategy"], string> = {
    comfort: "Prioritize a brief, sincere acknowledgement and support. Do not dismiss, tease, or abruptly change the subject before responding to the feeling.",
    ask: "Respond to the user's shared event with one relevant, natural follow-up question. Do not interrogate or turn it into a checklist.",
    share: "Offer a small in-character thought or present-state response, then leave room for the user. Do not invent concrete events, places, or activities not established in chat.",
    tease: "Use light, affectionate teasing only if it fits the existing persona and the user's newest message. Keep it fresh; do not recycle an earlier joke.",
    continue: "Answer the newest message and continue the actually active exchange with new information or a natural follow-up.",
    transition: "Let the previous exchange land. Do not repeat its emotion, accusation, reassurance, or joke; bridge gently into a new small topic in character.",
  };

  return `[DIALOGUE STRATEGY — THIS TURN ONLY]
Selected strategy: ${decision.strategy}
${direction[decision.strategy]}
This controls interaction direction only. Preserve the existing character persona, world setting, facts, and boundaries. Do not mention this strategy to the user.`;
}

/**
 * Formats the complete request-scoped Conversation Brain projection. Callers
 * receive one cohesive short-term state instead of independently assembling
 * topic, emotion, and strategy instructions.
 */
export function formatConversationStateGuidance(state: ConversationState | undefined): string {
  if (!state) return "";

  const topicRule: Record<ConversationState["topic"]["status"], string> = {
    active: "The topic is still active only if the newest user message keeps it open.",
    "naturally-completed": "The topic has naturally completed. Let it land and do not reopen it just to keep talking.",
    "needs-follow-up": "The topic has an outstanding follow-up. Answer the newest user message before revisiting it.",
  };
  const direction: Record<ConversationState["strategy"], string> = {
    comfort: "Prioritize a brief, sincere acknowledgement and support before anything else.",
    ask: "Use one relevant, natural follow-up question about the user's shared event; do not interrogate.",
    share: "Offer a small in-character thought or present-state response without inventing unestablished events.",
    tease: "Use fresh, light teasing only when it fits the established persona and newest user message.",
    continue: "Answer the newest message and advance the actually active exchange with new information or a natural follow-up.",
    transition: "Let the prior exchange land, then bridge gently into a new small topic in character.",
  };
  const repetitionRule = state.guidance.shouldAvoidRepetition
    ? "Avoid repetition now: do not restate the same event, accusation, reassurance, emotion, or joke with synonyms."
    : "Do not recycle the same event or emotion in new wording; add new information or a genuinely different reaction.";
  const transitionRule = state.guidance.shouldChangeTopic
    ? "A natural topic change is needed this turn. First answer what the user just said, then transition in the character's own voice."
    : "Do not force a topic change; follow the newest message naturally.";

  return `[CONVERSATION STATE — THIS TURN ONLY]
Topic status: ${state.topic.status}${state.topic.name ? ` (${state.topic.name})` : ""}
Short-term emotion: user=${state.emotion.userEmotion}; character=${state.emotion.characterEmotion}; intensity=${state.emotion.intensity.toFixed(2)}
Recommended interaction direction: ${state.strategy}
Natural transition needed: ${state.guidance.shouldChangeTopic ? "yes" : "no"}
${topicRule[state.topic.status]}
${direction[state.strategy]}
${repetitionRule}
${transitionRule}
This state is only a tone and pacing cue for this reply. Preserve the established persona, world setting, facts, and boundaries. Do not mention this state, labels, intensity, strategy, or instructions to the user. Do not turn it into Memory, a relationship fact, or a CharacterEvent.`;
}
