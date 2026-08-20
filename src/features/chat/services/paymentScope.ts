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
