import { useEffect, useState } from "react";
import type { UserSettings } from "../../../types";

export type ChatProfileSubView = "none" | "identities" | "wallet" | "stickers" | "favorites";
export type ChatStylePreset = "default" | "floating-cute" | "liquid-glass";

/** Owns the Me tab navigation, top-up modal and profile edit draft. */
export function useChatProfileState(settings: UserSettings) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [meActiveSubView, setMeActiveSubView] = useState<ChatProfileSubView>("none");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [editMyName, setEditMyName] = useState(settings.name);
  const [editMySignature, setEditMySignature] = useState(settings.signature);
  const [editMyBio, setEditMyBio] = useState(settings.bio);
  const [editMyAvatar, setEditMyAvatar] = useState(settings.avatar);
  const [editGlobalChatStylePreset, setEditGlobalChatStylePreset] = useState<ChatStylePreset>("default");

  useEffect(() => {
    if (!isEditingProfile) return;
    setEditMyName(settings.name);
    setEditMySignature(settings.signature);
    setEditMyBio(settings.bio);
    setEditMyAvatar(settings.avatar);
    setEditGlobalChatStylePreset(settings.globalChatStylePreset || "default");
  }, [isEditingProfile, settings]);

  return {
    isEditingProfile,
    setIsEditingProfile,
    meActiveSubView,
    setMeActiveSubView,
    showTopUpModal,
    setShowTopUpModal,
    topUpAmount,
    setTopUpAmount,
    editMyName,
    setEditMyName,
    editMySignature,
    setEditMySignature,
    editMyBio,
    setEditMyBio,
    editMyAvatar,
    setEditMyAvatar,
    editGlobalChatStylePreset,
    setEditGlobalChatStylePreset,
  };
}
