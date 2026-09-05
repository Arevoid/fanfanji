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
  return [...entries]
    .filter((entry) => entry.position !== "at_depth")
    .map((entry) => `【设定 - ${entry.title}】\n${entry.content}`)
    .join("\n\n");
}
