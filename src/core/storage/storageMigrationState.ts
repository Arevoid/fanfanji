import { readJson, remove, writeJson } from "./storageAdapter";
import { storageKeys } from "./storageKeys";

export type StorageMigrationPhase =
  | "backup"
  | "migrating"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface StorageMigrationState {
  id: string;
  sourceVersion: number;
  targetVersion: number;
  phase: StorageMigrationPhase;
  startedAt: number;
  updatedAt: number;
  currentModule?: string;
  completedModules: string[];
  error?: string;
}

const isPhase = (value: unknown): value is StorageMigrationPhase =>
  value === "backup"
  || value === "migrating"
  || value === "verifying"
  || value === "completed"
  || value === "failed"
  || value === "cancelled";

export const isStorageMigrationState = (value: unknown): value is StorageMigrationState => {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return typeof state.id === "string"
    && Number.isInteger(state.sourceVersion)
    && Number.isInteger(state.targetVersion)
    && Number(state.targetVersion) > Number(state.sourceVersion)
    && isPhase(state.phase)
    && typeof state.startedAt === "number"
    && typeof state.updatedAt === "number"
    && Array.isArray(state.completedModules)
    && state.completedModules.every((module) => typeof module === "string")
    && (state.currentModule === undefined || typeof state.currentModule === "string")
    && (state.error === undefined || typeof state.error === "string");
};

export const loadStorageMigrationState = (): StorageMigrationState | null => {
  const result = readJson<unknown>(storageKeys.migrationState, null);
  return result.valid && isStorageMigrationState(result.value) ? result.value : null;
};

export const saveStorageMigrationState = (state: StorageMigrationState) =>
  writeJson(storageKeys.migrationState, state);

export const clearStorageMigrationState = () => remove(storageKeys.migrationState);
