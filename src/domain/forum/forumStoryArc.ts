import type { ForumReply, ForumThread } from "../../types";

export type ForumStoryCategory = "emotion" | "campus" | "mystery" | "mild-horror" | "fantasy" | "urban-legend" | "help" | "rant" | "encounter" | "other";
export interface ForumStoryArc {
  category: ForumStoryCategory;
  status: "open" | "resolved" | "abandoned";
  episode: number;
  lastUpdateAt?: number;
  nextUpdateAfter?: number;
  continuationProbability: number;
  publicRecap?: string;
}

const STORY_HINTS: Array<[ForumStoryCategory, RegExp]> = [
  ["mystery", /奇怪|不对劲|失踪|线索|监控|门外|楼道|跟着/i],
  ["mild-horror", /怪谈|害怕|半夜|敲门|影子|诡/i],
  ["campus", /学校|宿舍|老师|同学|社团|校园/i],
  ["fantasy", /兽人|非人|魔法|种族|架空/i],
  ["emotion", /对象|朋友|家里|分手|喜欢|关系/i],
  ["encounter", /偶遇|捞人|寻找|见过/i],
];

export const inferForumStoryArc = (thread: Pick<ForumThread, "source" | "title" | "body">): ForumStoryArc | undefined => {
  if (thread.source === "user" || thread.source === "user-anonymous") return undefined;
  const text = `${thread.title}\n${thread.body}`;
  const match = STORY_HINTS.find(([, pattern]) => pattern.test(text));
  if (!match) return undefined;
  return { category: match[0], status: "open", episode: 1, continuationProbability: 0.7, publicRecap: text.slice(0, 300) };
};

export const canScheduleStoryContinuation = (thread: ForumThread, replies: readonly ForumReply[], now: number): boolean => {
  const arc = thread.storyArc;
  if (!arc || arc.status !== "open" || thread.source === "user" || thread.source === "user-anonymous") return false;
  const authorUpdates = replies.filter((reply) => reply.threadId === thread.id && reply.kind === "author-update");
  const last = Math.max(thread.occurredAt, arc.lastUpdateAt || 0, ...authorUpdates.map((reply) => reply.occurredAt));
  return now >= (arc.nextUpdateAfter || last + 6 * 60 * 60 * 1000)
    && now - last >= 6 * 60 * 60 * 1000
    && authorUpdates.filter((reply) => reply.occurredAt >= now - 24 * 60 * 60 * 1000).length < 1;
};

export const applyForumStoryUpdate = (thread: ForumThread, reply: ForumReply, now: number): ForumThread => {
  if (reply.kind !== "author-update" || !thread.storyArc) return thread;
  const resolved = /完结|解决了|谢谢大家|没事了|结束了/.test(reply.body);
  return { ...thread, storyArc: { ...thread.storyArc, episode: thread.storyArc.episode + 1, lastUpdateAt: now, nextUpdateAfter: now + 6 * 60 * 60 * 1000, status: resolved ? "resolved" : "open", publicRecap: `${thread.title}：${reply.body.slice(0, 300)}` } };
};
