import { getReadingCoStory, listReadingCoStorySaves, listReadingCoStoryTurns, loadReadingCoStoryStore, saveReadingCoStory, saveReadingCoStorySave, saveReadingCoStoryStore } from "../../../core/storage/repositories/readingCoStoryRepository";
import type { ReadingCoStoryActionMode, ReadingCoStorySave, ReadingCoStoryScope, ReadingCoStoryState, ReadingCoStoryTurn, ReadingStoryAiActionResult } from "../../../domain/reading/coStoryTypes";
import type { ReadingStoryLength } from "../../../domain/reading/storyTypes";
import { evaluateReadingStoryAiAction, ReadingCoStoryPolicyError } from "./readingCoStoryPolicy";

const targetChapters: Record<ReadingStoryLength, number> = { short: 3, medium: 8, long: 20 };
const createId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const text = (value: string, max: number): string => value.trim().slice(0, max);
const sameScope = (left: ReadingCoStoryScope, right: ReadingCoStoryScope): boolean => left.userIdentityId === right.userIdentityId && left.coStoryId === right.coStoryId && left.relationId === right.relationId && left.characterId === right.characterId;

export class ReadingCoStoryError extends Error { constructor(message: string, public readonly code: "invalid" | "missing" | "storage" | "conflict") { super(message); this.name = "ReadingCoStoryError"; } }
function persist<T>(result: { success: boolean; error?: string }, value: T): T { if (!result.success) throw new ReadingCoStoryError(result.error || "Co-story save failed", "storage"); return value; }

export function createReadingCoStory(input: { scope: ReadingCoStoryScope; title: string; universeStoryId?: string; origin?: ReadingCoStoryState["origin"]; worldDefinition?: ReadingCoStoryState["worldDefinition"]; length: ReadingStoryLength; userCharacterName: string; userCharacterRole?: string; userEntryMode?: ReadingCoStoryState["userEntryMode"]; userOriginalCharacterId?: string; userGoals?: string[]; aiFriend: ReadingCoStoryState["aiFriend"]; now?: number }): ReadingCoStoryState {
  if (!input.title.trim() || !input.userCharacterName.trim()) throw new ReadingCoStoryError("Co-story title and user character are required", "invalid");
  if (input.aiFriend.relationId !== input.scope.relationId || input.aiFriend.characterId !== input.scope.characterId) throw new ReadingCoStoryError("AI friend scope mismatch", "invalid");
  if (input.origin === "custom" && (!input.worldDefinition?.genre.trim() || !input.worldDefinition.worldView.trim() || !input.worldDefinition.synopsis.trim())) throw new ReadingCoStoryError("Custom world requires genre, world view, and synopsis", "invalid");
  const now = input.now ?? Date.now();
  const state: ReadingCoStoryState = { ...input.scope, universeStoryId: input.universeStoryId, origin: input.origin || (input.universeStoryId ? "book" : "custom"), worldDefinition: input.worldDefinition ? { genre: text(input.worldDefinition.genre, 200), worldView: text(input.worldDefinition.worldView, 6000), synopsis: text(input.worldDefinition.synopsis, 6000), intendedEnding: input.worldDefinition.intendedEnding ? text(input.worldDefinition.intendedEnding, 3000) : undefined } : undefined, title: text(input.title, 500), length: input.length, status: "active", currentChapter: 0, targetChapters: targetChapters[input.length], currentLocation: "未设定", currentTime: "故事开始", userCharacterName: text(input.userCharacterName, 200), userCharacterRole: input.userCharacterRole ? text(input.userCharacterRole, 500) : undefined, userEntryMode: input.userEntryMode, userOriginalCharacterId: input.userOriginalCharacterId ? text(input.userOriginalCharacterId, 200) : undefined, userGoals: (input.userGoals || []).map((goal) => text(goal, 500)).filter(Boolean).slice(0, 30), aiFriend: { ...input.aiFriend, displayName: text(input.aiFriend.displayName, 200), characterName: text(input.aiFriend.characterName, 200), characterRole: input.aiFriend.characterRole ? text(input.aiFriend.characterRole, 500) : undefined, originalCharacterId: input.aiFriend.originalCharacterId ? text(input.aiFriend.originalCharacterId, 200) : undefined, personaSummary: text(input.aiFriend.personaSummary, 3000), knownIntel: input.aiFriend.knownIntel.map((item) => text(item, 1000)).filter(Boolean).slice(0, 100), knownTurnIds: input.aiFriend.knownTurnIds.slice(0, 200) }, activeActor: "user", createdAt: now, updatedAt: now };
  return persist(saveReadingCoStory(state), state);
}

export function createReadingCoStoryOpening(input: { scope: ReadingCoStoryScope; narrative: string; choices: ReadingCoStoryTurn["choices"]; now?: number }): ReadingCoStoryTurn {
  const loaded = loadReadingCoStoryStore();
  const story = loaded.value.stories.find((candidate) => sameScope(candidate, input.scope));
  if (!story) throw new ReadingCoStoryError("Co-story does not exist", "missing");
  const existing = turnsFor(loaded.value, input.scope);
  if (existing.length) return existing[0];
  const now = input.now ?? Date.now();
  const turn: ReadingCoStoryTurn = { ...input.scope, turnId: createId("co-opening"), turnIndex: 0, actor: "system", perspective: "shared", narrative: text(input.narrative, 12000), dialogue: [], choices: input.choices.slice(0, 8), risk: "low", requiresUserApproval: false, visibleTo: ["user", "ai_friend"], createdAt: now };
  if (!turn.narrative) throw new ReadingCoStoryError("Opening narrative is required", "invalid");
  const nextStory: ReadingCoStoryState = { ...story, aiFriend: { ...story.aiFriend, knownTurnIds: [...story.aiFriend.knownTurnIds, turn.turnId] }, updatedAt: now };
  persist(saveReadingCoStoryStore({ ...replaceStory(loaded.value, nextStory), turns: [...loaded.value.turns, turn] }), turn);
  return turn;
}

const turnsFor = (store: ReturnType<typeof loadReadingCoStoryStore>["value"], scope: ReadingCoStoryScope): ReadingCoStoryTurn[] => store.turns.filter((turn) => sameScope(turn, scope)).sort((left, right) => left.turnIndex - right.turnIndex);
const replaceStory = (store: ReturnType<typeof loadReadingCoStoryStore>["value"], next: ReadingCoStoryState) => ({ ...store, stories: [...store.stories.filter((candidate) => !sameScope(candidate, next)), next] });

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
  const save = listReadingCoStorySaves(input.scope).find((candidate) => candidate.id === input.saveId);
  if (!save) throw new ReadingCoStoryError("共同故事存档不存在", "missing");
  const restored = { ...structuredClone(save.state), updatedAt: input.now ?? Date.now() };
  return persist(saveReadingCoStory(restored), restored);
}

export function getCoStory(scope: ReadingCoStoryScope): ReadingCoStoryState | undefined { return getReadingCoStory(scope); }
