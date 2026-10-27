import {resolveCharacterApiSettings} from "../../../domain/character/characterApiSettings";
import type { Dispatch, SetStateAction } from "react";
import type { Character, Message, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { apiTranslate } from "../../../utils/apiHelper";
import { containsNonChineseText } from "../../../utils/textLanguage";
import { createProactiveOfflinePreferencePatch } from "../../../domain/schedule/proactiveOfflinePreference";
import { sanitizeCharacterActionText } from "../services/characterActionProtocol";
import { getVoiceMessagePreview, isVoiceMessageContent } from "../services/voiceMessageContent";
import { isCallRecordMarkup } from "../services/messageParser";

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
  draftCharacterApi?: Character["characterApi"];
  draftEnableAutoTranslate: any;
  draftEnableProactiveChat: any;
  draftProactiveStartTime: any;
  draftProactiveEndTime: any;
  draftEnableProactiveOffline: any;
  draftRemark: any;
  draftAvatar: any;
  draftIsPinned: any;
  draftGroupMemorySyncEnabled: any;
  draftChatBg: any;
  draftCustomCss: any;
  draftChatIcons: any;
  draftChatStylePreset: any;
  draftEnableProactiveCall: any;
  draftEnableStickerAssociation: any;
  draftEnableMomentGeneration?: boolean;
  draftProactiveChatInterval: any;
  draftDisableBracketActions: any;
  draftHistoryMemoryLimit: any;
  draftChatHistoryPageSize?: number;
  draftContextMemoryLimit: any;
  draftRetrievalHistoryLimit: any;
  draftArchiveTemplateType: any;
  draftEnableTimeAwareness: any;
  draftMinimaxVoiceId: any;
  draftMosslandVoiceId: any;
  draftElevenlabsVoiceId: any;
  draftMinimaxSpeed: any;
  draftVoiceFrequency: any;
  draftEnableImageGeneration: any;
  draftEnableProactiveImageGeneration: any;
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
    draftCharacterApi,draftEnableAutoTranslate, draftEnableProactiveChat, draftProactiveStartTime, draftProactiveEndTime,
    draftEnableProactiveOffline, draftRemark, draftAvatar, draftIsPinned, draftGroupMemorySyncEnabled, draftChatBg, draftCustomCss,
    draftChatIcons, draftChatStylePreset, draftEnableProactiveCall, draftEnableStickerAssociation, draftEnableMomentGeneration, draftProactiveChatInterval,
    draftDisableBracketActions, draftHistoryMemoryLimit, draftChatHistoryPageSize, draftContextMemoryLimit, draftRetrievalHistoryLimit,
    draftArchiveTemplateType, draftEnableTimeAwareness,
    draftMinimaxVoiceId, draftMosslandVoiceId, draftElevenlabsVoiceId, draftMinimaxSpeed, draftVoiceFrequency,
    draftEnableImageGeneration, draftEnableProactiveImageGeneration, draftImageAppearancePrompt, draftImageNegativePrompt,
    draftImageReferenceAssetId, draftImageReferenceMimeType,
  } = drafts;
  // Save settings draft
  const handleSaveSettings = async (): Promise<boolean> => {
    if (!activeCharacter) return false;
    let resolvedApi:UserSettings;
    try{resolvedApi=resolveCharacterApiSettings(settings,{...activeCharacter,characterApi:draftCharacterApi});}catch(error){if(typeof alert!=="undefined")alert(error instanceof Error?error.message:"API configuration invalid");return false;}

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
      ...(draftCharacterApi!==undefined?{characterApi:draftCharacterApi}:{}),
      name: activeCharacter.isGroupChat ? (draftRemark.trim() || activeCharacter.name) : activeCharacter.name,
      remark: activeCharacter.isGroupChat ? undefined : (draftRemark.trim() || undefined),
      // The avatar draft belongs to every character profile, not only group
      // chats. The old branch silently discarded direct-chat avatar edits.
      avatar: draftAvatar || activeCharacter.avatar,
      isPinned: draftIsPinned,
      ...(activeCharacter.isGroupChat ? { groupMemorySyncEnabled: draftGroupMemorySyncEnabled === true } : {}),
      chatBg: draftChatBg,
      customCss: draftCustomCss,
      customChatCSS: draftCustomCss,
      customChatIcons: draftChatIcons,
      chatStylePreset: draftChatStylePreset,
      ...(activeCharacter.isGroupChat ? {} : {
        enableProactiveChat: draftEnableProactiveChat,
        enableProactiveCall: draftEnableProactiveCall,
        enableStickerAssociation: draftEnableStickerAssociation,
        enableMomentGeneration: draftEnableMomentGeneration !== false,
        proactiveChatInterval: draftProactiveChatInterval,
        proactiveStartTime: draftProactiveStartTime,
        proactiveEndTime: draftProactiveEndTime,
      }),
      disableBracketActions: draftDisableBracketActions,
      historyMemoryLimit: draftHistoryMemoryLimit,
      chatHistoryPageSize: [20, 50, 100].includes(draftChatHistoryPageSize || 0) ? draftChatHistoryPageSize : 50,
      contextMemoryLimit: draftContextMemoryLimit,
      retrievalHistoryLimit: draftRetrievalHistoryLimit,
      archiveTemplateType: draftArchiveTemplateType,
      enableTimeAwareness: draftEnableTimeAwareness,
      enableAutoTranslate: draftEnableAutoTranslate,
      minimaxVoiceId: draftMinimaxVoiceId.trim() || undefined,
      mosslandVoiceId: draftMosslandVoiceId.trim() || undefined,
      elevenlabsVoiceId: draftElevenlabsVoiceId.trim() || undefined,
      minimaxSpeed: draftMinimaxSpeed,
      voiceFrequency: draftVoiceFrequency,
      enableImageGeneration: draftEnableImageGeneration,
      enableProactiveImageGeneration: draftEnableProactiveImageGeneration,
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
        (m) => (activeRelationship ? m.relationId === activeRelationship.id : m.characterId === activeCharacter.id)
          && m.sender === "character" && !m.isNarration && !m.translation
      );

      currentChatMessages.forEach((msg) => {
        // Call records already persist per-line translations inside their
        // encoded transcript. Do not send the record wrapper/JSON to the
        // translator as if it were user-visible prose.
        if (isCallRecordMarkup(msg.content)) return;
        const sourceText = isVoiceMessageContent(msg.content, msg.isVoiceMessage === true, Boolean(msg.audioUrl))
          ? getVoiceMessagePreview(msg.content, msg.audioDuration).transcript
          : msg.content;
        if (containsNonChineseText(sourceText)) {
          apiTranslate({
            text: sanitizeCharacterActionText(sourceText),
            apiKey: resolvedApi.apiKey || "",
            model: resolvedApi.selectedModel,
            apiEndpoint: resolvedApi.apiEndpoint,
          })
            .then((res) => {
              const translatedText = sanitizeCharacterActionText(res?.text || "");
              if (translatedText && translatedText !== sourceText) {
                onUpdateMessage(msg.id, { translation: translatedText }, msg);
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
