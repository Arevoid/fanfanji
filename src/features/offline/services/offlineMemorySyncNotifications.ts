export interface OfflineMemorySyncNotification {
  message: string;
  isError?: boolean;
}

type Listener = (notification: OfflineMemorySyncNotification) => void;

const listeners = new Set<Listener>();

export function subscribeOfflineMemorySyncNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyOfflineMemorySync(notification: OfflineMemorySyncNotification): void {
  listeners.forEach((listener) => listener(notification));
}
