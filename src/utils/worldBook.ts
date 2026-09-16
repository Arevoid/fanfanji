import type { WorldBookEntry, WorldBookPosition } from "../types";
import { loadWorldBookEntries } from "../core/storage/repositories/worldBookRepository";
import { isWorldBookEntryVisible, type WorldBookReadContext } from "../domain/worldbook/worldBookVisibility";
import { isWorldBookEntryForCharacter } from "../domain/worldbook/worldBookVisibility";
import { normalizeWorldBookTriggerText, splitWorldBookKeywords, worldBookKeywordMatches } from "../domain/worldbook/worldBookTriggerScan";
import { rankWorldBookVectorEntries } from "../domain/worldbook/worldBookVector";

export const WORLD_BOOK_ENTRY_MAX_CHARS = 2400;
export const WORLD_BOOK_TOTAL_MAX_CHARS = 12000;

export function getLatestWorldBookEntries(propEntries: WorldBookEntry[]): WorldBookEntry[] {
  try {
    const storedResult = loadWorldBookEntries(propEntries);
    if (!storedResult.found || !storedResult.valid) return propEntries;
    const stored = storedResult.value;
    const freshest = new Map<string, WorldBookEntry>();
    // Prefer the in-memory prop on timestamp ties; it represents the current
    // React state and avoids replacing a just-edited record with its storage
    // copy when both writes share the same millisecond.
    for (const entry of propEntries) freshest.set(entry.id, entry);
    for (const entry of stored) {
      const current = freshest.get(entry.id);
      if (!current || (entry.timestamp || 0) > (current.timestamp || 0)) freshest.set(entry.id, entry);
    }
    return [...freshest.values()];
  } catch (err) {
    console.error("Error reading freshest world book entries:", err);
    return propEntries;
  }
}

export interface WorldBookSystemBlocks {
  after_main_prompt: string[];
  before_char_def: string[];
  after_char_def: string[];
  before_chat_history: string[];
  at_depth: WorldBookDepthInjection[];
  allTriggered: WorldBookEntry[];
  formattedAll: string;
}

export interface WorldBookDepthInjection {
  id: string;
  sourceId: string;
  depth: number;
  content: string;
}

const WORLD_BOOK_POSITION_LABELS: Record<Exclude<WorldBookPosition, "at_depth">, string> = {
  after_main_prompt: "World Book Background: Main Prompt Extensions",
  before_char_def: "World Book Background: Context Primers",
  after_char_def: "World Book Background: Profile Extensions",
  before_chat_history: "World Book Background: Story Anchor",
};

/** Preserve structural placement when a feature has only one system-text slot. */
export function formatWorldBookForPrompt(blocks: Pick<WorldBookSystemBlocks, "after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history">): string {
  const positions: Array<Exclude<WorldBookPosition, "at_depth">> = [
    "after_main_prompt",
    "before_char_def",
    "after_char_def",
    "before_chat_history",
  ];
  return positions
    .filter((position) => blocks[position].length > 0)
    .map((position) => `[${WORLD_BOOK_POSITION_LABELS[position]}]\n${blocks[position].join("\n\n")}`)
    .join("\n\n");
}

/**
 * Returns every entry visible to one request scope without applying keyword
 * triggers. This is intended for small metadata projections (for example,
 * detecting a character's configured language), not for injecting the whole
 * World Book into the generated prompt.
 */
export function getVisibleWorldBookEntries(
  propEntries: WorldBookEntry[],
  characterId: string,
  readContext?: WorldBookReadContext,
): WorldBookEntry[] {
  return getLatestWorldBookEntries(propEntries).filter((entry) => {
    if (readContext ? !isWorldBookEntryVisible(entry, readContext) : entry.isActive === false) return false;
    return isWorldBookEntryForCharacter(entry, characterId);
  });
}

export function buildWorldBookSystemBlocks(
  propEntries: WorldBookEntry[],
  characterId: string,
  scanText: string,
  readContext?: WorldBookReadContext,
): WorldBookSystemBlocks {
  const visibleWorldBookEntries = getVisibleWorldBookEntries(propEntries, characterId, readContext);
  const scanTextNormalized = normalizeWorldBookTriggerText(scanText);

  const triggeredEntries: {
    entry: WorldBookEntry;
    text: string;
  }[] = [];
  const vectorMatchedIds = new Set(
    rankWorldBookVectorEntries(
      scanTextNormalized,
      visibleWorldBookEntries.filter((entry) => entry.triggerType === "vector"),
    ).map((candidate) => candidate.entry.id),
  );

  for (const entry of visibleWorldBookEntries) {
    let isTriggered = false;
    // Persona rules describe a character's stable voice and behavior. They are
    // always present for their matching scope; keyword misses must never make a
    // character temporarily lose their own speech habits.
    if (entry.purpose === "persona_rule") {
      isTriggered = true;
    } else if (entry.triggerType === "constant") {
      isTriggered = true;
    } else if (entry.triggerType === "vector") {
      isTriggered = vectorMatchedIds.has(entry.id);
    } else {
      // "keys" trigger
      const kwStr = entry.keywords || entry.title || "";
      const kws = splitWorldBookKeywords(kwStr);
      if (kws.some((kw) => worldBookKeywordMatches(scanTextNormalized, kw))) {
        isTriggered = true;
      }
    }

    const candidate = {
      entry,
      text: `【设定 - ${entry.title}】\n${entry.content}`
    };
    if (isTriggered) triggeredEntries.push(candidate);
  }

  // Sort entries by depth ascending (smaller depth is closer / higher priority)
  const sortedTriggered = triggeredEntries
    .sort((a, b) => (a.entry.depth || 5) - (b.entry.depth || 5));
  let usedChars = 0;
  const budgetedTriggered = sortedTriggered.flatMap(({ entry }) => {
    if (usedChars >= WORLD_BOOK_TOTAL_MAX_CHARS) return [];
    const content = entry.content.slice(0, WORLD_BOOK_ENTRY_MAX_CHARS);
    const text = `【设定 - ${entry.title}】\n${content}`;
    const remaining = WORLD_BOOK_TOTAL_MAX_CHARS - usedChars;
    if (text.length > remaining && usedChars > 0) return [];
    usedChars += text.length;
    return [{ entry, text }];
  });

  const entriesByPos = {
    after_main_prompt: [] as string[],
    before_char_def: [] as string[],
    after_char_def: [] as string[],
    before_chat_history: [] as string[]
  };
  const atDepth: WorldBookDepthInjection[] = [];

  budgetedTriggered.forEach(({ entry, text }) => {
    const pos = entry.position || "after_char_def";
    if (pos === "at_depth") {
      atDepth.push({
        id: `world-book-at-depth:${entry.id}`,
        sourceId: `world-book:${entry.id}`,
        depth: Math.max(1, Math.min(15, entry.depth || 5)),
        content: text,
      });
      return;
    }
    if (pos in entriesByPos) {
      entriesByPos[pos as keyof typeof entriesByPos].push(text);
    } else {
      entriesByPos.after_char_def.push(text);
    }
  });

  // at_depth entries are injected into the chronological history by
  // PromptComposer. Excluding them here prevents a second system-level copy.
  const formattedAll = formatWorldBookForPrompt(entriesByPos);

  return {
    after_main_prompt: entriesByPos.after_main_prompt,
    before_char_def: entriesByPos.before_char_def,
    after_char_def: entriesByPos.after_char_def,
    before_chat_history: entriesByPos.before_chat_history,
    at_depth: atDepth,
    allTriggered: budgetedTriggered.map(t => t.entry),
    formattedAll
  };
}
