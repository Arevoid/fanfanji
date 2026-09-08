import { BackgroundScheduler, type BackgroundTaskOptions } from "./backgroundScheduler";
import { loadRecoverableBackgroundTaskSnapshots, type PersistedBackgroundTaskSnapshot } from "./schedulerTaskRepository";

export type BackgroundTaskFactory = (snapshot: PersistedBackgroundTaskSnapshot) => BackgroundTaskOptions | null;

const factories = new Map<string, Set<BackgroundTaskFactory>>();

/** Register a task kind without registering private task payloads. */
export function registerBackgroundTaskFactory(taskType: string, factory: BackgroundTaskFactory): () => void {
  const registered = factories.get(taskType) ?? new Set<BackgroundTaskFactory>();
  registered.add(factory);
  factories.set(taskType, registered);
  return () => {
    const current = factories.get(taskType);
    if (!current) return;
    current.delete(factory);
    if (current.size === 0) factories.delete(taskType);
  };
}

/** Rebuilds only tasks whose type is known and whose persisted state is safe to resume. */
export function restoreBackgroundSchedulers(now = Date.now()): BackgroundScheduler[] {
  return loadRecoverableBackgroundTaskSnapshots(now).flatMap((snapshot) => {
    if (!snapshot.taskType) return [];
    const registered = factories.get(snapshot.taskType);
    if (!registered) return [];
    for (const factory of registered) {
      const options = factory(snapshot);
      if (options) return [new BackgroundScheduler({ ...options, id: snapshot.id, resumeFrom: snapshot })];
    }
    return [];
  });
}
