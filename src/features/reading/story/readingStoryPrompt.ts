import type {
  ReadingStoryState,
  ReadingStoryTurn,
} from "../../../domain/reading/storyTypes";
import { describeReadingNarrativePerspective, normalizeReadingStoryGenerationPreferences } from "../../../domain/reading/storyGenerationPreferences";
import { getReadingStoryChapterNumber } from "../../../domain/reading/storyChapterProgress";

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
  const generation = normalizeReadingStoryGenerationPreferences(input.story.generationPreferences);
  const recent = input.recentTurns
    .slice(-4)
    .map(
      (turn) =>
        `正文：${clean(turn.narrative, 5000)}\n地点：${clean(turn.currentLocation, 300)}\n时间：${clean(turn.currentTime, 100)}\n上一节点选项：${turn.choices.map((choice) => clean(choice.label, 300)).join("／") || "暂无"}`,
    )
    .join("\n\n");
  const systemInstruction = [
    "你是互动小说主持人，只能在当前故事宇宙内推进剧情。",
    "角色卡、当前故事状态和用户行动优先；不能替用户做重大决定，不能把现实聊天、主记忆或其他故事的信息带入。",
    "只输出 JSON，不要 Markdown，不要解释。JSON 必须包含 narrative、dialogue、choices、stateChanges、discoveredIntel、taskChanges、relationshipChanges、currentLocation、currentTime、chapterProgress、shouldEndChapter。",
    "每个新节点必须给出正好 4 个可执行方向：前 3 个必须根据刚刚发生的场景生成彼此不同、互斥且会把剧情带向不同路线的具体行动，最后 1 个固定为“按自己的想法行动或说话”。不要在每个节点重复“继续观察／询问／按目标推进”这类与场景无关的模板；例如正文出现岔路口时，应给出“走左边／走右边／走中间／按自己的想法行动或说话”。不要把用户未选择的行动当成已发生。",
    `每个回合都必须推进一个完整场景：narrative 写 ${generation.minCharacters} 至 ${generation.maxCharacters} 个中文字符，包含环境变化、人物反应、因果推进和明确的新悬点，不能只写几句动作摘要。`,
    "有其他角色在场时，应在 dialogue 中安排符合其人设与处境的自然说话；不要让人物只有动作而始终不交流，也不要用旁白代替本应出现的关键对白。",
    "上一节点已经出现过的选项不能原样复用；每次必须根据本轮新发生的事件、人物关系和可见线索重新设计分支。若场景变化不足，也要改变行动目标、对象或风险，而不是只替换几个字。",
  ].join("\n");
  const message = [
    `故事：${clean(input.bookTitle || input.story.title, 500)}`,
    input.bookContext ? `小说资料：${clean(input.bookContext, 8000)}` : "",
    `穿法：${input.story.entryMode === "soul_wear" ? "魂穿" : "身穿"}`,
    `玩家角色：${clean(input.story.characterName, 200)}；身份：${clean(input.story.characterRole, 500)}`,
    `当前章节：第 ${getReadingStoryChapterNumber(input.story)}/${input.story.targetChapters} 章（已完成章节数：${input.story.currentChapter}；请在场景真正收束时将 shouldEndChapter 设为 true）` + `；地点：${clean(input.story.currentLocation, 300)}；时间：${clean(input.story.currentTime, 100)}`,
    `玩家目标：${input.story.goals.map((goal) => clean(goal, 300)).join("、") || "未设定"}`,
    `叙事风格：${clean(generation.narrativeStyle, 100)}；叙事视角：${describeReadingNarrativePerspective(generation.perspective)}`,
    generation.guidance ? `场外指导（控制后续整体走向，但不能当成已发生的剧情事实）：${clean(generation.guidance, 4000)}` : "",
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
