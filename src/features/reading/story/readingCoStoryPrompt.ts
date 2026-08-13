import type { ReadingCoStoryState, ReadingCoStoryTurn } from "../../../domain/reading/coStoryTypes";

export interface ReadingCoStoryAiContext {
  persona: string;
  role: string;
  userRole: string;
  currentStory: { title: string; location: string; time: string; chapter: string };
  knownIntel: string[];
  visibleRecentTurns: Array<{ actor: "user" | "ai_friend" | "system"; action?: string; narrative: string }>;
}

/** Projects only the AI friend's knowledge boundary; hidden user turns never enter its prompt. */
export function projectReadingCoStoryForAi(input: { story: ReadingCoStoryState; turns: readonly ReadingCoStoryTurn[] }): ReadingCoStoryAiContext {
  const knownTurnIds = new Set(input.story.aiFriend.knownTurnIds);
  const visibleRecentTurns = input.turns.filter((turn) => turn.visibleTo.includes("ai_friend") && knownTurnIds.has(turn.turnId)).slice(-4).map((turn) => ({ actor: turn.actor, action: turn.action, narrative: turn.narrative.slice(0, 5000) }));
  return {
    persona: input.story.aiFriend.personaSummary,
    role: input.story.aiFriend.characterRole || input.story.aiFriend.characterName,
    userRole: input.story.userCharacterRole || input.story.userCharacterName,
    currentStory: { title: input.story.title, location: input.story.currentLocation, time: input.story.currentTime, chapter: `${input.story.currentChapter}/${input.story.targetChapters}` },
    knownIntel: input.story.aiFriend.knownIntel.slice(-20),
    visibleRecentTurns,
  };
}

export function buildReadingCoStoryAiActionPrompt(input: { context: ReadingCoStoryAiContext; mode: "suggest" | "ask_opinion" | "low_risk_execute"; userRequest?: string }): { systemInstruction: string; message: string } {
  return {
    systemInstruction: "你是共同穿书中的 AI 好友。必须服从角色卡和关系语气，只能控制自己的角色；不能替用户角色做决定。major 行动或可能改变用户角色生死、身份、关系、路线的行动必须 requiresUserApproval=true。只输出 JSON：action、rationale、risk(low|major)、requiresUserApproval、controlsUserCharacter(false)。",
    message: JSON.stringify({ mode: input.mode, persona: input.context.persona, role: input.context.role, userRole: input.context.userRole, story: input.context.currentStory, knownIntel: input.context.knownIntel, recentTurns: input.context.visibleRecentTurns, userRequest: input.userRequest || "请根据当前情境提出下一步行动" }),
  };
}
