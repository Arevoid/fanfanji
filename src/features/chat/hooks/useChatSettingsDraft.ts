import { useState } from "react";
import { sanitizeChatIcons, type Character, type ChatIconOverrides } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { isProactiveOfflineEnabled } from "../../../domain/schedule/proactiveOfflinePreference";

export function useChatSettingsDraft() {
  const [draftRemark, setDraftRemark] = useState("");
  const [isEditingRemark, setIsEditingRemark] = useState(false);
  const [draftAvatar, setDraftAvatar] = useState<string | undefined>();
  const [isDeleteMemberMode, setIsDeleteMemberMode] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<string[]>([]);
  const [draftIsPinned, setDraftIsPinned] = useState(false);
  const [draftChatBg, setDraftChatBg] = useState<string | undefined>();
  const [draftCustomCss, setDraftCustomCss] = useState("");
  const [draftChatIcons, setDraftChatIcons] = useState<ChatIconOverrides>({});
  const [draftChatStylePreset, setDraftChatStylePreset] = useState<"default" | "floating-cute" | "liquid-glass">("default");
  const [draftEnableProactiveChat, setDraftEnableProactiveChat] = useState(false);
  const [draftEnableProactiveOffline, setDraftEnableProactiveOffline] = useState(false);
  const [draftEnableProactiveCall, setDraftEnableProactiveCall] = useState(false);
  const [draftProactiveChatInterval, setDraftProactiveChatInterval] = useState(3);
  const [draftProactiveStartTime, setDraftProactiveStartTime] = useState("09:00");
  const [draftProactiveEndTime, setDraftProactiveEndTime] = useState("22:00");
  const [draftDisableBracketActions, setDraftDisableBracketActions] = useState(false);
  const [draftHistoryMemoryLimit, setDraftHistoryMemoryLimit] = useState(150);
  const [draftContextMemoryLimit, setDraftContextMemoryLimit] = useState(20);
  const [draftRetrievalHistoryLimit, setDraftRetrievalHistoryLimit] = useState(100);
  const [draftArchiveTemplateType, setDraftArchiveTemplateType] = useState<"refined" | "delicate">("refined");
  const [draftAutoArchiveInterval, setDraftAutoArchiveInterval] = useState(50);
  const [draftEnableAutoArchive, setDraftEnableAutoArchive] = useState(false);
  const [draftEnableTimeAwareness, setDraftEnableTimeAwareness] = useState(false);
  const [draftEnableAutoTranslate, setDraftEnableAutoTranslate] = useState(false);
  const [draftMinimaxVoiceId, setDraftMinimaxVoiceId] = useState("");
  const [draftMosslandVoiceId, setDraftMosslandVoiceId] = useState("");
  const [draftMinimaxSpeed, setDraftMinimaxSpeed] = useState(1);
  const [draftVoiceFrequency, setDraftVoiceFrequency] = useState<"low" | "medium" | "high" | "none">("low");
  const [draftEnableImageGeneration, setDraftEnableImageGeneration] = useState(false);
  const [draftImageAppearancePrompt, setDraftImageAppearancePrompt] = useState("");
  const [draftImageNegativePrompt, setDraftImageNegativePrompt] = useState("");
  const [draftImageReferenceAssetId, setDraftImageReferenceAssetId] = useState<string | undefined>();
  const [draftImageReferenceMimeType, setDraftImageReferenceMimeType] = useState<string | undefined>();

  const loadCharacterDraft = (character: Character, relationship?: CharacterRelationship) => {
    setDraftRemark(character.isGroupChat ? character.name : (character.remark || ""));
    setIsEditingRemark(false);
    setDraftAvatar(character.avatar);
    setIsDeleteMemberMode(false);
    setDraftIsPinned(character.isPinned || false);
    setDraftChatBg(character.chatBg);
    setDraftCustomCss(character.customChatCSS || character.customCss || "");
    setDraftChatIcons(sanitizeChatIcons(character.customChatIcons));
    setDraftChatStylePreset(character.chatStylePreset || "default");
    setDraftEnableProactiveChat(character.enableProactiveChat || false);
    setDraftEnableProactiveOffline(isProactiveOfflineEnabled(relationship));
    setDraftEnableProactiveCall(character.enableProactiveCall || false);
    setDraftProactiveChatInterval(character.proactiveChatInterval || 3);
    setDraftProactiveStartTime(character.proactiveStartTime || "09:00");
    setDraftProactiveEndTime(character.proactiveEndTime || "22:00");
    setDraftDisableBracketActions(character.disableBracketActions || false);
    setDraftHistoryMemoryLimit(character.historyMemoryLimit || 150);
    setDraftContextMemoryLimit(character.contextMemoryLimit || 20);
    setDraftRetrievalHistoryLimit(character.retrievalHistoryLimit || 100);
    setDraftArchiveTemplateType(character.archiveTemplateType || "refined");
    setDraftAutoArchiveInterval(character.autoArchiveInterval || 50);
    setDraftEnableAutoArchive(character.enableAutoArchive !== undefined ? character.enableAutoArchive : (character.enableAutoSummary || false));
    setDraftEnableTimeAwareness(character.enableTimeAwareness || false);
    setDraftEnableAutoTranslate(character.enableAutoTranslate || false);
    setDraftMinimaxVoiceId(character.minimaxVoiceId || "");
    setDraftMosslandVoiceId(character.mosslandVoiceId || "");
    setDraftMinimaxSpeed(character.minimaxSpeed !== undefined ? character.minimaxSpeed : 1);
    setDraftVoiceFrequency(character.voiceFrequency || "low");
    setDraftEnableImageGeneration(character.enableImageGeneration === true);
    setDraftImageAppearancePrompt(character.imageAppearancePrompt || "");
    setDraftImageNegativePrompt(character.imageNegativePrompt || "");
    setDraftImageReferenceAssetId(character.imageReferenceAssetId);
    setDraftImageReferenceMimeType(character.imageReferenceMimeType);
  };

  return {
    draftRemark, setDraftRemark, isEditingRemark, setIsEditingRemark, draftAvatar, setDraftAvatar,
    isDeleteMemberMode, setIsDeleteMemberMode, showAddMemberModal, setShowAddMemberModal,
    selectedAddMemberIds, setSelectedAddMemberIds, draftIsPinned, setDraftIsPinned,
    draftChatBg, setDraftChatBg, draftCustomCss, setDraftCustomCss,
    draftChatIcons, setDraftChatIcons, draftChatStylePreset, setDraftChatStylePreset,
    draftEnableProactiveChat, setDraftEnableProactiveChat, draftEnableProactiveOffline, setDraftEnableProactiveOffline,
    draftEnableProactiveCall, setDraftEnableProactiveCall,
    draftProactiveChatInterval, setDraftProactiveChatInterval, draftProactiveStartTime, setDraftProactiveStartTime,
    draftProactiveEndTime, setDraftProactiveEndTime, draftDisableBracketActions, setDraftDisableBracketActions,
    draftHistoryMemoryLimit, setDraftHistoryMemoryLimit, draftContextMemoryLimit, setDraftContextMemoryLimit,
    draftRetrievalHistoryLimit, setDraftRetrievalHistoryLimit, draftArchiveTemplateType, setDraftArchiveTemplateType,
    draftAutoArchiveInterval, setDraftAutoArchiveInterval, draftEnableAutoArchive, setDraftEnableAutoArchive,
    draftEnableTimeAwareness, setDraftEnableTimeAwareness, draftEnableAutoTranslate, setDraftEnableAutoTranslate,
    draftMinimaxVoiceId, setDraftMinimaxVoiceId, draftMosslandVoiceId, setDraftMosslandVoiceId,
    draftMinimaxSpeed, setDraftMinimaxSpeed,
    draftVoiceFrequency, setDraftVoiceFrequency, draftEnableImageGeneration, setDraftEnableImageGeneration,
    draftImageAppearancePrompt, setDraftImageAppearancePrompt, draftImageNegativePrompt, setDraftImageNegativePrompt,
    draftImageReferenceAssetId, setDraftImageReferenceAssetId, draftImageReferenceMimeType, setDraftImageReferenceMimeType,
    loadCharacterDraft,
  };
}
