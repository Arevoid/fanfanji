import type { ReadingCoStoryState, ReadingCoStoryTurn } from "../../../domain/reading/coStoryTypes";
import { describeReadingNarrativePerspective, normalizeReadingStoryGenerationPreferences } from "../../../domain/reading/storyGenerationPreferences";

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
  const generation = normalizeReadingStoryGenerationPreferences(input.story.generationPreferences);
  return {
    systemInstruction: [
      "你是双角色互动小说主持人，负责根据用户明确提交的行动推进一个结构化共同故事回合。",
      "用户只控制自己的角色；AI 好友只控制自己的角色。不得补写用户没有选择的重大行动，不得让 AI 好友替用户决定身份、生死、关系或路线。",
      "AI 好友的反应必须优先服从角色卡、人设、关系和当前身份，不得套用统一温柔、安慰或主动提问模板。",
      "只能使用提供的当前宇宙、双方已知情报和可见回合，不得读取现实主记忆、其他好友房间或其他故事分支。",
      "只输出 JSON，不要 Markdown。必须包含 narrative、dialogue、choices、friendAction、controlsUserCharacter(false)、stateChanges、userDiscoveredIntel、aiDiscoveredIntel、taskChanges、inventoryChanges、currentLocation、currentTime、chapterProgress、shouldEndChapter。",
      "每个新节点必须给出正好 4 个可执行方向：前 3 个必须从刚刚发生的共同场景中提炼出彼此不同、互斥且会把剧情带向不同路线的具体行动，最后 1 个固定为“按自己的想法行动或说话”。不要重复通用模板；例如正文出现岔路口时，应给出“走左边／走右边／走中间／按自己的想法行动或说话”。正文不得把尚未选择的选项写成已经发生。若 AI 好友希望进行重大行动，只能在正文中提出建议，不得直接执行。",
      `每个回合都必须推进一个完整场景：narrative 写 ${generation.minCharacters} 至 ${generation.maxCharacters} 个中文字符，包含环境、事件发展、双方反应、因果变化和新的选择节点，不能只返回几句动作摘要。`,
      "AI 好友不能只有行为描述。除非当前场景确实无法说话，否则 dialogue 至少包含一条 AI 好友符合人设、关系、身份和当前情境的自然台词；台词应与行动共同推动剧情。",
    ].join("\n"),
    message: JSON.stringify({
      story: context.currentStory,
      user: { name: input.story.userCharacterName, role: input.story.userCharacterRole, entryMode: input.story.userEntryMode, goals: input.story.userGoals, knownIntel: input.story.userKnownIntel, inventory: input.story.inventory },
      aiFriend: { name: input.story.aiFriend.characterName, role: context.role, entryMode: input.story.aiFriend.entryMode, persona: context.persona, knownIntel: context.knownIntel },
      tasks: input.story.tasks,
      generation: { narrativeStyle: generation.narrativeStyle, perspective: describeReadingNarrativePerspective(generation.perspective), guidance: generation.guidance || "" },
      recentVisibleTurns: context.visibleRecentTurns,
      userAction: input.userAction.trim().slice(0, 2000),
    }),
  };
}
