import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import { createEmptyCinemaStore, type CinemaStore } from "../../../domain/cinema/types";

function normalizeStore(value: unknown): CinemaStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createEmptyCinemaStore();
  const raw = value as Partial<CinemaStore>;
  return {
    schemaVersion: 1,
    media: Array.isArray(raw.media) ? raw.media.filter(Boolean) as CinemaStore["media"] : [],
    rooms: Array.isArray(raw.rooms) ? raw.rooms.filter(Boolean) as CinemaStore["rooms"] : [],
    discussions: Array.isArray(raw.discussions) ? raw.discussions.filter(Boolean) as CinemaStore["discussions"] : [],
  };
}

export function loadCinemaStore(): CinemaStore {
  const result = readJson<unknown>(storageKeys.cinemaStore, createEmptyCinemaStore());
  return normalizeStore(result.value);
}

export function saveCinemaStore(store: CinemaStore): boolean {
  return writeJson(storageKeys.cinemaStore, normalizeStore(store)).success;
}

export function initializeCinemaStore(): CinemaStore {
  const store = loadCinemaStore();
  if (store.schemaVersion !== 1) saveCinemaStore(store);
  return store;
}
