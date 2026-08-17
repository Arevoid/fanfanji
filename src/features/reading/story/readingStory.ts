import {
  deleteReadingStoryScope,
  getReadingStory,
  listReadingStorySaves,
  listReadingStoryTurns,
  loadReadingStoryStore,
  saveReadingStory,
  saveReadingStorySave,
  saveReadingStoryStore,
} from "../../../core/storage/repositories/readingStoryRepository";
import type {
  ReadingStoryChoice,
  ReadingStoryEntryMode,
  ReadingStoryLength,
  ReadingStorySave,
  ReadingStoryScope,
  ReadingStoryState,
  ReadingStoryTurn,
  ReadingStoryGenerationPreferences,
} from "../../../domain/reading/storyTypes";
import { DEFAULT_READING_STORY_GENERATION_PREFERENCES, normalizeReadingStoryGenerationPreferences } from "../../../domain/reading/storyGenerationPreferences";
import { ensureDistinctReadingStoryChoices } from "./readingStoryChoices";

const createId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const targetChapters: Record<ReadingStoryLength, number> = { short: 3, medium: 8, long: 20 };
const text = (value: string, max: number): string => value.trim().slice(0, max);
const sameScope = (left: ReadingStoryScope, right: ReadingStoryScope): boolean =>
  left.userIdentityId === right.userIdentityId && left.storyId === right.storyId;

export class ReadingStoryError extends Error {
  constructor(message: string, public readonly code: "invalid" | "missing" | "storage" | "conflict") {
    super(message);
    this.name = "ReadingStoryError";
  }
}

function persist<T>(result: { success: boolean; error?: string }, value: T): T {
  if (!result.success) throw new ReadingStoryError(result.error || "故事状态保存失败", "storage");
  return value;
}

export function createReadingStory(input: { scope: ReadingStoryScope; title: string; bookId?: string; entryMode: ReadingStoryEntryMode; length: ReadingStoryLength; characterName: string; characterRole?: string; goals?: string[]; now?: number }): ReadingStoryState {
  if (!input.title.trim() || !input.characterName.trim()) throw new ReadingStoryError("故事标题和角色名不能为空", "invalid");
  const now = input.now ?? Date.now();
  const story: ReadingStoryState = {
    ...input.scope,
    bookId: input.bookId,
    title: text(input.title, 500),
    entryMode: input.entryMode,
    status: "active",
    length: input.length,
    targetChapters: targetChapters[input.length],
    currentChapter: 0,
    currentLocation: "未设定",
    currentTime: "故事开始",
    characterName: text(input.characterName, 200),
    characterRole: input.characterRole ? text(input.characterRole, 500) : undefined,
    goals: (input.goals || []).map((goal) => text(goal, 500)).filter(Boolean).slice(0, 30),
    discoveredIntel: [],
    tasks: [],
    relationships: {},
    inventory: [],
    generationPreferences: { ...DEFAULT_READING_STORY_GENERATION_PREFERENCES },
    createdAt: now,
    updatedAt: now,
  };
  return persist(saveReadingStory(story), story);
}

export interface ReadingStoryTurnResult {
  narrative: string;
  dialogue: Array<{ speaker: string; text: string }>;
  choices: ReadingStoryChoice[];
  stateChanges: string[];
  discoveredIntel: string[];
  taskChanges: string[];
  relationshipChanges: string[];
  currentLocation: string;
  currentTime: string;
  chapterProgress: number;
  shouldEndChapter: boolean;
}

export function validateReadingStoryTurnResult(raw: unknown): ReadingStoryTurnResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ReadingStoryError("回合结果必须是对象", "invalid");
  const value = raw as Record<string, unknown>;
  const narrative = typeof value.narrative === "string" ? value.narrative.trim().slice(0, 20000) : "";
  if (!narrative) throw new ReadingStoryError("回合正文不能为空", "invalid");
  const parsedChoices = Array.isArray(value.choices)
    ? value.choices.slice(0, 8).map((choice) => {
      const item = choice as Record<string, unknown>;
      return {
        id: typeof item.id === "string" ? item.id.trim().slice(0, 100) : "",
        label: typeof item.label === "string" ? item.label.trim().slice(0, 500) : "",
        consequenceHint: typeof item.consequenceHint === "string" ? item.consequenceHint.trim().slice(0, 500) : undefined,
      };
    }).filter((choice) => choice.id && choice.label)
    : [];
  const choices = ensureDistinctReadingStoryChoices(parsedChoices, {
    narrative,
    currentLocation: typeof value.currentLocation === "string" ? value.currentLocation : undefined,
  });
  const strings = (field: string): string[] => Array.isArray(value[field])
    ? (value[field] as unknown[]).filter((item): item is string => Boolean(typeof item === "string" && item.trim())).slice(0, 50).map((item) => item.trim().slice(0, 1000))
    : [];
  const dialogue = Array.isArray(value.dialogue)
    ? value.dialogue.slice(0, 50).map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        speaker: typeof item.speaker === "string" ? item.speaker.trim().slice(0, 200) : "",
        text: typeof item.text === "string" ? item.text.trim().slice(0, 2000) : "",
      };
    }).filter((entry) => entry.speaker && entry.text)
    : [];
  return {
    narrative,
    dialogue,
    choices,
    stateChanges: strings("stateChanges"),
    discoveredIntel: strings("discoveredIntel"),
    taskChanges: strings("taskChanges"),
    relationshipChanges: strings("relationshipChanges"),
    currentLocation: typeof value.currentLocation === "string" ? value.currentLocation.trim().slice(0, 500) : "",
    currentTime: typeof value.currentTime === "string" ? value.currentTime.trim().slice(0, 200) : "",
    chapterProgress: Math.max(0, Math.min(1, Number(value.chapterProgress) || 0)),
    shouldEndChapter: Boolean(value.shouldEndChapter),
  };
}

export function commitReadingStoryTurn(input: { scope: ReadingStoryScope; result: ReadingStoryTurnResult; userAction?: string; requestId?: string; expectedStoryUpdatedAt?: number; now?: number }): { story: ReadingStoryState; turn: ReadingStoryTurn } {
  const loaded = loadReadingStoryStore();
  const story = loaded.value.stories.find((candidate) => candidate.userIdentityId === input.scope.userIdentityId && candidate.storyId === input.scope.storyId);
  if (!story) throw new ReadingStoryError("故事不存在", "missing");
  const turns = loaded.value.turns
    .filter((turn) => turn.userIdentityId === input.scope.userIdentityId && turn.storyId === input.scope.storyId)
    .sort((left, right) => left.turnIndex - right.turnIndex);
  if (input.requestId) {
    const existing = turns.find((turn) => turn.requestId === input.requestId);
    if (existing) return { story, turn: existing };
  }
  if (input.expectedStoryUpdatedAt !== undefined && story.updatedAt !== input.expectedStoryUpdatedAt) {
    throw new ReadingStoryError("故事在生成期间已发生变化，请刷新后重试", "conflict");
  }
  const previous = turns.at(-1);
  const now = input.now ?? Date.now();
  const turn: ReadingStoryTurn = {
    ...input.scope,
    id: createId("story-turn"),
    requestId: input.requestId ? text(input.requestId, 200) : undefined,
    turnIndex: turns.length,
    parentTurnId: previous?.id,
    ...input.result,
    choices: ensureDistinctReadingStoryChoices(input.result.choices, {
      narrative: input.result.narrative,
      currentLocation: input.result.currentLocation,
    }),
    userAction: input.userAction ? text(input.userAction, 2000) : undefined,
    createdAt: now,
  };
  const chapter = story.currentChapter + (input.result.shouldEndChapter ? 1 : 0);
  const next: ReadingStoryState = {
    ...story,
    currentChapter: Math.min(story.targetChapters, chapter),
    currentLocation: input.result.currentLocation || story.currentLocation,
    currentTime: input.result.currentTime || story.currentTime,
    discoveredIntel: Array.from(new Set([...story.discoveredIntel, ...input.result.discoveredIntel])).slice(-100),
    tasks: Array.from(new Set([...story.tasks, ...input.result.taskChanges])).slice(-100),
    status: chapter >= story.targetChapters ? "completed" : story.status,
    updatedAt: now,
  };
  // Persist the turn and the derived story state in one store write. The storage
  // adapter verifies and rolls back the whole JSON value on failure, so a failed
  // commit can never leave a turn without its matching story state.
  const nextStore = {
    ...loaded.value,
    stories: [...loaded.value.stories.filter((candidate) => !(candidate.userIdentityId === input.scope.userIdentityId && candidate.storyId === input.scope.storyId)), next],
    turns: [...loaded.value.turns, turn],
  };
  persist(saveReadingStoryStore(nextStore), next);
  return { turn, story: next };
}

export function createReadingStorySave(input: { scope: ReadingStoryScope; label: string; now?: number }): ReadingStorySave {
  const story = getReadingStory(input.scope);
  if (!story) throw new ReadingStoryError("存档对应的故事不存在", "missing");
  const turn = listReadingStoryTurns(input.scope).at(-1);
  if (!turn) throw new ReadingStoryError("没有可保存的故事回合", "invalid");
  const save: ReadingStorySave = { ...input.scope, id: createId("story-save"), turnId: turn.id, label: text(input.label, 300) || "手动存档", state: story, createdAt: input.now ?? Date.now() };
  return persist(saveReadingStorySave(save), save);
}

export function loadReadingStorySave(input: { scope: ReadingStoryScope; saveId: string }): ReadingStoryState {
  const loaded = loadReadingStoryStore();
  const save = loaded.value.saves.find((candidate) => sameScope(candidate, input.scope) && candidate.id === input.saveId);
  if (!save) throw new ReadingStoryError("存档不存在", "missing");
  const scopedTurns = loaded.value.turns
    .filter((turn) => sameScope(turn, input.scope))
    .sort((left, right) => left.turnIndex - right.turnIndex);
  const savedTurnIndex = scopedTurns.find((turn) => turn.id === save.turnId)?.turnIndex;
  const remainingTurns = savedTurnIndex === undefined
    ? loaded.value.turns
    : loaded.value.turns.filter((turn) => !sameScope(turn, input.scope) || turn.turnIndex <= savedTurnIndex);
  const restoredState = structuredClone(save.state);
  const nextStore = {
    ...loaded.value,
    stories: [...loaded.value.stories.filter((candidate) => !sameScope(candidate, input.scope)), restoredState],
    turns: remainingTurns,
  };
  return persist(saveReadingStoryStore(nextStore), restoredState);
}

export function updateReadingStoryMetadata(input: { scope: ReadingStoryScope; title?: string; status?: "active" | "paused"; generationPreferences?: Partial<ReadingStoryGenerationPreferences>; now?: number }): ReadingStoryState {
  const story = getReadingStory(input.scope);
  if (!story) throw new ReadingStoryError("故事不存在", "missing");
  if (story.status === "completed" && input.status === "active") throw new ReadingStoryError("已完成的故事不能恢复为进行中", "invalid");
  const next = { ...story, title: input.title === undefined ? story.title : text(input.title, 500), status: input.status || story.status, generationPreferences: input.generationPreferences ? normalizeReadingStoryGenerationPreferences(input.generationPreferences) : story.generationPreferences, updatedAt: input.now ?? Date.now() };
  if (!next.title) throw new ReadingStoryError("故事名称不能为空", "invalid");
  return persist(saveReadingStory(next), next);
}

export function deleteReadingStory(input: { scope: ReadingStoryScope }): void {
  persist(deleteReadingStoryScope(input.scope), undefined);
}

export { getReadingStory, listReadingStorySaves, listReadingStoryTurns };
