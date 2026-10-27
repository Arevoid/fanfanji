import type { CharacterLifeEpisode } from "./characterContinuity";

/** A view of the original episodes, never a second durable schedule. */
export function projectLifePlans(episodes: readonly CharacterLifeEpisode[], userIdentityId: string, characterId: string) {
  return episodes.filter(episode => episode.userIdentityId === userIdentityId && episode.characterId === characterId
    && episode.status === "planned" && !episode.supersededById)
    .sort((a, b) => (a.scheduleSlot?.startAt ?? Infinity) - (b.scheduleSlot?.startAt ?? Infinity) || a.recordedAt - b.recordedAt);
}

export function isLifeExperience(episode: CharacterLifeEpisode) {
  return episode.status === "completed" && (!episode.experienceAssessed || Boolean(episode.experience));
}
