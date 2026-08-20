let activeOperations = 0;
let migrationActive = false;
let resolveIdle: (() => void) | null = null;
let migrationFinished: Promise<void> = Promise.resolve();
let resolveMigrationFinished: (() => void) | null = null;

/**
 * Coordinates ordinary offline-story persistence with the one-shot content
 * migration. Existing operations are allowed to finish; new operations wait
 * until migration verification and marker updates are complete.
 */
export async function enterContentStorageOperation(): Promise<() => void> {
  while (migrationActive) await migrationFinished;
  activeOperations += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeOperations = Math.max(0, activeOperations - 1);
    if (activeOperations === 0 && resolveIdle) {
      const resolve = resolveIdle;
      resolveIdle = null;
      resolve();
    }
  };
}

export async function beginContentStorageMigration(): Promise<() => void> {
  if (migrationActive) throw new Error("内容存储迁移已在当前页面执行中");
  migrationActive = true;
  migrationFinished = new Promise<void>((resolve) => { resolveMigrationFinished = resolve; });
  if (activeOperations > 0) await new Promise<void>((resolve) => { resolveIdle = resolve; });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    migrationActive = false;
    const resolve = resolveMigrationFinished;
    resolveMigrationFinished = null;
    resolve?.();
  };
}

export const isContentStorageMigrationActive = (): boolean => migrationActive;
