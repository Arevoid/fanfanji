import type { UserSettings } from "../../../types";
import type { ForumStory, StoryForumUser } from "../../../domain/forumStory/forumStoryTypes";
import { createForumStory, type ForumStoryCreationResult } from "./forumStoryGenerationService";
import { generateStoryComments, type ForumStoryCommentGenerationResult } from "./forumStoryCommentService";
import { ForumStoryRepository } from "../forumStoryRepository";
import { StoryThreadRepository } from "../storyThreadRepository";
import { ForumStoryUpdateService } from "./forumStoryUpdateService";

/**
 * Manual-refresh-only story creation. This service deliberately has no timer,
 * page-entry side effect, Memory, Relationship, Character, or private context.
 */
const STORY_THEMES = [
  "我怀疑隔壁新搬来的学长在偷偷照顾我，怎么办",
  "你们有没有发现公司那个冷脸上司最近真的很不对劲",
  "求助：我好像把死对头落下的东西带回家了",
  "我朋友说她在宿舍捡到一只会写字的猫，现在所有人都不信她",
  "你们遇到过那种嘴上嫌弃你、行动却特别诚实的人吗",
] as const;

const FORUM_USER_SEEDS = [
  { displayName: "路过的猹", userType: "observer", style: "吃瓜但不拱火，爱追问后续", personaSummary: "围观型网友，语气轻松，擅长提醒楼主补充细节。" },
  { displayName: "谢邀夜猫子", userType: "analyst", style: "先说结论再分析，偶尔以谢邀开头", personaSummary: "理性分析型网友，喜欢梳理时间线。" },
  { displayName: "楼下便利店", userType: "supporter", style: "温和支持，给出实际建议", personaSummary: "友好热心的网友，不会过度煽动。" },
  { displayName: "真的假的", userType: "skeptic", style: "谨慎怀疑，会追问证据", personaSummary: "怀疑型网友，表达直接但不人身攻击。" },
  { displayName: "知情一点点", userType: "insider", style: "只补充有限线索，不抢楼主叙事", personaSummary: "像有一点边缘信息的网友，保持克制和神秘感。" },
] as const;

export interface GenerateForumStoryOnManualRefreshInput {
  settings: UserSettings;
  now?: number;
  random?: () => number;
}

export interface GenerateForumStoryOnManualRefreshResult {
  creation: ForumStoryCreationResult;
  comments: ForumStoryCommentGenerationResult;
}

export interface AdvanceForumStoryOnManualRefreshResult {
  story: ForumStory;
  completed: boolean;
}

const toStoryUsers = (storyId: string, now: number): StoryForumUser[] => FORUM_USER_SEEDS.map((seed, index) => ({
  id: `${storyId}:forum-user:${index + 1}`,
  storyId,
  displayName: seed.displayName,
  userType: seed.userType,
  style: seed.style,
  personaSummary: seed.personaSummary,
  createdAt: now,
  updatedAt: now,
}));

export const generateForumStoryOnManualRefresh = async (
  input: GenerateForumStoryOnManualRefreshInput,
): Promise<GenerateForumStoryOnManualRefreshResult> => {
  const now = input.now ?? Date.now();
  const random = input.random || Math.random;
  const theme = STORY_THEMES[Math.floor(random() * STORY_THEMES.length)] || STORY_THEMES[0];
  const outcomeRoll = random();
  const narrativeOutcome = outcomeRoll < 0.1 ? "abandoned" : outcomeRoll < 0.9 ? "complete" : "open";
  const creation = await createForumStory({ theme, settings: input.settings, now, creationSource: "system", narrativeOutcome });
  const comments = await generateStoryComments({
    story: creation.story,
    thread: creation.thread,
    characters: creation.characters,
    forumUsers: toStoryUsers(creation.story.id, now),
    settings: input.settings,
    // New story discussion stays bounded: 5–10 actual persisted floors.
    count: 5 + Math.floor(random() * 6),
    now,
  });
  return { creation, comments };
};

/**
 * Advances at most one existing story, and only while the reader explicitly
 * refreshes the forum. `abandoned` stories intentionally never receive an
 * automatic continuation; a direct reader interaction can still revive them.
 */
export const advanceForumStoryOnManualRefresh = async (
  input: GenerateForumStoryOnManualRefreshInput,
): Promise<AdvanceForumStoryOnManualRefreshResult | undefined> => {
  const now = input.now ?? Date.now();
  const candidates = ForumStoryRepository.listStories()
    .filter((story) => story.status !== "completed" && story.narrativeOutcome !== "abandoned")
    .sort((left, right) => left.updatedAt - right.updatedAt);
  const story = candidates[0];
  if (!story) return undefined;
  const threadId = story.mainThreadId || StoryThreadRepository.listThreads(story.id)[0]?.id;
  const thread = threadId ? StoryThreadRepository.getThread(story.id, threadId) : undefined;
  if (!thread) return undefined;
  const conclude = thread.readerInterest === true && story.currentEpisode >= 3
    || story.narrativeOutcome === "complete" && story.currentEpisode >= 4;
  const update = await ForumStoryUpdateService.generateStoryUpdate({
    story,
    thread,
    settings: input.settings,
    now,
    triggerReason: "manual",
    conclude,
  });
  if (!conclude) {
    await generateStoryComments({
      story: update.story,
      thread: update.thread,
      settings: input.settings,
      count: 5 + Math.floor((input.random || Math.random)() * 6),
      now,
    });
  }
  return { story: update.story, completed: conclude };
};

export const ForumStoryRefreshService = {
  generateForumStoryOnManualRefresh,
  advanceForumStoryOnManualRefresh,
};
