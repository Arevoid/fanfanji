import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import type { Character, Moment, MomentComment, MomentLikeActor, UserIdentity, UserSettings } from "../../../types";

export interface MomentAuthorPresentation {
  name: string;
  avatar: string;
}

const identitiesOf = (settings: UserSettings): readonly UserIdentity[] => settings.identities || [];

export function resolveMomentIdentity(identityId: string | undefined, settings: UserSettings): UserIdentity | undefined {
  if (!identityId) return undefined;
  return identitiesOf(settings).find((identity) => identity.id === identityId);
}

export function resolveMomentCommentAuthor(
  comment: MomentComment,
  settings: UserSettings,
  characters: readonly Character[],
): MomentAuthorPresentation {
  const identity = resolveMomentIdentity(comment.authorIdentityId, settings);
  if (identity) {
    return {
      name: identity.name?.trim() || comment.authorName,
      avatar: identity.avatar || comment.authorAvatar,
    };
  }

  if (comment.characterId) {
    const canonicalId = resolveCanonicalCharacterId(comment.characterId, characters);
    const character = characters.find((candidate) => candidate.id === canonicalId);
    if (character) {
      return {
        name: character.remark || character.name,
        avatar: character.avatar || comment.authorAvatar,
      };
    }
  }

  const character = characters.find((candidate) =>
    candidate.name === comment.authorName || candidate.remark === comment.authorName,
  );
  return character
    ? { name: character.remark || character.name, avatar: character.avatar || comment.authorAvatar }
    : { name: comment.authorName, avatar: comment.authorAvatar };
}

function identityNameMap(moment: Moment, settings: UserSettings): Map<string, UserIdentity> {
  const map = new Map<string, UserIdentity>();
  const identities = identitiesOf(settings);
  const add = (name: string | undefined, identity: UserIdentity | undefined) => {
    const normalized = name?.trim();
    if (normalized && identity) map.set(normalized, identity);
  };

  // Current names are safe to resolve when the same identity has authored a
  // post/comment in this snapshot. This avoids treating an unrelated
  // character with the same display name as the local user.
  const evidencedIdentityIds = new Set<string>();
  if (moment.authorIdentityId) evidencedIdentityIds.add(moment.authorIdentityId);
  moment.comments.forEach((comment) => {
    if (comment.authorIdentityId) evidencedIdentityIds.add(comment.authorIdentityId);
  });
  evidencedIdentityIds.forEach((identityId) => {
    const identity = resolveMomentIdentity(identityId, settings);
    if (!identity) return;
    add(identity.name, identity);
    moment.comments
      .filter((comment) => comment.authorIdentityId === identityId)
      .forEach((comment) => add(comment.authorName, identity));
    if (moment.authorIdentityId === identityId) add(moment.authorName, identity);
  });
  identities.forEach((identity) => {
    if (evidencedIdentityIds.has(identity.id)) add(identity.name, identity);
  });
  return map;
}

export function getMomentLikeDisplayNames(moment: Moment, settings: UserSettings): string[] {
  const remainingLegacyLikes = [...(Array.isArray(moment.likes) ? moment.likes : [])];
  const names: string[] = [];
  const nameMap = identityNameMap(moment, settings);
  const seenIdentityIds = new Set<string>();

  (Array.isArray(moment.likeActors) ? moment.likeActors : []).forEach((actor: MomentLikeActor) => {
    const snapshotIndex = remainingLegacyLikes.indexOf(actor.name);
    if (snapshotIndex >= 0) remainingLegacyLikes.splice(snapshotIndex, 1);
    const identity = resolveMomentIdentity(actor.identityId, settings);
    const displayName = identity?.name?.trim() || actor.name;
    if (identity) {
      if (seenIdentityIds.has(identity.id)) return;
      seenIdentityIds.add(identity.id);
    }
    names.push(displayName);
  });

  remainingLegacyLikes.forEach((name) => {
    const identity = nameMap.get(name.trim());
    if (identity) {
      if (seenIdentityIds.has(identity.id)) return;
      seenIdentityIds.add(identity.id);
      names.push(identity.name?.trim() || name);
      return;
    }
    names.push(name);
  });
  return names;
}

export function isMomentLikedByIdentity(moment: Moment, identityId: string | undefined, displayName: string): boolean {
  if (identityId && (moment.likeActors || []).some((actor) => actor.identityId === identityId)) return true;
  return !identityId || !(moment.likeActors || []).some((actor) => actor.identityId === identityId)
    ? moment.likes.includes(displayName)
    : false;
}

export function toggleMomentLike(moment: Moment, actor: MomentLikeActor): Moment {
  const actors = Array.isArray(moment.likeActors) ? [...moment.likeActors] : [];
  const actorIndex = actor.identityId
    ? actors.findIndex((candidate) => candidate.identityId === actor.identityId)
    : actors.findIndex((candidate) => !candidate.identityId && candidate.name === actor.name);
  const legacyLikes = [...(Array.isArray(moment.likes) ? moment.likes : [])];

  if (actorIndex >= 0) {
    const removed = actors[actorIndex];
    actors.splice(actorIndex, 1);
    const legacyIndex = legacyLikes.indexOf(removed.name);
    if (legacyIndex >= 0) legacyLikes.splice(legacyIndex, 1);
    return {
      ...moment,
      likes: legacyLikes,
      likeActors: actors.length > 0 ? actors : undefined,
    };
  }

  // A legacy like has no identity id. Keep the old toggle behaviour when the
  // current display name still exists, otherwise create an identity-backed
  // actor so future renames remain live.
  if (actor.identityId && legacyLikes.includes(actor.name)) {
    const legacyIndex = legacyLikes.indexOf(actor.name);
    legacyLikes.splice(legacyIndex, 1);
    return { ...moment, likes: legacyLikes };
  }

  actors.push(actor);
  legacyLikes.push(actor.name);
  return { ...moment, likes: legacyLikes, likeActors: actors };
}

export function migrateMomentIdentitySnapshots(
  previous: UserSettings,
  next: UserSettings,
  moments: readonly Moment[],
): { moments: Moment[]; changed: boolean } {
  const previousById = new Map((previous.identities || []).map((identity) => [identity.id, identity]));
  let changed = false;
  const migrated = moments.map((moment) => {
    let nextMoment = moment;
    const identityIds = new Set<string>();
    if (moment.authorIdentityId) identityIds.add(moment.authorIdentityId);
    moment.comments.forEach((comment) => {
      if (comment.authorIdentityId) identityIds.add(comment.authorIdentityId);
    });
    (moment.likeActors || []).forEach((actor) => {
      if (actor.identityId) identityIds.add(actor.identityId);
    });
    // Legacy likes contain only display names. If a renamed identity's old
    // name is present, include it in the migration set so the exact-name
    // repair below can update historical likes even without comments.
    previous.identities?.forEach((before) => {
      const after = resolveMomentIdentity(before.id, next);
      if (after && before.name && before.name !== after.name && moment.likes.includes(before.name)) {
        identityIds.add(before.id);
      }
    });

    identityIds.forEach((identityId) => {
      const before = previousById.get(identityId);
      const after = resolveMomentIdentity(identityId, next);
      if (!before || !after || (before.name === after.name && before.avatar === after.avatar)) return;
      const update: Moment = {
        ...nextMoment,
        ...(nextMoment.authorIdentityId === identityId
          ? { authorName: after.name || nextMoment.authorName, authorAvatar: after.avatar || nextMoment.authorAvatar }
          : {}),
        comments: nextMoment.comments.map((comment) => comment.authorIdentityId === identityId
          ? { ...comment, authorName: after.name || comment.authorName, authorAvatar: after.avatar || comment.authorAvatar }
          : comment),
        likeActors: nextMoment.likeActors?.map((actor) => actor.identityId === identityId
          ? { ...actor, name: after.name || actor.name }
          : actor),
      };
      // Legacy likes are name-only. An exact-name migration is the only safe
      // repair available for records written before identity-backed likes.
      if (before.name && after.name && before.name !== after.name) {
        update.likes = update.likes.map((name) => name === before.name ? after.name : name);
      }
      nextMoment = update;
      changed = true;
    });
    return nextMoment;
  });
  return { moments: migrated, changed };
}
