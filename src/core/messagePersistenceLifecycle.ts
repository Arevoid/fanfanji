export type MessagePersistenceDecision =
  | "wait_for_hydration"
  | "already_persisted"
  | "hydration_snapshot"
  | "persist";

export interface MessagePersistenceLifecycleState {
  hydrationReady: boolean;
  skipHydrationSnapshot: boolean;
  explicitlyPersistedSnapshot: readonly unknown[] | null;
}

export const createMessagePersistenceLifecycle = (): MessagePersistenceLifecycleState => ({
  hydrationReady: false,
  skipHydrationSnapshot: false,
  explicitlyPersistedSnapshot: null,
});

export const markMessageHydrated = (state: MessagePersistenceLifecycleState): void => {
  state.hydrationReady = true;
  state.skipHydrationSnapshot = true;
  state.explicitlyPersistedSnapshot = null;
};

export const markMessageSnapshotPersisted = (
  state: MessagePersistenceLifecycleState,
  snapshot: readonly unknown[],
): void => {
  state.explicitlyPersistedSnapshot = snapshot;
};

export const consumeMessagePersistenceDecision = (
  state: MessagePersistenceLifecycleState,
  snapshot: readonly unknown[],
): MessagePersistenceDecision => {
  if (!state.hydrationReady) return "wait_for_hydration";
  if (state.explicitlyPersistedSnapshot === snapshot) {
    state.explicitlyPersistedSnapshot = null;
    return "already_persisted";
  }
  if (state.skipHydrationSnapshot) {
    state.skipHydrationSnapshot = false;
    return "hydration_snapshot";
  }
  return "persist";
};
