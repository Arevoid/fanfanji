import { WorldBookEntry } from "../types";
import { loadWorldBookEntries } from "../core/storage/repositories/worldBookRepository";
import { isWorldBookEntryVisible, type WorldBookReadContext } from "../domain/worldbook/worldBookVisibility";
import { isWorldBookEntryForCharacter } from "../domain/worldbook/worldBookVisibility";

export function getLatestWorldBookEntries(propEntries: WorldBookEntry[]): WorldBookEntry[] {
  try {
    const storedResult = loadWorldBookEntries(propEntries);
    if (!storedResult.found || !storedResult.valid) return propEntries;
    const stored = storedResult.value;

    const propMax = propEntries.length > 0 ? Math.max(0, ...propEntries.map(e => e.timestamp || 0)) : 0;
    const storedMax = stored.length > 0 ? Math.max(0, ...stored.map(e => e.timestamp || 0)) : 0;

    return propMax >= storedMax ? propEntries : stored;
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
  const scanTextLower = scanText.toLowerCase();

  const triggeredEntries: {
    entry: WorldBookEntry;
    text: string;
  }[] = [];

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
      // Smart simulated vector term-overlap matching
      const textToMatch = (entry.title + " " + (entry.keywords || "") + " " + entry.content).toLowerCase();
      const userWords = scanTextLower.split(/[\s,.:;!?，。！？、；：]/).filter(w => w.length >= 2);
      if (userWords.some(word => textToMatch.includes(word)) || scanTextLower.includes(entry.title.toLowerCase())) {
        isTriggered = true;
      }
    } else {
      // "keys" trigger
      const kwStr = entry.keywords || entry.title || "";
      const kws = kwStr
        .split(/[,，;；\s\t]+/)
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      if (kws.some((kw) => scanTextLower.includes(kw))) {
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

  const entriesByPos = {
    after_main_prompt: [] as string[],
    before_char_def: [] as string[],
    after_char_def: [] as string[],
    before_chat_history: [] as string[]
  };
  const atDepth: WorldBookDepthInjection[] = [];

  sortedTriggered.forEach(({ entry, text }) => {
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
  const formattedAll = sortedTriggered
    .filter(({ entry }) => entry.position !== "at_depth")
    .map(({ text }) => text)
    .join("\n\n");

  return {
    after_main_prompt: entriesByPos.after_main_prompt,
    before_char_def: entriesByPos.before_char_def,
    after_char_def: entriesByPos.after_char_def,
    before_chat_history: entriesByPos.before_chat_history,
    at_depth: atDepth,
    allTriggered: sortedTriggered.map(t => t.entry),
    formattedAll
  };
}
