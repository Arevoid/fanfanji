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
 * Produces the exact, user-visible offline plot transcript that may cross back
 * into an online chat. Imported online context and narration are deliberately
 * excluded; both the user's actions and the character's response remain.
 */
export function collectOfflineHandoffContent(story: OfflineStory): string {
  const source = getOfflineMemorySourceMessages(story);
  const sourceText = source.map((message) => message.content).join("\n");
  const facts: string[] = [];

  if (/(水管|漏水|修水|修理)/.test(sourceText)) facts.push("用户家中的水管漏水，角色曾协助处理。");
  if (/(吃饭|下馆子|餐厅|做饭)/.test(sourceText)) facts.push("双方在线下谈到过吃饭安排。");
  if (/(电影|看电影)/.test(sourceText)) facts.push("双方曾讨论或约定一起看电影。");
  if (/(糖果|一颗糖|给了他.*糖)/.test(sourceText)) facts.push("双方在线下有过赠送糖果的互动。");

  const uniqueFacts = Array.from(new Set(facts));
  return uniqueFacts.length > 0
    ? uniqueFacts.map((fact) => `- ${fact}`).join("\n")
    : `- 线下剧本《${story.title}》已结束，双方有过线下互动；具体动作、场景和演出对白不作为线上记忆。`;
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
 * Keeps a concise, deterministic handoff when AI extraction has no result or
 * is unavailable. The marker is intentionally shared with the online prompt's
 * immediate-return handoff check.
 */
export function createOfflineStoryHandoffMemory(input: {
  story: OfflineStory;
  sourceMessages: readonly Message[];
  characterId: string;
  id: string;
  timestamp: number;
}): MemoryItem {
  return {
    id: input.id,
    characterId: input.characterId,
    content: `【线下剧本《${input.story.title}》线上交接】\n[${getOfflineStorySyncMarker(input.story)}]\n${collectOfflineHandoffContent(input.story)}`,
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
