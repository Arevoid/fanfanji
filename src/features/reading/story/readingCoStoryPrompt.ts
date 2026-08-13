import type { ReadingCoStoryState, ReadingCoStoryTurn } from "../../../domain/reading/coStoryTypes";

export interface ReadingCoStoryAiContext {
  persona: string;
  role: string;
  userRole: string;
  currentStory: { title: string; location: string; time: string; chapter: string; genre?: string; worldView?: string; synopsis?: string; intendedEnding?: string };
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
    currentStory: { title: input.story.title, location: input.story.currentLocation, time: input.story.currentTime, chapter: `${input.story.currentChapter}/${input.story.targetChapters}`, genre: input.story.worldDefinition?.genre, worldView: input.story.worldDefinition?.worldView, synopsis: input.story.worldDefinition?.synopsis, intendedEnding: input.story.worldDefinition?.intendedEnding },
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

export function buildReadingCoStoryTurnPrompt(input: { story: ReadingCoStoryState; turns: readonly ReadingCoStoryTurn[]; userAction: string }): { systemInstruction: string; message: string } {
  const context = projectReadingCoStoryForAi({ story: input.story, turns: input.turns });
  return {
    systemInstruction: [
      "你是双角色互动小说主持人，负责根据用户明确提交的行动推进一个结构化共同故事回合。",
      "用户只控制自己的角色；AI 好友只控制自己的角色。不得补写用户没有选择的重大行动，不得让 AI 好友替用户决定身份、生死、关系或路线。",
      "AI 好友的反应必须优先服从角色卡、人设、关系和当前身份，不得套用统一温柔、安慰或主动提问模板。",
      "只能使用提供的当前宇宙、双方已知情报和可见回合，不得读取现实主记忆、其他好友房间或其他故事分支。",
      "只输出 JSON，不要 Markdown。必须包含 narrative、dialogue、choices、friendAction、controlsUserCharacter(false)、stateChanges、userDiscoveredIntel、aiDiscoveredIntel、taskChanges、inventoryChanges、currentLocation、currentTime、chapterProgress、shouldEndChapter。",
      "choices 最多 8 个；正文不得把尚未选择的选项写成已经发生。若 AI 好友希望进行重大行动，只能在正文中提出建议，不得直接执行。",
    ].join("\n"),
    message: JSON.stringify({
      story: context.currentStory,
      user: { name: input.story.userCharacterName, role: input.story.userCharacterRole, entryMode: input.story.userEntryMode, goals: input.story.userGoals, knownIntel: input.story.userKnownIntel, inventory: input.story.inventory },
      aiFriend: { name: input.story.aiFriend.characterName, role: context.role, entryMode: input.story.aiFriend.entryMode, persona: context.persona, knownIntel: context.knownIntel },
      tasks: input.story.tasks,
      recentVisibleTurns: context.visibleRecentTurns,
      userAction: input.userAction.trim().slice(0, 2000),
    }),
  };
}
