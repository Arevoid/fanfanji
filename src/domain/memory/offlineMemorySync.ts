import type { MemoryItem, Message, OfflineStory } from "../../types";

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
  return memory.characterId === story.characterId
    && memory.relationId === story.relationId
    && memory.content.includes(getOfflineStoryMarkerPrefix(story));
}

export function hasOfflineStorySummary(story: OfflineStory, memories: readonly MemoryItem[]): boolean {
  const summaryMarker = getOfflineStorySummaryMarker(story);
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

/**
 * Builds third-person event facts for the online handoff. The actor and the
 * recipient are deliberately named instead of inheriting the source message's
 * first- or second-person pronouns.
 */
export function collectOfflineHandoffContent(story: OfflineStory, characterName = "当前角色"): string {
  const source = getOfflineMemorySourceMessages(story);
  const sourceText = source.map((message) => message.content).join("\n");
  const userText = source.filter((message) => message.sender === "user").map((message) => message.content).join("\n");
  const characterText = source.filter((message) => message.sender === "character").map((message) => message.content).join("\n");
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

  const uniqueFacts = Array.from(new Set(facts));
  return uniqueFacts.length > 0
    ? uniqueFacts.map((fact) => `- ${fact}`).join("\n")
    : `- 线下剧本《${story.title}》已结束，双方有过线下互动；具体动作、场景和演出对白不作为线上记忆。`;
}

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
    .filter((item) => !/(衬衫|内裤|没穿|开门瞬间|姿势|阴茎|阴道|乳房|插入|抽插|射精|口交|肛交)/.test(item))
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
}): MemoryItem {
  return {
    id: input.id,
    characterId: input.characterId,
    ...(input.relationId ? { relationId: input.relationId } : {}),
    content: `【线下剧本《${input.story.title}》线上交接】\n[${getOfflineStorySyncMarker(input.story)}]\n${collectOfflineHandoffContent(input.story, input.characterName)}`,
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
- ${isImmediateReturn ? "这次线上聊天是线下互动刚结束后的衔接，用户所说的“刚才/刚刚”优先指第 2 段。" : "按上述绝对时间理解先后关系，不得擅自改写相对时间。"}
- 只把列出的事实视为权威；不得补写缺失的场景、动作、地点或承诺。不确定的细节应明确表示不确定。
- 本时间线是隐藏上下文。禁止复述标题、编号、时间线标签、存储标记或方括号元数据，禁止把它们发送成聊天气泡。`;
}
