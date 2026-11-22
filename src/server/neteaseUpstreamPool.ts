const DEFAULT_FAILURE_COOLDOWN_MS = 15_000;
const MAX_FAILURE_COOLDOWN_MS = 120_000;
const HEALTH_PROBE_TIMEOUT_MS = 4_000;
const CAPABILITY_RECHECK_MS = 5 * 60_000;

export interface NeteaseUpstreamTarget {
  id: string;
  baseUrl: string;
}

export type NeteaseUpstreamProbeResult =
  | { status: "compatible" }
  | { status: "incompatible"; reason?: string }
  | { status: "unavailable"; reason?: string };

export type NeteaseUpstreamCapabilityProbe = (target: NeteaseUpstreamTarget) => Promise<NeteaseUpstreamProbeResult>;

interface UpstreamState {
  consecutiveFailures: number;
  unhealthyUntil: number;
  lastProbeAt: number;
  healthy: boolean;
  capability: "unknown" | "compatible" | "incompatible";
  capabilityCheckedAt: number;
  incompatibleUntil: number;
  capabilityReason?: string;
  capabilityProbe?: Promise<NeteaseUpstreamProbeResult>;
}

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, "");

export const parseNeteaseUpstreamUrls = (primary?: string, configured?: string): string[] => {
  const values = [primary || "", ...(configured || "").split(/[\r\n,]+/)]
    .map(normalizeBaseUrl)
    .filter(Boolean);
  return Array.from(new Set(values));
};

export const isNeteaseUpstreamRetryable = (error: unknown): boolean => {
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "number"
    ? error.code
    : undefined;
  return status === 429 || code === 429 || (status !== undefined && status >= 500 && status < 600) || (code !== undefined && code >= 500 && code < 600);
};

const stateFor = (states: Map<string, UpstreamState>, id: string): UpstreamState => {
  const existing = states.get(id);
  if (existing) return existing;
  const initial: UpstreamState = {
    consecutiveFailures: 0,
    unhealthyUntil: 0,
    lastProbeAt: 0,
    healthy: true,
    capability: "unknown",
    capabilityCheckedAt: 0,
    incompatibleUntil: 0,
  };
  states.set(id, initial);
  return initial;
};

export class NeteaseUpstreamPool {
  readonly targets: NeteaseUpstreamTarget[];
  private readonly states = new Map<string, UpstreamState>();
  private capabilityProbe?: NeteaseUpstreamCapabilityProbe;

  constructor(baseUrls: string[]) {
    this.targets = Array.from(new Set(baseUrls.map(normalizeBaseUrl).filter(Boolean))).map((baseUrl) => ({ id: baseUrl, baseUrl }));
    if (!this.targets.length) throw new Error("网易云兼容 API 地址不能为空。");
    this.targets.forEach((target) => stateFor(this.states, target.id));
  }

  setCapabilityProbe(probe: NeteaseUpstreamCapabilityProbe | undefined): void {
    this.capabilityProbe = probe;
  }

  private isAvailable(target: NeteaseUpstreamTarget, now = Date.now()): boolean {
    const state = stateFor(this.states, target.id);
    return state.unhealthyUntil <= now && state.incompatibleUntil <= now;
  }

  private orderedTargets(preferredId?: string): NeteaseUpstreamTarget[] {
    if (!preferredId) return [...this.targets];
    const preferred = this.targets.find((target) => target.id === preferredId);
    return preferred ? [preferred, ...this.targets.filter((target) => target.id !== preferred.id)] : [...this.targets];
  }

  private async probe(target: NeteaseUpstreamTarget): Promise<boolean> {
    const state = stateFor(this.states, target.id);
    const now = Date.now();
    if (state.lastProbeAt && now - state.lastProbeAt < DEFAULT_FAILURE_COOLDOWN_MS) return state.healthy;
    state.lastProbeAt = now;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(`${target.baseUrl}/`, { method: "GET", headers: { Accept: "text/html,application/json" }, signal: controller.signal });
      await response.body?.cancel();
      if (!response.ok) {
        this.markFailure(target);
        return false;
      }
      this.markSuccess(target);
      return true;
    } catch {
      this.markFailure(target);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async probeCapability(target: NeteaseUpstreamTarget): Promise<NeteaseUpstreamProbeResult> {
    const state = stateFor(this.states, target.id);
    const now = Date.now();
    if (state.capability === "incompatible" && state.incompatibleUntil > now) {
      return { status: "incompatible", reason: state.capabilityReason };
    }
    if (state.capability === "compatible" && now - state.capabilityCheckedAt < CAPABILITY_RECHECK_MS) {
      return { status: "compatible" };
    }
    if (!this.capabilityProbe) return { status: "compatible" };
    if (!state.capabilityProbe) {
      state.capabilityProbe = this.capabilityProbe(target).finally(() => {
        state.capabilityProbe = undefined;
      });
    }
    const result = await state.capabilityProbe;
    state.capabilityCheckedAt = Date.now();
    if (result.status === "compatible") {
      state.capability = "compatible";
      state.capabilityReason = undefined;
      state.incompatibleUntil = 0;
      state.healthy = true;
    } else if (result.status === "incompatible") {
      state.capability = "incompatible";
      state.capabilityReason = result.reason;
      state.incompatibleUntil = Date.now() + CAPABILITY_RECHECK_MS;
      state.healthy = false;
    }
    return result;
  }

  /**
   * Return usable targets in preference order. A recovered target is probed
   * before it is reintroduced, so a dead backup does not delay every request.
   */
  async getCandidates(preferredId?: string, options: { skipCapabilityProbe?: boolean } = {}): Promise<NeteaseUpstreamTarget[]> {
    const ordered = this.orderedTargets(preferredId);
    const now = Date.now();
    const recovered = ordered.find((target) => {
      const state = stateFor(this.states, target.id);
      return state.consecutiveFailures > 0 && state.unhealthyUntil <= now && state.lastProbeAt < state.unhealthyUntil;
    });
    if (recovered) await this.probe(recovered);

    const available = ordered.filter((target) => this.isAvailable(target));
    if (available.length && !options.skipCapabilityProbe && this.capabilityProbe) {
      const compatible: NeteaseUpstreamTarget[] = [];
      for (const target of available) {
        const result = await this.probeCapability(target);
        if (result.status === "compatible") compatible.push(target);
        else if (result.status === "unavailable") this.markFailure(target);
      }
      if (compatible.length) return compatible;
      return [];
    }
    if (available.length) return available;
    // If every target is cooling down, retry the one that will recover first.
    return ordered
      .filter((target) => stateFor(this.states, target.id).incompatibleUntil <= now)
      .sort((a, b) => stateFor(this.states, a.id).unhealthyUntil - stateFor(this.states, b.id).unhealthyUntil);
  }

  markSuccess(target: NeteaseUpstreamTarget): void {
    const state = stateFor(this.states, target.id);
    state.consecutiveFailures = 0;
    state.unhealthyUntil = 0;
    state.healthy = true;
  }

  markIncompatible(target: NeteaseUpstreamTarget, reason?: string): void {
    const state = stateFor(this.states, target.id);
    state.capability = "incompatible";
    state.capabilityCheckedAt = Date.now();
    state.incompatibleUntil = Date.now() + CAPABILITY_RECHECK_MS;
    state.capabilityReason = reason;
    state.healthy = false;
  }

  markCompatible(target: NeteaseUpstreamTarget): void {
    const state = stateFor(this.states, target.id);
    state.capability = "compatible";
    state.capabilityCheckedAt = Date.now();
    state.incompatibleUntil = 0;
    state.capabilityReason = undefined;
    state.healthy = true;
  }

  markFailure(target: NeteaseUpstreamTarget): void {
    const state = stateFor(this.states, target.id);
    state.consecutiveFailures += 1;
    state.healthy = false;
    const cooldown = Math.min(MAX_FAILURE_COOLDOWN_MS, DEFAULT_FAILURE_COOLDOWN_MS * (2 ** Math.min(state.consecutiveFailures - 1, 3)));
    state.unhealthyUntil = Date.now() + cooldown;
  }

  healthSnapshot(): Array<{ id: string; baseUrl: string; healthy: boolean; consecutiveFailures: number; unhealthyUntil: number; capability: UpstreamState["capability"]; capabilityReason?: string }> {
    return this.targets.map((target) => {
      const state = stateFor(this.states, target.id);
      return { id: target.id, baseUrl: target.baseUrl, healthy: state.healthy && state.unhealthyUntil <= Date.now() && state.incompatibleUntil <= Date.now(), consecutiveFailures: state.consecutiveFailures, unhealthyUntil: state.unhealthyUntil, capability: state.capability, ...(state.capabilityReason ? { capabilityReason: state.capabilityReason } : {}) };
    });
  }
}

const pools = new Map<string, NeteaseUpstreamPool>();

export const getNeteaseUpstreamPool = (baseUrls: string[]): NeteaseUpstreamPool => {
  const key = baseUrls.map(normalizeBaseUrl).filter(Boolean).join("\n");
  const existing = pools.get(key);
  if (existing) return existing;
  const pool = new NeteaseUpstreamPool(baseUrls);
  pools.set(key, pool);
  return pool;
};
