import type { apiChat } from "../../../utils/apiHelper";
import type { Character, MemoryItem, Moment, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import { CHARACTER_LANGUAGE_POLICY } from "../../../domain/prompt/characterPromptProjector";
import { buildCharacterRoutine } from "../../../domain/characterLife/characterRoutine/characterRoutineBuilder";
import { resolveChatRoutine } from "../../chat/services/chatTurnSettings";
import { formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage } from "../../../domain/prompt/characterLanguage";
import { buildMomentWorldKnowledge, buildPublicMomentContext } from "./chatMomentUtils";
import { requestAutomaticMomentComment } from "./momentCommentService";
import { buildRelationMomentContext, formatMomentSourceText } from "./momentRelationContext";
import { createMomentTemporalContext } from "./momentTemporalContext";

export async function generateAutomaticMomentComment(input: {
  moment: Moment;
  targetDescription: string;
  character: Character;
  relationship: CharacterRelationship;
  worldBookEntries: readonly Parameters<typeof buildMomentWorldKnowledge>[0][number][];
  topicHistory: Parameters<typeof buildPublicMomentContext>[0]["topicHistory"];
  knowledgeClaims: readonly KnowledgeClaim[];
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  settings: UserSettings;
  requestAi: typeof apiChat;
  cleanText: (text: string) => string;
  characterExpressionPrompt: string;
}): Promise<Awaited<ReturnType<typeof requestAutomaticMomentComment>>> {
  const temporalContext = createMomentTemporalContext(new Date());
  const relationContext = buildRelationMomentContext({
    character: input.character,
    relationship: input.relationship,
    occurredAt: temporalContext.generatedAt.getTime(),
    knowledgeClaims: input.knowledgeClaims,
    memories: input.memories,
    events: input.events,
  });
  const relationWorldKnowledge = buildMomentWorldKnowledge(
    [...input.worldBookEntries], input.character, input.relationship,
    `${input.targetDescription}\n${formatMomentSourceText(relationContext)}`,
  );
  const publicContext = buildPublicMomentContext({
    character: input.character,
    moments: [input.moment],
    topicHistory: input.topicHistory,
    routine: resolveChatRoutine(
      buildCharacterRoutine(input.character.routine),
      input.character.enableTimeAwareness !== false,
    ),
    now: Date.now(),
  });
  const systemInstruction = `Your task: Write a short, natural comment on the Moment.
🚨 [CRITICAL WECHAT COMMENT RULES]:
1. The comment must be brief, extremely natural, and fit the character and current relationship context supplied by the Moment Prompt Adapter.
2. Keep it under 35 characters and follow the character language policy below.
3. No OOC, no narrative brackets like (微笑), just the direct comment text.
4. You may naturally reference confirmed shared experiences or relationship facts from the supplied context, but never invent them or mention another relationship or user identity.
${input.characterExpressionPrompt}
${CHARACTER_LANGUAGE_POLICY}

${formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(input.character, relationWorldKnowledge.map((entry) => `${entry.title}\n${entry.content}`)))}
`;
  const composedPrompt = PromptComposer.compose({
    scenario: "moment-comment",
    message: `[本次唯一评论目标]\n${input.targetDescription}\n\n只评论上面这条新动态。历史动态、历史评论和话题冷却仅用于避免重复措辞，禁止把其中的食物、物件或对话当成这条动态的内容。`,
    history: [],
    systemInstruction,
  });
  return requestAutomaticMomentComment({
    requestAi: input.requestAi,
    request: {
      ...composedPrompt,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel || "gemini-3.5-flash",
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
    },
    character: input.character,
    cleanText: input.cleanText,
    temporalContext,
    publicContext,
    relationContext,
    relationWorldKnowledge,
  });
}
