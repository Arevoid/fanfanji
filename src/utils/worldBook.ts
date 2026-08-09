import { WorldBookEntry } from "../types";
import { loadWorldBookEntries } from "../core/storage/repositories/worldBookRepository";
import { isWorldBookEntryVisible, type WorldBookReadContext } from "../domain/worldbook/worldBookVisibility";

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
  allTriggered: WorldBookEntry[];
  formattedAll: string;
}

/**
 * A small number of character-defining entries need to be available even when
 * the user starts a chat with a short message such as "在吗". They remain
 * subject to the normal scope/visibility checks and are capped below so a
 * World Book cannot turn into an always-on transcript dump.
 */
const isPersistentRoleEntry = (entry: WorldBookEntry): boolean => {
  if (entry.triggerType === "constant") return true;
  const descriptor = `${entry.title} ${entry.category || ""} ${entry.keywords || ""}`.toLowerCase();
  return /(核心|身份|关系|称呼|口癖|人格|性格|世界观|世界设定|character|identity|relationship|persona|calling|speech)/i.test(descriptor);
};

export function buildWorldBookSystemBlocks(
  propEntries: WorldBookEntry[],
  characterId: string,
  scanText: string,
  readContext?: WorldBookReadContext,
): WorldBookSystemBlocks {
  const latestWorldBookEntries = getLatestWorldBookEntries(propEntries);
  const scanTextLower = scanText.toLowerCase();

  const triggeredEntries: {
    entry: WorldBookEntry;
    text: string;
  }[] = [];
  const persistentRoleEntries: {
    entry: WorldBookEntry;
    text: string;
  }[] = [];

  for (const entry of latestWorldBookEntries) {
    if (readContext ? !isWorldBookEntryVisible(entry, readContext) : entry.isActive === false) continue;

    // Check if bound to global or specific character
    const isGlobal = !entry.characterId || entry.characterId === "global";
    if (!isGlobal && entry.characterId !== characterId) {
      continue;
    }

    let isTriggered = false;
    if (entry.triggerType === "constant") {
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
    if (isTriggered) {
      triggeredEntries.push(candidate);
    } else if (isPersistentRoleEntry(entry)) {
      persistentRoleEntries.push(candidate);
    }
  }

  // Sort entries by depth ascending (smaller depth is closer / higher priority)
  const triggeredIds = new Set(triggeredEntries.map(({ entry }) => entry.id));
  const alwaysRelevant = persistentRoleEntries
    .filter(({ entry }) => !triggeredIds.has(entry.id))
    .sort((a, b) => (a.entry.depth || 5) - (b.entry.depth || 5))
    .slice(0, 3);
  const sortedTriggered = [...triggeredEntries, ...alwaysRelevant]
    .sort((a, b) => (a.entry.depth || 5) - (b.entry.depth || 5));

  const entriesByPos = {
    after_main_prompt: [] as string[],
    before_char_def: [] as string[],
    after_char_def: [] as string[],
    before_chat_history: [] as string[]
  };

  sortedTriggered.forEach(({ entry, text }) => {
    const pos = entry.position || "after_char_def";
    if (pos in entriesByPos) {
      entriesByPos[pos as keyof typeof entriesByPos].push(text);
    } else {
      entriesByPos.after_char_def.push(text);
    }
  });

  const formattedAll = sortedTriggered.map(t => t.text).join("\n\n");

  return {
    after_main_prompt: entriesByPos.after_main_prompt,
    before_char_def: entriesByPos.before_char_def,
    after_char_def: entriesByPos.after_char_def,
    before_chat_history: entriesByPos.before_chat_history,
    allTriggered: sortedTriggered.map(t => t.entry),
    formattedAll
  };
}
