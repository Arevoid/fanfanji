import type {
  ReadingStoryState,
  ReadingStoryTurn,
} from "../../../domain/reading/storyTypes";

export interface ReadingStoryPromptInput {
  story: ReadingStoryState;
  recentTurns: readonly ReadingStoryTurn[];
  userAction: string;
  bookTitle?: string;
  bookContext?: string;
}
export interface ReadingStoryPrompt {
  systemInstruction: string;
  message: string;
}

const clean = (value: unknown, max: number): string =>
  String(value ?? "")
    .trim()
    .slice(0, max);

/** Projects only the current story universe and recent turns; never serializes IDs or reality memory. */
export function buildReadingStoryPrompt(
  input: ReadingStoryPromptInput,
): ReadingStoryPrompt {
  const recent = input.recentTurns
    .slice(-4)
    .map(
      (turn) =>
        `正文：${clean(turn.narrative, 5000)}\n地点：${clean(turn.currentLocation, 300)}\n时间：${clean(turn.currentTime, 100)}`,
    )
    .join("\n\n");
  const systemInstruction = [
    "你是互动小说主持人，只能在当前故事宇宙内推进剧情。",
    "角色卡、当前故事状态和用户行动优先；不能替用户做重大决定，不能把现实聊天、主记忆或其他故事的信息带入。",
    "只输出 JSON，不要 Markdown，不要解释。JSON 必须包含 narrative、dialogue、choices、stateChanges、discoveredIntel、taskChanges、relationshipChanges、currentLocation、currentTime、chapterProgress、shouldEndChapter。",
    "choices 最多 8 个，给用户保留至少一个可自由输入的空间；不要把用户未选择的行动当成已发生。",
    "每个回合都必须推进一个完整场景：narrative 通常写 600 至 1200 个中文字符，包含环境变化、人物反应、因果推进和明确的新悬点，不能只写几句动作摘要。",
    "有其他角色在场时，应在 dialogue 中安排符合其人设与处境的自然说话；不要让人物只有动作而始终不交流，也不要用旁白代替本应出现的关键对白。",
  ].join("\n");
  const message = [
    `故事：${clean(input.bookTitle || input.story.title, 500)}`,
    input.bookContext ? `小说资料：${clean(input.bookContext, 8000)}` : "",
    `穿法：${input.story.entryMode === "soul_wear" ? "魂穿" : "身穿"}`,
    `玩家角色：${clean(input.story.characterName, 200)}；身份：${clean(input.story.characterRole, 500)}`,
    `章节进度：${input.story.currentChapter}/${input.story.targetChapters}；地点：${clean(input.story.currentLocation, 300)}；时间：${clean(input.story.currentTime, 100)}`,
    `玩家目标：${input.story.goals.map((goal) => clean(goal, 300)).join("、") || "未设定"}`,
    `已知情报：${
      input.story.discoveredIntel
        .slice(-20)
        .map((item) => clean(item, 400))
        .join("；") || "暂无"
    }`,
    `当前任务：${
      input.story.tasks
        .slice(-20)
        .map((item) => clean(item, 400))
        .join("；") || "暂无"
    }`,
    "最近回合：",
    recent || "（故事刚开始）",
    `玩家本轮行动：${clean(input.userAction, 2000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { systemInstruction, message };
}
