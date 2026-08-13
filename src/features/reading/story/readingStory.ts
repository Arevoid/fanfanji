import { getReadingStory, listReadingStorySaves, listReadingStoryTurns, saveReadingStory, saveReadingStorySave, saveReadingStoryTurn } from "../../../core/storage/repositories/readingStoryRepository";
import type { ReadingStoryChoice, ReadingStoryEntryMode, ReadingStoryLength, ReadingStorySave, ReadingStoryScope, ReadingStoryState, ReadingStoryTurn } from "../../../domain/reading/storyTypes";

const createId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const targetChapters: Record<ReadingStoryLength, number> = { short: 3, medium: 8, long: 20 };
const text = (value: string, max: number): string => value.trim().slice(0, max);
export class ReadingStoryError extends Error { constructor(message: string, public readonly code: "invalid" | "missing" | "storage") { super(message); this.name = "ReadingStoryError"; } }
function persist<T>(result: { success: boolean; error?: string }, value: T): T { if (!result.success) throw new ReadingStoryError(result.error || "故事状态保存失败", "storage"); return value; }

export function createReadingStory(input: { scope: ReadingStoryScope; title: string; bookId?: string; entryMode: ReadingStoryEntryMode; length: ReadingStoryLength; characterName: string; characterRole?: string; goals?: string[]; now?: number }): ReadingStoryState {
  if (!input.title.trim() || !input.characterName.trim()) throw new ReadingStoryError("故事标题和角色名不能为空", "invalid");
  const now = input.now ?? Date.now();
  const story: ReadingStoryState = { ...input.scope, bookId: input.bookId, title: text(input.title, 500), entryMode: input.entryMode, status: "active", length: input.length, targetChapters: targetChapters[input.length], currentChapter: 0, currentLocation: "未设定", currentTime: "故事开始", characterName: text(input.characterName, 200), characterRole: input.characterRole ? text(input.characterRole, 500) : undefined, goals: (input.goals || []).map((goal) => text(goal, 500)).filter(Boolean).slice(0, 30), discoveredIntel: [], tasks: [], relationships: {}, inventory: [], createdAt: now, updatedAt: now };
  return persist(saveReadingStory(story), story);
}

export interface ReadingStoryTurnResult { narrative: string; dialogue: Array<{ speaker: string; text: string }>; choices: ReadingStoryChoice[]; stateChanges: string[]; discoveredIntel: string[]; taskChanges: string[]; relationshipChanges: string[]; currentLocation: string; currentTime: string; chapterProgress: number; shouldEndChapter: boolean; }
export function validateReadingStoryTurnResult(raw: unknown): ReadingStoryTurnResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ReadingStoryError("回合结果必须是对象", "invalid");
  const value = raw as Record<string, unknown>;
  const narrative = typeof value.narrative === "string" ? value.narrative.trim().slice(0, 20000) : "";
  if (!narrative) throw new ReadingStoryError("回合正文不能为空", "invalid");
  const choices = Array.isArray(value.choices) ? value.choices.slice(0, 8).map((choice) => { const item = choice as Record<string, unknown>; return { id: typeof item.id === "string" ? item.id.trim().slice(0, 100) : "", label: typeof item.label === "string" ? item.label.trim().slice(0, 500) : "", consequenceHint: typeof item.consequenceHint === "string" ? item.consequenceHint.trim().slice(0, 500) : undefined }; }).filter((choice) => choice.id && choice.label) : [];
  const strings = (field: string): string[] => Array.isArray(value[field]) ? (value[field] as unknown[]).filter((item): item is string => Boolean(typeof item === "string" && item.trim())).slice(0, 50).map((item) => item.trim().slice(0, 1000)) : [];
  const dialogue = Array.isArray(value.dialogue) ? value.dialogue.slice(0, 50).map((entry) => { const item = entry as Record<string, unknown>; return { speaker: typeof item.speaker === "string" ? item.speaker.trim().slice(0, 200) : "", text: typeof item.text === "string" ? item.text.trim().slice(0, 2000) : "" }; }).filter((entry) => entry.speaker && entry.text) : [];
  return { narrative, dialogue, choices, stateChanges: strings("stateChanges"), discoveredIntel: strings("discoveredIntel"), taskChanges: strings("taskChanges"), relationshipChanges: strings("relationshipChanges"), currentLocation: typeof value.currentLocation === "string" ? value.currentLocation.trim().slice(0, 500) : "", currentTime: typeof value.currentTime === "string" ? value.currentTime.trim().slice(0, 200) : "", chapterProgress: Math.max(0, Math.min(1, Number(value.chapterProgress) || 0)), shouldEndChapter: Boolean(value.shouldEndChapter) };
}

export function commitReadingStoryTurn(input: { scope: ReadingStoryScope; result: ReadingStoryTurnResult; userAction?: string; now?: number }): { story: ReadingStoryState; turn: ReadingStoryTurn } {
  const story = getReadingStory(input.scope); if (!story) throw new ReadingStoryError("故事不存在", "missing");
  const turns = listReadingStoryTurns(input.scope); const previous = turns.at(-1); const now = input.now ?? Date.now();
  const turn: ReadingStoryTurn = { ...input.scope, id: createId("story-turn"), turnIndex: turns.length, parentTurnId: previous?.id, ...input.result, userAction: input.userAction ? text(input.userAction, 2000) : undefined, createdAt: now };
  persist(saveReadingStoryTurn(turn), turn);
  const chapter = story.currentChapter + (input.result.shouldEndChapter ? 1 : 0);
  const next: ReadingStoryState = { ...story, currentChapter: Math.min(story.targetChapters, chapter), currentLocation: input.result.currentLocation || story.currentLocation, currentTime: input.result.currentTime || story.currentTime, discoveredIntel: Array.from(new Set([...story.discoveredIntel, ...input.result.discoveredIntel])).slice(-100), tasks: Array.from(new Set([...story.tasks, ...input.result.taskChanges])).slice(-100), status: chapter >= story.targetChapters ? "completed" : story.status, updatedAt: now };
  return { turn, story: persist(saveReadingStory(next), next) };
}

export function createReadingStorySave(input: { scope: ReadingStoryScope; label: string; now?: number }): ReadingStorySave { const story = getReadingStory(input.scope); if (!story) throw new ReadingStoryError("故事不存在", "missing"); const turn = listReadingStoryTurns(input.scope).at(-1); if (!turn) throw new ReadingStoryError("没有可保存的故事回合", "invalid"); const save: ReadingStorySave = { ...input.scope, id: createId("story-save"), turnId: turn.id, label: text(input.label, 300) || "手动存档", state: story, createdAt: input.now ?? Date.now() }; return persist(saveReadingStorySave(save), save); }
export function loadReadingStorySave(input: { scope: ReadingStoryScope; saveId: string }): ReadingStoryState { const save = listReadingStorySaves(input.scope).find((candidate) => candidate.id === input.saveId); if (!save) throw new ReadingStoryError("存档不存在", "missing"); return persist(saveReadingStory(save.state), save.state); }
export { getReadingStory, listReadingStorySaves, listReadingStoryTurns };
