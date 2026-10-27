import { resolveCharacterTextSettings } from "../../../domain/character/characterTextApiRouting";
import type { apiChat } from "../../../utils/apiHelper";
import type { Character, MemoryItem, Moment, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import { buildModelDirectIdentity, modelDirectProfile, resolveChatIdentityMode } from "../../../domain/prompt/modelDirectIdentity";
import { cleanAiReplyText } from "../../chat/services/messageParser";
import { CHARACTER_LANGUAGE_POLICY } from "../../../domain/prompt/characterPromptProjector";
import { buildCharacterRoutine } from "../../../domain/characterLife/characterRoutine/characterRoutineBuilder";
import { resolveChatRoutine } from "../../chat/services/chatTurnSettings";
import { formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage } from "../../../domain/prompt/characterLanguage";
import { buildMomentWorldKnowledge, buildPublicMomentContext } from "./chatMomentUtils";
import { requestMomentCommentReply } from "./momentReplyService";
import { buildRelationMomentContext, formatMomentSourceText } from "./momentRelationContext";
import { createMomentTemporalContext } from "./momentTemporalContext";
import type { WorldBookEntry } from "../../../types";

export async function generateAutomaticMomentReply(input: {
  targetMoment: Moment;
  targetDescription: string;
  userCommentText: string;
  replyingToContent?: string;
  replyTargetName?: string;
  character: Character;
  relationship: CharacterRelationship;
  worldBookEntries: readonly WorldBookEntry[];
  topicHistory: Parameters<typeof buildPublicMomentContext>[0]["topicHistory"];
  knowledgeClaims: readonly KnowledgeClaim[];
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  settings: UserSettings;
  requestAi: typeof apiChat;
  cleanText: (text: string) => string;
  characterExpressionPrompt: string;
  /** Public world settings belonging to the person whose Moment is being read. */
  additionalWorldKnowledge?: readonly { title: string; content: string }[];
  /** Allows a public interaction to end naturally without a generated reply. */
  allowSkip?: boolean;
}): Promise<Awaited<ReturnType<typeof requestMomentCommentReply>>> {
  input = { ...input, settings: resolveCharacterTextSettings(input.settings, input.character) };
  const temporalContext = createMomentTemporalContext(new Date());
  const relationContext = buildRelationMomentContext({
    character: input.character,
    relationship: input.relationship,
    occurredAt: temporalContext.generatedAt.getTime(),
    knowledgeClaims: input.knowledgeClaims,
    memories: input.memories,
    events: input.events,
    publicSurface: true,
  });
  const relationWorldKnowledge = [
    ...buildMomentWorldKnowledge(
      [...input.worldBookEntries], input.character, input.relationship,
      `${input.targetDescription}\n${input.userCommentText}\n${formatMomentSourceText(relationContext)}`,
    ),
    ...(input.additionalWorldKnowledge || []),
  ];
  const publicContext = buildPublicMomentContext({
    character: input.character,
    moments: [{ ...input.targetMoment, comments: [] }],
    comments: [
      ...input.targetMoment.comments,
      {
        id: "public-comment-input",
        authorName: input.replyTargetName || input.settings.name,
        authorAvatar: input.settings.avatar,
        content: input.userCommentText,
        timestamp: Date.now(),
      },
    ],
    topicHistory: input.topicHistory,
    routine: resolveChatRoutine(
      buildCharacterRoutine(input.character.routine),
      input.character.enableTimeAwareness !== false,
    ),
    now: Date.now(),
  });
  const systemInstruction = resolveChatIdentityMode(input.character) === "model-direct"
    ? `${buildModelDirectIdentity(modelDirectProfile(input.character))}\n任务：针对指定动态评论写一句简短自然的回复，不编造身体或线下经历，不泄露其他关系资料。只输出评论正文，无话可说可输出 [SKIP]。不需要每次声明 AI 身份。`
    : `Your task: Write a short, extremely natural WeChat reply/comment.
🚨 [CRITICAL WECHAT COMMENT RULES]:
1. The reply must be brief, lively, extremely natural, and match the character and current relationship context supplied by the Moment Prompt Adapter.
2. Keep it under 35 characters and follow the character language policy below.
3. Speak directly to the user without formal prefixes. Do not write narrative actions or brackets like "(害羞)", just output the comment text.
4. You may naturally reference only confirmed material from this supplied relationship context. Never invent shared experiences or use another relationship's information.
${input.characterExpressionPrompt}
${CHARACTER_LANGUAGE_POLICY}
${input.allowSkip ? "5. This interaction is optional. If the conversation feels complete or a reply would be forced, output exactly [SKIP] and nothing else." : ""}

${formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(input.character, relationWorldKnowledge.map((entry) => `${entry.title}\n${entry.content}`)))}
`;
  const composedPrompt = PromptComposer.compose({
    scenario: "moment-reply",
    message: `[本次唯一回复目标]\n动态：${input.targetDescription}\n${input.replyingToContent ? `用户正在回复你的评论：${input.replyingToContent}\n` : ""}用户刚写的内容：${input.userCommentText}\n\n只回复“用户刚写的内容”。禁止延续其他朋友圈、其他评论线程或历史话题中的关键词。`,
    history: [],
    systemInstruction,
  });
  return requestMomentCommentReply({
    requestAi: input.requestAi,
    request: {
      ...composedPrompt,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel || "gemini-3.5-flash",
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
      purpose: "moment_reply",
      characterId: input.character.id,
    },
    character: input.character,
    userName: input.replyTargetName || input.settings.name,
    cleanText: resolveChatIdentityMode(input.character) === "model-direct" ? (text) => cleanAiReplyText(text, true, true) : input.cleanText,
    temporalContext,
    publicContext,
    relationContext,
    relationWorldKnowledge,
  });
}
