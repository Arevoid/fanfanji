import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { apiChat, apiExtractMemoriesWithModelFallback, apiTranslate } from "../utils/apiHelper";
import { readJson, readString, remove as removeStoredValue, writeJson, writeString } from "../core/storage/storageAdapter";
import { readArray } from "../core/storage/repositories/repositoryUtils";
import { createId } from "../core/id/createId";
import { getLatestWorldBookEntries, getVisibleWorldBookEntries, buildWorldBookSystemBlocks } from "../utils/worldBook";
import { Character, Message, Moment, RedPacketPayload, UserSettings, MomentComment, WorldBookEntry, MemoryItem, MemoryVaultSettings, OfflineStory, Sticker, StickerGroup, sanitizeChatIcons, type ChatIconKey, type MusicTrack, type IdentityMusicState, type RelationshipMusicState } from "../types";
import { createProactiveOfflinePreferencePatch } from "../domain/schedule/proactiveOfflinePreference";
import { evaluateProactiveOfflineEligibility } from "../domain/schedule/proactiveOfflineEligibility";
import { createProactiveAppointment } from "../domain/schedule/proactiveAppointmentFactory";
import type { Appointment, AppointmentMode } from "../domain/schedule/scheduleTypes";
import { getCurrentAppointmentProposal } from "../domain/schedule/appointmentPolicy";
import { startAppointmentOfflineSession } from "../domain/schedule/appointmentOfflineHandoff";
import { compressImage } from "../utils/pngParser";
import { containsNonChineseText } from "../utils/textLanguage";
import { cleanAiReplyText as cleanOnlineMessage, createTextImageMarkup, getCallTranscriptText, isCallRecordMarkup, isRedPacketMarkup, isTransferMarkup, normalizePaymentMarkup, parseCallRecord, parseRedPacketClaimNotice, parseTextImageDescription, stripInternalDeliveryMarkers } from "../features/chat/services/messageParser";
import { createCharacterTextMessage, createGroupCharacterMessage, createUserTextMessage } from "../features/chat/services/messageFactory";
import { createDirectReplyCandidates } from "../features/chat/services/directChatService";
import { runGroupChatReplyPipeline } from "../features/chat/services/groupChatReplyPipeline";
import { scheduleGroupReplyDelivery } from "../features/chat/services/groupReplyDelivery";
import { mayCharacterUseEmoji } from "../features/chat/services/characterEmojiPolicy";
import { createVoiceCallRecordMessage, isCurrentVoiceCallScope, resolveDirectVoiceCallScope } from "../features/chat/services/voiceCallScope";
import { createVoiceCallUserMessage } from "../features/chat/services/voiceCallMessage";
import { createChatMessageDeliveryHandler } from "../features/chat/services/chatMessageDelivery";
import { completeVoiceCall } from "../features/chat/services/voiceCallCompletion";
import { buildDirectChatHistoryContext } from "../features/chat/services/directChatHistoryContext";
import { useProactiveCallScheduler } from "../features/chat/hooks/useProactiveCallScheduler";
import { useChatPaymentState } from "../features/chat/hooks/useChatPaymentState";
import { useChatProfileState } from "../features/chat/hooks/useChatProfileState";
import { useChatGroupState } from "../features/chat/hooks/useChatGroupState";
import type { VoiceCallStatus } from "../features/chat/services/messageTypes";
import { shouldConvertBubbleToVoice } from "../features/chat/services/voiceBubbleEligibility";
import { RED_PACKET_STATUSES_KEY, getPaymentStatusKey, parseRedPacketPayload, removePaymentStatusesByRelation } from "../features/chat/services/paymentScope";
import { getWorldBookLocationReferences } from "../domain/worldbook/locationReferences";
import { isWorldBookEntryForAnyCharacter } from "../domain/worldbook/worldBookVisibility";
import { aiAnalyzeRemoteSticker, aiAnalyzeSticker, loadStickerImageBlob, stickerDb } from "../utils/stickerDb";
import { LIVING_HUMAN_PROMPT, MOMENT_CHARACTER_EXPRESSION_PROMPT } from "../utils/livingPrompt";
import { MemoryService, formatDelicateMemoryDiary, formatExtractedMemorySummary, formatMemoriesForPrompt } from "../domain/memory/MemoryService";
import { hasOfflineStorySummary, isOfflineStoryHandoffMemory, recordOfflineHandoffDelivery, selectFreshOfflineHandoffMemory } from "../domain/memory/offlineMemorySync";
import { PromptComposer } from "../domain/prompt/PromptComposer";
import { CHARACTER_LANGUAGE_POLICY, projectCharacterPrompt } from "../domain/prompt/characterPromptProjector";
import { buildCharacterBehaviorPrompt } from "../domain/prompt/characterBehaviorProfile";
import { formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage } from "../domain/prompt/characterLanguage";
import { CHARACTER_MEDIA_USAGE_RULES, DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, DIRECT_CHAT_SINGLE_SPEAKER_RULE, WORLD_BOOK_CONTEXT_PRIORITY } from "../features/chat/prompts/chatPromptPolicy";
import { buildCrossDayHistoricalReferencePrompt, buildDirectChatMainPrompt, buildRedPacketReactionPrompt, buildStickerResponsePrompt, buildTimeAwarenessPrompt, buildVoiceCallPrompts, buildVoiceIntervalPrompt, CHINESE_SEMANTIC_CONTINUITY_PROMPT, CURRENT_SCENE_CONTINUITY_PROMPT, detectCallTopicShift, NEW_DAY_CONVERSATION_BOUNDARY_PROMPT, partitionDirectChatHistoryByCurrentDay, shouldUseCrossDayHistoryBoundary } from "../features/chat/prompts/directChatTurnPrompt";
import { loadUserMemoPromptContext, USER_MEMO_MENTION_LEDGER_KEY } from "../features/chat/prompts/userMemoContext";
import { serializeMessageContentForPrompt, serializeMessageToPromptTurns } from "../features/chat/prompts/messagePromptSerializer";
import { getOfflineStoriesContextForOnlineChat } from "../features/chat/prompts/onlineOfflineBoundary";
import { buildOfflineMemberKnowledgeSnapshots } from "../features/offline/services/offlineMemberMemorySnapshot";
import { buildOfflineHandoffFacts, OFFLINE_HANDOFF_MESSAGE_LIMIT } from "../domain/offlineStory/offlineHandoffContext";
import { formatStructuralWorldBookSection } from "../features/chat/prompts/chatWorldBookPromptSections";
import { buildProactiveChatSystemInstruction, finalizeCharacterChatSystemInstruction } from "../features/chat/prompts/chatPromptBuilders";
import { buildProactiveOfflineInvitationPrompt } from "../features/chat/prompts/proactiveOfflineInvitationPrompt";
import { buildProactiveOfflineResponsePrompt } from "../features/chat/prompts/proactiveOfflineResponsePrompt";
import { parseProactiveOfflineInvitationDirective } from "../features/chat/services/proactiveOfflineInvitationProtocol";
import { applyProactiveOfflineResponse, parseProactiveOfflineResponseDirective } from "../features/chat/services/proactiveOfflineResponseProtocol";
import { deriveProactiveOfflineContextEvidence, deriveProactiveOfflinePresenceEvidence } from "../features/chat/services/proactiveOfflineContext";
import { formatLocalTimeContext } from "../domain/prompt/timeContext";
import { describeHistoricalRelativeTime, formatHistoricalMessageForPrompt } from "../domain/prompt/historyTimeContext";
import { analyzeRecentConversation, formatProactiveConversationGuidance } from "../domain/prompt/proactiveConversationContext";
import { formatCharacterKnowledgeBoundary, formatOnlineChatSpatialBoundary } from "../domain/prompt/characterKnowledgeBoundary";
import { formatUserKnowledgeBoundary } from "../domain/prompt/userKnowledgeBoundary";
import { buildCharacterCognitiveContext } from "../domain/characterCognitive/contextBuilder";
import { createDirectChatKnowledgeBoundary } from "../domain/characterCognitive/contextPolicy";
import type { CharacterCognitiveContext, CharacterCognitiveEventCandidate } from "../domain/characterCognitive/characterCognitiveTypes";
import { buildChatPromptContext, formatChatPromptContext } from "../features/characterCognitive/promptAdapters/chatPromptAdapter";
import { buildRelationMusicContext } from "../domain/prompt/musicContext";
import { buildRelationForumContext } from "../domain/prompt/forumContext";
import { buildRelationDiaryContext } from "../domain/prompt/diaryContext";
import { getAvailableCanonicalCharacterIds } from "../domain/character/characterIdentity";
import { resolveCanonicalCharacterId } from "../domain/character/characterIdentity";
import { createRelationship, findRelationship, findRelationshipForCanonicalCharacter, getConversationId, getOfflineModeStorageKey, getOfflineStoryStorageKey, type CharacterRelationship } from "../domain/relationship/characterRelationship";
import { findInnerVoiceByMessage, loadInnerVoiceRecords, removeInnerVoicesByRelation, saveInnerVoiceRecords } from "../core/storage/repositories/innerVoiceRepository";
import { createInlineInnerVoiceRecord } from "../features/chat/services/innerVoiceService";
import { INLINE_INNER_VOICE_INSTRUCTION } from "../features/chat/services/chatTurnResponseProtocol";
import { generateCharacterImageForDelivery } from "../features/chat/services/characterImageDeliveryService";
import { createChatReplyController } from "../features/chat/controllers/chatReplyController";
import { generateGroupChatTurn, generateProactiveChatTurn, generateRegeneratedChatTurn, requestDirectChatTurn } from "../features/chat/controllers/chatGenerationController";
import { resolveChatRoutine, resolveChatTurnSettings } from "../features/chat/services/chatTurnSettings";
import { createChatSideEffectController, touchRelationshipSession } from "../features/chat/controllers/chatSideEffectController";
import { useChatController } from "../features/chat/hooks/useChatController";
import { useChatSettingsDraft } from "../features/chat/hooks/useChatSettingsDraft";
import { useChatAttachmentState } from "../features/chat/hooks/useChatAttachmentState";
import { useInnerVoice } from "../features/chat/hooks/useInnerVoice";
import { useChatAppointment } from "../features/chat/hooks/useChatAppointment";
import { useChatStickerState } from "../features/chat/hooks/useChatStickerState";
import { useChatNavigationState } from "../features/chat/hooks/useChatNavigationState";
import { useChatSettingsPanelState } from "../features/chat/hooks/useChatSettingsPanelState";
import { useChatMessageInteractionState } from "../features/chat/hooks/useChatMessageInteractionState";
import { useChatMomentsInteractionState } from "../features/chat/hooks/useChatMomentsInteractionState";
import { useChatVoiceMessageState } from "../features/chat/hooks/useChatVoiceMessageState";
import { useChatTtsPlaybackState } from "../features/chat/hooks/useChatTtsPlaybackState";
import { useChatCallSpeechPlayback } from "../features/chat/hooks/useChatCallSpeechPlayback";
import { useChatTypingState } from "../features/chat/hooks/useChatTypingState";
import { useChatTransientUiState } from "../features/chat/hooks/useChatTransientUiState";
import { useChatOperationState } from "../features/chat/hooks/useChatOperationState";
import { getChatTypingScopeKey } from "../features/chat/services/chatTypingScope";
import { useChatReadState } from "../features/chat/hooks/useChatReadState";
import { useChatMessageProjection } from "../features/chat/hooks/useChatMessageProjection";
import { useChatMessageCleanupActions } from "../features/chat/hooks/useChatMessageCleanupActions";
import { useChatRelationshipCleanupActions } from "../features/chat/hooks/useChatRelationshipCleanupActions";
import { useChatDeleteFriendAction } from "../features/chat/hooks/useChatDeleteFriendAction";
import { useChatMomentActions } from "../features/chat/hooks/useChatMomentActions";
import { useChatGroupMemberActions } from "../features/chat/hooks/useChatGroupMemberActions";
import { useChatStartOfflineFromMessage } from "../features/chat/hooks/useChatStartOfflineFromMessage";
import { useChatMessageTranslation } from "../features/chat/hooks/useChatMessageTranslation";
import { useChatBackgroundDraftUpload } from "../features/chat/hooks/useChatBackgroundDraftUpload";
import { useChatSaveSettings } from "../features/chat/hooks/useChatSaveSettings";
import { scheduleNextProactiveMessage } from "../features/chat/services/proactiveScheduleService";
import { useChatGreeting } from "../features/chat/hooks/useChatGreeting";
import { estimateChatTokens } from "../features/chat/services/chatTokenEstimate";
import { recoverPendingOfflineHandoff } from "../features/chat/services/offlineHandoffRecoveryService";
import { runBackgroundProactivePass, runProactiveCatchupPass } from "../features/chat/services/proactiveChatPassService";
import { useChatMemoryExtraction } from "../features/chat/hooks/useChatMemoryExtraction";
import { useChatDraftChatIcon } from "../features/chat/hooks/useChatDraftChatIcon";
import { useChatRegenerationAction } from "../features/chat/hooks/useChatRegenerationAction";
import { useVoiceCallTimers } from "../features/chat/hooks/useVoiceCallTimers";
import { resolveActiveChatStylePreset } from "../features/chat/styles/chatStylePreset";
import { CLASSIC_BUBBLE_OPACITY, CLASSIC_OTHER_BUBBLE_BACKGROUND, CLASSIC_OTHER_BUBBLE_TEXT, CLASSIC_SELF_BUBBLE_BACKGROUND, CLASSIC_SELF_BUBBLE_TEXT } from "../features/chat/styles/chatBubbleDefaults";
import { COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE } from "../features/chat/styles/chatThemeTemplate";
import { ChatSettingsSwitch as SettingsSwitch } from "../features/chat/components/ChatSettingsSwitch";
import { ChatAvatar as RenderAvatar } from "../features/chat/components/ChatAvatar";
import { StoredChatImage } from "../features/chat/components/StoredChatImage";
import { createChatRuntimeContext, type ChatRuntimeContext } from "../features/chat/context/chatRuntimeContext";
import { isMessageInDirectScope, resolveDirectInteractionScope, toDirectChatRuntimeContext, type MessageMutationScope } from "../features/chat/context/directInteractionScope";
import { captureRelationshipCreatedEvent, removeCharacterLifeEventsForRelations } from "../features/characterLife/services/characterEventCaptureService";
import { removeCharacterTruthForRelations } from "../features/characterKnowledge/services/characterTruthCleanupService";
import { listByRelation as listCharacterEventsByRelation } from "../core/storage/repositories/characterEventRepository";
import { append as appendKnowledgeClaim, appendMany as appendKnowledgeClaims } from "../core/storage/repositories/characterKnowledgeRepository";
import { loadKnowledgeClaims } from "../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries, saveConversationSummaries } from "../core/storage/repositories/conversationSummaryRepository";
import { loadBehaviorCorrections } from "../core/storage/repositories/behaviorCorrectionRepository";
import { behaviorCorrectionRepository } from "../core/storage/repositories/behaviorCorrectionRepository";
import { formatTruthRetrievalForPrompt, retrieveTruthForPrivatePrompt } from "../features/characterKnowledge/services/truthRetrievalService";
import { createConversationSummaryRecord } from "../features/characterKnowledge/services/conversationSummaryService";
import { createDeterministicArtifactClaim } from "../features/characterKnowledge/services/deterministicKnowledgeCapture";
import { buildRelationshipCognitiveProjection } from "../features/characterLife/services/relationshipCognitiveProjectionService";
import { buildCharacterRoutine } from "../domain/characterLife/characterRoutine/characterRoutineBuilder";
import { createMomentTopicRecord } from "../domain/moments/momentGeneration/momentTopicHistory";
import { createProactiveTopicRecord } from "../domain/characterLife/proactive/proactiveTopicHistory";
import { appendMomentTopicRecord, loadMomentTopicRecords } from "../core/storage/repositories/momentTopicRepository";
import { appendProactiveTopicRecord, loadProactiveTopicRecords, removeProactiveTopicsForRelations } from "../core/storage/repositories/proactiveTopicRepository";
import { imageAssetDb } from "../utils/imageAssetDb";
import { loadImageGenerationRecords, removeImageGenerationRecordsByRelation, saveImageGenerationRecords } from "../core/storage/repositories/imageGenerationRepository";
import { commitForumMutation, loadForumActivityTasks, loadForumActorStates, loadForumGenerationTasks, loadForumReplies, loadForumShares, loadForumThreads } from "../core/storage/repositories/forumRepository";
import { removeForumSharesByRelation, unlinkForumPrivateAuthorByRelation } from "../domain/forum/forumShare";
import { removeForumGenerationTasksByRelation } from "../domain/forum/forumGenerationGuard";
import { loadDiaryEntries, loadDiaryGenerationTasks, loadDiaryShares, loadDiaryTranslations, saveDiaryEntries, saveDiaryGenerationTasks, saveDiaryShares, saveDiaryTranslations } from "../core/storage/repositories/diaryRepository";
import { cleanupDiaryForRelations } from "../domain/diary/diaryCleanup";
import { useProactiveChatScheduler } from "../features/chat/hooks/useProactiveChatScheduler";
import { Button, Card, Modal } from "./ui";
import StickerSettings from "./StickerSettings";
import ChatIcon from "./ChatIcon";
import { ForumShareCard } from "../features/forum/components/ForumShareCard";
import { ChatTopBar } from "../features/chat/components/ChatTopBar";
import { InnerVoiceModal } from "../features/chat/components/InnerVoiceModal";
import { ContactList } from "../features/chat/components/ContactList";
import { ConversationList } from "../features/chat/components/ConversationList";
import { MessageList } from "../features/chat/components/MessageList";
import { parseQuoteReply, QuotedMessagePreview } from "../features/chat/components/QuotedMessagePreview";
import { AttachmentMenu } from "../features/chat/components/AttachmentMenu";
import { ChatComposer, ChatInputBar } from "../features/chat/components/ChatComposer";
import { BubbleTipPortalLayer } from "../features/chat/components/BubbleTipPortalLayer";
import {
  VISUAL_VIEWPORT_CHANGE_EVENT,
  type VisualViewportMetrics,
} from "../features/viewport/visualViewport";
import { scrollContainerToBottom } from "../features/viewport/scrollContainer";
import { RedPacketCard } from "../features/chat/components/SpecialMessage/RedPacketCard";
import { TransferCard } from "../features/chat/components/SpecialMessage/TransferCard";
import { LocationCard } from "../features/chat/components/SpecialMessage/LocationCard";
import { MomentsApp } from "../features/moments/MomentsApp";
import { calculateCharacterMomentOccurredAt, requestCharacterMomentOnce } from "../features/moments/services/momentGenerator";
import { requestAutomaticMomentComment } from "../features/moments/services/momentCommentService";
import { requestMomentCommentReply } from "../features/moments/services/momentReplyService";
import { buildRelationMomentContext, formatMomentSourceText } from "../features/moments/services/momentRelationContext";
import { generateCharacterMomentPipeline } from "../features/moments/services/characterMomentGenerationPipeline";
import { generateAutomaticMomentComment } from "../features/moments/services/automaticMomentCommentPipeline";
import { generateAutomaticMomentReply } from "../features/moments/services/automaticMomentReplyPipeline";
import { analyzeMomentPhoto } from "../features/moments/services/momentPhotoAnalysisService";
import { deliverDirectReplyCandidates } from "../features/chat/services/directReplyDeliveryService";
import { buildProactiveCognitiveContext } from "../features/chat/services/proactiveCognitiveContext";
import { useChatCustomCss } from "../features/chat/hooks/useChatCustomCss";
import { useChatCssTemplateCopy } from "../features/chat/hooks/useChatCssTemplateCopy";
import {
  buildOfflineTimelineHandoff as buildOfflineTimelineHandoffPrompt,
  buildPendingOfflineTimelineHandoff as buildPendingOfflineTimelineHandoffPrompt,
  getInterveningOfflineHandoff as getInterveningOfflineHandoffFromContext,
  getOfflineTimelineStoriesBetween as getOfflineTimelineStoriesBetweenFromContext,
} from "../features/chat/services/offlineHandoffPromptContext";
import {
  LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
  LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
  LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS,
  LIQUID_GLASS_DEFAULT_TEXT_COLOR,
} from "../features/chat/styles/liquidGlassDefaults";
import { sanitizeMomentPublishText } from "../features/moments/services/momentContent";
import { createMomentTemporalContext } from "../features/moments/services/momentTemporalContext";
import { buildMomentWorldKnowledge, buildPublicMomentContext, cleanAndExtractMoment, compactTopicHint, findMomentRelationshipCharacter, getKnownMomentsContextString, getMomentComments, getPostIntervalMs, getRelationshipLastMomentTimestamp, renderMomentContent } from "../features/moments/services/chatMomentUtils";
import { useMomentComposerState } from "../features/moments/hooks/useMomentComposerState";
import {
  MessageSquare,
  Users,
  Compass,
  User,
  Send,
  ArrowUp,
  MoreHorizontal,
  Bookmark,
  Image as ImageIcon,
  Heart,
  MessageCircle,
  FolderHeart,
  Settings,
  ChevronLeft,
  X,
  Plus,
  Minus,
  Sliders,
  Camera,
  Music,
  Phone,
  FileText,
  MapPin,
  Gift,
  Trash2,
  AlertCircle,
  Quote,
  Mic,
  Volume2,
  Smile,
  Copy,
  BookOpen,
  RefreshCw,
  Languages,
  Wallet,
  ChevronRight,
  CreditCard,
  Pause,
  Loader2,
  Database,
  Check,
  Edit3,
  Square
} from "lucide-react";


function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function getBubbleBackgroundStyle(hexColor: string, opacityPercent: number): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return hexColor;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacityPercent / 100})`;
}

const CHAT_ICON_FIELDS: Array<{ key: ChatIconKey; label: string }> = [
  { key: "image", label: "图片" }, { key: "textImage", label: "文字图" }, { key: "voice", label: "语音" }, { key: "sticker", label: "表情" },
  { key: "redPacket", label: "红包" }, { key: "transfer", label: "转账" }, { key: "location", label: "位置" },
  { key: "call", label: "通话" }, { key: "plus", label: "加号" }, { key: "sendOnly", label: "发送1（仅发送）" }, { key: "sendReply", label: "发送2（发送并回复）" }, { key: "stop", label: "停止" },
];

interface AppChatProps {
  characters: Character[];
  relationships: CharacterRelationship[];
  settings: UserSettings;
  messages: Message[];
  moments: Moment[];
  onSendMessage: (msg: Message) => void;
  onSaveCharacter: (char: Character) => void; // Support updating character remark, pinned status, chatBg
  onAddMoment: (moment: Moment) => void;
  onAddCommentToMoment: (momentId: string, comment: MomentComment) => void;
  onDeleteCommentFromMoment?: (momentId: string, commentId: string) => void;
  onLikeMoment: (momentId: string, userName: string) => void;
  onDeleteMoment?: (momentId: string) => void;
  onDeleteMomentsByRelation?: (relationId: string) => void;
  onToggleBookmark: (messageId: string, scope?: MessageMutationScope) => void;
  onDeleteMessage?: (messageId: string, scope?: MessageMutationScope) => void;
  onUpdateMessage?: (messageId: string, updatedFields: Partial<Message>, scope?: MessageMutationScope) => void;
  onClose: () => void;
  onSaveSettings: (settings: UserSettings) => void;
  onSwitchIdentity?: (id: string) => void;
  onNavigateToApp: (appId: string) => void;
  worldBookEntries?: WorldBookEntry[];
  onClearMessages?: (charId: string, keepLastCount?: number, relationId?: string) => void;
  memories: MemoryItem[];
  onSaveMemories: (updated: MemoryItem[]) => void;
  recallSettings: MemoryVaultSettings;
  activeChatCharId: string | null;
  setActiveChatCharId: (id: string | null) => void;
  activeChatRelationId: string | null;
  setActiveChatRelationId: (id: string | null) => void;
  onSaveRelationships: (relationships: CharacterRelationship[]) => void;
  appointments?: Appointment[];
  onSaveAppointment?: (appointment: Appointment) => boolean;
  offlineStories?: OfflineStory[];
  onSaveOfflineStory?: (story: OfflineStory) => boolean | void | Promise<boolean>;
  onOpenOfflineStory?: (storyId: string) => void;
  onDeleteOfflineStory?: (storyId: string) => void;
  onDeleteCharacter?: (id: string, skipConfirm?: boolean, preserveGroupMemories?: boolean) => void;
  onDeleteRelationshipMusic?: (relationId: string) => void;
  musicTracks?: MusicTrack[];
  identityMusicStates?: IdentityMusicState[];
  relationshipMusicStates?: RelationshipMusicState[];
  pendingDiaryShareMessageId?: string | null;
  onDiaryShareHandled?: () => void;
  onOpenForumShare?: (shareId: string) => void;
}

const PRESEED_MOMENTS: Moment[] = [];

const isOfflineStoryActiveFor = (relationId: string) =>
  readString(getOfflineModeStorageKey(relationId)).value === "true";

export default function AppChat({
  characters,
  relationships,
  settings,
  messages,
  moments,
  onSendMessage: onSendMessageRaw,
  onSaveCharacter,
  onAddMoment,
  onAddCommentToMoment,
  onDeleteCommentFromMoment,
  onLikeMoment,
  onDeleteMoment,
  onDeleteMomentsByRelation,
  onToggleBookmark,
  onDeleteMessage,
  onUpdateMessage,
  onClose,
  onSaveSettings,
  onSwitchIdentity,
  onNavigateToApp,
  worldBookEntries = [],
  onClearMessages,
  memories,
  onSaveMemories,
  recallSettings,
  activeChatCharId,
  setActiveChatCharId,
  activeChatRelationId,
  setActiveChatRelationId,
  onSaveRelationships,
  appointments = [],
  onSaveAppointment,
  offlineStories = [],
  onSaveOfflineStory,
  onOpenOfflineStory,
  onDeleteOfflineStory,
  onDeleteCharacter,
  onDeleteRelationshipMusic,
  musicTracks = [],
  identityMusicStates = [],
  relationshipMusicStates = [],
  pendingDiaryShareMessageId,
  onDiaryShareHandled,
  onOpenForumShare,
}: AppChatProps) {
  const {
    activeTab,
    setActiveTab,
    momentsFilterCharId,
    setMomentsFilterCharId,
    singleCharacterMomentsId,
    setSingleCharacterMomentsId,
    isShowingAddFriendDialog,
    setIsShowingAddFriendDialog,
  } = useChatNavigationState();
  const diaryShareReplyInFlightRef = useRef<Set<string>>(new Set());

  // MiniMax Real-time TTS Playback States
  const {
    playingMessageId,
    setPlayingMessageId,
    audioLoadingMessageId,
    setAudioLoadingMessageId,
    activeTtsAudio,
    setActiveTtsAudio,
  } = useChatTtsPlaybackState();
  const {
    stickerGroups,
    setStickerGroups,
    stickerSemanticAnalysisInFlightRef,
    triggerCreateStickerGroupRef,
    activeStickerGroupIndex,
    setActiveStickerGroupIndex,
    showStickerSelector,
    setShowStickerSelector,
  } = useChatStickerState();

  const { initiatedChatIds, setInitiatedChatIds, lastReadTimestamps, setLastReadTimestamps, getUnreadCount } = useChatReadState({ activeChatCharId, activeChatRelationId, messages });

  const startChatWith = (relationId: string) => {
    const relation = relationships.find((item) => item.id === relationId);
    if (!relation) {
      const directRelation = relationForCharacter(relationId);
      if (directRelation) {
        setActiveChatRelationId(directRelation.id);
        setActiveChatCharId(resolveCanonicalCharacterId(directRelation.characterId, characters));
        if (!initiatedChatIds.includes(directRelation.id)) setInitiatedChatIds((previous) => [...previous, directRelation.id]);
        return;
      }
      // Group containers retain their pre-existing navigation contract.
      const group = characters.find((character) => character.id === relationId && character.isGroupChat);
      if (!group) return;
      setActiveChatRelationId(null);
      setActiveChatCharId(group.id);
      if (!initiatedChatIds.includes(group.id)) setInitiatedChatIds((previous) => [...previous, group.id]);
      return;
    }
    setActiveChatRelationId(relation.id);
    // Some older data still points at a contact-copy ID. Keep the relationship
    // as the conversation boundary, but always open its canonical profile.
    setActiveChatCharId(resolveCanonicalCharacterId(relation.characterId, characters));
    if (!initiatedChatIds.includes(relation.id)) {
      setInitiatedChatIds((prev) => [...prev, relation.id]);
    }
  };
  
  // Navigation State
  const activeRelationship = activeChatRelationId ? relationships.find((relation) => relation.id === activeChatRelationId) : undefined;
  const activeCharacter = characters.find((c) => c.id === activeChatCharId);
  const readyOfflineAppointment = useChatAppointment({ activeRelationship, appointments });
  const characterCustomChatCss = activeCharacter?.customChatCSS || activeCharacter?.customCss || "";
  // bubbleCss remains a scoped legacy compatibility source.
  const userCustomChatCssSources = [settings.bubbleCss, settings.chatGlobalCSS, characterCustomChatCss];
  const hasUserCustomChatCss = userCustomChatCssSources.some((css) => Boolean(css && css.trim()));
  useChatCustomCss(userCustomChatCssSources, activeCharacter?.chatBg);

  // Long-lived callbacks can outlive the render in which they were created.
  // Keep the latest character/settings available at the actual send boundary.
  const latestActiveCharacterRef = useRef<Character | undefined>(activeCharacter);
  const latestActiveRelationshipRef = useRef<CharacterRelationship | undefined>(activeRelationship);
  const latestMemoriesRef = useRef<MemoryItem[]>(memories || []);
  const consumedGroupWelcomeIdsRef = useRef(new Set<string>());
  const processedRedPacketClaimNoticeIdsRef = useRef(new Set<string>());
  latestActiveCharacterRef.current = activeCharacter;
  latestActiveRelationshipRef.current = activeRelationship;
  latestMemoriesRef.current = memories || [];
  const { currentChatMessages, visibleChatMessages } = useChatMessageProjection({
    messages,
    activeChatCharId,
    activeRelationship,
    activeCharacter,
  });
  const activeIdentityId = settings.activeIdentityId || "identity-1";
  const activeDirectScope = resolveDirectInteractionScope({
    characterId: activeCharacter?.id,
    activeIdentityId,
    relationship: activeRelationship,
    isGroupChat: Boolean(activeCharacter?.isGroupChat),
  });
  const isActiveChatScopeValid = Boolean(activeCharacter && (activeCharacter.isGroupChat
    ? !activeChatRelationId
    : activeDirectScope));
  const activeRuntimeContext = activeDirectScope
    ? toDirectChatRuntimeContext(activeDirectScope)
    : createChatRuntimeContext({
        characterId: activeCharacter?.id,
        conversationId: activeCharacter?.isGroupChat ? `group:${activeCharacter.id}` : null,
        userIdentityId: activeIdentityId,
        isGroup: Boolean(activeCharacter?.isGroupChat),
        groupId: activeCharacter?.isGroupChat ? activeCharacter.id : undefined,
      });
  const isCapturedRuntimeCurrent = (context: typeof activeRuntimeContext) => context.isGroup
    ? Boolean(activeCharacter?.isGroupChat
      && context.userIdentityId === activeIdentityId
      && context.groupId === activeCharacter.id
      && context.conversationId === `group:${activeCharacter.id}`)
    : Boolean(activeDirectScope
      && context.userIdentityId === activeDirectScope.userIdentityId
      && context.characterId === activeDirectScope.characterId
      && context.relationId === activeDirectScope.relationId
      && context.conversationId === activeDirectScope.conversationId);
  const activeVoiceCallScope = resolveDirectVoiceCallScope({
    activeIdentityId,
    relationship: activeRelationship,
    isGroupChat: Boolean(activeCharacter?.isGroupChat),
  });
  const forumSharesForCurrentIdentity = loadForumShares().value.filter((share) =>
    share.ownerIdentityId === activeIdentityId);
  const diarySharesForCurrentIdentity = loadDiaryShares().value.filter((share) =>
    share.ownerIdentityId === activeIdentityId);
  // Old records may contain model-facing scheduling metadata. The projection
  // hook removes it only from the rendered timeline, retaining source history.
  const getPendingOfflineHandoff = (): OfflineStory | undefined => recoverPendingOfflineHandoff({
    stories: offlineStories,
    currentChatMessages,
    scope: {
      isGroup: Boolean(activeCharacter?.isGroupChat),
      characterId: activeCharacter?.id,
      relationId: activeRelationship?.id,
      relationCharacterId: activeRelationship?.characterId,
      conversationId: activeRelationship?.conversationId,
    },
    onSaveOfflineStory,
  });
  const recordPendingOfflineHandoffDelivery = (story?: OfflineStory) => {
    if (!story || story.onlineHandoff?.status !== "pending") return;
    const durableSummaryReady = hasOfflineStorySummary(story, memories || []);
    onSaveOfflineStory(recordOfflineHandoffDelivery(story, Date.now(), 3, durableSummaryReady));
  };
  const buildPendingOfflineTimelineHandoff = (
    story: OfflineStory,
    currentOnlineAt?: number,
    summaryMemory?: MemoryItem,
  ): string => {
    return buildPendingOfflineTimelineHandoffPrompt({
      story,
      characterName: activeCharacter?.remark || activeCharacter?.name || "当前角色",
      userName: settings.name || "用户",
      currentChatMessages,
      currentOnlineAt,
      summaryMemory,
    });
  };
  const buildOfflineTimelineHandoff = (memory: MemoryItem, currentOnlineAt?: number): string => {
    return buildOfflineTimelineHandoffPrompt({
      memory,
      offlineStories,
      relationId: activeRelationship?.id,
      currentChatMessages,
      currentOnlineAt,
    });
  };
  const getInterveningOfflineHandoff = (currentOnlineAt?: number) => {
    return getInterveningOfflineHandoffFromContext({
      currentOnlineAt,
      relationId: activeCharacter?.isGroupChat ? undefined : activeRelationship?.id,
      groupId: activeCharacter?.isGroupChat ? activeCharacter.id : undefined,
      currentChatMessages,
      offlineStories,
      memories: memories || [],
    });
  };
  const getOfflineTimelineStoriesBetween = (previousAt: number | undefined, currentAt: number): OfflineStory[] => {
    return getOfflineTimelineStoriesBetweenFromContext({
      previousAt,
      currentAt,
      relationId: activeRelationship?.id,
      isGroup: Boolean(activeCharacter?.isGroupChat),
      offlineStories,
      memories: memories || [],
    });
  };
  const activeStylePreset = resolveActiveChatStylePreset(
    activeCharacter?.chatStylePreset,
    settings.globalChatStylePreset,
  );
  const isFloatingCute = activeStylePreset === "floating-cute";
  const isLiquidGlass = activeStylePreset === "liquid-glass";
  const activeBubblePosition = isLiquidGlass
    ? settings.liquidGlassBubblePosition || "side"
    : settings.bubblePosition || "side";
  const activeBubbleTailEnabled = isLiquidGlass
    ? settings.liquidGlassBubbleTailEnabled === true
    : settings.bubbleTailEnabled === true;
  const characterChatIcons = sanitizeChatIcons(activeCharacter?.customChatIcons);
  const globalChatIcons = sanitizeChatIcons(settings.chatIcons);
  const getChatIcon = (key: ChatIconKey): string | undefined => characterChatIcons[key]
    || globalChatIcons[key]
    || ((key === "sendOnly" || key === "sendReply") ? characterChatIcons.send || globalChatIcons.send : undefined);
  const belongsToActiveIdentity = (ownerIdentityId?: string) =>
    (ownerIdentityId || "identity-1") === activeIdentityId;

  const {
    isShowingCardModal,
    setIsShowingCardModal,
    advancedSettingsSection,
    setAdvancedSettingsSection,
    isShowingAdvancedSettings,
    advancedSettingsTitle,
  } = useChatSettingsPanelState();
  const availableCharacterIds = getAvailableCanonicalCharacterIds(characters);
  const activeRelationships = relationships.filter((relation) =>
    relation.userIdentityId === activeIdentityId
    && availableCharacterIds.has(resolveCanonicalCharacterId(relation.characterId, characters)),
  );
  const relationForCharacter = (characterId: string) => findRelationshipForCanonicalCharacter(
    relationships,
    activeIdentityId,
    characterId,
    characters,
  );
  const friends = activeRelationships.map((relation) =>
    characters.find((character) => character.id === resolveCanonicalCharacterId(relation.characterId, characters)),
  ).filter((character): character is Character => Boolean(character));
  const friendContacts = activeRelationships.map((relation) => {
    const character = characters.find((item) => item.id === resolveCanonicalCharacterId(relation.characterId, characters))!;
    return { id: relation.id, character, subtitle: settings.identities?.find((identity) => identity.id === relation.userIdentityId)?.name };
  }).filter((item) => Boolean(item.character));

  // Never leave an old identity's direct or group thread open after switching
  // profiles. Otherwise the next profile can temporarily render and act on
  // the previous profile's relation-scoped history.
  useEffect(() => {
    const isForeignDirectRelation = Boolean(
      activeRelationship && !activeCharacter?.isGroupChat && activeRelationship.userIdentityId !== activeIdentityId,
    );
    const isForeignGroup = Boolean(
      activeChatCharId && activeCharacter?.isGroupChat && !belongsToActiveIdentity(activeCharacter.ownerIdentityId),
    );
    if (isForeignDirectRelation || isForeignGroup) {
      setActiveChatCharId(null);
      setActiveChatRelationId(null);
    }
  }, [activeIdentityId, activeChatCharId, activeCharacter?.ownerIdentityId, activeCharacter?.isGroupChat, activeRelationship?.id, activeRelationship?.userIdentityId]);

  useEffect(() => {
    if (!activeChatCharId) return;
    if (!activeCharacter) {
      if (pendingGroupWelcomeIdRef.current === activeChatCharId) return;
      setActiveChatCharId(null);
      setActiveChatRelationId(null);
      return;
    }
    if (activeCharacter.isContactInstance) {
      const canonicalCharacterId = resolveCanonicalCharacterId(activeCharacter.id, characters);
      if (canonicalCharacterId !== activeCharacter.id) {
        setActiveChatCharId(canonicalCharacterId);
        return;
      }
      setActiveChatCharId(null);
      setActiveChatRelationId(null);
    }
  }, [activeChatCharId, activeCharacter, characters, setActiveChatCharId]);

  // The relationship owns a direct conversation. If legacy navigation ever
  // updates only the displayed character, restore the character from that
  // relationship before rendering so one contact can never label another
  // contact's history with its own name and avatar.
  useEffect(() => {
    if (!activeRelationship || !activeCharacter || activeCharacter.isGroupChat) return;
    const relationshipCharacterId = resolveCanonicalCharacterId(activeRelationship.characterId, characters);
    if (relationshipCharacterId !== activeCharacter.id) setActiveChatCharId(relationshipCharacterId);
  }, [activeRelationship?.id, activeRelationship?.characterId, activeCharacter?.id, activeCharacter?.isGroupChat, characters, setActiveChatCharId]);

  // Get location addresses from World Book entries related to this character
  const getDynamicLocations = () => {
    if (!activeCharacter) return [];
    return getWorldBookLocationReferences(getLatestWorldBookEntries(worldBookEntries), activeCharacter.id);
  };

  const {
    isEditingProfile, setIsEditingProfile,
    meActiveSubView, setMeActiveSubView,
    showTopUpModal, setShowTopUpModal,
    topUpAmount, setTopUpAmount,
    editMyName, setEditMyName,
    editMySignature, setEditMySignature,
    editMyBio, setEditMyBio,
    editMyAvatar, setEditMyAvatar,
    editGlobalChatStylePreset, setEditGlobalChatStylePreset,
  } = useChatProfileState(settings);
  const mainTabsViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "me") mainTabsViewportRef.current?.scrollTo({ top: 0 });
  }, [activeTab, meActiveSubView]);
  // Inputs
  // Reply requests can finish after the user has opened another conversation.
  // Keep their typing state attached to the captured conversation instead of
  // relabelling a global boolean with whichever contact is currently visible.
  const activeTypingScopeKey = getChatTypingScopeKey(activeRuntimeContext);
  const { setIsTyping, setTypingCharacterOverride, isTyping, typingCharacterOverride } = useChatTypingState(activeTypingScopeKey);

  const innerVoiceController = useInnerVoice({
    characters,
    activeCharacter,
    activeRelationship,
    messages,
    memories: memories || [],
    settings,
    worldBookEntries,
    getOfflineContinuityContext: (triggerMessage) => {
      const relationId = activeRelationship?.id;
      const interveningOfflineHandoff = relationId || activeCharacter?.isGroupChat
        ? getInterveningOfflineHandoff(triggerMessage.timestamp)
        : undefined;
      const latestOfflineMemory = interveningOfflineHandoff?.memory || (relationId
        ? selectFreshOfflineHandoffMemory({ memories: memories || [], relationId, queryText: triggerMessage.content })
        : undefined);
      const pendingOfflineStory = relationId || activeCharacter?.isGroupChat ? getPendingOfflineHandoff() : undefined;
      return pendingOfflineStory
        ? buildPendingOfflineTimelineHandoff(
          pendingOfflineStory,
          triggerMessage.timestamp,
          latestOfflineMemory && isOfflineStoryHandoffMemory(latestOfflineMemory, pendingOfflineStory) ? latestOfflineMemory : undefined,
        )
        : latestOfflineMemory ? buildOfflineTimelineHandoff(latestOfflineMemory, triggerMessage.timestamp) : undefined;
    },
  });
  const openInnerVoice = innerVoiceController.open;
  const {
    manualLocationText,
    setManualLocationText,
    setEmptyGreetingCheckedCharIds,
    sentGreetings,
    setSentGreetings,
    toastMessage,
    setToastMessage,
    memoNotes,
    setMemoNotes,
  } = useChatTransientUiState();
  
  // Offline Mode States (Inline Offline mode inside chat is disabled, transitioned to AppOffline)
  const isOfflineModeActive = false;
  const isInputNarration = false;
  const activeOfflineStoryId = null;

  /**
   * Start a relation-scoped offline story only after the online transcript
   * confirms a concrete present-tense handoff. A character's clear arrival
   * claim can complete an explicit user “发起线下” request; otherwise both
   * speakers still need concrete presence claims. Future plans and ordinary
   * affection never switch the workspace by themselves.
   */
  const maybeAutoStartOfflineFromPresence = (input: {
    relationship: CharacterRelationship;
    messages: readonly Message[];
    sourceMessage?: Message;
  }) => {
    if (!activeCharacter || activeCharacter.isGroupChat || !activeRelationship) return;
    if (activeRelationship.id !== input.relationship.id || !input.relationship.enableProactiveOffline) return;
    if (isOfflineStoryActiveFor(input.relationship.id)) return;
    const evidence = deriveProactiveOfflinePresenceEvidence({ messages: input.messages });
    const hasConfirmedHandoff = evidence.state === "co_location_confirmed"
      || (evidence.userRequestedOffline && evidence.characterClaimedArrival);
    if (!hasConfirmedHandoff) return;
    if (offlineAutoStartInFlightRef.current.has(input.relationship.id)) return;

    offlineAutoStartInFlightRef.current.add(input.relationship.id);
    const readyAppointment = appointments
      .filter((appointment) => appointment.relationId === input.relationship.id
        && appointment.characterId === input.relationship.characterId
        && appointment.userIdentityId === input.relationship.userIdentityId
        && (appointment.status === "confirmed" || appointment.status === "preparing" || appointment.status === "ready"))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    handleStartOfflineFromMsg(
      input.sourceMessage || [...input.messages].at(-1)!,
      readyAppointment,
      input.messages,
    );
    showToast("已确认你们正在同一地点，正在进入线下故事");
    // Navigation/storage updates are synchronous, but release the guard on
    // the next task so a stale queued reply cannot create a second story.
    window.setTimeout(() => offlineAutoStartInFlightRef.current.delete(input.relationship.id), 0);
  };


  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 1500);
  };

  const { handleTranslateMessage } = useChatMessageTranslation({ settings, onUpdateMessage, showToast });

  const { handleStartOfflineFromMsg } = useChatStartOfflineFromMessage({
    activeChatCharId,
    activeCharacter,
    activeRelationship,
    messages,
    offlineStories,
    characters,
    relationships,
    activeIdentityId,
    memories,
    worldBookEntries: worldBookEntries || [],
    onSaveAppointment,
    onSaveOfflineStory,
    onOpenOfflineStory,
    onNavigateToApp,
    showToast,
  });

  const {
    walletBalances,
    walletBalance,
    setWalletBalance,
    redPacketStatuses,
    setRedPacketStatuses,
    updateRedPacketStatus,
    getRedPacketActualStatus,
    claimRedPacket,
    redPacketClaims,
  } = useChatPaymentState({
    activeIdentityId,
    activeRelationships,
    characters,
    messages,
    belongsToActiveIdentity,
    showToast,
    onSendMessage: onSendMessageRaw,
  });

  // Group-chat claim notices are generated as ordinary narration text. Treat
  // them as settlement events so the red-packet detail view and chat notice
  // cannot drift apart.
  useEffect(() => {
    if (!activeCharacter?.isGroupChat || currentChatMessages.length === 0) return;
    for (const noticeMessage of currentChatMessages) {
      if (processedRedPacketClaimNoticeIdsRef.current.has(noticeMessage.id)) continue;
      const notice = parseRedPacketClaimNotice(noticeMessage.content);
      if (!notice) continue;

      const senderCharacter = noticeMessage.senderId
        ? characters.find((character) => character.id === noticeMessage.senderId || character.name === noticeMessage.senderId)
        : undefined;
      const claimant = (activeCharacter.memberIds || [])
        .map((memberId) => characters.find((character) => character.id === memberId))
        .find((character) => character && (
          character.name === notice.claimantName
          || character.remark === notice.claimantName
          || (!notice.claimantName && (character.id === senderCharacter?.id || character.id === noticeMessage.senderId))
        ));
      if (!claimant) continue;

      const packet = [...currentChatMessages]
        .filter((message) => message.timestamp <= noticeMessage.timestamp && isRedPacketMarkup(message.content))
        .reverse()
        .find((message) => {
          const payload = parseRedPacketPayload(message);
          const claims = redPacketClaims[getPaymentStatusKey(message)] || [];
          const alreadyClaimed = claims.some((claim) => claim.claimantId === claimant.id);
          const packetSender = message.sender === "user"
            ? settings.name
            : characters.find((character) => character.id === message.characterId);
          const packetSenderName = typeof packetSender === "string"
            ? packetSender
            : packetSender?.remark || packetSender?.name || "";
          const senderMatches = !notice.senderName
            || notice.senderName === packetSenderName
            || notice.senderName === "我"
            || notice.senderName === "我的";
          return senderMatches && !alreadyClaimed && claims.length < Math.max(1, payload.count)
            && (!payload.recipientId || payload.recipientId === claimant.id);
        });
      if (!packet) continue;

      const claimedAmount = claimRedPacket(packet, claimant.id);
      if (claimedAmount <= 0) continue;

      processedRedPacketClaimNoticeIdsRef.current.add(noticeMessage.id);
      const packetSender = packet.sender === "user"
        ? settings.name
        : characters.find((character) => character.id === packet.characterId);
      const packetSenderName = typeof packetSender === "string"
        ? packetSender
        : packetSender?.remark || packetSender?.name || "对方";
      const claimantName = claimant.remark || claimant.name;
      const claimNotification = createGroupCharacterMessage({
        id: `claim-notification-${noticeMessage.id}`,
        characterId: activeCharacter.id,
        senderId: claimant.id,
        conversationId: `group:${activeCharacter.id}`,
        content: packet.sender === "user"
          ? `${claimantName}领取了你的红包`
          : `${claimantName}领取了${packetSenderName}的红包`,
        timestamp: Date.now(),
        isNarration: true,
      });
      onSendMessageRaw(claimNotification);
      // Wait for the persisted claim state before handling another notice;
      // otherwise multiple notices in one render could reuse the same slot.
      break;
    }
  }, [activeCharacter, characters, claimRedPacket, currentChatMessages, onSendMessageRaw, redPacketClaims, settings.name]);

  const settleGroupClaimBeforeReply = (reply: Message): Message | null => {
    if (!activeCharacter?.isGroupChat || reply.sender !== "character") return null;
    const notice = parseRedPacketClaimNotice(reply.content);
    const shouldClaim = reply.redPacketAction === "claim_and_reply" || reply.redPacketAction === "claim_silent";
    if (reply.redPacketAction && !shouldClaim) return null;
    if (!shouldClaim && !notice) return null;
    const claimant = (activeCharacter.memberIds || [])
      .map((memberId) => characters.find((character) => character.id === memberId))
      .find((character) => character && (
        character.id === reply.senderId
        || character.name === notice.claimantName
        || character.remark === notice.claimantName
      ));
    if (!claimant) return null;

    const packet = [...currentChatMessages]
      .filter((message) => message.timestamp <= reply.timestamp && isRedPacketMarkup(message.content))
      .reverse()
      .find((message) => {
        const payload = parseRedPacketPayload(message);
        const claims = redPacketClaims[getPaymentStatusKey(message)] || [];
        const packetSender = message.sender === "user"
          ? settings.name
          : characters.find((character) => character.id === message.characterId);
        const packetSenderName = typeof packetSender === "string"
          ? packetSender
          : packetSender?.remark || packetSender?.name || "";
          const senderMatches = !notice || !notice.senderName
          || notice.senderName === packetSenderName
          || notice.senderName === "我"
          || notice.senderName === "我的";
        return senderMatches
          && !claims.some((claim) => claim.claimantId === claimant.id)
          && claims.length < Math.max(1, payload.count)
          && (!payload.recipientId || payload.recipientId === claimant.id);
      });
    if (!packet) return null;
    const amount = claimRedPacket(packet, claimant.id);
    if (amount <= 0) return null;

    const packetSender = packet.sender === "user"
      ? settings.name
      : characters.find((character) => character.id === packet.characterId);
    const packetSenderName = typeof packetSender === "string"
      ? packetSender
      : packetSender?.remark || packetSender?.name || "对方";
    const claimantName = claimant.remark || claimant.name;
    return createGroupCharacterMessage({
      id: `claim-notification-${reply.id}`,
      characterId: activeCharacter.id,
      senderId: claimant.id,
      conversationId: `group:${activeCharacter.id}`,
      content: packet.sender === "user"
        ? `${claimantName}领取了你的红包`
        : `${claimantName}领取了${packetSenderName}的红包`,
      timestamp: Date.now(),
      isNarration: true,
    });
  };

  const { cssTemplateCopied, copyCssExampleTemplate } = useChatCssTemplateCopy({ showToast });

  const {
    momentInputText, setMomentInputText, momentAttachedImage, setMomentAttachedImage,
    momentTextImageDescription, setMomentTextImageDescription, showTextImageInput, setShowTextImageInput,
    viewingImageDescription, setViewingImageDescription, showMomentPublisher, setShowMomentPublisher,
    inlineCommentsTexts, setInlineCommentsTexts, showCommentInputMap, setShowCommentInputMap,
    replyingToCommentMap, setReplyingToCommentMap,
  } = useMomentComposerState();
  const {
    lastViewedMomentsTime, momentContextMenu, setMomentContextMenu, commentDeleteTarget, setCommentDeleteTarget,
    commentContextMenu, setCommentContextMenu, momentTranslations, setMomentTranslations,
    commentTranslations, setCommentTranslations, momentFavorites, setMomentFavorites, favedTab, setFavedTab,
  } = useChatMomentsInteractionState(activeTab, moments);

  const {
    showCreateGroupModal, setShowCreateGroupModal,
    groupNameInput, setGroupNameInput,
    selectedGroupMemberIds, setSelectedGroupMemberIds,
    pendingGroupWelcome, setPendingGroupWelcome,
    pendingGroupWelcomeIdRef,
  } = useChatGroupState();
  const {
    draftRemark, setDraftRemark, isEditingRemark, setIsEditingRemark, draftAvatar, setDraftAvatar,
    isDeleteMemberMode, setIsDeleteMemberMode, showAddMemberModal, setShowAddMemberModal,
    selectedAddMemberIds, setSelectedAddMemberIds, draftIsPinned, setDraftIsPinned,
    draftChatBg, setDraftChatBg, draftCustomCss, setDraftCustomCss,
    draftChatIcons, setDraftChatIcons, draftChatStylePreset, setDraftChatStylePreset,
    draftEnableProactiveChat, setDraftEnableProactiveChat, draftEnableProactiveOffline, setDraftEnableProactiveOffline,
    draftEnableProactiveCall, setDraftEnableProactiveCall,
    draftProactiveChatInterval, draftProactiveStartTime, setDraftProactiveStartTime,
    draftProactiveEndTime, setDraftProactiveEndTime, draftDisableBracketActions, setDraftDisableBracketActions,
    draftHistoryMemoryLimit, draftContextMemoryLimit, setDraftContextMemoryLimit,
    draftRetrievalHistoryLimit, setDraftRetrievalHistoryLimit, draftArchiveTemplateType,
    draftAutoArchiveInterval, setDraftAutoArchiveInterval, draftEnableAutoArchive, setDraftEnableAutoArchive,
    draftEnableTimeAwareness, setDraftEnableTimeAwareness, draftEnableAutoTranslate, setDraftEnableAutoTranslate,
    draftMinimaxVoiceId, setDraftMinimaxVoiceId, draftMosslandVoiceId, setDraftMosslandVoiceId,
    draftMinimaxSpeed, setDraftMinimaxSpeed,
    draftVoiceFrequency, draftEnableImageGeneration, setDraftEnableImageGeneration,
    draftImageAppearancePrompt, setDraftImageAppearancePrompt, draftImageNegativePrompt, setDraftImageNegativePrompt,
    draftImageReferenceAssetId, setDraftImageReferenceAssetId, draftImageReferenceMimeType, setDraftImageReferenceMimeType,
    loadCharacterDraft,
  } = useChatSettingsDraft();
  const { handleDraftChatBgUpload } = useChatBackgroundDraftUpload({ setDraftChatBg });
  const {
    showImageGenerator, setShowImageGenerator, imageRequestText, setImageRequestText,
    isGeneratingImage, setIsGeneratingImage, imageGenerationError, setImageGenerationError,
    showAttachPanel, setShowAttachPanel, activeAttachModal, setActiveAttachModal,
    voiceText, setVoiceText, callingStatus, setCallingStatus, callingDuration, setCallingDuration,
    isIncomingCall, setIsIncomingCall, setCallStartTime, callingInputText, setCallingInputText,
    callTranscript, setCallTranscript, voiceCallRelationId, setVoiceCallRelationId, callTranscriptEndRef,
    callRecordDetail, setCallRecordDetail, redPacketAmount, setRedPacketAmount,
    redPacketGreeting, setRedPacketGreeting, redPacketMode, setRedPacketMode, redPacketCount, setRedPacketCount,
    redPacketRecipientId, setRedPacketRecipientId, showRedPacketOpenModal, setShowRedPacketOpenModal,
    openRedPacketDetail, setOpenRedPacketDetail, isOpeningRedPacket, setIsOpeningRedPacket,
    setOpenTransferDetail, setShowTransferDetailModal, setOpenVoiceId, voiceTimer, setVoiceTimer,
  } = useChatAttachmentState();
  const {
    triggerMessageSpeech,
    unlockCallTtsPlayback,
    resetCallTtsPlayback,
    enqueueCallSpeech,
    clearCallSpeechQueue,
    callSpeechGenerationRef,
  } = useChatCallSpeechPlayback({
    settings,
    characters,
    isOfflineModeActive,
    playingMessageId,
    setPlayingMessageId,
    setAudioLoadingMessageId,
    activeTtsAudio,
    setActiveTtsAudio,
    voiceTimer,
    setVoiceTimer,
    showToast,
  });
  const onSendMessage = createChatMessageDeliveryHandler({
    settings,
    activeCharacter,
    activeDirectScope,
    activeAttachModal,
    callingStatus,
    onSendMessageRaw,
    setCallTranscript,
    enqueueCallSpeech,
  });
  const { handleRemoveGroupMember, handleAddGroupMembers } = useChatGroupMemberActions({
    activeCharacter,
    characters,
    onSaveCharacter,
    onSendMessage,
    setShowAddMemberModal,
  });
  const { isManualArchiving, setIsManualArchiving, isCompressingMemory, setIsCompressingMemory } = useChatOperationState();

  const estimatedTokens = React.useMemo(() => estimateChatTokens({
    character: activeCharacter,
    relationshipCompressedMemory: activeRelationship?.compressedMemory,
    messages: currentChatMessages,
    contextLimit: draftContextMemoryLimit,
    memories: memories || [],
    relationId: activeRelationship?.id,
    isGroupChat: activeCharacter?.isGroupChat,
    recallCount: recallSettings?.recallCount,
  }), [draftContextMemoryLimit, activeCharacter, activeRelationship?.compressedMemory, activeRelationship?.id, currentChatMessages, memories, recallSettings?.recallCount]);
  // Memory Compression and Proactive Chat states
  const proactiveMessageInFlightRef = useRef<Set<string>>(new Set());
  // Stop background generation after an authentication failure so a missing
  // or invalid provider key cannot create a repeated request/logging loop.
  const backgroundGenerationBlockedRef = useRef(false);
  // Prevent a burst of streamed/direct replies from opening duplicate offline
  // stories before the navigation state has caught up.
  const offlineAutoStartInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    backgroundGenerationBlockedRef.current = false;
  }, [settings.apiKey, settings.apiEndpoint, settings.selectedModel]);
  const {
    showClearHistoryModal, setShowClearHistoryModal, showDisbandGroupModal, setShowDisbandGroupModal,
    activeMenuMsg, setActiveMenuMsg, menuPosition, setMenuPosition, isMultiSelectDeleteMode, setIsMultiSelectDeleteMode,
    selectedMessageIds, setSelectedMessageIds, selectedFileNote, setSelectedFileNote,
    showOocCommentModal, setShowOocCommentModal, oocCommentText, setOocCommentText,
  } = useChatMessageInteractionState();
  const {
    deleteMessageAndLinkedImage,
    startMultiSelectDelete,
    toggleMultiSelectedMessage,
    exitMultiSelectDelete,
    deleteSelectedMessages,
    clearMessagesAndLinkedArtifacts,
  } = useChatMessageCleanupActions({
    messages,
    currentChatMessages,
    activeDirectScope,
    onDeleteMessage,
    onClearMessages,
    setRedPacketStatuses,
    setActiveMenuMsg,
    setIsMultiSelectDeleteMode,
    setSelectedMessageIds,
    selectedMessageIds,
    showToast,
  });
  // New features: Notes attachment, Quoting, Bubble Menu, Note Reader, OOC Annotation
  const { voicePlayed, setVoicePlayed, voiceTranscribed, setVoiceTranscribed } = useChatVoiceMessageState();
  const [collapsedTranslations, setCollapsedTranslations] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    bubbleLongPressRef.current.forEach(({ timer }) => clearTimeout(timer));
    bubbleLongPressRef.current.clear();
    activeTtsAudio?.pause();
    if (voiceTimer) clearInterval(voiceTimer);
    clearCallSpeechQueue();
    resetCallTtsPlayback();
    setActiveTtsAudio(null);
    setPlayingMessageId(null);
    setAudioLoadingMessageId(null);
    setVoiceTimer(null);
    setOpenVoiceId(null);
    setActiveMenuMsg(null);
    setOpenRedPacketDetail(null);
    setShowRedPacketOpenModal(false);
    setOpenTransferDetail(null);
    setShowTransferDetailModal(false);
    setShowAttachPanel(false);
    setActiveAttachModal(null);
    setIsMultiSelectDeleteMode(false);
    setSelectedMessageIds(new Set());
  }, [activeIdentityId, activeChatRelationId, activeChatCharId]);

  useEffect(() => () => {
    bubbleLongPressRef.current.forEach(({ timer }) => clearTimeout(timer));
    bubbleLongPressRef.current.clear();
  }, []);

  // Moments long-press popup refs remain local because handlers own their gesture lifecycle.
  const commentLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentLongPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressCommentClickRef = useRef(false);
  const bubbleLongPressRef = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; origin: { x: number; y: number } }>());

  useEffect(() => {
    if (activeAttachModal === "file") {
      setMemoNotes(readArray("phone_memo_notes", []).value);
    }
  }, [activeAttachModal]);

  // Close attachment panel when switching chats
  useEffect(() => {
    setShowAttachPanel(false);
  }, [activeChatCharId]);

  // Relationship activity is persisted by the message boundary; never write it
  // back to the canonical character for a direct chat.
  useEffect(() => {
    if (!activeRelationship) return;
    const timestamp = Date.now();
    onSaveRelationships(touchRelationshipSession(relationships, activeRelationship.id, timestamp));
  }, [activeChatRelationId]);

  useChatGreeting({
    activeChatCharId,
    activeCharacter,
    activeRelationship,
    messages,
    sentGreetings,
    isOfflineStoryActiveFor,
    onSendMessage,
    setSentGreetings,
    setIsTyping,
  });

  const updateRelationshipSession = (relationId: string, patch: Partial<CharacterRelationship>) => {
    onSaveRelationships(relationships.map((relation) => relation.id === relationId
      ? { ...relation, ...patch, updatedAt: Date.now() }
      : relation));
  };

  // Calls are direct-relationship sessions. Never let a session started by a
  // previous identity remain open after the active relationship changes.
  useEffect(() => {
    if (activeAttachModal !== "calling" || !voiceCallRelationId) return;
    if (isCurrentVoiceCallScope(voiceCallRelationId, activeVoiceCallScope)) return;

    clearCallSpeechQueue();
    if (activeTtsAudio) activeTtsAudio.pause();
    resetCallTtsPlayback();
    setCallingStatus("ended");
    setCallingInputText("");
    setActiveAttachModal(null);
    setVoiceCallRelationId(null);
  }, [activeAttachModal, activeTtsAudio, activeVoiceCallScope?.relationId, voiceCallRelationId]);

  const beginVoiceCall = (incoming: boolean) => {
    if (!activeCharacter || activeCharacter.isGroupChat || !activeVoiceCallScope) return;
    clearCallSpeechQueue();
    resetCallTtsPlayback();
    if (!incoming) unlockCallTtsPlayback();
    setIsIncomingCall(incoming);
    setVoiceCallRelationId(activeVoiceCallScope.relationId);
    setCallingStatus("ringing");
    setCallingDuration(0);
    setCallStartTime(0);
    setCallingInputText("");
    setCallTranscript([]);
    setActiveAttachModal("calling");
    setShowAttachPanel(false);
  };

  const finishVoiceCall = (requestedStatus: VoiceCallStatus, options: { userEndedCall?: boolean } = {}) => {
    if (!activeChatCharId || !isCurrentVoiceCallScope(voiceCallRelationId, activeVoiceCallScope)) {
      clearCallSpeechQueue();
      resetCallTtsPlayback();
      setActiveAttachModal(null);
      setVoiceCallRelationId(null);
      return;
    }
    const completion = completeVoiceCall({
      requestedStatus,
      transcript: callTranscript,
      durationSeconds: callingDuration,
      id: `call-record-${Date.now()}`,
      characterId: activeChatCharId,
      scope: activeVoiceCallScope,
      sender: isIncomingCall ? "character" : "user",
      timestamp: Date.now(),
      incoming: isIncomingCall,
      userEndedCall: options.userEndedCall,
      recentMessages: messagesRef.current,
    });
    onSendMessageRaw(completion.callRecord);
    if (completion.status === "completed" && activeDirectScope) {
      const claim = createDeterministicArtifactClaim({ message: completion.callRecord, scope: activeDirectScope });
      if (claim && !appendKnowledgeClaim(claim).success) console.warn("Failed to capture voice-call knowledge claim.");
    }
    if (completion.rejectionPatch) updateRelationshipSession(activeVoiceCallScope.relationId, completion.rejectionPatch);
    clearCallSpeechQueue();
    if (activeTtsAudio) activeTtsAudio.pause();
    resetCallTtsPlayback();
    setCallingStatus("ended");
    setCallingInputText("");
    setActiveAttachModal(null);
    setVoiceCallRelationId(null);
  };

  const endVoiceCall = () => finishVoiceCall(callingStatus === "connected" ? "completed" : "cancelled", { userEndedCall: true });

  useVoiceCallTimers({
    activeAttachModal,
    callingStatus,
    isIncomingCall,
    voiceCallRelationId,
    transcriptLength: callTranscript.length,
    callTranscriptEndRef,
    onDurationTick: () => setCallingDuration((previous) => previous + 1),
    onResetDuration: () => setCallingDuration(0),
    onOutgoingConnected: () => {
      setCallingStatus("connected");
      setCallStartTime(Date.now());
    },
    onOutgoingFinished: (status) => finishVoiceCall(status),
    onIncomingTimeout: () => finishVoiceCall("cancelled"),
  });

  const sendVoiceCallMessage = () => {
    if (isTyping) return;
    const userMsg = createVoiceCallUserMessage({
      text: callingInputText,
      characterId: activeChatCharId,
      sessionRelationId: voiceCallRelationId,
      scope: activeVoiceCallScope,
      id: Date.now().toString(),
      timestamp: Date.now(),
    });
    if (!userMsg) return;
    onSendMessage(userMsg);
    generateResponseForUserMessage(userMsg);
    setCallingInputText("");
  };

  const generateResponseForGroupChat = async (userMsg: Message | null, customHistoryOverride?: Message[], signal?: AbortSignal) => {
    if (!activeChatCharId || !activeCharacter) return;
    if (signal?.aborted) return;
    setIsTyping(true);
    let repliesScheduled = false;

    try {
      const groupMembers = (activeCharacter.memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean) as Character[];
      if (groupMembers.length === 0) {
        setIsTyping(false);
        return;
      }

      // Initialize the typing avatar override with the first group member to avoid displaying the group's own avatar
      setTypingCharacterOverride(groupMembers[0]);

      const groupKnowledgeClaims = loadKnowledgeClaims().value;
      const groupConversationSummaries = loadConversationSummaries().value;
      const groupBehaviorCorrections = loadBehaviorCorrections().value;
      const groupPipeline = await runGroupChatReplyPipeline({
        activeCharacter,
        characters,
        relationships,
        activeIdentityId,
        memories: memories || [],
        claims: groupKnowledgeClaims,
        summaries: groupConversationSummaries,
        corrections: groupBehaviorCorrections,
        worldBookEntries: worldBookEntries || [],
        currentMessages: currentChatMessages,
        userMessage: userMsg,
        customHistoryOverride,
        userName: settings.name,
        userBio: settings.bio,
        settings,
        recallLimit: recallSettings?.recallCount || 5,
        timeAwarenessEnabled: resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).enableTimeAwareness,
        disableBracketActions: resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).disableBracketActions,
        generateTurn: generateGroupChatTurn,
        createRouteId: () => createId("group-route"),
        createReplyId: () => createId("group-reply"),
        currentTime: () => Date.now(),
        signal,
      });
      const groupResult = groupPipeline.result;
      if (!groupResult) return;
      if (groupResult.messages.length > 0) {
        const silentGroupReplies = groupResult.messages.filter((message) => message.redPacketAction === "claim_silent" || message.redPacketAction === "silent");
        silentGroupReplies.forEach((reply) => {
          const claimNotification = reply.redPacketAction === "claim_silent"
            ? settleGroupClaimBeforeReply(reply)
            : null;
          if (claimNotification) onSendMessage(claimNotification);
        });
        if (groupResult.innerVoices?.length) {
          const latest = loadInnerVoiceRecords([]).value;
          const additions = groupResult.innerVoices
            .filter((item) => !findInnerVoiceByMessage(latest, {
              kind: "group",
              groupId: activeCharacter.id,
              conversationId: `group:${activeCharacter.id}`,
              characterId: item.member.id,
              messageId: item.message.id,
            }))
            .map((item) => createInlineInnerVoiceRecord({
              character: item.member,
              triggerMessage: item.message,
              groupId: activeCharacter.id,
              conversationId: `group:${activeCharacter.id}`,
              payload: item.content,
              settings,
            }));
          if (additions.length) saveInnerVoiceRecords([...latest, ...additions]);
        }
        repliesScheduled = false;
        const validReplies = groupResult.messages
          .map((message, idx) => ({ message, member: groupResult.members[idx], idx }))
          .filter((item): item is { message: Message; member: Character; idx: number } => Boolean(item.member)
            && item.message.redPacketAction !== "claim_silent"
            && item.message.redPacketAction !== "silent");

        if (validReplies.length > 0) {
          repliesScheduled = true;
          scheduleGroupReplyDelivery({
            items: validReplies,
            signal,
            onTypingMember: setTypingCharacterOverride,
            onTyping: setIsTyping,
            onSend: (reply) => {
              // Persist the claim before the reply becomes visible. The
              // notification is appended only after the original reply.
              const claimNotification = settleGroupClaimBeforeReply(reply);
              onSendMessage(reply);
              if (claimNotification) onSendMessage(claimNotification);
            },
            onComplete: () => undefined,
          });
        }
      } else {
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Group chat response generation failed:", err);
    } finally {
      if (!repliesScheduled) {
        setIsTyping(false);
        setTypingCharacterOverride(null);
      }
    }
  };

  useEffect(() => {
    if (!pendingGroupWelcome
      || !activeCharacter?.isGroupChat
      || activeCharacter.id !== pendingGroupWelcome.groupId
      || activeChatCharId !== pendingGroupWelcome.groupId) return;
    const pending = pendingGroupWelcome;
    if (consumedGroupWelcomeIdsRef.current.has(pending.groupId)) return;
    consumedGroupWelcomeIdsRef.current.add(pending.groupId);
    pendingGroupWelcomeIdRef.current = null;
    setPendingGroupWelcome(null);
    onSendMessage(pending.narration);
    void generateResponseForGroupChat(null, [pending.narration]);
  }, [pendingGroupWelcome, activeCharacter?.id, activeCharacter?.isGroupChat, activeChatCharId]);

  const canConvertBubbleToVoice = (character: Character, lastUserMsg: Message | null, recentMsgs: Message[], bubbleIndex: number, bubbleText: string, replyContext: ChatRuntimeContext) =>
    shouldConvertBubbleToVoice({
      enabled: settings.enableMiniMaxTts,
      character,
      lastUserMessage: lastUserMsg,
      recentMessages: recentMsgs,
      bubbleIndex,
      bubbleText,
      replyContext,
    });

  const persistProactiveOfflineInvitation = (input: {
    relationship: CharacterRelationship;
    directive: Parameters<typeof createProactiveAppointment>[0]["directive"];
    sourceMessageId: string;
    now: number;
  }): boolean => {
    if (!onSaveAppointment) return false;
    return onSaveAppointment(createProactiveAppointment({
      id: `appointment:${input.relationship.id}:${input.sourceMessageId}`,
      proposalId: `proposal:${input.sourceMessageId}`,
      scope: {
        relationId: input.relationship.id,
        characterId: input.relationship.characterId,
        userIdentityId: input.relationship.userIdentityId,
      },
      directive: input.directive,
      sourceMessageId: input.sourceMessageId,
      now: input.now,
    }));
  };

  const executeDirectReplyPipeline = async (
    userMsg: Message | null,
    customHistoryOverride?: Message[],
    cognitiveContext?: CharacterCognitiveContext,
    replyContext: ChatRuntimeContext = activeRuntimeContext,
    signal?: AbortSignal,
  ) => {
    if (signal?.aborted) return;
    setIsTyping(true);
    const callTurnGeneration = activeAttachModal === "calling" && callingStatus === "connected"
      ? callSpeechGenerationRef.current
      : null;
    const isCancelledCallTurn = () => callTurnGeneration !== null
      && callTurnGeneration !== callSpeechGenerationRef.current;
    // Resolve toggles from the latest props for every send. A queued callback
    // may have been created by an earlier render, so its captured character
    // must never decide the next prompt or output filtering.
    const turnCharacter = latestActiveCharacterRef.current || activeCharacter;
    const turnRelationship = latestActiveRelationshipRef.current;
    const turnSettings = resolveChatTurnSettings(turnCharacter);
    const pendingProactiveOfflineAppointment = turnRelationship && userMsg?.sender === "user"
      ? appointments.find((appointment) => appointment.relationId === turnRelationship.id
        && appointment.characterId === turnRelationship.characterId
        && appointment.userIdentityId === turnRelationship.userIdentityId
        && (appointment.status === "awaiting_user" || appointment.status === "negotiating"))
      : undefined;
    let proactiveOfflineAllowedModes: AppointmentMode[] = [];
    if (turnRelationship
      && !replyContext.isGroup
      && replyContext.relationId === turnRelationship.id
      && replyContext.userIdentityId === turnRelationship.userIdentityId
      && activeAttachModal !== "calling") {
      const sourceMessages = customHistoryOverride ? [...customHistoryOverride] : [...currentChatMessages];
      if (userMsg && !sourceMessages.some((message) => message.id === userMsg.id)) sourceMessages.push(userMsg);
      const eligibility = evaluateProactiveOfflineEligibility({
        enabled: turnRelationship.enableProactiveOffline === true,
        scope: {
          relationId: turnRelationship.id,
          characterId: turnRelationship.characterId,
          userIdentityId: turnRelationship.userIdentityId,
        },
        appointments,
        context: deriveProactiveOfflineContextEvidence({ messages: sourceMessages, source: "direct_reply" }),
      });
      if (eligibility.eligible) proactiveOfflineAllowedModes = eligibility.allowedModes;
    }
    let pendingOfflineHandoffForReply: OfflineStory | undefined;
    const isRedPacket = userMsg && isRedPacketMarkup(userMsg.content);
    if (isRedPacket) {
      const capturedMessage = userMsg!;
      const capturedRelationship = activeRelationship;
      const capturedCharacter = activeCharacter;
      // Simulate partner claiming after 3 seconds
      setTimeout(() => {
        // In a group, the AI's claim notice is the source of truth. Do not
        // pre-claim a fixed member here and create a second settlement event.
        if (capturedCharacter.isGroupChat) return;
        if (capturedRelationship && !relationships.some((relationship) => relationship.id === capturedRelationship.id
          && relationship.userIdentityId === capturedRelationship.userIdentityId
          && relationship.characterId === capturedRelationship.characterId)) return;
        const packet = parseRedPacketPayload(capturedMessage);
        const claimantId = packet.recipientId
          || (capturedRelationship ? capturedCharacter.id : capturedCharacter.memberIds?.[0]);
        if (!claimantId || claimRedPacket(capturedMessage, claimantId) <= 0) return;
        const claimant = characters.find((character) => character.id === claimantId);
        const partnerName = claimant?.remark || claimant?.name || capturedCharacter.remark || capturedCharacter.name;
        const claimNotification = capturedRelationship
          ? createCharacterTextMessage({
              id: createId("claim-notification"),
              context: createChatRuntimeContext({ characterId: capturedRelationship.characterId, relationId: capturedRelationship.id, conversationId: capturedRelationship.conversationId || getConversationId(capturedRelationship.id), userIdentityId: capturedRelationship.userIdentityId }),
              content: `${partnerName}领取了你的红包`, timestamp: Date.now(), isNarration: true,
            })
          : createGroupCharacterMessage({ id: `claim-notification-${Date.now()}`, characterId: capturedCharacter.id, senderId: claimantId, content: `${partnerName}领取了你的红包`, timestamp: Date.now(), isNarration: true });
        onSendMessageRaw(claimNotification);
      }, 3000);
    }

    try {
      // Collect message history of this specific character to pass to backend
      const isConnectedVoiceCall = activeAttachModal === "calling" && callingStatus === "connected";
      const callHistoryMessages: Message[] = isConnectedVoiceCall
        ? callTranscript.map((item) => ({
            id: item.id,
            characterId: activeChatCharId,
            sender: item.sender,
            content: item.content,
            timestamp: item.timestamp,
          }))
        : [];
      // A call has its own live history. Keep a short online-chat lead-in for
      // continuity, then append this call's subtitles in chronological order.
      const baseSourceMsgs = isConnectedVoiceCall
        ? [...currentChatMessages.slice(-Math.min(20, activeCharacter.contextMemoryLimit ?? 20)), ...callHistoryMessages]
        : [...currentChatMessages];
      const sourceMsgs = customHistoryOverride || (userMsg ? [...baseSourceMsgs, userMsg] : baseSourceMsgs);
      const historyContext = buildDirectChatHistoryContext({
        messages: sourceMsgs,
        userMessageId: userMsg?.id,
        userMessageAt: userMsg?.timestamp,
        enableTimeAwareness: turnSettings.enableTimeAwareness,
        contextLimit: activeCharacter.contextMemoryLimit !== undefined ? activeCharacter.contextMemoryLimit : 20,
        characterName: activeCharacter.name,
        userName: settings.name,
      });
      const { finalMessages: finalMsgs, messagesForHistory: msgsForHistory, recentMessages: slicedMsgs, history, crossDayHistoricalReference, timeLogString, isCrossDayNewSession } = historyContext;
      const historyPartition = { hasCrossDayHistory: historyContext.hasCrossDayHistory };
      const requestTime = historyContext.requestTime;

      // Construct system instructions based on multi-block SillyTavern positioning rules
      let mainPromptText = isOfflineModeActive 
        ? `You are playing the role of "${activeCharacter.name}" in an OFFLINE STAGE/DRAMA script mode (线下剧本模式).
In this mode, you are co-writing an immersive story with the user.
Your reply must contain third-person narrator descriptions of actions, background details, scenery, and characters' thoughts, AS WELL AS character dialogues.

🚨🚨🚨 [CRITICAL OFFLINE FORMAT RULES]:
1. All spoken dialogues MUST be strictly enclosed in Chinese double quotes “ ” (e.g. “你又在胡思乱想了。”) or corner brackets 「 」. Any third-person scenery, action descriptions, or thoughts must remain OUTSIDE of the quotes. NEVER output spoken dialogue without quotes! Otherwise the system cannot parse your dialogue into separate chat bubbles.
2. Third-person narrator descriptions, actions, and scenery should be rich, detailed, complete, and immersive, so as to create a vivid novel-like narrative. (第三人称旁白、场景及动作心理描写应当丰富、生动且完整，以塑造出极具沉浸感的小说式氛围)。
3. Do NOT wrap descriptions or actions in parentheses like (微笑), （叹气）, (物理动作); instead, write them as normal, beautiful narrative prose sentences and separate them from spoken dialogue using standard line breaks (换行处理，不要加任何括号).
4. You must ONLY use Chinese double quotes “ ” to enclose actual spoken dialogue (口语/说话内容) by ${activeCharacter.name}. NEVER use quotes for thoughts, descriptions, emphasis, or words within third-person narration! This is extremely important so the user's system can correctly parse dialogue bubbles.`
        : buildDirectChatMainPrompt({
          characterName: activeCharacter.name,
          disableBracketActions: turnSettings.disableBracketActions,
          characterProfile: [activeCharacter.remark, activeCharacter.age, activeCharacter.gender, activeCharacter.personality, activeCharacter.backstory].filter(Boolean).join("；"),
        });

      const characterProjection = projectCharacterPrompt(activeCharacter, activeRelationship?.relationship);
      let characterDescriptionText = characterProjection.description.content;
      let characterContextText = "";

      if (activeCharacter.initialChatMode === "context" && activeCharacter.initialChatContext?.trim() && msgsForHistory.length === 0) {
        characterDescriptionText += `\n\n[First chat setup — hidden guidance only]\n${activeCharacter.initialChatContext.trim()}\nUse this scene and relationship as the starting point for your first reply. Do not quote, mention, or render this setup as a system message or chat bubble.`;
      }

      characterContextText += `[🚨 记忆与上下文关联优先级规则]:
1. Truth Layer 中按关系投影的 confirmed/asserted 事实优先；未来计划、假设、争议和旧数据必须遵守各自标签，不能互相改写。
2. Conversation summary 是可重建的派生缓存，只能补充上下文，不能覆盖具体事实或制造来源中没有的细节。
3. 历史检索及短期上下文：短期聊天记录已按用户限制截断；需要长期连续性时优先使用同一关系的 Truth Layer 数据。`;
      if (crossDayHistoricalReference) characterContextText += `\n${crossDayHistoricalReference}`;

      const currentMessageContextText = userMsg
        ? serializeMessageContentForPrompt(userMsg, { mode: "history", userName: settings.name, characterName: activeCharacter.name })
        : "";

      const callTopicShiftDetected = detectCallTopicShift({
        isConnectedVoiceCall,
        userText: currentMessageContextText,
        callTranscript,
      });
      const shouldLoadLongTermMemory = !isConnectedVoiceCall || callTopicShiftDetected;

      // Recall memories from Memory Vault
      const topK = recallSettings?.recallCount || 5;
      const relevantMemories = shouldLoadLongTermMemory
        ? MemoryService.retrieveRelevantMemories({ characterId: activeChatCharId || "", relationId: activeRelationship?.id, queryText: currentMessageContextText, existingMemories: memories || [], limit: topK, scenario: "chat" })
        : [];
      const truthRetrieval = activeRelationship
        ? retrieveTruthForPrivatePrompt({
          scope: {
            relationId: activeRelationship.id,
            characterId: activeRelationship.characterId,
            userIdentityId: activeRelationship.userIdentityId,
            conversationId: activeRelationship.conversationId,
          },
          queryText: currentMessageContextText,
          limit: topK,
          claims: loadKnowledgeClaims().value,
          summaries: loadConversationSummaries().value,
          corrections: loadBehaviorCorrections().value,
        })
        : undefined;
      const shadowedLegacyMemoryIds = new Set(truthRetrieval?.shadowedLegacyMemoryIds || []);
      const visibleLegacyMemories = relevantMemories.filter((memory) =>
        !shadowedLegacyMemoryIds.has(memory.id) && !(memory.sourceKnowledgeClaimIds?.length),
      );
      if (visibleLegacyMemories.length > 0) {
        characterContextText += formatMemoriesForPrompt(visibleLegacyMemories, "\n- Reclaimed compatibility memories / 兼容旧记忆（仅作补充）:\n");
      }
      if (truthRetrieval) {
        characterContextText += formatTruthRetrievalForPrompt(truthRetrieval);
      }

      // A continuation synchronized while leaving the offline app is an explicit
      // handoff. Surface the newest one on the immediate return to online chat,
      // even when a short greeting is too vague for semantic retrieval.
      const interveningOfflineHandoff = getInterveningOfflineHandoff(userMsg?.timestamp);
      const latestOfflineContinuationMemory = interveningOfflineHandoff?.memory || selectFreshOfflineHandoffMemory({
        memories: memories || [],
        relationId: activeRelationship?.id,
        queryText: currentMessageContextText,
      });
      pendingOfflineHandoffForReply = getPendingOfflineHandoff();
      if (pendingOfflineHandoffForReply) {
        const matchingSummary = latestOfflineContinuationMemory
          && isOfflineStoryHandoffMemory(latestOfflineContinuationMemory, pendingOfflineHandoffForReply)
          ? latestOfflineContinuationMemory
          : undefined;
        const pendingOfflineHistoryAnchor = buildPendingOfflineTimelineHandoff(
          pendingOfflineHandoffForReply,
          userMsg?.timestamp,
          matchingSummary,
        );
        characterContextText += pendingOfflineHistoryAnchor;
        // Put the handoff immediately before the current user message as a
        // hidden history anchor as well as a system rule. Some compatible API
        // models underweight distant system blocks but reliably follow recent
        // chronological history.
        history.push({ role: "user", text: pendingOfflineHistoryAnchor });
      } else if (latestOfflineContinuationMemory) {
        characterContextText += buildOfflineTimelineHandoff(latestOfflineContinuationMemory, userMsg?.timestamp);
      }

      const userProfileText = `User Profile (interacting with you):
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}`;
      const userKnowledgeBoundary = formatUserKnowledgeBoundary();
      const relationshipContext = characterProjection.relationship?.content || "";
      const chatPromptContext = cognitiveContext
        ? buildChatPromptContext(cognitiveContext, {
          maxFacts: topK,
          // Truth-derived compatibility mirrors remain visible in the Memory
          // UI, but must not become a third prompt representation of one fact.
          relevantMemoryIds: visibleLegacyMemories.map((memory) => memory.id),
          hasConfirmedClaim: Boolean(truthRetrieval?.projection.confirmedFacts.length),
          hasDerivedSummary: Boolean(truthRetrieval?.summaries.length),
        })
        : undefined;
      const cognitivePromptBlock = formatChatPromptContext(chatPromptContext);
      const musicContext = activeRelationship && userMsg
        ? buildRelationMusicContext({
          userText: currentMessageContextText,
          ownerIdentityId: activeRelationship.userIdentityId,
          relationId: activeRelationship.id,
          tracks: musicTracks,
          identityStates: identityMusicStates,
          relationshipStates: relationshipMusicStates,
        })
        : "";
      const forumContext = activeRelationship
        ? buildRelationForumContext({
          ownerIdentityId: activeRelationship.userIdentityId,
          relationId: activeRelationship.id,
          conversationId: activeRelationship.conversationId || getConversationId(activeRelationship.id),
          messages: finalMsgs,
          shares: loadForumShares().value,
          threads: loadForumThreads().value,
        })
        : "";
      const diaryContext = activeRelationship
        ? buildRelationDiaryContext({
          ownerIdentityId: activeRelationship.userIdentityId,
          relationId: activeRelationship.id,
          conversationId: activeRelationship.conversationId || getConversationId(activeRelationship.id),
          messages: finalMsgs,
          shares: loadDiaryShares().value,
        })
        : "";
      const userMemoContext = activeRelationship
        ? loadUserMemoPromptContext({
          scopeKey: activeRelationship.id,
          queryText: currentMessageContextText,
          hasUserMessage: Boolean(userMsg),
          nowMs: requestTime.getTime(),
        }).text
        : "";

      // Context-aware trigger scanning: current message plus roughly ten recent messages.
      const scanContextParts = [
        currentMessageContextText,
        ...currentChatMessages.slice(-10).map(m => serializeMessageContentForPrompt(m, { mode: "history", userName: settings.name, characterName: activeCharacter.name }))
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");
      const characterBehaviorPrompt = buildCharacterBehaviorPrompt({
        character: activeCharacter,
        currentMessage: currentMessageContextText,
        recentContext: scanText,
      });

      // Use the unified World Book system blocks builder
      const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], activeChatCharId || "", scanText, {
        scenario: "chat",
        characterId: activeRelationship?.characterId || activeChatCharId || undefined,
        userIdentityId: activeRelationship?.userIdentityId || activeIdentityId,
        relationId: activeRelationship?.id,
      });

      // Assemble system instruction blocks
      let assembledInstructions: string[] = [];

      // 0. Base living human prompt (hidden base system instruction)
      assembledInstructions.push(LIVING_HUMAN_PROMPT);

      // 1. Main Prompt
      assembledInstructions.push(mainPromptText);
      if (musicContext) assembledInstructions.push(musicContext);
      if (forumContext) assembledInstructions.push(forumContext);
      if (diaryContext) assembledInstructions.push(diaryContext);
      if (userMemoContext) assembledInstructions.push(userMemoContext);

      // 1.2 Red Packet Reaction Prompt
      if (isRedPacket && userMsg) {
        assembledInstructions.push(buildRedPacketReactionPrompt(userMsg.content));
      }

      if (isCrossDayNewSession || historyPartition.hasCrossDayHistory) {
        assembledInstructions.push(NEW_DAY_CONVERSATION_BOUNDARY_PROMPT);
      }

      // 1.5 Time awareness prompt if enabled (default to true to ensure correct time perception)
      if (turnSettings.enableTimeAwareness) {
        assembledInstructions.push(buildTimeAwarenessPrompt(requestTime, timeLogString));
      }

      // Voice timing is only relevant to a voice-related turn. Including it on
      // every ordinary text reply needlessly dilutes the role and relationship
      // anchor in the prompt.
      const voiceIntervalPrompt = buildVoiceIntervalPrompt({
        characterName: activeCharacter.name,
        currentMessage: userMsg,
        recentMessages: slicedMsgs,
      });
      if (voiceIntervalPrompt) {
        assembledInstructions.push(voiceIntervalPrompt);
      }

      // 2. After Main Prompt entries
      const afterMainWorldBook = formatStructuralWorldBookSection(wbBlocks, "after_main_prompt");
      if (afterMainWorldBook) assembledInstructions.push(afterMainWorldBook);

      // 3. Before Character Definition entries
      const beforeCharacterWorldBook = formatStructuralWorldBookSection(wbBlocks, "before_char_def");
      if (beforeCharacterWorldBook) assembledInstructions.push(beforeCharacterWorldBook);

      // 4. Character definition and personality are independent, single-source blocks.
      assembledInstructions.push(characterDescriptionText);
      assembledInstructions.push(characterProjection.personality.content);
      if (relationshipContext) assembledInstructions.push(relationshipContext);
      if (characterBehaviorPrompt) assembledInstructions.push(characterBehaviorPrompt);
      if (characterContextText.trim()) assembledInstructions.push(characterContextText);

      // The adapter receives the relation-scoped cognitive snapshot and emits
      // a redacted prompt-safe supplement. It intentionally does not replace
      // the established persona, relationship, time, or Memory sections.
      if (cognitivePromptBlock) assembledInstructions.push(cognitivePromptBlock);

      // 5. After Character Definition entries
      const afterCharacterWorldBook = formatStructuralWorldBookSection(wbBlocks, "after_char_def");
      if (afterCharacterWorldBook) assembledInstructions.push(afterCharacterWorldBook);

      // 6. User Profile
      assembledInstructions.push(userProfileText);
      assembledInstructions.push(userKnowledgeBoundary);
      assembledInstructions.push(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES);
      assembledInstructions.push(DIRECT_CHAT_SINGLE_SPEAKER_RULE);
      assembledInstructions.push(`${INLINE_INNER_VOICE_INSTRUCTION}${activeCharacter.enableAutoTranslate ? "\n开启了全部翻译：必须同时提供 translation 字段，内容为 reply 的中文翻译，并保持相同段落/气泡结构。" : ""}`);

      // Recent dialogue is already present in the role-correct history. Do not
      // copy it into a system block: duplicate user wording encourages parroting
      // and can swap first-person ownership on short replies.
      assembledInstructions.push(CURRENT_SCENE_CONTINUITY_PROMPT);
      assembledInstructions.push(CHINESE_SEMANTIC_CONTINUITY_PROMPT);

      // 7. Before Chat History entries
      const beforeHistoryWorldBook = formatStructuralWorldBookSection(wbBlocks, "before_chat_history");
      if (beforeHistoryWorldBook) assembledInstructions.push(beforeHistoryWorldBook);

      // 8. WeChat Moments Context memory
      const momentsContext = getKnownMomentsContextString(allMoments, activeCharacter, activeIdentityId, settings.name);
      if (momentsContext && shouldLoadLongTermMemory) {
        assembledInstructions.push(momentsContext);
      }

      // 8.5 Offline stories context memory
      const offlineStoriesContext = getOfflineStoriesContextForOnlineChat();
      if (offlineStoriesContext && shouldLoadLongTermMemory) {
        assembledInstructions.push(offlineStoriesContext);
      }

      assembledInstructions.push(formatCharacterKnowledgeBoundary({ currentCharacterId: activeCharacter.id }));
      assembledInstructions.push(formatOnlineChatSpatialBoundary());
      assembledInstructions.push(CHARACTER_MEDIA_USAGE_RULES);

      // 8.8 Custom Sticker Pack availability for Character response (对方使用我的表情包)
      const allStickers1 = stickerGroups.flatMap(g => g.stickers);
      if (activeAttachModal === "calling") {
        assembledInstructions.push(...buildVoiceCallPrompts(callTopicShiftDetected));
      } else if (allStickers1.length > 0) {
        const userSentSticker = /^\[表情\]\|/.test(userMsg?.content || "");
        const stickerListStr = allStickers1.map((sticker) =>
          `- ${sticker.name}｜语义：${sticker.semanticDescription || `按名称“${sticker.name}”谨慎理解`}｜发送格式：[表情]|${sticker.name}|sticker://${sticker.id}`
        ).join("\n");
        assembledInstructions.push(buildStickerResponsePrompt(stickerListStr, userSentSticker));
      }

      if (proactiveOfflineAllowedModes.length > 0) {
        assembledInstructions.push(buildProactiveOfflineInvitationPrompt({
          allowedModes: proactiveOfflineAllowedModes,
          now: Date.now(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }));
      }
      if (pendingProactiveOfflineAppointment) {
        assembledInstructions.push(buildProactiveOfflineResponsePrompt({
          appointment: pendingProactiveOfflineAppointment,
          now: Date.now(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }));
      }
      if (wbBlocks.allTriggered.length > 0) assembledInstructions.push(WORLD_BOOK_CONTEXT_PRIORITY);
      const systemInstruction = finalizeCharacterChatSystemInstruction({
        instructions: assembledInstructions,
        characterProjection,
        characterDescriptionText,
        diagnosticLabel: "direct chat prompt",
        finalPersonaRules: wbBlocks.allTriggered
          .filter((entry) => entry.purpose === "persona_rule")
          .map((entry) => `【${entry.title}】\n${entry.content}`),
        finalLanguageInstruction: formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(
          activeCharacter,
          getVisibleWorldBookEntries(worldBookEntries || [], activeChatCharId || "", {
            scenario: "chat",
            characterId: activeRelationship?.characterId || activeChatCharId || undefined,
            userIdentityId: activeRelationship?.userIdentityId || activeIdentityId,
            relationId: activeRelationship?.id,
          }).map((entry) => `${entry.title}\n${entry.content}`),
        )),
      });

      // Custom tool/attachment format descriptions for character context
      const promptMessage = userMsg
        ? serializeMessageContentForPrompt(userMsg, {
          mode: "current",
          userName: settings.name,
          characterName: activeCharacter.name,
        })
        : "请继续续写我们的故事，继续推进剧情走向或日常对话交互。";
      const imageDataUrl = userMsg?.sender === "user"
        && /^data:image\//i.test(userMsg.content.trim())
        ? userMsg.content.trim()
        : undefined;
      const imageInstruction = imageDataUrl
        ? "\n【当前用户消息包含真实图片】请先直接观察并识别图片中的主体、物品和场景，再回答；不要仅凭‘发送图片’这段文字猜测，也不要把包、袋子等物品擅自判断成衣服。"
        : "";

      const data = await requestDirectChatTurn({
        prompt: { scenario: "direct-chat", message: `${promptMessage}${imageInstruction}`, imageDataUrl, history, systemInstruction, historyInjections: wbBlocks.at_depth },
        settings,
        signal,
        includeInnerVoice: true,
      });

      if (signal?.aborted) return;

      if (data && data.text) {
        const proactiveOfflineResponseParse = parseProactiveOfflineResponseDirective({
          text: data.text,
          appointment: pendingProactiveOfflineAppointment,
          latestUserText: userMsg?.sender === "user" ? userMsg.content : "",
          now: Date.now(),
        });
        data.text = proactiveOfflineResponseParse.visibleText;
        const proactiveOfflineParse = parseProactiveOfflineInvitationDirective({
          text: data.text,
          allowedModes: proactiveOfflineAllowedModes,
          now: Date.now(),
        });
        data.text = proactiveOfflineParse.visibleText;
        // Clean any accidental "[发送时间: ...]" prefixes
        data.text = data.text.replace(/\[\s*发送时间\s*:\s*[^\]]+\]/gi, "").trim();

        data.text = stripInternalDeliveryMarkers(data.text);
        if (isOfflineModeActive) {
          const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((activeCharacter?.personality || "") + (activeCharacter?.backstory || ""));
          const paragraphs = data.text.split("\n").map(p => {
            let trimmed = p.trim();
            if (!keepPeriods && trimmed.endsWith("。")) {
              trimmed = trimmed.replace(/。+$/, "");
            }
            return trimmed;
          }).filter(Boolean);
          let newMsgs: Message[] = [];
          if (paragraphs.length > 0) {
            newMsgs = paragraphs.map((para, pIdx) => ({
              id: createId("offline-reply"),
              characterId: activeChatCharId,
              sender: "character",
              content: para,
              timestamp: Date.now() + pIdx,
              isOffline: true,
              isNarration: false
            }));
          } else {
            let finalContent = data.text;
            if (!keepPeriods && finalContent.endsWith("。")) {
              finalContent = finalContent.replace(/。+$/, "");
            }
            newMsgs = [{
              id: (Date.now() + 1).toString(),
              characterId: activeChatCharId,
              sender: "character",
              content: finalContent,
              timestamp: Date.now(),
              isOffline: true,
              isNarration: false
            }];
          }

          // Send each segment with realistic typing delays and real-time timestamps
          for (let idx = 0; idx < newMsgs.length; idx++) {
            if (signal?.aborted) return;
            const m = newMsgs[idx];
            setIsTyping(true);
            const chars = m.content.length;
            const duration = Math.max(800, Math.min(3500, chars * 100)) + (Math.floor(Math.random() * 500) - 200);
            await new Promise(resolve => setTimeout(resolve, Math.max(500, duration)));
            if (signal?.aborted) return;
            
            m.timestamp = Date.now();
            // This reply carries the captured conversation scope. Do not pass
            // it through the currently visible chat's delivery wrapper: the
            // user may have opened another private conversation while the API
            // request was in flight.
            onSendMessageRaw(m);
            setIsTyping(false);
            
            if (idx < newMsgs.length - 1) {
              await new Promise(resolve => setTimeout(resolve, Math.max(400, Math.floor(Math.random() * 400) + 400)));
              if (signal?.aborted) return;
            }
          }

          chatSideEffectController.afterReplySuccess({
            userMsg,
            currentChatMessages,
            createdMessages: newMsgs,
            activeCharacter,
            activeRelationship,
            relationships,
            isOffline: true,
            activeOfflineStoryId,
            extractInterval: recallSettings?.extractInterval,
          });
        } else {
          const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((activeCharacter?.personality || "") + (activeCharacter?.backstory || ""));
          const replyCandidates = createDirectReplyCandidates({
            rawText: data.text,
            disableBracketActions: turnSettings.disableBracketActions,
            keepPeriods,
            context: replyContext,
            characterName: activeCharacter?.name,
            userName: settings.name,
            allowEmoji: mayCharacterUseEmoji({
              latestUserMessage: userMsg?.content,
              recentCharacterMessages: currentChatMessages
                .filter((message) => message.sender === "character" && message.characterId === activeChatCharId)
                .map((message) => message.content),
            }),
            createId: () => createId("online"),
            currentTime: () => Date.now(),
            translationText: data.translation,
            transformBubble: (bubbleText, idx) => {
              const isVoice = activeAttachModal !== "calling" && canConvertBubbleToVoice(turnCharacter, userMsg, messages, idx, bubbleText, replyContext);
              if (!isVoice) return bubbleText;
              const secs = Math.max(1, Math.min(60, Math.ceil(bubbleText.length * 0.35 + 1.2)));
              return `[语音]|${secs}|${bubbleText}`;
            },
          });
          const createdMessages = await deliverDirectReplyCandidates({
            candidates: replyCandidates,
            signal,
            shouldCancel: isCancelledCallTurn,
            onTyping: setIsTyping,
            onSendMessage: onSendMessageRaw,
          });
          if (signal?.aborted) return;

          if (createdMessages.length > 0) {
            if (data.innerVoice && activeRelationship) {
              const triggerMessage = createdMessages[createdMessages.length - 1];
              const latest = loadInnerVoiceRecords([]).value;
              const scope = { kind: "direct" as const, relationId: activeRelationship.id, messageId: triggerMessage.id };
              if (!findInnerVoiceByMessage(latest, scope)) {
                const record = createInlineInnerVoiceRecord({
                  character: activeCharacter,
                  triggerMessage,
                  relationId: activeRelationship.id,
                  conversationId: activeRelationship.conversationId || getConversationId(activeRelationship.id),
                  payload: data.innerVoice,
                  settings,
                });
                saveInnerVoiceRecords([...latest, record]);
              }
            }
            recordPendingOfflineHandoffDelivery(pendingOfflineHandoffForReply);
            if (proactiveOfflineResponseParse.directive && pendingProactiveOfflineAppointment && userMsg) {
              const updatedAppointment = applyProactiveOfflineResponse({
                appointment: pendingProactiveOfflineAppointment,
                directive: proactiveOfflineResponseParse.directive,
                userMessageId: userMsg.id,
                characterMessageId: createdMessages[0].id,
                now: createdMessages[0].timestamp,
              });
              if (!updatedAppointment || !onSaveAppointment?.(updatedAppointment)) {
                console.warn("Proactive offline response could not be persisted.");
              }
            }
            if (proactiveOfflineParse.directive && turnRelationship) {
              const saved = persistProactiveOfflineInvitation({
                relationship: turnRelationship,
                directive: proactiveOfflineParse.directive,
                sourceMessageId: createdMessages[0].id,
                now: createdMessages[0].timestamp,
              });
              if (!saved) console.warn("Proactive offline invitation could not be persisted.");
            }
            // A character can naturally complete an already-started arrival
            // exchange (for example, “我在门口”) without emitting a special
            // invitation directive.  Check the transcript after all reply
            // bubbles are persisted so both sides' concrete presence claims
            // are available before handing off to the offline workspace.
            if (turnRelationship && !replyContext.isGroup) {
              maybeAutoStartOfflineFromPresence({
                relationship: turnRelationship,
                messages: [...sourceMsgs, ...createdMessages],
                sourceMessage: createdMessages[createdMessages.length - 1],
              });
            }
          }

          chatSideEffectController.afterReplySuccess({
            userMsg,
            currentChatMessages,
            createdMessages,
            activeCharacter,
            activeRelationship,
            relationships,
            isOffline: false,
            activeOfflineStoryId,
            extractInterval: recallSettings?.extractInterval,
          });
        }
      } else {
        if (isCancelledCallTurn() || signal?.aborted) return;
        const errMsg = createCharacterTextMessage({
          id: (Date.now() + 1).toString(),
          context: replyContext,
          content: `⚠️ [系统出错]：${(data as any).error || "智能体未能理解该消息。"}`,
          timestamp: Date.now(),
        });
        onSendMessageRaw(errMsg);
      }
    } catch (err: any) {
      if (isCancelledCallTurn() || signal?.aborted) return;
      const errMsgStr = err?.message || "";
      const isQuotaOrKeyError = errMsgStr.toLowerCase().includes("api_key") || 
                                errMsgStr.toLowerCase().includes("key") || 
                                errMsgStr.toLowerCase().includes("quota") || 
                                errMsgStr.toLowerCase().includes("limit") || 
                                errMsgStr.toLowerCase().includes("403") || 
                                errMsgStr.toLowerCase().includes("400") ||
                                errMsgStr.toLowerCase().includes("invalid");

      const errMsg = createCharacterTextMessage({
        id: (Date.now() + 1).toString(),
        context: replyContext,
        content: isQuotaOrKeyError
          ? `⚠️ [连接错误]：智能体响应失败 (${errMsgStr})。请检查 API Key 是否正确、是否过期或余额不足。`
          : `⚠️ [离线错误]：无法建立与智能体服务器的连接 (${errMsgStr || "请确认网络并重试"})。`,
        timestamp: Date.now(),
      });
      onSendMessageRaw(errMsg);
    } finally {
      setIsTyping(false);
    }
  };

  const chatReplyController = createChatReplyController({
    getContext: () => {
      const currentCharacter = latestActiveCharacterRef.current;
      const currentRelationship = latestActiveRelationshipRef.current;
      return createChatRuntimeContext({
        characterId: activeChatCharId && currentCharacter ? activeChatCharId : null,
        relationId: currentRelationship?.id,
        conversationId: currentCharacter?.isGroupChat
          ? `group:${currentCharacter.id}`
          : (currentRelationship?.conversationId || (currentRelationship ? getConversationId(currentRelationship.id) : null)),
        userIdentityId: activeIdentityId,
        isGroup: Boolean(currentCharacter?.isGroupChat),
        groupId: currentCharacter?.isGroupChat ? currentCharacter.id : undefined,
      });
    },
    getCognitiveContext: (runtimeContext) => {
      const currentCharacter = latestActiveCharacterRef.current;
      const currentRelationship = latestActiveRelationshipRef.current;
      if (runtimeContext.isGroup
        || !currentCharacter
        || !currentRelationship
        || !runtimeContext.characterId
        || !runtimeContext.relationId
        || runtimeContext.characterId !== currentCharacter.id
        || runtimeContext.relationId !== currentRelationship.id
        || runtimeContext.userIdentityId !== currentRelationship.userIdentityId) return undefined;

      const events: CharacterCognitiveEventCandidate[] = listCharacterEventsByRelation(currentRelationship.id).map((event) => ({
        event,
        // These are the only deterministic event kinds currently captured.
        // Any future kind remains private until its prompt visibility is
        // deliberately reviewed by its own source adapter.
        promptVisibility: event.status === "active"
          && (event.kind === "relationship_created" || event.kind === "offline_story_completed")
          ? "safe"
          : "private",
      }));

      try {
        const relationshipProjection = buildRelationshipCognitiveProjection({
          relation: currentRelationship,
          events: events.map(({ event }) => event),
          now: Date.now(),
        });
        return buildCharacterCognitiveContext({
          character: currentCharacter,
          relation: currentRelationship,
          memories: memories || [],
          events,
          timeContext: { now: Date.now() },
          knowledgeBoundary: createDirectChatKnowledgeBoundary(),
          conversationId: runtimeContext.conversationId || undefined,
          relationshipTimeline: relationshipProjection.timeline,
          routine: resolveChatRoutine(
            buildCharacterRoutine(currentCharacter.routine),
            resolveChatTurnSettings(currentCharacter).enableTimeAwareness,
          ),
        });
      } catch {
        // Cognitive context is read-only and must never block the legacy reply
        // path when a malformed legacy relationship cannot be projected.
        return undefined;
      }
    },
    generateGroupReply: generateResponseForGroupChat,
    generateDirectReply: ({ userMsg, customHistoryOverride, cognitiveContext, context, signal }) =>
      executeDirectReplyPipeline(userMsg, customHistoryOverride, cognitiveContext, context, signal),
  });

  const chatSideEffectController = createChatSideEffectController({
    offlineStories,
    onSaveOfflineStory,
    extractMemories: (messagesToCompress) => handleExtractMemories(messagesToCompress),
    onSaveRelationships,
    onSaveCharacter,
  });

  const generateResponseForUserMessage = async (
    userMsg: Message | null,
    customHistoryOverride?: Message[],
    signal?: AbortSignal,
  ) => chatReplyController.generate({ userMsg, customHistoryOverride, signal });

  const sendCustomMessage = (
    contentString: string,
    capturedContext = activeRuntimeContext,
    options: { triggerReply?: boolean; redPacket?: RedPacketPayload } = {},
  ) => {
    if (!activeChatCharId || !activeCharacter || !isCapturedRuntimeCurrent(capturedContext)) return;
    const userMsg = createUserTextMessage({
      id: Date.now().toString(),
      context: capturedContext,
      content: contentString,
      timestamp: Date.now(),
      redPacket: options.redPacket,
    });
    const normalizedUserMsg = { ...userMsg, content: normalizePaymentMarkup(userMsg.content) };
    onSendMessage(normalizedUserMsg);
    if (!capturedContext.isGroup && capturedContext.relationId && capturedContext.conversationId && capturedContext.userIdentityId) {
      const claim = createDeterministicArtifactClaim({
        message: normalizedUserMsg,
        scope: {
          relationId: capturedContext.relationId,
          characterId: capturedContext.characterId,
          userIdentityId: capturedContext.userIdentityId,
          conversationId: capturedContext.conversationId,
        },
      });
      if (claim && !appendKnowledgeClaim(claim).success) console.warn("Failed to capture chat-artifact knowledge claim.");
    }
    // Sending a sticker is an ambient reaction rather than a request for a
    // conversational turn. Keep it visible in history, but wait for the user
    // to send text before asking the character to answer.
    if (options.triggerReply !== false) {
      generateResponseForUserMessage(normalizedUserMsg);
    }
  };

  const enrichStickerSemanticDescription = async (sticker: Sticker) => {
    if (sticker.semanticDescription || !settings.apiKey || stickerSemanticAnalysisInFlightRef.current.has(sticker.id)) return;
    stickerSemanticAnalysisInFlightRef.current.add(sticker.id);
    try {
      const imageBlob = await loadStickerImageBlob(sticker);
      const analysis = imageBlob
        ? await aiAnalyzeSticker(
          imageBlob,
          settings.apiKey,
          settings.selectedModel,
          settings.apiEndpoint,
        )
        : await aiAnalyzeRemoteSticker(
          sticker.url,
          settings.apiKey,
          settings.selectedModel,
          settings.apiEndpoint,
        );
      if (analysis.description) {
        const resolvedSticker = {
          ...sticker,
          semanticDescription: analysis.description,
        };
        const ownerGroup = stickerGroups.find((group) => group.stickers.some((item) => item.id === sticker.id));
        if (ownerGroup) {
          const updatedGroup = {
            ...ownerGroup,
            stickers: ownerGroup.stickers.map((item) => item.id === sticker.id ? resolvedSticker : item),
          };
          // Cache enrichment after the message is already visible. A slow
          // provider or IndexedDB write must never block sticker delivery.
          await stickerDb.saveGroup(updatedGroup);
          setStickerGroups((groups) => groups.map((group) => group.id === updatedGroup.id ? updatedGroup : group));
        }
      }
    } catch (error) {
      // A text-only or temporarily unavailable multimodal provider must not
      // prevent the user from sending the sticker. Its name remains a safe fallback.
      console.warn("Sticker semantic analysis unavailable; using its saved name.", error);
    } finally {
      stickerSemanticAnalysisInFlightRef.current.delete(sticker.id);
    }
  };

  const sendStickerMessage = (sticker: Sticker) => {
    const capturedContext = activeRuntimeContext;
    const semanticDescription = sticker.semanticDescription || `这是名为“${sticker.name}”的聊天表情包`;

    // Deliver the sticker optimistically. Visual understanding is enrichment
    // for later turns, not a prerequisite for showing the user's message.
    sendCustomMessage(
      `[表情]|${sticker.name}|sticker://${sticker.id}|${encodeURIComponent(semanticDescription)}`,
      capturedContext,
    );

    if (!sticker.semanticDescription && settings.apiKey) {
      void enrichStickerSemanticDescription(sticker);
    }
  };

  /** This is the only AppChat path that imports the image-generation service.
   * Normal reply, proactive, memory, Moment and Inner Voice paths never call it. */
  const generateAndSendCharacterImage = async (trigger: "manual" | "explicit-user-text", userText: string): Promise<boolean> => {
    if (!activeCharacter) return false;
    setIsGeneratingImage(true);
    setImageGenerationError(null);
    const capturedContext = activeRuntimeContext;
    try {
      const result = await generateCharacterImageForDelivery({
        activeCharacter,
        activeRelationship,
        currentMessages: currentChatMessages,
        characters,
        settings,
        trigger,
        userText,
        createId: () => createId("image"),
        isRuntimeCurrent: () => isCapturedRuntimeCurrent(capturedContext),
      });
      if (result.status === "missing-context") {
        showToast("群聊图片需要先有一位角色发言，以确定生成图片的角色。");
        return false;
      }
      if (result.status === "stale") {
        showToast("关系已切换，已取消发送刚生成的图片。");
        return false;
      }
      onSendMessage(result.message);
      const records = loadImageGenerationRecords([]).value;
      saveImageGenerationRecords([...records, result.record]);
      setShowImageGenerator(false);
      showToast("角色图片已生成并发送。");
      return true;
    } catch (error: any) {
      const message = error.message || "图片生成失败，请检查图片 API 配置。";
      setImageGenerationError(message);
      showToast(message);
      return false;
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const {
    quotedMessage,
    setQuotedMessage,
    handleSendOnly,
    handleSendAndReply,
    stopReply,
    isReplyInFlight,
  } = useChatController({
    activeChatCharId,
    activeCharacter,
    currentChatMessages,
    onSendMessage,
    generateResponseForUserMessage,
    generateAndSendCharacterImage,
    offlineStories,
    onSaveOfflineStory,
    isOfflineModeActive,
    isInputNarration,
    activeOfflineStoryId,
    runtimeContext: activeRuntimeContext,
    onReplyStopped: () => {
      setIsTyping(false);
      setTypingCharacterOverride(null);
    },
  });

  const { clearFriendScopedMemory } = useChatRelationshipCleanupActions({
    moments,
    memories,
    relationships,
    offlineStories,
    clearMessagesAndLinkedArtifacts,
    onSaveRelationships,
    onDeleteMomentsByRelation,
    onSaveMemories,
    onDeleteRelationshipMusic,
    onDeleteOfflineStory,
    onClearMomentState: (relationMomentIds, relationCommentIds) => {
      setMomentTranslations((previous) => Object.fromEntries(
        Object.entries(previous).filter(([momentId]) => !relationMomentIds.has(momentId)),
      ));
      setMomentFavorites((previous) => previous.filter((favorite) => !relationMomentIds.has(favorite.momentId)));
      setCommentTranslations((previous) => Object.fromEntries(
        Object.entries(previous).filter(([key]) => {
          const separator = key.indexOf(":");
          const momentId = separator >= 0 ? key.slice(0, separator) : key;
          return !relationMomentIds.has(momentId) && !relationCommentIds.has(key);
        }),
      ));
    },
    proactiveMessageInFlightRef,
    setInitiatedChatIds,
    setLastReadTimestamps,
    setRedPacketStatuses,
  });

  const { handleDeleteFriend } = useChatDeleteFriendAction({
    activeCharacter,
    activeIdentityId,
    activeRelationship,
    activeChatRelationId,
    relationships,
    characters,
    memories,
    offlineStories,
    relationForCharacter,
    belongsToActiveIdentity,
    clearMessagesAndLinkedArtifacts,
    onSaveRelationships,
    onDeleteMomentsByRelation,
    onSaveMemories,
    onDeleteRelationshipMusic,
    onDeleteOfflineStory,
    onSaveCharacter,
    setRedPacketStatuses,
    proactiveMessageInFlightRef,
    setInitiatedChatIds,
    setLastReadTimestamps,
    setIsShowingCardModal,
    setActiveChatCharId,
    setActiveChatRelationId,
    showToast,
  });


  const LONG_PRESS_DELAY = 500;
  const LONG_PRESS_MOVE_TOLERANCE = 10;
  const longPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastActiveCharIdRef = useRef<string | null>(null);
  const lastMsgCountRef = useRef<number>(0);

  const messagesRef = useRef<Message[]>(messages);
  const processedCatchupsRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Enabled contacts may call while their chat is open, with relationship-scoped
  // persistence, quiet-hours checks, daily limits and rejection backoff.
  useProactiveCallScheduler({
    character: activeCharacter,
    relationship: activeRelationship,
    voiceCallScope: activeVoiceCallScope,
    activeAttachModal,
    messagesRef,
    isOfflineStoryActiveFor,
    updateRelationshipSession,
    beginVoiceCall,
  });

  // Pre-seed moments if state empty
  const allMoments = (moments.length === 0 ? PRESEED_MOMENTS : moments)
    .filter((moment) => belongsToActiveIdentity(moment.ownerIdentityId));

  const latestActiveMessageId = messages
    .filter((message) => !message.isOffline && (activeRelationship
      ? message.relationId === activeRelationship.id
      : message.characterId === activeChatCharId && activeCharacter?.isGroupChat))
    .at(-1)?.id || null;

  // Auto scroll in chats with smart detection
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!activeChatCharId || !container) {
      // Closing a chat must make the next visit a fresh open, including when
      // the user opens the same character again.
      if (!activeChatCharId) {
        lastActiveCharIdRef.current = null;
        lastMsgCountRef.current = 0;
      }
      return;
    }

    const currentChatMsgs = messages.filter((message) => !message.isOffline && (activeRelationship
      ? message.relationId === activeRelationship.id
      : message.characterId === activeChatCharId && activeCharacter?.isGroupChat));
    const msgCount = currentChatMsgs.length;

    const isFreshOpen = lastActiveCharIdRef.current !== activeChatCharId;
    const lastMsg = currentChatMsgs[currentChatMsgs.length - 1];
    const isUserSent = lastMsg && lastMsg.sender === "user";

    // Measure distance to bottom
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceToBottom < 250;

    // Update refs for next run
    lastActiveCharIdRef.current = activeChatCharId;
    lastMsgCountRef.current = msgCount;

    if (isFreshOpen || isUserSent || isNearBottom || isTyping) {
      const behavior = isFreshOpen ? "auto" : "smooth";
      // The message list can finish its layout one or more frames after the
      // chat shell mounts, especially on mobile.
      const scrollAfterLayout = () => {
        requestAnimationFrame(() => {
          const currentContainer = scrollContainerRef.current;
          if (currentContainer) scrollContainerToBottom(currentContainer, behavior);
        });
      };
      scrollAfterLayout();
      const timer = window.setTimeout(scrollAfterLayout, 80);
      const lateTimer = window.setTimeout(scrollAfterLayout, 240);
      return () => {
        window.clearTimeout(timer);
        window.clearTimeout(lateTimer);
      };
    }
  }, [messages.length, activeChatCharId, activeChatRelationId, latestActiveMessageId, isTyping]);

  // The root viewport controller owns sizing. Only keep the latest message visible
  // when the reader was already near the bottom; opening the keyboard must not pull
  // someone away from older history they are reading.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleViewportChange = (event: Event) => {
      if (!activeChatCharId) return;
      const container = scrollContainerRef.current;
      if (!container) return;
      const metrics = (event as CustomEvent<VisualViewportMetrics>).detail;
      const visualViewport = window.visualViewport;
      const composer = document.querySelector<HTMLElement>(
        "#conv-screen .chat-input-area",
      );
      if (composer) {
        requestAnimationFrame(() => {
          const viewportBottom = visualViewport
            ? visualViewport.offsetTop + visualViewport.height
            : window.innerHeight;
          const overlap = Math.max(0, composer.getBoundingClientRect().bottom - viewportBottom);
          document.documentElement.style.setProperty("--chat-keyboard-lift", `${Math.ceil(overlap)}px`);
        });
      }
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      // Keyboard shrink increases this distance by roughly the keyboard inset.
      // Compensate for it without dragging a reader away from older history.
      const nearBottomThreshold = 250 + Math.max(0, metrics?.keyboardInset ?? 0);
      if (distanceFromBottom > nearBottomThreshold) return;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current === container) {
          scrollContainerToBottom(container);
        }
      });
    };

    window.addEventListener(VISUAL_VIEWPORT_CHANGE_EVENT, handleViewportChange);
    return () => {
      window.removeEventListener(VISUAL_VIEWPORT_CHANGE_EVENT, handleViewportChange);
      document.documentElement.style.removeProperty("--chat-keyboard-lift");
    };
  }, [activeChatCharId]);

  useEffect(() => {
    if (!pendingDiaryShareMessageId || !activeRelationship || !activeCharacter || activeCharacter.isGroupChat) return;
    if (activeRelationship.userIdentityId !== activeIdentityId) return;
    const shareMessage = messages.find((message) =>
      message.id === pendingDiaryShareMessageId
      && message.diaryShareId
      && message.relationId === activeRelationship.id
      && message.conversationId === (activeRelationship.conversationId || getConversationId(activeRelationship.id)));
    if (!shareMessage || diaryShareReplyInFlightRef.current.has(shareMessage.id)) return;
    diaryShareReplyInFlightRef.current.add(shareMessage.id);
    const relationHistory = messages.filter((message) => message.relationId === activeRelationship.id && message.conversationId === shareMessage.conversationId && !message.isOffline);
    void generateResponseForUserMessage(shareMessage, relationHistory).finally(() => {
      diaryShareReplyInFlightRef.current.delete(shareMessage.id);
      onDiaryShareHandled?.();
    });
  }, [pendingDiaryShareMessageId, activeRelationship?.id, activeRelationship?.conversationId, activeRelationship?.userIdentityId, activeCharacter?.id, activeCharacter?.isGroupChat, activeIdentityId, messages.length, onDiaryShareHandled]);

  // Manual Trigger Proactive Message simulation

  const { handleSaveSettings } = useChatSaveSettings({
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
    draftEnableAutoTranslate,
    draftEnableProactiveChat,
    draftProactiveStartTime,
    draftProactiveEndTime,
    draftEnableProactiveOffline,
    draftRemark,
    draftAvatar,
    draftIsPinned,
    draftChatBg,
    draftCustomCss,
    draftChatIcons,
    draftChatStylePreset,
    draftEnableProactiveCall,
    draftProactiveChatInterval,
    draftDisableBracketActions,
    draftHistoryMemoryLimit,
    draftContextMemoryLimit,
    draftRetrievalHistoryLimit,
    draftArchiveTemplateType,
    draftAutoArchiveInterval,
    draftEnableAutoArchive,
    draftEnableTimeAwareness,
    draftMinimaxVoiceId,
    draftMosslandVoiceId,
    draftMinimaxSpeed,
    draftVoiceFrequency,
    draftEnableImageGeneration,
    draftImageAppearancePrompt,
    draftImageNegativePrompt,
    draftImageReferenceAssetId,
    draftImageReferenceMimeType,
  });

  const { handleExtractMemories } = useChatMemoryExtraction({
    activeChatCharId,
    activeCharacter,
    activeDirectScope,
    currentChatMessages,
    memories,
    settings,
    recallSettings,
    setIsCompressingMemory,
    onSaveMemories,
    groupMembers: activeCharacter?.isGroupChat
      ? (activeCharacter.memberIds || []).map((id) => characters.find((character) => character.id === id)).filter(Boolean) as Character[]
      : [],
    characters,
    relationships,
    activeIdentityId,
  });
  const { updateDraftChatIcon } = useChatDraftChatIcon(setDraftChatIcons);
  const { handleRegenerateResponse } = useChatRegenerationAction({
    activeChatCharId, activeCharacter, onDeleteMessage, deleteMessageAndLinkedImage, currentChatMessages,
    activeRelationship, listCharacterEventsByRelation, buildRelationshipCognitiveProjection, buildCharacterCognitiveContext,
    createDirectChatKnowledgeBoundary, resolveChatRoutine, buildCharacterRoutine, resolveChatTurnSettings, setIsTyping,
    latestActiveCharacterRef, settings, serializeMessageContentForPrompt, shouldUseCrossDayHistoryBoundary,
    activeAttachModal, callingStatus, callTranscript, detectCallTopicShift, partitionDirectChatHistoryByCurrentDay,
    formatHistoricalMessageForPrompt, describeHistoricalRelativeTime, serializeMessageToPromptTurns, buildCrossDayHistoricalReferencePrompt, buildDirectChatMainPrompt,
    projectCharacterPrompt, recallSettings, MemoryService, memories, retrieveTruthForPrivatePrompt,
    loadKnowledgeClaims, loadConversationSummaries, loadBehaviorCorrections, formatMemoriesForPrompt, formatUserKnowledgeBoundary,
    formatTruthRetrievalForPrompt, getInterveningOfflineHandoff, selectFreshOfflineHandoffMemory,
    getPendingOfflineHandoff, buildPendingOfflineTimelineHandoff, isOfflineStoryHandoffMemory,
    buildOfflineTimelineHandoff, allMoments, activeIdentityId, getKnownMomentsContextString,
    getOfflineStoriesContextForOnlineChat, musicTracks, identityMusicStates, relationshipMusicStates,
    buildRelationMusicContext, loadForumShares, loadForumThreads, buildRelationForumContext, getConversationId,
    loadDiaryShares, buildRelationDiaryContext, loadUserMemoPromptContext, buildCharacterBehaviorPrompt,
    worldBookEntries, buildWorldBookSystemBlocks, LIVING_HUMAN_PROMPT, buildRedPacketReactionPrompt,
    NEW_DAY_CONVERSATION_BOUNDARY_PROMPT, buildTimeAwarenessPrompt, buildVoiceIntervalPrompt,
    formatStructuralWorldBookSection, buildVoiceCallPrompts, stickerGroups, isRedPacketMarkup,
    buildStickerResponsePrompt, WORLD_BOOK_CONTEXT_PRIORITY, finalizeCharacterChatSystemInstruction,
    formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage, getVisibleWorldBookEntries,
    formatCharacterKnowledgeBoundary, formatOnlineChatSpatialBoundary, CHARACTER_MEDIA_USAGE_RULES,
    DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, DIRECT_CHAT_SINGLE_SPEAKER_RULE, CURRENT_SCENE_CONTINUITY_PROMPT,
    CHINESE_SEMANTIC_CONTINUITY_PROMPT, generateRegeneratedChatTurn, createId, onSendMessage, formatChatPromptContext, buildChatPromptContext,
    recordPendingOfflineHandoffDelivery,
  });

  // Automated background proactive message generator for any character
  const triggerProactiveFor = async (relationId: string, customTaskText?: string, backdateTimestamp?: number) => {
    if (backgroundGenerationBlockedRef.current || isOfflineStoryActiveFor(relationId) || proactiveMessageInFlightRef.current.has(relationId)) return;
    const relationship = relationships.find((relation) => relation.id === relationId);
    const friend = relationship && characters.find((character) => character.id === relationship.characterId);
    if (!friend || friend.isGroupChat) return;

    proactiveMessageInFlightRef.current.add(relationId);
    try {
      let instructionsPrompt = `Instructions:
1. Follow the character's configured language and nationality according to the character language policy. Maintain character role-play thoroughly.
2. Use a natural WeChat style. Reply length, warmth, initiative, and emotional intensity must follow the character profile and relationship.
3. This is an initiator message. Let the character decide whether to share, ask, tease, express affection, stay restrained, or use another natural opening; do not default to caretaking or a generic check-in.
4. Do NOT say you are an AI or Gemini, unless that is your explicit character人设.`;

      if (friend.disableBracketActions) {
        instructionsPrompt += `\n5. [🚨 CRITICAL FORMAT RULE]: Do NOT use any bracketed/parenthesized action descriptions, physical gestures, facial expressions, or ambient narration (e.g., "(微笑)", "（叹气）", "(摸摸头)", "*笑*", etc.) in your messages. You must interact using pure conversational speech/dialogue ONLY, without any action descriptions, unless such expressions are an absolute, unique signature part of how this specific character literally types/speaks.`;
      }

      const charMsgs = messagesRef.current.filter((message) => message.relationId === relationId);
      const proactiveOfflineEligibility = evaluateProactiveOfflineEligibility({
        enabled: relationship.enableProactiveOffline === true,
        scope: {
          relationId: relationship.id,
          characterId: relationship.characterId,
          userIdentityId: relationship.userIdentityId,
        },
        appointments,
        context: deriveProactiveOfflineContextEvidence({ messages: charMsgs, source: "proactive_contact" }),
      });
      const proactiveOfflineAllowedModes: AppointmentMode[] = proactiveOfflineEligibility.eligible
        ? proactiveOfflineEligibility.allowedModes
        : [];
      if (proactiveOfflineAllowedModes.length > 0) {
        instructionsPrompt += `\n\n${buildProactiveOfflineInvitationPrompt({
          allowedModes: proactiveOfflineAllowedModes,
          now: Date.now(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })}`;
      }
      const recentConversation = analyzeRecentConversation(charMsgs, friend.id);
      const conversationGuidance = formatProactiveConversationGuidance(recentConversation);
      const scanText = charMsgs.slice(-10).map((message) => serializeMessageContentForPrompt(message, { mode: "history", userName: settings.name, characterName: friend.name })).join("\n");
      const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], friend.id, scanText, {
        scenario: "chat",
        characterId: relationship.characterId,
        userIdentityId: relationship.userIdentityId,
        relationId: relationship.id,
      });
      const wbPrompt = wbBlocks.formattedAll;
      const timeContext = friend.enableTimeAwareness !== false
        ? `\n【当前现实时间】\n${formatLocalTimeContext()}\n`
        : "";
      const knowledgeBoundary = formatCharacterKnowledgeBoundary({ currentCharacterId: friend.id });
      const truthPrompt = formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({
        scope: {
          relationId: relationship.id,
          characterId: relationship.characterId,
          userIdentityId: relationship.userIdentityId,
          conversationId: relationship.conversationId,
        },
        queryText: recentConversation.recentMessages.slice(-2).map((message) => serializeMessageContentForPrompt(message, { mode: "history", userName: settings.name, characterName: friend.name })).join(" "),
        limit: recallSettings?.recallCount || 5,
        claims: loadKnowledgeClaims().value,
        summaries: loadConversationSummaries().value,
        corrections: loadBehaviorCorrections().value,
      }));
      const cognitiveContext = buildProactiveCognitiveContext({
        character: friend,
        relationship,
        memories: memories || [],
        events: listCharacterEventsByRelation(relationId),
        occurredAt: Date.now(),
        routine: resolveChatRoutine(
          buildCharacterRoutine(friend.routine),
          friend.enableTimeAwareness !== false,
        ),
        timeAwareness: friend.enableTimeAwareness !== false,
        topicHistory: loadProactiveTopicRecords().value,
      });
      const proactiveCharacterProjection = projectCharacterPrompt(friend, relationship.relationship);

      const taskPrompt = customTaskText || "It has been 3 hours since the last conversation. Start a message in the way this character would naturally initiate contact with this user. Do not impose concern, warmth, brevity, or a generic check-in.";

      const systemInstruction = buildProactiveChatSystemInstruction({
        characterName: friend.name,
        description: proactiveCharacterProjection.description.content,
        personality: proactiveCharacterProjection.personality.content,
        relationship: proactiveCharacterProjection.relationship?.content || "",
        userName: settings.name,
        userBio: settings.bio,
        worldBook: wbPrompt,
        timeContext,
        knowledgeBoundary,
        truthPrompt,
        conversationGuidance,
        taskPrompt,
        instructionsPrompt,
        expressionAnchor: proactiveCharacterProjection.expressionAnchor.content,
        finalPersonaRules: wbBlocks.allTriggered
          .filter((entry) => entry.purpose === "persona_rule")
          .map((entry) => `【${entry.title}】\n${entry.content}`),
        finalLanguageInstruction: formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(
          friend,
          getVisibleWorldBookEntries(worldBookEntries || [], friend.id, {
            scenario: "chat",
            characterId: relationship.characterId,
            userIdentityId: relationship.userIdentityId,
            relationId: relationship.id,
          }).map((entry) => `${entry.title}\n${entry.content}`),
        )),
      });

      const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((friend.personality || "") + (friend.backstory || ""));
      const proactiveReplyContext = createChatRuntimeContext({
        characterId: relationship.characterId,
        relationId: relationship.id,
        conversationId: relationship.conversationId || getConversationId(relationship.id),
        userIdentityId: relationship.userIdentityId,
      });
      const proactiveResult = await generateProactiveChatTurn({
        prompt: {
          scenario: "proactive-message",
          message: "(你主动给用户发送了一条信息)",
          history: recentConversation.recentMessages.flatMap((message) => serializeMessageToPromptTurns(message, {
            mode: "history",
            userName: settings.name,
            characterName: friend.name,
          }).map((turn) => ({ role: turn.role, text: turn.text }))),
          systemInstruction,
          historyInjections: wbBlocks.at_depth,
        },
        settings,
        characterId: friend.id,
        disableBracketActions: friend.disableBracketActions || false,
        keepPeriods,
        createId: () => createId("friend-proactive"),
        currentTime: (idx) => backdateTimestamp ? (backdateTimestamp + idx) : (Date.now() + idx),
        cognitiveContext,
        proactiveOfflineAllowedModes,
        directiveNow: Date.now(),
        transformBubble: (bubbleText, idx) => {
          const isVoice = canConvertBubbleToVoice(friend, null, charMsgs, idx, bubbleText, proactiveReplyContext);
          if (!isVoice) return bubbleText;
          const secs = Math.max(1, Math.min(60, Math.ceil(bubbleText.length * 0.35 + 1.2)));
          return `[语音]|${secs}|${bubbleText}`;
        },
      });

      if (proactiveResult.data && proactiveResult.data.text) {
        const scopedMessages = proactiveResult.messages.map((message) => ({
          ...message,
          relationId,
          conversationId: relationship.conversationId || getConversationId(relationId),
        }));
        // Proactive replies are already scoped to their own relationship. The
        // active chat delivery wrapper would incorrectly rewrite every reply
        // to whichever private chat is currently visible.
        scopedMessages.forEach((message) => onSendMessageRaw(message));
        if (proactiveResult.proactiveOfflineDirective && scopedMessages[0]) {
          const saved = persistProactiveOfflineInvitation({
            relationship,
            directive: proactiveResult.proactiveOfflineDirective,
            sourceMessageId: scopedMessages[0].id,
            now: scopedMessages[0].timestamp,
          });
          if (!saved) console.warn("Proactive offline invitation could not be persisted.");
        }
        const topic = compactTopicHint(proactiveResult.messages.map((message) => message.content));
        const topicRecord = topic
          ? createProactiveTopicRecord({
            topic,
            category: "daily_share",
            createdAt: Date.now(),
            characterId: friend.id,
            relationId: relationship.id,
          })
          : undefined;
        if (topicRecord) appendProactiveTopicRecord(topicRecord);
      }
    } catch (err: any) {
      const errorText = err?.message ? String(err.message).toLowerCase() : String(err).toLowerCase();
      if (errorText.includes("api key") || errorText.includes("api_key") || errorText.includes("authentication") || errorText.includes("401")) {
        backgroundGenerationBlockedRef.current = true;
      }
      console.error("Proactive message auto-trigger error:", err);
    } finally {
      proactiveMessageInFlightRef.current.delete(relationId);
    }
  };

  /**
   * Build the explicitly authorized relationship projection for Moments.
   * Confirmed/asserted Truth and user-authored manual memories may be used;
   * inferred claims and automatic compatibility mirrors may not be published.
   */
  const sendTextImage = () => {
    const description = imageRequestText.trim();
    if (!description) {
      showToast("请填写图片描述");
      return;
    }
    sendCustomMessage(createTextImageMarkup(description), activeRuntimeContext);
    setImageRequestText("");
    setShowImageGenerator(false);
  };

  const analyzeMomentPhotoForCurrentSettings = (image: string) => analyzeMomentPhoto({
    image,
    apiKey: settings.apiKey,
    selectedModel: settings.selectedModel,
    apiEndpoint: settings.apiEndpoint,
  });

  const getMomentCommentTranslationKey = (momentId: string, commentId: string) =>
    `${momentId}:${commentId}`;

  const {
    handleMomentTextPointerDown,
    handleMomentTextPointerUpOrLeave,
    handleMomentTextPointerMove,
    handleMomentCommentPointerDown,
    clearMomentCommentLongPress,
    handleMomentCommentPointerMove,
    handleMomentCommentClick,
    confirmDeleteMomentComment,
    handleMomentTextContextMenu,
    handleCopyMomentText,
    handleFavoriteMoment,
    handleTranslateMoment,
    handleTranslateMomentComment,
    handleDeleteMomentClick,
  } = useChatMomentActions({
    settings,
    momentTranslations,
    commentTranslations,
    momentFavorites,
    commentDeleteTarget,
    onDeleteMoment,
    onDeleteCommentFromMoment,
    showToast,
    getMomentCommentTranslationKey,
    setMomentContextMenu,
    setCommentContextMenu,
    setCommentDeleteTarget,
    setMomentTranslations,
    setCommentTranslations,
    setMomentFavorites,
    setReplyingToCommentMap,
    setShowCommentInputMap,
    longPressTimerRef,
    longPressOriginRef,
    commentLongPressTimerRef,
    commentLongPressOriginRef,
    suppressCommentClickRef,
  });

  const readMomentImageSize = (image: string): Promise<{ width: number; height: number } | undefined> =>
    new Promise((resolve) => {
      const preview = new Image();
      preview.onload = () => resolve(preview.naturalWidth > 0 && preview.naturalHeight > 0
        ? { width: preview.naturalWidth, height: preview.naturalHeight }
        : undefined);
      preview.onerror = () => resolve(undefined);
      preview.src = image;
    });

  const getMomentTargetDescription = (moment: Moment): string => [
    `正文：${renderMomentContent(moment.content) || "（无文字）"}`,
    moment.imageDescription ? `配图识别：${moment.imageDescription}` : (moment.image ? "配图：有一张尚未识别内容的照片" : ""),
  ].filter(Boolean).join("\n");

  const handleAutoCommentOnUserMoment = async (newMo: Moment) => {
    if (activeRelationships.length === 0) return;

    // Rotate through the least-recently represented friends. The previous
    // random filter could repeatedly choose the same first two people forever.
    const latestCommentAt = (relationship: CharacterRelationship): number => {
      const character = findMomentRelationshipCharacter(characters, relationship);
      if (!character) return 0;
      const names = new Set([character.name, character.remark].filter(Boolean));
      return moments
        .filter((moment) => !moment.characterId && (moment.ownerIdentityId || "identity-1") === relationship.userIdentityId)
        .flatMap((moment) => getMomentComments(moment))
        .filter((comment) => comment.relationId === relationship.id
          || comment.characterId === character.id
          || (!comment.relationId && !comment.characterId && names.has(comment.authorName)))
        .reduce((latest, comment) => Math.max(latest, comment.timestamp), 0);
    };
    const commentingRelationships = [...activeRelationships]
      .filter((relationship) => {
        const friend = findMomentRelationshipCharacter(characters, relationship);
        return Boolean(friend && !friend.isGroupChat);
      })
      .sort((left, right) => latestCommentAt(left) - latestCommentAt(right))
      .slice(0, Math.min(3, activeRelationships.length));

    for (const relationship of commentingRelationships) {
      const friend = findMomentRelationshipCharacter(characters, relationship);
      if (!friend || friend.isGroupChat) continue;
      try {
        const comment = await generateAutomaticMomentComment({
          moment: newMo,
          targetDescription: getMomentTargetDescription(newMo),
          character: friend,
          relationship,
          worldBookEntries: worldBookEntries || [],
          topicHistory: loadMomentTopicRecords().value,
          knowledgeClaims: loadKnowledgeClaims().value,
          memories: memories || [],
          events: listCharacterEventsByRelation(relationship.id),
          settings,
          requestAi: apiChat,
          cleanText: (text) => cleanOnlineMessage(text, true),
          characterExpressionPrompt: MOMENT_CHARACTER_EXPRESSION_PROMPT,
        });
        if (comment) onAddCommentToMoment(newMo.id, {
          ...comment,
          characterId: friend.id,
          relationId: relationship.id,
        });
      } catch (err) {
        console.error(`Failed to generate automatic comment for ${friend.name}:`, err);
      }
    }
  };

  const handleAutoReplyToUserComment = async (momentId: string, userCommentText: string, replyingTo?: MomentComment) => {
    // Find the moment
    const targetMoment = moments.find(m => m.id === momentId);
    if (!targetMoment) return;

    // Identify which character should reply
    let targetChar: Character | undefined;
    if (replyingTo?.characterId) {
      targetChar = characters.find((character) => character.id === replyingTo.characterId);
    } else if (replyingTo) {
      // If user is replying to a specific character's comment, that character should reply!
      targetChar = characters.find(c => c.name === replyingTo.authorName || c.remark === replyingTo.authorName);
    }

    if (!targetChar) {
      if (targetMoment.characterId) {
        targetChar = characters.find(c => c.id === targetMoment.characterId);
      } else {
        // Fallback to match authorName
        targetChar = characters.find(c => c.name === targetMoment.authorName || c.remark === targetMoment.authorName);
      }
    }

    // If the moment is posted by the user, and they are replying to a character's comment, or if we want a friend to reply
    if (!targetChar) {
      // If it's user's own moment, let the active character reply, or any friend
      targetChar = characters.find(c => c.id === activeChatCharId) || friends[0];
    }

    if (!targetChar) return;

    const friend = targetChar;
    const relationship = activeRelationships.find((relation) =>
      resolveCanonicalCharacterId(relation.characterId, characters) === friend.id,
    );
    if (!relationship) return;
    const delay = Math.random() * 5000 + 3000; // 3 to 8 seconds delay
    
    setTimeout(async () => {
      try {
        const reply = await generateAutomaticMomentReply({
          targetMoment,
          targetDescription: getMomentTargetDescription(targetMoment),
          userCommentText,
          replyingToContent: replyingTo?.content,
          character: friend,
          relationship,
          worldBookEntries: worldBookEntries || [],
          topicHistory: loadMomentTopicRecords().value,
          knowledgeClaims: loadKnowledgeClaims().value,
          memories: memories || [],
          events: listCharacterEventsByRelation(relationship.id),
          settings,
          requestAi: apiChat,
          cleanText: (text) => cleanOnlineMessage(text, true),
          characterExpressionPrompt: MOMENT_CHARACTER_EXPRESSION_PROMPT,
        });
        if (reply) onAddCommentToMoment(momentId, {
          ...reply,
          characterId: friend.id,
          relationId: relationship.id,
        });
      } catch (err) {
        console.error(`Failed to generate reply to user comment for ${friend.name}:`, err);
      }
    }, delay);
  };

  const generateCharacterMoment = async (relationship: CharacterRelationship, occurredAt: number): Promise<boolean> => {
    const friend = findMomentRelationshipCharacter(characters, relationship);
    if (!friend || friend.isGroupChat || isOfflineStoryActiveFor(relationship.id)) return false;
    try {
      const generated = await generateCharacterMomentPipeline({
        relationship,
        characters,
        moments,
        worldBookEntries: worldBookEntries || [],
        knowledgeClaims: loadKnowledgeClaims().value,
        memories: memories || [],
        events: listCharacterEventsByRelation(relationship.id),
        topicHistory: loadMomentTopicRecords().value,
        settings,
        activeIdentityId,
        occurredAt,
        requestAi: apiChat,
        cleanAndExtractMoment,
        characterExpressionPrompt: MOMENT_CHARACTER_EXPRESSION_PROMPT,
      });
      if (generated.blockedReason === "prohibited-content") {
        // Automatic Moments are optional background content. A provider safety
        // rejection should silently skip this post instead of asking the user
        // to rewrite the character or World Book for a non-essential feature.
        return false;
      }
      if (generated.moment) {
        onAddMoment(generated.moment);
        const topic = compactTopicHint([generated.moment.content]);
        const topicRecord = topic
          ? createMomentTopicRecord({
            topic,
            category: "other",
            generatedAt: generated.moment.timestamp || occurredAt,
            momentId: generated.moment.id,
            characterId: friend.id,
          })
          : undefined;
        if (topicRecord) appendMomentTopicRecord(topicRecord);
        return true;
      }
      // A public Moment is not a verified private relationship fact. Keep the
      // generator's legacy return value for compatibility, but do not write it
      // into relation-scoped Memory without an explicit user confirmation path.
      return false;
    } catch (err: any) {
      console.error(`Failed to generate Moment for character ${friend.name}:`, err);
      const errMsgStr = err?.message || String(err);
      const isAuthError = errMsgStr.toLowerCase().includes("401") ||
                          errMsgStr.toLowerCase().includes("api_key") ||
                          errMsgStr.toLowerCase().includes("key") ||
                          errMsgStr.toLowerCase().includes("invalid") ||
                          errMsgStr.toLowerCase().includes("authentication fails");
      if (isAuthError) backgroundGenerationBlockedRef.current = true;
      if (isAuthError) {
        showToast(`⚠️ [动态生成失败] 「${friend.name}」发布朋友圈时 API 验证失败，请在设置中检查您的 API Key 是否正确。`);
      } else {
        showToast(`⚠️ [动态生成失败] 「${friend.name}」：${errMsgStr}`);
      }
      return false;
    }
  };

  const enrichUserMomentAndComment = async (moment: Moment) => {
    let enriched = moment;
    if (moment.image) {
      const [description, imageSize] = await Promise.all([
        moment.imageDescription ? Promise.resolve(moment.imageDescription) : analyzeMomentPhotoForCurrentSettings(moment.image),
        readMomentImageSize(moment.image),
      ]);
      enriched = {
        ...moment,
        imageDescription: description || moment.imageDescription,
        imageWidth: imageSize?.width,
        imageHeight: imageSize?.height,
      };
      if (description || imageSize) onAddMoment(enriched);
      // A pure-photo post must not receive a blind, hallucinated comment. If
      // visual analysis is unavailable, leave it published and let the user
      // retry later rather than asking "what is this photo?".
      if (!description && !renderMomentContent(moment.content)) return;
    }
    await handleAutoCommentOnUserMoment(enriched);
  };

  const checkAndTriggerCharacterMoments = async () => {
    if (backgroundGenerationBlockedRef.current || activeRelationships.length === 0) return;

    // Always evaluate the relationship that has waited longest first. The old
    // fixed-order loop plus `break` starved later friends whenever an earlier
    // relationship was also eligible.
    const orderedRelationships = [...activeRelationships].sort((left, right) => {
      const leftFriend = findMomentRelationshipCharacter(characters, left);
      const rightFriend = findMomentRelationshipCharacter(characters, right);
      const leftAt = leftFriend ? getRelationshipLastMomentTimestamp(moments, left, leftFriend.id) : Number.MAX_SAFE_INTEGER;
      const rightAt = rightFriend ? getRelationshipLastMomentTimestamp(moments, right, rightFriend.id) : Number.MAX_SAFE_INTEGER;
      return leftAt - rightAt;
    });

    for (const relationship of orderedRelationships) {
      const friend = characters.find((character) => character.id === resolveCanonicalCharacterId(relationship.characterId, characters));
      if (!friend || friend.isGroupChat || isOfflineStoryActiveFor(relationship.id)) continue;
      const now = Date.now();
      const lastPostTime = getRelationshipLastMomentTimestamp(moments, relationship, friend.id);
      const interval = getPostIntervalMs(friend);
      const timeElapsed = now - lastPostTime;

      if (timeElapsed >= interval) {
        const occurredAt = calculateCharacterMomentOccurredAt({
          now,
          relationId: relationship.id,
          lastMomentAt: lastPostTime || undefined,
          lastActiveAt: relationship.lastActiveTime,
          scheduledAt: relationship.scheduledProactiveTime,
          relationshipCreatedAt: relationship.createdAt,
          intervalMs: interval,
          occupiedTimestamps: moments
            .filter((moment) => (moment.ownerIdentityId || "identity-1") === relationship.userIdentityId)
            .map((moment) => moment.timestamp),
        });
        const generated = await generateCharacterMoment(relationship, occurredAt);
        // Generate one per scheduler pass, then rotate to the next oldest
        // eligible relationship on the following pass.
        if (generated) break;
      }
    }
  };

  const proactivePassDependencies = {
    relationships: activeRelationships,
    characters,
    messages: messagesRef.current,
    settingsName: settings.name,
    isOfflineStoryActiveFor,
    processedCatchups: new Set(Object.entries(processedCatchupsRef.current).filter(([, processed]) => processed).map(([id]) => id)),
    scheduleNextProactiveMessage,
    updateRelationshipSession,
    triggerProactiveFor,
    checkAndTriggerCharacterMoments,
  };
  const runProactiveCatchup = async () => {
    runProactiveCatchupPass(proactivePassDependencies);
    proactivePassDependencies.processedCatchups.forEach((id) => { processedCatchupsRef.current[id] = true; });
  };
  const runBackgroundProactive = () => runBackgroundProactivePass(proactivePassDependencies);

  useProactiveChatScheduler({
    enabled: activeRelationships.length > 0,
    runCatchupPass: runProactiveCatchup,
    runBackgroundPass: runBackgroundProactive,
  });

  // Moments publication
  const handleMomentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 800, 800, 0.7);
        setMomentAttachedImage(compressed);
      } catch (err) {
        console.error("Moment image compression failed:", err);
      }
    }
  };

  const handlePublishMoment = (e: React.FormEvent) => {
    e.preventDefault();
    const content = sanitizeMomentPublishText(momentInputText);
    if (!content && !momentAttachedImage && !momentTextImageDescription.trim()) {
      showToast("朋友圈不支持聊天表情包，请发布文字或图片内容");
      return;
    }

    const newMo: Moment = {
      id: Date.now().toString(),
      ownerIdentityId: activeIdentityId,
      authorName: settings.name,
      authorAvatar: settings.avatar,
      content,
      timestamp: Date.now(),
      likes: [],
      comments: [],
      image: momentAttachedImage || undefined,
      imageType: momentAttachedImage ? "photo" : (momentTextImageDescription.trim() ? "text" : undefined),
      imageDescription: momentTextImageDescription.trim() || undefined,
    };

    onAddMoment(newMo);
    setMomentInputText("");
    setMomentAttachedImage(null);
    setMomentTextImageDescription("");
    setShowTextImageInput(false);
    setShowMomentPublisher(false);

    // Publish first, then understand the image and generate grounded comments
    // in the background. The visual API can be slow and must never block UI.
    void enrichUserMomentAndComment(newMo);
  };

  const handleMomentsCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 1000, 1000, 0.7);
        onSaveSettings({ ...settings, momentsCover: compressed });
      } catch (err) {
        console.error("Moments cover compression failed:", err);
      }
    }
  };

  const handlePublishComment = (momentId: string) => {
    const text = inlineCommentsTexts[momentId];
    if (!text || !text.trim()) return;

    const replyingTo = replyingToCommentMap[momentId];
    const prefix = replyingTo ? `回复${replyingTo.authorName}：` : "";
    const finalContent = `${prefix}${sanitizeMomentPublishText(text)}`;
    if (!finalContent.trim()) return;

    const newComment: MomentComment = {
      id: Date.now().toString(),
      authorName: settings.name,
      authorAvatar: settings.avatar,
      content: finalContent,
      timestamp: Date.now(),
    };

    onAddCommentToMoment(momentId, newComment);
    setInlineCommentsTexts({ ...inlineCommentsTexts, [momentId]: "" });
    setShowCommentInputMap(prev => ({ ...prev, [momentId]: false }));
    
    // Clear the replying target
    if (replyingTo) {
      setReplyingToCommentMap(prev => {
        const copy = { ...prev };
        delete copy[momentId];
        return copy;
      });
    }

    // Trigger character auto-reply to the user's new comment
    handleAutoReplyToUserComment(momentId, text.trim(), replyingTo);
  };

  const publishMomentFromFeature = (input: { content: string; image: string | null; imageDescription: string }) => {
    const newMo: Moment = {
      id: Date.now().toString(),
      ownerIdentityId: activeIdentityId,
      authorName: settings.name,
      authorAvatar: settings.avatar,
      content: sanitizeMomentPublishText(input.content),
      timestamp: Date.now(),
      likes: [],
      comments: [],
      image: input.image || undefined,
      imageType: input.image ? "photo" : (input.imageDescription.trim() ? "text" : undefined),
      imageDescription: input.imageDescription.trim() || undefined,
    };
    if (!newMo.content && !newMo.image && !newMo.imageDescription) {
      showToast("朋友圈不支持聊天表情包，请发布文字或图片内容");
      return;
    }
    onAddMoment(newMo);
    void enrichUserMomentAndComment(newMo);
  };

  const publishMomentCommentFromFeature = (momentId: string, text: string, replyingTo?: MomentComment) => {
    const prefix = replyingTo ? `回复${replyingTo.authorName}：` : "";
    const content = `${prefix}${sanitizeMomentPublishText(text)}`;
    if (!content.trim()) return;
    const newComment: MomentComment = {
      id: Date.now().toString(),
      authorName: settings.name,
      authorAvatar: settings.avatar,
      content,
      timestamp: Date.now(),
    };
    onAddCommentToMoment(momentId, newComment);
    handleAutoReplyToUserComment(momentId, text.trim(), replyingTo);
  };

  const uploadMomentImageFromFeature = async (file: File, kind: "moment" | "cover") => {
    const compressed = await compressImage(file, kind === "cover" ? 1000 : 800, kind === "cover" ? 1000 : 800, 0.7);
    if (kind === "cover") {
      onSaveSettings({ ...settings, momentsCover: compressed });
      return undefined;
    }
    return compressed;
  };

  // Active chat threads list builder
  const directThreads = activeRelationships.map((relation) => {
    const character = characters.find((item) => item.id === resolveCanonicalCharacterId(relation.characterId, characters));
    if (!character) return null;
    const threadMsgs = messages.filter((message) => message.relationId === relation.id && !message.isOffline);
    if (!threadMsgs.length && !initiatedChatIds.includes(relation.id) && activeChatRelationId !== relation.id) return null;
    return { id: relation.id, character, lastMessage: threadMsgs.at(-1) || null, isPinned: character.isPinned || false, subtitle: settings.identities?.find((identity) => identity.id === relation.userIdentityId)?.name };
  }).filter((thread): thread is NonNullable<typeof thread> => Boolean(thread));
  const groupThreads = characters.filter((character) => character.isGroupChat && belongsToActiveIdentity(character.ownerIdentityId)).map((character) => {
    const threadMsgs = messages.filter((message) => message.characterId === character.id && !message.isOffline);
    if (!threadMsgs.length && !initiatedChatIds.includes(character.id) && activeChatCharId !== character.id) return null;
    return { id: character.id, character, lastMessage: threadMsgs.at(-1) || null, isPinned: character.isPinned || false };
  }).filter((thread): thread is NonNullable<typeof thread> => Boolean(thread));
  const chatThreads = [...directThreads, ...groupThreads].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0);
    });

  const savedBookmarks = messages.filter((m) => m.isBookmarked);

  // Get count of unread moments comments/replies
  const getUnreadMomentsCount = () => {
    let count = 0;
    allMoments.forEach((mom) => {
      getMomentComments(mom).forEach((comm) => {
        if (comm.authorName !== settings.name && comm.timestamp > lastViewedMomentsTime) {
          // Check if it's user's moment, or a reply targeting the user
          const isUserMoment = mom.authorName === settings.name;
          const isReplyToUser = comm.content.startsWith(`回复（${settings.name}）：`) || 
                                comm.content.startsWith(`回复 ${settings.name}：`) ||
                                comm.content.startsWith(`回复${settings.name}：`);
          if (isUserMoment || isReplyToUser) {
            count++;
          }
        }
      });
    });
    return count;
  };

  // Moments feed filtering
  const filteredMoments = momentsFilterCharId
    ? allMoments.filter((m) => m.characterId === momentsFilterCharId)
    : allMoments;


  // Keep the settings sheet outside #conv-screen so user-authored chat CSS
  // can never reach it, even if a legacy stylesheet or an overly broad
  // selector is still present in the document. The shell is the same phone
  // viewport, so absolute inset positioning remains unchanged.
  const chatSettingsPortalTarget = typeof document !== "undefined"
    ? document.querySelector<HTMLElement>("[data-chat-shell]")
    : null;

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)] text-[var(--text-primary)] font-sans select-none overflow-hidden relative" data-chat-shell>
      <InnerVoiceModal
        character={innerVoiceController.character}
        mode={innerVoiceController.mode}
        onModeChange={innerVoiceController.setMode}
        onClose={innerVoiceController.close}
        loading={innerVoiceController.loading}
        error={innerVoiceController.error}
        record={innerVoiceController.record}
        history={innerVoiceController.history}
        getEmotion={innerVoiceController.getEmotion}
      />
      {/* Active Chat Windows Overlay (QQ/WeChat Screen) */}
      {activeChatCharId && activeCharacter && isActiveChatScopeValid ? (
        <div className={`absolute inset-0 z-40 bg-[var(--app-bg)] flex flex-col h-full animate-slide-up chat-page chat-theme ${activeStylePreset === "liquid-glass" ? "style-liquid-glass" : ""} ${hasUserCustomChatCss ? "user-custom-chat-css" : ""}`} id="conv-screen" data-chat-id={activeChatCharId} data-chat-mode={activeCharacter.isGroupChat ? "group" : "direct"} data-user-chat-css={hasUserCustomChatCss ? "active" : "inactive"} data-chat-settings-open={isShowingCardModal ? "true" : "false"}>
            <div
              id="api-chat-screen"
              className={`flex flex-col h-full w-full relative app-content chat-page chat-theme chat-page__background ${activeStylePreset === "liquid-glass" ? "style-liquid-glass" : ""} ${hasUserCustomChatCss ? "user-custom-chat-css" : ""}`}
            >
            {/* Beginner manual style adjustments */}
            <style>{`
              /* The phone shell applies a circular border to generic .back-btn
                 elements. These are chat-only navigation controls: keep their
                 32px hit area, but expose only the icon. */
              #conv-screen .cv-header .back-btn,
              #conv-screen .cv-header .menu-btn,
              #conv-screen .chat-header__back-button,
              #conv-screen .chat-header__more-button {
                appearance: none !important;
                -webkit-appearance: none !important;
                background: transparent !important;
                border: 0 !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                outline: none !important;
              }

              /* Settings remark input: keep a rectangular control even when a
                 character's custom CSS applies circular input styles globally. */
              #conv-screen .cv-remark-input {
                height: 32px !important;
                min-height: 32px !important;
                border-radius: 12px !important;
                box-shadow: none !important;
              }

              /* Keep the vertical message scroller while allowing custom
                 bubble tips to extend outside their bubble horizontally. */
              #conv-screen .cv-messages-list {
                overflow-x: visible !important;
                overflow-y: auto !important;
              }

              /* Keep the built-in bubble shadow subtle and close to the
                 bubble. User-authored chat CSS remains the visual authority. */
              ${!hasUserCustomChatCss ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .chat-bubble-other,
                #conv-screen .message-bubble {
                  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.035) !important;
                }
              ` : ""}

              /* The slider controls row spacing directly. The old list
                 utility and row margins otherwise stack unpredictably. */
              #conv-screen .chat-message-list-content {
                --chat-bubble-spacing: ${Math.max(8, Math.min(56, settings.bubbleSpacing ?? 32))}px;
              }
              #conv-screen .chat-message-list-content .chat-row-gap-consecutive {
                margin-top: var(--chat-bubble-spacing) !important;
              }
              #conv-screen .chat-message-list-content .chat-row-gap-separated {
                margin-top: calc(var(--chat-bubble-spacing) + 8px) !important;
              }

              /* Bubble tips live in a portal layer outside the scrolling list.
                 The layer only establishes a positioning environment; user CSS
                 owns the tip's shape, size, color, and visual placement. */
              #conv-screen .cv-bubble-tip-portal-layer {
                position: absolute;
                inset: 0;
                overflow: visible;
                pointer-events: none;
                z-index: 1;
              }
              #conv-screen .cv-bubble-tip-portal {
                position: fixed;
                pointer-events: none;
              }

              /* Corner decorations are an empty, user-styled slot.  Keep the
                 wrapper and slot open for artwork without imposing any visual
                 size, color, border, or offset. */
              #conv-screen .bubble-deco-wrapper {
                position: relative;
                overflow: visible;
              }
              #conv-screen .bubble-deco {
                position: absolute;
                z-index: 3;
                pointer-events: none;
                overflow: visible;
              }
              #conv-screen .chat-bubble-self,
              #conv-screen .chat-bubble-other {
                overflow: visible;
              }

              ${!hasUserCustomChatCss && activeBubbleTailEnabled ? `
                #conv-screen .chat-bubble-other.msg-group-top::before,
                #conv-screen .chat-bubble-self.msg-group-top::after {
                  content: "";
                  position: absolute;
                  top: ${settings.bubbleTailVertical === "center" ? "50%" : settings.bubbleTailVertical === "bottom" ? "auto" : "14px"};
                  ${settings.bubbleTailVertical === "center" ? "transform: translateY(-50%) rotate(45deg);" : settings.bubbleTailVertical === "bottom" ? "bottom: 14px; transform: rotate(45deg);" : "transform: rotate(45deg);"}
                  width: 10px;
                  height: 10px;
                  z-index: 0;
                  pointer-events: none;
                }
                #conv-screen .chat-bubble-other.msg-group-top::before {
                  left: -5px;
                  background: var(--chat-ai-bg);
                }
                #conv-screen .chat-bubble-self.msg-group-top::after {
                  right: -5px;
                  background: var(--chat-user-bg);
                }
              ` : ""}

              /*
               * Themeable chat composer surface.  The semantic variables are
               * intentionally defined at the chat root so a user's scoped CSS
               * can override them without changing the composer behavior.
               * No color, radius, border, or shadow is required to be white or
               * pill-shaped; light/dark token fallbacks come from tokens.css.
               */
              #conv-screen .chat-input-area {
                color: var(--chat-composer-text, var(--text-primary));
              }
              #conv-screen .chat-input-area.chat-composer--default {
                background: var(--chat-composer-bg, var(--surface));
                border: var(--chat-composer-border-width, 1px) solid var(--chat-composer-border, var(--divider));
                border-radius: var(--chat-composer-radius, 0);
                box-shadow: var(--chat-composer-shadow, none);
              }
              #conv-screen .chat-input-area.chat-composer--floating {
                background: var(--chat-composer-bg, var(--surface));
                border: var(--chat-composer-border-width, 1px) solid var(--chat-composer-border, var(--border));
                border-radius: var(--chat-composer-radius, var(--radius-xl));
                box-shadow: var(--chat-composer-shadow, 0 4px 16px var(--shadow-color));
              }
              #conv-screen .chat-input-area.chat-composer--liquid {
                background: var(--chat-composer-bg, transparent);
                border: var(--chat-composer-border-width, 0px) solid var(--chat-composer-border, transparent);
                border-radius: var(--chat-composer-radius, 0);
                box-shadow: var(--chat-composer-shadow, none);
              }
              #conv-screen .chat-composer__input {
                min-width: 0 !important;
                width: 0 !important;
                flex: 1 1 0% !important;
                background: var(--chat-input-bg, var(--input-bg));
                color: var(--chat-input-text, var(--text-primary));
                border: var(--chat-input-border-width, 1px) solid var(--chat-input-border, var(--border));
                border-radius: var(--chat-input-radius, var(--radius-sm));
                box-shadow: var(--chat-input-shadow, none);
              }
              #conv-screen .chat-composer__input::placeholder {
                color: var(--chat-input-placeholder, var(--input-placeholder));
              }
              #conv-screen .chat-composer__input:focus {
                border-color: var(--chat-input-focus-border, var(--accent));
                box-shadow: var(--chat-input-focus-shadow, 0 0 0 2px var(--focus-ring));
              }
              #conv-screen .chat-composer__button {
                flex: 0 0 auto !important;
                border: var(--chat-button-border-width, 1px) solid var(--chat-button-border, var(--border));
                border-radius: var(--chat-button-radius, var(--radius-full));
                box-shadow: var(--chat-button-shadow, none);
                transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease, opacity 150ms ease, transform 150ms ease;
              }
              #conv-screen .chat-composer__attach-button {
                background: var(--chat-attach-bg, var(--button-secondary-bg));
                color: var(--chat-attach-text, var(--button-secondary-text));
              }
              #conv-screen .chat-composer__attach-button:hover,
              #conv-screen .chat-composer__attach-button.chat-composer__button--open {
                background: var(--chat-attach-hover-bg, var(--surface-raised));
                color: var(--chat-attach-hover-text, var(--chat-attach-text, var(--button-secondary-text)));
              }
              #conv-screen .chat-composer__send-only-button {
                background: var(--chat-send-only-bg, var(--button-secondary-bg));
                color: var(--chat-send-only-text, var(--button-secondary-text));
              }
              #conv-screen .chat-composer__send-only-button:hover:not(:disabled) {
                background: var(--chat-send-only-hover-bg, var(--surface-raised));
                color: var(--chat-send-only-hover-text, var(--chat-send-only-text, var(--button-secondary-text)));
              }
              #conv-screen .chat-composer__send-reply-button {
                background: var(--chat-send-bg, var(--button-primary-bg));
                color: var(--chat-send-text, var(--button-primary-text));
                border-color: var(--chat-send-border, var(--button-primary-bg));
              }
              #conv-screen .chat-composer__send-reply-button:hover:not(:disabled) {
                background: var(--chat-send-hover-bg, var(--button-primary-hover-bg));
                color: var(--chat-send-hover-text, var(--button-primary-text));
                border-color: var(--chat-send-hover-border, var(--button-primary-hover-bg));
              }
              #conv-screen .chat-composer__button svg {
                color: currentColor;
                stroke: currentColor;
              }
              #conv-screen .chat-composer__send-reply-button svg {
                fill: currentColor;
              }
              #conv-screen .chat-composer__button:disabled {
                border-color: var(--chat-button-disabled-border, var(--button-disabled-border));
                background: var(--chat-button-disabled-bg, var(--button-disabled-bg));
                color: var(--chat-button-disabled-text, var(--button-disabled-text));
                opacity: var(--chat-button-disabled-opacity, 0.4);
              }

              ${settings.avatarBorderRadius !== undefined ? `
                #conv-screen .avatar, 
                #conv-screen .user-avatar, 
                #conv-screen .ai-avatar {
                  border-radius: ${settings.avatarBorderRadius}px !important;
                }
              ` : ''}

              ${settings.avatarBorderEnabled ? `
                #conv-screen .avatar, 
                #conv-screen .user-avatar, 
                #conv-screen .ai-avatar {
                  border: ${settings.avatarBorderWidth !== undefined ? settings.avatarBorderWidth : 1}px solid ${settings.avatarBorderColor || '#e4e4e7'} !important;
                }
              ` : `
                #conv-screen .avatar, 
                #conv-screen .user-avatar, 
                #conv-screen .ai-avatar {
                  border: none !important;
                }
              `}

              ${!isLiquidGlass ? (settings.bubbleBorderEnabled ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  border: ${settings.bubbleBorderWidth !== undefined ? settings.bubbleBorderWidth : 1}px solid ${settings.selfBubbleBorderColor || '#27272a'} !important;
                }
                #conv-screen .chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  border: ${settings.bubbleBorderWidth !== undefined ? settings.bubbleBorderWidth : 1}px solid ${settings.otherBubbleBorderColor || '#e4e4e7'} !important;
                }
              ` : `
                #conv-screen .chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self,
                #conv-screen .chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  border: none !important;
                }
              `) : ""}

              /* The persisted chat controls are the default visual authority
                 whenever no user stylesheet is active.  This deliberately
                 overrides only the historical built-in bubble CSS, while
                 user-authored chat CSS still wins through its later scoped
                 stylesheet. */
              ${!isLiquidGlass && !hasUserCustomChatCss && settings.selfBubbleRadius !== undefined ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  border-radius: ${settings.selfBubbleRadius}px !important;
                }
              ` : ""}
              ${!isLiquidGlass && !hasUserCustomChatCss && settings.otherBubbleRadius !== undefined ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  border-radius: ${settings.otherBubbleRadius}px !important;
                }
              ` : ""}

              ${!isLiquidGlass && settings.otherBubbleBg ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  background-color: ${getBubbleBackgroundStyle(settings.otherBubbleBg, settings.otherBubbleOpacity !== undefined ? settings.otherBubbleOpacity : 100)} !important;
                  background-image: none !important;
                }
              ` : ''}

              ${!isLiquidGlass && settings.otherBubbleColor ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  color: ${settings.otherBubbleColor} !important;
                }
              ` : ''}

              /* Persisted colour controls feed the semantic theme variables.
                 Global theme rules use these variables with !important, so
                 setting only a normal color declaration cannot override
                 them reliably. */
              #conv-screen {
                --chat-user-bg: ${isLiquidGlass
                  ? getBubbleBackgroundStyle(
                    settings.liquidGlassSelfBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
                    settings.liquidGlassSelfBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
                  )
                  : getBubbleBackgroundStyle(
                    settings.selfBubbleBg || CLASSIC_SELF_BUBBLE_BACKGROUND,
                    settings.selfBubbleOpacity ?? CLASSIC_BUBBLE_OPACITY,
                  )};
                --chat-ai-bg: ${isLiquidGlass
                  ? getBubbleBackgroundStyle(
                    settings.liquidGlassOtherBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
                    settings.liquidGlassOtherBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
                  )
                  : getBubbleBackgroundStyle(
                    settings.otherBubbleBg || CLASSIC_OTHER_BUBBLE_BACKGROUND,
                    settings.otherBubbleOpacity ?? CLASSIC_BUBBLE_OPACITY,
                  )};
                --chat-user-text: ${isLiquidGlass
                  ? settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR
                  : settings.selfBubbleColor || CLASSIC_SELF_BUBBLE_TEXT};
                --chat-ai-text: ${isLiquidGlass
                  ? settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR
                  : settings.otherBubbleColor || CLASSIC_OTHER_BUBBLE_TEXT};
              }

              /* The classic default used to keep hard-coded green/white
                 Tailwind backgrounds on the message nodes. That made the
                 beauty preview (which uses the persisted classic defaults)
                 disagree with the actual chat until another style setting
                 happened to be touched. Make the classic chat use the same
                 semantic variables from its first render. */
              ${!isLiquidGlass && !isFloatingCute && !hasUserCustomChatCss ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  background-color: var(--chat-user-bg) !important;
                  background-image: none !important;
                  color: var(--chat-user-text) !important;
                }
                #conv-screen .chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  background-color: var(--chat-ai-bg) !important;
                  background-image: none !important;
                  color: var(--chat-ai-text) !important;
                }
              ` : ""}

              ${!isLiquidGlass && settings.selfBubbleBg ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  background-color: ${getBubbleBackgroundStyle(settings.selfBubbleBg, settings.selfBubbleOpacity !== undefined ? settings.selfBubbleOpacity : 100)} !important;
                  background-image: none !important;
                }
              ` : ''}

              ${!isLiquidGlass && settings.selfBubbleColor ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  color: ${settings.selfBubbleColor} !important;
                }
              ` : ''}

              /* 朋友圈评论区无气泡卡片，细线分隔 */
              .phone-screen-container .moments-comment-list,
              .moments-comment-list {
                display: flex !important;
                flex-direction: column !important;
                gap: 0 !important;
                background-color: transparent !important;
                border: none !important;
                border-radius: 0px !important;
                box-shadow: none !important;
              }
              .phone-screen-container .moments-comment-item,
              .moments-comment-item {
                background-color: transparent !important;
                background-image: none !important;
                border-top: none !important;
                border-left: none !important;
                border-right: none !important;
                border-bottom: none !important;
                border-radius: 0px !important;
                box-shadow: none !important;
                padding-top: 6px !important;
                padding-bottom: 6px !important;
                padding-left: 2px !important;
                padding-right: 2px !important;
                margin: 0 !important;
              }
              .phone-screen-container .moments-comment-item:not(:first-child),
              .moments-comment-item:not(:first-child) {
                border-top: 1px solid rgba(0, 0, 0, 0.08) !important;
              }
              .phone-screen-container .moments-comment-item:hover,
              .moments-comment-item:hover {
                background-color: rgba(0, 0, 0, 0.03) !important;
              }
            `}</style>
            {activeStylePreset === "liquid-glass" && (
              <style>{`
                #conv-screen {
                  /* A transparent page exposes the chat list below this overlay. Keep an
                     opaque glass base when the user has not supplied a chat wallpaper. */
                  ${activeCharacter.chatBg
                    ? `background: url("${activeCharacter.chatBg}") center/cover no-repeat !important;`
                    : 'background: radial-gradient(circle at 12% 8%, #ffffff 0%, #f3f7fb 42%, #e7eef7 100%) !important;'}
                }
                .cv-messages-list {
                  background: transparent !important;
                }

                /* 1. 导航栏 (Navigation Bar) */
                .cv-header {
                  background: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                  padding-top: 16px !important;
                  padding-bottom: 8px !important;
                  position: relative !important;
                }
                /* 返回按钮 */
                .cv-header .back-btn {
                  position: relative !important;
                  width: 42px !important;
                  height: 42px !important;
                  border-radius: 0 !important;
                  background: transparent !important;
                  backdrop-filter: none !important;
                  -webkit-backdrop-filter: none !important;
                  border: none !important;
                  box-shadow: none !important;
                  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .cv-header .back-btn:hover {
                  background: transparent !important;
                  opacity: 0.72 !important;
                  transform: scale(1.05) !important;
                }
                /* 菜单按钮 */
                .cv-header .menu-btn {
                  position: relative !important;
                  width: 42px !important;
                  height: 42px !important;
                  border-radius: 0 !important;
                  background: transparent !important;
                  backdrop-filter: none !important;
                  -webkit-backdrop-filter: none !important;
                  border: none !important;
                  box-shadow: none !important;
                  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                /* 液态玻璃导航控件：保留按钮底部的圆形玻璃承托，避免被
                   聊天页基础样式重置为透明方形。 */
                #conv-screen.style-liquid-glass .cv-header .back-btn,
                #conv-screen.style-liquid-glass .cv-header .menu-btn,
                #conv-screen.style-liquid-glass .cv-header .chat-header__back-button,
                #conv-screen.style-liquid-glass .cv-header .chat-header__more-button {
                  width: 42px !important;
                  height: 42px !important;
                  min-width: 42px !important;
                  border-radius: 50% !important;
                  background: rgba(255, 255, 255, 0.62) !important;
                  background-color: rgba(255, 255, 255, 0.62) !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.72) !important;
                  color: #1c1917 !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                #conv-screen.style-liquid-glass .cv-header .back-btn:hover,
                #conv-screen.style-liquid-glass .cv-header .menu-btn:hover,
                #conv-screen.style-liquid-glass .cv-header .chat-header__back-button:hover,
                #conv-screen.style-liquid-glass .cv-header .chat-header__more-button:hover {
                  background: rgba(255, 255, 255, 0.76) !important;
                  opacity: 1 !important;
                  transform: scale(1.04) !important;
                }
                #conv-screen.style-liquid-glass .cv-header .back-btn svg,
                #conv-screen.style-liquid-glass .cv-header .menu-btn svg,
                #conv-screen.style-liquid-glass .cv-header .chat-header__back-button svg,
                #conv-screen.style-liquid-glass .cv-header .chat-header__more-button svg {
                  color: #1c1917 !important;
                  stroke: currentColor !important;
                }
                .cv-header .menu-btn:hover {
                  background: transparent !important;
                  opacity: 0.72 !important;
                  transform: scale(1.05) !important;
                }
                /* 中间标题胶囊 - 绝对完美水平及垂直居中 */
                .cv-header .header-title {
                  position: relative !important;
                  left: auto !important;
                  top: auto !important;
                  transform: none !important;
                  width: max-content !important;
                  max-width: 50% !important;
                  margin: 0 !important;
                  height: 42px !important;
                  padding: 0 16px !important;
                  background: rgba(255, 255, 255, 0.72) !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border-radius: 9999px !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.55) !important;
                  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  gap: 8px !important;
                }
                .cv-header .header-title-avatar {
                  width: 24px !important;
                  height: 24px !important;
                  border-radius: 50% !important;
                  border: 1px solid rgba(255, 255, 255, 0.6) !important;
                }
                .cv-header .header-title-name {
                  font-size: calc(11px * var(--app-font-scale, 1)) !important;
                  font-weight: 800 !important;
                  letter-spacing: 0.08em !important;
                  text-transform: uppercase !important;
                  color: #1c1917 !important;
                }
                .cv-header .character-status {
                  display: none !important;
                }
 
                /* 2. 头像 (Avatars) */
                .avatar, .user-avatar, .ai-avatar {
                  border-radius: 12px !important;
                  border: 1px solid rgba(255, 255, 255, 0.4) !important;
                  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05) !important;
                  width: 36px !important;
                  height: 36px !important;
                }
 
                /* 3. 聊天气泡 (Chat Bubbles) - 强效覆盖，解决圆角/背景色被 Tailwind 和 App.tsx 覆盖的问题 */
                #conv-screen.style-liquid-glass .chat-bubble-self,
                #conv-screen.style-liquid-glass .voice-message-bar.chat-bubble-self,
                .phone-screen-container .style-liquid-glass .chat-bubble-self,
                .style-liquid-glass .chat-bubble-self {
                  background: ${getBubbleBackgroundStyle(
                    settings.liquidGlassSelfBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
                    settings.liquidGlassSelfBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
                  )} !important;
                  background-color: ${getBubbleBackgroundStyle(
                    settings.liquidGlassSelfBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
                    settings.liquidGlassSelfBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
                  )} !important;
                  background-image: none !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border: ${settings.liquidGlassBubbleBorderEnabled
                    ? `${settings.liquidGlassBubbleBorderWidth ?? 1}px solid ${settings.liquidGlassSelfBubbleBorderColor || "#ffffff"}`
                    : "1.5px solid rgba(255, 255, 255, 0.55)"} !important;
                  border-radius: ${settings.liquidGlassSelfBubbleRadius ?? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS}px !important;
                  color: ${settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR} !important;
                  padding: 11px 16px !important;
                  font-size: calc(12px * var(--app-font-scale, 1)) !important;
                  font-weight: 600 !important;
                  line-height: 1.4 !important;
                  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.04) !important;
                }
                #conv-screen.style-liquid-glass .chat-bubble-self > .chat-message--voice-wave,
                #conv-screen.style-liquid-glass .chat-bubble-self > .chat-message--voice-duration,
                #conv-screen.style-liquid-glass .chat-bubble-self > .chat-message--call-icon,
                #conv-screen.style-liquid-glass .chat-bubble-self > .chat-message--call-duration {
                  color: ${settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR} !important;
                }

                #conv-screen.style-liquid-glass .chat-bubble-other,
                #conv-screen.style-liquid-glass .voice-message-bar.chat-bubble-other,
                .phone-screen-container .style-liquid-glass .chat-bubble-other,
                .style-liquid-glass .chat-bubble-other {
                  background: ${getBubbleBackgroundStyle(
                    settings.liquidGlassOtherBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
                    settings.liquidGlassOtherBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
                  )} !important;
                  background-color: ${getBubbleBackgroundStyle(
                    settings.liquidGlassOtherBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
                    settings.liquidGlassOtherBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
                  )} !important;
                  background-image: none !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border: ${settings.liquidGlassBubbleBorderEnabled
                    ? `${settings.liquidGlassBubbleBorderWidth ?? 1}px solid ${settings.liquidGlassOtherBubbleBorderColor || "#ffffff"}`
                    : "1.5px solid rgba(255, 255, 255, 0.55)"} !important;
                  border-radius: ${settings.liquidGlassOtherBubbleRadius ?? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS}px !important;
                  color: ${settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR} !important;
                  padding: 11px 16px !important;
                  font-size: calc(12px * var(--app-font-scale, 1)) !important;
                  font-weight: 600 !important;
                  line-height: 1.4 !important;
                  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.04) !important;
                }
                #conv-screen.style-liquid-glass .chat-bubble-other > .chat-message--voice-wave,
                #conv-screen.style-liquid-glass .chat-bubble-other > .chat-message--voice-duration,
                #conv-screen.style-liquid-glass .chat-bubble-other > .chat-message--call-icon,
                #conv-screen.style-liquid-glass .chat-bubble-other > .chat-message--call-duration {
                  color: ${settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR} !important;
                }
 
                /* 气泡元数据 */
                .msg-meta-header {
                  margin-bottom: 6px !important;
                }
                .msg-meta-name {
                  color: #3f3f46 !important;
                  font-size: calc(9px * var(--app-font-scale, 1)) !important;
                  font-weight: 800 !important;
                  letter-spacing: 0.08em !important;
                  margin-bottom: 2px !important;
                }
                .msg-meta-date, .msg-meta-time {
                  color: #71717a !important;
                  font-size: calc(9px * var(--app-font-scale, 1)) !important;
                  font-weight: 500 !important;
                  letter-spacing: 0.02em !important;
                  display: inline-block !important;
                  margin-right: 8px !important;
                }
                .msg-meta-divider {
                  border-color: rgba(0, 0, 0, 0.08) !important;
                  width: 48px !important;
                  margin-top: 6px !important;
                  margin-bottom: 8px !important;
                }
 
                /* 4. 底部输入栏 (Bottom Input Bar) 悬浮 */
                .cv-footer {
                  padding: 12px 14px 24px 14px !important;
                  margin-top: auto !important;
                }
                #conv-screen.style-liquid-glass .chat-composer--liquid {
                  width: auto !important;
                  max-width: none !important;
                  margin: 4px 14px calc(12px + env(safe-area-inset-bottom, 0px)) !important;
                  padding: 8px 10px !important;
                  overflow: visible !important;
                  box-sizing: border-box !important;
                  position: relative !important;
                  z-index: 20 !important;
                  border-radius: 28px !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.72) !important;
                  background: rgba(255, 255, 255, 0.55) !important;
                  background-color: rgba(255, 255, 255, 0.55) !important;
                  backdrop-filter: blur(24px) saturate(180%) !important;
                  -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
                  box-shadow: 0 8px 28px rgba(34, 46, 66, 0.1) !important;
                }
                #conv-screen.style-liquid-glass .chat-composer--liquid .chat-composer__form {
                  width: 100% !important;
                  min-height: 42px !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  box-sizing: border-box !important;
                }
                #conv-screen .chat-composer__form {
                  width: 100% !important;
                  max-width: 100% !important;
                  min-width: 0 !important;
                  box-sizing: border-box !important;
                }
                @media (max-width: 420px) {
                  #conv-screen .chat-composer__form {
                    gap: 6px !important;
                    padding-left: 8px !important;
                    padding-right: 8px !important;
                  }
                  #conv-screen .chat-composer__button {
                    width: 36px !important;
                    height: 36px !important;
                  }
                  #conv-screen .chat-composer__input {
                    padding-left: 10px !important;
                    padding-right: 10px !important;
                  }
                }
                .cv-footer form {
                  background: transparent !important;
                  padding: 0 !important;
                  display: flex !important;
                  align-items: center !important;
                  gap: 8px !important;
                }
                .cv-footer .toggle-tools-btn,
                .cv-footer .cv-send-only-btn,
                .cv-footer .send-button {
                  width: 42px !important;
                  height: 42px !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  transition: all 0.2s ease !important;
                  flex-shrink: 0 !important;
                }
                .cv-footer .chat-input {
                  height: 42px !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  font-size: calc(11px * var(--app-font-scale, 1)) !important;
                  font-weight: 700 !important;
                  letter-spacing: 0.04em !important;
                  padding-left: 16px !important;
                  padding-right: 16px !important;
                  flex-grow: 1 !important;
                  flex-shrink: 1 !important;
                  min-width: 0 !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__input {
                  background: rgba(255, 255, 255, 0.64) !important;
                  background-color: rgba(255, 255, 255, 0.64) !important;
                  border: 1px solid rgba(255, 255, 255, 0.78) !important;
                  border-radius: 999px !important;
                  color: #1c1917 !important;
                  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), 0 2px 10px rgba(34, 46, 66, 0.06) !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__input::placeholder {
                  color: rgba(71, 85, 105, 0.72) !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__button {
                  border-radius: 50% !important;
                  background: rgba(255, 255, 255, 0.64) !important;
                  background-color: rgba(255, 255, 255, 0.64) !important;
                  border: 1px solid rgba(255, 255, 255, 0.78) !important;
                  color: #1c1917 !important;
                  box-shadow: 0 4px 14px rgba(34, 46, 66, 0.08) !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__send-reply-button {
                  background: rgba(28, 25, 23, 0.88) !important;
                  background-color: rgba(28, 25, 23, 0.88) !important;
                  border-color: rgba(255, 255, 255, 0.42) !important;
                  color: #ffffff !important;
                }
                .cv-footer .chat-input::placeholder {
                  font-weight: 600 !important;
                  letter-spacing: 0.05em !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__attachment-panel {
                  width: 100% !important;
                  min-height: 84px !important;
                  max-height: 112px !important;
                  margin: 8px 0 0 !important;
                  padding: 8px 2px !important;
                  box-sizing: border-box !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: space-around !important;
                  gap: 2px !important;
                  overflow-x: hidden !important;
                  overflow-y: hidden !important;
                  border-radius: 18px !important;
                  background: rgba(255, 255, 255, 0.42) !important;
                  background-color: rgba(255, 255, 255, 0.42) !important;
                  border: 1px solid rgba(255, 255, 255, 0.52) !important;
                  backdrop-filter: blur(20px) saturate(180%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__attachment-panel > * {
                  flex: 1 1 0 !important;
                  min-width: 0 !important;
                  max-width: 88px !important;
                  height: 100% !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__attachment-panel > * > div {
                  width: var(--chat-attachment-icon-size, 42px) !important;
                  height: var(--chat-attachment-icon-size, 42px) !important;
                  flex: 0 0 var(--chat-attachment-icon-size, 42px) !important;
                  border-radius: 50% !important;
                  background: rgba(255, 255, 255, 0.76) !important;
                  background-color: rgba(255, 255, 255, 0.76) !important;
                  border: 1px solid rgba(255, 255, 255, 0.7) !important;
                  box-shadow: 0 4px 14px rgba(34, 46, 66, 0.08) !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__attachment-panel .chat-attachment-icon > .chat-configured-icon,
                #conv-screen.style-liquid-glass .chat-composer__attachment-panel .chat-attachment-icon > svg {
                  width: var(--chat-attachment-glyph-size, 1rem) !important;
                  height: var(--chat-attachment-glyph-size, 1rem) !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__attachment-panel > * > span {
                  color: #334155 !important;
                  font-size: calc(10px * var(--app-font-scale, 1)) !important;
                  line-height: calc(14px * var(--app-font-scale, 1)) !important;
                  white-space: nowrap !important;
                }
                .cv-footer .cv-send-reply-icon svg {
                  fill: currentColor !important;
                  color: currentColor !important;
                  stroke: currentColor !important;
                }
                .cv-footer .cv-send-only-icon svg {
                  color: currentColor !important;
                  stroke: currentColor !important;
                }
              `}</style>
            )}
            {/* Chat Window Header with standard classes and compact size */}
            <div className={`chat-content-scope chat-page chat-theme chat-page__background shrink-0 ${activeStylePreset === "liquid-glass" ? "style-liquid-glass" : ""} ${hasUserCustomChatCss ? "user-custom-chat-css" : ""}`}>
            <div className={`flex items-center justify-between z-10 shrink-0 relative cv-header chat-header header app-top-container default-controls selection-controls ${
              isFloatingCute
                ? "mx-3.5 mt-3.5 mb-1 bg-white/70 backdrop-blur-md rounded-[28px] border border-slate-200/50 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)] px-4 py-2"
                : "px-4 py-1.5 bg-transparent"
            }`}>
              <button
                onClick={() => {
                  setActiveChatCharId(null);
                  setActiveChatRelationId(null);
                  setIsShowingCardModal(false);
                  setAdvancedSettingsSection(null);
                }}
                className="w-8 h-8 rounded-none bg-transparent flex items-center justify-center hover:bg-transparent hover:opacity-70 active:opacity-50 transition-opacity z-10 shrink-0 cv-icon-btn back-btn chat-header__back-button chat-header-control--plain"
              >
                <span className="cv-back-icon flex items-center justify-center w-full h-full">
                  <ChevronLeft className="w-4 h-4 text-[var(--text-primary)]" />
                </span>
              </button>

              <div className="flex items-center gap-1.5 w-max max-w-[200px] header-title">
                {activeCharacter.isGroupChat ? (
                  <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] shrink-0 header-title-avatar">
                    👥
                  </div>
                ) : (
                  <img
                    src={activeCharacter.avatar}
                    alt=""
                    className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/50 header-title-avatar"
                  />
                )}
                <h2 className="text-[13px] font-bold text-slate-800 tracking-tight truncate header-title-name chat-header__name">
                  {activeCharacter.remark || activeCharacter.name}
                  {activeCharacter.isGroupChat && (
                    <span className="text-slate-400 font-normal ml-0.5">
                      ({1 + (activeCharacter.memberIds?.length || 0)})
                    </span>
                  )}
                </h2>
                {!activeCharacter.isGroupChat && (
                  <div className="flex items-center gap-0.5 character-status chat-header__status">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-indicator online animate-pulse" />
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  loadCharacterDraft(activeCharacter, activeRelationship);
                  setAdvancedSettingsSection(null);
                  setIsShowingCardModal(!isShowingCardModal);
                }}
                className="w-8 h-8 rounded-none bg-transparent flex items-center justify-center hover:bg-transparent hover:opacity-70 active:opacity-50 transition-opacity z-10 shrink-0 cv-icon-btn menu-btn chat-header__more-button chat-header-control--plain"
              >
                <span className="cv-menu-icon flex items-center justify-center w-full h-full">
                  <MoreHorizontal className="w-4 h-4 text-[var(--text-primary)]" />
                </span>
              </button>
            </div>
            </div>



          {/* Character Details / Settings Full-Screen Page */}
          {isShowingCardModal && chatSettingsPortalTarget && createPortal(
            <div className="chat-settings-page absolute inset-0 z-50 bg-slate-50 flex flex-col h-full animate-slide-up">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
                <button
                  onClick={() => {
                    if (isShowingAdvancedSettings) setAdvancedSettingsSection(null);
                    else setIsShowingCardModal(false);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </button>
                <h2 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
                  {advancedSettingsTitle}
                </h2>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  aria-label="保存设置"
                  title="保存设置"
                  className="w-8 h-8 rounded-full bg-neutral-950 text-white flex items-center justify-center hover:bg-neutral-800 active:scale-95 transition-all z-10 shrink-0"
                >
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 pb-[34px] space-y-3">
                 {!isShowingAdvancedSettings && (
                    <>
                  {/* Character Profile Summary & Remark Settings */}
                <div className="bg-white p-4 rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden flex items-center gap-3">
                  <div className="relative shrink-0">
                    <RenderAvatar
                      src={draftAvatar || (activeCharacter.isGroupChat ? "👥" : activeCharacter.avatar)}
                      alt={activeCharacter.name}
                      name={activeCharacter.name}
                      className="w-12 h-12 rounded-[16px] border border-slate-100 object-cover shrink-0 flex items-center justify-center text-3xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-slate-100 select-none"
                    />
                    {activeCharacter.isGroupChat && (
                      <label className="absolute -bottom-1 -right-1 bg-neutral-950 text-white rounded-full p-1 border-2 border-white cursor-pointer shadow-sm hover:bg-neutral-900 transition-colors">
                        <Sliders className="w-3 h-3" />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const compressed = await compressImage(file, 400, 400, 0.75);
                                setDraftAvatar(compressed);
                              } catch (err) {
                                console.error("Group avatar compression failed:", err);
                              }
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isEditingRemark ? (
                        <input
                          autoFocus
                          type="text"
                          value={draftRemark}
                          onChange={(e) => setDraftRemark(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") setIsEditingRemark(false);
                          }}
                          placeholder={activeCharacter.isGroupChat ? "输入新群名..." : "设置备注昵称..."}
                          className="cv-remark-input h-8 min-w-0 flex-1 bg-[#F7F7F9] px-3 !rounded-[12px] border border-transparent shadow-none focus:outline-none text-sm text-slate-600 placeholder-slate-400 font-normal"
                        />
                      ) : (
                        <span className="text-base font-medium text-slate-800 truncate">
                          {activeCharacter.isGroupChat
                            ? (draftRemark.trim() || activeCharacter.name)
                            : activeCharacter.name}
                          {!activeCharacter.isGroupChat && draftRemark.trim() && `（${draftRemark.trim()}）`}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsEditingRemark((editing) => !editing)}
                        aria-label={isEditingRemark ? "完成备注编辑" : "编辑备注昵称"}
                        title={isEditingRemark ? "完成备注编辑" : "编辑备注昵称"}
                        className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Group Members List for Group Chats */}
                {activeCharacter.isGroupChat && (
                  <div className="bg-white p-4 rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3">
                    <div className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                      群聊成员 ({1 + (activeCharacter.memberIds?.length || 0)} 人)
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {/* User */}
                      <div className="flex flex-col items-center space-y-1 text-center">
                        <RenderAvatar
                          src={settings.avatar}
                          alt="我"
                          name="我"
                          className="w-10 h-10 rounded-full border border-slate-100 object-cover shrink-0 flex items-center justify-center text-xs select-none font-bold"
                        />
                        <span className="text-[10px] font-bold text-slate-600 truncate w-full">我</span>
                      </div>
                      {/* Character Members */}
                      {(activeCharacter.memberIds || []).map((memberId) => {
                        const member = characters.find(c => c.id === memberId);
                        if (!member) return null;
                        return (
                          <div key={member.id} className="flex flex-col items-center space-y-1 text-center relative">
                            <div className="relative">
                              <RenderAvatar
                                src={member.avatar}
                                alt={member.name}
                                name={member.remark || member.name}
                                className="w-10 h-10 rounded-full border border-slate-100 object-cover shrink-0 flex items-center justify-center text-xs select-none font-bold"
                              />
                              {isDeleteMemberMode && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRemoveGroupMember(member.id);
                                  }}
                                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm transition-all"
                                  title="移除此成员"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-600 truncate w-full">
                              {member.remark || member.name}
                            </span>
                          </div>
                        );
                      })}

                      {/* Add Member Button */}
                      <div className="flex flex-col items-center justify-center space-y-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setIsDeleteMemberMode(false);
                            setShowAddMemberModal(true);
                          }}
                          className="w-10 h-10 rounded-full border border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 hover:bg-slate-50 transition-colors"
                        >
                          <Plus className="w-5 h-5 text-slate-400" />
                        </button>
                        <span className="text-[10px] font-bold text-slate-400">添加</span>
                      </div>

                      {/* Remove Member Button */}
                      <div className="flex flex-col items-center justify-center space-y-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setIsDeleteMemberMode(!isDeleteMemberMode);
                          }}
                          className={`w-10 h-10 rounded-full border border-dashed flex items-center justify-center transition-colors ${
                            isDeleteMemberMode 
                              ? "border-red-500 bg-red-50 text-red-500" 
                              : "border-slate-300 text-slate-400 hover:border-slate-400 hover:bg-slate-50"
                          }`}
                        >
                          <Minus className="w-5 h-5" />
                        </button>
                        <span className="text-[10px] font-bold text-slate-400">
                          {isDeleteMemberMode ? "完成" : "删除"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Chat Background customizer */}
                <div className="bg-white p-4 rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3 text-xs">
                  <span className="text-slate-800 font-medium block text-[15px]">背景壁纸</span>
                  {draftChatBg ? (
                    <div className="relative group rounded-[12px] overflow-hidden border border-slate-200 bg-slate-50 h-12 flex items-center justify-center">
                      <img src={draftChatBg} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                      <div className="relative z-10 flex gap-2">
                        <label className="cursor-pointer bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-[16px] text-[10px] font-bold transition-colors shadow-sm border border-slate-200">
                          更换背景
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleDraftChatBgUpload}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setDraftChatBg(undefined)}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-[16px] text-[10px] font-bold transition-colors shadow-sm"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex h-12 flex-col items-center justify-center border border-dashed border-slate-300 hover:border-slate-400 bg-[#F7F7F9] hover:bg-slate-100/50 px-3 rounded-[12px] text-sm text-[#8E8E93] transition-colors group">
                      <span className="font-medium group-hover:text-slate-700">点击上传背景图片</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleDraftChatBgUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <div className="px-1 pt-1 text-[14px] font-medium text-[#999]">偏好设置</div>

                {/* Chat behaviour */}
                <div className="bg-white py-0 rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden text-xs">
                  {/* Settings toggles */}
                  <div className="divide-y divide-slate-100">
                    {/* Pin Chat */}
                    <div className="flex h-[52px] px-4 items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-800 font-medium text-[16px] block">置顶聊天</span>
                      </div>
                      <SettingsSwitch checked={draftIsPinned} onChange={setDraftIsPinned} label="置顶聊天" />
                    </div>

                    {/* Disable Bracket Actions */}
                    <div className="flex h-[52px] px-4 items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-800 font-medium text-[16px] block">过滤括号动作描写</span>
                      </div>
                      <SettingsSwitch checked={draftDisableBracketActions} onChange={setDraftDisableBracketActions} label="过滤括号动作描写" />
                    </div>

                    {/* Time Awareness */}
                    <div className="flex h-[52px] px-4 items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-800 font-medium text-[16px] block">时间感知功能</span>
                      </div>
                      <SettingsSwitch checked={draftEnableTimeAwareness} onChange={setDraftEnableTimeAwareness} label="时间感知" />
                    </div>

                    {/* Auto Translate Toggle */}
                    <div className="flex h-[52px] px-4 items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-800 font-medium text-[16px] block">全部自动翻译</span>
                      </div>
                      <SettingsSwitch checked={draftEnableAutoTranslate} onChange={setDraftEnableAutoTranslate} label="自动翻译" />
                    </div>

                    {!activeCharacter.isGroupChat && activeRelationship && (
                      <div className="flex h-[52px] px-4 items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-slate-800 font-medium text-[16px] block">主动发起线下</span>
                        </div>
                        <SettingsSwitch
                          checked={draftEnableProactiveOffline}
                          onChange={setDraftEnableProactiveOffline}
                          label="主动发起线下"
                        />
                      </div>
                    )}

                    {!activeCharacter.isGroupChat && <div className={draftEnableProactiveChat ? "min-h-[52px]" : "contents"}>
                      <div className="flex h-[52px] px-4 items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-slate-800 font-medium text-[16px] block">主动联络</span>
                        </div>
                        <SettingsSwitch checked={draftEnableProactiveChat} onChange={setDraftEnableProactiveChat} label="主动联络" />
                      </div>
                      {draftEnableProactiveChat && (
                        <div className="flex items-end gap-3 px-4 pt-3 pb-3">
                          <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-slate-400 font-bold mb-1">开始时间</span>
                            <select value={draftProactiveStartTime} onChange={(e) => setDraftProactiveStartTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-xs text-slate-700 font-medium font-mono focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 focus:outline-none">
                              {Array.from({ length: 48 }, (_, i) => { const h = Math.floor(i / 2).toString().padStart(2, "0"); const m = i % 2 === 0 ? "00" : "30"; const t = `${h}:${m}`; return <option key={t} value={t}>{t}</option>; })}
                            </select>
                          </div>
                          <span className="text-xs text-slate-400 font-bold mb-2">至</span>
                          <div className="flex flex-col flex-1">
                            <span className="text-[9px] text-slate-400 font-bold mb-1">结束时间</span>
                            <select value={draftProactiveEndTime} onChange={(e) => setDraftProactiveEndTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-xs text-slate-700 font-medium font-mono focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 focus:outline-none">
                              {Array.from({ length: 48 }, (_, i) => { const h = Math.floor(i / 2).toString().padStart(2, "0"); const m = i % 2 === 0 ? "00" : "30"; const t = `${h}:${m}`; return <option key={t} value={t}>{t}</option>; })}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>}

                    {!activeCharacter.isGroupChat && <div className={`flex h-[52px] px-4 items-center justify-between gap-3 ${draftEnableProactiveChat ? "" : "border-t border-slate-100"}`}>
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-800 font-medium text-[16px] block">主动来电</span>
                      </div>
                      <SettingsSwitch checked={draftEnableProactiveCall} onChange={setDraftEnableProactiveCall} label="主动来电" />
                    </div>}
                  </div>
                </div>

                  </>
                )}

                 {!isShowingAdvancedSettings && (
                   <div className="px-1 pt-1 text-[14px] font-medium text-[#999]">更多设置</div>
                 )}

                 {isShowingAdvancedSettings ? (
                   <>
                     {advancedSettingsSection === "memory" && (
                       <>
                     {/* Three-Layer Memory Optimization System Panel */}
                        <div className="space-y-3 text-xs">
                      <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
                        <span className="text-slate-800 font-bold text-sm">记忆配置</span>
                      </div>

                      {/* Token Preview Badge Container */}
                      <div className="theme-memory-config-card bg-[var(--surface-raised)] border border-[var(--border)] p-4 rounded-[16px] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                            单次 Prompt 预估消耗预览
                          </span>
                          <span className="theme-memory-value-badge bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-bold font-mono px-2.5 py-0.5 rounded-full">
                            ~{estimatedTokens.total} Tokens
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[10px] text-[var(--text-secondary)] font-medium font-mono">
                          <div className="bg-[var(--surface)] p-2 rounded-[12px] border border-[var(--border)] text-center">
                            <span className="block text-[var(--text-tertiary)] text-[9px] mb-0.5">短期上下文</span>
                            <span className="font-bold text-[var(--text-primary)]">~{estimatedTokens.context} t</span>
                          </div>
                          <div className="bg-[var(--surface)] p-2 rounded-[12px] border border-[var(--border)] text-center">
                            <span className="block text-[var(--text-tertiary)] text-[9px] mb-0.5">深度记忆库</span>
                            <span className="font-bold text-[var(--text-primary)]">~{estimatedTokens.retrieval} t</span>
                          </div>
                          <div className="bg-[var(--surface)] p-2 rounded-[12px] border border-[var(--border)] text-center">
                            <span className="block text-[var(--text-tertiary)] text-[9px] mb-0.5">人设与常驻</span>
                            <span className="font-bold text-[var(--text-primary)]">~{estimatedTokens.persona} t</span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 1: Short-term Context */}
                      <div className="theme-memory-config-card bg-[var(--surface-raised)] border border-[var(--border)] space-y-3.5 p-4 rounded-[16px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--text-primary)] font-bold text-xs">短期实时上下文</span>
                          <span className="theme-memory-value-badge bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-bold font-mono px-2.5 py-0.5 rounded-full">
                            {draftContextMemoryLimit} 轮 / {draftContextMemoryLimit} 条消息
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <input
                            type="range"
                            min={10}
                            max={50}
                            step={1}
                            value={draftContextMemoryLimit}
                            onChange={(e) => setDraftContextMemoryLimit(parseInt(e.target.value))}
                            className="theme-memory-range w-full h-1 rounded-full appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[8px] text-[var(--text-tertiary)] font-mono">
                            <span>10轮</span>
                            <span>20轮(默认)</span>
                            <span>35轮</span>
                            <span>50轮</span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 2: Long-term History Retrieval Pool */}
                      <div className="theme-memory-config-card bg-[var(--surface-raised)] border border-[var(--border)] space-y-3.5 p-4 rounded-[16px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--text-primary)] font-bold text-xs">长期历史检索池</span>
                          <span className="theme-memory-value-badge bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-bold font-mono px-2.5 py-0.5 rounded-full">
                            {draftRetrievalHistoryLimit} 条
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <input
                            type="range"
                            min={10}
                            max={200}
                            step={10}
                            value={draftRetrievalHistoryLimit}
                            onChange={(e) => setDraftRetrievalHistoryLimit(parseInt(e.target.value))}
                            className="theme-memory-range w-full h-1 rounded-full appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[8px] text-[var(--text-tertiary)] font-mono">
                            <span>10条</span>
                            <span>50条</span>
                            <span>100条(默认)</span>
                            <span>150条</span>
                            <span>200条</span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 3: Long-term Archived Memory */}
                      <div className="theme-memory-config-card bg-[var(--surface-raised)] border border-[var(--border)] space-y-3.5 p-4 rounded-[16px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--text-primary)] font-bold text-xs">对话后台自动归档</span>
                          <div className="flex items-center gap-2">
                            <span className="theme-memory-value-badge bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-bold font-mono px-2.5 py-0.5 rounded-full">
                              {draftEnableAutoArchive ? `${draftAutoArchiveInterval} 轮` : "已关闭"}
                            </span>
                            <SettingsSwitch checked={draftEnableAutoArchive} onChange={setDraftEnableAutoArchive} label="自动归档" />
                          </div>
                        </div>

                        <div className={`space-y-1 transition-opacity ${draftEnableAutoArchive ? "opacity-100" : "opacity-70 pointer-events-none"}`}>
                          <input
                            type="range"
                            min={10}
                            max={100}
                            step={10}
                            value={draftAutoArchiveInterval}
                            onChange={(e) => setDraftAutoArchiveInterval(parseInt(e.target.value))}
                            disabled={!draftEnableAutoArchive}
                            className="theme-memory-range w-full h-1 rounded-full appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[8px] text-[var(--text-tertiary)] font-mono">
                            <span>10轮</span>
                            <span>30轮</span>
                            <span>50轮(默认)</span>
                            <span>80轮</span>
                            <span>100轮</span>
                          </div>
                        </div>
                      </div>

                      {/* One-click manual archive button */}
                      <div className="pt-1">
                        <button
                          type="button"
                          disabled={isManualArchiving || currentChatMessages.length === 0}
                          onClick={async () => {
                            try {
                              setIsManualArchiving(true);
                              const count = await handleExtractMemories();
                              if (count > 0) {
                                showToast(`🎉 手动归档并提炼成功！已存入“${activeCharacter.name}”的记忆档案馆`);
                              } else {
                                showToast("当前没有需要归档提炼的新深度对话！");
                              }
                            } catch (err) {
                              showToast("一键归档时发生未知错误，请重试");
                            } finally {
                              setIsManualArchiving(false);
                            }
                          }}
                          className={`w-full py-2.5 rounded-[16px] text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            isManualArchiving || currentChatMessages.length === 0
                              ? "bg-[var(--button-disabled-bg)] text-[var(--button-disabled-text)] cursor-not-allowed border border-[var(--button-disabled-border)]"
                              : "bg-[var(--button-primary-bg)] hover:bg-[var(--button-primary-hover-bg)] text-[var(--button-primary-text)] shadow-sm"
                          }`}
                        >
                          {isManualArchiving ? (
                            <>
                              <span className="w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                              正在进行深度记忆归档...
                            </>
                          ) : (
                            <>
                              <Database className="w-3.5 h-3.5" />
                              一键手动提炼归档当前对话
                            </>
                          )}
                        </button>
                      </div>
                     </div>
                       </>
                     )}

                     {/* Character-specific voice settings */}
                      {advancedSettingsSection === "voiceImage" && (
                     <div className="bg-white p-4 rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-800 font-bold text-sm">语音设置</span>
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-1">Mossland VOICE ID</label>
                          <input
                            type="text"
                            value={draftMosslandVoiceId}
                            onChange={(e) => setDraftMosslandVoiceId(e.target.value)}
                            placeholder="请输入 Mossland Voice ID"
                            className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-xs text-slate-700 font-semibold placeholder-slate-400 focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-1">MiniMax VOICE ID</label>
                          <input
                            type="text"
                            value={draftMinimaxVoiceId}
                            onChange={(e) => setDraftMinimaxVoiceId(e.target.value)}
                            placeholder="请输入 MiniMax Voice ID"
                            className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-xs text-slate-700 font-semibold placeholder-slate-400 focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-semibold">MiniMax 专属语速调节</span>
                            <span className="text-xs font-bold text-slate-800 font-mono">{draftMinimaxSpeed}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={draftMinimaxSpeed}
                            onChange={(e) => setDraftMinimaxSpeed(Number(e.target.value))}
                            className="w-full accent-black h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[8px] text-slate-400 font-semibold">
                            <span>极慢 (0.5)</span>
                            <span>正常 (1.0)</span>
                            <span>极快 (2.0)</span>
                          </div>
                      </div>
                      <p className="text-[9px] leading-relaxed text-slate-400">两个平台的音色 ID 分开保存，实际播放使用全局语音设置中当前选择的平台。</p>
                    </div>
                    </div>
                    )}

                     {/* Character Specific CSS Customizer */}
                      {advancedSettingsSection === "voiceImage" && !activeCharacter.isGroupChat && (
                       <div className="bg-white p-4 rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3 text-xs">
                        <div className="flex items-center justify-between"><div><span className="text-slate-800 font-bold text-sm block">图片生成设置</span><span className="text-[10px] text-slate-400">外貌资料属于角色本身，所有身份共用；聊天与记录仍按关系隔离。</span></div><SettingsSwitch checked={draftEnableImageGeneration} onChange={setDraftEnableImageGeneration} label="角色图片生成" /></div>
                        <textarea rows={4} value={draftImageAppearancePrompt} onChange={(event) => setDraftImageAppearancePrompt(event.target.value)} placeholder="外貌、服饰、气质、镜头偏好…" className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs leading-relaxed outline-none" />
                        <textarea rows={2} value={draftImageNegativePrompt} onChange={(event) => setDraftImageNegativePrompt(event.target.value)} placeholder="负面提示词，例如：不要水印、不要文字、不要变脸…" className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs leading-relaxed outline-none" />
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3"><p className="mb-2 text-[10px] text-slate-500">参考图仅支持一张，保存到本机 IndexedDB；备份仅包含元数据，不包含图片二进制。</p><label className="inline-flex cursor-pointer items-center rounded-lg bg-white px-3 py-2 text-[10px] font-bold text-slate-700 shadow-sm"><Camera className="mr-1 h-3.5 w-3.5" />{draftImageReferenceAssetId ? "替换参考图" : "上传参考图"}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) return showToast("参考图不能超过 8MB。"); const assetId = `character-reference-${activeCharacter.id}`; try { await imageAssetDb.saveImage(assetId, file); if (draftImageReferenceAssetId && draftImageReferenceAssetId !== assetId) await imageAssetDb.deleteImage(draftImageReferenceAssetId); setDraftImageReferenceAssetId(assetId); setDraftImageReferenceMimeType(file.type); showToast("参考图已保存，点击右上角保存设置后生效。"); } catch { showToast("参考图保存失败。"); } }} /></label>{draftImageReferenceAssetId && <button type="button" onClick={() => { imageAssetDb.deleteImage(draftImageReferenceAssetId).catch(() => undefined); setDraftImageReferenceAssetId(undefined); setDraftImageReferenceMimeType(undefined); }} className="ml-2 text-[10px] font-bold text-rose-500">移除</button>}</div>
                      </div>
                    )}

                     {advancedSettingsSection === "appearance" && (
                     <>
                      <div className="bg-white p-4 rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3 text-xs">
                       <div className="flex items-center justify-between">
                         <span className="text-slate-800 font-bold text-sm">个性化样式</span>
                        <button
                          type="button"
                          onClick={copyCssExampleTemplate}
                          className="text-[9px] text-slate-500 font-medium bg-slate-100 px-2 py-1 rounded-[8px] transition-colors hover:bg-slate-200"
                        >
                          {cssTemplateCopied ? "已复制" : "复制模板"}
                        </button>
                      </div>
                      <textarea
                        rows={12}
                        value={draftCustomCss}
                        onChange={(e) => setDraftCustomCss(e.target.value)}
                        placeholder={COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE}
                        className="w-full bg-slate-50 p-4 text-[10px] text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 font-mono leading-relaxed h-48"
                      />
                    </div>

                     <div className="bg-white p-4 rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3 text-xs">
                      <div className="flex items-center justify-between"><span className="text-slate-800 font-bold text-sm">聊天图标覆盖</span><span className="text-[9px] text-slate-400">留空继承全局或默认图标</span></div>
                      <div className="grid grid-cols-2 gap-2">
                        {CHAT_ICON_FIELDS.map(({ key, label }) => <label key={key} className="space-y-1"><span className="block text-[10px] text-slate-500 font-medium">{label}图标</span><input value={draftChatIcons[key] || ""} onChange={(e) => updateDraftChatIcon(key, e.target.value)} placeholder="图片 URL" className="w-full px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[10px] focus:outline-none focus:ring-1 focus:ring-neutral-950" /></label>)}
                      </div>
                     </div>
                     </>
                     )}

                   </>
                  ) : (
                    <div className="bg-white rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] divide-y divide-slate-100 overflow-hidden">
                      {[
                        { key: "memory", label: "记忆设置" },
                        { key: "voiceImage", label: "语音图片" },
                        { key: "appearance", label: "美化样式" },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setAdvancedSettingsSection(key as "memory" | "voiceImage" | "appearance")}
                          className="w-full h-[52px] px-4 flex items-center gap-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
                          aria-label={`打开${label}`}
                        >
                          <span className="text-slate-800 font-medium text-[15px] flex-1">{label}</span>
                          <ChevronRight className="w-5 h-5 text-[#C7C7CC] shrink-0 ml-3" />
                        </button>
                      ))}
                    </div>
                  )}

                 {!isShowingAdvancedSettings && (
                    <div className="space-y-3 pt-3">
                    <div className="px-1 text-[14px] font-medium text-[#999]">危险操作</div>
                    {/* Destructive actions */}
                    <div className="bg-white rounded-[16px] border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] divide-y divide-slate-100 overflow-hidden">
                   <button
                    type="button"
                    onClick={() => setShowClearHistoryModal(true)}
                     className="w-full h-[52px] px-4 flex items-center justify-between text-[16px] font-medium text-[#FF3B30] transition-colors hover:bg-red-50 active:bg-red-100"
                  >
                      <span>清空好友全部记忆</span>
                     <ChevronRight className="w-5 h-5 text-[#C7C7CC]" />
                  </button>

                  {!activeCharacter.isGroupChat ? (
                    <button
                      type="button"
                      onClick={handleDeleteFriend}
                       className="w-full h-[52px] px-4 flex items-center justify-between text-[16px] font-medium text-[#FF3B30] transition-colors hover:bg-red-50 active:bg-red-100"
                    >
                       <span>删除好友</span>
                       <ChevronRight className="w-5 h-5 text-[#C7C7CC]" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDisbandGroupModal(true)}
                        className="w-full h-[52px] px-4 flex items-center justify-between text-[16px] font-medium text-[#FF3B30] transition-colors hover:bg-red-50 active:bg-red-100"
                    >
                       <span>解除群聊</span>
                       <ChevronRight className="w-5 h-5 text-[#C7C7CC]" />
                    </button>
                   )}
                    </div>
                    </div>
                 )}
              </div>

              {/* Clear History Choice Modal Overlay */}
              {showClearHistoryModal && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-[24px] p-6 max-w-xs w-full shadow-2xl border border-slate-100 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                        <h3 className="font-bold text-slate-800 text-sm">清空好友全部记忆</h3>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                         将清除与当前好友关系相关的聊天、朋友圈、记忆、线下剧本、日记及其他生成记录，但不会删除好友、人设或关系设置。
                        </p>
                      </div>
                      <div className="flex flex-col gap-2.5 pt-2">
                       <button
                         onClick={() => {
                           if (!activeCharacter || activeCharacter.isGroupChat) return;
                           const currentIdentityRelation = relationForCharacter(activeCharacter.id);
                           const relationToClear = activeRelationship?.userIdentityId === activeIdentityId
                             ? activeRelationship
                             : currentIdentityRelation;
                           const relationId = relationToClear?.id || activeChatRelationId;
                           if (!relationId) {
                             showToast("找不到当前好友关系，无法执行安全清理。");
                             return;
                           }
                           if (!window.confirm("确定要清空该好友的全部记忆吗？聊天、朋友圈、记忆、线下剧本、日记及其他相关记录都会永久删除，好友和人设不会删除。")) return;
                           clearFriendScopedMemory(activeCharacter.id, relationId);
                           setShowClearHistoryModal(false);
                           setEmptyGreetingCheckedCharIds((previous) => previous.filter((id) => id !== activeChatCharId));
                           setSentGreetings((previous) => previous.filter((id) => id !== activeChatCharId));
                           showToast("已清空好友全部记忆");
                         }}
                         className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-xs transition-colors border border-red-200"
                       >
                         直接彻底清空
                      </button>
                      <button
                        onClick={() => setShowClearHistoryModal(false)}
                        className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Disband Group Choice Modal Overlay */}
              {showDisbandGroupModal && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl border border-slate-100 text-center space-y-4 animate-fade-in">
                    <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-slate-800 text-sm">解除群聊</h3>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        确定要解除当前群聊吗？解除后该群聊及其所有对话记录和动态将被完全删除，且该操作不可撤销。
                      </p>
                    </div>
                    <div className="flex flex-col gap-2.5 pt-2">
                      <button
                        onClick={async () => {
                          setShowDisbandGroupModal(false);
                          setIsCompressingMemory(true);
                          try {
                            // Step 1: Extract memories to Memory Vault
                            const count = await handleExtractMemories();
                            alert(`成功提取并提炼了 ${count} 条核心群聊记忆存入“记忆书”，群聊已安全解除！`);
                          } catch (err) {
                            console.error("Extract memories failed:", err);
                          } finally {
                            setIsCompressingMemory(false);
                          }
                          // Step 2: Delete character / disband group
                          if (onDeleteCharacter) {
                            onDeleteCharacter(activeChatCharId!, true, true);
                          }
                          setIsShowingCardModal(false);
                          setActiveChatCharId(null);
                        }}
                        disabled={isCompressingMemory}
                        className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isCompressingMemory ? "正在提炼并解除..." : "💡 提炼记忆存入记忆书并解除"}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("确定要直接解除并删除该群聊吗？该操作不可撤销，且不会保存任何记忆。")) {
                            setShowDisbandGroupModal(false);
                            if (onDeleteCharacter) {
                              onDeleteCharacter(activeChatCharId!, true);
                            }
                            setIsShowingCardModal(false);
                            setActiveChatCharId(null);
                          }
                        }}
                        className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-xs transition-colors border border-red-600 shadow-sm"
                      >
                        直接彻底解除并删除
                      </button>
                      <button
                        onClick={() => setShowDisbandGroupModal(false)}
                        className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Add Group Member Modal Overlay */}
              {showAddMemberModal && activeCharacter && (
                <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-[320px] w-full flex flex-col max-h-[85%] animate-slide-up border border-slate-100">
                    
                    {/* Modal Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                      <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-neutral-800" />
                        <span>添加群成员</span>
                      </h3>
                      <button
                        onClick={() => {
                          setShowAddMemberModal(false);
                          setSelectedAddMemberIds([]);
                        }}
                        className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Modal Body */}
                    <div className="flex-1 overflow-y-auto py-3 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          选择要添加的成员 ({selectedAddMemberIds.length} 已选)
                        </label>
                        {(() => {
                          const addCandidates = friends.filter(
                            (c) => !(activeCharacter.memberIds || []).includes(c.id)
                          );
                          if (addCandidates.length === 0) {
                            return (
                              <p className="text-[10px] text-slate-400 italic py-2 text-center">所有好友都已在此群聊中。</p>
                            );
                          }
                          return (
                            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                              {addCandidates.map((char) => {
                                const isSelected = selectedAddMemberIds.includes(char.id);
                                return (
                                  <div
                                    key={char.id}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedAddMemberIds(prev => prev.filter(id => id !== char.id));
                                      } else {
                                        setSelectedAddMemberIds(prev => [...prev, char.id]);
                                      }
                                    }}
                                    className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all ${
                                      isSelected
                                        ? "bg-neutral-50 border-neutral-950 shadow-sm"
                                        : "bg-slate-50/50 border-slate-100 hover:bg-slate-50"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <img
                                        src={char.avatar}
                                        alt={char.name}
                                        className="w-7 h-7 rounded-full object-cover bg-slate-100 border border-slate-100 shrink-0"
                                      />
                                      <div className="min-w-0">
                                        <span className="text-[11px] font-bold text-slate-800 block truncate">{char.remark || char.name}</span>
                                        <span className="text-[9px] text-slate-400 block truncate">{char.mbti || "MBTI"} &bull; {char.personality.substring(0, 15)}...</span>
                                      </div>
                                    </div>
                                    <div className="shrink-0 pl-1.5">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        readOnly
                                        className="rounded border-slate-300 text-neutral-950 focus:ring-neutral-950 w-3.5 h-3.5 cursor-pointer"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="pt-3 border-t border-slate-100 shrink-0 flex gap-2">
                      <button
                        onClick={() => {
                          setShowAddMemberModal(false);
                          setSelectedAddMemberIds([]);
                        }}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all text-center"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          handleAddGroupMembers(selectedAddMemberIds);
                          setSelectedAddMemberIds([]);
                        }}
                        disabled={selectedAddMemberIds.length === 0}
                        className="flex-1 py-2 bg-neutral-950 hover:bg-neutral-900 text-white rounded-xl text-xs font-bold transition-all text-center disabled:opacity-40"
                      >
                        确定添加
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>,
            chatSettingsPortalTarget,
          )}

          {/* Active Chat Messages body */}
          <div className={`chat-content-scope chat-page chat-theme chat-page__background ${activeStylePreset === "liquid-glass" ? "style-liquid-glass" : ""} ${hasUserCustomChatCss ? "user-custom-chat-css" : ""} relative flex min-h-0 flex-1 flex-col`}>
          <MessageList
            key={`${activeChatCharId ?? "none"}:${activeRelationship?.id ?? activeChatRelationId ?? "none"}:${isOfflineModeActive ? "offline" : "online"}`}
            messages={visibleChatMessages}
            scrollRef={scrollContainerRef}
            renderWindowSize={120}
            className="relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-visible p-4 space-y-0 cv-messages-list chat-message-list"
            style={{
              background: activeCharacter.chatBg
                ? `url(${activeCharacter.chatBg}) center/cover no-repeat`
                : undefined,
              WebkitOverflowScrolling: "touch",
            }}
            contentClassName="chat-message-list-content"
            renderMessage={(msg, idx) => {
              const previousVisibleMessage = idx > 0 ? visibleChatMessages[idx - 1] : undefined;
              const interveningOfflineStories = getOfflineTimelineStoriesBetween(previousVisibleMessage?.timestamp, msg.timestamp);
              // Calculate WeChat timestamp divider
              let showWeChatDivider = false;
              let dividerText = "";
              if (!isOfflineModeActive) {
                if (idx === 0) {
                  showWeChatDivider = true;
                  dividerText = formatWeChatTimestamp(msg.timestamp);
                } else {
                  const prevMsg = visibleChatMessages[idx - 1];
                  if (prevMsg) {
                    const prevDate = new Date(prevMsg.timestamp);
                    const currDate = new Date(msg.timestamp);
                    const isCrossDay = prevDate.getFullYear() !== currDate.getFullYear() ||
                                       prevDate.getMonth() !== currDate.getMonth() ||
                                       prevDate.getDate() !== currDate.getDate();
                    const hasTimeGap = (msg.timestamp - prevMsg.timestamp) > 5 * 60 * 1000;
                    
                    if (isCrossDay || hasTimeGap) {
                      showWeChatDivider = true;
                      dividerText = formatWeChatTimestamp(msg.timestamp);
                    }
                  }
                }
              }

              const wrapSelectableMessage = (messageElement: React.ReactElement) => {
                if (!isMultiSelectDeleteMode) return messageElement;
                const isSelected = selectedMessageIds.has(msg.id);
                return (
                  <div
                    key={`selectable-${msg.id}`}
                    className="chat-message-selection-row flex w-full items-center gap-2"
                    onClickCapture={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleMultiSelectedMessage(msg.id);
                    }}
                    onPointerDownCapture={(event) => {
                      event.stopPropagation();
                    }}
                    onContextMenuCapture={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleMultiSelectedMessage(msg.id);
                    }}
                  >
                    <button
                      type="button"
                      aria-label={isSelected ? "取消选择消息" : "选择消息"}
                      aria-pressed={isSelected}
                      className={`chat-message-selection-toggle ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isSelected
                          ? "border-neutral-950 bg-neutral-950 text-white"
                          : "border-stone-300 bg-white/90 text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">{messageElement}</div>
                  </div>
                );
              };

              const wrapMessageWithDivider = (messageElement: React.ReactElement) => {
                const selectableMessage = wrapSelectableMessage(messageElement);
                if (!showWeChatDivider && interveningOfflineStories.length === 0) return selectableMessage;
                return (
                  <React.Fragment key={`msg-group-${msg.id}`}>
                    {interveningOfflineStories.map((story) => {
                      const occurredAt = story.onlineHandoff?.endedAt ?? story.archivedAt ?? story.lastMemorySyncAt ?? story.updatedAt;
                      const eventDate = new Date(occurredAt);
                      const eventTime = eventDate.toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                      return (
                        <div key={`offline-timeline-${story.id}`} className="chat-offline-timeline-event w-full flex justify-center my-3.5 select-none animate-fade-in">
                          <div className="chat-offline-timeline-event__label bg-black/5 dark:bg-white/10 text-[#777] dark:text-stone-300 text-[11.5px] px-2.5 py-1 rounded-[4px] tracking-wide font-normal">
                            {eventTime} · 线下见面 · 《{story.title}》
                          </div>
                        </div>
                      );
                    })}
                    {showWeChatDivider && (
                      <div className="w-full flex justify-center my-3.5 select-none animate-fade-in chat-timestamp" id={`timestamp-divider-${msg.id}`}>
                        <div className="bg-black/5 dark:bg-white/10 text-[#888888] dark:text-stone-400 text-[11.5px] px-2.5 py-0.5 rounded-[4px] tracking-wide font-normal chat-timestamp__label">
                          {dividerText}
                        </div>
                      </div>
                    )}
                    {selectableMessage}
                  </React.Fragment>
                );
              };

              if (isOfflineModeActive) {
                // 1. Narration (centered divider with grey text and dashed line)
                if (msg.isNarration) {
                  return wrapSelectableMessage(
                    <div 
                      key={msg.id}
                      className="w-full py-2.5 px-2 my-1.5 text-center text-[11px] leading-relaxed text-[#a1a3a8] border-b border-dashed border-slate-100/60 dark:border-slate-800/60 transition-all cursor-pointer"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setActiveMenuMsg(msg);
                        setMenuPosition({ x: e.clientX, y: e.clientY });
                      }}
                    >
                      <div className="max-w-[90%] mx-auto font-normal tracking-wide select-text">
                        {msg.content}
                      </div>
                    </div>,
                  );
                }

                // 2. Character lines & descriptions (beautiful book paragraph layout, NO bubble, NO avatar)
                if (msg.sender === "character") {
                  return wrapSelectableMessage(
                    <div 
                      key={msg.id}
                      className="w-full text-left my-4 px-1 py-1 group/novel relative select-text transition-all duration-200 hover:bg-slate-50/10 dark:hover:bg-stone-800/20 rounded-lg cursor-pointer pr-10"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setActiveMenuMsg(msg);
                        setMenuPosition({ x: e.clientX, y: e.clientY });
                      }}
                    >
                      <p className="text-[14px] leading-loose text-stone-800 dark:text-stone-200 font-sans tracking-wide text-justify whitespace-pre-wrap">
                        {msg.content}
                      </p>

                      {/* MiniMax TTS play/pause/loading button for Offline Novel Layout */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerMessageSpeech(msg);
                        }}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-50 dark:bg-stone-850 border border-slate-200/60 hover:bg-white shadow-sm flex items-center justify-center transition-all ${
                          playingMessageId === msg.id 
                            ? "opacity-100 scale-105 ring-1 ring-indigo-400" 
                            : "opacity-0 group-hover/novel:opacity-100 focus:opacity-100"
                        }`}
                        style={{ width: "24px", height: "24px" }}
                        title="语音合成播放/暂停"
                      >
                        {audioLoadingMessageId === msg.id ? (
                          <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                        ) : playingMessageId === msg.id ? (
                          <Pause className="w-3 h-3 text-indigo-500 fill-indigo-500" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
                        )}
                      </button>
                    </div>,
                  );
                }

                // 3. User spoken dialogue ("我的发言", beautiful center-right soft grey bubble)
                return wrapSelectableMessage(
                  <div 
                    key={msg.id}
                    className="w-full flex justify-end my-4 group relative select-text cursor-pointer"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveMenuMsg(msg);
                      setMenuPosition({ x: e.clientX, y: e.clientY });
                    }}
                  >
                    <div className="relative max-w-[85%] bg-slate-100 dark:bg-stone-800/80 rounded-2xl px-4 py-2.5 shadow-sm hover:shadow-md transition-all border border-slate-200/40 dark:border-stone-700/40">
                      <p className="text-[13.5px] leading-relaxed text-[#5e6672] dark:text-stone-300 font-medium font-sans italic whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  </div>,
                );
              }

              if (msg.isNarration) {
                return wrapMessageWithDivider(
                  <div 
                    key={msg.id}
                    className="w-full py-2.5 px-2 my-1.5 text-center text-[11px] leading-relaxed text-[#a1a3a8] border-b border-dashed border-slate-100/60 dark:border-slate-800/60 transition-all cursor-pointer"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveMenuMsg(msg);
                      setMenuPosition({ x: e.clientX, y: e.clientY });
                    }}
                  >
                    <div className="max-w-[90%] mx-auto font-normal tracking-wide select-text">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const isSelf = msg.sender === "user";
              const prevMsg = idx > 0 ? visibleChatMessages[idx - 1] : null;
              const nextMsg = idx + 1 < visibleChatMessages.length ? visibleChatMessages[idx + 1] : null;
              const sameMessageGroup = (candidate: Message | null) => Boolean(
                !msg.isNarration
                &&
                candidate
                && !candidate.isNarration
                && candidate.sender === msg.sender
                && (
                  msg.sender === "user"
                  || !activeCharacter.isGroupChat
                  || (
                    Boolean(msg.senderId)
                    && Boolean(candidate.senderId)
                    && msg.senderId === candidate.senderId
                  )
                ),
              );
              const hasPreviousInGroup = sameMessageGroup(prevMsg);
              const hasNextInGroup = sameMessageGroup(nextMsg);
              const messageGroupPosition: "top" | "middle" | "bottom" = hasPreviousInGroup
                ? (hasNextInGroup ? "middle" : "bottom")
                : "top";
              const messageGroupClass = `msg-group-${messageGroupPosition}`;
              // While an offline story is active, online messages remain a separate
              // live channel. Keep their avatars visible instead of treating them as
              // one collapsed story paragraph.
              const shouldCollapse = settings.collapseConsecutiveAvatars !== false && !isOfflineStoryActiveFor(activeChatCharId);
              const isConsecutivePrev = hasPreviousInGroup;
              const showAvatar = !isConsecutivePrev || !shouldCollapse;
              
              const groupSenderChar = !isSelf && activeCharacter.isGroupChat && msg.senderId
                ? (characters.find(c => c.id === msg.senderId) || characters.find(c => c.name === msg.senderId))
                : null;
              const msgAvatar = groupSenderChar ? groupSenderChar.avatar : (isSelf ? settings.avatar : activeCharacter.avatar);
              const msgName = groupSenderChar ? (groupSenderChar.remark || groupSenderChar.name) : (activeCharacter.remark || activeCharacter.name);
              const renderBubbleInner = () => {
                return (
                  <div 
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveMenuMsg(msg);
                      setMenuPosition({ x: e.clientX, y: e.clientY });
                    }}
                    onPointerDown={(e) => {
                      if (e.pointerType === "mouse" && e.button !== 0) return;
                      const clientX = e.clientX;
                      const clientY = e.clientY;
                      const origin = { x: clientX, y: clientY };
                      const previous = bubbleLongPressRef.current.get(msg.id);
                      if (previous) clearTimeout(previous.timer);
                      const timer = setTimeout(() => {
                        bubbleLongPressRef.current.delete(msg.id);
                        setActiveMenuMsg(msg);
                        setMenuPosition({ x: clientX, y: clientY });
                      }, LONG_PRESS_DELAY);
                      bubbleLongPressRef.current.set(msg.id, { timer, origin });
                    }}
                    onPointerUp={(e) => {
                      const pending = bubbleLongPressRef.current.get(msg.id);
                      if (pending) {
                        clearTimeout(pending.timer);
                        bubbleLongPressRef.current.delete(msg.id);
                      }
                    }}
                    onPointerCancel={(e) => {
                      const pending = bubbleLongPressRef.current.get(msg.id);
                      if (pending) {
                        clearTimeout(pending.timer);
                        bubbleLongPressRef.current.delete(msg.id);
                      }
                    }}
                    onPointerLeave={(e) => {
                      if (e.pointerType !== "mouse") return;
                      const pending = bubbleLongPressRef.current.get(msg.id);
                      if (pending && Math.hypot(e.clientX - pending.origin.x, e.clientY - pending.origin.y) > LONG_PRESS_MOVE_TOLERANCE) {
                        clearTimeout(pending.timer);
                        bubbleLongPressRef.current.delete(msg.id);
                      }
                    }}
                    onPointerMove={(e) => {
                      const pending = bubbleLongPressRef.current.get(msg.id);
                      if (pending && Math.hypot(e.clientX - pending.origin.x, e.clientY - pending.origin.y) > LONG_PRESS_MOVE_TOLERANCE) {
                        clearTimeout(pending.timer);
                        bubbleLongPressRef.current.delete(msg.id);
                      }
                    }}
                    className="chat-long-press-target flex items-center gap-1 group relative cursor-pointer select-none"
                  >
                    {/* Actual chat bubble + user-controlled corner decoration slot */}
                    <div className={`bubble-deco-wrapper relative w-fit max-w-full overflow-visible ${messageGroupClass}`}>
                      <div className="max-w-full">
                      {msg.diaryShareId ? (() => {
                        const share = diarySharesForCurrentIdentity.find((item) => item.id === msg.diaryShareId && item.messageId === msg.id && item.targetRelationId === msg.relationId && item.conversationId === msg.conversationId);
                        return share ? <div className="chat-message--diary-share w-[210px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left shadow-sm"><div className="flex items-center gap-2 text-xs font-bold"><BookOpen size={15}/>日记分享</div><p className="mt-2 text-[11px] text-[var(--text-secondary)]">{share.snapshot.authorName} · {new Date(share.snapshot.occurredAt).toLocaleDateString("zh-CN")}</p><p className="mt-2 line-clamp-3 text-xs leading-5">{share.snapshot.body}</p></div> : <div className="chat-message--diary-share rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">日记分享已不可用</div>;
                      })() : msg.forumShareId ? (() => {
                        const share = forumSharesForCurrentIdentity.find((item) =>
                          item.id === msg.forumShareId
                          && item.sourceMessageId === msg.id
                          && item.targetRelationId === msg.relationId
                          && item.conversationId === msg.conversationId);
                        return share ? (
                          <ForumShareCard
                            share={share}
                            onOpen={() => onOpenForumShare?.(share.id)}
                          />
                        ) : (
                          <div className="chat-message--forum-share rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                            论坛分享已不可用
                          </div>
                        );
                      })() : msg.imageAssetId ? (
                        <StoredChatImage assetId={msg.imageAssetId} alt="generated chat image" generated={msg.imageSource === "generated"} />
                      ) : msg.content.startsWith("data:image/") ? (
                        <img
                          src={msg.content}
                          alt="chat-pic"
                          className="chat-message--image max-w-[160px] rounded-lg border object-cover cursor-zoom-in shadow-sm bg-stone-100"
                        />
                      ) : parseTextImageDescription(msg.content) ? (() => {
                        const description = parseTextImageDescription(msg.content)!;
                        return (
                          <button
                            type="button"
                            onClick={() => setViewingImageDescription(description)}
                            className="chat-message--text-image w-[210px] min-h-32 rounded-2xl border border-[var(--border)] bg-[var(--media-placeholder-bg)] px-4 py-3 text-left shadow-sm"
                          >
                            <ImageIcon className="mb-4 h-4 w-4 text-[var(--media-placeholder-text)]" />
                            <p className="line-clamp-3 text-xs leading-relaxed text-[var(--text-primary)]">{description}</p>
                            <span className="mt-2 block text-[10px] text-[var(--media-placeholder-text)]">文字图 · 点击查看</span>
                          </button>
                        );
                      })() : msg.content.startsWith("[表情]|") ? (() => {
                        const [_, stickerName, stickerUrl] = msg.content.split("|");
                        // Resolve fresh hydrated URL from local sticker groups
                        const stickerId = stickerUrl?.startsWith("sticker://") ? stickerUrl.slice("sticker://".length) : "";
                        const foundSticker = stickerGroups.flatMap(g => g.stickers).find(s =>
                          (stickerId && s.id === stickerId) || s.name === stickerName
                        );
                        const displayUrl = foundSticker ? foundSticker.url : stickerUrl;
                        return (
                          <div className="chat-message--sticker max-w-[130px] rounded-xl overflow-hidden relative select-none">
                            <img
                              src={displayUrl}
                              alt={stickerName}
                              className="w-full h-auto max-h-[130px] object-contain"
                              referrerPolicy="no-referrer"
                            />
                            <span className="sr-only">[{stickerName}]</span>
                          </div>
                        );
                      })() : parseRedPacketClaimNotice(msg.content)?.claimantName ? (() => {
                        const notice = parseRedPacketClaimNotice(msg.content)!;
                        const bubbleStyle = isSelf
                          ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 chat-bubble-self" : "bg-[#95ec69] text-[#191919] chat-bubble-self")
                          : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other border border-slate-100");
                        return <div className={`chat-message--text px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-bubble relative ${bubbleStyle} ${messageGroupClass}`}>
                          {notice.claimantName}领取了{notice.senderName}的红包
                        </div>;
                      })() : isCallRecordMarkup(msg.content) ? (() => {
                        const callRecord = parseCallRecord(msg.content);
                        const { status, duration } = callRecord;
                        const resultLabel = status === "rejected" ? "已拒绝" : status === "cancelled" ? "已取消" : `通话时长 ${duration}`;
                        const canOpenDetail = status === "completed" && callRecord.transcript.length > 0;
                        const bubbleStyle = isSelf
                          ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 chat-bubble-self" : "bg-[#95ec69] text-[#191919] chat-bubble-self")
                          : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other border border-slate-100");
                        return (
                          <button
                            type="button"
                            onClick={() => { if (canOpenDetail) setCallRecordDetail(callRecord); }}
                            className={`chat-message--call inline-flex items-center gap-1.5 px-3 py-2 shadow-sm cv-bubble message-bubble relative ${bubbleStyle} ${messageGroupClass} ${canOpenDetail ? "transition-transform active:scale-[0.98]" : "cursor-default"}`}
                            title={canOpenDetail ? "查看通话内容" : resultLabel}
                          >
                            <Phone className="chat-message--call-icon w-3.5 h-3.5 shrink-0" />
                            <span className="chat-message--call-duration text-xs font-medium whitespace-nowrap">{resultLabel}</span>
                            <span className="sr-only">{callRecord.callType}</span>
                          </button>
                        );
                      })() : isRedPacketMarkup(msg.content) ? (() => {
                        const packet = parseRedPacketPayload(msg);
                        const status = getRedPacketActualStatus(msg);
                        return <RedPacketCard amount={packet.totalAmount.toFixed(2)} greeting={packet.greeting} status={status} isSelf={isSelf} onClick={() => {
                          const char = characters.find((character) => character.id === msg.characterId);
                          setOpenRedPacketDetail({ id: msg.id, amount: packet.totalAmount.toFixed(2), greeting: packet.greeting, senderName: char?.remark || char?.name || "未知好友", senderAvatar: char?.avatar || "🧧", sender: msg.sender as "user" | "character", timestamp: msg.timestamp, message: msg, mode: packet.mode, count: packet.count, recipientId: packet.recipientId, recipientName: packet.recipientName });
                          setShowRedPacketOpenModal(true);
                        }} />;
                      })() : isTransferMarkup(msg.content) ? (() => {
                        const [, amount, memo, isConfirmedStr] = msg.content.split("|");
                        const isConfirmed = isConfirmedStr === "true";
                        return <TransferCard amount={amount || "100.00"} memo={memo || "转账"} status={isConfirmed ? "confirmed" : "pending"} onClick={() => {
                          setOpenTransferDetail({ amount: amount || "100.00", memo: memo || "转账", isConfirmed });
                          setShowTransferDetailModal(true);
                        }} />;
                      })() : msg.content.startsWith("[位置]") ? (() => {
                        const location = msg.content.split("|").slice(1).join("|").trim() || msg.content.replace(/^\[位置\]/, "").trim();
                        return <LocationCard location={location} />;
                      })() : msg.content.startsWith("[语音") ? (() => {
                        let content = msg.content;
                        let durationStr = "3";
                        let voiceText = "";

                        if (content.startsWith("[语音]|")) {
                          const parts = content.split("|");
                          durationStr = parts[1] || "3";
                          voiceText = parts.slice(2).join("|") || "";
                        } else {
                          // e.g. [语音: "晚安，要听话" (5秒)]
                          let text = "";
                          let secs = 5;
                          
                          const match1 = content.match(/^\[语音:\s*"([^"]+)"\s*\((\d+)(?:秒|s)\)\]/i);
                          const match2 = content.match(/^\[语音:\s*(.+?)\s*\((\d+)(?:秒|s)\)\]/i);
                          const match3 = content.match(/^\[语音:\s*(\d+)(?:秒|s)\]/i);
                          const match4 = content.match(/^\[语音:\s*"([^"]+)"\]/i) || content.match(/^\[语音:\s*(.+?)\]/i);

                          if (match1) {
                            text = match1[1];
                            secs = parseInt(match1[2], 10) || 5;
                          } else if (match2) {
                            text = match2[1];
                            secs = parseInt(match2[2], 10) || 5;
                          } else if (match3) {
                            text = "";
                            secs = parseInt(match3[1], 10) || 5;
                          } else if (match4) {
                            text = match4[1];
                            secs = Math.max(1, Math.min(60, Math.ceil(text.length * 0.35 + 1.2)));
                          } else {
                            const clean = content.replace(/^\[语音\]\s*/, "").replace(/^\[语音:\s*/, "").replace(/\]$/, "").trim();
                            text = clean;
                            secs = Math.max(1, Math.min(60, Math.ceil(text.length * 0.35 + 1.2)));
                          }
                          durationStr = secs.toString();
                          voiceText = text;
                        }

                        // Determine the duration dynamically based on the text length for authentic feel (approx 3.5 characters per second)
                        const duration = voiceText 
                          ? Math.max(1, Math.min(60, Math.round(voiceText.length / 3.5) || 1)) 
                          : parseInt(durationStr || "3", 10);
                        
                        const isPlaying = playingMessageId === msg.id;
                        const formattedDuration = `${duration}"`;

                        // Generate deterministic dynamic wave bar heights based on msg.id to make each bubble wave look unique but stable
                        const generateWaveBars = (seed: string, count: number = 10) => {
                          let h = 0;
                          for (let i = 0; i < seed.length; i++) {
                            h = (h << 5) - h + seed.charCodeAt(i);
                            h |= 0;
                          }
                          const bars = [];
                          for (let i = 0; i < count; i++) {
                            const val = Math.abs(Math.sin(h + i * 1.7));
                            const height = Math.round(5 + val * 15); // height between 5px and 20px
                            bars.push(height);
                          }
                          return bars;
                        };
                        const waveBars = generateWaveBars(msg.id, 10);

                        const bubbleBgAndShape = isSelf
                          ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 chat-bubble-self" : "bg-[#95ec69] text-[#191919] chat-bubble-self")
                          : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other border border-slate-100");

                        return (
                          <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"} space-y-1`}>
                            {/* Voice capsule pill wrapper */}
                            <div className={`flex items-center gap-2 ${isSelf ? "flex-row-reverse" : "flex-row"}`}>
                              <div 
                                onClick={() => {
                                  // Click to play/pause
                                  triggerMessageSpeech(msg);
                                  setVoicePlayed((prev) => ({ ...prev, [msg.id]: true }));
                                }}
                                className={`chat-message--voice flex items-center gap-2 px-3 py-1.5 shadow-sm cv-bubble message-bubble voice-message-bar cursor-pointer select-none transition-all duration-200 hover:shadow-md active:scale-[0.98] relative ${bubbleBgAndShape} ${messageGroupClass}`}
                                style={{ width: `${80 + duration * 6.5}px`, minWidth: "95px", maxWidth: "220px" }}
                              >
                                {/* Left element: Play/Pause/Speaker icon */}
                                <div className="flex items-center justify-center shrink-0 text-current">
                                  {isPlaying ? (
                                    <Pause className="w-3.5 h-3.5 fill-current animate-pulse text-current" />
                                  ) : (
                                    <Volume2 className="w-3.5 h-3.5 text-current" />
                                  )}
                                </div>

                                {/* Middle element: Sound Wave Pattern */}
                                <div className="chat-message--voice-wave flex-1 flex items-end justify-center gap-[2px] h-5 px-1 overflow-hidden pb-[1px]">
                                  {waveBars.map((barHeight, idx) => {
                                    const delay = idx * 80;
                                    const scaledHeight = Math.max(3, Math.round(barHeight * 0.7));
                                    return (
                                      <div
                                        key={idx}
                                        className={`w-[2px] rounded-full transition-all duration-200 ${
                                          isPlaying 
                                            ? "animate-[pulse_0.8s_infinite]"
                                            : "opacity-40"
                                        }`}
                                        style={{ 
                                          height: `${scaledHeight}px`,
                                          animationDelay: isPlaying ? `${delay}ms` : undefined,
                                          backgroundColor: "currentColor"
                                        }}
                                      />
                                    );
                                  })}
                                </div>

                                {/* Duration display */}
                                <span className="chat-message--voice-duration font-sans text-[11px] font-bold text-current opacity-70 shrink-0">
                                  {formattedDuration}
                                </span>
                                {/* WeChat unplayed red dot at the top-right corner of the capsule */}
                                {!isSelf && !voicePlayed[msg.id] && (
                                  <span className="absolute -right-1 -top-1 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-sm" />
                                )}
                              </div>

                              {/* "转" (Transcribe) Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation(); // prevent playing the audio
                                  setVoiceTranscribed((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }));
                                }}
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10.5px] font-bold border transition-all shrink-0 active:scale-90 shadow-sm ${
                                  voiceTranscribed[msg.id]
                                    ? "bg-stone-200/80 border-stone-300 text-stone-700"
                                    : "bg-white hover:bg-stone-50 border-stone-200 text-stone-500"
                                }`}
                                title="语音转文字"
                              >
                                转
                              </button>
                            </div>

                            {/* Transcription Display - Rendered exactly like a regular text bubble below matching Image 2 */}
                            {voiceTranscribed[msg.id] && (
                              <div 
                                className={`chat-message--text chat-message--voice-transcript px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble relative group/bubble mt-0.5 max-w-[240px] ${
                                  isSelf
                                    ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 chat-bubble-self" : "bg-blue-500 text-white chat-bubble-self")
                                    : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other border border-slate-100")
                                } ${isSelf ? "self-end" : "self-start"} ${messageGroupClass}`}
                              >
                                <div className="text-left">{voiceText || "（空白语音内容）"}</div>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <div className={parseQuoteReply(msg.content) ? `message-quote-reply-wrapper ${isSelf ? "message-quote-reply-wrapper--self" : "message-quote-reply-wrapper--other"}` : `chat-message--text px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble relative group/bubble ${
                          isSelf
                            ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 chat-bubble-self" : "bg-blue-500 text-white chat-bubble-self")
                            : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other border border-slate-100")
                        } ${messageGroupClass}`}>
                          {(() => {
                            const quoteReply = parseQuoteReply(msg.content);
                            return quoteReply ? (
                              <>
                                <div className="message-quote__header">↩ {isSelf ? "你回复了" : "回复了"} {quoteReply.author}</div>
                                <div className="message-quote text-left text-[11px]">
                                  <div className="message-quote__content px-3 py-2">{quoteReply.content}</div>
                                </div>
                                <div className={`chat-message--text message-quote__reply-body px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble relative group/bubble ${
                                  isSelf
                                    ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 chat-bubble-self pr-6" : "bg-blue-500 text-white chat-bubble-self pr-6")
                                    : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 chat-bubble-other pr-6" : "bg-white text-slate-800 chat-bubble-other border border-slate-100 pr-6")
                                } ${messageGroupClass}`}>{quoteReply.body}</div>
                              </>
                            ) : <div className="text-left">{msg.content}</div>;
                          })()}
                          {activeCharacter.enableAutoTranslate && containsNonChineseText(msg.content) && msg.translation && !collapsedTranslations.has(msg.id) && (
                            <>
                              <div className={`my-1.5 border-t border-dashed ${isSelf ? "border-white/20" : "border-stone-200"}`} />
                              <div className={`flex items-start gap-2 text-left text-[11px] leading-relaxed ${isSelf ? "text-white/90" : "text-stone-500"}`}>
                                <span className="min-w-0 flex-1 whitespace-pre-wrap">{msg.translation}</span>
                                <button
                                  type="button"
                                  onClick={() => setCollapsedTranslations((previous) => new Set(previous).add(msg.id))}
                                  className="shrink-0 text-[10px] opacity-70 hover:opacity-100"
                                  aria-label="收起翻译"
                                >
                                  收起
                                </button>
                              </div>
                            </>
                          )}

                        </div>
                      )}
                      </div>
                      {messageGroupPosition === "top" && (
                        <div className="bubble-deco" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                );
              };

              if (activeBubblePosition === "above" || activeBubblePosition === "below") {
                return wrapMessageWithDivider(
                  <div
                    key={msg.id}
                    className={`w-full flex flex-col ${
                      isSelf ? "items-end" : "items-start"
                    } ${
                      (isConsecutivePrev && shouldCollapse) ? "chat-row-gap-consecutive" : "chat-row-gap-separated"
                    } ${messageGroupClass} cv-msg-row message message-container`}
                  >
                    {/* Avatar + Meta Header */}
                    {showAvatar && (
                      <div className={`flex items-center gap-2.5 mb-1.5 select-none ${
                        isSelf ? "flex-row-reverse" : "flex-row"
                      }`}>
                        <RenderAvatar
                          src={isSelf ? settings.avatar : msgAvatar}
                          alt=""
                          name={isSelf ? settings.name : msgName}
                          onClick={() => {
                            if (!isSelf) {
                              void openInnerVoice(groupSenderChar ? groupSenderChar.id : activeCharacter.id, msg);
                            }
                          }}
                          className={`w-9 h-9 bg-slate-100 object-cover cursor-pointer hover:opacity-90 transition-opacity border shrink-0 aspect-square avatar ${
                            isSelf ? "user-avatar" : "ai-avatar"
                          } ${isFloatingCute ? "rounded-xl border-slate-200/60" : "rounded-full"}`}
                        />
                        <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"} text-[10px] text-slate-500/80 space-y-0.5 msg-meta-header`}>
                          {!isSelf && !settings.hideNicknames && (
                            <div className="flex items-center gap-1 font-bold text-slate-700/85 tracking-wider msg-meta-name">
                              <span>🖤</span>
                              <span>{msgName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Message Bubble Block */}
                    <div className="max-w-[85%]">
                      {renderBubbleInner()}
                    </div>
                  </div>
                );
              } else {
                return wrapMessageWithDivider(
                  <div
                    key={msg.id}
                    className={`w-full flex gap-2.5 ${
                      isSelf ? "flex-row-reverse items-start justify-start" : "flex-row items-start justify-start"
                    } ${
                      (isConsecutivePrev && shouldCollapse) ? "chat-row-gap-consecutive" : "chat-row-gap-separated"
                    } ${messageGroupClass} cv-msg-row message message-container`}
                  >
                    {/* Avatar */}
                    {showAvatar ? (
                      <RenderAvatar
                        src={isSelf ? settings.avatar : msgAvatar}
                        alt=""
                        name={isSelf ? settings.name : msgName}
                        onClick={() => {
                          if (!isSelf) {
                            void openInnerVoice(groupSenderChar ? groupSenderChar.id : activeCharacter.id, msg);
                          }
                        }}
                        className={`w-9 h-9 bg-slate-100 object-cover cursor-pointer hover:opacity-90 transition-opacity border shrink-0 aspect-square avatar ${
                          isSelf ? "user-avatar" : "ai-avatar"
                        } ${isFloatingCute ? "rounded-xl border-slate-200/60" : "rounded-full"}`}
                      />
                    ) : (
                      <div className="w-9 h-9 shrink-0" />
                    )}

                    {/* Meta Header + Message Bubble Column */}
                    <div className={`flex flex-col max-w-[80%] ${isSelf ? "items-end" : "items-start"}`}>
                      {showAvatar && !settings.hideNicknames && (
                        <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"} text-[10px] text-slate-500/80 mb-1 space-y-0.5 msg-meta-header`}>
                          {!isSelf && (
                            <div className="flex items-center gap-1 font-bold text-slate-700/85 tracking-wider msg-meta-name">
                              <span>🖤</span>
                              <span>{msgName}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="max-w-full">
                        {renderBubbleInner()}
                      </div>
                    </div>
                  </div>
                );
              }
            }}>

            {/* AI is writing/typing indicator */}
            {isTyping && (isOfflineModeActive || !activeCharacter?.isGroupChat) && (
              isOfflineModeActive ? (
                <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold italic px-1 py-2 my-2 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{activeCharacter.remark || activeCharacter.name} 正在编织剧情走向...</span>
                </div>
              ) : (() => {
                const lastMsg = currentChatMessages.length > 0 ? currentChatMessages[currentChatMessages.length - 1] : null;
                const isTypingConsecutive = lastMsg && lastMsg.sender !== "user";
                const typingChar = typingCharacterOverride || activeCharacter;
                const typingName = typingChar.remark || typingChar.name;
                return (
                  <div className={`w-full flex flex-col items-start ${isTypingConsecutive ? "chat-row-gap-consecutive" : "chat-row-gap-separated"} cv-msg-row message message-container`}>
                    {!settings.hideNicknames && (
                      <div className="flex items-center gap-2.5 mb-1.5 select-none">
                        <RenderAvatar 
                          src={typingChar.avatar} 
                          alt="" 
                          name={typingName}
                          className={`w-9 h-9 border object-cover shrink-0 aspect-square avatar ai-avatar ${
                            isFloatingCute ? "rounded-xl border-slate-200/60" : "rounded-full"
                          }`} 
                        />
                        <div className="flex flex-col items-start text-[10px] text-slate-500/80 space-y-0.5 msg-meta-header">
                          <span className="text-[9px] text-slate-400 font-bold">{typingName} 正在输入...</span>
                        </div>
                      </div>
                    )}
                    {settings.hideNicknames && <div className="max-w-[85%]">
                      <div className="bg-white border border-slate-100 text-slate-400 px-4 py-2.5 shadow-sm text-xs flex items-center space-x-1 chat-bubble-other message-bubble">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>}
                  </div>
                );
              })()
            )}

           <div ref={chatEndRef} />
          </MessageList>

          {readyOfflineAppointment && !isMultiSelectDeleteMode && (
            <div className="chat-appointment-entry mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-[var(--text-primary)]">
                  {getCurrentAppointmentProposal(readyOfflineAppointment)?.activity || readyOfflineAppointment.title}
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">约定时间已到，可以进入线下见面</div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-xl bg-[var(--button-primary-bg)] px-3 py-2 text-[11px] font-bold text-[var(--button-primary-text)]"
                onClick={() => {
                  const sourceMessage = currentChatMessages[currentChatMessages.length - 1];
                  if (sourceMessage) handleStartOfflineFromMsg(sourceMessage, readyOfflineAppointment);
                }}
              >
                进入线下
              </button>
            </div>
          )}

          {isMultiSelectDeleteMode && (
            <div className="chat-multi-select-toolbar absolute inset-x-0 bottom-0 z-[85] border-t border-stone-200/80 bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl">
              <div className="mx-auto flex max-w-md items-center gap-3">
                <button
                  type="button"
                  onClick={exitMultiSelectDelete}
                  className="flex-1 rounded-xl border border-stone-200 bg-white py-2.5 text-xs font-bold text-stone-600 active:bg-stone-100"
                >
                  取消
                </button>
                <div className="min-w-16 text-center text-xs font-bold text-stone-500">
                  已选 {selectedMessageIds.size} 条
                </div>
                <button
                  type="button"
                  onClick={deleteSelectedMessages}
                  disabled={selectedMessageIds.size === 0}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-bold text-white active:bg-red-600 disabled:opacity-40"
                >
                  删除
                </button>
              </div>
            </div>
          )}

          <BubbleTipPortalLayer enabled={!isShowingCardModal && hasUserCustomChatCss && activeBubbleTailEnabled} />

          {showImageGenerator && (
            <div className="absolute inset-0 z-[90] flex items-end bg-black/35 p-4" onClick={() => setShowImageGenerator(false)}>
              <div className="w-full rounded-[28px] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="mb-3 flex items-start justify-between"><div><h3 className="text-sm font-bold text-slate-900">发送文字图</h3><p className="mt-1 text-[10px] leading-relaxed text-slate-400">填写画面描述后，将以文字图卡片发送，不会调用图片 API。</p></div><button type="button" onClick={() => setShowImageGenerator(false)} className="text-lg text-slate-400">×</button></div>
                <textarea value={imageRequestText} onChange={(event) => setImageRequestText(event.target.value)} rows={3} placeholder="描述这张文字图里的画面" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none" />
                <p className="mt-2 text-[10px] text-slate-400">发送后可点击卡片查看完整描述。</p>
                <div className="mt-4 flex gap-2"><button type="button" onClick={() => setShowImageGenerator(false)} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-600">取消</button><button type="button" onClick={sendTextImage} disabled={!imageRequestText.trim()} className="flex-1 rounded-xl bg-neutral-950 py-2.5 text-xs font-bold text-white disabled:opacity-40">发送</button></div>
              </div>
            </div>
          )}

           {/* Active Chat Footer Input form */}
           <ChatComposer className={`${
             isFloatingCute
               ? "mx-3.5 mb-3.5 mt-1 overflow-hidden shrink-0 flex flex-col cv-footer chat-input-area chat-composer--floating"
               : activeStylePreset === "liquid-glass"
                 ? "mx-3.5 mb-3.5 mt-1 overflow-visible shrink-0 flex flex-col cv-footer chat-input-area chat-composer--liquid"
                 : "shrink-0 flex flex-col cv-footer chat-input-area chat-composer--default"
           }`} quotePreview={quotedMessage && <QuotedMessagePreview message={quotedMessage} senderName={activeCharacter.remark || activeCharacter.name} onClear={() => setQuotedMessage(null)} closeIcon={<X className="w-3.5 h-3.5" />} />}>
            


            {imageGenerationError && (
              <div role="status" className="mx-3 mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-600">
                {imageGenerationError}
              </div>
            )}
            <ChatInputBar
              placeholder={
                isOfflineModeActive
                  ? (isInputNarration ? "输入旁白..." : "输入发言，继续剧本对话...")
                  : `发送消息给 ${activeCharacter.name}...`
              }
              isTyping={isTyping}
              isReplyInFlight={isReplyInFlight}
              showAttachPanel={showAttachPanel}
              onToggleAttach={() => {
                setShowAttachPanel(!showAttachPanel);
                setShowStickerSelector(false);
              }}
              onSendOnly={handleSendOnly}
              onSendAndReply={handleSendAndReply}
              onStopReply={stopReply}
              getChatIcon={(key) => getChatIcon(key)}
            />

            {/* Attach Panel */}
            {showAttachPanel && (
              <AttachmentMenu className={`py-2.5 px-3 flex items-center justify-between gap-1 animate-slide-up select-none shrink-0 overflow-x-auto chat-composer__attachment-panel ${
                activeStylePreset === "liquid-glass"
                  ? "bg-white/60 backdrop-blur-md border-t border-white/40"
                  : "bg-slate-50 border-t border-slate-100"
              }`}>
                {/* 1. 相册 (Album) */}
                <label className="chat-attachment-item chat-attachment-item--album flex-1 flex flex-col items-center justify-center cursor-pointer group min-w-10">
                  <div className="chat-attachment-icon bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("image")} className="w-4 h-4"><ImageIcon className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="chat-attachment-label text-[10px] text-slate-500 mt-1 font-semibold scale-90">相册</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const capturedContext = activeRuntimeContext;
                        try {
                          const compressed = await compressImage(file, 800, 800, 0.75);
                          if (!isCapturedRuntimeCurrent(capturedContext)) {
                            showToast("关系已切换，已取消发送图片。");
                            return;
                          }
                          sendCustomMessage(compressed, capturedContext);
                          setShowAttachPanel(false);
                        } catch (err) {
                          console.error("Custom chat image compression failed:", err);
                        }
                      }
                    }}
                    className="hidden"
                  />
                </label>

                <button type="button" onClick={() => { setImageRequestText(""); setShowImageGenerator(true); setShowAttachPanel(false); }} className="chat-attachment-item chat-attachment-item--text-image flex-1 flex flex-col items-center justify-center group min-w-10" title="发送文字图">
                  <div className="chat-attachment-icon bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors"><ChatIcon src={getChatIcon("textImage")} className="w-4 h-4"><Camera className="w-4 h-4 text-slate-700" /></ChatIcon></div>
                  <span className="chat-attachment-label text-[10px] text-slate-500 mt-1 font-semibold scale-90">文字图</span>
                </button>

                {/* 2. 红包 (Red Packet) */}
                <button
                  type="button"
                  onClick={() => {
                    setRedPacketAmount("8.88");
                    setRedPacketGreeting("恭喜发财，万事如意");
                    setRedPacketMode("lucky");
                    setRedPacketCount(activeCharacter?.isGroupChat ? String(Math.max(1, Math.min(3, (activeCharacter.memberIds || []).length))) : "1");
                    setRedPacketRecipientId("");
                    setActiveAttachModal("redpacket");
                    setShowAttachPanel(false);
                  }}
                  className="chat-attachment-item chat-attachment-item--red-packet flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="chat-attachment-icon bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("redPacket")} className="w-4 h-4"><Gift className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="chat-attachment-label text-[10px] text-slate-500 mt-1 font-semibold scale-90">红包</span>
                </button>

                {/* 3. 语音 (Voice) */}
                <button
                  type="button"
                  onClick={() => {
                    setVoiceText("");
                    setActiveAttachModal("voice");
                    setShowAttachPanel(false);
                  }}
                  className="chat-attachment-item chat-attachment-item--voice flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="chat-attachment-icon bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("voice")} className="w-4 h-4"><Mic className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="chat-attachment-label text-[10px] text-slate-500 mt-1 font-semibold scale-90">语音</span>
                </button>

                {/* 5. 电话 (Phone) */}
                <button
                  type="button"
                  onClick={() => {
                    beginVoiceCall(false);
                  }}
                  className="chat-attachment-item chat-attachment-item--call flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="chat-attachment-icon bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("call")} className="w-4 h-4"><Phone className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="chat-attachment-label text-[10px] text-slate-500 mt-1 font-semibold scale-90">电话</span>
                </button>

                {/* 7. 位置 (Location) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveAttachModal("location");
                    setShowAttachPanel(false);
                  }}
                  className="chat-attachment-item chat-attachment-item--location flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="chat-attachment-icon bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("location")} className="w-4 h-4"><MapPin className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="chat-attachment-label text-[10px] text-slate-500 mt-1 font-semibold scale-90">位置</span>
                </button>

                {/* 8. 表情 (Emoji) */}
                <button
                  type="button"
                  onClick={() => {
                    setShowStickerSelector(true);
                    setShowAttachPanel(false);
                  }}
                  className="chat-attachment-item chat-attachment-item--sticker flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="chat-attachment-icon bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("sticker")} className="w-4 h-4"><Smile className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="chat-attachment-label text-[10px] text-slate-500 mt-1 font-semibold scale-90">表情</span>
                </button>
              </AttachmentMenu>
            )}

            {/* Sticker Selector Panel */}
            {showStickerSelector && (
              <div className="bg-slate-50 border-t border-slate-200/50 flex flex-col h-[260px] overflow-hidden select-none animate-slide-up shrink-0">
                {/* Scrollable grid of stickers */}
                <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
                  {(() => {
                    const currentGroup = stickerGroups[activeStickerGroupIndex] || stickerGroups[0] || null;
                    if (!currentGroup || currentGroup.stickers.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                          <Smile className="w-8 h-8 opacity-65 text-slate-300" />
                          <p className="text-[11px] font-semibold">该分组下暂无自定义表情包</p>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab("me");
                              setShowStickerSelector(false);
                            }}
                            className="text-[10px] bg-slate-900 text-white font-bold px-3 py-1 rounded-full shadow-sm hover:bg-black transition-all"
                          >
                            去“我”添加表情
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-5 gap-3">
                        {currentGroup.stickers.map((sticker) => (
                          <div
                            key={sticker.id}
                            onClick={() => {
                              void sendStickerMessage(sticker);
                              setShowStickerSelector(false);
                            }}
                            className="flex flex-col items-center bg-white border border-slate-200/40 hover:border-slate-300 rounded-xl p-1 shadow-sm hover:shadow active:scale-95 transition-all select-none relative"
                          >
                            <div className="w-full aspect-square bg-slate-50/50 rounded-lg overflow-hidden flex items-center justify-center">
                              <img
                                src={sticker.url}
                                alt={sticker.name}
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 truncate w-full text-center mt-1 px-0.5">
                              {sticker.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Bottom navigation bar */}
                <div className="h-11 bg-white border-t border-slate-100 flex items-center px-2 justify-between shrink-0">
                  <div className="flex items-center gap-1.5 overflow-x-auto max-w-[80%] scrollbar-none">
                    {stickerGroups.map((group, idx) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setActiveStickerGroupIndex(idx)}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all shrink-0 ${
                          activeStickerGroupIndex === idx
                            ? "bg-slate-950 text-white shadow-sm"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>

                  {/* Settings gear shortcut */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("me");
                      setShowStickerSelector(false);
                      setTimeout(() => {
                        const el = document.querySelector(".me-tab-sticker-settings");
                        el?.scrollIntoView({ behavior: "smooth" });
                      }, 200);
                    }}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex items-center justify-center shrink-0"
                    title="管理表情包"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              </div>
            )}
          </ChatComposer>
          </div>

          {/* Voice Text Input Modal Overlay */}
          {activeAttachModal === "voice" && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 animate-fade-in text-slate-800">
              <div className="bg-white rounded-[32px] w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-slate-100 animate-scale-up text-stone-800">
                <div className="px-5 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-bold text-stone-800">发送语音消息</h3>
                  <button 
                    onClick={() => {
                      setVoiceText("");
                      setActiveAttachModal(null);
                    }}
                    className="p-1 hover:bg-stone-200/50 rounded-full transition-colors text-stone-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4 flex-1">
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 focus-within:ring-1 focus-within:ring-emerald-500/30 focus-within:border-emerald-500/50 transition-all">
                    <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-wider mb-1.5">输入语音对应的文字内容</label>
                    <textarea
                      rows={3}
                      value={voiceText}
                      onChange={(e) => setVoiceText(e.target.value)}
                      placeholder="请输入文字内容..."
                      className="bg-transparent text-stone-800 font-semibold text-xs focus:outline-none w-full placeholder-stone-300 resize-none"
                    />
                    <div className="mt-2 text-[10px] text-slate-400 font-medium text-right">
                      {voiceText.trim() ? (
                        <span>
                          预计语音时长:{" "}
                          <strong className="text-emerald-500 font-mono">
                            {Math.max(1, Math.min(60, Math.ceil(voiceText.trim().length * 0.35 + 1.2)))}
                          </strong>{" "}
                          秒
                        </span>
                      ) : (
                        <span>请输入文字内容</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-stone-50 border-t border-stone-100 flex gap-2 shrink-0">
                  <button 
                    onClick={() => {
                      setVoiceText("");
                      setActiveAttachModal(null);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    disabled={!voiceText.trim()}
                    onClick={() => {
                      if (!voiceText.trim()) return;
                      const secs = Math.max(1, Math.min(60, Math.ceil(voiceText.trim().length * 0.35 + 1.2)));
                      sendCustomMessage(`[语音]|${secs}|${voiceText.trim()}`);
                      setVoiceText("");
                      setActiveAttachModal(null);
                    }}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-650 disabled:opacity-50 disabled:pointer-events-none text-white font-bold rounded-xl text-xs transition-all shadow-sm"
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Red Envelope Editor Modal Overlay */}
          {activeAttachModal === "redpacket" && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 animate-fade-in text-slate-800">
              <div className="bg-white rounded-[32px] w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-slate-100 animate-scale-up text-stone-800">
                <div className="px-5 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-bold text-stone-800">红包设置</h3>
                  <button 
                    onClick={() => setActiveAttachModal(null)}
                    className="p-1 hover:bg-stone-200/50 rounded-full transition-colors text-stone-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4 flex-1">
                  {activeCharacter?.isGroupChat && (
                    <div className="flex rounded-2xl bg-slate-100 p-1 gap-1">
                      {(["lucky", "exclusive"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setRedPacketMode(mode)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${redPacketMode === mode ? "bg-white text-[#e15241] shadow-sm" : "text-slate-500"}`}
                        >
                          {mode === "lucky" ? "拼手气" : "专属"}
                        </button>
                      ))}
                    </div>
                  )}

                  {activeCharacter?.isGroupChat && redPacketMode === "lucky" && (
                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3">
                      <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-wider mb-1.5">红包个数</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          step="1"
                          value={redPacketCount}
                          onChange={(e) => setRedPacketCount(e.target.value)}
                          className="bg-transparent text-stone-800 font-bold text-base focus:outline-none flex-1 w-full font-mono"
                        />
                        <span className="text-xs text-stone-400">个（群成员 {1 + (activeCharacter.memberIds || []).length} 人）</span>
                      </div>
                    </div>
                  )}

                  {activeCharacter?.isGroupChat && redPacketMode === "exclusive" && (
                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3">
                      <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-wider mb-1.5">发给谁</label>
                      <select
                        value={redPacketRecipientId}
                        onChange={(e) => setRedPacketRecipientId(e.target.value)}
                        className="w-full bg-transparent text-stone-800 font-bold text-sm focus:outline-none"
                      >
                        <option value="">选择群成员</option>
                        {(activeCharacter.memberIds || []).map((memberId) => {
                          const member = characters.find((character) => character.id === memberId);
                          return member ? <option key={member.id} value={member.id}>{member.remark || member.name}</option> : null;
                        })}
                      </select>
                    </div>
                  )}

                  {/* Amount Field */}
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 focus-within:ring-1 focus-within:ring-[#e15241]/30 focus-within:border-[#e15241]/50 transition-all">
                    <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-wider mb-1.5">{activeCharacter?.isGroupChat && redPacketMode === "lucky" ? "总金额 (元)" : "金额 (元)"}</label>
                    <div className="flex items-center">
                      <span className="text-lg font-bold text-[#e15241] mr-1.5 font-mono">¥</span>
                      <input 
                        type="number"
                        step="0.01"
                        value={redPacketAmount}
                        onChange={(e) => setRedPacketAmount(e.target.value)}
                        className="bg-transparent text-stone-800 font-bold text-base focus:outline-none flex-1 w-full font-mono placeholder-stone-300"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Greeting Field */}
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 focus-within:ring-1 focus-within:ring-[#e15241]/30 focus-within:border-[#e15241]/50 transition-all">
                    <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-wider mb-1.5">留言祝福</label>
                    <input 
                      type="text"
                      value={redPacketGreeting}
                      onChange={(e) => setRedPacketGreeting(e.target.value)}
                      className="bg-transparent text-stone-800 font-bold text-xs focus:outline-none w-full placeholder-stone-300"
                      placeholder="恭喜发财，万事如意"
                    />
                  </div>

                  {/* Quick select buttons */}
                  <div className="flex gap-1.5 justify-center">
                    {["5.20", "8.88", "13.14", "66.66"].map((val) => (
                      <button 
                        key={val}
                        onClick={() => setRedPacketAmount(val)}
                        className="px-2.5 py-1 bg-slate-50 hover:bg-[#e15241]/10 border border-slate-200/60 hover:border-[#e15241]/20 rounded-xl text-[10px] font-bold text-stone-600 hover:text-[#e15241] transition-all active:scale-95"
                      >
                        {val}元
                      </button>
                    ))}
                  </div>

                   <button 
                    onClick={() => {
                      const finalAmount = parseFloat(redPacketAmount) > 0 ? redPacketAmount : "8.88";
                      const finalGreeting = redPacketGreeting.trim() || "恭喜发财，万事如意";
                      const amt = parseFloat(finalAmount);
                      const count = activeCharacter?.isGroupChat && redPacketMode === "lucky"
                        ? Math.max(1, Math.floor(Number(redPacketCount) || 1))
                        : 1;
                      const recipient = characters.find((character) => character.id === redPacketRecipientId);
                      if (activeCharacter?.isGroupChat && redPacketMode === "exclusive" && !recipient) {
                        showToast("请选择一个群成员作为专属红包领取人");
                        return;
                      }
                      if (walletBalance < amt) {
                        showToast("❌ 零钱余额不足，请在“我” -> “钱包”中充值后再发送红包！");
                        return;
                      }
                      // Deduct wallet balance
                      setWalletBalance(prev => {
                        const next = prev - amt;
                        return next;
                      });
                      const redPacket: RedPacketPayload = {
                        mode: activeCharacter?.isGroupChat && redPacketMode === "exclusive" ? "exclusive" : "lucky",
                        totalAmount: Number(amt.toFixed(2)),
                        count,
                        greeting: finalGreeting,
                        ...(recipient ? { recipientId: recipient.id, recipientName: recipient.remark || recipient.name } : {}),
                      };
                      sendCustomMessage(`[红包]|${finalAmount}|${finalGreeting}`, activeRuntimeContext, { redPacket });
                      showToast(`已成功塞钱进红包并发送 ¥${amt.toFixed(2)}！🧧`);
                      setActiveAttachModal(null);
                    }}
                    className="w-full py-2.5 bg-[#e15241] hover:bg-[#c94334] text-white font-extrabold text-xs rounded-xl shadow-sm transition-all active:scale-[0.98]"
                  >
                    塞钱进红包
                  </button>
                </div>
              </div>
            </div>
          )}

           {/* Red Envelope Opened Modal Overlay */}
          {showRedPacketOpenModal && openRedPacketDetail && (() => {
            const status = getRedPacketActualStatus(openRedPacketDetail.message);
            const isSelf = openRedPacketDetail.sender === "user";
            const packetClaims = redPacketClaims[getPaymentStatusKey(openRedPacketDetail.message)] || [];
            const claimedAmount = packetClaims.reduce((sum, claim) => sum + claim.amount, 0);
            const getClaimantName = (claimantId: string) => claimantId.startsWith("user:")
              ? settings.name || "我"
              : (characters.find((character) => character.id === claimantId)?.remark
                || characters.find((character) => character.id === claimantId)?.name
                || claimantId);

            return (
              <div className="absolute inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-fade-in text-slate-800 select-none">
                {/* WeChat Red Packet Envelope Container */}
                <div className="relative w-full max-w-xs bg-[#cf4838] text-white rounded-[24px] overflow-hidden shadow-2xl flex flex-col border border-red-500/20 animate-scale-up min-h-[420px] justify-between">
                  
                  {/* Top arc & Close button */}
                  <div className="relative p-6 pb-2 shrink-0">
                    <button 
                      onClick={() => {
                        if (!isOpeningRedPacket) {
                          setShowRedPacketOpenModal(false);
                        }
                      }}
                      className="absolute top-4 left-4 text-white/50 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors z-20"
                      disabled={isOpeningRedPacket}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Envelope Body Content */}
                  <div className="flex-1 flex flex-col justify-between p-6 pt-2">
                    
                    {/* Header info */}
                    <div className="flex flex-col items-center text-center space-y-3 mt-4">
                      <div className="relative">
                        <img 
                          src={openRedPacketDetail.senderAvatar} 
                          alt="" 
                          className="w-12 h-12 rounded-full object-cover border-2 border-yellow-400/50 shadow-md"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                        <span className="absolute -bottom-1.5 -right-1.5 bg-[#fa9d3b] text-white rounded-full p-0.5 text-[10px] leading-none border border-red-500">🧧</span>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-bold text-yellow-100 tracking-wide">
                          {isSelf ? "我发送的红包" : openRedPacketDetail.senderName}
                        </h4>
                        <p className="text-[11px] text-white/70 mt-0.5">
                          {isSelf 
                            ? (status === "claimed" || status === "exhausted" ? "红包已被领取" : "等待对方拆开中")
                            : (status === "claimed" || status === "exhausted" ? "给您发了一个红包" : "给你塞钱进红包啦")}
                        </p>
                      </div>

                      {/* Displaying state-specific header message */}
                      {status === "claimed" || status === "exhausted" ? (
                        <div className="pt-2 animate-fade-in">
                          <p className="text-[11px] text-yellow-100/80 italic font-mono">“{openRedPacketDetail.greeting}”</p>
                          <div className="mt-4 bg-white/10 border border-white/5 rounded-2xl py-4 px-6 text-center shadow-inner min-w-[200px]">
                            <span className="text-[10px] text-yellow-200/90 font-bold uppercase tracking-wider block">
                              {isSelf ? "已被对方领取金额" : "已领到零钱金额"}
                            </span>
                            <div className="text-3xl font-black text-yellow-300 mt-1.5 font-mono drop-shadow">
                              ¥ {openRedPacketDetail.amount}
                            </div>
                            <span className="text-[9px] text-white/60 block mt-1">
                              {isSelf ? "红包金额已成功存入对方的钱包零钱" : "已自动存入钱包余额，可直接使用"}
                            </span>
                          </div>
                        </div>
                      ) : status === "expired" || status === "refunded" ? (
                        <div className="pt-4 space-y-2 animate-fade-in">
                          <p className="text-xs text-white/50 italic line-through">“{openRedPacketDetail.greeting}”</p>
                          <div className="bg-black/10 border border-white/5 rounded-2xl p-4 text-center">
                            <p className="text-xs font-bold text-red-200">该红包已过期超过 24 小时</p>
                            <p className="text-[10px] text-white/60 mt-1">
                              {isSelf ? "未领取的资金已退回至您的钱包零钱。" : "未被领取，无法继续拆开。"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        // UNCLAIMED UI (Large Text Greeting)
                        <div className="pt-4 space-y-1 animate-fade-in">
                          <p className="text-base font-extrabold text-yellow-200 leading-snug drop-shadow-sm px-2">
                            “{openRedPacketDetail.greeting}”
                          </p>
                          {isSelf && (
                            <p className="text-[10px] text-white/60 mt-2 font-semibold">红包金额 ¥{openRedPacketDetail.amount}，等待对方拆开中...</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 rounded-2xl bg-black/10 border border-white/10 px-4 py-3 text-left">
                      <div className="flex items-center justify-between text-[11px] font-bold text-yellow-100">
                        <span>领取情况</span>
                        <span>{packetClaims.length}/{Math.max(1, openRedPacketDetail.count)} 份 · ¥{claimedAmount.toFixed(2)}</span>
                      </div>
                      {packetClaims.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {packetClaims.map((claim) => (
                            <div key={`${claim.claimantId}-${claim.claimedAt}`} className="flex items-center justify-between text-[10px] text-white/80">
                              <span>{getClaimantName(claim.claimantId)}</span>
                              <span className="font-mono text-yellow-100">¥{claim.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-white/55">暂时还没有人领取</p>
                      )}
                    </div>

                    {/* Footer / Golden Open Button block */}
                    <div className="flex flex-col items-center justify-center shrink-0 mt-6 relative h-28">
                      {status === "unclaimed" && !isSelf && !openRedPacketDetail.recipientId ? (
                        // THE LEGENDARY CHINESE "KAI" (OPEN) SPINNING BUTTON WITH BOUNCE SHADOW
                        <button
                          type="button"
                          onClick={() => {
                            if (isOpeningRedPacket) return;
                            setIsOpeningRedPacket(true);
                            setTimeout(() => {
                              setIsOpeningRedPacket(false);
                              // Mark as claimed
                              const parsed = claimRedPacket(openRedPacketDetail.message, `user:${activeIdentityId}`);
                              if (parsed > 0) {
                                setWalletBalance(prev => {
                                  const next = prev + parsed;
                                  return next;
                                });
                                const claimNotification = activeCharacter.isGroupChat
                                  ? createGroupCharacterMessage({
                                      id: `claim-notification-${Date.now()}`,
                                      characterId: activeCharacter.id,
                                      content: `你领取了${openRedPacketDetail.senderName}的红包`,
                                      timestamp: Date.now(),
                                      isNarration: true,
                                    })
                                  : createCharacterTextMessage({
                                      id: createId("claim-notification"),
                                      context: activeRuntimeContext,
                                      content: `你领取了${openRedPacketDetail.senderName}的红包`,
                                      timestamp: Date.now(),
                                      isNarration: true,
                                    });
                                onSendMessageRaw(claimNotification);
                              } else {
                                showToast(openRedPacketDetail.recipientName
                                  ? `该红包仅限 ${openRedPacketDetail.recipientName} 领取`
                                  : "红包已被领取或不符合领取条件");
                                return;
                              }
                              showToast(`成功拆开红包，获得 ¥${parsed.toFixed(2)}！🎉`);
                            }, 1200);
                          }}
                          className={`w-20 h-20 bg-gradient-to-b from-[#fcd34d] to-[#f59e0b] hover:from-[#fef08a] hover:to-[#fbbf24] text-[#cf4838] rounded-full flex items-center justify-center text-3xl font-black shadow-xl border-4 border-[#e18b2b] transition-all hover:scale-105 active:scale-95 cursor-pointer select-none ${
                            isOpeningRedPacket ? "animate-spin" : "animate-bounce"
                          }`}
                          style={{ animationDuration: isOpeningRedPacket ? "0.4s" : "2s" }}
                        >
                          開
                        </button>
                      ) : status === "unclaimed" && openRedPacketDetail.recipientId ? (
                        <p className="text-xs text-yellow-100/80 text-center px-6">仅限 {openRedPacketDetail.recipientName || "指定群成员"} 领取</p>
                      ) : (
                        // Standard Close action for already-opened / expired cases
                        <button 
                          onClick={() => setShowRedPacketOpenModal(false)}
                          className="w-full max-w-[180px] py-2 bg-yellow-400 hover:bg-yellow-500 text-stone-900 text-xs font-bold rounded-full shadow-md transition-all active:scale-95 uppercase tracking-wider"
                        >
                          返回聊天
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Music Selector Modal Overlay */}
          {activeAttachModal === "music" && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 animate-fade-in text-slate-800">
              <div className="bg-white text-stone-800 rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-stone-100 animate-scale-up max-h-[65%]">
                <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-bold text-stone-800">分享音乐</h3>
                  <button onClick={() => setActiveAttachModal(null)} className="p-1 hover:bg-stone-200 rounded-full transition-colors">
                    <X className="w-4 h-4 text-stone-500" />
                  </button>
                </div>
                <div className="p-3 overflow-y-auto space-y-2 flex-1">
                  {(() => {
                    const raw = readString("phone_music_tracks").value;
                    let userTracks: { title: string; artist: string }[] = [];
                    if (raw) {
                      try {
                        const parsed = JSON.parse(raw);
                        userTracks = parsed.map((track: any) => ({
                          title: track.title,
                          artist: track.artist || "未知歌手"
                        }));
                      } catch (e) {
                        userTracks = [];
                      }
                    }
                    if (userTracks.length === 0) {
                      return (
                        <div className="text-center py-8 text-stone-400 text-xs">
                          <Music className="w-8 h-8 mx-auto mb-1.5 opacity-30 text-stone-300" />
                          <p>音乐馆里还没有添加任何歌曲</p>
                        </div>
                      );
                    }
                    return userTracks.map((track, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          sendCustomMessage(`[音乐]|${track.title}|${track.artist}`);
                          setActiveAttachModal(null);
                        }}
                        className="w-full text-left p-2 rounded-xl bg-stone-50 hover:bg-neutral-950 hover:text-white transition-all flex items-center justify-between border border-stone-100/80 group"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-xs font-bold truncate group-hover:text-white">{track.title}</p>
                          <p className="text-[10px] text-stone-400 truncate mt-0.5 group-hover:text-stone-300">{track.artist}</p>
                        </div>
                        <Music className="w-4 h-4 shrink-0 text-neutral-800 group-hover:text-white" />
                      </button>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Location Selector Modal Overlay */}
          {activeAttachModal === "location" && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 animate-fade-in text-slate-800">
              <div className="bg-white text-stone-800 rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-stone-100 animate-scale-up max-h-[75%]">
                <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-bold text-stone-800">发送位置</h3>
                  <button 
                    onClick={() => {
                      setManualLocationText("");
                      setActiveAttachModal(null);
                    }} 
                    className="p-1 hover:bg-stone-200 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-stone-500" />
                  </button>
                </div>
                
                {/* Manual Input Form */}
                <div className="p-4 border-b border-stone-100 bg-stone-50/50 shrink-0 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">手动输入位置</label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-2.5 w-3.5 h-3.5 text-rose-500" />
                      <input
                        type="text"
                        placeholder="输入自定义位置..."
                        value={manualLocationText}
                        onChange={(e) => setManualLocationText(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-stone-200 rounded-[8px] text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-rose-500/30 focus:border-rose-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && manualLocationText.trim()) {
                            sendCustomMessage(`[位置]|${manualLocationText.trim()}`);
                            setManualLocationText("");
                            setActiveAttachModal(null);
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!manualLocationText.trim()}
                      onClick={() => {
                        sendCustomMessage(`[位置]|${manualLocationText.trim()}`);
                        setManualLocationText("");
                        setActiveAttachModal(null);
                      }}
                      className="px-3 bg-rose-500 hover:bg-rose-600 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
                    >
                      发送
                    </button>
                  </div>
                </div>

                {/* World Book / Suggested List */}
                <div className="p-3 overflow-y-auto space-y-1.5 flex-1 max-h-[220px]">
                  <p className="text-[10px] font-bold text-slate-400 px-1 uppercase tracking-wider mb-1">
                    世界书地址参考 (点击填入)
                  </p>
                  {getDynamicLocations().map((loc, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setManualLocationText(loc);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl border transition-all flex items-center gap-2 group ${
                        manualLocationText === loc 
                          ? "bg-rose-50 border-rose-200 text-rose-700" 
                          : "bg-stone-50/50 hover:bg-stone-50 border-stone-100/80 hover:border-stone-200 text-stone-700"
                      }`}
                    >
                      <MapPin className={`w-3.5 h-3.5 shrink-0 ${manualLocationText === loc ? "text-rose-500" : "text-stone-400 group-hover:text-rose-500"}`} />
                      <span className="text-[11px] font-semibold truncate flex-1">{loc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* File Selector Modal Overlay */}
          {activeAttachModal === "file" && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 animate-fade-in text-slate-800">
              <div className="bg-white text-stone-800 rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-stone-100 animate-scale-up max-h-[65%]">
                <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-bold text-stone-800">发送文件</h3>
                  <button onClick={() => setActiveAttachModal(null)} className="p-1 hover:bg-stone-200 rounded-full transition-colors">
                    <X className="w-4 h-4 text-stone-500" />
                  </button>
                </div>
                <div className="p-3 overflow-y-auto space-y-2 flex-1">
                  {memoNotes.length === 0 ? (
                    <div className="text-center py-6 px-4 space-y-3">
                      <FileText className="w-8 h-8 text-stone-300 mx-auto" />
                      <p className="text-xs font-bold text-stone-500">暂无备忘录笔记</p>
                      <p className="text-[10px] text-stone-400 leading-relaxed">
                        您可以先前往手机主屏幕的【备忘录】应用，写下您的创意和备忘，然后就可以在这里选择并发送给对方。对方还能点击阅读笔记的全部内容哦！
                      </p>
                    </div>
                  ) : (
                    memoNotes.map((note) => (
                      <button
                        key={note.id}
                        onClick={() => {
                          sendCustomMessage(`[文件]|${note.title}|${encodeURIComponent(note.content || "")}`);
                          setActiveAttachModal(null);
                        }}
                        className="w-full text-left p-2.5 rounded-xl bg-stone-50 hover:bg-blue-500 hover:text-white transition-all flex items-center justify-between border border-stone-100/80 group"
                      >
                        <div className="min-w-0 flex-1 pr-2 text-left">
                          <p className="text-xs font-bold truncate group-hover:text-white leading-normal">{note.title || "无标题笔记"}</p>
                          <p className="text-[9px] text-stone-400 mt-0.5 group-hover:text-blue-100">
                            备忘录笔记 • {note.content ? note.content.length : 0} 字
                          </p>
                        </div>
                        <FileText className="w-4 h-4 shrink-0 text-blue-500 group-hover:text-white" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Calling Screen Modal Overlay */}
          {activeAttachModal === "calling" && (
            <div className="absolute inset-0 bg-[#171514] z-50 flex flex-col justify-between p-6 animate-fade-in text-white text-center overflow-hidden">
              <div
                className="absolute -inset-10 bg-cover bg-center blur-3xl scale-125 opacity-25"
                style={{ backgroundImage: `url(${activeCharacter.avatar})` }}
              />
              <div className="absolute inset-0 bg-black/45" />
              <div className={`relative z-10 space-y-3 shrink-0 ${callingStatus === "ringing" ? "mt-16" : "mt-8"}`}>
                <img 
                  src={activeCharacter.avatar} 
                  alt="" 
                  className={`w-20 h-20 mx-auto border border-white/20 object-cover shadow-2xl ${callingStatus === "ringing" ? "rounded-2xl" : "rounded-full"}`}
                />
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-white leading-tight">{activeCharacter.remark || activeCharacter.name}</h3>
                  {callingStatus === "connected" && (
                    <p className="text-xs text-white/50 mt-1">语音通话中...</p>
                  )}
                </div>

                {callingStatus === "connected" && (
                  <div className="text-sm font-bold text-emerald-400 tracking-wider">
                    {Math.floor(callingDuration / 60).toString().padStart(2, "0")}:
                    {(callingDuration % 60).toString().padStart(2, "0")}
                  </div>
                )}
              </div>

              {/* Connected Chat Area or Ringing screen */}
              {callingStatus === "connected" ? (
                <div className="relative z-10 flex-1 my-4 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left scrollbar-thin">
                    {callTranscript.map((item) => {
                      const isSelfMessage = item.sender === "user";
                      return (
                        <div key={item.id} className={`flex ${isSelfMessage ? "justify-end" : "justify-start"} animate-fade-in`}>
                          <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                            isSelfMessage ? "bg-white/85 text-slate-800 rounded-br-sm" : "bg-white/15 text-white border border-white/10 rounded-bl-sm"
                          }`}>
                            {getCallTranscriptText(item.content)}
                          </div>
                        </div>
                      );
                    })}
                    {isTyping && (
                      <div className="flex justify-start animate-fade-in" aria-live="polite" aria-label="对方正在说话">
                        <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-sm border border-white/10 bg-white/15 px-3 py-2 shadow-sm">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" style={{ animationDelay: "0ms" }} />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" style={{ animationDelay: "150ms" }} />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" style={{ animationDelay: "300ms" }} />
                          <span className="ml-1 text-[11px] text-white/60">对方正在说话</span>
                        </div>
                      </div>
                    )}
                    <div ref={callTranscriptEndRef} aria-hidden="true" className="h-px" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={callingInputText}
                      onChange={(e) => setCallingInputText(e.target.value)}
                      placeholder={isTyping ? "对方正在说话..." : "输入消息..."}
                      disabled={isTyping}
                      className="flex-1 bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-white/30 border border-white/10 rounded-[14px] px-3 py-3 text-sm outline-none transition-all"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendVoiceCallMessage();
                      }}
                    />
                    <button
                      type="button"
                      onClick={sendVoiceCallMessage}
                      disabled={!callingInputText.trim() || isTyping}
                      className="w-11 h-11 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30 flex items-center justify-center transition-all active:scale-95"
                      title="发送"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={endVoiceCall}
                      className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg transition-all active:scale-95"
                      title="挂断"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Ringing Screen middle spacer */
                <div className="relative z-10 flex-1 flex items-end justify-center pb-8">
                  <p className="text-sm text-white/55 tracking-wide">
                    {isIncomingCall ? "邀请你语音通话..." : "等待对方接受邀请..."}
                  </p>
                </div>
              )}

              {/* Ringing Action Controls */}
              {callingStatus === "ringing" && (
                <div className="relative z-10 mb-4 shrink-0">
                  {isIncomingCall ? (
                    <div className="flex justify-between items-center px-2">
                      {/* Decline (Incoming Call) */}
                      <button
                        onClick={() => finishVoiceCall("rejected")}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="w-14 h-14 bg-[#ef4b50] hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95">
                          <Phone className="w-6 h-6 text-white rotate-[135deg] fill-white" />
                        </div>
                        <span className="text-[11px] text-white/70">拒绝</span>
                      </button>

                      {/* Accept (Incoming Call) */}
                      <button
                        onClick={() => {
                          unlockCallTtsPlayback();
                          setCallingStatus("connected");
                          setCallStartTime(Date.now());
                        }}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="w-14 h-14 bg-[#16c76f] hover:bg-emerald-600 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95">
                          <Phone className="w-6 h-6 text-white fill-white" />
                        </div>
                        <span className="text-[11px] text-white/70">接听</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      {/* Cancel (User Outgoing Call) */}
                      <button
                        onClick={() => finishVoiceCall("cancelled")}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="w-14 h-14 bg-[#ef4b50] hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95">
                          <Phone className="w-6 h-6 text-white rotate-[135deg] fill-white" />
                        </div>
                        <span className="text-[11px] text-white/70">取消</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {callRecordDetail && (
            <div className="absolute inset-0 z-[60] flex items-end bg-black/55 p-3 animate-fade-in" onClick={() => setCallRecordDetail(null)}>
              <div className="w-full max-h-[76%] overflow-hidden rounded-[26px] bg-white text-slate-800 shadow-2xl animate-slide-up" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <h3 className="text-sm font-bold">{callRecordDetail.callType}</h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {callRecordDetail.status === "rejected" ? "已拒绝" : callRecordDetail.status === "cancelled" ? "已取消" : `通话时长 ${callRecordDetail.duration}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setCallRecordDetail(null)} className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-[55vh] space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
                  {callRecordDetail.transcript.length > 0 ? callRecordDetail.transcript.map((item) => {
                    const isSelfMessage = item.sender === "user";
                    return (
                      <div key={item.id} className={`flex ${isSelfMessage ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${isSelfMessage ? "bg-[#95ec69] text-[#191919] rounded-tr-sm" : "bg-white text-slate-800 rounded-tl-sm border border-slate-100"}`}>
                          {getCallTranscriptText(item.content)}
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="py-8 text-center text-xs text-slate-400">本次通话没有文字内容</p>
                  )}
                </div>
              </div>
            </div>
          )}

          </div>
        </div>
      ) : null}

      {/* Main Apps Inner Navbar inside Chat Application */}
      <div className="flex-1 overflow-hidden flex flex-col h-full bg-white">
        
        {/* Main tabs viewports */}
        <div ref={mainTabsViewportRef} className="flex-1 overflow-y-auto">
          
          {/* TABS: CHATS LIST (聊天首页) */}
          {activeTab === "chats" && (
            <ConversationList
              threads={chatThreads}
              onSelect={startChatWith}
              getUnreadCount={getUnreadCount}
              renderAvatar={(character) => <RenderAvatar src={character.avatar || (character.isGroupChat ? "👥" : "")} alt={character.name} name={character.remark || character.name} className="w-11 h-11 rounded-full object-cover bg-slate-100 border border-slate-100 aspect-square flex items-center justify-center text-xl select-none" />}
              getGroupMessageSummary={(message) => {
                const content = parseTextImageDescription(message.content) ? "[文字图]" : message.content;
                if (message.sender === "user") return `我: ${content}`;
                const senderChar = characters.find((character) => character.id === message.senderId);
                return `${senderChar ? (senderChar.remark || senderChar.name) : "成员"}: ${content}`;
              }}
              header={<ChatTopBar title={<>聊天 ({chatThreads.length})</>} leftAction={<button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0" title="返回主页"><ChevronLeft className="w-4 h-4 text-slate-700" /></button>} rightAction={<button onClick={() => { setGroupNameInput(""); setSelectedGroupMemberIds([]); setShowCreateGroupModal(true); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-700 transition-colors shrink-0 z-10" title="发起群聊"><Plus className="w-4 h-4 text-slate-700" /></button>} />}
            />
          )}

          {/* TABS: CONTACTS LIST (通讯录) */}
          {activeTab === "contacts" && (
            <ContactList
              contacts={friendContacts}
              onSelect={startChatWith}
              header={<ChatTopBar title={<>通讯录 ({friends.length})</>} leftAction={<button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0" title="返回主页"><ChevronLeft className="w-4 h-4 text-slate-700" /></button>} rightAction={<button onClick={() => setIsShowingAddFriendDialog(true)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-700 transition-colors shrink-0 z-10" title="添加好友"><Plus className="w-4 h-4 text-slate-700" /></button>} />}
            />
          )}

          {/* TABS: MOMENTS FEED (朋友圈) */}
          {activeTab === "moments" && (
            <MomentsApp
              moments={allMoments}
              characters={characters}
              settings={settings}
              translations={momentTranslations}
              filterCharacterId={momentsFilterCharId}
              onClearFilter={() => setMomentsFilterCharId(null)}
              onClose={onClose}
              onAddMoment={onAddMoment}
              onAddComment={onAddCommentToMoment}
              onDeleteComment={(momentId, commentId) => onDeleteCommentFromMoment?.(momentId, commentId)}
              onDeleteMoment={onDeleteMoment}
              onLikeMoment={onLikeMoment}
              onSaveSettings={onSaveSettings}
              onPublishUserMoment={publishMomentFromFeature}
              onPublishComment={publishMomentCommentFromFeature}
              onUploadImage={uploadMomentImageFromFeature}
              onAutoReply={handleAutoReplyToUserComment}
              showToast={showToast}
              onMomentTextContextMenu={handleMomentTextContextMenu}
              onMomentTextPointerDown={handleMomentTextPointerDown}
              onMomentTextPointerUpOrLeave={handleMomentTextPointerUpOrLeave}
              onMomentTextPointerMove={handleMomentTextPointerMove}
              onCommentClick={handleMomentCommentClick}
              onCommentPointerDown={handleMomentCommentPointerDown}
              onClearCommentLongPress={clearMomentCommentLongPress}
            />
          )}

          {/* TABS: ME PROFILE (我) */}
          {activeTab === "me" && (
            <div className="bg-slate-50 min-h-full pb-20 flex flex-col font-sans">
              {meActiveSubView === "none" ? (
                <>
                  {/* Sticky header */}
                  <div className="px-4 py-1.5 bg-transparent sticky top-0 z-10 flex items-center justify-between relative shrink-0">
                    <button
                      onClick={onClose}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
                      title="返回主页"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-700" />
                    </button>
                    <h2 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">我</h2>
                    <div className="w-8 h-8 shrink-0" />
                  </div>

                  {/* Settings Main Entrance Menu */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                    {/* User Profile Card */}
                    <div 
                      onClick={() => setIsEditingProfile(true)}
                      className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm flex flex-col gap-4 relative overflow-hidden cursor-pointer hover:bg-slate-50/40 transition-colors text-left"
                    >
                      {/* Background decorative soft blur gradients */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/40 rounded-full blur-2xl pointer-events-none" />
                      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-50/30 rounded-full blur-2xl pointer-events-none" />
                      
                      <div className="flex items-start justify-between relative z-10">
                        <div className="flex gap-4">
                          <div className="relative">
                            <img
                              src={settings.avatar}
                              alt={settings.name}
                              className="w-16 h-16 rounded-full border border-slate-200/80 object-cover shadow-sm bg-slate-50"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute -bottom-1 -right-1 bg-neutral-950 text-white rounded-full p-1 border border-white shadow-sm">
                              <Sliders className="w-3 h-3 text-white" />
                            </div>
                          </div>

                          <div className="flex flex-col justify-center min-h-[64px]">
                            <span className="text-base font-extrabold text-slate-800 tracking-tight">{settings.name}</span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEditingProfile(true);
                          }}
                          className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all px-3.5 py-1.5 rounded-full shadow-sm"
                        >
                          编辑资料
                        </button>
                      </div>

                      {/* Signature */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100/60 relative z-10 text-left">
                        <div className="text-xs text-slate-700 flex items-start gap-1">
                          <span className="text-slate-400 font-medium shrink-0">签名:</span>
                          <span className="italic text-slate-600 font-medium line-clamp-1">{settings.signature || "暂无签名"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Navigation Entry List */}
                    <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100/60 text-left">
                      {/* 1. Wallet */}
                      <button
                        onClick={() => setMeActiveSubView("wallet")}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50/85 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-6 h-6 flex items-center justify-center text-slate-800 transition-transform group-hover:scale-105 shrink-0">
                            <Wallet className="w-5 h-5 text-slate-800" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-800">我的钱包</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">红包零钱和交易明细</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-emerald-600">¥ {walletBalance.toFixed(2)}</span>
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
                        </div>
                      </button>

                      {/* 2. Sticker Management */}
                      <button
                        onClick={() => setMeActiveSubView("stickers")}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50/85 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-6 h-6 flex items-center justify-center text-slate-800 transition-transform group-hover:scale-105 shrink-0">
                            <Smile className="w-5 h-5 text-slate-800" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-800">表情包管理</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">新建分组、上传及导入表情</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{stickerGroups.length} 个分组</span>
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
                        </div>
                      </button>

                      {/* 3. Favorites */}
                      <button
                        onClick={() => setMeActiveSubView("favorites")}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50/85 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-6 h-6 flex items-center justify-center text-slate-800 transition-transform group-hover:scale-105 shrink-0">
                            <FolderHeart className="w-5 h-5 text-slate-800" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-800">我的收藏</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">收藏的聊天语录与朋友圈</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">({savedBookmarks.length + momentFavorites.length})</span>
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
                        </div>
                      </button>
                    </div>

                    {/* Footnote */}
                    <div className="py-6 text-center">
                      <p className="text-[10px] text-slate-300 font-medium">微信多维互动面板 v2.0</p>
                    </div>
                  </div>
                </>
              ) : meActiveSubView === "identities" ? (
                // SUB-VIEW: ROLE PRESETS (角色预设)
                <div className="animate-fade-in">
                  <div className="px-4 py-1.5 bg-white sticky top-0 z-10 flex items-center justify-between border-b border-slate-100">
                    <button
                      onClick={() => setMeActiveSubView("none")}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-700" />
                    </button>
                    <h2 className="text-sm font-bold text-slate-800 tracking-tight">角色预设</h2>
                    <div className="w-8 h-8 shrink-0" />
                  </div>

                  <div className="p-4 bg-indigo-50/40 border-b border-indigo-100">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      💡 你可在下方快速选择和切换你的<b>分身预设</b>。在进行对话或群聊时，你使用的身份将会完美呈现在消息列表与属性中。
                    </p>
                  </div>

                  {/* Active identity details */}
                  <div className="m-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3 text-left">
                    <div className="flex items-center gap-3">
                      <img src={settings.avatar} alt="" className="w-10 h-10 rounded-xl object-cover border" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">当前活跃身份：{settings.name}</h4>
                        <p className="text-[10px] text-slate-400 italic mt-0.5">{settings.signature || "暂无签名"}</p>
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-3">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">活跃背景设定</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {settings.bio || "暂无设定背景，系统将采用默认极简人设。您可以点击下方编辑按钮来丰富它。"}
                      </p>
                    </div>

                    <button
                      onClick={() => setIsEditingProfile(true)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 mt-2"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>编辑当前活跃人设资料</span>
                    </button>
                  </div>

                  {/* Preset list */}
                  <div className="m-4">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-left px-1">可用分身库 ({settings.identities?.length || 1})</h3>
                    <div className="space-y-2">
                      {/* Default primary first */}
                      {(settings.identities || []).length === 0 ? (
                        <div className="bg-white p-4 rounded-2xl border text-center text-xs text-slate-400">
                          未创建其他分身。您可在系统设置中为自己添加更多独特身份和头像！
                        </div>
                      ) : (
                        settings.identities?.map((idty) => {
                          const isActive = idty.id === activeIdentityId;
                          return (
                            <div
                              key={idty.id}
                              onClick={() => {
                                setEditMyName(idty.name);
                                setEditMyAvatar(idty.avatar);
                                setEditMySignature(idty.signature || "");
                                setEditMyBio(idty.bio || "");
                                if (onSwitchIdentity) onSwitchIdentity(idty.id);
                                else onSaveSettings({
                                  ...settings,
                                  activeIdentityId: idty.id,
                                  name: idty.name,
                                  avatar: idty.avatar,
                                  signature: idty.signature || "",
                                  bio: idty.bio || ""
                                });
                                showToast(`成功切换分身为：${idty.name}`);
                              }}
                              className={`p-3 bg-white rounded-xl border transition-all flex items-center justify-between cursor-pointer text-left ${isActive ? "border-indigo-500 shadow-sm ring-1 ring-indigo-100" : "border-slate-100 hover:border-slate-300"}`}
                            >
                              <div className="flex items-center gap-3">
                                <img src={idty.avatar} alt="" className="w-9 h-9 rounded-lg object-cover border" />
                                <div>
                                  <p className="text-xs font-bold text-slate-800">{idty.name}</p>
                                  <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{idty.signature || "无签名"}</p>
                                </div>
                              </div>
                              {isActive ? (
                                <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">使用中</span>
                              ) : (
                                <span className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold px-2 py-0.5 bg-slate-50 rounded-full border">切换</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ) : meActiveSubView === "wallet" ? (
                // SUB-VIEW: WALLET (钱包)
                <div className="animate-fade-in text-left">
                  <div className="px-4 py-1.5 bg-white sticky top-0 z-10 flex items-center justify-between border-b border-slate-100">
                    <button
                      onClick={() => setMeActiveSubView("none")}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-700" />
                    </button>
                    <h2 className="text-sm font-bold text-slate-800 tracking-tight">零钱钱包</h2>
                    <div className="w-8 h-8 shrink-0" />
                  </div>

                  {/* Wallet Card */}
                  <div className="m-4 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
                    <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 text-9xl pointer-events-none">🧧</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 text-white">WeChat Pay / 我的零钱</span>
                      <CreditCard className="w-4 h-4 opacity-75" />
                    </div>
                    <div className="mt-6 mb-3">
                      <span className="text-xs opacity-75 text-white">我的零钱余额</span>
                      <h3 className="text-3xl font-extrabold tracking-tight mt-1 text-white">¥ {walletBalance.toFixed(2)}</h3>
                    </div>
                    <p className="text-[9px] opacity-60 text-white/70">账户享有网联清算安全中心全程技术保障</p>
                  </div>

                  {/* Simulated top up button */}
                  <div className="mx-4">
                    <button
                      onClick={() => {
                        setTopUpAmount("");
                        setShowTopUpModal(true);
                      }}
                      className="w-full py-3 bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-600 font-extrabold rounded-xl text-xs text-center transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <Plus className="w-4 h-4 text-emerald-500" />
                      <span>充值零钱</span>
                    </button>
                  </div>

                   {/* Transaction History (收支明细) - pulling dynamically from database history! */}
                  <div className="m-4">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">收支账单明细 (实时同步)</h4>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
                      
                      {/* Filter real messages for red envelope transactions! */}
                      {(() => {
                        const transactions = messages.flatMap((m) => {
                          if (m.content.startsWith("[红包]")) {
                            const [_, amountStr, greetingStr] = normalizePaymentMarkup(m.content).split("|");
                            const amount = parseFloat(amountStr || "8.88");
                            const status = getRedPacketActualStatus(m);
                            const char = characters.find(c => c.id === m.characterId);
                            const friendName = char?.remark || char?.name || "未知好友";
                            const avatarUrl = char?.avatar || "🧧";
                            const formattedTime = new Date(m.timestamp).toLocaleDateString() + " " + new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                            const items = [];

                            if (m.sender !== "user") {
                              // Received red packet - show only if claimed
                              if (status === "claimed") {
                                items.push({
                                  id: `${m.id}-received`,
                                  type: "received",
                                  title: `收到 [${friendName}] 的红包`,
                                  subtitle: `“${greetingStr || "恭喜发财"}” · ${formattedTime}`,
                                  amount: `+ ¥${amount.toFixed(2)}`,
                                  isPositive: true,
                                  avatar: avatarUrl,
                                  timestamp: m.timestamp
                                });
                              }
                            } else {
                              // Sent red packet - always show as deduction
                              items.push({
                                  id: `${m.id}-sent`,
                                  type: "sent",
                                  title: `发送给 [${friendName}] 的红包`,
                                  subtitle: `“${greetingStr || "恭喜发财"}” · ${formattedTime}`,
                                  amount: `- ¥${amount.toFixed(2)}`,
                                  isPositive: false,
                                  avatar: avatarUrl,
                                  timestamp: m.timestamp
                              });

                              // If also refunded, show the refund item
                              if (status === "refunded") {
                                items.push({
                                  id: `${m.id}-refund`,
                                  type: "refund",
                                  title: `红包过期退回`,
                                  subtitle: `发给 [${friendName}] 的红包逾期未领退回 · ${formattedTime}`,
                                  amount: `+ ¥${amount.toFixed(2)}`,
                                  isPositive: true,
                                  avatar: "🧧",
                                  timestamp: m.timestamp + 24 * 3600 * 1000 // estimate 24h refund time
                                });
                              }
                            }

                            return items;
                          }
                          return [];
                        });

                        // Sort transactions by timestamp descending
                        transactions.sort((a, b) => b.timestamp - a.timestamp);

                        if (transactions.length === 0) {
                          return (
                            <div className="p-5 text-center text-[10px] text-slate-400 bg-slate-50/50">
                              暂无任何消费、收支记录。发红包、收红包等动作会自动结算到这里！
                            </div>
                          );
                        }

                        return transactions.map((t) => {
                          return (
                            <div key={t.id} className="p-3.5 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-3">
                                {t.avatar.startsWith("http") || t.avatar.startsWith("data") || t.avatar.startsWith("blob") ? (
                                  <img src={t.avatar} alt="" className="w-8 h-8 rounded-full object-cover border" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-sm">{t.avatar}</div>
                                )}
                                <div className="text-left">
                                  <p className="font-bold text-slate-800">{t.title}</p>
                                  <p className="text-[9px] text-stone-400 mt-0.5">{t.subtitle}</p>
                                </div>
                              </div>
                              <span className={`font-extrabold ${t.isPositive ? "text-emerald-600" : "text-rose-500"}`}>
                                {t.amount}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Top Up Input Modal */}
                  {showTopUpModal && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in text-slate-800">
                      <div className="bg-white rounded-[24px] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 animate-scale-up p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-800">微信零钱充值</h3>
                          <button
                            onClick={() => setShowTopUpModal(false)}
                            className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-1.5 text-left">
                          <label className="block text-[10px] text-slate-400 font-extrabold uppercase">请输入充值金额 (元)</label>
                          <div className="relative flex items-center">
                            <span className="absolute left-3.5 text-lg font-bold text-slate-800">¥</span>
                            <input
                              type="number"
                              value={topUpAmount}
                              onChange={(e) => setTopUpAmount(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-8 pr-3 text-sm font-bold text-slate-850 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all"
                              placeholder="0.00"
                              min="0.01"
                              step="0.01"
                              autoFocus
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => setShowTopUpModal(false)}
                            className="px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const amountVal = parseFloat(topUpAmount);
                              if (isNaN(amountVal) || amountVal <= 0) {
                                showToast("请输入有效的充值金额");
                                return;
                              }
                      setWalletBalance(prev => {
                        const next = prev + amountVal;
                        return next;
                              });
                              showToast(`充值成功！余额已增加 ¥${amountVal.toFixed(2)}`);
                              setShowTopUpModal(false);
                            }}
                            className="px-4 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-sm hover:shadow transition-all"
                          >
                            确认充值
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : meActiveSubView === "stickers" ? (
                // SUB-VIEW: STICKER PACK SETTINGS (表情包设置)
                <div className="animate-fade-in text-left">
                  <div className="px-4 py-1.5 bg-white sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 shrink-0">
                    <button
                      onClick={() => setMeActiveSubView("none")}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-700" />
                    </button>
                    <h2 className="text-sm font-bold text-slate-800 tracking-tight">表情包管理</h2>
                    <button
                      onClick={() => triggerCreateStickerGroupRef.current?.()}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
                      title="新建分组"
                    >
                      <Plus className="w-4 h-4 text-slate-700" />
                    </button>
                  </div>

                  <div className="m-4 me-tab-sticker-settings">
                    <StickerSettings
                      settings={settings}
                      stickerGroups={stickerGroups}
                      onUpdateStickerGroups={setStickerGroups}
                      triggerCreateGroupRef={triggerCreateStickerGroupRef}
                    />
                  </div>
                </div>
              ) : (
                // SUB-VIEW: SAVED BOOKMARKS LIST (收藏)
                <div className="animate-fade-in text-left">
                  <div className="px-4 py-1.5 bg-white sticky top-0 z-10 flex items-center justify-between border-b border-slate-100">
                    <button
                      onClick={() => setMeActiveSubView("none")}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-700" />
                    </button>
                    <h2 className="text-sm font-bold text-slate-800 tracking-tight">我的收藏</h2>
                    
                    {/* Segmented Control Tabs */}
                    <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold shrink-0">
                      <button
                        onClick={() => setFavedTab("chats")}
                        className={`px-2 py-1 rounded-md transition-all ${favedTab === "chats" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                      >
                        聊天 ({savedBookmarks.length})
                      </button>
                      <button
                        onClick={() => setFavedTab("moments")}
                        className={`px-2 py-1 rounded-md transition-all ${favedTab === "moments" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                      >
                        朋友圈 ({momentFavorites.length})
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    {favedTab === "chats" ? (
                      savedBookmarks.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-5 mt-4">
                          <Bookmark className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-[11px] text-slate-400">
                            暂无收藏的聊天话语。在聊天窗口中，长按或点击气泡左侧的收藏标签即可将特定对话保存在这里！
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 mt-4">
                          {savedBookmarks.map((bm) => {
                            const owner = characters.find((c) => c.id === bm.characterId);
                            return (
                              <div
                                key={bm.id}
                                className="p-3 bg-white border border-slate-100 rounded-xl relative group flex gap-2.5 items-start text-left shadow-sm"
                              >
                                <img
                                  src={bm.sender === "user" ? settings.avatar : (owner?.avatar || "")}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover shrink-0"
                                />
                                <div className="flex-1 min-w-0 text-xs text-left">
                                  <span className="font-bold text-slate-500">
                                    {bm.sender === "user" ? "我" : (owner?.name || "未知")}
                                  </span>
                                  <p className="text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed italic bg-slate-50 p-2 rounded border border-slate-100/60">
                                    "{bm.content}"
                                  </p>
                                  <span className="text-[9px] text-slate-400 block mt-1">
                                    收藏于 {new Date(bm.timestamp).toLocaleDateString()}
                                  </span>
                                </div>

                                <button
                                  onClick={() => onToggleBookmark(bm.id, bm)}
                                  className="text-rose-400 hover:text-rose-600 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="取消收藏"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )
                    ) : (
                      momentFavorites.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-5 mt-4">
                          <Heart className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-[11px] text-slate-400">
                            暂无收藏的朋友圈动态。长按朋友圈文字，即可将精彩瞬间文案收藏在这里！
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 mt-4">
                          {momentFavorites.map((fav) => {
                            return (
                              <div
                                key={fav.id}
                                className="p-3 bg-white border border-slate-100 rounded-xl relative group flex gap-2.5 items-start text-left shadow-sm"
                              >
                                <img
                                  src={fav.authorAvatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop"}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover shrink-0"
                                />
                                <div className="flex-1 min-w-0 text-xs text-left">
                                  <span className="font-bold text-slate-500">
                                    {fav.authorName}
                                  </span>
                                  <p className="text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed italic bg-slate-50 p-2 rounded border border-slate-100/60">
                                    "{fav.content}"
                                  </p>
                                  <span className="text-[9px] text-slate-400 block mt-1">
                                    收藏于 {new Date(fav.timestamp).toLocaleDateString()}
                                  </span>
                                </div>

                                <button
                                  onClick={() => {
                                    setMomentFavorites(prev => prev.filter(f => f.id !== fav.id));
                                    showToast("已取消收藏");
                                  }}
                                  className="text-rose-400 hover:text-rose-600 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="取消收藏"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* BOTTOM NAVIGATION BAR FOR CHAT APP (聊天、通讯录、朋友圈、我) */}
        <div className="chat-tab-nav bg-slate-50 border-t border-slate-200/60 py-2 shrink-0 flex justify-around items-center text-[10px] font-bold text-slate-400 z-10">
          <button
            onClick={() => setActiveTab("chats")}
            className={`chat-tab-nav-item flex flex-col items-center space-y-1 ${
              activeTab === "chats" ? "chat-tab-nav-item--active text-neutral-950" : "chat-tab-nav-item--inactive text-neutral-400 hover:text-neutral-650"
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {(() => {
                const totalUnreadCount = chatThreads.reduce((sum, thread) => sum + getUnreadCount(thread.id), 0);
                return totalUnreadCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 border border-white">
                    {totalUnreadCount}
                  </span>
                ) : null;
              })()}
            </div>
            <span>聊天</span>
          </button>
          
          <button
            onClick={() => setActiveTab("contacts")}
            className={`chat-tab-nav-item flex flex-col items-center space-y-1 ${
              activeTab === "contacts" ? "chat-tab-nav-item--active text-neutral-950" : "chat-tab-nav-item--inactive text-neutral-400 hover:text-neutral-650"
            }`}
          >
            <Users className="w-5 h-5" />
            <span>通讯录</span>
          </button>

          <button
            onClick={() => setActiveTab("moments")}
            className={`chat-tab-nav-item flex flex-col items-center space-y-1 ${
              activeTab === "moments" ? "chat-tab-nav-item--active text-neutral-950" : "chat-tab-nav-item--inactive text-neutral-400 hover:text-neutral-650"
            }`}
          >
            <div className="relative">
              <Compass className="w-5 h-5" />
              {getUnreadMomentsCount() > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 border border-white">
                  {getUnreadMomentsCount()}
                </span>
              )}
            </div>
            <span>朋友圈</span>
          </button>

          <button
            onClick={() => setActiveTab("me")}
            className={`chat-tab-nav-item flex flex-col items-center space-y-1 ${
              activeTab === "me" ? "chat-tab-nav-item--active text-neutral-950" : "chat-tab-nav-item--inactive text-neutral-400 hover:text-neutral-650"
            }`}
          >
            <User className="w-5 h-5" />
            <span>我</span>
          </button>
        </div>

      </div>

      {singleCharacterMomentsId && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col h-full animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shrink-0 z-25">
            <button
              onClick={() => setSingleCharacterMomentsId(null)}
              className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-slate-600" />
            </button>
            <h2 className="font-bold text-slate-800 text-sm">
              {(characters.find(c => c.id === singleCharacterMomentsId)?.remark || 
                characters.find(c => c.id === singleCharacterMomentsId)?.name || "")} 的朋友圈
            </h2>
            <div className="w-8 h-8" />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-white pb-12">
            {/* Cover banner */}
            <div className="h-52 bg-slate-200 relative shrink-0">
              <img
                src={characters.find(c => c.id === singleCharacterMomentsId)?.momentsCover || "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&h=500&fit=crop"}
                alt="Cover"
                className="w-full h-full object-cover rounded-none"
              />
              {/* Overlapping Character Avatar & Name */}
              <div className="absolute right-4 -bottom-6 flex items-end gap-3 z-30">
                <span className="text-sm font-bold text-white tracking-tight pb-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none">
                  {(characters.find(c => c.id === singleCharacterMomentsId)?.remark || 
                    characters.find(c => c.id === singleCharacterMomentsId)?.name || "")}
                </span>
                <img
                  src={characters.find(c => c.id === singleCharacterMomentsId)?.avatar || ""}
                  alt=""
                  className="w-16 h-16 rounded-[12px] border-2 border-white object-cover bg-white shadow-md z-40"
                />
              </div>
            </div>

            {/* Top Spacing for Overlapping Avatar */}
            <div className="h-10"></div>

            {/* List of moments by this character */}
            <div className="px-4 divide-y divide-slate-100 max-w-md mx-auto">
              {allMoments.filter(m => m.characterId === singleCharacterMomentsId).length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-xs">
                  Ta 还没有发布过朋友圈动态
                </div>
              ) : (
                allMoments
                  .filter(m => m.characterId === singleCharacterMomentsId)
                  .map((mom) => {
                    const hasLiked = mom.likes.includes(settings.name);
                    const momChar = mom.characterId ? characters.find((c) => c.id === mom.characterId) : null;
                    const momAuthorName = momChar ? (momChar.remark || momChar.name) : mom.authorName;
                    const momAuthorAvatar = momChar ? momChar.avatar : mom.authorAvatar;
                    const textImageDescription = mom.imageDescription || cleanAndExtractMoment(mom.content).imageDescription;
                    return (
                      <div key={mom.id} className="py-5 flex gap-3">
                        
                        {/* Author Avatar */}
                        <img
                          src={momAuthorAvatar}
                          alt=""
                          className="w-10 h-10 rounded-[6px] object-cover bg-slate-50 shrink-0 border border-slate-100"
                        />

                        {/* Right Content Column */}
                        <div className="flex-1 min-w-0">
                          {/* Name */}
                          <h4 className="text-xs font-bold text-[#576b95]">
                            {momAuthorName}
                          </h4>

                          {/* Content text */}
                          <p 
                            className="chat-long-press-target text-xs text-slate-800 leading-relaxed whitespace-pre-wrap mt-1 select-none cursor-pointer hover:bg-slate-50/50 rounded p-1 transition-colors relative"
                            title="长按/右键 弹出菜单"
                            onContextMenu={(e) => handleMomentTextContextMenu(
                              e,
                              mom.id,
                              renderMomentContent(mom.content),
                              momAuthorName,
                              momAuthorAvatar,
                              mom.characterId === undefined || mom.characterId === null,
                              mom.timestamp
                            )}
                            onPointerDown={(e) => handleMomentTextPointerDown(
                              e,
                              mom.id,
                              renderMomentContent(mom.content),
                              momAuthorName,
                              momAuthorAvatar,
                              mom.characterId === undefined || mom.characterId === null,
                              mom.timestamp
                            )}
                            onPointerUp={handleMomentTextPointerUpOrLeave}
                            onPointerLeave={handleMomentTextPointerUpOrLeave}
                            onPointerMove={handleMomentTextPointerMove}
                          >
                            {renderMomentContent(mom.content)}
                          </p>

                          {/* Translation block if exists */}
                          {momentTranslations[mom.id] && (
                            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 leading-relaxed bg-slate-50/60 p-2.5 rounded-lg animate-fade-in">
                              <div className="flex items-center gap-1 text-[9px] text-slate-400 mb-1 font-bold">
                                <Languages className="w-3 h-3" />
                                <span>翻译 (由 AI 翻译)</span>
                              </div>
                              <p className="whitespace-pre-wrap">{momentTranslations[mom.id]}</p>
                            </div>
                          )}

                          {/* Photo if attached */}
                          {textImageDescription && !mom.image && (
                            <button
                              type="button"
                              onClick={() => setViewingImageDescription(textImageDescription)}
                              className="mt-2.5 max-w-[200px] min-h-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 px-4 py-3 text-left shadow-sm"
                            >
                              <ImageIcon className="w-4 h-4 text-slate-400 mb-4" />
                              <p className="text-xs leading-relaxed text-slate-600 line-clamp-3">{textImageDescription}</p>
                              <span className="block mt-2 text-[10px] text-slate-400">文字图 · 点击查看</span>
                            </button>
                          )}
                          {mom.image && (
                            <div className="mt-2.5 inline-flex max-w-full rounded-lg overflow-hidden border border-slate-100 bg-slate-50 align-top">
                              <img src={mom.image} alt={mom.imageDescription || "朋友圈配图"} width={mom.imageWidth} height={mom.imageHeight} className="block h-auto w-auto max-w-[200px] max-h-52 object-contain rounded-lg" />
                            </div>
                          )}

                          {/* Actions footer */}
                          <div className="flex justify-between items-center mt-3">
                            <span className="text-[10px] text-slate-400 font-medium">
                              {new Date(mom.timestamp).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}{" "}
                              {new Date(mom.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>

                            {/* Like / Comment small buttons */}
                            <div className="flex items-center gap-4">
                              <button
                                onClick={() => onLikeMoment(mom.id, settings.name)}
                                className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${
                                  hasLiked ? "text-rose-500" : "text-slate-400 hover:text-slate-600"
                                }`}
                              >
                                <Heart className={`w-3.5 h-3.5 ${hasLiked ? "fill-rose-500 text-rose-500" : ""}`} />
                                <span>{mom.likes.length || "赞"}</span>
                              </button>

                              <button
                                onClick={() => {
                                  const isOpen = showCommentInputMap[mom.id];
                                  setShowCommentInputMap(prev => ({ ...prev, [mom.id]: !prev[mom.id] }));
                                  if (isOpen) {
                                    setReplyingToCommentMap(prev => {
                                      const copy = { ...prev };
                                      delete copy[mom.id];
                                      return copy;
                                    });
                                  }
                                }}
                                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 font-semibold transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>{getMomentComments(mom).length || "评论"}</span>
                              </button>
                            </div>
                          </div>

                          {/* WeChat-style integrated Like & Comment Shelf */}
                          {(mom.likes.length > 0 || getMomentComments(mom).length > 0) && (
                            <div className="moments-reaction-shelf bg-[#f7f7f7] rounded-[4px] p-2 text-[11px] mt-2 space-y-2">
                              {/* Likes shelf details */}
                              {mom.likes.length > 0 && (
                                <div className="moments-reaction-divider flex items-center gap-1.5 text-[#576b95] font-bold flex-wrap pb-1">
                                  <Heart className="w-3 h-3 text-rose-500 fill-current shrink-0" />
                                  <span className="leading-tight">{mom.likes.join(", ")}</span>
                                </div>
                              )}

                              {/* Comments list shelf */}
                              {getMomentComments(mom).length > 0 && (
                                <div className="moments-comment-list py-0.5">
                                  {getMomentComments(mom).map((comm) => {
                                    const commChar = characters.find((c) => c.name === comm.authorName);
                                    const commAuthorName = commChar ? (commChar.remark || commChar.name) : comm.authorName;
                                    return (
                                      <div
                                        key={comm.id}
                                        onClick={() => handleMomentCommentClick(mom.id, comm)}
                                        onPointerDown={(event) => handleMomentCommentPointerDown(event, mom.id, comm)}
                                        onPointerUp={clearMomentCommentLongPress}
                                        onPointerLeave={clearMomentCommentLongPress}
                                        onPointerMove={handleMomentCommentPointerMove}
                                        onPointerCancel={clearMomentCommentLongPress}
                                        onContextMenu={(event) => event.preventDefault()}
                                        className="chat-long-press-target py-1.5 leading-relaxed text-slate-800 cursor-pointer transition-colors text-[11px] block text-left moments-comment-item"
                                        title={`点击回复；长按翻译或删除评论`}
                                      >
                                        <span className="font-bold text-[#576b95] mr-1">{commAuthorName}</span>
                                        <span className="text-slate-700">{comm.content}</span>
                                        {commentTranslations[getMomentCommentTranslationKey(mom.id, comm.id)] && (
                                          <span className="mt-0.5 block whitespace-pre-wrap text-slate-500">
                                            {commentTranslations[getMomentCommentTranslationKey(mom.id, comm.id)]}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Inline comment form */}
                          {showCommentInputMap[mom.id] && (
                            <div className="flex gap-2 items-center bg-[#f7f7f7] border border-slate-200/30 rounded-lg px-2.5 py-1 mt-2">
                              <input
                                type="text"
                                value={inlineCommentsTexts[mom.id] || ""}
                                onChange={(e) =>
                                  setInlineCommentsTexts({ ...inlineCommentsTexts, [mom.id]: e.target.value })
                                }
                                placeholder={replyingToCommentMap[mom.id] ? `回复${replyingToCommentMap[mom.id].authorName}：` : "发表评论..."}
                                className="flex-1 bg-transparent border-none focus:outline-none text-[10px] text-slate-700 py-0.5"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handlePublishComment(mom.id);
                                  }
                                }}
                              />
                              <button
                                onClick={() => handlePublishComment(mom.id)}
                                className="text-[10px] text-blue-500 hover:text-blue-600 font-bold px-1"
                              >
                                发送
                              </button>
                            </div>
                          )}

                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Page Overlay (编辑个人资料页面) */}
      {isEditingProfile && (
        <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col h-full animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shrink-0">
            <button
              onClick={() => setIsEditingProfile(false)}
              className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-slate-600" />
            </button>
            <h2 className="font-bold text-slate-800 text-sm">编辑个人资料</h2>
            <div className="w-8 h-8" />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              {/* Identity Switcher */}
              <div className="border-b border-slate-50 pb-4">
                <div className="grid grid-cols-3 gap-2">
                  {(settings.identities || []).map((idty, index) => {
                    const isSelected = idty.id === (settings.activeIdentityId || "identity-1");
                    return (
                      <button
                        key={idty.id}
                        type="button"
                        onClick={() => {
                          setEditMyName(idty.name);
                          setEditMyAvatar(idty.avatar);
                          setEditMySignature(idty.signature);
                          setEditMyBio(idty.bio);
                          
                          if (onSwitchIdentity) onSwitchIdentity(idty.id);
                          else onSaveSettings({
                            ...settings,
                            activeIdentityId: idty.id,
                            name: idty.name,
                            avatar: idty.avatar,
                            signature: idty.signature,
                            bio: idty.bio
                          });
                        }}
                        className={`flex items-center justify-center py-2 px-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? "border-neutral-950 ring-1 ring-neutral-950 text-neutral-950 font-bold bg-white"
                            : "border-slate-200 text-slate-400 bg-white hover:bg-slate-50 hover:text-slate-600"
                        }`}
                      >
                        <span className="text-[10px] font-bold truncate max-w-full block w-full">
                          {idty.name || `预设 ${index + 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Avatar upload */}
              <div className="flex flex-col items-center py-2 border-b border-slate-50 pb-4">
                <div className="relative">
                  <img
                    src={editMyAvatar}
                    alt="Avatar"
                    className="w-16 h-16 rounded-full object-cover border border-slate-200 shadow-sm bg-slate-100"
                  />
                  <label className="absolute -bottom-1 -right-1 bg-neutral-950 text-white rounded-full p-1 border-2 border-white cursor-pointer shadow-sm hover:bg-neutral-900 transition-colors">
                    <Sliders className="w-3 h-3" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const compressed = await compressImage(file, 400, 400, 0.75);
                            setEditMyAvatar(compressed);
                          } catch (err) {
                            console.error("My avatar compression failed:", err);
                          }
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
                <span className="text-[10px] text-slate-400 mt-2">更换我的头像</span>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">我的昵称</label>
                <input
                  type="text"
                  value={editMyName}
                  onChange={(e) => setEditMyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs font-semibold text-slate-800"
                />
              </div>

              {/* Signature Input */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">个性签名</label>
                <input
                  type="text"
                  value={editMySignature}
                  onChange={(e) => setEditMySignature(e.target.value)}
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-800"
                />
              </div>

              {/* Bio TextArea */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">我的背景人设介绍</label>
                <textarea
                  rows={4}
                  value={editMyBio}
                  onChange={(e) => setEditMyBio(e.target.value)}
                  placeholder=""
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs resize-none leading-relaxed text-slate-800"
                />
              </div>

              {/* Global Chat Style Preset Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-2">默认聊天预设样式（全局）</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditGlobalChatStylePreset("default")}
                    className={`py-2 px-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                      editGlobalChatStylePreset === "default"
                        ? "border-neutral-950 bg-neutral-950 text-white font-bold shadow-sm"
                        : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-[11px]">默认经典</span>
                    <span className="text-[7.5px] opacity-75">官方标准</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditGlobalChatStylePreset("liquid-glass")}
                    className={`py-2 px-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                      editGlobalChatStylePreset === "liquid-glass"
                        ? "border-neutral-950 bg-neutral-950 text-white font-bold shadow-sm"
                        : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-[11px]">液态玻璃</span>
                    <span className="text-[7.5px] opacity-75">高感毛玻璃</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditingProfile(false)}
                className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const updatedIdentities = (settings.identities || []).map(idty => {
                    if (idty.id === (settings.activeIdentityId || "identity-1")) {
                      return {
                        ...idty,
                        name: editMyName,
                        avatar: editMyAvatar,
                        signature: editMySignature,
                        bio: editMyBio,
                      };
                    }
                    return idty;
                  });

                  onSaveSettings({
                    ...settings,
                    name: editMyName,
                    avatar: editMyAvatar,
                    signature: editMySignature,
                    bio: editMyBio,
                    globalChatStylePreset: editGlobalChatStylePreset,
                    identities: updatedIdentities,
                  });
                  setIsEditingProfile(false);
                }}
                className="flex-1 py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Friend Confirmation Overlay */}
      {isShowingAddFriendDialog && (() => {
        const addedSourceIds = new Set(friends.map((friend) => friend.profileSourceId || friend.id));
        const unaddedCharacters = Array.from(
          new Map(
            characters
              .filter((c) => !c.isGroupChat && !addedSourceIds.has(c.profileSourceId || c.id))
              .map((c) => [c.profileSourceId || c.id, c])
          ).values()
        );
        return (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="theme-add-contact-dialog bg-[var(--surface)] text-[var(--text-primary)] rounded-3xl p-5 shadow-2xl max-w-[320px] w-full flex flex-col max-h-[85%] animate-slide-up border border-[var(--border)]">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0">
                <h3 className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>添加联系人</span>
                </h3>
                <button
                  onClick={() => setIsShowingAddFriendDialog(false)}
                  className="p-1 rounded-full hover:bg-[var(--surface-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className={`${unaddedCharacters.length === 0 ? "" : "flex-1 overflow-y-auto"} py-3 space-y-3 pr-1`}>
                <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 text-[10px] text-[var(--text-secondary)] font-semibold">
                  正在以「{settings.name}」的身份添加好友；好友、群聊和朋友圈将只属于这个身份。
                </div>
                {unaddedCharacters.length === 0 ? (
                  <div className="text-center py-4 px-2 space-y-3">
                    <div className="w-12 h-12 bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-full flex items-center justify-center mx-auto shadow-inner border border-[var(--border)]">
                      <Users className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed">
                      档案馆里所有的角色都已经是您的好友啦！
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        onClick={() => {
                          setIsShowingAddFriendDialog(false);
                          onNavigateToApp("archives");
                        }}
                        className="w-full py-2 bg-[var(--button-primary-bg)] hover:bg-[var(--button-primary-hover-bg)] text-[var(--button-primary-text)] rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        去档案馆新建更多角色
                      </button>
                      <button
                        onClick={() => setIsShowingAddFriendDialog(false)}
                        className="w-full py-2 bg-[var(--button-secondary-bg)] hover:bg-[var(--surface-raised)] border border-[var(--button-secondary-border)] text-[var(--button-secondary-text)] rounded-xl text-xs font-bold transition-all"
                      >
                        关闭窗口
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] text-[var(--text-tertiary)] leading-normal mb-1">
                      选择已在“档案馆”创建好的虚拟角色，一键添加好友：
                    </p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto">
                      {unaddedCharacters.map((char) => (
                        <div
                          key={char.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] gap-2 hover:bg-[var(--surface-muted)] transition-colors"
                        >
                          <img
                            src={char.avatar}
                            alt={char.name}
                            className="w-8 h-8 rounded-full object-cover bg-slate-200 border border-slate-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-[var(--text-primary)] truncate">
                              {char.name}
                            </div>
                            <div className="text-[9px] text-[var(--text-tertiary)]">
                              {char.mbti} &bull; {char.age}岁 &bull; {char.gender}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const characterId = char.profileSourceId || char.id;
                              if (findRelationship(relationships, activeIdentityId, characterId)) return;
                              const now = Date.now();
                              const relationId = `rel-${now}-${Math.random().toString(36).slice(2, 7)}`;
                              const relationship = createRelationship({ id: relationId, characterId, userIdentityId: activeIdentityId, now });
                              onSaveRelationships([...relationships, relationship]);
                              captureRelationshipCreatedEvent(relationship, now);
                            }}
                            className="px-2.5 py-1 bg-[var(--button-primary-bg)] hover:bg-[var(--button-primary-hover-bg)] text-[var(--button-primary-text)] rounded-lg text-[10px] font-bold transition-colors shadow-sm shrink-0"
                          >
                            添加
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              {unaddedCharacters.length > 0 && (
                <div className="pt-2 border-t border-slate-100 shrink-0">
                  <button
                    onClick={() => setIsShowingAddFriendDialog(false)}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    关闭窗口
                  </button>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* Group Chat Creation Modal */}
      {showCreateGroupModal && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-[320px] w-full flex flex-col max-h-[85%] animate-slide-up border border-slate-100">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4 text-neutral-800" />
                <span>发起群聊</span>
              </h3>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto py-3 space-y-4">
              {/* Group Name Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">群聊名称</label>
                <input
                  type="text"
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  placeholder="例如：周五狂欢组, 开发茶话会..."
                  className="w-full bg-slate-50 px-3.5 py-2 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-900 text-xs text-slate-700 placeholder-slate-400 font-medium"
                />
              </div>

              {/* Members Selection List */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  选择群聊成员 ({selectedGroupMemberIds.length} 已选)
                </label>
                {friends.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic py-2">您还没有可以邀请的好友，请先添加好友。</p>
                ) : (
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                    {friends.map((char) => {
                      const isSelected = selectedGroupMemberIds.includes(char.id);
                      return (
                        <div
                          key={char.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedGroupMemberIds(prev => prev.filter(id => id !== char.id));
                            } else {
                              setSelectedGroupMemberIds(prev => [...prev, char.id]);
                            }
                          }}
                          className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "bg-neutral-50 border-neutral-950 shadow-sm"
                              : "bg-slate-50/50 border-slate-100 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={char.avatar}
                              alt={char.name}
                              className="w-7 h-7 rounded-full object-cover bg-slate-100 border border-slate-100 shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="text-[11px] font-bold text-slate-800 block truncate">{char.remark || char.name}</span>
                              <span className="text-[9px] text-slate-400 block truncate">{char.mbti || "MBTI"} &bull; {char.personality.substring(0, 15)}...</span>
                            </div>
                          </div>
                          <div className="shrink-0 pl-1.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="rounded border-slate-300 text-neutral-950 focus:ring-neutral-950 w-3.5 h-3.5 cursor-pointer"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 shrink-0 flex gap-2">
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all text-center"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (selectedGroupMemberIds.length < 1) {
                    alert("请至少选择一位群聊好友！");
                    return;
                  }
                  const finalGroupName = groupNameInput.trim() || `群聊(${selectedGroupMemberIds.length + 1})`;
                  const newGroupId = `group-${Date.now()}`;
                  
                  // Construct group character object
                  const groupChar: Character = {
                    id: newGroupId,
                    name: finalGroupName,
                    avatar: "👥",
                    personality: `微信群聊：${finalGroupName}。`,
                    backstory: `这是一个微信群聊，群名是「${finalGroupName}」。群内成员包括机主（${settings.name}）以及以下虚拟伙伴：${selectedGroupMemberIds.map(id => {
                      const c = characters.find(char => char.id === id);
                      return c ? (c.remark || c.name) : "";
                    }).filter(Boolean).join("、")}。`,
                    isGroupChat: true,
                    memberIds: selectedGroupMemberIds,
                    ownerIdentityId: activeIdentityId,
                  };

                  // Save
                  onSaveCharacter(groupChar);

                  // Create initial narration message
                  const invitedNames = selectedGroupMemberIds.map(id => {
                    const c = characters.find(char => char.id === id);
                    return c ? (c.remark || c.name) : "";
                  }).filter(Boolean).join("、");

                  const initialNarration: Message = {
                    id: `group-narrate-${Date.now()}`,
                    characterId: newGroupId,
                    conversationId: `group:${newGroupId}`,
                    sender: "character",
                    isNarration: true,
                    content: `您邀请了 ${invitedNames} 加入了群聊`,
                    timestamp: Date.now() - 1000,
                  };
                  // Close and switch to the new group chat
                  setShowCreateGroupModal(false);
                  setActiveChatRelationId(null);
                  pendingGroupWelcomeIdRef.current = newGroupId;
                  setActiveChatCharId(newGroupId);
                  setInitiatedChatIds((previous) => previous.includes(newGroupId) ? previous : [...previous, newGroupId]);
                  setPendingGroupWelcome({ groupId: newGroupId, narration: initialNarration });
                }}
                disabled={selectedGroupMemberIds.length < 1}
                className="flex-1 py-2 bg-neutral-950 hover:bg-neutral-900 text-white disabled:bg-slate-200 disabled:text-slate-400 rounded-xl text-xs font-bold transition-all text-center"
              >
                创建群聊
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Long Press Bubble Context Menu */}
      {activeMenuMsg && (() => {
        const visualViewport = window.visualViewport;
        const viewportTop = visualViewport?.offsetTop ?? 0;
        const viewportLeft = visualViewport?.offsetLeft ?? 0;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const viewportWidth = visualViewport?.width ?? window.innerWidth;
        const viewportBottom = viewportTop + viewportHeight;
        const spaceAbove = menuPosition.y - viewportTop;
        const spaceBelow = viewportBottom - menuPosition.y;
        const shouldOpenUpward = spaceBelow < Math.min(360, viewportHeight * 0.55) && spaceAbove > spaceBelow;
        const menuWidth = Math.min(176, viewportWidth - 20);
        const menuLeft = Math.max(viewportLeft + 10, Math.min(viewportLeft + viewportWidth - menuWidth - 10, menuPosition.x - menuWidth / 2));
        return (
        <div 
          className="fixed inset-0 z-50 bg-black/10 flex items-center justify-center backdrop-blur-[1px]"
          onClick={() => setActiveMenuMsg(null)}
          onContextMenu={(e) => { e.preventDefault(); setActiveMenuMsg(null); }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: shouldOpenUpward ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="chat-bubble-context-menu overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-stone-200/80 p-2.5 text-stone-800 space-y-1"
            style={{
              position: "absolute",
              width: menuWidth,
              maxHeight: Math.max(160, viewportHeight - 20),
              top: shouldOpenUpward ? undefined : Math.max(viewportTop + 10, menuPosition.y + 8),
              bottom: shouldOpenUpward ? Math.max(10, window.innerHeight - menuPosition.y + 8) : undefined,
              left: menuLeft,
              transformOrigin: shouldOpenUpward ? "bottom center" : "top center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onToggleBookmark(activeMenuMsg.id, activeMenuMsg);
                setActiveMenuMsg(null);
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Bookmark className={`w-3.5 h-3.5 ${activeMenuMsg.isBookmarked ? "text-stone-800 fill-stone-800" : "text-stone-400"}`} />
              <span>{activeMenuMsg.isBookmarked ? "取消收藏" : "收藏"}</span>
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(activeMenuMsg.content);
                showToast("复制成功");
                setActiveMenuMsg(null);
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-stone-500" />
              <span>复制</span>
            </button>

            {onDeleteMessage && (
              <>
                <button
                  onClick={() => {
                    deleteMessageAndLinkedImage(activeMenuMsg.id);
                    setActiveMenuMsg(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 text-stone-700 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-stone-500" />
                  <span>删除</span>
                </button>
                <button
                  onClick={() => startMultiSelectDelete(activeMenuMsg.id)}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 text-stone-700 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Check className="w-3.5 h-3.5 text-stone-500" />
                  <span>多选删除</span>
                </button>
              </>
            )}

            <button
              onClick={() => {
                const belongsToCurrentChat = activeDirectScope
                  ? isMessageInDirectScope(activeMenuMsg, activeDirectScope)
                  : Boolean(activeCharacter?.isGroupChat && activeMenuMsg.characterId === activeCharacter.id);
                if (!belongsToCurrentChat) {
                  setActiveMenuMsg(null);
                  showToast("不能引用其他关系中的消息。");
                  return;
                }
                setQuotedMessage(activeMenuMsg);
                setActiveMenuMsg(null);
                const inputEl = document.querySelector('input[type="text"]') as HTMLInputElement;
                if (inputEl) inputEl.focus();
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Quote className="w-3.5 h-3.5 text-stone-500" />
              <span>引用</span>
            </button>

            <button
              onClick={() => {
                handleStartOfflineFromMsg(activeMenuMsg);
                setActiveMenuMsg(null);
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-stone-500" />
              <span>切换到线下模式</span>
            </button>

            {activeMenuMsg.sender !== "user" && (
              <button
                onClick={() => {
                  setOocCommentText("");
                  setShowOocCommentModal(activeMenuMsg);
                  setActiveMenuMsg(null);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 text-stone-700 rounded-lg flex items-center gap-2 transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5 text-stone-500" />
                <span>OOC 注释</span>
              </button>
            )}

            {!activeMenuMsg.content.startsWith("data:image/") && !activeMenuMsg.content.startsWith("[红包]") && (
              <button
                onClick={() => {
                  handleTranslateMessage(activeMenuMsg);
                  setActiveMenuMsg(null);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 text-stone-700 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Languages className="w-3.5 h-3.5 text-stone-500" />
                <span>翻译</span>
              </button>
            )}

            {activeMenuMsg.translation && (
              <button
                onClick={() => {
                  setCollapsedTranslations((previous) => {
                    const next = new Set(previous);
                    if (next.has(activeMenuMsg.id)) next.delete(activeMenuMsg.id);
                    else next.add(activeMenuMsg.id);
                    return next;
                  });
                  setActiveMenuMsg(null);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 text-stone-700 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Languages className="w-3.5 h-3.5 text-stone-500" />
                <span>{collapsedTranslations.has(activeMenuMsg.id) ? "展开翻译" : "收起翻译"}</span>
              </button>
            )}

            {activeMenuMsg.content.startsWith("[语音") && (
              <button
                onClick={() => {
                  const msgId = activeMenuMsg.id;
                  setVoiceTranscribed((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
                  setActiveMenuMsg(null);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-indigo-600 transition-colors"
              >
                <Languages className="w-3.5 h-3.5 text-indigo-500" />
                <span>{voiceTranscribed[activeMenuMsg.id] ? "收起文字" : "语音转文字"}</span>
              </button>
            )}
          </motion.div>
        </div>
        );
      })()}

      {/* OOC Comment Modal */}
      {showOocCommentModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-stone-100 p-4 space-y-3 animate-scale-up text-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-stone-800 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-neutral-800" />
                <span>人设 OOC 修正注释</span>
              </span>
              <button onClick={() => setShowOocCommentModal(null)} className="p-1 hover:bg-stone-200 rounded-full transition-colors">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            
            <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 text-[10px] text-stone-500 text-left max-h-[80px] overflow-y-auto">
              <span className="font-bold text-stone-600">{activeCharacter.name}: </span>
              “{showOocCommentModal.content}”
            </div>

            <textarea
              value={oocCommentText}
              onChange={(e) => setOocCommentText(e.target.value)}
              placeholder="请输入对此回答的修正意见（例如：语气太温柔了，他现在应该是冷傲的，绝对不会用这么多感叹号，更不会说么么哒。）"
              rows={3}
              className="w-full text-[11px] p-2.5 border border-stone-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-neutral-950 bg-stone-50/50 resize-none font-medium leading-relaxed text-left"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowOocCommentModal(null)}
                className="flex-1 py-2 rounded-xl text-stone-500 bg-stone-100 hover:bg-stone-200 text-xs font-black transition-all"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (!oocCommentText.trim()) return;

                  const relationId = activeRelationship?.id;
                  if (relationId && activeChatCharId && activeDirectScope) {
                    const now = Date.now();
                    const stored = behaviorCorrectionRepository.append({
                      id: "ooc-" + Date.now(),
                      characterId: activeChatCharId,
                      relationId,
                      userIdentityId: activeDirectScope.userIdentityId,
                      conversationId: activeDirectScope.conversationId,
                      instruction: oocCommentText.trim(),
                      originalResponse: showOocCommentModal.content,
                      sourceMessageIds: [showOocCommentModal.id],
                      createdAt: now,
                      updatedAt: now,
                      status: "active",
                      schemaVersion: 1,
                    });
                    if (!stored.success) {
                      showToast("OOC 纠正保存失败，请稍后重试。");
                      return;
                    }
                  }
                  
                  const comment = oocCommentText.trim();
                  setShowOocCommentModal(null);
                  
                  // Automatically trigger immediate regeneration/correction based on OOC comment
                  handleRegenerateResponse(showOocCommentModal, comment);
                }}
                className="flex-1 py-2 rounded-xl text-white bg-neutral-950 hover:bg-neutral-900 text-xs font-black shadow-sm transition-all"
              >
                提交并立即纠偏
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Content Reader Modal */}
      {selectedFileNote && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 animate-fade-in text-stone-800">
          <div className="bg-white rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-stone-100 max-h-[75%] animate-scale-up">
            <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-black text-stone-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-neutral-800" />
                <span className="truncate max-w-[150px]">{selectedFileNote.title}</span>
              </span>
              <button onClick={() => setSelectedFileNote(null)} className="p-1 hover:bg-stone-200 rounded-full transition-colors">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 text-xs text-left leading-relaxed font-medium text-stone-700 whitespace-pre-wrap select-text selection:bg-blue-100 selection:text-blue-800">
              {selectedFileNote.content || "（该笔记为空）"}
            </div>
            
            <div className="p-3 bg-stone-50 border-t border-stone-100 shrink-0 text-center">
              <button
                onClick={() => setSelectedFileNote(null)}
                className="px-6 py-1.5 rounded-xl text-xs font-black bg-neutral-950 hover:bg-neutral-900 text-white shadow-sm transition-all active:scale-95"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Moment comment delete confirmation */}
      {commentDeleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/30 p-4" onClick={() => setCommentDeleteTarget(null)}>
          <div className="w-full rounded-[24px] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="px-2 pb-3 text-center text-xs text-slate-500">删除后无法恢复</p>
            <button
              type="button"
              onClick={confirmDeleteMomentComment}
              className="w-full rounded-2xl bg-red-50 py-3 text-sm font-bold text-red-600 active:bg-red-100"
            >
              删除评论
            </button>
            <button
              type="button"
              onClick={() => setCommentDeleteTarget(null)}
              className="mt-2 w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {commentContextMenu && (
        <div
          className="fixed inset-0 z-[70] bg-black/10 flex items-center justify-center backdrop-blur-[1px]"
          onClick={() => setCommentContextMenu(null)}
          onContextMenu={(event) => { event.preventDefault(); setCommentContextMenu(null); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-stone-200/80 p-2.5 min-w-[160px] text-stone-800 space-y-1"
            style={{
              position: "absolute",
              top: Math.max(10, Math.min(window.innerHeight - 150, commentContextMenu.y - 10)),
              left: Math.max(10, Math.min(window.innerWidth - 180, commentContextMenu.x - 80)),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleTranslateMomentComment(commentContextMenu.momentId, commentContextMenu.commentId, commentContextMenu.text)}
              className="w-full text-left px-2.5 py-1.5 text-[12px] leading-5 font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Languages className="w-3.5 h-3.5 shrink-0 text-stone-500" />
              <span>{commentTranslations[getMomentCommentTranslationKey(commentContextMenu.momentId, commentContextMenu.commentId)] ? "显示原文" : "AI 翻译"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCommentContextMenu(null);
                setCommentDeleteTarget({ momentId: commentContextMenu.momentId, commentId: commentContextMenu.commentId });
              }}
              className="w-full text-left px-2.5 py-1.5 text-[12px] leading-5 font-bold hover:bg-red-50 rounded-lg flex items-center gap-2 text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0 text-red-400" />
              <span>删除评论</span>
            </button>
          </motion.div>
        </div>
      )}

      {/* Moments Text Context Menu Overlay */}
      {momentContextMenu && (
        <div 
          className="fixed inset-0 z-50 bg-black/10 flex items-center justify-center backdrop-blur-[1px]" 
          onClick={() => setMomentContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setMomentContextMenu(null); }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-stone-200/80 p-2.5 min-w-[160px] text-stone-800 space-y-1"
            style={{
              position: "absolute",
              top: Math.max(10, Math.min(window.innerHeight - 220, momentContextMenu.y - 10)),
              left: Math.max(10, Math.min(window.innerWidth - 180, momentContextMenu.x - 80)),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleCopyMomentText(momentContextMenu.text)}
              className="w-full text-left px-2.5 py-1.5 text-[12px] leading-5 font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Copy className="w-3.5 h-3.5 shrink-0 text-stone-500" />
              <span>复制文案</span>
            </button>

            <button
              onClick={() => handleFavoriteMoment(
                momentContextMenu.momentId,
                momentContextMenu.text,
                momentContextMenu.authorName,
                momentContextMenu.authorAvatar,
                momentContextMenu.timestamp
              )}
              className="w-full text-left px-2.5 py-1.5 text-[12px] leading-5 font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Heart className={`w-3.5 h-3.5 shrink-0 ${momentFavorites.some(f => f.momentId === momentContextMenu.momentId && f.content === momentContextMenu.text) ? "fill-rose-500 text-rose-500" : "text-stone-400"}`} />
              <span>
                {momentFavorites.some(f => f.momentId === momentContextMenu.momentId && f.content === momentContextMenu.text) ? "取消收藏" : "加入收藏"}
              </span>
            </button>

            <button
              onClick={() => handleTranslateMoment(momentContextMenu.momentId, momentContextMenu.text)}
              className="w-full text-left px-2.5 py-1.5 text-[12px] leading-5 font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Languages className="w-3.5 h-3.5 shrink-0 text-stone-500" />
              <span>{momentTranslations[momentContextMenu.momentId] ? "显示原文" : "AI 翻译"}</span>
            </button>

            <button
              onClick={() => handleDeleteMomentClick(momentContextMenu.momentId)}
              className="w-full text-left px-2.5 py-1.5 text-[12px] leading-5 font-bold hover:bg-stone-100 text-red-500 hover:text-red-600 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0 text-red-400" />
              <span>删除动态</span>
            </button>
          </motion.div>
        </div>
      )}

      {viewingImageDescription && (
        <div
          className="fixed inset-0 z-[70] bg-black/45 p-6 flex items-center justify-center"
          onClick={() => setViewingImageDescription(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-800">文字图描述</span>
              <button type="button" onClick={() => setViewingImageDescription(null)} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{viewingImageDescription}</p>
          </div>
        </div>
      )}

      {/* Visual Toast Notification Overlay */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] bg-white text-slate-800 border border-slate-200 px-5 py-3 rounded-2xl text-xs font-bold shadow-[0_10px_30px_rgba(0,0,0,0.15)] flex items-center justify-center text-center animate-scale-up max-w-[85%]">
          {toastMessage}
        </div>
      )}

    </div>
  );
}
import { formatWeChatTimestamp, getScheduledContactTime } from "../features/chat/services/chatTime";
