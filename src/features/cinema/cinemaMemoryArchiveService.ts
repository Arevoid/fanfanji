import { loadCinemaStore } from "../../core/storage/repositories/cinemaRepository";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { archiveSharedMediaMemory } from "../characterKnowledge/services/sharedMediaMemoryService";
export function archiveCinemaDiscussion(input: { relation: CharacterRelationship; discussionId: string; now?: number }) {
  const store = loadCinemaStore(); const record = store.discussions.find((discussion) => discussion.id === input.discussionId);
  if (!record || record.userIdentityId !== input.relation.userIdentityId || record.relationId !== input.relation.id || record.characterId !== input.relation.characterId
    || record.conversationId !== input.relation.conversationId || !store.rooms.some((room) => room.id === record.roomId && room.relationId === input.relation.id
      && room.characterId === input.relation.characterId && room.userIdentityId === input.relation.userIdentityId && room.conversationId === input.relation.conversationId)
    || typeof record.userText !== "string") return { success: false, error: "scope" as const };
  const media = store.media.find((item) => item.id === record.mediaId && item.ownerIdentityId === input.relation.userIdentityId);
  if (!media || !store.rooms.some((room) => room.id === record.roomId && room.mediaId === media.id)) return { success: false, error: "missing" as const };
  const automatic = record.userText === "（角色主动反应）";
  return archiveSharedMediaMemory({ scope: { characterId: input.relation.characterId, relationId: input.relation.id, userIdentityId: input.relation.userIdentityId, conversationId: input.relation.conversationId },
    app: "cinema", recordId: record.id, title: media.title, now: input.now, messages: [
      { id: `${record.id}:user`, author: "user", text: automatic ? "用户选择保留这次角色的观影回应，未提供当时原话。" : record.userText,
        occurredAt: automatic ? input.now ?? Date.now() : record.createdAt, confirmationAction: automatic },
      ...(record.characterText?.trim() ? [{ id: `${record.id}:character`, author: "character" as const, text: record.characterText, occurredAt: record.createdAt }] : [])] });
}
