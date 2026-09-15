import type { Message, RedPacketPayload } from "../../../types";

export type RedPacketStatus = "claimed" | "exhausted" | "expired" | "refunded";
export type RedPacketStatusMap = Record<string, RedPacketStatus>;
export type IdentityWalletBalances = Record<string, number>;
export interface RedPacketClaim { claimantId: string; amount: number; claimedAt: number; }
export type RedPacketClaimsMap = Record<string, RedPacketClaim[]>;

export const IDENTITY_WALLET_BALANCES_KEY = "phone_identity_wallet_balances";
export const RED_PACKET_STATUSES_KEY = "wechat_redpacket_statuses";
export const RED_PACKET_CLAIMS_KEY = "wechat_redpacket_claims";

export function parseRedPacketPayload(message: Pick<Message, "content" | "redPacket">): RedPacketPayload {
  if (message.redPacket) return message.redPacket;
  const [, amountText = "8.88", greeting = "恭喜发财，万事如意"] = message.content.split("|");
  const totalAmount = Number.parseFloat(amountText) || 8.88;
  return { mode: "lucky", totalAmount, count: 1, greeting };
}

/** Direct payment actions must use the relation as well as the message ID. */
export const getPaymentStatusKey = (message: Pick<Message, "id" | "relationId" | "characterId">): string =>
  message.relationId ? `${message.relationId}:${message.id}` : `group:${message.characterId}:${message.id}`;

/**
 * Red-packet claims were first stored with a relation/group key. During the
 * scope migration some legacy records can still be keyed by message ID.
 * Read all safe historical forms, preferring the current scoped key.
 */
export const getPaymentClaimKeys = (message: Pick<Message, "id" | "relationId" | "characterId">): string[] => Array.from(new Set([
  getPaymentStatusKey(message),
  message.id,
  `group:${message.characterId}:${message.id}`,
]));

export const readRedPacketClaims = (
  claims: RedPacketClaimsMap,
  message: Pick<Message, "id" | "relationId" | "characterId">,
): RedPacketClaim[] => {
  for (const key of getPaymentClaimKeys(message)) {
    const value = claims[key];
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return [];
};

export const readRedPacketStatus = (
  statuses: RedPacketStatusMap,
  message: Pick<Message, "id" | "relationId" | "characterId">,
  allowLegacyMessageId = false,
): RedPacketStatus | undefined => statuses[getPaymentStatusKey(message)]
  || (allowLegacyMessageId ? statuses[message.id] : undefined);

export const writeRedPacketStatus = (
  statuses: RedPacketStatusMap,
  message: Pick<Message, "id" | "relationId" | "characterId">,
  status: RedPacketStatus,
): RedPacketStatusMap => ({ ...statuses, [getPaymentStatusKey(message)]: status });

export const removePaymentStatusesByRelation = (
  statuses: RedPacketStatusMap,
  relationId: string,
): RedPacketStatusMap => Object.fromEntries(Object.entries(statuses)
  .filter(([key]) => !key.startsWith(`${relationId}:`)));

export const removePaymentStatusesForMessages = (
  statuses: RedPacketStatusMap,
  messages: readonly Pick<Message, "id" | "relationId" | "characterId">[],
): RedPacketStatusMap => {
  const keys = new Set(messages.flatMap((message) => [message.id, getPaymentStatusKey(message)]));
  return Object.fromEntries(Object.entries(statuses).filter(([key]) => !keys.has(key)));
};

export const loadIdentityWalletBalances = (raw: string | null, legacyRaw: string | null): IdentityWalletBalances => {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as IdentityWalletBalances;
    } catch { /* use deterministic legacy fallback */ }
  }
  const legacy = Number.parseFloat(legacyRaw || "0");
  return Number.isFinite(legacy) && legacy !== 0 ? { "identity-1": legacy } : {};
};

export interface RedPacketExpirySettlement {
  status: RedPacketStatus | "unclaimed";
  refundAmount: number;
  notify: boolean;
}

/** Resolve a packet after its 24-hour claim window without losing claims. */
export const resolveRedPacketExpiry = (input: {
  message: Pick<Message, "sender" | "timestamp">;
  packet: RedPacketPayload;
  claims: readonly RedPacketClaim[];
  currentStatus: RedPacketStatus | "unclaimed";
  now: number;
}): RedPacketExpirySettlement => {
  if (input.now - input.message.timestamp <= 24 * 3600 * 1000) {
    return { status: input.currentStatus, refundAmount: 0, notify: false };
  }
  const maxClaims = input.packet.mode === "exclusive" ? 1 : Math.max(1, Math.floor(input.packet.count));
  const claimedAmount = input.claims.reduce((sum, claim) => sum + (Number.isFinite(claim.amount) ? claim.amount : 0), 0);
  const remainingAmount = Math.max(0, Number((input.packet.totalAmount - claimedAmount).toFixed(2)));
  if (input.currentStatus === "exhausted" || input.claims.length >= maxClaims || remainingAmount < 0.01) {
    return { status: "exhausted", refundAmount: 0, notify: false };
  }
  if (input.currentStatus === "refunded" || input.currentStatus === "expired") {
    return { status: input.currentStatus, refundAmount: 0, notify: false };
  }
  // A persisted "claimed" status without claim rows is still treated as
  // claimed: never turn an acknowledged payment into a second refund.
  if (input.currentStatus === "claimed" && input.claims.length === 0) {
    return { status: "claimed", refundAmount: 0, notify: false };
  }
  const hasClaims = input.claims.length > 0;
  return {
    status: input.message.sender === "user" && !hasClaims ? "refunded" : "expired",
    refundAmount: input.message.sender === "user" ? remainingAmount : 0,
    notify: true,
  };
};
