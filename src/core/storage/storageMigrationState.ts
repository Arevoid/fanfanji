import { readJson, remove, writeJson } from "./storageAdapter";
import { storageKeys } from "./storageKeys";

export type StorageMigrationPhase =
  | "backup"
  | "migrating"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface StorageMigrationModuleReport {
  module: string;
  status: "completed" | "skipped" | "failed";
  records: number;
  repaired: number;
  error?: string;
}

export interface StorageMigrationReport {
  completed: number;
  skipped: number;
  repaired: number;
  failed: number;
  modules: StorageMigrationModuleReport[];
}

export interface StorageMigrationState {
  id: string;
  sourceVersion: number;
  targetVersion: number;
  phase: StorageMigrationPhase;
  startedAt: number;
  updatedAt: number;
  currentModule?: string;
  completedModules: string[];
  report?: StorageMigrationReport;
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
    && (state.report === undefined || isStorageMigrationReport(state.report))
    && (state.currentModule === undefined || typeof state.currentModule === "string")
    && (state.error === undefined || typeof state.error === "string");
};

function isStorageMigrationReport(value: unknown): value is StorageMigrationReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  if (!["completed", "skipped", "repaired", "failed"].every((key) => Number.isInteger(report[key]) && Number(report[key]) >= 0)) return false;
  if (!Array.isArray(report.modules)) return false;
  return report.modules.every((module) => {
    if (!module || typeof module !== "object") return false;
    const entry = module as Record<string, unknown>;
    return typeof entry.module === "string"
      && (entry.status === "completed" || entry.status === "skipped" || entry.status === "failed")
      && Number.isInteger(entry.records) && Number(entry.records) >= 0
      && Number.isInteger(entry.repaired) && Number(entry.repaired) >= 0
      && (entry.error === undefined || typeof entry.error === "string");
  });
}

export const loadStorageMigrationState = (): StorageMigrationState | null => {
  const result = readJson<unknown>(storageKeys.migrationState, null);
  return result.valid && isStorageMigrationState(result.value) ? result.value : null;
};

export const saveStorageMigrationState = (state: StorageMigrationState) =>
  writeJson(storageKeys.migrationState, state);

export const clearStorageMigrationState = () => remove(storageKeys.migrationState);
