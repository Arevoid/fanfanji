import type { Character, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { buildWorldBookSystemBlocks, type WorldBookDepthInjection } from "../../../utils/worldBook";

export function collectOfflineWorldBookContext(input: {
  entries: WorldBookEntry[];
  characters: readonly Character[];
  scanText: string;
  relationship?: CharacterRelationship;
}) {
  const triggeredEntries = new Map<string, WorldBookEntry>();
  const depthInjections = new Map<string, WorldBookDepthInjection>();
  input.characters.forEach((character) => {
    const blocks = buildWorldBookSystemBlocks(input.entries, character.id, input.scanText, {
      scenario: "offline",
      characterId: character.id,
      userIdentityId: input.relationship?.userIdentityId,
      relationId: input.relationship?.id,
    });
    blocks.allTriggered.forEach((entry) => triggeredEntries.set(entry.id, entry));
    blocks.at_depth.forEach((entry) => depthInjections.set(entry.sourceId, entry));
  });
  return { triggeredEntries, depthInjections };
}

export function formatOfflineWorldBookEntries(entries: Iterable<WorldBookEntry>): string {
  const groups: Record<"after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history", string[]> = {
    after_main_prompt: [],
    before_char_def: [],
    after_char_def: [],
    before_chat_history: [],
  };
  for (const entry of entries) {
    if (entry.position === "at_depth") continue;
    const position = entry.position || "after_char_def";
    groups[position].push(`【设定 - ${entry.title}】\n${entry.content}`);
  }
  const labels: Record<keyof typeof groups, string> = {
    after_main_prompt: "World Book Background: Main Prompt Extensions",
    before_char_def: "World Book Background: Context Primers",
    after_char_def: "World Book Background: Profile Extensions",
    before_chat_history: "World Book Background: Story Anchor",
  };
  return (Object.keys(groups) as Array<keyof typeof groups>)
    .filter((position) => groups[position].length > 0)
    .map((position) => `[${labels[position]}]\n${groups[position].join("\n\n")}`)
    .join("\n\n");
}
