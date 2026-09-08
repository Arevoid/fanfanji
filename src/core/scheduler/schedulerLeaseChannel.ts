const CHANNEL_NAME = "fanfanji-background-scheduler-lease-v1";

interface LeaseMessage {
  kind: "acquired" | "released";
  id: string;
  ownerId: string;
  expiresAt?: number;
}

const peerLeases = new Map<string, { ownerId: string; expiresAt: number }>();
let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  // Scheduler lease coordination is browser-tab scoped. Avoid opening a
  // Node.js BroadcastChannel during repository tests or server-side imports.
  if (channel || typeof window === "undefined" || typeof window.document === "undefined" || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event: MessageEvent<LeaseMessage>) => {
    const message = event.data;
    if (!message || typeof message.id !== "string" || typeof message.ownerId !== "string") return;
    if (message.kind === "released") {
      const current = peerLeases.get(message.id);
      if (current?.ownerId === message.ownerId) peerLeases.delete(message.id);
      return;
    }
    if (message.kind === "acquired" && typeof message.expiresAt === "number") {
      peerLeases.set(message.id, { ownerId: message.ownerId, expiresAt: message.expiresAt });
    }
  });
  return channel;
}

function announce(message: LeaseMessage): void {
  try { ensureChannel()?.postMessage(message); } catch { /* BroadcastChannel is advisory only. */ }
}

export function hasActivePeerLease(id: string, ownerId: string, now: number): boolean {
  ensureChannel();
  for (const [leaseId, lease] of peerLeases) {
    if (lease.expiresAt <= now) peerLeases.delete(leaseId);
  }
  const peer = peerLeases.get(id);
  return Boolean(peer && peer.ownerId !== ownerId && peer.expiresAt > now);
}

export function announceSchedulerLease(id: string, ownerId: string, expiresAt: number): void {
  announce({ kind: "acquired", id, ownerId, expiresAt });
}

export function announceSchedulerLeaseRelease(id: string, ownerId: string): void {
  peerLeases.delete(id);
  announce({ kind: "released", id, ownerId });
}

/** Test-only reset; no production caller should need to close the shared channel. */
export function resetSchedulerLeaseChannelForTests(): void {
  peerLeases.clear();
  channel?.close();
  channel = null;
}
