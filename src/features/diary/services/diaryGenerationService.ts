import { apiChat } from "../../../utils/apiHelper";
import type { Character, DiaryEntry, DiaryGenerationTask, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { createDiaryId } from "../../../domain/diary/diaryData";
import { validateGeneratedDiaryContent } from "../../../domain/diary/diaryValidation";
import { buildDiaryPrompt } from "../../../domain/prompt/diaryPrompt";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import { buildDiaryPromptContext, formatDiaryPromptContext } from "../../characterCognitive/promptAdapters/diaryPromptAdapter";
import { buildWorldBookSystemBlocks } from "../../../utils/worldBook";
import { serializeMessageContentForPrompt } from "../../chat/prompts/messagePromptSerializer";
import { loadDiaryEntries, loadDiaryGenerationTasks, saveDiaryEntries, saveDiaryGenerationTasks } from "../../../core/storage/repositories/diaryRepository";
import { buildDiaryCognitiveContext } from "./diaryCognitiveContext";
import { listByRelation as listCharacterEventsByRelation } from "../../../core/storage/repositories/characterEventRepository";

const autoDiaryInFlight = new Set<string>();

export const maybeGenerateDiaryAfterChat = async (input: {
  relation: CharacterRelationship;
  character: Character;
  ownerIdentityId: string;
  messages: readonly Message[];
  worldBookEntries?: readonly WorldBookEntry[];
  settings: UserSettings;
}): Promise<void> => {
  if (input.character.isGroupChat || autoDiaryInFlight.has(input.relation.id)) return;
  const relationMessages = input.messages.filter((message) => message.relationId === input.relation.id);
  if (relationMessages.length < 20) return;

  const now = Date.now();
  const entries = loadDiaryEntries().value;
  const relationEntries = entries
    .filter((entry) => entry.authorType === "character" && entry.relationId === input.relation.id)
    .sort((left, right) => right.occurredAt - left.occurredAt);
  const latest = relationEntries[0];
  // Active chats may generate at most once per day. If a relation has been
  // quiet for several days, its next qualifying conversation catches up.
  if (latest && now - latest.occurredAt < 24 * 60 * 60 * 1000) return;

  autoDiaryInFlight.add(input.relation.id);
  try {
    const cognitiveContext = buildDiaryCognitiveContext({
      character: input.character,
      relation: input.relation,
      events: listCharacterEventsByRelation(input.relation.id),
      now,
    });
    const result = await generateDiaryEntry({
      ...input,
      trigger: "lazy",
      occurredAt: now,
      cognitiveContext,
    });
    saveDiaryGenerationTasks([
      result.task,
      ...loadDiaryGenerationTasks().value.filter((task) => task.taskKey !== result.task.taskKey),
    ]);
    if (result.entry) saveDiaryEntries([result.entry, ...loadDiaryEntries().value]);
  } catch (error) {
    console.warn("Automatic diary generation skipped:", error);
  } finally {
    autoDiaryInFlight.delete(input.relation.id);
  }
};

export const canGenerateDiary = (entries: readonly DiaryEntry[], relationId: string, now = Date.now()): boolean => {
  const own = entries.filter((entry) => entry.authorType === "character" && entry.relationId === relationId).sort((a, b) => b.occurredAt - a.occurredAt);
  const today = own.filter((entry) => new Date(entry.occurredAt).toDateString() === new Date(now).toDateString());
  return today.length < 2 && (!own[0] || now - own[0].occurredAt >= 12 * 60 * 60 * 1000);
};

export const generateDiaryEntry = async (input: { relation: CharacterRelationship; character: Character; ownerIdentityId: string; messages: readonly Message[]; worldBookEntries?: readonly WorldBookEntry[]; settings: UserSettings; trigger: "lazy" | "manual"; occurredAt?: number; cognitiveContext?: CharacterCognitiveContext; chat?: typeof apiChat }): Promise<{ entry?: DiaryEntry; task: DiaryGenerationTask }> => {
  const now = Date.now();
  const task: DiaryGenerationTask = { id: createDiaryId("diary-task"), ownerIdentityId: input.ownerIdentityId, relationId: input.relation.id, taskKey: `${input.relation.id}:${input.trigger}:${new Date(now).toDateString()}`, trigger: input.trigger, status: "running", startedAt: now, updatedAt: now };
  const occurredAt = Math.min(input.occurredAt ?? now, now - 1);
  const context = input.messages.filter((message) => message.relationId === input.relation.id).slice(-12).map((message) => `${message.sender === "user" ? "用户" : input.character.name}: ${serializeMessageContentForPrompt(message, { mode: "history", characterName: input.character.name })}`).join("\n");
  if (!context.trim() && input.trigger === "lazy") return { task: { ...task, status: "completed", updatedAt: Date.now() } };
  const prompt = buildDiaryPrompt({ characterName: input.character.name, occurredAt, characterProfile: `${input.character.personality || ""}\n${input.character.backstory || ""}`, relationshipState: input.relation.relationship, context });
  const diaryWorldBook = buildWorldBookSystemBlocks([...(input.worldBookEntries || [])], input.character.id, context, {
    scenario: "chat", characterId: input.relation.characterId, userIdentityId: input.relation.userIdentityId, relationId: input.relation.id,
  });
  const cognitiveSupplement = input.cognitiveContext ? formatDiaryPromptContext(buildDiaryPromptContext(input.cognitiveContext)) : "";
  const call = input.chat || apiChat;
  try {
    const composedPrompt = PromptComposer.compose({
      scenario: "diary",
      message: [prompt, diaryWorldBook.formattedAll ? `[本篇日记可使用的关系世界书]\n${diaryWorldBook.formattedAll}\n只把这些内容作为角色和世界背景，不要逐条复述。` : "", cognitiveSupplement].filter(Boolean).join("\n\n"),
      history: [],
      systemInstruction: "只输出符合要求的 JSON。",
      historyInjections: diaryWorldBook.at_depth,
    });
    const response = await call({ ...composedPrompt, apiKey: input.settings.apiKey || "", model: input.settings.selectedModel, apiEndpoint: input.settings.apiEndpoint, apiTemperature: input.settings.apiTemperature, streamCompatible: input.settings.streamCompatible });
    const parsed = validateGeneratedDiaryContent(JSON.parse(response.text.replace(/^```json\s*|```$/g, "")));
    if (!parsed) return { task: { ...task, status: "failed", updatedAt: Date.now() } };
    return { entry: { id: createDiaryId(), ownerIdentityId: input.ownerIdentityId, authorType: "character", characterId: input.relation.characterId, relationId: input.relation.id, conversationId: input.relation.conversationId, authorNameSnapshot: input.character.remark || input.character.name, ...(input.character.avatar ? { authorAvatarSnapshot: input.character.avatar } : {}), ...parsed, occurredAt, createdAt: now, updatedAt: now, source: input.trigger === "manual" ? "ai-manual" : "ai-auto", isFavorite: false }, task: { ...task, status: "completed", updatedAt: Date.now() } };
  } catch {
    return { task: { ...task, status: "failed", updatedAt: Date.now() } };
  }
};
