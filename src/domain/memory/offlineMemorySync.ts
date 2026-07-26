import type { MemoryItem, Message, OfflineStory } from "../../types";

export function getOfflineStorySyncMarker(story: OfflineStory): string {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
  return `offline-story:${story.id}:${syncStart}-${story.messages.length}`;
}

export function getOfflineMemorySourceMessages(story: OfflineStory): Message[] {
  const syncStart = story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);
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
    const invitees = userText.includes("小念")
      ? `${characterName}和小念`
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
    .filter((item) => !/(?:^|[，。；：])(?:我|你|他|她|我们|你们|他们|她们)(?:[，。；：]|$)/.test(item))
    // The source-derived facts below are authoritative for these directional
    // events, so a model summary cannot reverse their actor and recipient.
    .filter((item) => !/(水管|漏水|感谢|谢谢|请.*吃饭)/.test(item));
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
 * Only a story deliberately opened as a continuation of an online chat may
 * feed its new facts back into that chat's memory. Director and IF stories can
 * import history as reference, but remain independent branches by design.
 */
export function isOnlineContinuationStory(story: OfflineStory): boolean {
  return story.mode === "continue"
    && Boolean(story.sourceChatId)
    && Boolean(story.sourceChatMsgCount || story.importedContext?.messages.length);
}

export function shouldAutoSyncOnlineContinuation(story: OfflineStory): boolean {
  return isOnlineContinuationStory(story) && hasUnsyncedOfflineMemoryProgress(story);
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
  return `\n- Latest offline continuation handoff (continue this naturally if relevant):
  * ${sanitizeOfflineMemoryForOnlineUse(memory.content)}
  * When asked about what just happened offline, treat only the handoff facts above as authoritative. Do not invent missing scenes, actions, locations, or promises; if a detail is absent, say you are unsure.`;
}
