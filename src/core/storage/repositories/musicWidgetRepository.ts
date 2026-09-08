import type {
  DualMusicWidgetConfig,
  IdentityMusicState,
  RelationshipMusicState,
} from "../../../types";

export const DUAL_MUSIC_WIDGET_CONFIGS_KEY = "phone_dual_music_widget_configs";
export const IDENTITY_MUSIC_STATES_KEY = "phone_identity_music_states";
export const RELATIONSHIP_MUSIC_STATES_KEY = "phone_relationship_music_states";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const parseArray = <T>(storage: StorageLike, key: string): T[] => {
  try {
    const value = storage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveArray = <T>(storage: StorageLike, key: string, value: readonly T[]) => {
  storage.setItem(key, JSON.stringify(value));
};

export const loadDualMusicWidgetConfigs = (storage: StorageLike = localStorage) =>
  parseArray<DualMusicWidgetConfig>(storage, DUAL_MUSIC_WIDGET_CONFIGS_KEY);
export const saveDualMusicWidgetConfigs = (value: readonly DualMusicWidgetConfig[], storage: StorageLike = localStorage) =>
  saveArray(storage, DUAL_MUSIC_WIDGET_CONFIGS_KEY, value);

export const loadIdentityMusicStates = (storage: StorageLike = localStorage) =>
  parseArray<IdentityMusicState>(storage, IDENTITY_MUSIC_STATES_KEY);
export const saveIdentityMusicStates = (value: readonly IdentityMusicState[], storage: StorageLike = localStorage) =>
  saveArray(storage, IDENTITY_MUSIC_STATES_KEY, value);

export const loadRelationshipMusicStates = (storage: StorageLike = localStorage) =>
  parseArray<RelationshipMusicState>(storage, RELATIONSHIP_MUSIC_STATES_KEY);
export const saveRelationshipMusicStates = (value: readonly RelationshipMusicState[], storage: StorageLike = localStorage) =>
  saveArray(storage, RELATIONSHIP_MUSIC_STATES_KEY, value);

export const upsertIdentityMusicTrack = (
  states: readonly IdentityMusicState[],
  ownerIdentityId: string,
  trackId: string,
  now = Date.now(),
): IdentityMusicState[] => {
  const current = states.find((state) => state.ownerIdentityId === ownerIdentityId);
  const next: IdentityMusicState = {
    ownerIdentityId,
    currentTrackId: trackId,
    recentTrackIds: [trackId, ...(current?.recentTrackIds || []).filter((id) => id !== trackId)].slice(0, 20),
    updatedAt: now,
  };
  return [...states.filter((state) => state.ownerIdentityId !== ownerIdentityId), next];
};

export const bindDualMusicWidget = (
  configs: readonly DualMusicWidgetConfig[],
  input: { widgetId: string; ownerIdentityId: string; relationId?: string; characterId?: string; now?: number },
): DualMusicWidgetConfig[] => {
  const now = input.now ?? Date.now();
  const previous = configs.find((config) =>
    config.widgetId === input.widgetId && config.ownerIdentityId === input.ownerIdentityId);
  const next: DualMusicWidgetConfig = {
    widgetId: input.widgetId,
    ownerIdentityId: input.ownerIdentityId,
    relationId: input.relationId,
    characterId: input.characterId,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
  return [
    ...configs.filter((config) =>
      config.widgetId !== input.widgetId || config.ownerIdentityId !== input.ownerIdentityId),
    next,
  ];
};

export const removeMusicDataByRelations = (
  configs: readonly DualMusicWidgetConfig[],
  states: readonly RelationshipMusicState[],
  relationIds: readonly string[],
) => {
  const removed = new Set(relationIds);
  return {
    configs: configs.map((config) => removed.has(config.relationId || "")
      ? { ...config, relationId: undefined, characterId: undefined, updatedAt: Date.now() }
      : config),
    states: states.filter((state) => !removed.has(state.relationId)),
  };
};

export const removeMusicTrackReferences = (
  identityStates: readonly IdentityMusicState[],
  relationshipStates: readonly RelationshipMusicState[],
  trackId: string,
) => ({
  identityStates: identityStates.map((state) => ({
    ...state,
    currentTrackId: state.currentTrackId === trackId ? undefined : state.currentTrackId,
    recentTrackIds: state.recentTrackIds.filter((id) => id !== trackId),
  })),
  relationshipStates: relationshipStates.map((state) => ({
    ...state,
    currentTrackId: state.currentTrackId === trackId ? undefined : state.currentTrackId,
    recentTrackIds: state.recentTrackIds.filter((id) => id !== trackId),
  })),
});
