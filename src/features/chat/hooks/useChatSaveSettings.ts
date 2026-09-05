import type { Dispatch, SetStateAction } from "react";
import type { Character, Message, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { apiTranslate } from "../../../utils/apiHelper";
import { containsNonChineseText } from "../../../utils/textLanguage";
import { createProactiveOfflinePreferencePatch } from "../../../domain/schedule/proactiveOfflinePreference";

interface UseChatSaveSettingsOptions {
  activeCharacter: Character | undefined;
  activeRelationship: CharacterRelationship | undefined;
  settings: UserSettings;
  messages: readonly Message[];
  onSaveCharacter: (character: Character) => void | Promise<boolean>;
  onUpdateMessage?: (messageId: string, patch: { translation: string }, original: Message) => void;
  updateRelationshipSession: (relationId: string, patch: Partial<CharacterRelationship>) => void;
  scheduleNextProactiveMessage: (character: Character) => number;
  setIsEditingRemark: Dispatch<SetStateAction<boolean>>;
  setAdvancedSettingsSection: Dispatch<SetStateAction<any>>;
  setIsShowingCardModal: Dispatch<SetStateAction<boolean>>;
  draftEnableAutoTranslate: any;
  draftEnableProactiveChat: any;
  draftProactiveStartTime: any;
  draftProactiveEndTime: any;
  draftEnableProactiveOffline: any;
  draftRemark: any;
  draftAvatar: any;
  draftIsPinned: any;
  draftChatBg: any;
  draftCustomCss: any;
  draftChatIcons: any;
  draftChatStylePreset: any;
  draftEnableProactiveCall: any;
  draftProactiveChatInterval: any;
  draftDisableBracketActions: any;
  draftHistoryMemoryLimit: any;
  draftContextMemoryLimit: any;
  draftRetrievalHistoryLimit: any;
  draftArchiveTemplateType: any;
  draftEnableTimeAwareness: any;
  draftMinimaxVoiceId: any;
  draftMosslandVoiceId: any;
  draftMinimaxSpeed: any;
  draftVoiceFrequency: any;
  draftEnableImageGeneration: any;
  draftImageAppearancePrompt: any;
  draftImageNegativePrompt: any;
  draftImageReferenceAssetId: any;
  draftImageReferenceMimeType: any;
}

export function useChatSaveSettings(options: UseChatSaveSettingsOptions) {
  const {
    activeCharacter,
    activeRelationship,
    settings,
    messages,
    onSaveCharacter,
    onUpdateMessage,
    updateRelationshipSession,
    scheduleNextProactiveMessage,
    setIsEditingRemark,
    setAdvancedSettingsSection,
    setIsShowingCardModal,
    ...drafts
  } = options;
  const {
    draftEnableAutoTranslate, draftEnableProactiveChat, draftProactiveStartTime, draftProactiveEndTime,
    draftEnableProactiveOffline, draftRemark, draftAvatar, draftIsPinned, draftChatBg, draftCustomCss,
    draftChatIcons, draftChatStylePreset, draftEnableProactiveCall, draftProactiveChatInterval,
    draftDisableBracketActions, draftHistoryMemoryLimit, draftContextMemoryLimit, draftRetrievalHistoryLimit,
    draftArchiveTemplateType, draftEnableTimeAwareness,
    draftMinimaxVoiceId, draftMosslandVoiceId, draftMinimaxSpeed, draftVoiceFrequency,
    draftEnableImageGeneration, draftImageAppearancePrompt, draftImageNegativePrompt,
    draftImageReferenceAssetId, draftImageReferenceMimeType,
  } = drafts;
  // Save settings draft
  const handleSaveSettings = async (): Promise<boolean> => {
    if (!activeCharacter) return false;

    const isEnablingAutoTranslate = draftEnableAutoTranslate && !activeCharacter.enableAutoTranslate;

    let nextScheduledTime = activeRelationship?.scheduledProactiveTime;
    if (!activeCharacter.isGroupChat && draftEnableProactiveChat && (!activeCharacter.enableProactiveChat || !nextScheduledTime)) {
      const draftFriend: Character = {
        ...activeCharacter,
        proactiveStartTime: draftProactiveStartTime,
        proactiveEndTime: draftProactiveEndTime,
        enableProactiveChat: draftEnableProactiveChat,
      };
      nextScheduledTime = scheduleNextProactiveMessage(draftFriend);
    } else if (!draftEnableProactiveChat && !activeCharacter.isGroupChat) {
      nextScheduledTime = undefined;
    }

    if (activeRelationship) {
      updateRelationshipSession(activeRelationship.id, {
        scheduledProactiveTime: nextScheduledTime,
        ...createProactiveOfflinePreferencePatch(draftEnableProactiveOffline),
      });
    }

    const persisted = await onSaveCharacter({
      ...activeCharacter,
      name: activeCharacter.isGroupChat ? (draftRemark.trim() || activeCharacter.name) : activeCharacter.name,
      remark: activeCharacter.isGroupChat ? undefined : (draftRemark.trim() || undefined),
      avatar: activeCharacter.isGroupChat ? (draftAvatar || activeCharacter.avatar) : activeCharacter.avatar,
      isPinned: draftIsPinned,
      chatBg: draftChatBg,
      customCss: draftCustomCss,
      customChatCSS: draftCustomCss,
      customChatIcons: draftChatIcons,
      chatStylePreset: draftChatStylePreset,
      ...(activeCharacter.isGroupChat ? {} : {
        enableProactiveChat: draftEnableProactiveChat,
        enableProactiveCall: draftEnableProactiveCall,
        proactiveChatInterval: draftProactiveChatInterval,
        proactiveStartTime: draftProactiveStartTime,
        proactiveEndTime: draftProactiveEndTime,
      }),
      disableBracketActions: draftDisableBracketActions,
      historyMemoryLimit: draftHistoryMemoryLimit,
      contextMemoryLimit: draftContextMemoryLimit,
      retrievalHistoryLimit: draftRetrievalHistoryLimit,
      archiveTemplateType: draftArchiveTemplateType,
      enableTimeAwareness: draftEnableTimeAwareness,
      enableAutoTranslate: draftEnableAutoTranslate,
      minimaxVoiceId: draftMinimaxVoiceId.trim() || undefined,
      mosslandVoiceId: draftMosslandVoiceId.trim() || undefined,
      minimaxSpeed: draftMinimaxSpeed,
      voiceFrequency: draftVoiceFrequency,
      enableImageGeneration: draftEnableImageGeneration,
      imageAppearancePrompt: draftImageAppearancePrompt.trim() || undefined,
      imageNegativePrompt: draftImageNegativePrompt.trim() || undefined,
      imageReferenceAssetId: draftImageReferenceAssetId,
      imageReferenceMimeType: draftImageReferenceMimeType,
      imageReferenceUpdatedAt: draftImageReferenceAssetId ? Date.now() : undefined,
    });
    if (persisted === false) return false;

    // Automatically translate existing non-Chinese messages in current chat
    if (isEnablingAutoTranslate && onUpdateMessage) {
      const currentChatMessages = messages.filter(
        (m) => (activeRelationship ? m.relationId === activeRelationship.id : m.characterId === activeCharacter.id && activeCharacter.isGroupChat)
          && m.sender === "character" && !m.isNarration && !m.translation
      );

      currentChatMessages.forEach((msg) => {
        if (containsNonChineseText(msg.content)) {
          apiTranslate({
            text: msg.content,
            apiKey: settings.apiKey || "",
            model: settings.selectedModel,
            apiEndpoint: settings.apiEndpoint,
          })
            .then((res) => {
              if (res && res.text && res.text !== msg.content) {
                onUpdateMessage(msg.id, { translation: res.text }, msg);
              }
            })
            .catch((err) => {
              console.error("Batch auto-translation error:", err);
            });
        }
      });
    }

    setIsEditingRemark(false);
    setAdvancedSettingsSection(null);
    setIsShowingCardModal(false);
    return true;
  };


  return { handleSaveSettings };
}
