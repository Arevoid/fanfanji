import { useEffect, useState } from "react";
import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { readString, writeJson } from "../../../core/storage/storageAdapter";
import {
  IDENTITY_WALLET_BALANCES_KEY,
  RED_PACKET_STATUSES_KEY,
  getPaymentStatusKey,
  loadIdentityWalletBalances,
  readRedPacketStatus,
  writeRedPacketStatus,
  type IdentityWalletBalances,
  type RedPacketStatus,
  type RedPacketStatusMap,
} from "../services/paymentScope";
import { isRedPacketMarkup, normalizePaymentMarkup } from "../services/messageParser";

interface UseChatPaymentStateOptions {
  activeIdentityId: string;
  activeRelationships: CharacterRelationship[];
  characters: Character[];
  messages: Message[];
  belongsToActiveIdentity: (ownerIdentityId?: string) => boolean;
  showToast: (message: string) => void;
}

/** Owns relation-scoped wallet and red-packet persistence for the chat shell. */
export function useChatPaymentState({
  activeIdentityId,
  activeRelationships,
  characters,
  messages,
  belongsToActiveIdentity,
  showToast,
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

  const updateRedPacketStatus = (message: Message, status: RedPacketStatus) => {
    setRedPacketStatuses((previous) => {
      const next = writeRedPacketStatus(previous, message, status);
      writeJson(RED_PACKET_STATUSES_KEY, next);
      return next;
    });
  };

  const getRedPacketActualStatus = (message: Message) => {
    const savedStatus = readRedPacketStatus(redPacketStatuses, message, activeIdentityId === "identity-1");
    if (savedStatus === "claimed" || savedStatus === "refunded") return savedStatus;
    if (Date.now() - message.timestamp > 24 * 3600 * 1000) return "expired" as const;
    return savedStatus || "unclaimed" as const;
  };

  useEffect(() => {
    let changed = false;
    const updatedStatuses = { ...redPacketStatuses };
    let refundAmountTotal = 0;
    const activeRelationIds = new Set(activeRelationships.map((relationship) => relationship.id));
    messages.filter((message) => message.relationId
      ? activeRelationIds.has(message.relationId)
      : Boolean(characters.find((character) => character.id === message.characterId && character.isGroupChat && belongsToActiveIdentity(character.ownerIdentityId))))
      .forEach((message) => {
        if (!isRedPacketMarkup(message.content)) return;
        const currentStatus = readRedPacketStatus(redPacketStatuses, message, activeIdentityId === "identity-1") || "unclaimed";
        if (Date.now() - message.timestamp <= 24 * 3600 * 1000 || currentStatus !== "unclaimed") return;
        updatedStatuses[getPaymentStatusKey(message)] = "expired";
        changed = true;
        if (message.sender === "user") {
          const [, amountText] = normalizePaymentMarkup(message.content).split("|");
          const amount = Number.parseFloat(amountText || "0");
          if (Number.isFinite(amount) && amount > 0) {
            refundAmountTotal += amount;
            updatedStatuses[getPaymentStatusKey(message)] = "refunded";
          }
        }
      });
    if (!changed) return;
    setRedPacketStatuses(updatedStatuses);
    writeJson(RED_PACKET_STATUSES_KEY, updatedStatuses);
    if (refundAmountTotal > 0) {
      setWalletBalance((previous) => previous + refundAmountTotal);
      showToast(`检测到有红包逾期未领，已自动退回 ¥${refundAmountTotal.toFixed(2)} 至您的零钱！🧧`);
    }
  }, [messages, redPacketStatuses, activeRelationships, activeIdentityId, characters, belongsToActiveIdentity, showToast]);

  return {
    walletBalances,
    walletBalance,
    setWalletBalance,
    redPacketStatuses,
    setRedPacketStatuses,
    updateRedPacketStatus,
    getRedPacketActualStatus,
  };
}
