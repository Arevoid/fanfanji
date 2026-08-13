import { getReadingCoStory, loadReadingCoStoryStore, saveReadingCoStory, saveReadingCoStoryStore } from "../../../core/storage/repositories/readingCoStoryRepository";
import type { ReadingCoStoryActionMode, ReadingCoStoryScope, ReadingCoStoryState, ReadingCoStoryTurn, ReadingStoryAiActionResult } from "../../../domain/reading/coStoryTypes";
import type { ReadingStoryLength } from "../../../domain/reading/storyTypes";
import { evaluateReadingStoryAiAction, ReadingCoStoryPolicyError } from "./readingCoStoryPolicy";

const targetChapters: Record<ReadingStoryLength, number> = { short: 3, medium: 8, long: 20 };
const createId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const text = (value: string, max: number): string => value.trim().slice(0, max);

export class ReadingCoStoryError extends Error {
  constructor(message: string, public readonly code: "invalid" | "missing" | "storage" | "conflict") {
    super(message);
    this.name = "ReadingCoStoryError";
  }
}

function persist<T>(result: { success: boolean; error?: string }, value: T): T { if (!result.success) throw new ReadingCoStoryError(result.error || "共同穿书状态保存失败", "storage"); return value; }

export function createReadingCoStory(input: {
  scope: ReadingCoStoryScope;
  title: string;
  universeStoryId?: string;
  length: ReadingStoryLength;
  userCharacterName: string;
  userCharacterRole?: string;
  userGoals?: string[];
  aiFriend: ReadingCoStoryState["aiFriend"];
  now?: number;
}): ReadingCoStoryState {
  if (!input.title.trim() || !input.userCharacterName.trim()) throw new ReadingCoStoryError("共同故事标题和用户角色名不能为空", "invalid");
  if (input.aiFriend.relationId !== input.scope.relationId || input.aiFriend.characterId !== input.scope.characterId) throw new ReadingCoStoryError("AI 好友关系和角色作用域不匹配", "invalid");
  const now = input.now ?? Date.now();
  const state: ReadingCoStoryState = {
    ...input.scope,
    universeStoryId: input.universeStoryId,
    title: text(input.title, 500),
    length: input.length,
    status: "active",
    currentChapter: 0,
    targetChapters: targetChapters[input.length],
    currentLocation: "未设定",
    currentTime: "故事开始",
    userCharacterName: text(input.userCharacterName, 200),
    userCharacterRole: input.userCharacterRole ? text(input.userCharacterRole, 500) : undefined,
    userGoals: (input.userGoals || []).map((goal) => text(goal, 500)).filter(Boolean).slice(0, 30),
    aiFriend: {
      ...input.aiFriend,
      displayName: text(input.aiFriend.displayName, 200),
      characterName: text(input.aiFriend.characterName, 200),
      characterRole: input.aiFriend.characterRole ? text(input.aiFriend.characterRole, 500) : undefined,
      personaSummary: text(input.aiFriend.personaSummary, 3000),
      knownIntel: input.aiFriend.knownIntel.map((item) => text(item, 1000)).filter(Boolean).slice(0, 100),
      knownTurnIds: input.aiFriend.knownTurnIds.slice(0, 200),
    },
    activeActor: "user",
    createdAt: now,
    updatedAt: now,
  };
  return persist(saveReadingCoStory(state), state);
}

export function commitReadingCoStoryAiAction(input: {
  scope: ReadingCoStoryScope;
  result: ReadingStoryAiActionResult;
  mode: ReadingCoStoryActionMode;
  expectedStoryUpdatedAt?: number;
  now?: number;
}): { story: ReadingCoStoryState; turn: ReadingCoStoryTurn; decision: ReturnType<typeof evaluateReadingStoryAiAction> } {
  const loaded = loadReadingCoStoryStore();
  const story = loaded.value.stories.find((candidate) => candidate.userIdentityId === input.scope.userIdentityId && candidate.coStoryId === input.scope.coStoryId && candidate.relationId === input.scope.relationId && candidate.characterId === input.scope.characterId);
  if (!story) throw new ReadingCoStoryError("共同故事不存在", "missing");
  if (input.expectedStoryUpdatedAt !== undefined && story.updatedAt !== input.expectedStoryUpdatedAt) throw new ReadingCoStoryError("共同故事已在其他页面更新，请刷新后重试", "conflict");
  let decision;
  try { decision = evaluateReadingStoryAiAction({ result: input.result, mode: input.mode }); } catch (error) {
    if (error instanceof ReadingCoStoryPolicyError) throw error;
    throw new ReadingCoStoryError("AI 好友行动不符合安全协议", "invalid");
  }
  const turns = loaded.value.turns.filter((turn) => turn.userIdentityId === input.scope.userIdentityId && turn.coStoryId === input.scope.coStoryId && turn.relationId === input.scope.relationId && turn.characterId === input.scope.characterId).sort((left, right) => left.turnIndex - right.turnIndex);
  const now = input.now ?? Date.now();
  const actionId = createId("ai-action");
  const turn: ReadingCoStoryTurn = {
    ...input.scope,
    turnId: createId("co-turn"),
    turnIndex: turns.length,
    actor: "ai_friend",
    actionMode: input.mode,
    action: decision.action,
    narrative: decision.status === "approval_required" ? `AI 好友提出行动：${decision.action}\n原因：${decision.rationale}` : decision.rationale,
    dialogue: [],
    choices: [],
    risk: decision.risk,
    requiresUserApproval: decision.requiresUserApproval,
    visibleTo: ["user", "ai_friend"],
    createdAt: now,
  };
  const next: ReadingCoStoryState = {
    ...story,
    activeActor: "user",
    aiFriend: { ...story.aiFriend, knownTurnIds: Array.from(new Set([...story.aiFriend.knownTurnIds, turn.turnId])).slice(-200) },
    pendingApproval: decision.status === "approval_required" ? { actionId, actor: "ai_friend", action: decision.action, reason: decision.rationale, risk: "major", createdAt: now } : undefined,
    updatedAt: now,
  };
  const nextStore = {
    ...loaded.value,
    stories: [...loaded.value.stories.filter((candidate) => !(candidate.userIdentityId === input.scope.userIdentityId && candidate.coStoryId === input.scope.coStoryId && candidate.relationId === input.scope.relationId && candidate.characterId === input.scope.characterId)), next],
    turns: [...loaded.value.turns, turn],
  };
  persist(saveReadingCoStoryStore(nextStore), next);
  return { story: next, turn, decision };
}

export function getCoStory(scope: ReadingCoStoryScope): ReadingCoStoryState | undefined { return getReadingCoStory(scope); }
