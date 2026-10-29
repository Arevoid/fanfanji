import type { Character } from "../../types";
import type { CharacterPhonePost } from "../../domain/characterPhone/types";
import type { CharacterPhoneRelationshipNetworkContact } from "./characterPhoneRelationshipNetwork";
import { createCharacterPhoneInitialAvatar } from "./characterPhoneContactVisuals";

/** Only an explicitly linked NPC in this phone's identity scope can author a simulated post. */
export function resolvePhoneNpcPost(
  draft: { npcId?: string; roleReply?: string },
  contacts: readonly CharacterPhoneRelationshipNetworkContact[],
  character: Character,
  timestamp: number,
): Partial<CharacterPhonePost> | null {
  if (!draft.npcId) return {};
  const contact = contacts.find(item => item.npc.id === draft.npcId);
  if (!contact) return null;
  const reply = draft.roleReply?.trim();
  return {
    author: contact.npc.name,
    authorId: contact.npc.id,
    relationshipNetworkNpcId: contact.npc.id,
    authorAvatar: contact.npc.avatar || createCharacterPhoneInitialAvatar(contact.npc.name),
    source: "npc",
    visibility: "public",
    visibilityTargetIds: undefined,
    comments: reply ? [reply] : [],
    commentDetails: reply ? [{
      id: `phone-npc-reply-${contact.npc.id}-${timestamp}`,
      authorName: character.remark?.trim() || character.name,
      authorId: character.id,
      authorAvatar: character.avatar,
      content: reply,
      timestamp: timestamp + 1,
    }] : [],
  };
}
