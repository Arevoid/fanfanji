import { deleteReadingCoStoryScope, getReadingCoStory, listReadingCoStorySaves, listReadingCoStoryTurns, loadReadingCoStoryStore, saveReadingCoStory, saveReadingCoStorySave, saveReadingCoStoryStore } from "../../../core/storage/repositories/readingCoStoryRepository";
import type { ReadingCoStoryActionMode, ReadingCoStorySave, ReadingCoStoryScope, ReadingCoStoryState, ReadingCoStoryTurn, ReadingStoryAiActionResult } from "../../../domain/reading/coStoryTypes";
import type { ReadingStoryGenerationPreferences, ReadingStoryLength } from "../../../domain/reading/storyTypes";
import { evaluateReadingStoryAiAction, ReadingCoStoryPolicyError } from "./readingCoStoryPolicy";
import { DEFAULT_READING_STORY_GENERATION_PREFERENCES, normalizeReadingStoryGenerationPreferences } from "../../../domain/reading/storyGenerationPreferences";
import { ensureDistinctReadingStoryChoices } from "./readingStoryChoices";
import { createId as createApplicationId } from "../../../core/id/createId";

const targetChapters: Record<ReadingStoryLength, number> = { short: 3, medium: 8, long: 20 };
const createId = (prefix: string): string => createApplicationId(prefix);
const text = (value: string, max: number): string => value.trim().slice(0, max);
const sameScope = (left: ReadingCoStoryScope, right: ReadingCoStoryScope): boolean => left.userIdentityId === right.userIdentityId && left.coStoryId === right.coStoryId && left.relationId === right.relationId && left.characterId === right.characterId;

export class ReadingCoStoryError extends Error { constructor(message: string, public readonly code: "invalid" | "missing" | "storage" | "conflict") { super(message); this.name = "ReadingCoStoryError"; } }
function persist<T>(result: { success: boolean; error?: string }, value: T): T { if (!result.success) throw new ReadingCoStoryError(result.error || "Co-story save failed", "storage"); return value; }

export function createReadingCoStory(input: { scope: ReadingCoStoryScope; title: string; universeStoryId?: string; origin?: ReadingCoStoryState["origin"]; worldDefinition?: ReadingCoStoryState["worldDefinition"]; length: ReadingStoryLength; userCharacterName: string; userCharacterRole?: string; userEntryMode?: ReadingCoStoryState["userEntryMode"]; userOriginalCharacterId?: string; userGoals?: string[]; aiFriend: ReadingCoStoryState["aiFriend"]; now?: number }): ReadingCoStoryState {
  if (!input.title.trim() || !input.userCharacterName.trim()) throw new ReadingCoStoryError("Co-story title and user character are required", "invalid");
  if (input.aiFriend.relationId !== input.scope.relationId || input.aiFriend.characterId !== input.scope.characterId) throw new ReadingCoStoryError("AI friend scope mismatch", "invalid");
  if (input.origin === "custom" && (!input.worldDefinition?.genre.trim() || !input.worldDefinition.worldView.trim() || !input.worldDefinition.synopsis.trim())) throw new ReadingCoStoryError("Custom world requires genre, world view, and synopsis", "invalid");
  const now = input.now ?? Date.now();
  const state: ReadingCoStoryState = { ...input.scope, universeStoryId: input.universeStoryId, origin: input.origin || (input.universeStoryId ? "book" : "custom"), worldDefinition: input.worldDefinition ? { genre: text(input.worldDefinition.genre, 200), worldView: text(input.worldDefinition.worldView, 6000), synopsis: text(input.worldDefinition.synopsis, 6000), intendedEnding: input.worldDefinition.intendedEnding ? text(input.worldDefinition.intendedEnding, 3000) : undefined } : undefined, title: text(input.title, 500), length: input.length, status: "active", currentChapter: 0, targetChapters: targetChapters[input.length], currentLocation: "未设定", currentTime: "故事开始", userCharacterName: text(input.userCharacterName, 200), userCharacterRole: input.userCharacterRole ? text(input.userCharacterRole, 500) : undefined, userEntryMode: input.userEntryMode, userOriginalCharacterId: input.userOriginalCharacterId ? text(input.userOriginalCharacterId, 200) : undefined, userGoals: (input.userGoals || []).map((goal) => text(goal, 500)).filter(Boolean).slice(0, 30), userKnownIntel: [], tasks: [], inventory: [], generationPreferences: { ...DEFAULT_READING_STORY_GENERATION_PREFERENCES }, aiFriend: { ...input.aiFriend, displayName: text(input.aiFriend.displayName, 200), characterName: text(input.aiFriend.characterName, 200), characterRole: input.aiFriend.characterRole ? text(input.aiFriend.characterRole, 500) : undefined, originalCharacterId: input.aiFriend.originalCharacterId ? text(input.aiFriend.originalCharacterId, 200) : undefined, personaSummary: text(input.aiFriend.personaSummary, 3000), knownIntel: input.aiFriend.knownIntel.map((item) => text(item, 1000)).filter(Boolean).slice(0, 100), knownTurnIds: input.aiFriend.knownTurnIds.slice(0, 200) }, activeActor: "user", createdAt: now, updatedAt: now };
  return persist(saveReadingCoStory(state), state);
}

export function createReadingCoStoryOpening(input: { scope: ReadingCoStoryScope; narrative: string; choices: ReadingCoStoryTurn["choices"]; now?: number }): ReadingCoStoryTurn {
  const loaded = loadReadingCoStoryStore();
  const story = loaded.value.stories.find((candidate) => sameScope(candidate, input.scope));
  if (!story) throw new ReadingCoStoryError("Co-story does not exist", "missing");
  const existing = turnsFor(loaded.value, input.scope);
  if (existing.length) return existing[0];
  const now = input.now ?? Date.now();
  const turn: ReadingCoStoryTurn = { ...input.scope, turnId: createId("co-opening"), turnIndex: 0, actor: "system", perspective: "shared", narrative: text(input.narrative, 12000), dialogue: [], choices: ensureDistinctReadingStoryChoices(input.choices.slice(0, 8)), risk: "low", requiresUserApproval: false, visibleTo: ["user", "ai_friend"], createdAt: now };
  if (!turn.narrative) throw new ReadingCoStoryError("Opening narrative is required", "invalid");
  const nextStory: ReadingCoStoryState = { ...story, aiFriend: { ...story.aiFriend, knownTurnIds: [...story.aiFriend.knownTurnIds, turn.turnId] }, updatedAt: now };
  persist(saveReadingCoStoryStore({ ...replaceStory(loaded.value, nextStory), turns: [...loaded.value.turns, turn] }), turn);
  return turn;
}

export interface ReadingCoStoryTurnResult {
  narrative: string;
  dialogue: Array<{ speaker: string; text: string }>;
  choices: ReadingCoStoryTurn["choices"];
  friendAction: string;
  controlsUserCharacter: boolean;
  stateChanges: string[];
  userDiscoveredIntel: string[];
  aiDiscoveredIntel: string[];
  taskChanges: string[];
  inventoryChanges: string[];
  currentLocation: string;
  currentTime: string;
  chapterProgress: number;
  shouldEndChapter: boolean;
}

export function validateReadingCoStoryTurnResult(raw: unknown): ReadingCoStoryTurnResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ReadingCoStoryError("共同故事回合必须是对象", "invalid");
  const value = raw as Record<string, unknown>;
  const narrative = typeof value.narrative === "string" ? text(value.narrative, 20000) : "";
  if (!narrative) throw new ReadingCoStoryError("共同故事正文不能为空", "invalid");
  if (value.controlsUserCharacter !== false) throw new ReadingCoStoryError("AI 不能替用户角色行动或作决定", "invalid");
  const strings = (key: string): string[] => Array.isArray(value[key]) ? (value[key] as unknown[]).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 50).map((item) => text(item, 1000)) : [];
  const dialogue = Array.isArray(value.dialogue) ? value.dialogue.slice(0, 50).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map((item) => ({ speaker: typeof item.speaker === "string" ? text(item.speaker, 200) : "", text: typeof item.text === "string" ? text(item.text, 2000) : "" })).filter((item) => item.speaker && item.text) : [];
  const parsedChoices = Array.isArray(value.choices) ? value.choices.slice(0, 8).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map((item) => ({ id: typeof item.id === "string" ? text(item.id, 100) : "", label: typeof item.label === "string" ? text(item.label, 500) : "", consequenceHint: typeof item.consequenceHint === "string" ? text(item.consequenceHint, 500) : undefined })).filter((item) => item.id && item.label) : [];
  const choices = ensureDistinctReadingStoryChoices(parsedChoices, {
    narrative,
    currentLocation: typeof value.currentLocation === "string" ? value.currentLocation : undefined,
  });
  return { narrative, dialogue, choices, friendAction: typeof value.friendAction === "string" ? text(value.friendAction, 2000) : "", controlsUserCharacter: false, stateChanges: strings("stateChanges"), userDiscoveredIntel: strings("userDiscoveredIntel"), aiDiscoveredIntel: strings("aiDiscoveredIntel"), taskChanges: strings("taskChanges"), inventoryChanges: strings("inventoryChanges"), currentLocation: typeof value.currentLocation === "string" ? text(value.currentLocation, 500) : "", currentTime: typeof value.currentTime === "string" ? text(value.currentTime, 200) : "", chapterProgress: Math.max(0, Math.min(1, Number(value.chapterProgress) || 0)), shouldEndChapter: Boolean(value.shouldEndChapter) };
}

const turnsFor = (store: ReturnType<typeof loadReadingCoStoryStore>["value"], scope: ReadingCoStoryScope): ReadingCoStoryTurn[] => store.turns.filter((turn) => sameScope(turn, scope)).sort((left, right) => left.turnIndex - right.turnIndex);
const replaceStory = (store: ReturnType<typeof loadReadingCoStoryStore>["value"], next: ReadingCoStoryState) => ({ ...store, stories: [...store.stories.filter((candidate) => !sameScope(candidate, next)), next] });

export function commitReadingCoStoryTurn(input: { scope: ReadingCoStoryScope; result: ReadingCoStoryTurnResult; userAction: string; requestId?: string; expectedStoryUpdatedAt?: number; now?: number }): { story: ReadingCoStoryState; turn: ReadingCoStoryTurn } {
  const loaded = loadReadingCoStoryStore();
  const story = loaded.value.stories.find((candidate) => sameScope(candidate, input.scope));
  if (!story) throw new ReadingCoStoryError("共同故事不存在", "missing");
  const turns = turnsFor(loaded.value, input.scope);
  const requestId = input.requestId ? text(input.requestId, 200) : undefined;
  const existing = requestId ? turns.find((turn) => turn.requestId === requestId) : undefined;
  if (existing) return { story, turn: existing };
  if (input.expectedStoryUpdatedAt !== undefined && story.updatedAt !== input.expectedStoryUpdatedAt) throw new ReadingCoStoryError("共同故事已变化，请刷新后重试", "conflict");
  if (!input.userAction.trim()) throw new ReadingCoStoryError("用户行动不能为空", "invalid");
  const now = input.now ?? Date.now();
  const turn: ReadingCoStoryTurn = { ...input.scope, turnId: createId("co-scene"), requestId, turnIndex: turns.length, actor: "system", action: text(input.userAction, 2000), userAction: text(input.userAction, 2000), aiAction: input.result.friendAction || undefined, perspective: "shared", narrative: input.result.narrative, dialogue: input.result.dialogue, choices: ensureDistinctReadingStoryChoices(input.result.choices, { narrative: input.result.narrative, currentLocation: input.result.currentLocation || story.currentLocation }), stateChanges: input.result.stateChanges, userDiscoveredIntel: input.result.userDiscoveredIntel, aiDiscoveredIntel: input.result.aiDiscoveredIntel, currentLocation: input.result.currentLocation || story.currentLocation, currentTime: input.result.currentTime || story.currentTime, chapterProgress: input.result.chapterProgress, shouldEndChapter: input.result.shouldEndChapter, risk: "low", requiresUserApproval: false, visibleTo: ["user", "ai_friend"], createdAt: now };
  const advancesChapter = input.result.shouldEndChapter || input.result.chapterProgress >= 0.999;
  const chapter = Math.min(story.targetChapters, story.currentChapter + (advancesChapter ? 1 : 0));
  const next: ReadingCoStoryState = { ...story, currentChapter: chapter, currentLocation: input.result.currentLocation || story.currentLocation, currentTime: input.result.currentTime || story.currentTime, userKnownIntel: Array.from(new Set([...story.userKnownIntel, ...input.result.userDiscoveredIntel])).slice(-100), tasks: Array.from(new Set([...story.tasks, ...input.result.taskChanges])).slice(-100), inventory: Array.from(new Set([...story.inventory, ...input.result.inventoryChanges])).slice(-100), aiFriend: { ...story.aiFriend, knownIntel: Array.from(new Set([...story.aiFriend.knownIntel, ...input.result.aiDiscoveredIntel])).slice(-100), knownTurnIds: Array.from(new Set([...story.aiFriend.knownTurnIds, turn.turnId])).slice(-200) }, activeActor: "user", status: chapter >= story.targetChapters ? "completed" : story.status, updatedAt: now };
  persist(saveReadingCoStoryStore({ ...replaceStory(loaded.value, next), turns: [...loaded.value.turns, turn] }), next);
  return { story: next, turn };
}

export function commitReadingCoStoryAiAction(input: { scope: ReadingCoStoryScope; result: ReadingStoryAiActionResult; mode: ReadingCoStoryActionMode; expectedStoryUpdatedAt?: number; now?: number }): { story: ReadingCoStoryState; turn: ReadingCoStoryTurn; decision: ReturnType<typeof evaluateReadingStoryAiAction> } {
  const loaded = loadReadingCoStoryStore();
  const story = loaded.value.stories.find((candidate) => sameScope(candidate, input.scope));
  if (!story) throw new ReadingCoStoryError("Co-story does not exist", "missing");
  if (input.expectedStoryUpdatedAt !== undefined && story.updatedAt !== input.expectedStoryUpdatedAt) throw new ReadingCoStoryError("Co-story changed; refresh before submitting", "conflict");
  let decision: ReturnType<typeof evaluateReadingStoryAiAction>;
  try { decision = evaluateReadingStoryAiAction({ result: input.result, mode: input.mode }); } catch (error) { if (error instanceof ReadingCoStoryPolicyError) throw error; throw new ReadingCoStoryError("AI action policy rejected", "invalid"); }
  const turns = turnsFor(loaded.value, input.scope); const now = input.now ?? Date.now();
  const turn: ReadingCoStoryTurn = { ...input.scope, turnId: createId("co-turn"), turnIndex: turns.length, actor: "ai_friend", actionMode: input.mode, action: decision.action, aiAction: decision.action, perspective: "ai_friend", narrative: decision.status === "approval_required" ? `AI friend proposed: ${decision.action}\nReason: ${decision.rationale}` : decision.rationale, dialogue: [], choices: [], risk: decision.risk, requiresUserApproval: decision.requiresUserApproval, visibleTo: ["user", "ai_friend"], createdAt: now };
  const next: ReadingCoStoryState = { ...story, activeActor: "user", aiFriend: { ...story.aiFriend, knownTurnIds: Array.from(new Set([...story.aiFriend.knownTurnIds, turn.turnId])).slice(-200) }, pendingApproval: decision.status === "approval_required" ? { actionId: createId("ai-action"), actor: "ai_friend", action: decision.action, reason: decision.rationale, risk: "major", createdAt: now } : undefined, updatedAt: now };
  const nextStore = { ...replaceStory(loaded.value, next), turns: [...loaded.value.turns, turn] };
  persist(saveReadingCoStoryStore(nextStore), next);
  return { story: next, turn, decision };
}

export function commitReadingCoStoryUserAction(input: { scope: ReadingCoStoryScope; userAction: string; expectedStoryUpdatedAt?: number; now?: number }): { story: ReadingCoStoryState; turn: ReadingCoStoryTurn } {
  const loaded = loadReadingCoStoryStore(); const story = loaded.value.stories.find((candidate) => sameScope(candidate, input.scope));
  if (!story) throw new ReadingCoStoryError("Co-story does not exist", "missing");
  if (!input.userAction.trim()) throw new ReadingCoStoryError("User action is required", "invalid");
  if (input.expectedStoryUpdatedAt !== undefined && story.updatedAt !== input.expectedStoryUpdatedAt) throw new ReadingCoStoryError("Co-story changed; refresh before submitting", "conflict");
  const turns = turnsFor(loaded.value, input.scope); const now = input.now ?? Date.now(); const action = text(input.userAction, 2000);
  const turn: ReadingCoStoryTurn = { ...input.scope, turnId: createId("co-user"), turnIndex: turns.length, actor: "user", perspective: "user", userAction: action, action, narrative: `User action: ${action}`, dialogue: [], choices: [], risk: "low", requiresUserApproval: false, visibleTo: ["user", "ai_friend"], createdAt: now };
  const next: ReadingCoStoryState = { ...story, activeActor: "ai_friend", aiFriend: { ...story.aiFriend, knownTurnIds: Array.from(new Set([...story.aiFriend.knownTurnIds, turn.turnId])).slice(-200) }, updatedAt: now };
  persist(saveReadingCoStoryStore({ ...replaceStory(loaded.value, next), turns: [...loaded.value.turns, turn] }), next);
  return { story: next, turn };
}

export function resolveReadingCoStoryApproval(input: { scope: ReadingCoStoryScope; actionId: string; approve: boolean; now?: number }): ReadingCoStoryState {
  const loaded = loadReadingCoStoryStore(); const story = loaded.value.stories.find((candidate) => sameScope(candidate, input.scope));
  if (!story) throw new ReadingCoStoryError("Co-story does not exist", "missing");
  if (!story.pendingApproval || story.pendingApproval.actionId !== input.actionId) throw new ReadingCoStoryError("Pending action not found", "invalid");
  const turns = turnsFor(loaded.value, input.scope); const now = input.now ?? Date.now(); const action = story.pendingApproval.action;
  const turn: ReadingCoStoryTurn = { ...input.scope, turnId: createId("co-approval"), turnIndex: turns.length, actor: "system", perspective: "shared", action, aiAction: action, narrative: input.approve ? `Accepted AI friend action: ${action}` : `Rejected AI friend action: ${action}`, dialogue: [], choices: [], risk: "major", requiresUserApproval: false, visibleTo: ["user", "ai_friend"], createdAt: now };
  const next = { ...story, pendingApproval: undefined, activeActor: "user" as const, updatedAt: now };
  persist(saveReadingCoStoryStore({ ...replaceStory(loaded.value, next), turns: [...loaded.value.turns, turn] }), next);
  return next;
}

export function createReadingCoStorySave(input: { scope: ReadingCoStoryScope; label: string; now?: number }): ReadingCoStorySave {
  const story = getReadingCoStory(input.scope);
  if (!story) throw new ReadingCoStoryError("存档对应的共同故事不存在", "missing");
  const turn = listReadingCoStoryTurns(input.scope).at(-1);
  if (!turn) throw new ReadingCoStoryError("没有可保存的共同故事回合", "invalid");
  const save: ReadingCoStorySave = { ...input.scope, id: createId("co-story-save"), turnId: turn.turnId, label: text(input.label, 300) || "手动存档", state: structuredClone(story), createdAt: input.now ?? Date.now() };
  return persist(saveReadingCoStorySave(save), save);
}

export function loadReadingCoStorySave(input: { scope: ReadingCoStoryScope; saveId: string; now?: number }): ReadingCoStoryState {
  const loaded = loadReadingCoStoryStore();
  const save = loaded.value.saves.find((candidate) => sameScope(candidate, input.scope) && candidate.id === input.saveId);
  if (!save) throw new ReadingCoStoryError("共同故事存档不存在", "missing");
  const scopedTurns = loaded.value.turns
    .filter((turn) => sameScope(turn, input.scope))
    .sort((left, right) => left.turnIndex - right.turnIndex);
  const savedTurnIndex = scopedTurns.find((turn) => turn.turnId === save.turnId)?.turnIndex;
  const fallbackTurn = savedTurnIndex === undefined
    ? scopedTurns
      .filter((turn) => turn.createdAt <= (Number(save.state.updatedAt) || save.createdAt))
      .at(-1)
    : undefined;
  const effectiveSavedTurnIndex = savedTurnIndex ?? fallbackTurn?.turnIndex;
  const remainingTurns = effectiveSavedTurnIndex === undefined
    ? loaded.value.turns
    : loaded.value.turns.filter((turn) => !sameScope(turn, input.scope) || turn.turnIndex <= effectiveSavedTurnIndex);
  const restored = { ...structuredClone(save.state), updatedAt: input.now ?? Date.now() };
  const nextStore = {
    ...loaded.value,
    stories: [...loaded.value.stories.filter((candidate) => !sameScope(candidate, input.scope)), restored],
    turns: remainingTurns,
  };
  return persist(saveReadingCoStoryStore(nextStore), restored);
}

export function updateReadingCoStoryMetadata(input: { scope: ReadingCoStoryScope; title?: string; status?: "active" | "paused"; generationPreferences?: Partial<ReadingStoryGenerationPreferences>; now?: number }): ReadingCoStoryState {
  const story = getReadingCoStory(input.scope);
  if (!story) throw new ReadingCoStoryError("共同故事不存在", "missing");
  if (story.status === "completed" && input.status === "active") throw new ReadingCoStoryError("已完成的共同故事不能恢复为进行中", "invalid");
  const next = { ...story, title: input.title === undefined ? story.title : text(input.title, 500), status: input.status || story.status, generationPreferences: input.generationPreferences ? normalizeReadingStoryGenerationPreferences(input.generationPreferences) : story.generationPreferences, updatedAt: input.now ?? Date.now() };
  if (!next.title) throw new ReadingCoStoryError("故事名称不能为空", "invalid");
  return persist(saveReadingCoStory(next), next);
}

export function deleteReadingCoStory(input: { scope: ReadingCoStoryScope }): void {
  persist(deleteReadingCoStoryScope(input.scope), undefined);
}

export function getCoStory(scope: ReadingCoStoryScope): ReadingCoStoryState | undefined { return getReadingCoStory(scope); }
