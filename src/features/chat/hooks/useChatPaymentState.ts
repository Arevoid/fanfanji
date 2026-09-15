import { useEffect, useRef, useState } from "react";
import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { readString, writeJson } from "../../../core/storage/storageAdapter";
import {
  IDENTITY_WALLET_BALANCES_KEY,
  RED_PACKET_CLAIMS_KEY,
  RED_PACKET_STATUSES_KEY,
  getPaymentStatusKey,
  loadIdentityWalletBalances,
  readRedPacketClaims,
  readRedPacketStatus,
  resolveRedPacketExpiry,
  writeRedPacketStatus,
  type IdentityWalletBalances,
  type RedPacketClaim,
  type RedPacketClaimsMap,
  parseRedPacketPayload,
  type RedPacketStatus,
  type RedPacketStatusMap,
} from "../services/paymentScope";
import { isRedPacketMarkup } from "../services/messageParser";

interface UseChatPaymentStateOptions {
  activeIdentityId: string;
  activeRelationships: CharacterRelationship[];
  characters: Character[];
  messages: Message[];
  belongsToActiveIdentity: (ownerIdentityId?: string) => boolean;
  showToast: (message: string) => void;
  onSendMessage?: (message: Message) => void;
}

/** Owns relation-scoped wallet and red-packet persistence for the chat shell. */
export function useChatPaymentState({
  activeIdentityId,
  activeRelationships,
  characters,
  messages,
  belongsToActiveIdentity,
  showToast,
  onSendMessage,
}: UseChatPaymentStateOptions) {
  const [walletBalances, setWalletBalances] = useState<IdentityWalletBalances>(() =>
    loadIdentityWalletBalances(readString(IDENTITY_WALLET_BALANCES_KEY).value, readString("wechat_wallet_balance").value));
  const walletBalance = walletBalances[activeIdentityId] || 0;
  const setWalletBalance = (update: number | ((previous: number) => number)) => {
    setWalletBalances((previous) => {
      const current = previous[activeIdentityId] || 0;
      const nextValue = typeof update === "function" ? update(current) : update;
      const next = { ...previous, [activeIdentityId]: nextValue };
      writeJson(IDENTITY_WALLET_BALANCES_KEY, next);
      return next;
    });
  };

  const [redPacketStatuses, setRedPacketStatuses] = useState<RedPacketStatusMap>(() => {
    try {
      const stored = readString(RED_PACKET_STATUSES_KEY).value;
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [redPacketClaims, setRedPacketClaims] = useState<RedPacketClaimsMap>(() => {
    try {
      const stored = readString(RED_PACKET_CLAIMS_KEY).value;
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const redPacketClaimsRef = useRef(redPacketClaims);
  redPacketClaimsRef.current = redPacketClaims;

  const updateRedPacketStatus = (message: Message, status: RedPacketStatus) => {
    setRedPacketStatuses((previous) => {
      const next = writeRedPacketStatus(previous, message, status);
      writeJson(RED_PACKET_STATUSES_KEY, next);
      return next;
    });
  };

  const getRedPacketActualStatus = (message: Message): RedPacketStatus | "unclaimed" => {
    // Message IDs were the legacy persistence key. They remain a safe
    // fallback because message IDs are globally generated and unique.
    const savedStatus = readRedPacketStatus(redPacketStatuses, message, true);
    const packet = parseRedPacketPayload(message);
    const claims = readRedPacketClaims(redPacketClaims, message);
    const maxClaims = packet.mode === "exclusive" ? 1 : Math.max(1, Math.floor(packet.count));
    if (savedStatus === "exhausted" || claims.length >= maxClaims) return "exhausted" as const;
    // Claims are authoritative over stale expired/refunded status rows.
    if (savedStatus === "claimed" || claims.length > 0) return "claimed" as const;
    if (savedStatus === "refunded" || savedStatus === "expired") return savedStatus;
    if (Date.now() - message.timestamp > 24 * 3600 * 1000) return "expired" as const;
    return savedStatus || "unclaimed" as const;
  };

  const claimRedPacket = (message: Message, claimantId: string): number => {
    const packet = parseRedPacketPayload(message);
    const key = getPaymentStatusKey(message);
    const previousClaims = readRedPacketClaims(redPacketClaimsRef.current, message);
    if (previousClaims.some((claim) => claim.claimantId === claimantId)) return 0;
    if (packet.recipientId && packet.recipientId !== claimantId) return 0;
    const maxClaims = packet.mode === "exclusive" ? 1 : Math.max(1, Math.floor(packet.count));
    if (previousClaims.length >= maxClaims) return 0;
    const claimedTotal = previousClaims.reduce((sum, claim) => sum + claim.amount, 0);
    const remaining = Math.max(0, Number((packet.totalAmount - claimedTotal).toFixed(2)));
    const slotsLeft = maxClaims - previousClaims.length;
    if (remaining < 0.01) return 0;
    const amount = slotsLeft === 1
      ? remaining
      : Number((0.01 + Math.random() * Math.max(0, remaining - 0.01 * (slotsLeft - 1))).toFixed(2));
    const claim: RedPacketClaim = { claimantId, amount, claimedAt: Date.now() };
    const nextClaims = [...previousClaims, claim];
    redPacketClaimsRef.current = { ...redPacketClaimsRef.current, [key]: nextClaims };
    setRedPacketClaims((previous) => {
      const next = { ...previous, [key]: nextClaims };
      writeJson(RED_PACKET_CLAIMS_KEY, next);
      return next;
    });
    updateRedPacketStatus(message, nextClaims.length >= maxClaims ? "exhausted" : "claimed");
    return amount;
  };

  useEffect(() => {
    let changed = false;
    const updatedStatuses = { ...redPacketStatuses };
    let refundAmountTotal = 0;
    const expiredMessages: Array<{ message: Message; status: RedPacketStatus; refundAmount: number }> = [];
    const activeRelationIds = new Set(activeRelationships.map((relationship) => relationship.id));
    messages.filter((message) => message.relationId
      ? activeRelationIds.has(message.relationId)
      : Boolean(characters.find((character) => character.id === message.characterId && character.isGroupChat && belongsToActiveIdentity(character.ownerIdentityId))))
      .forEach((message) => {
        if (!isRedPacketMarkup(message.content)) return;
        const currentStatus = readRedPacketStatus(redPacketStatuses, message, true) || "unclaimed";
        const settlement = resolveRedPacketExpiry({
          message,
          packet: parseRedPacketPayload(message),
          claims: readRedPacketClaims(redPacketClaims, message),
          currentStatus,
          now: Date.now(),
        });
        if (!settlement.notify && settlement.status === currentStatus) return;
        const key = getPaymentStatusKey(message);
        updatedStatuses[key] = settlement.status;
        changed = true;
        if (settlement.notify) expiredMessages.push({ message, status: settlement.status as RedPacketStatus, refundAmount: settlement.refundAmount });
        if (settlement.refundAmount > 0) refundAmountTotal += settlement.refundAmount;
      });
    if (!changed) return;
    setRedPacketStatuses(updatedStatuses);
    writeJson(RED_PACKET_STATUSES_KEY, updatedStatuses);
    if (refundAmountTotal > 0) {
      setWalletBalance((previous) => previous + refundAmountTotal);
      showToast(`检测到有红包逾期未领，已自动退回 ¥${refundAmountTotal.toFixed(2)} 至您的零钱！🧧`);
    }
    expiredMessages.forEach(({ message, status, refundAmount }) => {
      onSendMessage?.({
        id: `redpacket-expired-${message.id}`,
        characterId: message.characterId,
        ...(message.relationId ? { relationId: message.relationId } : {}),
        ...(message.conversationId ? { conversationId: message.conversationId } : {}),
        sender: "character",
        ...(message.senderId ? { senderId: message.senderId } : {}),
        content: refundAmount > 0
          ? (status === "refunded" ? "红包超过24小时未领取，已原路退回。" : `红包已过期，未领取余额 ¥${refundAmount.toFixed(2)} 已原路退回。`)
          : "红包超过24小时未领取，已关闭。",
        timestamp: Date.now(),
        isNarration: true,
      });
    });
  }, [messages, redPacketStatuses, redPacketClaims, activeRelationships, activeIdentityId, characters, belongsToActiveIdentity, showToast, onSendMessage]);

  return {
    walletBalances,
    walletBalance,
    setWalletBalance,
    redPacketStatuses,
    setRedPacketStatuses,
    updateRedPacketStatus,
    getRedPacketActualStatus,
    redPacketClaims,
    claimRedPacket,
  };
}
