import type { apiChat } from "../../../utils/apiHelper";
import type { Character, MemoryItem, Moment, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import { CHARACTER_LANGUAGE_POLICY } from "../../../domain/prompt/characterPromptProjector";
import { buildCharacterRoutine } from "../../../domain/characterLife/characterRoutine/characterRoutineBuilder";
import { resolveChatRoutine } from "../../chat/services/chatTurnSettings";
import { formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage } from "../../../domain/prompt/characterLanguage";
import { buildMomentWorldKnowledge, buildPublicMomentContext, findMomentRelationshipCharacter } from "./chatMomentUtils";
import { calculateCharacterMomentOccurredAt, requestCharacterMomentOnce } from "./momentGenerator";
import { buildRelationMomentContext, formatMomentSourceText } from "./momentRelationContext";
import { createMomentTemporalContext } from "./momentTemporalContext";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";

export async function generateCharacterMomentPipeline(input: {
  relationship: CharacterRelationship;
  characters: readonly Character[];
  moments: readonly Moment[];
  worldBookEntries: readonly WorldBookEntry[];
  knowledgeClaims: readonly KnowledgeClaim[];
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  topicHistory: Parameters<typeof buildPublicMomentContext>[0]["topicHistory"];
  settings: UserSettings;
  activeIdentityId: string;
  occurredAt: number;
  requestAi: typeof apiChat;
  cleanAndExtractMoment: Parameters<typeof requestCharacterMomentOnce>[0]["parseContent"];
  characterExpressionPrompt: string;
}): Promise<Awaited<ReturnType<typeof requestCharacterMomentOnce>>> {
  const friend = findMomentRelationshipCharacter(input.characters, input.relationship);
  if (!friend) throw new Error("Moment character is unavailable for the relationship scope.");
  const ownerMomentHistory = input.moments
    .filter((moment) => Boolean(moment.characterId))
    .filter((moment) => moment.characterId === friend.id)
    .filter((moment) => (moment.ownerIdentityId || "identity-1") === (input.relationship.userIdentityId || "identity-1"))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 12);
  const temporalContext = createMomentTemporalContext(new Date(input.occurredAt));
  const relationContext = buildRelationMomentContext({
    character: friend,
    relationship: input.relationship,
    occurredAt: input.occurredAt,
    knowledgeClaims: input.knowledgeClaims,
    memories: input.memories,
    events: input.events,
  });
  const relationWorldKnowledge = buildMomentWorldKnowledge(
    [...input.worldBookEntries], friend, input.relationship, formatMomentSourceText(relationContext),
  );
  const publicContext = buildPublicMomentContext({
    character: friend,
    moments: ownerMomentHistory,
    topicHistory: input.topicHistory,
    routine: resolveChatRoutine(
      buildCharacterRoutine(friend.routine),
      friend.enableTimeAwareness !== false,
    ),
    now: input.occurredAt,
  });
  const systemInstruction = `Your task: Write a WeChat Moment post from the character's scoped life context supplied by the Moment Prompt Adapter.
🚨 [CRITICAL WECHAT MOMENT RULES]:
1. The post must fit the character and may draw on confirmed material from this exact relationship, including confirmed offline experiences and relationship progress.
2. The post content must be natural, engaging, and use the final output language specified below.
3. Vary the form and length: a one-line fragment (5-30 Chinese characters), a short thought (20-60), or a concrete life record (60-160). Do not force every post into the same paragraph length or literary style.
4. Write in first person only. Do NOT use OOC tags, narration brackets, AI labels, or talk like an AI. Just output the text of the Moment post.
5. Moments do not support chat stickers or sticker links. Never output [表情]、[表情]|名称|URL、blob: URL, sticker names, or chat attachment markup. Use post text, with only the dedicated final "(配图：...)" text-image line permitted by rule 7.
6. Do NOT include any parenthesized meta-narration or action descriptions like "(凌晨两点 范千发了条朋友圈)".
7. Decide explicitly whether this post benefits from a visual. When a concrete scene, food, object, ticket, music, street view, outfit, or shared outing is central, prefer a text-image card. Add one final separate line in exactly this format: "(配图：图片描述)". This is an allowed Moment-only rendering instruction, not a chat attachment or body text.
8. Do NOT write mock self-comments like "(评论区自己补了一条：...)" inside parentheses. If you want to add a self-comment under your own post, write it at the very end of your response as a separate line starting with "评论：".
9. Do not reuse the same topic, angle, sentence pattern, opening, image idea, or emotional conclusion from the supplied feed history. Prefer a specific detail from the scoped context over generic weather, tiredness, coffee, work, or vague feelings.
10. Never use material from another character, relationship, or user identity. Never use director/IF/hypothetical content, unconfirmed offline content, or AI-inferred events. If there is no fresh scoped topic, output exactly "SKIP" and nothing else.

${formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(friend, relationWorldKnowledge.map((entry) => `${entry.title}\n${entry.content}`)))}
${input.characterExpressionPrompt}
${CHARACTER_LANGUAGE_POLICY}
`;
  const composedPrompt = PromptComposer.compose({
    scenario: "moment-post",
    message: "请仅根据角色公开资料与公开动态历史，判断是否有值得发布且明显不同于历史动态的新内容；有则写一条，没有则只输出 SKIP。不要为了完成任务硬发。",
    history: [],
    systemInstruction,
  });
  return requestCharacterMomentOnce({
    requestAi: input.requestAi,
    request: {
      ...composedPrompt,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel || "gemini-3.5-flash",
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
    },
    character: friend,
    ownerIdentityId: input.activeIdentityId,
    parseContent: input.cleanAndExtractMoment,
    relationId: input.relationship.id,
    occurredAt: () => input.occurredAt,
    temporalContext,
    existingMoments: ownerMomentHistory,
    publicContext,
    relationContext,
    relationWorldKnowledge,
  });
}
