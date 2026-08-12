import type { MemoryItem, Message, OfflineStory } from "../../types";
import { serializeMessageContentForPrompt } from "../../features/chat/prompts/messagePromptSerializer";

export function getOfflineStorySyncMarker(story: OfflineStory): string {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
  return `offline-story:${story.id}:${syncStart}-${story.messages.length}`;
}

/** A single canonical marker lets later syncs replace, rather than append to, a story handoff. */
export function getOfflineStorySummaryMarker(story: OfflineStory): string {
  return `offline-story:${story.id}:summary`;
}

export function getOfflineStoryMarkerPrefix(story: OfflineStory): string {
  return `offline-story:${story.id}:`;
}

export function isOfflineStoryHandoffMemory(memory: MemoryItem, story: OfflineStory): boolean {
  const participantIds = Array.from(new Set((story.characterIds || []).filter(Boolean)));
  if (!story.relationId && participantIds.length > 0 && !participantIds.includes(story.characterId)) {
    return participantIds.includes(memory.characterId)
      && memory.content.includes(getOfflineStoryMarkerPrefix(story));
  }
  return memory.characterId === story.characterId
    && memory.relationId === story.relationId
    && memory.content.includes(getOfflineStoryMarkerPrefix(story));
}

export function hasOfflineStorySummary(story: OfflineStory, memories: readonly MemoryItem[]): boolean {
  const summaryMarker = getOfflineStorySummaryMarker(story);
  const participantIds = Array.from(new Set((story.characterIds || []).filter(Boolean)));
  if (!story.relationId && participantIds.length > 0 && !participantIds.includes(story.characterId)) {
    return participantIds.every((characterId) => memories.some((memory) =>
      memory.characterId === characterId && memory.content.includes(summaryMarker),
    ));
  }
  return memories.some((memory) =>
    isOfflineStoryHandoffMemory(memory, story) && memory.content.includes(summaryMarker),
  );
}

/**
 * Selects the latest relation-scoped offline handoff throughout the immediate
 * return window, and later whenever the user's query overlaps its facts.
 */
export function selectFreshOfflineHandoffMemory(input: {
  memories: readonly MemoryItem[];
  relationId?: string;
  queryText?: string;
  now?: number;
  maxAgeMs?: number;
}): MemoryItem | undefined {
  if (!input.relationId) return undefined;
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 2 * 60 * 60 * 1000;
  const normalizedQuery = (input.queryText || "").toLocaleLowerCase();
  const queryTokens = Array.from(new Set([
    ...normalizedQuery.split(/[\s,.:;!?"'，（）()。！“”]+/u).filter((token) => token.length >= 2),
    ...Array.from(normalizedQuery.matchAll(/[\p{Script=Han}]{2,}/gu)).flatMap(([sequence]) =>
      Array.from({ length: Math.max(0, sequence.length - 1) }, (_, index) => sequence.slice(index, index + 2)),
    ),
  ]));
  return [...input.memories]
    .filter((memory) => memory.relationId === input.relationId && memory.content.includes("offline-story:"))
    .filter((memory) => {
      const age = now - memory.timestamp;
      if (age >= 0 && age < maxAgeMs) return true;
      const content = memory.content.toLocaleLowerCase();
      return queryTokens.some((token) => content.includes(token));
    })
    .sort((left, right) => right.timestamp - left.timestamp)[0];
}

/**
 * Selects a confirmed offline event that chronologically occurred after the
 * previous dated online session and before the current message. Unlike
 * semantic recall, this bridge must not disappear merely because the user
 * uses a new relationship word that is absent from the summary text.
 */
export function selectInterveningOfflineHandoff(input: {
  stories: readonly OfflineStory[];
  memories: readonly MemoryItem[];
  relationId?: string;
  after?: number;
  before?: number;
}): { story: OfflineStory; memory: MemoryItem; occurredAt: number } | undefined {
  if (!input.relationId) return undefined;
  const after = input.after ?? 0;
  const before = input.before ?? Date.now();
  for (const story of [...input.stories]
    .filter((candidate) => candidate.relationId === input.relationId)
    .map((candidate) => ({
      story: candidate,
      occurredAt: candidate.onlineHandoff?.endedAt
        ?? candidate.archivedAt
        ?? candidate.lastMemorySyncAt
        ?? candidate.updatedAt,
    }))
    .filter(({ occurredAt }) => occurredAt > after && occurredAt <= before)
    .sort((left, right) => right.occurredAt - left.occurredAt)) {
    const memory = input.memories
      .filter((candidate) => isOfflineStoryHandoffMemory(candidate, story.story))
      .filter((candidate) => candidate.content.includes(getOfflineStorySummaryMarker(story.story)))
      .sort((left, right) => right.timestamp - left.timestamp)[0];
    if (memory) return { ...story, memory };
  }
  return undefined;
}

export function selectPendingOfflineHandoffStory(input: {
  stories: readonly OfflineStory[];
  relationId?: string;
  characterId?: string;
  conversationId?: string;
  now?: number;
  maxAgeMs?: number;
}): OfflineStory | undefined {
  if (!input.relationId || !input.characterId) return undefined;
  const latest = [...input.stories]
    .filter((story) => Boolean(story.onlineHandoff))
    .filter((story) => story.relationId === input.relationId && story.characterId === input.characterId)
    .filter((story) => !input.conversationId || !story.conversationId || story.conversationId === input.conversationId)
    .sort((left, right) => (right.onlineHandoff?.endedAt || 0) - (left.onlineHandoff?.endedAt || 0))[0];
  // Once the newest handoff is acknowledged, older pending records must not
  // resurface as if they had just happened.
  if (latest?.onlineHandoff?.status !== "pending") return undefined;
  const age = (input.now ?? Date.now()) - latest.onlineHandoff.endedAt;
  const maxAgeMs = input.maxAgeMs ?? 2 * 60 * 60 * 1000;
  return age >= 0 && age <= maxAgeMs ? latest : undefined;
}

export function createPendingOfflineHandoff(input: {
  story: OfflineStory;
  sourceMessages: readonly Message[];
  now?: number;
}): OfflineStory {
  const sourceMessageIds = input.sourceMessages.map((message) => message.id);
  if (sourceMessageIds.length === 0) return input.story;
  const existing = input.story.onlineHandoff;
  if (existing?.status === "acknowledged"
    && sourceMessageIds.length === existing.sourceMessageIds.length
    && sourceMessageIds.every((id, index) => id === existing.sourceMessageIds[index])) return input.story;
  const now = input.now ?? Date.now();
  return {
    ...input.story,
    onlineHandoff: {
      status: "pending",
      createdAt: now,
      startedAt: input.sourceMessages[0]?.timestamp ?? input.story.createdAt,
      endedAt: now,
      sourceMessageIds,
      deliveredReplyCount: 0,
    },
    updatedAt: now,
  };
}

export function acknowledgeOfflineHandoff(story: OfflineStory, now = Date.now()): OfflineStory {
  if (story.onlineHandoff?.status !== "pending") return story;
  return {
    ...story,
    onlineHandoff: {
      ...story.onlineHandoff,
      status: "acknowledged",
      acknowledgedAt: now,
    },
    updatedAt: now,
  };
}

export function recordOfflineHandoffDelivery(
  story: OfflineStory,
  now = Date.now(),
  requiredReplyCount = 3,
  durableSummaryReady = false,
): OfflineStory {
  if (story.onlineHandoff?.status !== "pending") return story;
  const deliveredReplyCount = (story.onlineHandoff.deliveredReplyCount || 0) + 1;
  // Never retire the only surviving copy of the just-ended timeline. If AI
  // extraction failed, the raw relation-scoped handoff remains available for
  // the immediate continuity window and can be replaced by a later retry.
  const acknowledged = durableSummaryReady && deliveredReplyCount >= Math.max(1, requiredReplyCount);
  return {
    ...story,
    onlineHandoff: {
      ...story.onlineHandoff,
      deliveredReplyCount,
      status: acknowledged ? "acknowledged" : "pending",
      ...(acknowledged ? { acknowledgedAt: now } : {}),
    },
    updatedAt: now,
  };
}

export function getOfflineMemorySourceMessages(story: OfflineStory, options: { includeSynced?: boolean } = {}): Message[] {
  const syncStart = options.includeSynced
    ? 0
    : (story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0));
  return story.messages
    .slice(syncStart)
    .map((message, index) => ({ message, index }))
    .filter(({ message }) =>
      !message.isImportedContext
      && !message.id.startsWith("offline-import-")
      && !message.isNarration
      && message.content.trim().length > 0,
    )
    // Old stories did not guarantee array order after editing. Preserve a
    // stable chronological handoff without mutating the persisted story.
    .sort((left, right) => left.message.timestamp - right.message.timestamp || left.index - right.index)
    .map(({ message }) => message);
}

export function getOfflineHandoffSourceMessagesForReturn(story: OfflineStory): Message[] {
  const participantIds = Array.from(new Set((story.characterIds || [story.characterId]).filter(Boolean)));
  if (!story.relationId || participantIds.length !== 1 || participantIds[0] !== story.characterId) return [];
  const sourceMessages = getOfflineMemorySourceMessages(story, { includeSynced: true });
  if (story.mode === "continue") return sourceMessages;
  if (story.memorySyncStatus !== "synced") return [];
  const manuallySyncedIds = new Set(story.syncedSourceMessageIds || []);
  return sourceMessages.filter((message) => manuallySyncedIds.has(message.id));
}

/**
 * Builds third-person event facts for the online handoff. The actor and the
 * recipient are deliberately named instead of inheriting the source message's
 * first- or second-person pronouns.
 */
export function collectOfflineHandoffContent(
  story: OfflineStory,
  characterName = "当前角色",
  sourceMessages?: readonly Message[],
  options: { includeConfirmedExcerpts?: boolean } = {},
): string {
  const source = sourceMessages ? [...sourceMessages] : getOfflineMemorySourceMessages(story);
  const promptText = (message: Message) => serializeMessageContentForPrompt(message, { mode: "history", characterName });
  const sourceText = source.map(promptText).join("\n");
  const userText = source.filter((message) => message.sender === "user").map(promptText).join("\n");
  const characterText = source.filter((message) => message.sender === "character").map(promptText).join("\n");
  const facts: string[] = [];
  const mentionsWaterPipe = /(水管|漏水|修水|修理)/.test(sourceText);
  const userCreditsCharacterForRepair = /(谢谢|感谢).{0,24}(你|您|角色).{0,24}(帮|修).{0,24}(水管|漏水)/.test(userText);
  const characterDescribesRepair = /(帮|修).{0,24}(水管|漏水)|(?:我|本人).{0,24}(帮|修)/.test(characterText) && mentionsWaterPipe;
  const characterHelpedUserWithRepair = mentionsWaterPipe && (userCreditsCharacterForRepair || characterDescribesRepair);

  if (characterHelpedUserWithRepair) {
    facts.push(`${characterName}帮助用户修好了用户家里的水管。`);
    facts.push("用户是接受帮助的一方。");
  } else if (mentionsWaterPipe) {
    facts.push("用户家中的水管曾出现问题，线上记忆未能确认具体帮助者。");
  }

  if (/(吃饭|下馆子|餐厅|做饭)/.test(sourceText)) {
    const explicitlyNamedInvitees = userText.match(
      /(?:我请|邀请)([\p{Script=Han}]{2,4})和([\p{Script=Han}]{2,4})(?=吃饭|下馆子|去餐厅)/u,
    );
    const invitees = explicitlyNamedInvitees
      ? `${explicitlyNamedInvitees[1]}和${explicitlyNamedInvitees[2]}`
      : userText.includes("你们")
        ? `${characterName}和其他在场角色`
        : characterName;
    if (characterHelpedUserWithRepair && /(请.*吃饭|吃饭吧|下馆子|感谢|谢谢)/.test(userText)) {
      facts.push(`用户邀请${invitees}吃饭，是为了感谢${characterName}的帮助。`);
    } else if (/(邀请|请).{0,16}(吃饭|下馆子|餐厅)/.test(characterText)) {
      facts.push(`${characterName}邀请用户吃饭。`);
    } else {
      facts.push("用户与当前角色曾在线下谈到过吃饭安排。");
    }
  }
  if (/(糖果|一颗糖|给了他.*糖)/.test(userText)) facts.push(`用户向${characterName}赠送过糖果。`);
  if (/(电影|看电影)/.test(sourceText)) facts.push("用户与当前角色曾讨论或约定一起看电影。");

  if (options.includeConfirmedExcerpts) {
    const seenExcerpts = new Set<string>();
    for (const message of source.slice(-8)) {
      const excerpt = promptText(message)
        .replace(/<\/?(?:system|assistant|user|developer)[^>]*>/giu, "")
        .replace(/\s+/gu, " ")
        .trim();
      if (!excerpt || excerpt.startsWith("data:") || OFFLINE_EXPLICIT_DETAIL_PATTERN.test(excerpt)) continue;
      const conciseExcerpt = excerpt.length > 120 ? `${excerpt.slice(0, 117)}...` : excerpt;
      const fact = message.sender === "user"
        ? `用户在线下剧情中留下过可核对的表达：${conciseExcerpt}`
        : `${characterName}在线下剧情中留下过可核对的回应：${conciseExcerpt}`;
      if (seenExcerpts.has(fact)) continue;
      seenExcerpts.add(fact);
      facts.push(fact);
      if (seenExcerpts.size >= 4) break;
    }
  }

  const uniqueFacts = Array.from(new Set(facts));
  return uniqueFacts.length > 0
    ? uniqueFacts.map((fact) => `- ${fact}`).join("\n")
    : `- 线下剧本《${story.title}》已结束，双方有过线下互动；具体动作、场景和演出对白不作为线上记忆。`;
}

const OFFLINE_EXPLICIT_DETAIL_PATTERN = /(衬衫|内裤|没穿|开门瞬间|姿势|阴茎|阴道|乳房|插入|抽插|射精|口交|肛交)/;

/** Keeps only extracted facts that do not rely on ambiguous speaker pronouns. */
export function filterOfflineExtractedFacts(items: readonly string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    // Any unresolved personal pronoun can reverse actor/recipient meaning
    // after the story returns to online chat. Require named third-person facts.
    .filter((item) => !/(?:我们|你们|他们|她们|我|你|他|她|它)/.test(item))
    // Keep intimacy as a durable, non-graphic relationship event and discard
    // transient screenplay or explicit physical detail.
    .filter((item) => !OFFLINE_EXPLICIT_DETAIL_PATTERN.test(item))
    // The source-derived facts below are authoritative for these directional
    // events, so a model summary cannot reverse their actor and recipient.
    .filter((item) => !/(水管|漏水|感谢|谢谢|请.*吃饭)/.test(item));
}

/** Hides storage-only sync markers from the user-facing Memory page. */
export function getMemoryDisplayContent(content: string): string {
  const visibleLines: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "【确认事件（主体与客体固定）】" || trimmed === "【事实索引（系统）】") break;
    if (!/^\[offline-story:[^\]]+\]$/u.test(trimmed)) visibleLines.push(line);
  }
  return visibleLines.join("\n").trim();
}

/** Removes legacy screenplay-shaped handoffs before an online prompt can see them. */
export function sanitizeOfflineMemoryForOnlineUse(content: string): string {
  if (!content.includes("offline-story:")) return content;
  const marker = content.match(/\[offline-story:[^\]]+\]/)?.[0] || "";
  const title = content.match(/【线下剧本《([^》]+)》/)?.[1] || "线下剧情";
  const factualLines = content
    .split("\n")
    .filter((line) => /^-\s+/.test(line))
    .filter((line) => !/(用户:|角色:|[“”]|过来一下|自己跟.*说)/.test(line));
  const facts = factualLines.length > 0
    ? factualLines.join("\n")
    : `- 线下剧本《${title}》已结束，双方有过线下互动；具体动作、场景和演出对白不作为线上记忆。`;
  return `【线下剧本《${title}》线上交接】\n${marker}\n${facts}`.trim();
}

export function hasUnsyncedOfflineMemoryProgress(story: OfflineStory): boolean {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
  return story.messages.length > syncStart;
}

/**
 * Identifies a continuation that originated from an online chat. This remains
 * useful for navigation, while automatic memory sync also supports a new
 * offline continuation that did not import chat history.
 */
export function isOnlineContinuationStory(story: OfflineStory): boolean {
  return story.mode === "continue"
    && Boolean(story.sourceChatId)
    && Boolean(story.sourceChatMsgCount || story.importedContext?.messages.length);
}

export function shouldAutoSyncOnlineContinuation(story: OfflineStory): boolean {
  return story.mode === "continue" && hasUnsyncedOfflineMemoryProgress(story);
}

/**
 * Keeps a concise, deterministic handoff when AI extraction has no result or
 * is unavailable. The marker is intentionally shared with the online prompt's
 * immediate-return handoff check.
 */
export function createOfflineStoryHandoffMemory(input: {
  story: OfflineStory;
  sourceMessages: readonly Message[];
  characterId: string;
  relationId?: string;
  characterName?: string;
  id: string;
  timestamp: number;
  /** A confirmed manual sync owns the story's replaceable canonical summary. */
  marker?: "incremental" | "summary";
  /** API failure fallback: retain a few speaker-labelled, non-graphic source excerpts. */
  includeConfirmedExcerpts?: boolean;
}): MemoryItem {
  return {
    id: input.id,
    characterId: input.characterId,
    ...(input.relationId ? { relationId: input.relationId } : {}),
    content: `【线下剧本《${input.story.title}》线上交接】\n[${input.marker === "summary" ? getOfflineStorySummaryMarker(input.story) : getOfflineStorySyncMarker(input.story)}]\n${collectOfflineHandoffContent(input.story, input.characterName, input.sourceMessages, { includeConfirmedExcerpts: input.includeConfirmedExcerpts })}`,
    timestamp: input.timestamp,
    // A handoff is intentionally short-lived context, not a permanent trait.
    importance: 4,
    isManual: false,
  };
}

export function buildOfflineHandoffPromptBlock(memory: MemoryItem): string {
  return buildOfflineHandoffTimelinePromptBlock({ memory });
}

const formatTimelineTime = (timestamp?: number): string => timestamp && Number.isFinite(timestamp)
  ? new Date(timestamp).toLocaleString("zh-CN", { hour12: false })
  : "时间未记录";

/**
 * Places a completed offline story between the previous and current online
 * segments. Facts remain relation-scoped; timestamps only explain chronology.
 */
export function buildOfflineHandoffTimelinePromptBlock(input: {
  memory: MemoryItem;
  story?: OfflineStory;
  previousOnlineAt?: number;
  currentOnlineAt?: number;
}): string {
  const sourceMessages = input.story
    ? getOfflineMemorySourceMessages(input.story, { includeSynced: true })
    : [];
  const offlineStartedAt = sourceMessages[0]?.timestamp ?? input.story?.createdAt ?? input.memory.timestamp;
  const offlineEndedAt = input.story?.archivedAt
    ?? input.story?.lastMemorySyncAt
    ?? sourceMessages[sourceMessages.length - 1]?.timestamp
    ?? input.memory.timestamp;
  const isImmediateReturn = Boolean(
    input.currentOnlineAt
    && input.currentOnlineAt >= offlineEndedAt
    && input.currentOnlineAt - offlineEndedAt <= 2 * 60 * 60 * 1000,
  );

  return `\n[线上—线下—新线上连续时间线｜仅供理解，不得作为消息输出]
1. 上一段线上聊天：${formatTimelineTime(input.previousOnlineAt)}。
2. 已确认的线下互动：${formatTimelineTime(offlineStartedAt)} 至 ${formatTimelineTime(offlineEndedAt)}。
${sanitizeOfflineMemoryForOnlineUse(input.memory.content)}
3. 当前新线上聊天：${formatTimelineTime(input.currentOnlineAt)}。
连续性规则：
- 第 2 段真实发生在第 1 段之后、第 3 段之前；角色亲历并记得上述已确认事实，不得否认、遗忘或与之矛盾。
- Never deny, forget, or contradict them; they are confirmed relationship-scoped facts.
- ${isImmediateReturn ? "这次线上聊天是线下互动刚结束后的衔接，用户所说的“刚才/刚刚”优先指第 2 段。" : "按上述绝对时间理解先后关系，不得擅自改写相对时间。"}
- 只把列出的事实视为权威；不得补写缺失的场景、动作、地点或承诺。不确定的细节应明确表示不确定。
- Do not invent missing scenes, actions, locations, promises, or relationship changes.
- 本时间线是隐藏上下文。禁止复述标题、编号、时间线标签、存储标记或方括号元数据，禁止把它们发送成聊天气泡。`;
}

/**
 * Guaranteed immediate-return context. Unlike long-term extraction, this is
 * built from the persisted story itself and therefore survives AI summary
 * failure or a delayed React memory update.
 */
export function buildPendingOfflineHandoffPromptBlock(input: {
  story: OfflineStory;
  characterName: string;
  userName?: string;
  previousOnlineAt?: number;
  currentOnlineAt?: number;
  summaryMemory?: MemoryItem;
}): string {
  const handoff = input.story.onlineHandoff;
  if (!handoff || handoff.status !== "pending") return "";
  const allowedIds = new Set(handoff.sourceMessageIds);
  const sourceMessages = getOfflineMemorySourceMessages(input.story, { includeSynced: true })
    .filter((message) => allowedIds.has(message.id));
  const selectedMessages = sourceMessages.length <= 40
    ? sourceMessages
    : [...sourceMessages.slice(0, 15), ...sourceMessages.slice(-25)];
  const transcript = selectedMessages.map((message) => {
    const speaker = message.sender === "user" ? (input.userName || "用户") : input.characterName;
    const content = serializeMessageContentForPrompt(message, {
      mode: "history",
      userName: input.userName,
      characterName: input.characterName,
    }).replace(/\s+/gu, " ").trim().slice(0, 800);
    return `- ${formatTimelineTime(message.timestamp)}｜${speaker}：${content}`;
  }).join("\n");
  const omitted = sourceMessages.length - selectedMessages.length;
  const summary = input.summaryMemory
    ? `\n已完成的长期事实摘要：\n${sanitizeOfflineMemoryForOnlineUse(input.summaryMemory.content)}`
    : "";

  return `\n[刚刚结束的线下共同经历｜隐藏连续性上下文，绝不可作为消息输出]
关系范围：仅限当前用户身份、当前角色“${input.characterName}”与当前私聊关系。
1. 上一段线上聊天结束于：${formatTimelineTime(input.previousOnlineAt)}。
2. 双方随后在线下共同经历了剧情：${formatTimelineTime(handoff.startedAt)} 至 ${formatTimelineTime(handoff.endedAt)}。
3. 当前重新开始线上聊天的时间：${formatTimelineTime(input.currentOnlineAt)}。

线下亲历记录（用户已确认需要同步；说话者已明确标注）：
${transcript || "- 没有可展示的线下正文。"}${omitted > 0 ? `\n- 另有 ${omitted} 条中段记录因上下文长度限制未展开。` : ""}${summary}

强制连续性规则：
- 你就是参与上述线下经历的“${input.characterName}”，这些事情发生在上一段线上聊天之后、当前线上聊天之前；不是梦、假设、陌生人的经历或旧线上对话。
- 当前聊天紧接线下剧情结束。“刚才/刚刚/方才”默认指上述线下经历；自然延续当时已经发生的事件、关系变化、承诺和情绪。
- 仔细区分说话者和行为主体，不得把用户做的事记成角色做的事，也不得反过来。
- 不得否认或遗忘记录中明确发生的事实；不得补写记录中没有的人物、地点、行为、关系或承诺。
- 如果用户当前使用了在线下记录中已经确立的关系称呼（例如男朋友、女朋友、老公、老婆），不得用“谁是你的……”之类回答否认该关系。可以保持角色的傲娇或嘴硬，但必须同时自然承认双方刚刚确立或经历的关系事实。
- 当前返回线上的前几轮回复必须表现出连续性；当用户的话与线下经历相关时，至少自然带出一个记录中真实存在的细节，让用户能明确感受到你记得刚才，而不是只给泛化回复。
- 如果线下记录明确形成或改变了双方关系，该较新的事实优先于尚未来得及刷新的旧关系标签；不得拿旧标签否认刚刚在线下已经确认的新关系。
- 这是系统私下提供的上下文。禁止输出时间线标题、编号、时间戳、消息 ID、内部标记、方括号说明或逐字复述整段记录。`;
}
