import { apiChat } from "../../../utils/apiHelper";
import type { Character, DiaryEntry, DiaryGenerationTask, Message, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { createDiaryId } from "../../../domain/diary/diaryData";
import { validateGeneratedDiaryContent } from "../../../domain/diary/diaryValidation";
import { buildDiaryPrompt } from "../../../domain/prompt/diaryPrompt";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import {
  buildDiaryPromptContext,
  formatDiaryPromptContext,
} from "../../characterCognitive/promptAdapters/diaryPromptAdapter";

export const canGenerateDiary = (entries: readonly DiaryEntry[], relationId: string, now = Date.now()): boolean => {
  const own = entries.filter((entry) => entry.authorType === "character" && entry.relationId === relationId).sort((a, b) => b.occurredAt - a.occurredAt);
  const today = own.filter((entry) => new Date(entry.occurredAt).toDateString() === new Date(now).toDateString());
  return today.length < 2 && (!own[0] || now - own[0].occurredAt >= 12 * 60 * 60 * 1000);
};

export const generateDiaryEntry = async (input: { relation: CharacterRelationship; character: Character; ownerIdentityId: string; messages: readonly Message[]; settings: UserSettings; trigger: "lazy" | "manual"; occurredAt?: number; cognitiveContext?: CharacterCognitiveContext; chat?: typeof apiChat }): Promise<{ entry?: DiaryEntry; task: DiaryGenerationTask }> => {
  const now = Date.now(); const task: DiaryGenerationTask = { id: createDiaryId("diary-task"), ownerIdentityId: input.ownerIdentityId, relationId: input.relation.id, taskKey: `${input.relation.id}:${input.trigger}:${new Date(now).toDateString()}`, trigger: input.trigger, status: "running", startedAt: now, updatedAt: now };
  const occurredAt = Math.min(input.occurredAt ?? now, now - 1);
  const context = input.messages.filter((message) => message.relationId === input.relation.id).slice(-12).map((message) => `${message.sender === "user" ? "用户" : input.character.name}: ${message.content}`).join("\n");
  if (!context.trim() && input.trigger === "lazy") return { task: { ...task, status: "completed", updatedAt: Date.now() } };
  const prompt = buildDiaryPrompt({ characterName: input.character.name, occurredAt, characterProfile: `${input.character.personality || ""}\n${input.character.backstory || ""}`, relationshipState: input.relation.relationship, context });
  const cognitiveSupplement = input.cognitiveContext
    ? formatDiaryPromptContext(buildDiaryPromptContext(input.cognitiveContext))
    : "";
  const call = input.chat || apiChat;
  try {
    const response = await call({
      message: cognitiveSupplement ? `${prompt}\n\n${cognitiveSupplement}` : prompt,
      apiKey: input.settings.apiKey || "",
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      history: [],
      systemInstruction: "只输出符合要求的 JSON。",
      apiTemperature: input.settings.apiTemperature,
      streamCompatible: input.settings.streamCompatible,
    });
    const content = response.text;
    const parsed = validateGeneratedDiaryContent(JSON.parse(content.replace(/^```json\s*|```$/g, "")));
    if (!parsed) return { task: { ...task, status: "failed", updatedAt: Date.now() } };
    return { entry: { id: createDiaryId(), ownerIdentityId: input.ownerIdentityId, authorType: "character", characterId: input.relation.characterId, relationId: input.relation.id, conversationId: input.relation.conversationId, authorNameSnapshot: input.character.remark || input.character.name, ...(input.character.avatar ? { authorAvatarSnapshot: input.character.avatar } : {}), ...parsed, occurredAt, createdAt: now, updatedAt: now, source: input.trigger === "manual" ? "ai-manual" : "ai-auto", isFavorite: false }, task: { ...task, status: "completed", updatedAt: Date.now() } };
  } catch { return { task: { ...task, status: "failed", updatedAt: Date.now() } }; }
};
