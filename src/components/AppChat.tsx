import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { apiChat, apiExtractMemories, apiTranslate } from "../utils/apiHelper";
import { getLatestWorldBookEntries, getVisibleWorldBookEntries, buildWorldBookSystemBlocks } from "../utils/worldBook";
import { Character, Message, Moment, UserSettings, MomentComment, WorldBookEntry, MemoryItem, MemoryVaultSettings, OfflineStory, StickerGroup, InnerVoiceRecord, sanitizeChatIcons, type ChatIconKey, type MusicTrack, type IdentityMusicState, type RelationshipMusicState } from "../types";
import { compressImage } from "../utils/pngParser";
import { cleanAiReplyText as cleanOnlineMessage, createCallRecordMarkup, createTextImageMarkup, expandCallRecordHistory, formatCallRecordHistory, getCallTranscriptText, isCallRecordMarkup, isRedPacketMarkup, isTransferMarkup, normalizePaymentMarkup, parseCallRecord, parseTextImageDescription, stripInternalDeliveryMarkers } from "../features/chat/services/messageParser";
import { createCharacterTextMessage, createGroupCharacterMessage, createUserTextMessage } from "../features/chat/services/messageFactory";
import { createGroupTurnMemories } from "../features/chat/services/groupMemoryDistribution";
import { createDirectReplyCandidates } from "../features/chat/services/directChatService";
import { mayCharacterUseEmoji } from "../features/chat/services/characterEmojiPolicy";
import { createVoiceCallRecordMessage, isCurrentVoiceCallScope, resolveDirectVoiceCallScope } from "../features/chat/services/voiceCallScope";
import { canTriggerProactiveVoiceCall, createProactiveCallRejectionPatch, createProactiveCallTriggerPatch, resolveOutgoingCallResolution } from "../features/chat/services/proactiveVoiceCallPolicy";
import type { VoiceCallStatus } from "../features/chat/services/messageTypes";
import { shouldAutomaticallyConvertTextToVoice } from "../features/chat/services/voiceMessageEligibility";
import { IDENTITY_WALLET_BALANCES_KEY, RED_PACKET_STATUSES_KEY, getPaymentStatusKey, loadIdentityWalletBalances, readRedPacketStatus, removePaymentStatusesByRelation, removePaymentStatusesForMessages, writeRedPacketStatus, type IdentityWalletBalances, type RedPacketStatus, type RedPacketStatusMap } from "../features/chat/services/paymentScope";
import { getWorldBookLocationReferences } from "../domain/worldbook/locationReferences";
import { stickerDb } from "../utils/stickerDb";
import { LIVING_HUMAN_PROMPT, MOMENT_CHARACTER_EXPRESSION_PROMPT } from "../utils/livingPrompt";
import { MemoryService, formatDelicateMemoryDiary, formatExtractedMemorySummary, formatMemoriesForPrompt } from "../domain/memory/MemoryService";
import { buildOfflineHandoffTimelinePromptBlock, buildPendingOfflineHandoffPromptBlock, createPendingOfflineHandoff, getOfflineHandoffSourceMessagesForReturn, getOfflineMemorySourceMessages, hasOfflineStorySummary, isOfflineStoryHandoffMemory, recordOfflineHandoffDelivery, selectFreshOfflineHandoffMemory, selectPendingOfflineHandoffStory } from "../domain/memory/offlineMemorySync";
import { PromptComposer } from "../domain/prompt/PromptComposer";
import { CHARACTER_LANGUAGE_POLICY, projectCharacterPrompt } from "../domain/prompt/characterPromptProjector";
import { formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage } from "../domain/prompt/characterLanguage";
import { formatCurrentVoiceMessagePrompt, formatVoiceMessageHistory } from "../features/chat/prompts/voiceMessagePrompt";
import { CHARACTER_MEDIA_USAGE_RULES, DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, MEDIA_EVENT_PERSONA_RESPONSE_RULE, WORLD_BOOK_CONTEXT_PRIORITY } from "../features/chat/prompts/chatPromptPolicy";
import { getOfflineStoriesContextForOnlineChat } from "../features/chat/prompts/onlineOfflineBoundary";
import { buildOfflineMemberKnowledgeSnapshots } from "../features/offline/services/offlineMemberMemorySnapshot";
import { formatStructuralWorldBookSection } from "../features/chat/prompts/chatWorldBookPromptSections";
import { buildGroupChatSystemInstruction, buildGroupChatTaskMessage, buildProactiveChatSystemInstruction, finalizeCharacterChatSystemInstruction } from "../features/chat/prompts/chatPromptBuilders";
import { buildGroupMemberPrivateContext, buildIsolatedGroupMemberDefinitions } from "../features/chat/prompts/groupMemberPrivateContext";
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
import { findInnerVoiceByMessage, listInnerVoicesByGroup, listInnerVoicesByRelation, loadInnerVoiceRecords, removeInnerVoicesByRelation, saveInnerVoiceRecords, type InnerVoiceScope } from "../core/storage/repositories/innerVoiceRepository";
import { generateInnerVoice } from "../features/chat/services/innerVoiceService";
import { generateCharacterImage } from "../features/chat/services/characterImageService";
import { createChatReplyController } from "../features/chat/controllers/chatReplyController";
import { generateGroupChatTurn, generateProactiveChatTurn, generateRegeneratedChatTurn, requestDirectChatTurn } from "../features/chat/controllers/chatGenerationController";
import { resolveChatTurnSettings } from "../features/chat/services/chatTurnSettings";
import { getChatTypingScopeKey, getVisibleChatTyping, setChatScopeCharacterOverride, setChatScopeTyping, type ChatTypingScopeState } from "../features/chat/services/chatTypingScope";
import { createChatSideEffectController, markChatInitiated, markChatRead, touchRelationshipSession } from "../features/chat/controllers/chatSideEffectController";
import { useChatController } from "../features/chat/hooks/useChatController";
import { useChatSettingsDraft } from "../features/chat/hooks/useChatSettingsDraft";
import { useChatAttachmentState } from "../features/chat/hooks/useChatAttachmentState";
import { createChatRuntimeContext, type ChatRuntimeContext } from "../features/chat/context/chatRuntimeContext";
import { attachDirectScope, isMessageInDirectScope, resolveDirectInteractionScope, toDirectChatRuntimeContext, type MessageMutationScope } from "../features/chat/context/directInteractionScope";
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
import { loadImageGenerationRecords, removeImageGenerationRecordByMessage, removeImageGenerationRecordsByRelation, saveImageGenerationRecords } from "../core/storage/repositories/imageGenerationRepository";
import { commitForumMutation, loadForumActivityTasks, loadForumActorStates, loadForumGenerationTasks, loadForumReplies, loadForumShares, loadForumThreads } from "../core/storage/repositories/forumRepository";
import { removeForumSharesByRelation, unlinkForumPrivateAuthorByRelation } from "../domain/forum/forumShare";
import { removeForumGenerationTasksByRelation } from "../domain/forum/forumGenerationGuard";
import { loadDiaryEntries, loadDiaryGenerationTasks, loadDiaryShares, loadDiaryTranslations, saveDiaryEntries, saveDiaryGenerationTasks, saveDiaryShares, saveDiaryTranslations } from "../core/storage/repositories/diaryRepository";
import { cleanupDiaryForRelations } from "../domain/diary/diaryCleanup";
import { Button, Card, Modal } from "./ui";
import StickerSettings from "./StickerSettings";
import ChatIcon from "./ChatIcon";
import { ForumShareCard } from "../features/forum/components/ForumShareCard";
import { ChatTopBar } from "../features/chat/components/ChatTopBar";
import { ContactList } from "../features/chat/components/ContactList";
import { ConversationList } from "../features/chat/components/ConversationList";
import { MessageList } from "../features/chat/components/MessageList";
import { parseQuoteReply, QuotedMessagePreview } from "../features/chat/components/QuotedMessagePreview";
import { AttachmentMenu } from "../features/chat/components/AttachmentMenu";
import { ChatComposer } from "../features/chat/components/ChatComposer";
import { ChatTextInput } from "../features/chat/components/ChatTextInput";
import { BubbleTipPortalLayer } from "../features/chat/components/BubbleTipPortalLayer";
import {
  VISUAL_VIEWPORT_CHANGE_EVENT,
  type VisualViewportMetrics,
} from "../features/viewport/visualViewport";
import { scrollContainerToBottom } from "../features/viewport/scrollContainer";
import { RedPacketCard } from "../features/chat/components/SpecialMessage/RedPacketCard";
import { TransferCard } from "../features/chat/components/SpecialMessage/TransferCard";
import { MomentsApp } from "../features/moments/MomentsApp";
import { calculateCharacterMomentOccurredAt, requestCharacterMomentOnce } from "../features/moments/services/momentGenerator";
import { requestAutomaticMomentComment } from "../features/moments/services/momentCommentService";
import { requestMomentCommentReply } from "../features/moments/services/momentReplyService";
import { buildMomentCognitiveContext } from "../features/moments/services/momentCognitiveContext";
import { buildProactiveCognitiveContext } from "../features/chat/services/proactiveCognitiveContext";
import { prioritizeUserChatCss, scopeUserChatCss } from "../features/chat/styles/chatCssScope";
import {
  LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
  LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
  LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS,
  LIQUID_GLASS_DEFAULT_TEXT_COLOR,
} from "../features/chat/styles/liquidGlassDefaults";
import { sanitizeMomentPublishText } from "../features/moments/services/momentContent";
import { createMomentTemporalContext } from "../features/moments/services/momentTemporalContext";
import { buildMomentWorldKnowledge, buildPublicMomentContext, cleanAndExtractMoment, compactTopicHint, getKnownMomentsContextString, getMomentComments, getPostIntervalMs, getRelationshipLastMomentTimestamp, renderMomentContent } from "../features/moments/services/chatMomentUtils";
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
  Edit3
} from "lucide-react";

import { getSpeechForText } from "../utils/minimaxTts";
import { buildCharacterTtsOptions, canPlayTtsMessage, getTtsProvider, resolveTtsCharacter } from "../features/voice/ttsConfig";

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

const CHARACTER_CSS_EXAMPLE_TEMPLATE = `/* 仅作用于聊天页面：设置页、档案馆及其他应用不会应用本样式。 */
/* ==================== 主题变量 ==================== */
#conv-screen {
  /* 页面与消息 */
  --chat-page-bg: var(--app-bg);
  --chat-header-bg: var(--surface);
  --chat-message-list-bg: var(--app-bg);
  --chat-text: var(--text-primary);
  --chat-muted-text: var(--text-secondary);
  --chat-divider: var(--divider);

  /* 气泡边框：可切换 solid / dashed / dotted，不使用超大圆角值。 */
  --chat-bubble-border: var(--border);
  --chat-bubble-border-width: 1px;
  --chat-bubble-border-style: solid;
  /* 需要虚线时改为：--chat-bubble-border-style: dashed; */

  /* 底部输入栏容器 */
  --chat-composer-bg: var(--surface);
  --chat-composer-text: var(--text-primary);
  --chat-composer-border: var(--border);
  --chat-composer-border-width: 1px;
  --chat-composer-radius: var(--radius-xl);
  --chat-composer-shadow: none;

  /* 文本输入框 */
  --chat-input-bg: var(--input-bg);
  --chat-input-text: var(--text-primary);
  --chat-input-placeholder: var(--input-placeholder);
  --chat-input-border: var(--border);
  --chat-input-border-width: 1px;
  --chat-input-radius: var(--radius-sm);
  --chat-input-shadow: none;
  --chat-input-focus-border: var(--accent);
  --chat-input-focus-shadow: 0 0 0 2px var(--focus-ring);

  /* 加号、仅发送、发送并回复按钮 */
  --chat-button-border: var(--border);
  --chat-button-border-width: 1px;
  --chat-button-radius: var(--radius-full);
  --chat-button-shadow: none;
  --chat-attach-bg: var(--button-secondary-bg);
  --chat-attach-text: var(--button-secondary-text);
  --chat-attach-hover-bg: var(--surface-raised);
  --chat-attach-hover-text: var(--button-secondary-text);
  --chat-send-only-bg: var(--button-secondary-bg);
  --chat-send-only-text: var(--button-secondary-text);
  --chat-send-only-hover-bg: var(--surface-raised);
  --chat-send-only-hover-text: var(--button-secondary-text);
  --chat-send-bg: var(--button-primary-bg);
  --chat-send-text: var(--button-primary-text);
  --chat-send-border: var(--button-primary-bg);
  --chat-send-hover-bg: var(--button-primary-hover-bg);
  --chat-send-hover-text: var(--button-primary-text);
  --chat-send-hover-border: var(--button-primary-hover-bg);
  --chat-button-disabled-bg: var(--button-disabled-bg);
  --chat-button-disabled-text: var(--button-disabled-text);
  --chat-button-disabled-border: var(--button-disabled-border);
  --chat-button-disabled-opacity: 0.4;
}

/* ==================== 页面结构 ==================== */
.chat-page { background: var(--chat-page-bg); color: var(--chat-text); }
.chat-page__background { background: var(--chat-page-bg); }
.cv-header,
.chat-header,
.header { background: var(--chat-header-bg); color: var(--chat-text); }
.cv-header .back-btn,
.cv-header .menu-btn { background: transparent; color: var(--chat-text); }
.header-title { color: var(--chat-text); }
.header-title-avatar,
.user-avatar,
.ai-avatar { border-radius: 50%; }
.header-title-name { color: var(--chat-text); }
.character-status { color: var(--accent); }
.cv-back-icon,
.cv-menu-icon { color: var(--chat-text); }

/* 消息滚动区域、时间戳与消息元数据 */
.cv-messages-list { background: var(--chat-message-list-bg); color: var(--chat-text); }
.chat-timestamp { color: var(--chat-muted-text); }
.chat-timestamp__label { background: var(--surface-muted); color: var(--chat-muted-text); }
.msg-meta-header { color: var(--chat-muted-text); }
.msg-meta-name,
.msg-meta-date,
.msg-meta-time { color: var(--chat-muted-text); }
.msg-meta-divider { border-color: var(--chat-divider); }

/* ==================== 消息气泡与分组 ==================== */
.cv-bubble,
.message-bubble,
.message-content { color: var(--chat-text); }
.chat-bubble-self { background: var(--button-primary-bg); color: var(--button-primary-text); }
.chat-bubble-other { background: var(--surface-raised); color: var(--chat-text); }
.chat-bubble-self,
.chat-bubble-other,
.voice-message-bar,
.transfer-card,
.received-transfer-card {
  border: var(--chat-bubble-border-width) var(--chat-bubble-border-style) var(--chat-bubble-border);
  border-radius: 14px;
  box-shadow: none;
}

/* 同一发送者连续消息：首条有尾巴和装饰，中间/末尾不输出尾巴。 */
.msg-group-top.chat-bubble-self,
.msg-group-top.chat-bubble-other { border-radius: 14px; }
.msg-group-middle.chat-bubble-self,
.msg-group-middle.chat-bubble-other {
  border-radius: 4px;
}
.msg-group-bottom.chat-bubble-self,
.msg-group-bottom.chat-bubble-other {
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  border-bottom-left-radius: 14px;
  border-bottom-right-radius: 14px;
}

/* ==================== Portal 尾巴 ==================== */
/* .bubble-tip 是空的 Portal 节点；请自行定义形状、尺寸、颜色和位置。 */
.cv-bubble-tip-portal-layer,
.cv-bubble-tip-portal { pointer-events: none; overflow: visible; }
.bubble-tip { position: absolute; z-index: 10; }
.bubble-tip.self-tip { /* 我方消息右上角 */ }
.bubble-tip.other-tip { /* 对方消息左上角 */ }
/* 示例：双层圆点尾巴（按需取消注释并修改）
.bubble-tip.self-tip,
.bubble-tip.other-tip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface);
}
.bubble-tip.self-tip { right: -8px; top: 0; }
.bubble-tip.other-tip { left: -8px; top: 0; }
.bubble-tip::after {
  content: "";
  display: block;
  width: 8px;
  height: 8px;
  margin: 4px;
  border-radius: 50%;
  background: currentColor;
}
*/

/* ==================== 气泡四角装饰 ==================== */
/* 每组第一条消息才输出 bubble-deco；素材、尺寸、偏移全部由用户 CSS 决定。 */
.bubble-deco-wrapper { position: relative; overflow: visible; }
.bubble-deco {
  position: absolute;
  z-index: 20;
  overflow: visible;
  pointer-events: none;
}
/* 示例：使用图片装饰（按需修改 URL 和角落位置）
.bubble-deco {
  width: 48px;
  height: 48px;
  right: -20px;
  top: -20px;
  background: url("装饰图片URL") center / contain no-repeat;
}
*/

/* ==================== 引用消息 ==================== */
.message-quote-reply-wrapper,
.message-quote-reply-wrapper--self,
.message-quote-reply-wrapper--other { color: var(--chat-text); }
.message-quote__header,
.message-quote__content,
.message-quote__reply-body { color: inherit; }

/* ==================== 底部输入栏 ==================== */
.cv-footer,
.chat-input-area { color: var(--chat-composer-text); }
.chat-composer--default,
.chat-composer--floating,
.chat-composer--liquid {
  background: var(--chat-composer-bg);
  border: var(--chat-composer-border-width) solid var(--chat-composer-border);
  border-radius: var(--chat-composer-radius);
  box-shadow: var(--chat-composer-shadow);
}
.chat-composer__form { color: var(--chat-composer-text); }
.chat-input,
.chat-composer__input {
  background: var(--chat-input-bg);
  color: var(--chat-input-text);
  border: var(--chat-input-border-width) solid var(--chat-input-border);
  border-radius: var(--chat-input-radius);
  box-shadow: var(--chat-input-shadow);
}
.chat-input::placeholder,
.chat-composer__input::placeholder { color: var(--chat-input-placeholder); }
.chat-input:focus,
.chat-composer__input:focus {
  border-color: var(--chat-input-focus-border);
  box-shadow: var(--chat-input-focus-shadow);
}
.chat-composer__button,
.chat-composer__send-button {
  border: var(--chat-button-border-width) solid var(--chat-button-border);
  border-radius: var(--chat-button-radius);
  box-shadow: var(--chat-button-shadow);
  color: currentColor;
}
.chat-composer__attach-button,
.cv-func-btn,
.toggle-tools-btn {
  background: var(--chat-attach-bg);
  color: var(--chat-attach-text);
}
.chat-composer__attach-button:hover,
.chat-composer__attach-button.chat-composer__button--open {
  background: var(--chat-attach-hover-bg);
  color: var(--chat-attach-hover-text);
}
.chat-composer__send-only-button,
.cv-send-only-btn {
  background: var(--chat-send-only-bg);
  color: var(--chat-send-only-text);
}
.chat-composer__send-only-button:hover:not(:disabled) {
  background: var(--chat-send-only-hover-bg);
  color: var(--chat-send-only-hover-text);
}
.chat-composer__send-reply-button,
.send-button {
  background: var(--chat-send-bg);
  color: var(--chat-send-text);
  border-color: var(--chat-send-border);
}
.chat-composer__send-reply-button:hover:not(:disabled),
.send-button:hover:not(:disabled) {
  background: var(--chat-send-hover-bg);
  color: var(--chat-send-hover-text);
  border-color: var(--chat-send-hover-border);
}
.chat-composer__button:disabled {
  background: var(--chat-button-disabled-bg);
  color: var(--chat-button-disabled-text);
  border-color: var(--chat-button-disabled-border);
  opacity: var(--chat-button-disabled-opacity);
}
.chat-composer__button svg,
.cv-plus-icon svg,
.cv-send-only-icon svg,
.cv-send-reply-icon svg {
  color: currentColor;
  stroke: currentColor;
}
.chat-composer__send-reply-button svg,
.cv-send-reply-icon svg { fill: currentColor; }
.chat-composer__attachment-panel { color: var(--chat-composer-text); }

/* ==================== 自定义图标 ==================== */
/* 隐藏默认 SVG 后填入图片 URL；url() 内不要留多余空格。 */
.cv-back-icon svg { display: none; }
.cv-back-icon { background: url("返回按钮图片URL") center / contain no-repeat; }
.cv-menu-icon svg { display: none; }
.cv-menu-icon { background: url("菜单按钮图片URL") center / contain no-repeat; }
.cv-plus-icon svg { display: none; }
.cv-plus-icon { background: url("加号按钮图片URL") center / contain no-repeat; }
.cv-send-only-icon svg { display: none; }
.cv-send-only-icon { background: url("仅发送按钮图片URL") center / contain no-repeat; }
.cv-send-reply-icon svg { display: none; }
.cv-send-reply-icon { background: url("发送回复按钮图片URL") center / contain no-repeat; }
`;

const COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE = `/* 仅作用于聊天页面；设置页和其他应用不会应用本样式。 */
/* 返回按钮和更多按钮已经默认使用透明底板，无需额外隐藏圆形背景。 */

/* ==================== 主题变量 ==================== */
#conv-screen {
  --chat-page-bg: var(--app-bg);
  --chat-header-bg: var(--surface);
  --chat-message-list-bg: var(--app-bg);
  --chat-text: var(--text-primary);
  --chat-muted-text: var(--text-secondary);
  --chat-divider: var(--divider);
  --chat-user-bg: var(--button-primary-bg);
  --chat-user-text: var(--button-primary-text);
  --chat-ai-bg: var(--surface-raised);
  --chat-ai-text: var(--text-primary);
  /* 支持 solid / dashed / dotted */
  --chat-bubble-border: var(--border);
  --chat-bubble-border-width: 1px;
  --chat-bubble-border-style: solid;
  --chat-composer-bg: var(--surface);
  --chat-composer-text: var(--text-primary);
  --chat-composer-border: var(--border);
  --chat-composer-border-width: 1px;
  --chat-composer-radius: var(--radius-xl);
  --chat-composer-shadow: none;
  --chat-input-bg: var(--input-bg);
  --chat-input-text: var(--text-primary);
  --chat-input-placeholder: var(--input-placeholder);
  --chat-input-border: var(--border);
  --chat-input-border-width: 1px;
  --chat-input-radius: var(--radius-sm);
  --chat-input-shadow: none;
  --chat-input-focus-border: var(--accent);
  --chat-input-focus-shadow: 0 0 0 2px var(--focus-ring);
  --chat-button-border: var(--border);
  --chat-button-border-width: 1px;
  --chat-button-radius: var(--radius-full);
  --chat-button-shadow: none;
  --chat-attach-bg: var(--button-secondary-bg);
  --chat-attach-text: var(--button-secondary-text);
  --chat-attach-hover-bg: var(--surface-raised);
  --chat-attach-hover-text: var(--button-secondary-text);
  --chat-send-only-bg: var(--button-secondary-bg);
  --chat-send-only-text: var(--button-secondary-text);
  --chat-send-only-hover-bg: var(--surface-raised);
  --chat-send-only-hover-text: var(--button-secondary-text);
  --chat-send-bg: var(--button-primary-bg);
  --chat-send-text: var(--button-primary-text);
  --chat-send-border: var(--button-primary-bg);
  --chat-send-hover-bg: var(--button-primary-hover-bg);
  --chat-send-hover-text: var(--button-primary-text);
  --chat-send-hover-border: var(--button-primary-hover-bg);
}

/* ==================== 页面与壁纸 ==================== */
/* .chat-page 是实际聊天容器，不要写成 #conv-screen .chat-page。 */
.chat-page {
  background: var(--chat-page-bg);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  color: var(--chat-text);
}
.cv-header,
.chat-header,
.header { background: var(--chat-header-bg); color: var(--chat-text); }
.header-title,
.header-title-name { color: var(--chat-text); }
.header-title-avatar,
.user-avatar,
.ai-avatar { border-radius: 50%; }
.character-status { color: var(--accent); }

/* ==================== 消息区域 ==================== */
.cv-messages-list { background: var(--chat-message-list-bg); color: var(--chat-text); }
.chat-timestamp,
.chat-timestamp__label,
.msg-meta-header,
.msg-meta-name,
.msg-meta-date,
.msg-meta-time { color: var(--chat-muted-text); }
.chat-timestamp__label { background: var(--surface-muted); }
.msg-meta-divider { border-color: var(--chat-divider); }

/* ==================== 气泡 ==================== */
.chat-bubble-self {
  background: var(--chat-user-bg);
  color: var(--chat-user-text);
  border: var(--chat-bubble-border-width) var(--chat-bubble-border-style) var(--chat-bubble-border);
  border-radius: 14px;
  box-shadow: none;
}
.chat-bubble-self * { color: var(--chat-user-text); }
.chat-bubble-other {
  background: var(--chat-ai-bg);
  color: var(--chat-ai-text);
  border: var(--chat-bubble-border-width) var(--chat-bubble-border-style) var(--chat-bubble-border);
  border-radius: 14px;
  box-shadow: none;
}
.chat-bubble-other * { color: var(--chat-ai-text); }
.voice-message-bar.chat-bubble-self,
.transfer-card { background: var(--chat-user-bg); color: var(--chat-user-text); }
.voice-message-bar.chat-bubble-self *,
.transfer-card * { color: var(--chat-user-text); }
.voice-message-bar.chat-bubble-other,
.received-transfer-card { background: var(--chat-ai-bg); color: var(--chat-ai-text); }
.voice-message-bar.chat-bubble-other *,
.received-transfer-card * { color: var(--chat-ai-text); }

/* 连续消息分组：只有 top 渲染尾巴和装饰。 */
.msg-group-top.chat-bubble-self,
.msg-group-top.chat-bubble-other { border-radius: 14px; }
.msg-group-middle.chat-bubble-self,
.msg-group-middle.chat-bubble-other { border-radius: 4px; }
.msg-group-bottom.chat-bubble-self,
.msg-group-bottom.chat-bubble-other {
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  border-bottom-left-radius: 14px;
  border-bottom-right-radius: 14px;
}

/* ==================== Portal 尾巴与气泡装饰 ==================== */
/* 尾巴没有默认视觉样式，形状、大小、颜色和位置由用户 CSS 决定。 */
.cv-bubble-tip-portal-layer,
.cv-bubble-tip-portal { pointer-events: none; overflow: visible; }
.bubble-tip { position: absolute; z-index: 10; }
.bubble-deco-wrapper { position: relative; overflow: visible; }
.bubble-deco { position: absolute; z-index: 20; overflow: visible; pointer-events: none; }

/* ==================== 引用消息 ==================== */
.message-quote-reply-wrapper,
.message-quote-reply-wrapper--self,
.message-quote-reply-wrapper--other { color: var(--chat-text); }
.message-quote__header,
.message-quote__content,
.message-quote__reply-body { color: inherit; }

/* ==================== 底部输入栏 ==================== */
.cv-footer,
.chat-input-area { color: var(--chat-composer-text); }
.chat-composer--default,
.chat-composer--floating,
.chat-composer--liquid {
  background: var(--chat-composer-bg);
  border: var(--chat-composer-border-width) solid var(--chat-composer-border);
  border-radius: var(--chat-composer-radius);
  box-shadow: var(--chat-composer-shadow);
}
.chat-input,
.chat-composer__input {
  background: var(--chat-input-bg);
  color: var(--chat-input-text);
  border: var(--chat-input-border-width) solid var(--chat-input-border);
  border-radius: var(--chat-input-radius);
  box-shadow: var(--chat-input-shadow);
}
.chat-input::placeholder,
.chat-composer__input::placeholder { color: var(--chat-input-placeholder); }
.chat-input:focus,
.chat-composer__input:focus {
  border-color: var(--chat-input-focus-border);
  box-shadow: var(--chat-input-focus-shadow);
}

/* ==================== 底部按钮 ==================== */
.chat-composer__button,
.chat-composer__send-button {
  border: var(--chat-button-border-width) solid var(--chat-button-border);
  border-radius: var(--chat-button-radius);
  box-shadow: var(--chat-button-shadow);
}
.chat-composer__attach-button,
.cv-func-btn,
.toggle-tools-btn { background: var(--chat-attach-bg); color: var(--chat-attach-text); }
.chat-composer__attach-button:hover,
.chat-composer__button--open { background: var(--chat-attach-hover-bg); color: var(--chat-attach-hover-text); }
.chat-composer__send-only-button,
.cv-send-only-btn { background: var(--chat-send-only-bg); color: var(--chat-send-only-text); }
.chat-composer__send-only-button:hover:not(:disabled) { background: var(--chat-send-only-hover-bg); color: var(--chat-send-only-hover-text); }
.chat-composer__send-reply-button,
.send-button { background: var(--chat-send-bg); color: var(--chat-send-text); border-color: var(--chat-send-border); }
.chat-composer__send-reply-button:hover:not(:disabled),
.send-button:hover:not(:disabled) { background: var(--chat-send-hover-bg); color: var(--chat-send-hover-text); border-color: var(--chat-send-hover-border); }
.chat-composer__button:disabled { background: var(--button-disabled-bg); color: var(--button-disabled-text); opacity: 0.4; }

/* ==================== 可选图片按钮 ==================== */
/* 返回按钮和更多按钮默认已是透明底板，无需配置。 */
.cv-plus-icon svg,
.cv-send-only-icon svg,
.cv-send-reply-icon svg { display: none; }
.cv-plus-icon { background: url("加号按钮图片URL") center / contain no-repeat; }
.cv-send-only-icon { background: url("仅发送按钮图片URL") center / contain no-repeat; }
.cv-send-reply-icon { background: url("发送回复按钮图片URL") center / contain no-repeat; }
`;

/* The legacy template remains referenced only to keep old persisted code compatible. */
void CHARACTER_CSS_EXAMPLE_TEMPLATE;

const CHAT_ICON_FIELDS: Array<{ key: ChatIconKey; label: string }> = [
  { key: "image", label: "图片" }, { key: "voice", label: "语音" }, { key: "sticker", label: "表情" },
  { key: "redPacket", label: "红包" }, { key: "transfer", label: "转账" }, { key: "file", label: "文件" },
  { key: "location", label: "位置" }, { key: "call", label: "通话" }, { key: "plus", label: "加号" }, { key: "send", label: "发送" },
];

type ChatStylePreset = "default" | "floating-cute" | "liquid-glass";

/**
 * `default` is the inherited setting, not a character-level visual override.
 * Existing characters persisted it explicitly, so treating it as an override
 * prevented the global liquid-glass selection from ever reaching chat pages.
 */
export const resolveActiveChatStylePreset = (
  characterPreset: ChatStylePreset | undefined,
  globalPreset: ChatStylePreset | undefined,
): ChatStylePreset =>
  characterPreset && characterPreset !== "default"
    ? characterPreset
    : (globalPreset || "default");

const SettingsSwitch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-[42px] shrink-0 items-center rounded-full border-0 p-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 ${
      checked ? "bg-neutral-950" : "bg-[#E5E5EA]"
    }`}
  >
    <span
      className={`absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-200 ${
        checked ? "translate-x-[18px]" : "translate-x-0"
      }`}
    />
  </button>
);

const RenderAvatar = ({ 
  src, 
  alt, 
  name, 
  className, 
  onClick 
}: { 
  src: string; 
  alt: string; 
  name: string; 
  className: string; 
  onClick?: () => void 
}) => {
  const [failed, setFailed] = useState(false);
  
  const isEmoji = !src || (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("/") && !src.startsWith("."));
  
  if (failed || isEmoji) {
    const cleanName = (name || "👤").replace(/[\s\p{Emoji}\p{Extended_Pictographic}]+/gu, "").trim();
    const firstChar = cleanName ? cleanName.charAt(0) : (name ? name.charAt(0) : "👤");
    
    // Pick a deterministic background color based on name
    const colors = [
      "bg-rose-100 text-rose-700 border-rose-200",
      "bg-blue-100 text-blue-700 border-blue-200",
      "bg-amber-100 text-amber-700 border-amber-200",
      "bg-emerald-100 text-emerald-700 border-emerald-200",
      "bg-indigo-100 text-indigo-700 border-indigo-200",
      "bg-violet-100 text-violet-700 border-violet-200",
      "bg-teal-100 text-teal-700 border-teal-200",
      "bg-slate-100 text-slate-700 border-slate-200"
    ];
    let hash = 0;
    for (let i = 0; i < (name || "").length; i++) {
      hash = (name || "").charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorClass = colors[Math.abs(hash) % colors.length];

    return (
      <div 
        onClick={onClick}
        className={`${className} flex items-center justify-center font-bold text-sm border select-none cursor-pointer overflow-hidden ${colorClass}`}
      >
        {isEmoji && src ? (
          <span className="text-lg leading-none">{src}</span>
        ) : (
          <span className="text-[13px] tracking-tight">{firstChar}</span>
        )}
      </div>
    );
  }
  
  return (
    <img 
      src={src} 
      alt={alt} 
      onError={() => setFailed(true)}
      onClick={onClick}
      className={className}
    />
  );
};

const StoredChatImage = ({ assetId, alt, generated = false }: { assetId: string; alt: string; generated?: boolean }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    imageAssetDb.getImage(assetId).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((error) => console.warn("Failed to load chat image asset:", error));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId]);
  return url ? <img src={url} alt={alt} className={`max-w-[160px] rounded-lg object-cover cursor-zoom-in bg-stone-100 ${generated ? "border-0 shadow-none outline-none ring-0" : "border shadow-sm"}`} /> : <div className="h-24 w-28 animate-pulse rounded-lg bg-slate-100" />;
};

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
  offlineStories?: OfflineStory[];
  onSaveOfflineStory?: (story: OfflineStory) => void;
  onDeleteOfflineStory?: (storyId: string) => void;
  onDeleteCharacter?: (id: string, skipConfirm?: boolean) => void;
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
  localStorage.getItem(getOfflineModeStorageKey(relationId)) === "true";

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
  offlineStories = [],
  onSaveOfflineStory,
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
  const [activeTab, setActiveTab] = useState<"chats" | "contacts" | "moments" | "me">("chats");
  const diaryShareReplyInFlightRef = useRef<Set<string>>(new Set());

  // MiniMax Real-time TTS Playback States
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [audioLoadingMessageId, setAudioLoadingMessageId] = useState<string | null>(null);
  const [activeTtsAudio, setActiveTtsAudio] = useState<HTMLAudioElement | null>(null);
  const callSpeechQueueRef = useRef<Message[]>([]);
  const isCallSpeechPlayingRef = useRef(false);

  // Serial Playback Queue Manager
  const playNextMessageInQueue = (currentId: string) => {
    // Cancel consecutive/chained auto-playback completely
    setPlayingMessageId(null);
    setActiveTtsAudio(null);
  };

  // TTS Trigger Speech Function
  const triggerMessageSpeech = async (msg: Message, isQueuedCallSpeech = false) => {
    let queuedCallSpeechFinished = false;
    const finishQueuedCallSpeechOnce = () => {
      if (!isQueuedCallSpeech || queuedCallSpeechFinished) return;
      queuedCallSpeechFinished = true;
      finishQueuedCallSpeech();
    };

    // Guard: Prevent non-voice messages from being synthesized/played in standard chat layout
    const isVoice = Boolean(msg.content && (msg.content.startsWith("[语音") || msg.isVoiceMessage));
    if (!canPlayTtsMessage({ isOfflineModeActive, isVoiceMessage: isVoice, isQueuedCallSpeech })) {
      console.warn("Speech synthesis blocked: Message is not a voice message in chat layout");
      return;
    }

    if (playingMessageId === msg.id) {
      if (activeTtsAudio) {
        try {
          activeTtsAudio.pause();
        } catch (e) {
          console.error(e);
        }
      }
      if (voiceTimer) {
        clearInterval(voiceTimer);
        setVoiceTimer(null);
      }
      setPlayingMessageId(null);
      return;
    }

    if (activeTtsAudio && !isQueuedCallSpeech) {
      try {
        activeTtsAudio.pause();
      } catch (e) {
        console.error(e);
      }
      setActiveTtsAudio(null);
    }
    if (voiceTimer && !isQueuedCallSpeech) {
      clearInterval(voiceTimer);
      setVoiceTimer(null);
    }

    // "我" (user) 发送的语音不需要语音合成 (no TTS/MiniMax API calls for user voice messages)
    if (msg.sender === "user" && msg.content && msg.content.startsWith("[语音]|")) {
      setPlayingMessageId(msg.id);
      setAudioLoadingMessageId(null);
      
      const parts = msg.content.split("|");
      const duration = parseInt(parts[1] || "3", 10);
      let countdown = duration;
      
      const interval = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) {
          setPlayingMessageId(null);
          clearInterval(interval);
          setVoiceTimer(null);
        }
      }, 1000);
      
      setVoiceTimer(interval);
      return;
    }

    setPlayingMessageId(msg.id);
    setAudioLoadingMessageId(msg.id);
    let ttsProviderName = "MiniMax";

    try {
      const userSettings = settings;
      ttsProviderName = getTtsProvider(userSettings) === "mossland" ? "Mossland" : "MiniMax";

      const msgChar = resolveTtsCharacter(characters, msg.characterId, msg.senderId);
      const ttsOptions = buildCharacterTtsOptions(userSettings, msgChar);

      let cleanText = msg.content;
      if (cleanText.startsWith("[语音]|")) {
        const parts = cleanText.split("|");
        cleanText = parts.slice(2).join("|") || "";
      }
      cleanText = cleanText
        .replace(/\([^\)]*\)/g, "")
        .replace(/（[^）]*）/g, "")
        .trim();

      if (!cleanText) {
        setPlayingMessageId(null);
        setAudioLoadingMessageId(null);
        if (isQueuedCallSpeech) finishQueuedCallSpeechOnce();
        else playNextMessageInQueue(msg.id);
        return;
      }

      const blob = await getSpeechForText(cleanText, ttsOptions);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      setActiveTtsAudio(audio);
      setAudioLoadingMessageId(null);

      audio.onended = () => {
        if (isQueuedCallSpeech) finishQueuedCallSpeechOnce();
        else playNextMessageInQueue(msg.id);
      };

      audio.onerror = (e) => {
        console.warn("Audio playback error:", e);
        setPlayingMessageId(null);
        setAudioLoadingMessageId(null);
        if (isQueuedCallSpeech) finishQueuedCallSpeechOnce();
      };

      await audio.play();
    } catch (err: any) {
      console.warn("TTS generation failed:", err);
      setPlayingMessageId(null);
      setAudioLoadingMessageId(null);
      if (isQueuedCallSpeech) finishQueuedCallSpeechOnce();
      const detail = err instanceof Error ? err.message.replace(/\s+/g, " ").trim().slice(0, 120) : "";
      showToast(detail || `语音合成失败，请确认 ${ttsProviderName} 设置正确！`);
    }
  };

  const playNextQueuedCallSpeech = () => {
    if (isCallSpeechPlayingRef.current) return;
    const nextMessage = callSpeechQueueRef.current.shift();
    if (!nextMessage) return;
    isCallSpeechPlayingRef.current = true;
    triggerMessageSpeech(nextMessage, true);
  };

  const finishQueuedCallSpeech = () => {
    isCallSpeechPlayingRef.current = false;
    setPlayingMessageId(null);
    setActiveTtsAudio(null);
    window.setTimeout(playNextQueuedCallSpeech, 0);
  };

  const enqueueCallSpeech = (msg: Message) => {
    callSpeechQueueRef.current.push(msg);
    playNextQueuedCallSpeech();
  };

  // Visibility and Cleanup Effects
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (activeTtsAudio) {
          try {
            activeTtsAudio.pause();
          } catch (e) {
            console.error(e);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (activeTtsAudio) {
        try {
          activeTtsAudio.pause();
        } catch (e) {
          console.error(e);
        }
      }
    };
  }, [activeTtsAudio]);

  // Intercepting Wrapper for onSendMessage
  const onSendMessage = (msg: Message) => {
    let content = msg.content || "";
    // Normalize [语音: "text" (X秒)] or [语音: text] to standard [语音]|secs|text
    if (content.startsWith("[语音") && !content.startsWith("[语音]|")) {
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
      msg.content = `[语音]|${secs}|${text}`;
    }

    const isCallActive = activeAttachModal === "calling" && callingStatus === "connected";
    // A real voice call only carries spoken content. Drop sticker/image payloads
    // instead of showing or reading their markup as call subtitles.
    if (
      isCallActive &&
      msg.sender === "character" &&
      (/^\[(?:表情|贴图|图片)\]/.test(msg.content || "") || msg.content?.startsWith("data:image/"))
    ) {
      return;
    }

    // Call subtitles are private to the call screen. They are only persisted inside
    // the call record after hang-up, never mixed into the normal online timeline.
    if (isCallActive) {
      const subtitleContent = getCallTranscriptText(msg.content || "");
      setCallTranscript((prev) => [...prev, {
        id: msg.id,
        sender: msg.sender,
        content: subtitleContent,
        timestamp: msg.timestamp,
      }]);

      if (msg.sender === "character" && subtitleContent && settings.enableMiniMaxTts) {
        // TTS remains automatic during calls, but the call UI and saved transcript
        // always contain plain subtitles rather than voice-message markup.
        enqueueCallSpeech({ ...msg, content: subtitleContent });
      }
      return;
    }

    if (!activeCharacter?.isGroupChat) {
      if (!activeDirectScope) {
        console.warn("Direct message write blocked: no verified relationship scope.", msg.id);
        return;
      }
      const scopedMessage = attachDirectScope(msg, activeDirectScope);
      if (!scopedMessage) {
        console.warn("Direct message write blocked: message scope conflicts with the active relationship.", msg.id);
        return;
      }
      onSendMessageRaw(scopedMessage);
    } else {
      const { relationId: _relationId, ...groupMessage } = msg;
      onSendMessageRaw({
        ...groupMessage,
        conversationId: `group:${activeCharacter.id}`,
      });
    }

    // Normal chat remains manual-play only.
  };

  // Sticker groups state
  const [stickerGroups, setStickerGroups] = useState<StickerGroup[]>([]);
  const triggerCreateStickerGroupRef = useRef<(() => void) | null>(null);
  const [activeStickerGroupIndex, setActiveStickerGroupIndex] = useState<number>(0);
  const [showStickerSelector, setShowStickerSelector] = useState<boolean>(false);

  // Load sticker groups on mount
  useEffect(() => {
    const loadStickers = async () => {
      try {
        const groups = await stickerDb.getGroups();
        if (groups.length === 0) {
          const defaultGroup: StickerGroup = {
            id: "default-sticker-group",
            name: "默认分组",
            stickers: [],
          };
          await stickerDb.saveGroup(defaultGroup);
          setStickerGroups([defaultGroup]);
        } else {
          setStickerGroups(groups);
        }
      } catch (err) {
        console.error("Failed to load sticker groups:", err);
      }
    };
    loadStickers();
  }, []);

  // Initiated chats state to satisfy: unless user initiates chat or proactive message received, don't show thread
  const [initiatedChatIds, setInitiatedChatIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("phone_initiated_chat_ids");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("phone_initiated_chat_ids", JSON.stringify(initiatedChatIds));
    } catch (e) {
      console.error(e);
    }
  }, [initiatedChatIds]);

  // Keep track of initiated chats when a chat is opened
  useEffect(() => {
    const chatKey = activeChatRelationId || activeChatCharId;
    if (chatKey && !initiatedChatIds.includes(chatKey)) {
      setInitiatedChatIds((prev) => markChatInitiated(prev, chatKey));
    }
  }, [activeChatCharId, activeChatRelationId, initiatedChatIds]);

  // Unread messages tracking
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem("phone_last_read_timestamps");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("phone_last_read_timestamps", JSON.stringify(lastReadTimestamps));
    } catch (e) {
      console.error(e);
    }
  }, [lastReadTimestamps]);

  useEffect(() => {
    const chatKey = activeChatRelationId || activeChatCharId;
    if (chatKey) {
      setLastReadTimestamps((prev) => markChatRead(prev, chatKey, Date.now()));
    }
  }, [activeChatCharId, activeChatRelationId, messages.length]);

  const getUnreadCount = (chatKey: string) => {
    if (activeChatRelationId === chatKey || (!activeChatRelationId && activeChatCharId === chatKey)) return 0;
    const lastRead = lastReadTimestamps[chatKey] || 0;
    const charMsgs = messages.filter(
      (m) => (m.relationId === chatKey || (!m.relationId && m.characterId === chatKey)) && m.sender === "character" && !m.isOffline && m.timestamp > lastRead
    );
    return charMsgs.length;
  };

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
  const characterCustomChatCss = activeCharacter?.customChatCSS || activeCharacter?.customCss || "";
  // bubbleCss is the legacy preset field. Keep it as a scoped compatibility
  // source so existing user presets still work without leaking styles outside
  // the chat screen.
  const userCustomChatCss = [settings.bubbleCss, settings.chatGlobalCSS, characterCustomChatCss]
    .filter((css): css is string => Boolean(css && css.trim()))
    .join("\n");
  const hasUserCustomChatCss = userCustomChatCss.trim().length > 0;
  const scopedUserCustomChatCss = hasUserCustomChatCss
    ? prioritizeUserChatCss(scopeUserChatCss(userCustomChatCss))
    : "";

  // Keep the user stylesheet in the document cascade after the app's global
  // styles as well as inside the chat subtree.  The head copy is deliberately
  // scoped by scopeUserChatCss, so it cannot affect other applications.
  useEffect(() => {
    const styleId = "app-chat-user-custom-css";
    const existing = document.getElementById(styleId);
    if (!hasUserCustomChatCss) {
      existing?.remove();
      return;
    }
    const style = existing instanceof HTMLStyleElement
      ? existing
      : Object.assign(document.createElement("style"), { id: styleId });
    style.setAttribute("data-user-chat-css", "true");
    style.textContent = scopedUserCustomChatCss;
    if (!existing) document.head.appendChild(style);
    return () => {
      if (style.textContent === scopedUserCustomChatCss) style.remove();
    };
  }, [hasUserCustomChatCss, scopedUserCustomChatCss]);

  // Long-lived callbacks can outlive the render in which they were created.
  // Keep the latest character/settings available at the actual send boundary.
  const latestActiveCharacterRef = useRef<Character | undefined>(activeCharacter);
  const latestActiveRelationshipRef = useRef<CharacterRelationship | undefined>(activeRelationship);
  const latestMemoriesRef = useRef<MemoryItem[]>(memories || []);
  const pendingGroupWelcomeIdRef = useRef<string | null>(null);
  const consumedGroupWelcomeIdsRef = useRef(new Set<string>());
  latestActiveCharacterRef.current = activeCharacter;
  latestActiveRelationshipRef.current = activeRelationship;
  latestMemoriesRef.current = memories || [];
  const currentChatMessages = messages.filter((m) => !m.isOffline && (activeRelationship
    ? m.relationId === activeRelationship.id
    : m.characterId === activeChatCharId && activeCharacter?.isGroupChat));
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
  // Old records may contain model-facing scheduling metadata. Never render it
  // as a chat bubble, but retain the underlying history record untouched.
  const visibleChatMessages = currentChatMessages
    .map((message) => ({ ...message, content: stripInternalDeliveryMarkers(message.content) }))
    .filter((message) => Boolean(message.content.trim()));
  const getPendingOfflineHandoff = (): OfflineStory | undefined => {
    const pending = selectPendingOfflineHandoffStory({
      stories: offlineStories,
      relationId: activeRelationship?.id,
      characterId: activeRelationship?.characterId,
      conversationId: activeRelationship?.conversationId,
    });
    if (pending) return pending;

    // Upgrade stories completed shortly before this bridge schema existed (or
    // before their parent state update reached AppChat). This also repairs up
    // to three already-generated online replies after a missed first handoff.
    const now = Date.now();
    const recentUntrackedStory = [...offlineStories]
      .filter((story) => !story.onlineHandoff && story.mode === "continue" && Boolean(story.archivedAt))
      .filter((story) => story.relationId === activeRelationship?.id && story.characterId === activeRelationship?.characterId)
      .filter((story) => !activeRelationship?.conversationId || !story.conversationId || story.conversationId === activeRelationship.conversationId)
      .filter((story) => now - (story.archivedAt || 0) >= 0 && now - (story.archivedAt || 0) <= 2 * 60 * 60 * 1000)
      .filter((story) => currentChatMessages.filter((message) => message.sender === "character" && message.timestamp > (story.archivedAt || 0)).length <= 3)
      .sort((left, right) => (right.archivedAt || 0) - (left.archivedAt || 0))[0];
    if (!recentUntrackedStory) return undefined;
    const upgraded = createPendingOfflineHandoff({
      story: recentUntrackedStory,
      sourceMessages: getOfflineHandoffSourceMessagesForReturn(recentUntrackedStory),
      now: recentUntrackedStory.archivedAt,
    });
    if (!upgraded.onlineHandoff) return undefined;
    onSaveOfflineStory(upgraded);
    return upgraded;
  };
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
    const offlineStartedAt = story.onlineHandoff?.startedAt ?? story.createdAt;
    const previousOnlineAt = [...currentChatMessages]
      .filter((message) => message.timestamp < offlineStartedAt)
      .sort((left, right) => right.timestamp - left.timestamp)[0]?.timestamp;
    return buildPendingOfflineHandoffPromptBlock({
      story,
      characterName: activeCharacter?.remark || activeCharacter?.name || "当前角色",
      userName: settings.name || "用户",
      previousOnlineAt,
      currentOnlineAt,
      summaryMemory,
    });
  };
  const buildOfflineTimelineHandoff = (memory: MemoryItem, currentOnlineAt?: number): string => {
    const story = [...offlineStories]
      .filter((candidate) => candidate.relationId === activeRelationship?.id)
      .filter((candidate) => isOfflineStoryHandoffMemory(memory, candidate))
      .sort((left, right) => (right.archivedAt ?? right.updatedAt) - (left.archivedAt ?? left.updatedAt))[0];
    const offlineSourceMessages = story
      ? getOfflineMemorySourceMessages(story, { includeSynced: true })
      : [];
    const offlineStartedAt = offlineSourceMessages[0]?.timestamp ?? story?.createdAt ?? memory.timestamp;
    const previousOnlineAt = [...currentChatMessages]
      .filter((message) => message.timestamp < offlineStartedAt)
      .sort((left, right) => right.timestamp - left.timestamp)[0]?.timestamp;
    return buildOfflineHandoffTimelinePromptBlock({
      memory,
      story,
      previousOnlineAt,
      currentOnlineAt,
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
  const getChatIcon = (key: ChatIconKey): string | undefined => characterChatIcons[key] || globalChatIcons[key];
  const belongsToActiveIdentity = (ownerIdentityId?: string) =>
    (ownerIdentityId || "identity-1") === activeIdentityId;

  const [momentsFilterCharId, setMomentsFilterCharId] = useState<string | null>(null);
  const [isShowingCardModal, setIsShowingCardModal] = useState(false);
  const [advancedSettingsSection, setAdvancedSettingsSection] = useState<"memory" | "voiceImage" | "appearance" | null>(null);
  const isShowingAdvancedSettings = advancedSettingsSection !== null;
  const advancedSettingsTitle = advancedSettingsSection === "memory"
    ? "记忆设置"
    : advancedSettingsSection === "voiceImage"
      ? "语音图片"
      : advancedSettingsSection === "appearance"
        ? "美化样式"
        : "设置";
  const [singleCharacterMomentsId, setSingleCharacterMomentsId] = useState<string | null>(null);
  const [isShowingAddFriendDialog, setIsShowingAddFriendDialog] = useState(false);
  const [innerVoiceRecord, setInnerVoiceRecord] = useState<InnerVoiceRecord | null>(null);
  const [innerVoiceCharacter, setInnerVoiceCharacter] = useState<Character | null>(null);
  const [innerVoiceMode, setInnerVoiceMode] = useState<"current" | "history">("current");
  const [innerVoiceLoading, setInnerVoiceLoading] = useState(false);
  const [innerVoiceError, setInnerVoiceError] = useState<string | null>(null);
  const [innerVoiceHistory, setInnerVoiceHistory] = useState<InnerVoiceRecord[]>([]);
  const innerVoiceRequestsRef = useRef(new Set<string>());

  const closeInnerVoice = () => {
    setInnerVoiceRecord(null);
    setInnerVoiceCharacter(null);
    setInnerVoiceMode("current");
    setInnerVoiceError(null);
  };

  const getInnerVoiceEmotion = (record: InnerVoiceRecord) =>
    record.emotionalState?.trim() || `当前情绪：${record.state || "难以言说的心绪"}`;

  const openInnerVoice = async (targetCharacterId: string, triggerMessage: Message) => {
    const canonicalCharacterId = resolveCanonicalCharacterId(targetCharacterId, characters);
    const character = characters.find((item) => item.id === canonicalCharacterId);
    if (!character) return;

    const relationId = activeRelationship?.id;
    const groupId = relationId ? undefined : activeCharacter?.isGroupChat ? activeCharacter.id : undefined;
    const conversationId = relationId
      ? activeRelationship!.conversationId
      : triggerMessage.conversationId || groupId;
    if (!conversationId || (!relationId && !groupId)) return;
    const scope: InnerVoiceScope = relationId
      ? { kind: "direct", relationId, messageId: triggerMessage.id }
      : { kind: "group", groupId: groupId!, conversationId, characterId: canonicalCharacterId, messageId: triggerMessage.id };
    const listHistory = (records: readonly InnerVoiceRecord[]) => relationId
      ? listInnerVoicesByRelation(records, relationId)
      : listInnerVoicesByGroup(records, groupId!, conversationId, canonicalCharacterId);

    setInnerVoiceCharacter(character);
    setInnerVoiceMode("current");
    setInnerVoiceError(null);
    const stored = loadInnerVoiceRecords([]).value;
    const existing = findInnerVoiceByMessage(stored, scope);
    setInnerVoiceHistory(listHistory(stored));
    if (existing) {
      setInnerVoiceRecord(existing);
      setInnerVoiceLoading(false);
      return;
    }

    setInnerVoiceRecord(null);
    const requestKey = relationId ? `direct:${relationId}:${triggerMessage.id}` : `group:${groupId}:${canonicalCharacterId}:${triggerMessage.id}`;
    if (innerVoiceRequestsRef.current.has(requestKey)) return;
    innerVoiceRequestsRef.current.add(requestKey);
    setInnerVoiceLoading(true);
    try {
      const recentMessages = messages.filter((message) => activeRelationship
        ? message.relationId === activeRelationship.id
        : message.characterId === groupId && activeCharacter?.isGroupChat,
      );
      const latestOfflineMemory = relationId
        ? selectFreshOfflineHandoffMemory({
          memories: memories || [],
          relationId,
          queryText: triggerMessage.content,
        })
        : undefined;
      const pendingOfflineStory = relationId ? getPendingOfflineHandoff() : undefined;
      const offlineContinuityContext = pendingOfflineStory
        ? buildPendingOfflineTimelineHandoff(
          pendingOfflineStory,
          triggerMessage.timestamp,
          latestOfflineMemory && isOfflineStoryHandoffMemory(latestOfflineMemory, pendingOfflineStory)
            ? latestOfflineMemory
            : undefined,
        )
        : latestOfflineMemory
          ? buildOfflineTimelineHandoff(latestOfflineMemory, triggerMessage.timestamp)
          : undefined;
      const generated = await generateInnerVoice({
        character,
        relationship: activeRelationship,
        triggerMessage,
        recentMessages,
        conversationId,
        relationId,
        groupId,
        settings,
        offlineContinuityContext,
        worldBookEntries,
      });
      if (!generated) {
        setInnerVoiceError("心声生成结果无效，请稍后重试。");
        return;
      }
      if (character.enableAutoTranslate) {
        try {
          const translated = await apiTranslate({
            text: generated.content,
            apiKey: settings.apiKey || "",
            model: settings.selectedModel,
            apiEndpoint: settings.apiEndpoint,
          });
          if (translated.text && translated.text !== generated.content) generated.translation = translated.text;
        } catch (error) {
          console.warn("Inner voice translation failed:", error);
        }
      }
      // Re-read before saving so the character/message pair remains unique across repeated taps.
      const latest = loadInnerVoiceRecords([]).value;
      const cached = findInnerVoiceByMessage(latest, scope);
      const record = cached || generated;
      if (!cached) saveInnerVoiceRecords([...latest, record]);
      setInnerVoiceRecord(record);
      setInnerVoiceHistory(listHistory(cached ? latest : [...latest, record]));
    } catch (error) {
      console.error("Inner voice generation failed:", error);
      setInnerVoiceError("暂时无法生成心声，不影响正常聊天。");
    } finally {
      innerVoiceRequestsRef.current.delete(requestKey);
      setInnerVoiceLoading(false);
    }
  };

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

  const handleDeleteFriend = () => {
    if (!activeCharacter || activeCharacter.isGroupChat) return;

    const friendName = activeCharacter.remark || activeCharacter.name;
    if (!window.confirm(`确定删除好友“${friendName}”吗？与该好友的聊天、朋友圈、记忆和线下剧本将一并删除，且无法恢复。`)) {
      return;
    }

    // Recovery path: a previously merged/deleted relationship can leave an
    // open direct-chat entry with only its relation ID in navigation state.
    // It must still be removable without deleting the canonical Character.
    const currentIdentityRelation = relationForCharacter(activeCharacter.id);
    const relationToDelete = activeRelationship?.userIdentityId === activeIdentityId
      ? activeRelationship
      : currentIdentityRelation;
    const orphanRelationId = !relationToDelete && !activeRelationship && activeChatRelationId ? activeChatRelationId : undefined;
    if (!relationToDelete && !orphanRelationId) {
      showToast("找不到当前身份的好友关系，无法执行安全清理。");
      return;
    }
    const friendId = activeCharacter.id;
    const relationId = relationToDelete?.id || orphanRelationId!;
    // A contact deletion removes only this identity's direct relationship. The
    // canonical Character and sibling relationships must remain untouched.
    clearMessagesAndLinkedArtifacts(friendId, relationId);
    removeCharacterLifeEventsForRelations([relationId]);
    removeCharacterTruthForRelations([relationId]);
    removeProactiveTopicsForRelations([relationId]);
    onDeleteMomentsByRelation?.(relationId);
    onSaveRelationships(relationships.filter((relation) => relation.id !== relationId));
    const innerVoices = loadInnerVoiceRecords([]).value;
    const remainingInnerVoices = removeInnerVoicesByRelation(innerVoices, relationId);
    if (remainingInnerVoices.length !== innerVoices.length) saveInnerVoiceRecords(remainingInnerVoices);
    const imageRecords = loadImageGenerationRecords([]).value;
    const removedImageRecords = imageRecords.filter((record) => record.relationId === relationId);
    if (removedImageRecords.length) {
      saveImageGenerationRecords(removeImageGenerationRecordsByRelation(imageRecords, relationId));
      removedImageRecords.forEach((record) => imageAssetDb.deleteImage(record.imageAssetId).catch((error) => console.warn("Failed to delete relation image asset:", error)));
    }
    onSaveMemories(memories.filter((memory) => memory.relationId !== relationId));
    const diaryCleanup = cleanupDiaryForRelations({
      relationIds: [relationId],
      entries: loadDiaryEntries().value,
      shares: loadDiaryShares().value,
      tasks: loadDiaryGenerationTasks().value,
      translations: loadDiaryTranslations().value,
    });
    saveDiaryEntries(diaryCleanup.entries);
    saveDiaryShares(diaryCleanup.shares);
    saveDiaryGenerationTasks(diaryCleanup.tasks);
    saveDiaryTranslations(diaryCleanup.translations);
    setRedPacketStatuses((previous) => {
      const next = removePaymentStatusesByRelation(previous, relationId);
      localStorage.setItem(RED_PACKET_STATUSES_KEY, JSON.stringify(next));
      return next;
    });
    onDeleteRelationshipMusic?.(relationId);
    const forumShares = loadForumShares().value;
    const remainingForumShares = removeForumSharesByRelation(forumShares, relationId);
    const forumThreads = loadForumThreads().value;
    const forumReplies = loadForumReplies().value;
    const forumMutation: { shares?: typeof forumShares; threads?: typeof forumThreads; replies?: typeof forumReplies; generationTasks?: ReturnType<typeof loadForumGenerationTasks>["value"]; actorStates?: ReturnType<typeof loadForumActorStates>["value"]; activityTasks?: ReturnType<typeof loadForumActivityTasks>["value"] } = {};
    if (remainingForumShares.length !== forumShares.length) forumMutation.shares = remainingForumShares;
    const unlinkedForumThreads = unlinkForumPrivateAuthorByRelation(forumThreads, relationId);
    if (unlinkedForumThreads.some((thread, index) => thread !== forumThreads[index])) {
      forumMutation.threads = unlinkedForumThreads;
    }
    const unlinkedForumReplies = forumReplies.map((reply) =>
      reply.privateActor?.kind === "relationship" && reply.privateActor.relationId === relationId
        ? (() => { const { privateActor: _privateActor, ...publicReply } = reply; return publicReply; })()
        : reply);
    if (unlinkedForumReplies.some((reply, index) => reply !== forumReplies[index])) forumMutation.replies = unlinkedForumReplies;
    forumMutation.generationTasks = removeForumGenerationTasksByRelation(
      loadForumGenerationTasks().value,
      relationId,
    );
    forumMutation.actorStates = loadForumActorStates().value.filter((state) =>
      state.actor.kind !== "relationship" || state.actor.relationId !== relationId);
    forumMutation.activityTasks = loadForumActivityTasks().value.map((task) => ({
      ...task,
      pendingEvents: task.pendingEvents.filter((event) =>
        event.privateActor?.kind !== "relationship" || event.privateActor.relationId !== relationId),
    }));
    commitForumMutation(forumMutation);
    offlineStories
      .filter((story) => story.relationId === relationId)
      .forEach((story) => onDeleteOfflineStory?.(story.id));
    characters
      .filter((character) => character.isGroupChat && belongsToActiveIdentity(character.ownerIdentityId) && character.memberIds?.includes(friendId))
      .forEach((group) => onSaveCharacter({
        ...group,
        memberIds: group.memberIds?.filter((memberId) => memberId !== friendId),
      }));

    localStorage.removeItem(getOfflineModeStorageKey(relationId));
    localStorage.removeItem(getOfflineStoryStorageKey(relationId));
    proactiveMessageInFlightRef.current.delete(relationId);
    setInitiatedChatIds((previous) => previous.filter((id) => id !== relationId));
    setLastReadTimestamps((previous) => {
      const next = { ...previous };
      delete next[relationId];
      return next;
    });
    setIsShowingCardModal(false);
    setActiveChatCharId(null);
    setActiveChatRelationId(null);
  };

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
      return;
    }
    if (activeCharacter.isContactInstance) {
      const canonicalCharacterId = resolveCanonicalCharacterId(activeCharacter.id, characters);
      if (canonicalCharacterId !== activeCharacter.id) {
        setActiveChatCharId(canonicalCharacterId);
        return;
      }
      setActiveChatCharId(null);
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
    /* Legacy broad extraction retained below only as an inactive reference while
       location references use the conservative domain helper above.
    
    const latestWorldBookEntries = getLatestWorldBookEntries(worldBookEntries);

    const locations: string[] = [];
    
    // 1. Filter entries related to the current character
    const charEntries = latestWorldBookEntries.filter(
      (entry) => entry.characterId === activeCharacter.id
    );
    
    charEntries.forEach((entry) => {
      // Check if entry category is location-related, or title is a place
      const isLocCategory = ["地点", "地名", "地址", "位置", "场景", "场景设定", "场景信息", "空间"].includes(entry.category || "");
      const isLocTitle = /地点|地址|地名|位置|场所|场景|住所|公寓|工作室|办公室|大厅|飞船|星空|学校|家/i.test(entry.title || "");
      
      // If it's a location entry, the title itself is a perfect place name
      if (isLocCategory || isLocTitle) {
        if (entry.title && !locations.includes(entry.title)) {
          locations.push(entry.title);
        }
      }
      
      // Parse content for explicit address indicators: e.g. "地址：xxx", "位置：xxx", "地点：xxx"
      if (entry.content) {
        const lines = entry.content.split(/\r?\n/);
        lines.forEach((line) => {
          const match = line.match(/(?:地址|位置|地点|地名)[:：]\s*(.+)/);
          if (match && match[1]) {
            const val = match[1].trim();
            if (val && !locations.includes(val) && val.length < 50) {
              locations.push(val);
            }
          }
        });
      }
    });
    
    // 2. Also check global entries if specific character entries are empty or to enrich the list
    const globalEntries = latestWorldBookEntries.filter(
      (entry) => entry.characterId === "global"
    );
    globalEntries.forEach((entry) => {
      const isLocCategory = ["地点", "地名", "地址", "位置", "场景", "场景设定"].includes(entry.category || "");
      if (isLocCategory) {
        if (entry.title && !locations.includes(entry.title)) {
          locations.push(entry.title);
        }
      }
      
      if (entry.content) {
        const lines = entry.content.split(/\r?\n/);
        lines.forEach((line) => {
          const match = line.match(/(?:地址|位置|地点|地名)[:：]\s*(.+)/);
          if (match && match[1]) {
            const val = match[1].trim();
            if (val && !locations.includes(val) && val.length < 50) {
              locations.push(val);
            }
          }
        });
      }
    });

    // 3. Fallback to default locations if no locations extracted from World Book entries
    if (locations.length === 0) {
      if (activeCharacter.name.includes("陆沉砚")) {
        return [
          "陆沉砚的设计工作室「静空间」",
          "工作室一楼手绘写生区",
          "常德路12号人文概念展厅",
          "静溢半山私享住宅项目现场",
          "老街梧桐树下的街角咖啡馆",
          "落日湖畔的深夜写生露台"
        ];
      }
      return [
        "废墟图书馆总理大堂",
        "塞伯坦星巡航飞船第一总署",
        "星空银河系瞭望第十二哨站",
        "温馨小屋一楼客厅沙发",
        "繁华商业街中央喷泉广场",
        "静谧森林樱花树下"
      ];
    }
    
    return locations;
    */
  };

  // User profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [meActiveSubView, setMeActiveSubView] = useState<"none" | "identities" | "wallet" | "stickers" | "favorites">("none");
  const mainTabsViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "me") mainTabsViewportRef.current?.scrollTo({ top: 0 });
  }, [activeTab, meActiveSubView]);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [walletBalances, setWalletBalances] = useState<IdentityWalletBalances>(() =>
    loadIdentityWalletBalances(localStorage.getItem(IDENTITY_WALLET_BALANCES_KEY), localStorage.getItem("wechat_wallet_balance")));
  const walletBalance = walletBalances[activeIdentityId] || 0;
  const setWalletBalance = (update: number | ((previous: number) => number)) => {
    setWalletBalances((previous) => {
      const current = previous[activeIdentityId] || 0;
      const nextValue = typeof update === "function" ? update(current) : update;
      const next = { ...previous, [activeIdentityId]: nextValue };
      localStorage.setItem(IDENTITY_WALLET_BALANCES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const [editMyName, setEditMyName] = useState(settings.name);
  const [editMySignature, setEditMySignature] = useState(settings.signature);
  const [editMyBio, setEditMyBio] = useState(settings.bio);
  const [editMyAvatar, setEditMyAvatar] = useState(settings.avatar);
  const [editGlobalChatStylePreset, setEditGlobalChatStylePreset] = useState<"default" | "floating-cute" | "liquid-glass">("default");

  // Sync edits when isEditingProfile toggled
  useEffect(() => {
    if (isEditingProfile) {
      setEditMyName(settings.name);
      setEditMySignature(settings.signature);
      setEditMyBio(settings.bio);
      setEditMyAvatar(settings.avatar);
      setEditGlobalChatStylePreset(settings.globalChatStylePreset || "default");
    }
  }, [isEditingProfile, settings]);

  // Inputs
  // Reply requests can finish after the user has opened another conversation.
  // Keep their typing state attached to the captured conversation instead of
  // relabelling a global boolean with whichever contact is currently visible.
  const activeTypingScopeKey = getChatTypingScopeKey(activeRuntimeContext);
  const [typingByScope, setTypingByScope] = useState<ChatTypingScopeState<Character>>({});
  const setIsTyping = (isTyping: boolean) => {
    const capturedScopeKey = activeTypingScopeKey;
    setTypingByScope((previous) => setChatScopeTyping(previous, capturedScopeKey, isTyping));
  };
  const setTypingCharacterOverride = (character: Character | null) => {
    const capturedScopeKey = activeTypingScopeKey;
    setTypingByScope((previous) => setChatScopeCharacterOverride(previous, capturedScopeKey, character));
  };
  const visibleTypingState = getVisibleChatTyping<Character>(typingByScope, activeTypingScopeKey);
  const isTyping = Boolean(visibleTypingState);
  const typingCharacterOverride = visibleTypingState?.characterOverride || null;
  const [manualLocationText, setManualLocationText] = useState("");
  const [, setEmptyGreetingCheckedCharIds] = useState<string[]>([]);
  const [sentGreetings, setSentGreetings] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Offline Mode States (Inline Offline mode inside chat is disabled, transitioned to AppOffline)
  const isOfflineModeActive = false;
  const isInputNarration = false;
  const activeOfflineStoryId = null;
  const handleStartOfflineFromMsg = (msg: Message) => {
    if (!activeChatCharId || !activeCharacter) return;
    
    const charName = activeCharacter.remark || activeCharacter.name;
    const offlineParticipantIds = activeCharacter.isGroupChat
      ? (activeCharacter.memberIds || [])
      : [activeChatCharId];
    const offlineParticipantSet = new Set(offlineParticipantIds);
    // The direct menu action used to import only the clicked message. Snapshot
    // the whole configured context window so the offline scene has a real handoff.
    const contextLimit = activeCharacter.contextMemoryLimit || 20;
    const recentOnlineMessages = messages
      .filter((item) => !item.isOffline && (activeRelationship
        ? item.relationId === activeRelationship.id
        : item.characterId === activeChatCharId && activeCharacter?.isGroupChat))
      .slice(-contextLimit * 2);
    const sourceMessages = recentOnlineMessages.length > 0 ? recentOnlineMessages : [msg];
    const snapshotTimestamp = Date.now();
    const importedMessages = sourceMessages.map((item, index) => ({
      ...item,
      id: `offline-import-${snapshotTimestamp}-${index}-${item.id}`,
      isOffline: true,
      isImportedContext: true,
    }));
    const memberMemories = activeCharacter.isGroupChat
      ? buildOfflineMemberKnowledgeSnapshots({
          memberIds: offlineParticipantIds,
          characters,
          relationships,
          activeIdentityId,
          memories,
          claims: loadKnowledgeClaims().value,
        })
      : undefined;
    const importedContext: OfflineStory["importedContext"] = {
      messages: importedMessages,
      memories: activeRelationship
        ? memories.filter((memory) => memory.relationId === activeRelationship.id).map((memory) => memory.content)
        : [],
      ...(memberMemories ? { memberMemories } : {}),
      worldBook: getLatestWorldBookEntries(worldBookEntries || [])
        .filter((entry) => !entry.characterId || entry.characterId === "global" || entry.characterId === activeChatCharId || offlineParticipantSet.has(entry.characterId))
        .map((entry) => `${entry.title}: ${entry.content}`),
      importedAt: snapshotTimestamp,
    };

    const newStory: OfflineStory = {
      id: `story-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      characterId: activeChatCharId,
      relationId: activeRelationship?.id,
      conversationId: activeRelationship?.conversationId,
      // A group is only a container; the actual offline actors are its members.
      characterIds: offlineParticipantIds.length > 0 ? offlineParticipantIds : [activeChatCharId],
      title: `「${charName}」的聊天剧本 - ${new Date().toLocaleDateString()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: "continue",
      worldBookSnapshot: getLatestWorldBookEntries(worldBookEntries || [])
        .filter((entry) => !entry.characterId || entry.characterId === "global" || entry.characterId === activeChatCharId || offlineParticipantSet.has(entry.characterId)),
      knowledgeSnapshot: activeRelationship ? Array.from(new Set([
        ...loadKnowledgeClaims().value
          .filter((claim) => claim.relationId === activeRelationship.id
            && claim.characterId === activeRelationship.characterId
            && claim.userIdentityId === activeRelationship.userIdentityId
            && claim.status === "active"
            && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted"))
          .map((claim) => claim.statement),
        ...memories
          .filter((memory) => memory.relationId === activeRelationship.id && memory.isManual === true)
          .map((memory) => memory.content),
      ])) : [],
      sourceChatId: activeChatCharId,
      sourceChatMsgCount: importedMessages.length,
      importedContext,
      enableTimeAwareness: Boolean(activeCharacter.enableTimeAwareness),
      // Imported online chat is context only; the offline page starts with new story content.
      messages: []
    };
    
    if (onSaveOfflineStory) {
      onSaveOfflineStory(newStory);
    }
    
    if (activeRelationship) {
      localStorage.setItem(getOfflineModeStorageKey(activeRelationship.id), "true");
      localStorage.setItem(getOfflineStoryStorageKey(activeRelationship.id), newStory.id);
    }
    
    showToast("已无痛切换到线下故事模式");

    if (onNavigateToApp) {
      onNavigateToApp("offline");
    }
  };

  const handleTranslateMessage = (msg: Message) => {
    if (!onUpdateMessage) return;
    
    showToast("正在翻译中...");
    
    apiTranslate({
      text: msg.content,
      apiKey: settings.apiKey || "",
      model: settings.selectedModel,
      apiEndpoint: settings.apiEndpoint
    })
    .then(res => {
      if (res && res.text) {
        onUpdateMessage(msg.id, { translation: res.text }, msg);
        showToast("翻译完成");
      } else {
        showToast("翻译无结果");
      }
    })
    .catch(err => {
      console.error("Translate message failed:", err);
      showToast(err instanceof Error ? err.message : "翻译失败，请检查 API 配置");
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 1500);
  };

  const copyCssExampleTemplate = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCssTemplateCopied(true);
      showToast("CSS 模板已复制，可直接粘贴编辑");
      window.setTimeout(() => setCssTemplateCopied(false), 1500);
    } catch {
      showToast("复制失败，请手动选择占位符内容");
    }
  };

  const {
    momentInputText, setMomentInputText, momentAttachedImage, setMomentAttachedImage,
    momentTextImageDescription, setMomentTextImageDescription, showTextImageInput, setShowTextImageInput,
    viewingImageDescription, setViewingImageDescription, showMomentPublisher, setShowMomentPublisher,
    inlineCommentsTexts, setInlineCommentsTexts, showCommentInputMap, setShowCommentInputMap,
    replyingToCommentMap, setReplyingToCommentMap,
  } = useMomentComposerState();
  const [lastViewedMomentsTime, setLastViewedMomentsTime] = useState<number>(() => {
    return Number(localStorage.getItem("phone_last_viewed_moments_time") || "0");
  });

  // Group Chat States
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [pendingGroupWelcome, setPendingGroupWelcome] = useState<{ groupId: string; narration: Message } | null>(null);

  const {
    draftRemark, setDraftRemark, isEditingRemark, setIsEditingRemark, draftAvatar, setDraftAvatar,
    isDeleteMemberMode, setIsDeleteMemberMode, showAddMemberModal, setShowAddMemberModal,
    selectedAddMemberIds, setSelectedAddMemberIds, draftIsPinned, setDraftIsPinned,
    draftChatBg, setDraftChatBg, draftCustomCss, setDraftCustomCss, cssTemplateCopied, setCssTemplateCopied,
    draftChatIcons, setDraftChatIcons, draftChatStylePreset, setDraftChatStylePreset,
    draftEnableProactiveChat, setDraftEnableProactiveChat, draftEnableProactiveCall, setDraftEnableProactiveCall,
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
  const {
    showImageGenerator, setShowImageGenerator, imageRequestText, setImageRequestText,
    isGeneratingImage, setIsGeneratingImage, imageGenerationError, setImageGenerationError,
    showAttachPanel, setShowAttachPanel, activeAttachModal, setActiveAttachModal,
    voiceText, setVoiceText, callingStatus, setCallingStatus, callingDuration, setCallingDuration,
    isIncomingCall, setIsIncomingCall, setCallStartTime, callingInputText, setCallingInputText,
    callTranscript, setCallTranscript, voiceCallRelationId, setVoiceCallRelationId, callTranscriptEndRef,
    callRecordDetail, setCallRecordDetail, redPacketAmount, setRedPacketAmount,
    redPacketGreeting, setRedPacketGreeting, showRedPacketOpenModal, setShowRedPacketOpenModal,
    openRedPacketDetail, setOpenRedPacketDetail, isOpeningRedPacket, setIsOpeningRedPacket,
    setOpenTransferDetail, setShowTransferDetailModal, setOpenVoiceId, voiceTimer, setVoiceTimer,
  } = useChatAttachmentState();
  const [isManualArchiving, setIsManualArchiving] = useState<boolean>(false);

  const estimatedTokens = React.useMemo(() => {
    if (!activeCharacter) return { total: 0, context: 0, retrieval: 0, persona: 0 };
    // 1. System instructions & prompt rules
    const sysInstructionsLength = 1200;
    
    // 2. Persona definition
    const personaLength = (activeCharacter.name || "").length + 
                          (activeCharacter.backstory || "").length + 
                          (activeCharacter.personality || "").length +
                          (activeRelationship?.compressedMemory || "").length;
    
    // 3. Short term context (using current settings draft state for real-time update!)
    const slicedMsgsForPreview = currentChatMessages.slice(-draftContextMemoryLimit);
    const historyTextLength = slicedMsgsForPreview.reduce((sum, m) => sum + m.content.length, 0);
    
    // 4. Memory Vault items
    const activeMemories = (memories || []).filter((memory) => activeRelationship
      ? memory.relationId === activeRelationship.id
      : memory.characterId === activeCharacter.id && activeCharacter.isGroupChat);
    const topK = recallSettings?.recallCount || 5;
    const memoryCount = Math.min(topK, activeMemories.length);
    const memoryLength = activeMemories.slice(0, memoryCount).reduce((sum, m) => sum + m.content.length, 0);
    
    // Total character length
    const totalChars = sysInstructionsLength + personaLength + historyTextLength + memoryLength;
    
    // Convert to estimate
    const rawText = (activeCharacter.backstory || "") + (activeCharacter.personality || "");
    const chineseCharsCount = rawText.match(/[\u4e00-\u9fa5]/g)?.length || 0;
    const remainingCount = totalChars - chineseCharsCount;
    const tokenEstimate = Math.round(chineseCharsCount * 1.6 + remainingCount * 0.5);
    
    return {
      total: Math.max(250, tokenEstimate),
      context: Math.round(historyTextLength * 1.6),
      retrieval: Math.round(memoryLength * 1.6),
      persona: Math.round(personaLength * 1.6)
    };
  }, [draftContextMemoryLimit, activeCharacter, currentChatMessages, memories, recallSettings]);
  const [redPacketStatuses, setRedPacketStatuses] = useState<RedPacketStatusMap>((() => {
    try {
      const stored = localStorage.getItem(RED_PACKET_STATUSES_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })());

  const updateRedPacketStatus = (message: Message, status: RedPacketStatus) => {
    setRedPacketStatuses(prev => {
      const next = writeRedPacketStatus(prev, message, status);
      localStorage.setItem(RED_PACKET_STATUSES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const getRedPacketActualStatus = (message: Message) => {
    const savedStatus = readRedPacketStatus(redPacketStatuses, message, activeIdentityId === "identity-1");
    if (savedStatus === "claimed" || savedStatus === "refunded") {
      return savedStatus;
    }
    // Check if 24 hours (86400000 ms) have passed since timestamp
    const hours24 = 24 * 3600 * 1000;
    if (Date.now() - message.timestamp > hours24) {
      return "expired";
    }
    return savedStatus || "unclaimed";
  };

  // Dynamically auto-expire and refund user-sent red packets if they are expired and unclaimed
  useEffect(() => {
    let changed = false;
    const updatedStatuses = { ...redPacketStatuses };
    let refundAmountTotal = 0;

    const activeRelationIds = new Set(activeRelationships.map((relationship) => relationship.id));
    messages.filter((message) => message.relationId
      ? activeRelationIds.has(message.relationId)
      : Boolean(characters.find((character) => character.id === message.characterId && character.isGroupChat && belongsToActiveIdentity(character.ownerIdentityId))))
      .forEach((msg) => {
      if (isRedPacketMarkup(msg.content)) {
        const currentStatus = readRedPacketStatus(redPacketStatuses, msg, activeIdentityId === "identity-1") || "unclaimed";
        const isExpired = Date.now() - msg.timestamp > 24 * 3600 * 1000;
        
        if (isExpired && currentStatus === "unclaimed") {
          updatedStatuses[getPaymentStatusKey(msg)] = "expired";
          changed = true;

          // If the user sent it, refund the money to user's wallet
          if (msg.sender === "user") {
            const [_, amountStr] = msg.content.split("|");
            const amt = parseFloat(amountStr || "0");
            if (!isNaN(amt) && amt > 0) {
              refundAmountTotal += amt;
              updatedStatuses[getPaymentStatusKey(msg)] = "refunded";
            }
          }
        }
      }
    });

    if (changed) {
      setRedPacketStatuses(updatedStatuses);
      localStorage.setItem(RED_PACKET_STATUSES_KEY, JSON.stringify(updatedStatuses));
      if (refundAmountTotal > 0) {
        setWalletBalance(prev => {
          const next = prev + refundAmountTotal;
          return next;
        });
        showToast(`检测到有红包逾期未领，已自动退回 ¥${refundAmountTotal.toFixed(2)} 至您的零钱！🧧`);
      }
    }
  }, [messages, redPacketStatuses]);

  // Memory Compression and Proactive Chat states
  const [isCompressingMemory, setIsCompressingMemory] = useState(false);
  const proactiveMessageInFlightRef = useRef<Set<string>>(new Set());
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [showDisbandGroupModal, setShowDisbandGroupModal] = useState(false);
  const [, setEditingMemoryText] = useState("");

  // New features: Notes attachment, Quoting, Bubble Menu, Note Reader, OOC Annotation
  const [memoNotes, setMemoNotes] = useState<any[]>([]);
  const [activeMenuMsg, setActiveMenuMsg] = useState<Message | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [voicePlayed, setVoicePlayed] = useState<Record<string, boolean>>({});
  const [voiceTranscribed, setVoiceTranscribed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    activeTtsAudio?.pause();
    if (voiceTimer) clearInterval(voiceTimer);
    callSpeechQueueRef.current = [];
    isCallSpeechPlayingRef.current = false;
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
  }, [activeIdentityId, activeChatRelationId, activeChatCharId]);

  const [selectedFileNote, setSelectedFileNote] = useState<{ title: string; content: string } | null>(null);
  const [showOocCommentModal, setShowOocCommentModal] = useState<Message | null>(null);
  const [oocCommentText, setOocCommentText] = useState("");

  // Moments long-press popup menu and state
  const [momentContextMenu, setMomentContextMenu] = useState<{
    momentId: string;
    text: string;
    x: number;
    y: number;
    authorName: string;
    authorAvatar: string;
    isOwn: boolean;
    timestamp: number;
  } | null>(null);
  const [commentDeleteTarget, setCommentDeleteTarget] = useState<{ momentId: string; commentId: string } | null>(null);
  const commentLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressCommentClickRef = useRef(false);

  const [momentTranslations, setMomentTranslations] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("phone_moment_translations") || "{}");
    } catch {
      return {};
    }
  });

  const [momentFavorites, setMomentFavorites] = useState<{
    id: string;
    momentId: string;
    authorName: string;
    authorAvatar: string;
    content: string;
    timestamp: number;
  }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("phone_moment_favorites") || "[]");
    } catch {
      return [];
    }
  });

  const [favedTab, setFavedTab] = useState<"chats" | "moments">("chats");

  // Sync favorites & translations to localStorage when updated
  useEffect(() => {
    localStorage.setItem("phone_moment_translations", JSON.stringify(momentTranslations));
  }, [momentTranslations]);

  useEffect(() => {
    localStorage.setItem("phone_moment_favorites", JSON.stringify(momentFavorites));
  }, [momentFavorites]);

  useEffect(() => {
    if (activeAttachModal === "file") {
      const raw = localStorage.getItem("phone_memo_notes");
      if (raw) {
        try {
          setMemoNotes(JSON.parse(raw));
        } catch (e) {
          setMemoNotes([]);
        }
      } else {
        setMemoNotes([]);
      }
    }
  }, [activeAttachModal]);

  // Close attachment panel when switching chats
  useEffect(() => {
    setShowAttachPanel(false);
  }, [activeChatCharId]);

  // Sync last viewed moments time when entering moments tab or when new comments arrive while viewing moments
  useEffect(() => {
    if (activeTab === "moments") {
      const now = Date.now();
      setLastViewedMomentsTime(now);
      localStorage.setItem("phone_last_viewed_moments_time", now.toString());
    }
  }, [activeTab, moments]);

  // Sync editing memory text
  useEffect(() => {
    if (activeCharacter) {
      setEditingMemoryText(activeRelationship?.compressedMemory || "");
    }
  }, [activeCharacter, activeRelationship, isShowingCardModal]);

  // Relationship activity is persisted by the message boundary; never write it
  // back to the canonical character for a direct chat.
  useEffect(() => {
    if (!activeRelationship) return;
    const timestamp = Date.now();
    onSaveRelationships(touchRelationshipSession(relationships, activeRelationship.id, timestamp));
  }, [activeChatRelationId]);

  // Send character's custom opening speech / greeting if there are no messages in the chat history
  useEffect(() => {
    if (!activeChatCharId || !activeCharacter || (!activeCharacter.isGroupChat && !activeRelationship)) return;
    const chatKey = activeRelationship?.id || activeChatCharId;
    if (isOfflineStoryActiveFor(chatKey)) return;
    
    const currentChatMessages = messages.filter((message) => !message.isOffline && (activeCharacter.isGroupChat ? message.characterId === activeChatCharId : message.relationId === activeRelationship?.id));
    if (currentChatMessages.length > 0) return;

    if (activeCharacter.greeting && activeCharacter.greeting.trim()) {
      if (sentGreetings.includes(chatKey)) return;
      
      setSentGreetings(prev => [...prev, chatKey]);
      
      // Simulate realistic typing for the greeting message
      setIsTyping(true);
      const timer = setTimeout(() => {
        const charMsg: Message = {
          id: `msg-greeting-${Date.now()}`,
          characterId: activeChatCharId,
          relationId: activeRelationship?.id,
          conversationId: activeRelationship?.conversationId,
          sender: "character",
          content: activeCharacter.greeting!.trim(),
          timestamp: Date.now(),
        };
        onSendMessage(charMsg);
        setIsTyping(false);
      }, 1500);

      return () => {
        clearTimeout(timer);
        setIsTyping(false);
      };
    } else {
      // No custom greeting set. According to user instruction:
      // 如果没有开场白，则不主动发第一条信息，也不显示正在输入中。
    }
  }, [activeChatCharId, activeRelationship, activeCharacter, messages, onSendMessage, sentGreetings]);

  const updateRelationshipSession = (relationId: string, patch: Partial<CharacterRelationship>) => {
    onSaveRelationships(relationships.map((relation) => relation.id === relationId
      ? { ...relation, ...patch, updatedAt: Date.now() }
      : relation));
  };

  // Proactive contact catch-up on load (supports background clear / offline delivery)
  useEffect(() => {
    if (activeRelationships.length === 0) return;

    activeRelationships.forEach((relation) => {
      const friend = characters.find((character) => character.id === resolveCanonicalCharacterId(relation.characterId, characters));
      if (!friend || friend.isGroupChat) return;
      if (!friend.enableProactiveChat) return;
      if (isOfflineStoryActiveFor(relation.id)) return;

      // Only execute catch-up once per relationship per app session to avoid duplicates.
      if (processedCatchupsRef.current[relation.id]) return;
      processedCatchupsRef.current[relation.id] = true;

      const sched = relation.scheduledProactiveTime;
      const now = Date.now();

      if (!sched) {
        updateRelationshipSession(relation.id, { scheduledProactiveTime: scheduleNextProactiveMessage(friend) });
      } else if (sched < now) {
        const nextTime = scheduleNextProactiveMessage(friend);
        updateRelationshipSession(relation.id, { scheduledProactiveTime: nextTime, lastActiveTime: now });

        // Trigger the missed proactive message, backdated to the scheduled timestamp
        const missedTimeStr = new Date(sched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const catchupPrompt = `This is a catchup/missed message that was scheduled to be sent to the user at exactly ${missedTimeStr} today while they were offline/away. You are proactively initiating contact to check in on them, share something interesting about your day/life, or show your warmth. Keep it perfectly natural, spontaneous, and matching your character profile.`;
        
        triggerProactiveFor(relation.id, catchupPrompt, sched);
      }
    });
  }, [activeRelationships, characters, relationships]);

  // Background proactive check (every minute)
  useEffect(() => {
    const initialMomentCheck = setTimeout(() => {
      void checkAndTriggerCharacterMoments();
    }, 3000);
    const checkProactive = setInterval(() => {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const currentHM = `${hh}:${mm}`;

      activeRelationships.forEach((relation) => {
        const friend = characters.find((character) => character.id === resolveCanonicalCharacterId(relation.characterId, characters));
        if (!friend || friend.isGroupChat) return;
        if (!friend.enableProactiveChat) return;
        if (isOfflineStoryActiveFor(relation.id)) return;

        // 0. Guaranteed scheduled proactive contact check
        if (relation.scheduledProactiveTime && Date.now() >= relation.scheduledProactiveTime) {
          const nextTime = scheduleNextProactiveMessage(friend);
          updateRelationshipSession(relation.id, { scheduledProactiveTime: nextTime, lastActiveTime: Date.now() });
          triggerProactiveFor(relation.id);
          return; // Skip other checks
        }

        // 1. Check for agreed scheduled contact time FIRST
        const charMsgs = messagesRef.current.filter((message) => message.relationId === relation.id);
        const schedule = getScheduledContactTime(charMsgs, settings.name);

        if (schedule) {
          const lastMsg = charMsgs[charMsgs.length - 1];
          const isSilent = lastMsg ? (Date.now() - lastMsg.timestamp >= 2 * 60 * 1000) : true; // 2 minutes of silence limit so we don't interrupt active conversations

          // If the scheduled time has arrived AND no messages have been sent after the scheduled time, AND the user/character has been quiet for 2 minutes
          if (Date.now() >= schedule.triggerTime && (!lastMsg || lastMsg.timestamp < schedule.triggerTime) && isSilent) {
            const nextTime = scheduleNextProactiveMessage(friend);
            updateRelationshipSession(relation.id, { scheduledProactiveTime: nextTime, lastActiveTime: Date.now() });

            const customTaskText = `You and the user previously agreed that you would contact or chat with them after a certain amount of time (which has now passed). You are proactively initiating contact exactly as promised/agreed. Please follow up on what they went to do (e.g., if they went to eat lunch, ask how the food was or what they ate, or follow up on whatever other topic you were discussing), show concern, or start a fresh, warm conversation as promised, keeping it spontaneous, natural, and perfectly matching your character profile.`;

            triggerProactiveFor(relation.id, customTaskText);
            return; // Skip standard random proactive check for this friend
          }
        }

        // 2. Standard random proactive check
        const startTime = friend.proactiveStartTime || "09:00";
        const endTime = friend.proactiveEndTime || "22:00";

        // Helper to check if current time is within range
        let isWithinRange = false;
        if (startTime === endTime) {
          isWithinRange = true; // e.g., 00:00-00:00 covers all day
        } else if (startTime < endTime) {
          isWithinRange = currentHM >= startTime && currentHM <= endTime;
        } else {
          isWithinRange = currentHM >= startTime || currentHM <= endTime; // overnight e.g. 22:00 to 06:00
        }

        if (!isWithinRange) return;

        const lastActive = relation.lastActiveTime || (Date.now() - 4 * 60 * 60 * 1000);
        const cooldownMs = 2 * 60 * 60 * 1000; // 2 hours minimum cooldown since last conversation
        
        // Random probability: 0.5% chance per minute (approx once every 3.3 hours on average)
        const isRandomTrigger = Math.random() < 0.005;

        if (Date.now() - lastActive >= cooldownMs && isRandomTrigger) {
          // Reset timer/lastActiveTime first to avoid flooding
          const nextTime = scheduleNextProactiveMessage(friend);
          updateRelationshipSession(relation.id, { scheduledProactiveTime: nextTime, lastActiveTime: Date.now() });
          triggerProactiveFor(relation.id);
        }
      });

      // Run character moments check
      void checkAndTriggerCharacterMoments();
    }, 60000);
    return () => {
      clearTimeout(initialMomentCheck);
      clearInterval(checkProactive);
    };
  }, [activeRelationships, characters, moments, relationships]);

  // Calling timer
  useEffect(() => {
    let timer: any;
    if (activeAttachModal === "calling" && callingStatus === "connected") {
      timer = setInterval(() => {
        setCallingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallingDuration(0);
    }
    return () => clearInterval(timer);
  }, [activeAttachModal, callingStatus]);

  // Calls are direct-relationship sessions. Never let a session started by a
  // previous identity remain open after the active relationship changes.
  useEffect(() => {
    if (activeAttachModal !== "calling" || !voiceCallRelationId) return;
    if (isCurrentVoiceCallScope(voiceCallRelationId, activeVoiceCallScope)) return;

    if (activeTtsAudio) activeTtsAudio.pause();
    callSpeechQueueRef.current = [];
    isCallSpeechPlayingRef.current = false;
    setCallingStatus("ended");
    setCallingInputText("");
    setActiveAttachModal(null);
    setVoiceCallRelationId(null);
  }, [activeAttachModal, activeTtsAudio, activeVoiceCallScope?.relationId, voiceCallRelationId]);

  useEffect(() => {
    if (activeAttachModal !== "calling" || callingStatus !== "connected") return;
    requestAnimationFrame(() => {
      callTranscriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [callTranscript.length, activeAttachModal, callingStatus]);

  const beginVoiceCall = (incoming: boolean) => {
    if (!activeCharacter || activeCharacter.isGroupChat || !activeVoiceCallScope) return;
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

  const finishVoiceCall = (requestedStatus: VoiceCallStatus) => {
    if (!activeChatCharId || !isCurrentVoiceCallScope(voiceCallRelationId, activeVoiceCallScope)) {
      setActiveAttachModal(null);
      setVoiceCallRelationId(null);
      return;
    }
    const meaningfulTranscript = callTranscript.filter((item) => getCallTranscriptText(item.content || "").trim());
    const status: VoiceCallStatus = requestedStatus === "completed" && meaningfulTranscript.length === 0
      ? "cancelled"
      : requestedStatus;
    const mins = Math.floor(callingDuration / 60).toString().padStart(2, "0");
    const secs = (callingDuration % 60).toString().padStart(2, "0");
    const callRecord = createVoiceCallRecordMessage({
      id: `call-record-${Date.now()}`,
      characterId: activeChatCharId,
      scope: activeVoiceCallScope,
      sender: isIncomingCall ? "character" : "user",
      content: createCallRecordMarkup({
        callType: "语音通话",
        status,
        direction: isIncomingCall ? "incoming" : "outgoing",
        duration: `${mins}:${secs}`,
        transcript: meaningfulTranscript,
      }),
      timestamp: Date.now(),
    });
    onSendMessageRaw(callRecord);
    if (status === "completed" && activeDirectScope) {
      const claim = createDeterministicArtifactClaim({ message: callRecord, scope: activeDirectScope });
      if (claim && !appendKnowledgeClaim(claim).success) console.warn("Failed to capture voice-call knowledge claim.");
    }
    if (isIncomingCall && status !== "completed") {
      updateRelationshipSession(activeVoiceCallScope.relationId, createProactiveCallRejectionPatch(Date.now()));
    }
    if (activeTtsAudio) activeTtsAudio.pause();
    callSpeechQueueRef.current = [];
    isCallSpeechPlayingRef.current = false;
    setCallingStatus("ended");
    setCallingInputText("");
    setActiveAttachModal(null);
    setVoiceCallRelationId(null);
  };

  const endVoiceCall = () => finishVoiceCall(callingStatus === "connected" ? "completed" : "cancelled");

  // Resolve an outgoing invitation instead of making every character answer automatically.
  useEffect(() => {
    if (activeAttachModal !== "calling" || callingStatus !== "ringing" || isIncomingCall) return;
    const timer = window.setTimeout(() => {
      const resolution = resolveOutgoingCallResolution(Math.random());
      if (resolution === "connected") {
        setCallingStatus("connected");
        setCallStartTime(Date.now());
      } else {
        finishVoiceCall(resolution);
      }
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [activeAttachModal, callingStatus, isIncomingCall, voiceCallRelationId]);

  // An unanswered incoming call must end as a visible cancelled record.
  useEffect(() => {
    if (activeAttachModal !== "calling" || callingStatus !== "ringing" || !isIncomingCall) return;
    const timer = window.setTimeout(() => finishVoiceCall("cancelled"), 30 * 1000);
    return () => window.clearTimeout(timer);
  }, [activeAttachModal, callingStatus, isIncomingCall, voiceCallRelationId]);

  const sendVoiceCallMessage = () => {
    const text = callingInputText.trim();
    if (!activeChatCharId || !text || !isCurrentVoiceCallScope(voiceCallRelationId, activeVoiceCallScope)) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      characterId: activeChatCharId,
      relationId: activeVoiceCallScope.relationId,
      conversationId: activeVoiceCallScope.conversationId,
      sender: "user",
      content: text,
      timestamp: Date.now(),
    };
    onSendMessage(userMsg);
    generateResponseForUserMessage(userMsg);
    setCallingInputText("");
  };

  // Enabled contacts may call while their chat is open, with relationship-scoped
  // persistence, quiet-hours checks, daily limits and rejection backoff.
  useEffect(() => {
    if (!activeChatCharId || !activeCharacter || !activeRelationship || !activeVoiceCallScope || activeCharacter.isGroupChat || !activeCharacter.enableProactiveCall) return;
    const timer = setInterval(() => {
      if (activeAttachModal || isOfflineStoryActiveFor(activeVoiceCallScope.relationId)) return;
      const now = Date.now();
      const latestMessageAt = messagesRef.current
        .filter((message) => message.relationId === activeVoiceCallScope.relationId && !message.isOffline)
        .reduce((latest, message) => Math.max(latest, message.timestamp), 0) || undefined;
      if (!canTriggerProactiveVoiceCall({
        now,
        relation: activeRelationship,
        latestMessageAt,
        startTime: activeCharacter.proactiveStartTime,
        endTime: activeCharacter.proactiveEndTime,
        randomValue: Math.random(),
      })) return;
      updateRelationshipSession(activeVoiceCallScope.relationId, createProactiveCallTriggerPatch(activeRelationship, now));
      beginVoiceCall(true);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [activeChatCharId, activeCharacter?.enableProactiveCall, activeCharacter?.isGroupChat, activeCharacter?.proactiveStartTime, activeCharacter?.proactiveEndTime, activeAttachModal, activeIdentityId, activeVoiceCallScope?.relationId, activeRelationship?.lastProactiveCallAt, activeRelationship?.proactiveCallBackoffUntil, activeRelationship?.proactiveCallCount, activeRelationship?.proactiveCallDayKey]);

  const generateResponseForGroupChat = async (userMsg: Message | null, customHistoryOverride?: Message[]) => {
    if (!activeChatCharId || !activeCharacter) return;
    setIsTyping(true);
    let repliesScheduled = false;

    try {
      // Find all characters in this group chat
      const groupMembers = (activeCharacter.memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean) as Character[];
      if (groupMembers.length === 0) {
        setIsTyping(false);
        return;
      }

      // Initialize the typing avatar override with the first group member to avoid displaying the group's own avatar
      setTypingCharacterOverride(groupMembers[0]);

      // Collect chat messages in this group
      const sourceMsgs = customHistoryOverride || (userMsg ? [...currentChatMessages, userMsg] : [...currentChatMessages]);
      const uniqueMsgsMap = new Map<string, Message>();
      sourceMsgs.forEach(m => {
        if (m) uniqueMsgsMap.set(m.id, m);
      });
      const finalMsgs = Array.from(uniqueMsgsMap.values()).sort((a, b) => a.timestamp - b.timestamp);

      // Short-term real-time context limit: contextMemoryLimit (range 10~50, default 20), capped globally at 50
      const limit = Math.min(50, activeCharacter.contextMemoryLimit !== undefined ? activeCharacter.contextMemoryLimit : 20);
      const slicedMsgs = finalMsgs.slice(-limit);

      // Create a readable history for the AI, showing the user's name or character names as senders
      const historyText = slicedMsgs.map((m) => {
        const textImageDescription = parseTextImageDescription(m.content);
        const voiceHistory = formatVoiceMessageHistory(m.content);
        const content = textImageDescription ? `[文字图：${textImageDescription}]` : voiceHistory || m.content;
        if (m.sender === "user") {
          return `${settings.name} (机主): ${content}`;
        } else {
          const senderChar = groupMembers.find(c => c.id === m.senderId);
          const senderName = senderChar ? (senderChar.remark || senderChar.name) : (m.senderId || "成员");
          return `${senderName}: ${content}`;
        }
      }).join("\n");

      // Scan context for World Book triggers in group chat
      const scanContextParts = [
        userMsg ? userMsg.content : "",
        ...slicedMsgs.slice(-10).map(m => m.content)
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");

      // Query group-level worldbook entries
      const groupWbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], activeChatCharId || "", scanText, {
        scenario: "group",
        characterId: activeChatCharId || undefined,
      });
      const groupAtDepthInjections = new Map(groupWbBlocks.at_depth.map((entry) => [entry.sourceId, entry]));
      const memberAtDepthInjections = new Map<string, typeof groupWbBlocks.at_depth>();
      const includedWorldBookEntryIds = new Set(groupWbBlocks.allTriggered.map((entry) => entry.id));
      let groupWbText = groupWbBlocks.formattedAll ? `\n\n【微信群组整体背景设定 / 共同世界书规则】：\n${groupWbBlocks.formattedAll}\n` : "";
      if (resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).enableTimeAwareness) {
        groupWbText += `\n【当前现实时间】\n${formatLocalTimeContext()}\n`;
      }
      groupWbText += `\n${formatCharacterKnowledgeBoundary({ currentCharacterId: activeCharacter.id, groupMemberIds: groupMembers.map((member) => member.id) })}\n`;

      // Relation-private data is selected independently for each member and is
      // never promoted into the group-wide context.
      const groupKnowledgeClaims = loadKnowledgeClaims().value;
      const groupConversationSummaries = loadConversationSummaries().value;
      const groupBehaviorCorrections = loadBehaviorCorrections().value;

      const privateContextByMemberId = new Map<string, string>();
      // Public definitions are safe for the speaker router. Relation-private
      // blocks are retained separately and enter only that member's request.
      const publicMemberDefinitions = groupMembers.map((member, idx) => {
        const memberWbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], member.id, scanText, {
          scenario: "group",
          characterId: member.id,
        });
        memberWbBlocks.at_depth.forEach((entry) => groupAtDepthInjections.set(entry.sourceId, entry));
        memberAtDepthInjections.set(member.id, memberWbBlocks.at_depth);
        const memberOnlyWorldBook = memberWbBlocks.allTriggered
          .filter((entry) => entry.position !== "at_depth" && !includedWorldBookEntryIds.has(entry.id));
        memberOnlyWorldBook.forEach((entry) => includedWorldBookEntryIds.add(entry.id));
        const privateContext = buildGroupMemberPrivateContext({
          member,
          characters,
          relationships,
          activeIdentityId,
          memories: memories || [],
          claims: groupKnowledgeClaims,
          summaries: groupConversationSummaries,
          corrections: groupBehaviorCorrections,
          queryText: scanText,
          limit: recallSettings?.recallCount || 5,
        });
        if (privateContext) privateContextByMemberId.set(member.id, privateContext);
        const memberWbText = memberOnlyWorldBook.length
          ? `\n- 该角色专属世界书背景/日程/时间线设定:\n${memberOnlyWorldBook.map((entry) => `【设定 - ${entry.title}】\n${entry.content}`).join("\n\n")}`
          : "";
        return `[群聊成员 ${idx + 1}: ${member.name}]
- 角色人设/性格: ${member.personality}
- 背景设定: ${member.backstory}
- 与机主(${settings.name})的关系: 根据人设及世界观设定
${memberWbText}`;
      });
      const publicMembersDefText = publicMemberDefinitions.join("\n\n");

      // The first request is a public router only. Its generated text is never
      // displayed; only the selected, verified member identities are used.
      const routerSystemInstruction = buildGroupChatSystemInstruction({ userName: settings.name, userBio: settings.bio, groupName: activeCharacter.name, worldContext: groupWbText, memberDefinitions: publicMembersDefText });
      const promptMessage = buildGroupChatTaskMessage(historyText, Boolean(userMsg));
      const routerResult = await generateGroupChatTurn({
        prompt: {
          scenario: "group-chat",
          message: `${promptMessage}\n\n【本轮仅选择发言人】不要撰写正式回复。请选择本轮最自然会发言的 0—3 位成员，每位只输出占位内容“SELECT”，格式仍为 [SENDER_NAME: 角色原名]。`,
          history: [],
          systemInstruction: routerSystemInstruction,
          historyInjections: [...groupAtDepthInjections.values()],
        },
        settings,
        members: groupMembers,
        groupId: activeChatCharId,
        disableBracketActions: resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).disableBracketActions,
        createId: (index) => `group-route-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        currentTime: () => Date.now(),
      });
      const selectedMembers = Array.from(new Map(routerResult.members.map((member) => [member.id, member])).values()).slice(0, 3);
      const isolatedMessages: Message[] = [];
      const isolatedMembers: Character[] = [];
      let sameTurnPublicHistory = historyText;
      for (const member of selectedMembers) {
        const memberPrivateContext = privateContextByMemberId.get(member.id) || "";
        const publicDefinition = publicMemberDefinitions[groupMembers.findIndex((candidate) => candidate.id === member.id)] || "";
        const memberDefinitions = buildIsolatedGroupMemberDefinitions({
          publicDefinition,
          publicRoster: groupMembers.map((candidate) => candidate.name),
          privateContext: memberPrivateContext,
        });
        const memberLanguageInstruction = formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(
          member,
          [
            publicDefinition,
            ...getVisibleWorldBookEntries(worldBookEntries || [], member.id, {
              scenario: "group",
              characterId: member.id,
            }).map((entry) => `${entry.title}\n${entry.content}`),
          ],
        ));
        const memberSystemInstruction = `${buildGroupChatSystemInstruction({
          userName: settings.name,
          userBio: settings.bio,
          groupName: activeCharacter.name,
          worldContext: groupWbText,
          memberDefinitions,
        })}\n\n---\n\n${memberLanguageInstruction}`;
        const memberPrompt = `${buildGroupChatTaskMessage(sameTurnPublicHistory, Boolean(userMsg))}\n\n【单成员生成】本次请求只允许 ${member.name} 发言。可以保持沉默；若发言，每一条都必须使用 [SENDER_NAME: ${member.name}]，不得代替其他成员输出。`;
        const isolatedDepthInjections = new Map(groupWbBlocks.at_depth.map((entry) => [entry.sourceId, entry]));
        (memberAtDepthInjections.get(member.id) || []).forEach((entry) => isolatedDepthInjections.set(entry.sourceId, entry));
        const memberResult = await generateGroupChatTurn({
          prompt: {
            scenario: "group-chat",
            message: memberPrompt,
            history: [],
            systemInstruction: memberSystemInstruction,
            historyInjections: [...isolatedDepthInjections.values()],
          },
          settings,
          members: [member],
          groupId: activeChatCharId,
          disableBracketActions: resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).disableBracketActions,
          createId: (index) => `group-reply-${Date.now()}-${member.id}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          currentTime: () => Date.now(),
        });
        isolatedMessages.push(...memberResult.messages);
        isolatedMembers.push(...memberResult.members);
        if (memberResult.messages.length > 0) {
          sameTurnPublicHistory = [
            sameTurnPublicHistory,
            ...memberResult.messages.map((message) => `${member.remark || member.name}: ${message.content}`),
          ].filter(Boolean).join("\n");
        }
      }
      const groupResult = { messages: isolatedMessages, members: isolatedMembers };
      const persistPublicGroupTurn = (deliveredReplies: readonly Message[]) => {
        const additions = createGroupTurnMemories({
          group: activeCharacter,
          members: groupMembers,
          characters,
          relationships,
          activeIdentityId,
          userName: settings.name,
          userMessage: userMsg,
          replies: deliveredReplies,
          timestamp: Date.now(),
        });
        if (additions.length === 0) return;
        const merged = MemoryService.mergeMemories(latestMemoriesRef.current, additions);
        if (merged.length === latestMemoriesRef.current.length) return;
        latestMemoriesRef.current = merged;
        onSaveMemories(merged);
      };

      if (groupResult.messages.length > 0) {
        repliesScheduled = false;
        const validReplies = groupResult.messages.map((message, idx) => ({ message, member: groupResult.members[idx], idx }));

        if (validReplies.length > 0) {
          repliesScheduled = true;
          // Immediately set typing indicator override to the first actual speaker
          setTypingCharacterOverride(validReplies[0].member);
          setIsTyping(true);

          let currentIdx = 0;
          
          const sendNext = () => {
            if (currentIdx >= validReplies.length) {
              setIsTyping(false);
              setTypingCharacterOverride(null);
              return;
            }

            const currentItem = validReplies[currentIdx];
            
            // Set active typing character
            setTypingCharacterOverride(currentItem.member);
            setIsTyping(true);

            // Simulate typing for 1500ms
            setTimeout(() => {
              currentItem.message.timestamp = Date.now();
              onSendMessage(currentItem.message);

              currentIdx++;
              if (currentIdx < validReplies.length) {
                // Pre-set typing avatar for the next speaker, and take a 400ms pause
                setTypingCharacterOverride(validReplies[currentIdx].member);
                setIsTyping(false); 
                setTimeout(() => {
                  sendNext();
                }, 400);
              } else {
                setIsTyping(false);
                setTypingCharacterOverride(null);
                persistPublicGroupTurn(groupResult.messages);
              }
            }, 1500);
          };

          // Start sequence after brief buffer
          setTimeout(() => {
            sendNext();
          }, 500);
        }
      } else {
        persistPublicGroupTurn([]);
      }
    } catch (err) {
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

  const shouldConvertBubbleToVoice = (
    character: Character,
    lastUserMsg: Message | null,
    recentMsgs: Message[],
    bubbleIndex: number,
    bubbleText: string
  ): boolean => {
    return shouldAutomaticallyConvertTextToVoice({
      character,
      lastUserMessage: lastUserMsg,
      recentMessages: recentMsgs,
      bubbleIndex,
      bubbleText,
    });
  };

  const executeDirectReplyPipeline = async (
    userMsg: Message | null,
    customHistoryOverride?: Message[],
    cognitiveContext?: CharacterCognitiveContext,
    replyContext: ChatRuntimeContext = activeRuntimeContext,
  ) => {
    setIsTyping(true);
    // Resolve toggles from the latest props for every send. A queued callback
    // may have been created by an earlier render, so its captured character
    // must never decide the next prompt or output filtering.
    const turnCharacter = latestActiveCharacterRef.current || activeCharacter;
    const turnSettings = resolveChatTurnSettings(turnCharacter);
    let pendingOfflineHandoffForReply: OfflineStory | undefined;
    const isRedPacket = userMsg && isRedPacketMarkup(userMsg.content);
    if (isRedPacket) {
      const capturedMessage = userMsg!;
      const capturedRelationship = activeRelationship;
      const capturedCharacter = activeCharacter;
      // Simulate partner claiming after 3 seconds
      setTimeout(() => {
        if (capturedRelationship && !relationships.some((relationship) => relationship.id === capturedRelationship.id
          && relationship.userIdentityId === capturedRelationship.userIdentityId
          && relationship.characterId === capturedRelationship.characterId)) return;
        updateRedPacketStatus(capturedMessage, "claimed");
        
        const partnerName = capturedCharacter.remark || capturedCharacter.name;
        const claimNotification = capturedRelationship
          ? createCharacterTextMessage({
              id: `claim-notification-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              context: createChatRuntimeContext({ characterId: capturedRelationship.characterId, relationId: capturedRelationship.id, conversationId: capturedRelationship.conversationId || getConversationId(capturedRelationship.id), userIdentityId: capturedRelationship.userIdentityId }),
              content: `${partnerName}已拆开并领受了你的红包`, timestamp: Date.now(), isNarration: true,
            })
          : createGroupCharacterMessage({ id: `claim-notification-${Date.now()}`, characterId: capturedCharacter.id, content: `${partnerName}已拆开并领受了你的红包`, timestamp: Date.now(), isNarration: true });
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
      const uniqueMsgsMap = new Map<string, Message>();
      sourceMsgs.forEach(m => {
        if (m) uniqueMsgsMap.set(m.id, m);
      });
      const finalMsgs = Array.from(uniqueMsgsMap.values()).sort((a, b) => a.timestamp - b.timestamp);

      // Short-term real-time context limit: contextMemoryLimit (range 10~50, default 20), capped globally at 50
      const limit = Math.min(50, activeCharacter.contextMemoryLimit !== undefined ? activeCharacter.contextMemoryLimit : 20);
      
      // If userMsg is provided and is the last message in finalMsgs, exclude it from history because it will be passed as the separate 'message' parameter.
      const msgsForHistory = (userMsg && finalMsgs.length > 0 && finalMsgs[finalMsgs.length - 1].id === userMsg.id)
        ? finalMsgs.slice(0, -1)
        : finalMsgs;
      const isSameLocalDay = (left: number, right: number) => {
        const leftDate = new Date(left);
        const rightDate = new Date(right);
        return leftDate.getFullYear() === rightDate.getFullYear()
          && leftDate.getMonth() === rightDate.getMonth()
          && leftDate.getDate() === rightDate.getDate();
      };
      const latestHistoryMessage = msgsForHistory[msgsForHistory.length - 1];
      // With time awareness enabled, the first message on a new calendar day
      // starts a fresh live session. Yesterday's tail remains stored, but it is
      // no longer sent as the topic that the model should answer right now.
      const isCrossDayNewSession = turnSettings.enableTimeAwareness
        && Boolean(userMsg && latestHistoryMessage)
        && !isSameLocalDay(userMsg!.timestamp, latestHistoryMessage.timestamp);
      const slicedMsgs = msgsForHistory.slice(-limit);
      const requestTime = new Date();

      const history = slicedMsgs.flatMap((m) => {
        const callTurns = expandCallRecordHistory(m.content, m.timestamp, {
          userName: settings.name,
          characterName: activeCharacter.name,
        });
        if (callTurns) {
          return callTurns.map((turn) => ({
            role: turn.role,
            text: turnSettings.enableTimeAwareness
              ? formatHistoricalMessageForPrompt(turn.text, turn.timestamp, requestTime)
              : turn.text,
          }));
        }

        let contentText = m.content;
        const textImageDescription = parseTextImageDescription(contentText);
        if (textImageDescription) {
          contentText = `[文字图：${textImageDescription}]`;
        } else {
          contentText = formatVoiceMessageHistory(contentText) || contentText;
        }
        return {
          role: m.sender === "user" ? "user" : "model",
          text: turnSettings.enableTimeAwareness
            ? formatHistoricalMessageForPrompt(contentText, m.timestamp, requestTime)
            : contentText,
        };
      });

      let timeLogString = "";
      if (turnSettings.enableTimeAwareness) {
        const timeLogLines: string[] = [];
        let lastDayStr = "";
        
        slicedMsgs.forEach((m) => {
          const date = new Date(m.timestamp);
          const y = date.getFullYear();
          const mo = (date.getMonth() + 1).toString().padStart(2, '0');
          const d = date.getDate().toString().padStart(2, '0');
          const dayStr = `${y}-${mo}-${d}`;
          
          if (dayStr !== lastDayStr) {
            const wechatLabel = formatWeChatTimestamp(m.timestamp);
            timeLogLines.push(`\n=== 居中分割时间标签: 【${wechatLabel}】 ===`);
            lastDayStr = dayStr;
          }
          
          const fullTimeStr = `${y}-${mo}-${d} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          const senderName = m.sender === "user" ? "用户" : activeCharacter.name;
          let contentSnippet = m.content;
          const callHistory = formatCallRecordHistory(contentSnippet, {
            userName: settings.name,
            characterName: activeCharacter.name,
            includeTranscript: false,
          });
          if (callHistory) {
            contentSnippet = callHistory;
          } else if (contentSnippet.startsWith("[语音]|")) {
            const parts = contentSnippet.split("|");
            const secs = parts[1] || "5";
            const voiceText = parts.slice(2).join("|") || "";
            contentSnippet = voiceText ? `[语音消息: "${voiceText}" (${secs}秒)]` : `[语音消息: ${secs}秒]`;
          } else if (contentSnippet.length > 25) {
            contentSnippet = contentSnippet.slice(0, 25) + "...";
          }
          
          timeLogLines.push(`- ${senderName}: "${contentSnippet}" (发送于: ${fullTimeStr}${describeHistoricalRelativeTime(m.content, m.timestamp, requestTime)})`);
        });
        
        timeLogString = timeLogLines.join("\n");
      }

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
        : `You are playing the role of "${activeCharacter.name}" in a WeChat chat.
Reply length, initiative, warmth, restraint, and emotional intensity must follow the character profile and the current conversation. Keep the wording natural and conversational without imposing a universally cold, brief, caring, or agreeable style.
Incorporate your background, age, personality traits, nationality, and configured speaking language organically. Maintain character role-play thoroughly.
Do NOT say you are an AI or Gemini, unless that is your explicit character人设.
Show the character through what they say, not by explaining their own persona. For an ordinary greeting or short message, do not manufacture a dramatic scenario, claim an unconfirmed shared history, or narrate that you are “acting cool/talkative”; simply respond as this person would to this user.

🚨🚨🚨 [CRITICAL WECHAT CHAT RULES]:
1. You are in a direct online chat mode (线上聊天模式). You MUST reply using the correct WeChat message format.
2. [🚨 RED PACKET CAPABILITY / 对方发红包设定]: You have the capability to send WeChat red packets (微信红包) to the user as a cute gesture, appreciation, surprise, or interactive response. To send a red packet, output a single separate line matching the format exactly: "[红包]|金额|祝福语" (e.g. "[红包]|8.88|天天开心" or "[红包]|5.20|一生一世"). You can mix normal conversational dialogue messages and red packets. E.g. "给你塞个小红包，要开心哦！\n[红包]|6.66|天天开心".
${turnSettings.disableBracketActions
  ? `3. You are STRICTLY FORBIDDEN from outputting any third-person narration, physical scene descriptions, action descriptions, or character thoughts (坚决不要输出任何第三人称旁白、场景描写、动作描写或任何第三方叙事/心理描写).
4. Do NOT write like a novel or story script. You must ONLY output the direct spoken messages that "${activeCharacter.name}" would type in a chat box. No narratives, no brackets, no third-person descriptions at all.`
  : `3. If your character's backstory, personality card, or World Book entries naturally utilize parenthesized action descriptions or physical gestures (e.g., "(微笑)", "（叹气）", "*摸摸头*"), you are encouraged to output them inside brackets/parentheses to maintain realistic roleplay expressiveness. Keep them spontaneous, descriptive, and emotionally rich.`
}`;

      if (!isOfflineModeActive && turnSettings.disableBracketActions) {
        mainPromptText += `\n4. [🚨 CRITICAL FORMAT RULE]: Do NOT use any bracketed/parenthesized action descriptions, physical gestures, facial expressions, or ambient narration (e.g., "(微笑)", "（叹气）", "(摸摸头)", "*笑*", etc.) in your messages. You must interact using pure conversational speech/dialogue ONLY, without any action descriptions, unless such expressions are an absolute, unique signature part of how this specific character literally types/speaks. Maintain natural, realistic, text-message style dialogue.`;
      }

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

      const normalizeTopicText = (value: string) => value
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/[\s\p{P}\p{S}]+/gu, "")
        .toLowerCase();
      const currentTopicText = normalizeTopicText(userMsg?.content || "");
      const recentCallTopicText = normalizeTopicText(
        callTranscript.slice(-8).map((item) => item.content).join(" ")
      );
      const toTopicUnits = (value: string) => {
        if (value.length < 2) return value ? [value] : [];
        return Array.from(new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))));
      };
      const topicUnits = toTopicUnits(currentTopicText);
      const sharedTopicUnits = topicUnits.filter((unit) => recentCallTopicText.includes(unit)).length;
      const topicOverlap = topicUnits.length > 0 ? sharedTopicUnits / topicUnits.length : 1;
      const callTopicShiftDetected = isConnectedVoiceCall
        && callTranscript.length >= 2
        && currentTopicText.length >= 4
        && topicOverlap < 0.28;
      const shouldLoadLongTermMemory = (!isConnectedVoiceCall || callTopicShiftDetected)
        && !isCrossDayNewSession;

      // Recall memories from Memory Vault
      const topK = recallSettings?.recallCount || 5;
      const relevantMemories = shouldLoadLongTermMemory
        ? MemoryService.retrieveRelevantMemories({ characterId: activeChatCharId || "", relationId: activeRelationship?.id, queryText: userMsg ? userMsg.content : "", existingMemories: memories || [], limit: topK, scenario: "chat" })
        : [];
      const truthRetrieval = activeRelationship
        ? retrieveTruthForPrivatePrompt({
          scope: {
            relationId: activeRelationship.id,
            characterId: activeRelationship.characterId,
            userIdentityId: activeRelationship.userIdentityId,
            conversationId: activeRelationship.conversationId,
          },
          queryText: userMsg?.content || "",
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
      const latestOfflineContinuationMemory = selectFreshOfflineHandoffMemory({
        memories: memories || [],
        relationId: activeRelationship?.id,
        queryText: userMsg?.content,
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
          userText: userMsg.content,
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

      // Context-aware trigger scanning: current message plus roughly ten recent messages.
      const scanContextParts = [
        userMsg ? userMsg.content : "",
        ...currentChatMessages.slice(-10).map(m => m.content)
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");

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

      // 1.2 Red Packet Reaction Prompt
      if (isRedPacket && userMsg) {
        const [_, amountStr, greetingStr] = userMsg.content.split("|");
        const amount = amountStr || "8.88";
        const greeting = greetingStr || "恭喜发财，万事如意";
        assembledInstructions.push(`[🚨 特别行为指令：你刚刚收到了一个来自用户的微信红包！ 🚨]
你作为扮演的角色，刚刚在微信里收到了用户给你发来的红包！
- 红包金额：¥${amount}
- 红包留言：“${greeting}”

【行为及回复规则】：
1. 你已经拆开并领取了这个红包；只把金额和留言当作确定事实。
2. 角色可以感谢、调侃、迟疑、拒绝后续类似行为或作出其他反应，具体选择完全服从角色卡、既定关系和当前语境，不默认开心、感激、撒娇或亲密。
3. 只输出角色真正会发送的微信消息，不要提及“系统”“格式”或“指令”。`);
      }

      if (isCrossDayNewSession) {
        assembledInstructions.push(`[NEW-DAY CONVERSATION BOUNDARY]
The user's newest message starts a fresh conversation on a different calendar day. Yesterday's unfinished exchange is closed historical context, not the topic currently being continued.
Answer only the user's newest message as today's opening. Do not resume, answer, or elaborate on yesterday's last topic unless the user explicitly mentions it again.`);
      }

      // 1.5 Time awareness prompt if enabled (default to true to ensure correct time perception)
      if (turnSettings.enableTimeAwareness) {
        const timeStr = formatLocalTimeContext(requestTime);
        assembledInstructions.push(`[🚨 当前实时物理时间感知同步]
当前现实物理世界的时间是：${timeStr}。

以下是最近几条聊天消息的精确发送时间记录，请作为你判断时间流逝的客观依据：
${timeLogString}

【重要时间感知规则】：
0. 【避免时间模板】：时间信息首先用于避免把先后、跨天和间隔判断错。除非用户问到时间、跨天/长间隔确实改变当前语义，或角色人设本就会在此时主动提及，不要因为当前是中午、饭点、深夜等自动发起“吃饭／睡觉／天气”话题，也不要把时间当成通用寒暄。
1. 【精准判断时间跨度与间隔】：请通过上方的发送时间记录，精准识别出消息与消息之间间隔了多久。
   - 对比任何两条消息时，必须同时校验：年、月、日、时、分，不能只对比时分。
   - 两条消息不在同一天（跨天了）：必须判定为“长时间间隔”，视作很久以前的消息，你绝对不能说“刚才给你发了/刚发过”！
   - 两条消息同一天、间隔小于 5 分钟：判定为近期/短时间连续。
   - 两条消息同一天、间隔超过 5 分钟：判定为有一段时间没发（不属于短时间连续）。
   - 特别注意：如果前一条消息说的是“晚安要睡了”，而最新一句话是几小时后的清晨，这说明已经隔了一个晚上，开启了新的一天。是否问候、如何问候必须服从角色人设和双方关系，不能统一强制礼貌或亲密。
   - 如果上一条消息距今已过去数小时或数天，只在当前消息确实需要时体现时间流逝；不要强制追问行程、表达想念或套用固定寒暄。
2. 【自然融合，绝不机械重复时间】：请极度自然地融合这一时间感，像真实生活在此时此地的人一样表现。
3. 【🚨 极其重要】：上方时间仅是内部推理元数据，不是要发送给用户的内容。禁止在回复中输出或复述任何时间标签、时间戳、时钟气泡或前缀，包括但不限于 \`[发送时间: ...]\`、\`[15:10]\`、\`【15:10】\`。如果需要自然提到时间，只能把它写进完整对话句子中。回复必须保持干净，只输出角色真正要说的话。`);
      }

      // Voice timing is only relevant to a voice-related turn. Including it on
      // every ordinary text reply needlessly dilutes the role and relationship
      // anchor in the prompt.
      const isVoiceRelatedTurn = Boolean(
        userMsg && (
          userMsg.isVoiceMessage ||
          userMsg.content.startsWith("[语音]") ||
          userMsg.content.startsWith("[语音通话]")
        )
      );
      let voiceIntervalPrompt = "";
      const lastCharVoiceMsg = isVoiceRelatedTurn ? [...slicedMsgs]
        .reverse()
        .find(m => m.sender === "character" && (m.content.startsWith("[语音]") || m.isVoiceMessage)) : undefined;

      if (lastCharVoiceMsg) {
        const nowMs = Date.now();
        const lastVoiceMs = lastCharVoiceMsg.timestamp;
        const lastVoiceDate = new Date(lastVoiceMs);
        const nowDate = new Date(nowMs);
        
        const isSameDay = lastVoiceDate.getFullYear() === nowDate.getFullYear() &&
                          lastVoiceDate.getMonth() === nowDate.getMonth() &&
                          lastVoiceDate.getDate() === nowDate.getDate();
        
        const diffMinutes = (nowMs - lastVoiceMs) / (60 * 1000);
        
        let voiceIntervalLabel = "";
        let isLastVoiceOld = false;
        
        if (!isSameDay) {
          voiceIntervalLabel = "上一条语音消息是昨天或更早以前发送的（跨天长间隔，很久以前的消息）。";
          isLastVoiceOld = true;
        } else if (diffMinutes < 5) {
          voiceIntervalLabel = `上一条语音消息是在同一天内发送的，并且仅间隔了 ${Math.round(diffMinutes)} 分钟（同一天、间隔小于 5 分钟，判定为近期/短时间内连续）。`;
          isLastVoiceOld = false;
        } else {
          voiceIntervalLabel = `上一条语音消息是在同一天内发送的，但已间隔了 ${Math.round(diffMinutes)} 分钟（同一天、间隔超过 5 分钟，判定为有一段时间没发）。`;
          isLastVoiceOld = true;
        }

        const lastVoiceTextPart = lastCharVoiceMsg.content.startsWith("[语音]|")
          ? lastCharVoiceMsg.content.split("|").slice(2).join("|")
          : lastCharVoiceMsg.content;

        voiceIntervalPrompt = `[🚨 语音发送间隔及剧情记忆规则]
- 你（${activeCharacter.name}）上一次给用户发语音消息是在: ${new Date(lastVoiceMs).toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
- 上一条语音消息的内容是: "${lastVoiceTextPart.length > 30 ? lastVoiceTextPart.slice(0, 30) + "..." : lastVoiceTextPart}"
- **当前计算的时间关系**: ${voiceIntervalLabel}

【AI 剧情记忆判定及语音回复行为规则（最高执行优先级）】:
${isLastVoiceOld 
  ? `1. 【跨天长间隔/长间隔判定】: 上一条语音已经是较早的历史，不能以“刚发过一条”作为当前反应依据。是否发送、迟疑或拒绝以及具体口吻，完全服从角色人设、当前场合和双方关系。`
  : `1. 【同一天短时间连续索要】: 上一条语音确实刚发送不久，角色可以把这一事实纳入反应；是否调侃、拒绝或继续发送以及具体口吻，完全服从角色人设。`
}
2. 聊天历史中带有“居中分割时间标签”的分割条是视觉上的日期和时间断层标识，请通过它们辅助区分跨天长间隔。`;
      } else if (isVoiceRelatedTurn) {
        voiceIntervalPrompt = `[🚨 语音发送间隔及剧情记忆规则]
- 你（${activeCharacter.name}）在当前的历史聊天中还没有给用户发送过语音消息。
- 不得声称“刚给你发过”。是否配合、迟疑或拒绝以及具体语气，完全服从角色人设、当前场合和双方关系。`;
      }
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

      // Recent dialogue is already present in the role-correct history. Do not
      // copy it into a system block: duplicate user wording encourages parroting
      // and can swap first-person ownership on short replies.
      assembledInstructions.push(`[CURRENT-SCENE CONTINUITY]
Treat recently established activities, locations, physical conditions, possessions, promises, and relationship facts in the conversation history as true and still in effect.
- Never silently replace one activity with another. For example, if you just said you were sweaty from running, do not later say you just returned from cycling.
- If the activity, location, or situation really changes, first make the transition explicit and plausible (including time passing where needed). Do not call the new activity "just now" unless the transition has been established.
- When the history is unclear, avoid inventing a new concrete activity. Continue the existing topic or ask naturally instead.
- This continuity rule applies to every message in a multi-bubble reply as well.`);

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
        assembledInstructions.push(`[语音电话输出规则]
你正在和用户进行实时语音电话。只输出适合直接说出口的纯文字台词。
禁止发送表情包、贴图、图片、红包、转账、文件、位置或任何方括号附件标记；不要输出“[表情]”“[图片]”等描述。`);
        assembledInstructions.push(`[VOICE CALL MEMORY ROUTING]
1. Routing order: answer the user's newest sentence using the current call transcript and short online-chat lead-in before consulting older context.
2. Do not repeat, paraphrase, or restart an answer already spoken during this call. Compare against your recent call lines and add only new information or a natural follow-up.
3. Long-term archived memory is ${callTopicShiftDetected ? "available because the user shifted to a different topic; use only directly relevant facts" : "not loaded for this turn; stay with short-term live context"}.
4. Never force an old memory into the conversation merely because it exists. If the user's meaning is unclear, ask a brief natural question instead of replaying an earlier answer.`);
      } else if (allStickers1.length > 0 && /^\[表情\]\|/.test(userMsg?.content || "")) {
        const stickerListStr = allStickers1.map(s => `[表情]|${s.name}|${s.url}`).join("\n");
        assembledInstructions.push(`[🚨 特别表情包使用指示（Sticker Response Integration） 🚨]
用户刚刚发送了表情包；只有在符合上方频率限制、且表情包本身能表达即时反应、且不重复文字内容时，才可以单独一行发送表情包。除此之外不要使用任何表情包。
发送表情包的格式必须完全符合以下严格语法格式：
[表情]|表情名称|图片URL

以下是你可以无缝调用的自定义表情包列表（每一行对应一个表情包，你可以直接【一字不差地复制】下面的格式并输出它）：
${stickerListStr}

【强制输出规则】：
1. 绝对不允许胡编乱造不存在的表情包名称或图片URL！你只能从上面给出的列表中挑选！
2. 发送时格式必须极其严格：[表情]|名称|URL。不能有任何多余的字符。
3. 不要为了显示功能或凑热闹而发送表情包；不适合时只发送普通文字即可。`);
      }

      if (wbBlocks.allTriggered.length > 0) assembledInstructions.push(WORLD_BOOK_CONTEXT_PRIORITY);
      const systemInstruction = finalizeCharacterChatSystemInstruction({
        instructions: assembledInstructions,
        characterProjection,
        characterDescriptionText,
        diagnosticLabel: "direct chat prompt",
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
      let promptMessage = userMsg ? userMsg.content : "请继续续写我们的故事，继续推进剧情走向或日常对话交互。";
      if (promptMessage.startsWith("data:image/")) {
        promptMessage = `[发送图片/照片] 我给你发送了一张照片。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
      } else if (parseTextImageDescription(promptMessage)) {
        const description = parseTextImageDescription(promptMessage)!;
        promptMessage = `[发送文字图] 我发送了一张不含真实图片、仅用文字描述画面的文字图，描述内容是：“${description}”。请把它当作我主动分享的画面描述来回应，不要声称看到了真实照片。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
      } else if (promptMessage.startsWith("[红包]")) {
        const parts = promptMessage.split("|");
        const amount = parts[1] || "8.88";
        const greeting = parts[2] || "恭喜发财，万事如意";
        promptMessage = `[发送红包] 我给你发送了一个金额为 ${amount} 元的微信红包，祝福语是：“${greeting}”。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
      } else if (promptMessage.startsWith("[位置]")) {
        const parts = promptMessage.split("|");
        const loc = parts[1] || "位置";
        promptMessage = `[发送位置] 我给你分享了一个微信位置：[${loc}]。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
      } else if (promptMessage.startsWith("[音乐]")) {
        const parts = promptMessage.split("|");
        const title = parts[1] || "音乐";
        promptMessage = `[分享音乐] 我给你分享了一首音乐：《${title}》。这是一次线上音乐分享聊天。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}
禁止为了回应这次分享而补写地点、动作或双方共同场景，也不要新增未提供的现场状态。`;
      } else if (promptMessage.startsWith("[文件]")) {
        const parts = promptMessage.split("|");
        const title = parts[1] || "无标题";
        const fileContentRaw = parts[2] || "";
        let decodedContent = "";
        try {
          decodedContent = decodeURIComponent(fileContentRaw);
        } catch (e) {
          decodedContent = fileContentRaw;
        }
        promptMessage = `[分享文件] 我给你分享了一篇备忘录笔记，标题是《${title}》，内容如下：\n"""\n${decodedContent}\n"""\n请针对标题和具体内容回应。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
      } else if (promptMessage.startsWith("[视频通话]")) {
        const parts = promptMessage.split("|");
        const status = parts[1] || "已结束";
        promptMessage = `[视频通话结束] 刚才我们进行了视频通话（通话状态：${status}）。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
      } else if (promptMessage.startsWith("[语音通话]")) {
        const parts = promptMessage.split("|");
        const status = parts[1] || "已结束";
        promptMessage = `[语音通话结束] 刚才我们进行了语音通话（通话状态：${status}）。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
      } else if (promptMessage.startsWith("[语音]|")) {
        promptMessage = `${formatCurrentVoiceMessagePrompt(promptMessage)}\n${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
      } else if (promptMessage.startsWith("[表情]|")) {
        const parts = promptMessage.split("|");
        const stickerName = parts[1] || "表情";
        promptMessage = `[发送表情包] 我给你发送了一个表达当下状态或心情的表情包，名称是：“${stickerName}”。
【重要表情包处理规则】：
这个表情包只是我正常聊天时随性表达的状态、心情、气场或情绪。你【绝对不一定要】针对这个表情包特意进行点评、中断我们之前正在进行的话题、或者刻意为了回复这个表情而说多余的话（例如不要说“你发了个表情包”、“你表情包真多”这类废话）。
请你根据我们正在聊天的上下文话题或我们之前的对话脉络【极其自然、顺畅地继续对话】。如果当下适合，你也可以顺应氛围跟着发一个你自己的表情包，或者在文字对话里自然带过，保持微信好友日常聊天和斗图的真实、轻松感。`;
      }

      const data = await requestDirectChatTurn({
        prompt: { scenario: "direct-chat", message: promptMessage, history, systemInstruction, historyInjections: wbBlocks.at_depth },
        settings,
      });

      if (data && data.text) {
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
              id: `offline-reply-${Date.now()}-${pIdx}-${Math.random().toString(36).substr(2, 5)}`,
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
            const m = newMsgs[idx];
            setIsTyping(true);
            const chars = m.content.length;
            const duration = Math.max(800, Math.min(3500, chars * 100)) + (Math.floor(Math.random() * 500) - 200);
            await new Promise(resolve => setTimeout(resolve, Math.max(500, duration)));
            
            m.timestamp = Date.now();
            onSendMessage(m);
            setIsTyping(false);
            
            if (idx < newMsgs.length - 1) {
              await new Promise(resolve => setTimeout(resolve, Math.max(400, Math.floor(Math.random() * 400) + 400)));
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
            allowEmoji: mayCharacterUseEmoji({
              latestUserMessage: userMsg?.content,
              recentCharacterMessages: currentChatMessages
                .filter((message) => message.sender === "character" && message.characterId === activeChatCharId)
                .map((message) => message.content),
            }),
            createId: (idx) => `${Date.now()}-online-${idx}-${Math.random().toString(36).substr(2, 5)}`,
            currentTime: () => Date.now(),
            transformBubble: (bubbleText, idx) => {
              const isVoice = activeAttachModal !== "calling" && shouldConvertBubbleToVoice(activeCharacter, userMsg, messages, idx, bubbleText);
              if (!isVoice) return bubbleText;
              const secs = Math.max(1, Math.min(60, Math.ceil(bubbleText.length * 0.35 + 1.2)));
              return `[语音]|${secs}|${bubbleText}`;
            },
          });
          const createdMessages: Message[] = [];
          
          for (let idx = 0; idx < replyCandidates.messages.length; idx++) {
            const charMsg = replyCandidates.messages[idx];
            const bubbleText = replyCandidates.bubbleTexts[idx];
            
            setIsTyping(true);
            const chars = bubbleText.length;
            const duration = Math.max(800, Math.min(3500, chars * 100)) + (Math.floor(Math.random() * 500) - 200);
            await new Promise(resolve => setTimeout(resolve, Math.max(500, duration)));
            
            charMsg.timestamp = Date.now();
            onSendMessage(charMsg);
            createdMessages.push(charMsg);
            setIsTyping(false);
            
            if (idx < replyCandidates.messages.length - 1) {
              await new Promise(resolve => setTimeout(resolve, Math.max(400, Math.floor(Math.random() * 400) + 400)));
            }
          }

          if (createdMessages.length > 0) {
            recordPendingOfflineHandoffDelivery(pendingOfflineHandoffForReply);
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
        const errMsg = createCharacterTextMessage({
          id: (Date.now() + 1).toString(),
          context: replyContext,
          content: `⚠️ [系统出错]：${(data as any).error || "智能体未能理解该消息。"}`,
          timestamp: Date.now(),
        });
        onSendMessage(errMsg);
      }
    } catch (err: any) {
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
      onSendMessage(errMsg);
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
          routine: buildCharacterRoutine(currentCharacter.routine),
        });
      } catch {
        // Cognitive context is read-only and must never block the legacy reply
        // path when a malformed legacy relationship cannot be projected.
        return undefined;
      }
    },
    generateGroupReply: generateResponseForGroupChat,
    generateDirectReply: ({ userMsg, customHistoryOverride, cognitiveContext, context }) =>
      executeDirectReplyPipeline(userMsg, customHistoryOverride, cognitiveContext, context),
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
  ) => chatReplyController.generate({ userMsg, customHistoryOverride });

  const sendCustomMessage = (
    contentString: string,
    capturedContext = activeRuntimeContext,
    options: { triggerReply?: boolean } = {},
  ) => {
    if (!activeChatCharId || !activeCharacter || !isCapturedRuntimeCurrent(capturedContext)) return;
    const userMsg = createUserTextMessage({
      id: Date.now().toString(),
      context: capturedContext,
      content: contentString,
      timestamp: Date.now(),
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

  /** This is the only AppChat path that imports the image-generation service.
   * Normal reply, proactive, memory, Moment and Inner Voice paths never call it. */
  const generateAndSendCharacterImage = async (trigger: "manual" | "explicit-user-text", userText: string): Promise<boolean> => {
    if (!activeCharacter) return false;
    const target = activeCharacter.isGroupChat
      ? (() => {
          const lastSender = [...currentChatMessages].reverse().find((message) => message.sender === "character" && message.senderId);
          return lastSender?.senderId ? characters.find((character) => character.id === resolveCanonicalCharacterId(lastSender.senderId!, characters)) : undefined;
        })()
      : activeCharacter;
    if (!target) {
      showToast("群聊图片需要先有一位角色发言，以确定生成图片的角色。");
      return false;
    }
    if (!activeCharacter.isGroupChat && !activeRelationship) return false;
    setIsGeneratingImage(true);
    setImageGenerationError(null);
    const capturedContext = activeRuntimeContext;
    try {
      const scope = activeCharacter.isGroupChat
        ? { kind: "group" as const, groupId: activeCharacter.id, conversationId: `group:${activeCharacter.id}` }
        : { kind: "direct" as const, relationId: activeRelationship!.id, conversationId: activeRelationship!.conversationId || getConversationId(activeRelationship!.id) };
      const recentMessages = activeCharacter.isGroupChat
        ? currentChatMessages
        : currentChatMessages.filter((message) => message.relationId === activeRelationship!.id);
      const generated = await generateCharacterImage({
        settings, character: target, relationship: activeCharacter.isGroupChat ? undefined : activeRelationship,
        recentMessages, scope, trigger, userText, createId: () => `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      });
      if (!isCapturedRuntimeCurrent(capturedContext)) {
        await imageAssetDb.deleteImage(generated.record.imageAssetId).catch(() => undefined);
        showToast("关系已切换，已取消发送刚生成的图片。");
        return false;
      }
      onSendMessage(generated.message);
      const records = loadImageGenerationRecords([]).value;
      saveImageGenerationRecords([...records, generated.record]);
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
    chatInputText,
    setChatInputText,
    quotedMessage,
    setQuotedMessage,
    handleSendOnly,
    handleSendAndReply,
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
  });

  const deleteMessageAndLinkedImage = (messageId: string) => {
    const targetMessage = currentChatMessages.find((message) => message.id === messageId);
    if (!targetMessage) return;
    if (activeDirectScope && !isMessageInDirectScope(targetMessage, activeDirectScope)) return;
    const records = loadImageGenerationRecords([]).value;
    const removed = records.filter((record) => record.messageId === messageId
      && record.relationId === targetMessage.relationId
      && record.conversationId === targetMessage.conversationId);
    if (removed.length) {
      saveImageGenerationRecords(removeImageGenerationRecordByMessage(records, messageId, {
        relationId: targetMessage.relationId,
        conversationId: targetMessage.conversationId || (activeDirectScope?.conversationId ?? `group:${targetMessage.characterId}`),
        groupId: targetMessage.relationId ? undefined : targetMessage.characterId,
      }));
      removed.forEach((record) => imageAssetDb.deleteImage(record.imageAssetId).catch((error) => console.warn("Failed to delete generated image asset:", error)));
    }
    onDeleteMessage?.(messageId, targetMessage);
  };

  const clearMessagesAndLinkedArtifacts = (characterId: string, relationId?: string) => {
    const removedMessages = messages.filter((message) => relationId
      ? message.relationId === relationId
      : message.characterId === characterId);
    const removedMessageIds = new Set(removedMessages.map((message) => message.id));
    const records = loadImageGenerationRecords([]).value;
    const removedRecords = records.filter((record) => removedMessageIds.has(record.messageId)
      && (relationId ? record.relationId === relationId : record.characterId === characterId));
    if (removedRecords.length) {
      const removedRecordIds = new Set(removedRecords.map((record) => record.id));
      saveImageGenerationRecords(records.filter((record) => !removedRecordIds.has(record.id)));
      removedRecords.forEach((record) => imageAssetDb.deleteImage(record.imageAssetId).catch((error) => console.warn("Failed to delete cleared image asset:", error)));
    }
    if (relationId) {
      setRedPacketStatuses((previous) => {
        const next = removePaymentStatusesForMessages(removePaymentStatusesByRelation(previous, relationId), removedMessages);
        localStorage.setItem(RED_PACKET_STATUSES_KEY, JSON.stringify(next));
        return next;
      });
    }
    onClearMessages?.(characterId, undefined, relationId);
  };


  const longPressTimerRef = useRef<any>(null);

  const handleMomentTextPointerDown = (
    e: React.PointerEvent,
    momentId: string,
    text: string,
    authorName: string,
    authorAvatar: string,
    isOwn: boolean,
    timestamp: number
  ) => {
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    longPressTimerRef.current = setTimeout(() => {
      setMomentContextMenu({
        momentId,
        text,
        x: clientX,
        y: clientY,
        authorName,
        authorAvatar,
        isOwn,
        timestamp,
      });
    }, 600);
  };

  const handleMomentTextPointerUpOrLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMomentTextPointerMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMomentCommentPointerDown = (momentId: string, commentId: string) => {
    suppressCommentClickRef.current = false;
    if (commentLongPressTimerRef.current) clearTimeout(commentLongPressTimerRef.current);
    commentLongPressTimerRef.current = setTimeout(() => {
      suppressCommentClickRef.current = true;
      commentLongPressTimerRef.current = null;
      setCommentDeleteTarget({ momentId, commentId });
    }, 550);
  };

  const clearMomentCommentLongPress = () => {
    if (commentLongPressTimerRef.current) {
      clearTimeout(commentLongPressTimerRef.current);
      commentLongPressTimerRef.current = null;
    }
  };

  const handleMomentCommentClick = (momentId: string, comment: MomentComment) => {
    if (suppressCommentClickRef.current) {
      suppressCommentClickRef.current = false;
      return;
    }
    setReplyingToCommentMap(prev => ({ ...prev, [momentId]: comment }));
    setShowCommentInputMap(prev => ({ ...prev, [momentId]: true }));
  };

  const confirmDeleteMomentComment = () => {
    if (!commentDeleteTarget || !onDeleteCommentFromMoment) return;
    onDeleteCommentFromMoment(commentDeleteTarget.momentId, commentDeleteTarget.commentId);
    setCommentDeleteTarget(null);
    showToast("评论已删除");
  };

  const handleMomentTextContextMenu = (
    e: React.MouseEvent,
    momentId: string,
    text: string,
    authorName: string,
    authorAvatar: string,
    isOwn: boolean,
    timestamp: number
  ) => {
    e.preventDefault();
    setMomentContextMenu({
      momentId,
      text,
      x: e.clientX,
      y: e.clientY,
      authorName,
      authorAvatar,
      isOwn,
      timestamp,
    });
  };

  const handleCopyMomentText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板");
    setMomentContextMenu(null);
  };

  const handleFavoriteMoment = (momentId: string, text: string, authorName: string, authorAvatar: string, timestamp: number) => {
    const isAlreadyFaved = momentFavorites.some(f => f.momentId === momentId && f.content === text);
    if (isAlreadyFaved) {
      setMomentFavorites(prev => prev.filter(f => !(f.momentId === momentId && f.content === text)));
      showToast("已取消收藏");
    } else {
      const newFav = {
        id: `fav-moment-${Date.now()}`,
        momentId,
        authorName,
        authorAvatar,
        content: text,
        timestamp: timestamp || Date.now()
      };
      setMomentFavorites(prev => [newFav, ...prev]);
      showToast("已收藏");
    }
    setMomentContextMenu(null);
  };

  const handleTranslateMoment = async (momentId: string, text: string) => {
    setMomentContextMenu(null);
    if (momentTranslations[momentId]) {
      const copy = { ...momentTranslations };
      delete copy[momentId];
      setMomentTranslations(copy);
      return;
    }

    showToast("正在翻译中...");
    try {
      const res = await apiTranslate({
        text,
        apiKey: settings.apiKey || "",
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
      });
      if (res && res.text) {
        setMomentTranslations(prev => ({
          ...prev,
          [momentId]: res.text
        }));
        showToast("翻译完成");
      } else {
        showToast("翻译无结果");
      }
    } catch (err) {
      console.error("Translate moment failed:", err);
      showToast(err instanceof Error ? err.message : "翻译失败，请检查 API 配置");
    }
  };

  const handleDeleteMomentClick = (momentId: string) => {
    setMomentContextMenu(null);
    if (confirm("确定要删除这条朋友圈吗？")) {
      if (onDeleteMoment) {
        onDeleteMoment(momentId);
        showToast("已删除朋友圈");
      } else {
        showToast("删除失败：未提供删除接口");
      }
    }
  };

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastActiveCharIdRef = useRef<string | null>(null);
  const lastMsgCountRef = useRef<number>(0);

  const messagesRef = useRef<Message[]>(messages);
  const processedCatchupsRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Pre-seed moments if state empty
  const allMoments = (moments.length === 0 ? PRESEED_MOMENTS : moments)
    .filter((moment) => belongsToActiveIdentity(moment.ownerIdentityId));

  // Auto scroll in chats with smart detection
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!activeChatCharId || !container) return;

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
      setTimeout(() => {
        const currentContainer = scrollContainerRef.current;
        if (currentContainer) {
          scrollContainerToBottom(currentContainer, isFreshOpen ? "auto" : "smooth");
        }
      }, 50);
    }
  }, [messages.length, activeChatCharId, activeChatRelationId, isTyping]);

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

  const handleRegenerateResponse = async (targetMsg: Message, oocComment: string) => {
    if (!activeChatCharId || !activeCharacter) return;

    // 1. Delete target message
    if (onDeleteMessage) deleteMessageAndLinkedImage(targetMsg.id);

    // 2. Find the chat history excluding the targetMsg
      const previousMessages = currentChatMessages.filter((m) => m.id !== targetMsg.id);
    // Find the last user message
      const lastUserMsg = [...previousMessages].reverse().find((m) => m.sender === "user");
      if (!lastUserMsg) return;
      const regenerationCognitiveContext = activeRelationship && !activeCharacter.isGroupChat
        ? (() => {
          try {
            const relationEvents = listCharacterEventsByRelation(activeRelationship.id);
            const relationshipProjection = buildRelationshipCognitiveProjection({
              relation: activeRelationship,
              events: relationEvents,
              now: Date.now(),
            });
            return buildCharacterCognitiveContext({
              character: activeCharacter,
              relation: activeRelationship,
              memories: [],
              events: relationEvents.map((event) => ({
                event,
                promptVisibility: event.status === "active"
                  && (event.kind === "relationship_created" || event.kind === "offline_story_completed")
                  ? "safe" as const
                  : "private" as const,
              })),
              timeContext: { now: Date.now() },
              knowledgeBoundary: createDirectChatKnowledgeBoundary(),
              conversationId: activeRelationship.conversationId,
              relationshipTimeline: relationshipProjection.timeline,
              routine: buildCharacterRoutine(activeCharacter.routine),
            });
          } catch {
            return undefined;
          }
        })()
        : undefined;

    setIsTyping(true);
    let pendingOfflineHandoffForReply: OfflineStory | undefined;

    try {
      // Short-term real-time context limit: contextMemoryLimit (range 10~50, default 20), capped globally at 50
      const limit = Math.min(50, activeCharacter.contextMemoryLimit !== undefined ? activeCharacter.contextMemoryLimit : 20);
      
      // Exclude lastUserMsg from the history parameter since it is sent as the main message parameter.
      const msgsForHistory = previousMessages.filter(m => m.id !== lastUserMsg.id);
      const slicedMsgs = msgsForHistory.slice(-limit);

      // Map history with timestamps for time awareness
      const requestTime = new Date();
      const history = slicedMsgs.flatMap((m) => {
        const callTurns = expandCallRecordHistory(m.content, m.timestamp, {
          userName: settings.name,
          characterName: activeCharacter.name,
        });
        if (callTurns) {
          return callTurns.map((turn) => ({
            role: turn.role,
            text: resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).enableTimeAwareness
              ? formatHistoricalMessageForPrompt(turn.text, turn.timestamp, requestTime)
              : turn.text,
          }));
        }

        const textImageDescription = parseTextImageDescription(m.content);
        const content = textImageDescription
          ? `[文字图：${textImageDescription}]`
          : formatVoiceMessageHistory(m.content) || m.content;
        return {
          role: m.sender === "user" ? "user" : "model",
          text: resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).enableTimeAwareness
            ? formatHistoricalMessageForPrompt(content, m.timestamp, requestTime)
            : content,
        };
      });

      let timeLogString = "";
      if (resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).enableTimeAwareness) {
        timeLogString = slicedMsgs.map((m) => {
          const timeStr = new Date(m.timestamp).toLocaleString("zh-CN", {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
          const senderName = m.sender === "user" ? "用户" : activeCharacter.name;
          let snippet = formatCallRecordHistory(m.content, {
            userName: settings.name,
            characterName: activeCharacter.name,
            includeTranscript: false,
          }) || formatVoiceMessageHistory(m.content) || m.content;
          if (snippet.length > 80) snippet = snippet.slice(0, 80) + "...";
          return `- ${senderName}: "${snippet}" (发送于: ${timeStr}${describeHistoricalRelativeTime(m.content, m.timestamp, requestTime)})`;
        }).join("\n");
      }

      // Construct system instructions
      let mainPromptText = `You are playing the role of "${activeCharacter.name}" in a WeChat chat.
Reply length, initiative, warmth, restraint, and emotional intensity must follow the character profile and the current conversation. Keep the wording natural and conversational without imposing a universally cold, brief, caring, or agreeable style.
Incorporate your background, age, personality traits, nationality, and configured speaking language organically. Maintain character role-play thoroughly.
Do NOT say you are an AI or Gemini.

🚨🚨🚨 [CRITICAL WECHAT CHAT RULES]:
1. You are in a direct online chat mode (线上聊天模式). You MUST reply using the correct WeChat message format.
${resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).disableBracketActions
  ? `2. You are STRICTLY FORBIDDEN from outputting any third-person narration, physical scene descriptions, action descriptions, or character thoughts (坚决不要输出任何第三人称旁白、场景描写、动作描写或任何第三方叙事/心理描写).
3. Do NOT write like a novel or story script. You must ONLY output the direct spoken messages that "${activeCharacter.name}" would type in a chat box. No narratives, no brackets, no third-person descriptions at all.`
  : `2. If your character's backstory, personality card, or World Book entries naturally utilize parenthesized action descriptions or physical gestures (e.g., "(微笑)", "（叹气）", "*摸摸头*"), you are encouraged to output them inside brackets/parentheses to maintain realistic roleplay expressiveness. Keep them spontaneous, descriptive, and emotionally rich.`
}`;

      if (resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).disableBracketActions) {
        mainPromptText += `\n4. [🚨 CRITICAL FORMAT RULE]: Do NOT use any bracketed/parenthesized action descriptions, physical gestures, facial expressions, or ambient narration (e.g., "(微笑)", "（叹气）", "(摸摸头)", "*笑*", etc.) in your messages. You must interact using pure conversational speech/dialogue ONLY, without any action descriptions, unless such expressions are an absolute, unique signature part of how this specific character literally types/speaks.`;
      }

      const characterProjection = projectCharacterPrompt(activeCharacter, activeRelationship?.relationship);
      const characterDescriptionText = characterProjection.description.content;
      let characterContextText = `[🚨 记忆与上下文关联优先级规则]:
1. Truth Layer 中按关系投影的 confirmed/asserted 事实优先；未来计划、假设、争议和旧数据必须遵守各自标签，不能互相改写。
2. Conversation summary 是可重建的派生缓存，只能补充上下文，不能覆盖具体事实或制造来源中没有的细节。
3. 历史检索及短期上下文：需要长期连续性时优先使用同一关系的 Truth Layer 数据。`;

      // Add OOC comment correction as high priority instruction
      characterContextText += `\n\n[🚨 CRITICAL CORRECTION (OOC FEEDBACK)]:
Your previous response was marked as "OOC" (Out Of Character). 
Feedback from the user: "${oocComment}".
Please read the feedback carefully and rewrite your response to perfectly match your profile. Do NOT repeat the previous tone/behavior!`;

      // Recall memories
      const topK = recallSettings?.recallCount || 5;
      const relevantMemories = MemoryService.retrieveRelevantMemories({ characterId: activeChatCharId || "", relationId: activeRelationship?.id, queryText: lastUserMsg.content, existingMemories: memories || [], limit: topK, scenario: "chat" });
      const truthRetrieval = activeRelationship
        ? retrieveTruthForPrivatePrompt({
          scope: {
            relationId: activeRelationship.id,
            characterId: activeRelationship.characterId,
            userIdentityId: activeRelationship.userIdentityId,
            conversationId: activeRelationship.conversationId,
          },
          queryText: lastUserMsg.content,
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
        characterContextText += formatMemoriesForPrompt(visibleLegacyMemories, "\n- Reclaimed compatibility memories / 兼容旧记忆:\n");
      }
      if (truthRetrieval) {
        characterContextText += formatTruthRetrievalForPrompt(truthRetrieval);
      }

      const latestOfflineContinuationMemory = selectFreshOfflineHandoffMemory({
        memories: memories || [],
        relationId: activeRelationship?.id,
        queryText: lastUserMsg.content,
      });
      pendingOfflineHandoffForReply = getPendingOfflineHandoff();
      if (pendingOfflineHandoffForReply) {
        const matchingSummary = latestOfflineContinuationMemory
          && isOfflineStoryHandoffMemory(latestOfflineContinuationMemory, pendingOfflineHandoffForReply)
          ? latestOfflineContinuationMemory
          : undefined;
        const pendingOfflineHistoryAnchor = buildPendingOfflineTimelineHandoff(
          pendingOfflineHandoffForReply,
          lastUserMsg.timestamp,
          matchingSummary,
        );
        characterContextText += pendingOfflineHistoryAnchor;
        history.push({ role: "user", text: pendingOfflineHistoryAnchor });
      } else if (latestOfflineContinuationMemory) {
        characterContextText += buildOfflineTimelineHandoff(latestOfflineContinuationMemory, lastUserMsg.timestamp);
      }

      const userProfileText = `User Profile:
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}`;
      const userKnowledgeBoundary = formatUserKnowledgeBoundary();
      const relationshipContext = characterProjection.relationship?.content || "";

      const momentsContextRegen = getKnownMomentsContextString(allMoments, activeCharacter, activeIdentityId, settings.name);
      const offlineStoriesContextRegen = getOfflineStoriesContextForOnlineChat();

      // Context-aware trigger scanning: current message plus roughly ten recent messages.
      const scanContextParts = [
        lastUserMsg ? lastUserMsg.content : "",
        ...previousMessages.slice(-10).map(m => m.content)
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");

      // Use the unified World Book system blocks builder
      const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], activeChatCharId || "", scanText, {
        scenario: "chat",
        characterId: activeRelationship?.characterId || activeChatCharId || undefined,
        userIdentityId: activeRelationship?.userIdentityId || activeIdentityId,
        relationId: activeRelationship?.id,
      });

      // Assemble system instruction blocks
      let assembledInstructions: string[] = [];

      // 0. Base living human prompt
      assembledInstructions.push(LIVING_HUMAN_PROMPT);

      // 1. Main Prompt
      assembledInstructions.push(mainPromptText);

      // 1.5 Time awareness prompt if enabled
      if (resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).enableTimeAwareness) {
        const timeStr = formatLocalTimeContext(requestTime);
        assembledInstructions.push(`[🚨 当前实时物理时间感知同步]
当前现实物理世界的时间是：${timeStr}。

以下是最近几条聊天消息的精确发送时间记录，请作为你判断时间流逝的客观依据：
${timeLogString}

【重要时间感知规则】：
0. 【避免时间模板】：时间信息首先用于避免把先后、跨天和间隔判断错。除非用户问到时间、跨天/长间隔确实改变当前语义，或角色人设本就会在此时主动提及，不要因为当前是中午、饭点、深夜等自动发起“吃饭／睡觉／天气”话题，也不要把时间当成通用寒暄。
1. 【精准判断时间跨度与间隔】：请通过上方的发送时间记录，精准识别出消息与消息之间间隔了多久。
   - 特别注意：如果前一条消息说的是“晚安要睡了”，而最新一句话是几小时后的清晨，这说明已经隔了一个晚上，开启了新的一天，你绝对要表现得像过完一夜睡醒后的真人一样，礼貌或亲密地回以“早安”或“早呀”！
   - 如果上一条消息距今已过去数小时或数天，请根据时间长度，在语气和对话脉络中自然流露出时间流逝感（如“你今天一整天都在忙吗”、“好几天没见你发消息了”等）。
2. 【自然融合，绝不机械重复时间】：请极度自然地融合这一时间感，像真实生活在此时此地的人一样表现。
3. 【🚨 极其重要】：上方时间仅是内部推理元数据，不是要发送给用户的内容。禁止在回复中输出或复述任何时间标签、时间戳、时钟气泡或前缀，包括但不限于 \`[发送时间: ...]\`、\`[15:10]\`、\`【15:10】\`。如果需要自然提到时间，只能把它写进完整对话句子中。回复必须保持干净，只输出角色真正要说的话。`);
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
      if (characterContextText.trim()) assembledInstructions.push(characterContextText);

      if (regenerationCognitiveContext) {
        const cognitivePrompt = formatChatPromptContext(buildChatPromptContext(regenerationCognitiveContext, {
          maxFacts: 0,
          relevantMemoryIds: [],
          hasConfirmedClaim: Boolean(truthRetrieval?.projection.confirmedFacts.length),
          hasDerivedSummary: Boolean(truthRetrieval?.summaries.length),
        }));
        if (cognitivePrompt) assembledInstructions.push(cognitivePrompt);
      }

      // 5. After Character Definition entries
      const afterCharacterWorldBook = formatStructuralWorldBookSection(wbBlocks, "after_char_def");
      if (afterCharacterWorldBook) assembledInstructions.push(afterCharacterWorldBook);

      // 6. User Profile
      assembledInstructions.push(userProfileText);
      assembledInstructions.push(userKnowledgeBoundary);
      assembledInstructions.push(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES);

      // 7. Before Chat History entries
      const beforeHistoryWorldBook = formatStructuralWorldBookSection(wbBlocks, "before_chat_history");
      if (beforeHistoryWorldBook) assembledInstructions.push(beforeHistoryWorldBook);

      // 8. WeChat Moments Context memory
      if (momentsContextRegen) {
        assembledInstructions.push(momentsContextRegen);
      }

      // 8.5 Offline stories context memory
      if (offlineStoriesContextRegen) {
        assembledInstructions.push(offlineStoriesContextRegen);
      }

      assembledInstructions.push(formatCharacterKnowledgeBoundary({ currentCharacterId: activeCharacter.id }));
      assembledInstructions.push(formatOnlineChatSpatialBoundary());
      assembledInstructions.push(CHARACTER_MEDIA_USAGE_RULES);

      // 8.8 Custom Sticker Pack availability for Character response (对方使用我的表情包)
      const allStickers2 = stickerGroups.flatMap(g => g.stickers);
      if (allStickers2.length > 0) {
        const stickerListStr = allStickers2.map(s => `[表情]|${s.name}|${s.url}`).join("\n");
        assembledInstructions.push(`[🚨 特别表情包使用指示（Sticker Response Integration） 🚨]
你作为扮演角色，现在可以在符合上方特殊媒体使用规则时使用我的自定义表情包来回复我。只有表情包本身能表达即时反应、且不重复文字内容时，才可以单独一行发送表情包。
发送表情包的格式必须完全符合以下严格语法格式：
[表情]|表情名称|图片URL

以下是你可以无缝调用的自定义表情包列表（每一行对应一个表情包，你可以直接【一字不差地复制】下面的格式并输出它）：
${stickerListStr}

【强制输出规则】：
1. 绝对不允许胡编乱造不存在的表情包名称或图片URL！你只能从上面给出的列表中挑选！
2. 发送时格式必须极其严格：[表情]|名称|URL。不能有任何多余的字符。
3. 不要为了显示功能或凑热闹而发送表情包；不适合时只发送普通文字即可。`);
      }

      if (wbBlocks.allTriggered.length > 0) assembledInstructions.push(WORLD_BOOK_CONTEXT_PRIORITY);
      const systemInstruction = finalizeCharacterChatSystemInstruction({
        instructions: assembledInstructions,
        characterProjection,
        characterDescriptionText,
        diagnosticLabel: "regenerate prompt",
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

      const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((activeCharacter?.personality || "") + (activeCharacter?.backstory || ""));
      const { data, candidates: replyCandidates } = await generateRegeneratedChatTurn({
        prompt: { scenario: "regenerate", message: lastUserMsg.content, history, systemInstruction, historyInjections: wbBlocks.at_depth },
        settings,
        candidateContext: {
          disableBracketActions: resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter).disableBracketActions,
          keepPeriods,
          characterId: activeChatCharId,
          allowEmoji: false,
          createId: (idx) => `${Date.now()}-regen-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          currentTime: (idx) => Date.now() + idx,
        },
      });

      if (data && data.text && replyCandidates) {
        replyCandidates.messages.forEach(onSendMessage);
        if (replyCandidates.messages.length > 0) {
          recordPendingOfflineHandoffDelivery(pendingOfflineHandoffForReply);
        }
      }
    } catch (err: any) {
      console.error("Regeneration error:", err);
    } finally {
      setIsTyping(false);
    }
  };

  const updateDraftChatIcon = (key: ChatIconKey, value: string) => {
    setDraftChatIcons((previous) => {
      const next = { ...previous };
      const url = value.trim();
      if (url) next[key] = url;
      else delete next[key];
      return next;
    });
  };

  // Save settings draft
  const handleSaveSettings = () => {
    if (activeCharacter) {
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
        updateRelationshipSession(activeRelationship.id, { scheduledProactiveTime: nextScheduledTime });
      }

      onSaveCharacter({
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
        autoArchiveInterval: draftAutoArchiveInterval,
        enableAutoArchive: draftEnableAutoArchive,
        enableAutoSummary: draftEnableAutoArchive, // synced with enableAutoArchive
        summaryTriggerRound: draftAutoArchiveInterval, // synced with autoArchiveInterval
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

      // Automatically translate existing non-Chinese messages in current chat
      if (isEnablingAutoTranslate && onUpdateMessage) {
        const currentChatMessages = messages.filter(
          (m) => (activeRelationship ? m.relationId === activeRelationship.id : m.characterId === activeCharacter.id && activeCharacter.isGroupChat)
            && m.sender === "character" && !m.isNarration && !m.translation
        );

        currentChatMessages.forEach((msg) => {
          const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(msg.content);
          const hasKorean = /[\uac00-\ud7af]/.test(msg.content);
          const hasChinese = /[\u4e00-\u9fa5]/.test(msg.content);
          const hasEnglish = /[a-zA-Z]{3,}/.test(msg.content);
          const isNonChinese = hasJapanese || hasKorean || (!hasChinese && hasEnglish);

          if (isNonChinese) {
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
    }
  };

  // Remove a member from the active group chat
  const handleRemoveGroupMember = (memberId: string) => {
    if (!activeCharacter || !activeCharacter.memberIds) return;
    const member = characters.find(c => c.id === memberId);
    const memberName = member ? (member.remark || member.name) : "成员";
    
    const updatedMemberIds = activeCharacter.memberIds.filter(id => id !== memberId);
    
    // Update character
    const updatedChar = {
      ...activeCharacter,
      memberIds: updatedMemberIds,
    };
    onSaveCharacter(updatedChar);

    // Create a narration message for member removal
    const removeNarration: Message = {
      id: `group-narrate-${Date.now()}`,
      characterId: activeCharacter.id,
      sender: "character",
      isNarration: true,
      content: `您将 ${memberName} 移出了群聊`,
      timestamp: Date.now(),
    };
    onSendMessage(removeNarration);
  };

  // Add selected members to the active group chat
  const handleAddGroupMembers = (newMemberIds: string[]) => {
    if (!activeCharacter || !activeCharacter.memberIds) return;
    if (newMemberIds.length === 0) return;

    const updatedMemberIds = [...activeCharacter.memberIds, ...newMemberIds];
    
    // Update character
    const updatedChar = {
      ...activeCharacter,
      memberIds: updatedMemberIds,
    };
    onSaveCharacter(updatedChar);

    // Generate names of invited members
    const invitedNames = newMemberIds.map(id => {
      const c = characters.find(char => char.id === id);
      return c ? (c.remark || c.name) : "";
    }).filter(Boolean).join("、");

    // Create initial narration message
    const addNarration: Message = {
      id: `group-narrate-${Date.now()}`,
      characterId: activeCharacter.id,
      sender: "character",
      isNarration: true,
      content: `您邀请了 ${invitedNames} 加入了群聊`,
      timestamp: Date.now(),
    };
    onSendMessage(addNarration);

    setShowAddMemberModal(false);
  };

  // Set chat specific background wallpaper (draft)
  const handleDraftChatBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 1000, 1000, 0.7);
        setDraftChatBg(compressed);
      } catch (err) {
        console.error("Chat background compression failed:", err);
      }
    }
  };

  // Memory Extraction Handler (Extracting facts & moments instead of a big blob)
  const handleExtractMemories = async (manualMessagesOverride?: Message[]) => {
    if (!activeChatCharId || !activeCharacter || !activeDirectScope) return 0;
    const extractionScope = activeDirectScope;

    setIsCompressingMemory(true);
    try {
      const limitToSearch = activeCharacter.retrievalHistoryLimit || 100;
      const messagesToCompress = (manualMessagesOverride || currentChatMessages).slice(-limitToSearch);
      if (messagesToCompress.length === 0) {
        return 0;
      }
      
      const isDelicate = activeCharacter.archiveTemplateType === "delicate";
      const headerLabel = isDelicate ? "【心境日记归档 (细腻版)】" : "【精炼归档事件日志 (精炼版)】";
      const result = await MemoryService.extractMemories({
        character: activeCharacter,
        characterId: activeChatCharId,
        relationId: extractionScope.relationId,
        userIdentityId: extractionScope.userIdentityId,
        conversationId: extractionScope.conversationId,
        recentMessages: messagesToCompress,
        existingMemories: memories || [],
        scenario: "chat",
        apiKey: settings.apiKey,
        model: (!recallSettings?.extractModel || recallSettings.extractModel === "default-chat-model") ? (settings.selectedModel || "gemini-3.5-flash") : recallSettings.extractModel,
        apiEndpoint: settings.apiEndpoint,
        templateType: activeCharacter.archiveTemplateType,
        createId: () => (Date.now() + Math.random()).toString(),
        currentTime: () => Date.now(),
        formatContent: (items, formatOptions) => isDelicate
          ? formatDelicateMemoryDiary(headerLabel, formatOptions?.displayItems || items)
          : formatExtractedMemorySummary(headerLabel, items),
      }, apiExtractMemories);
      if (result.apiError) {
        console.error("Extract memory API error:", result.apiError);
        return -1;
      }
      if (result.acceptedClaims.length > 0 && !appendKnowledgeClaims(result.acceptedClaims).success) {
        console.error("Knowledge claims could not be persisted; compatibility Memory was not updated.");
        return -1;
      }
      const extractedSummary = createConversationSummaryRecord({
        scope: extractionScope,
        claims: result.acceptedClaims,
        sourceMessageIds: messagesToCompress.map((message) => message.id),
        generatedAt: Date.now(),
        rangeStartAt: messagesToCompress[0]?.timestamp,
        rangeEndAt: messagesToCompress[messagesToCompress.length - 1]?.timestamp,
      });
      if (extractedSummary) {
        const summaryWrite = saveConversationSummaries([...loadConversationSummaries().value, extractedSummary]);
        if (!summaryWrite.success) console.error("Conversation summary cache could not be persisted:", summaryWrite.error);
      }
      if (result.extractedMemories.length > 0) {
        onSaveMemories(MemoryService.mergeMemories(memories || [], result.extractedMemories));
      }
      // Advance automatic-summary progress when Truth accepted claims even if
      // no display-only compatibility Memory was created.
      return Math.max(result.extractedMemories.length, result.acceptedClaims.length);
    } catch (err: any) {
      console.error("Memory extraction error:", err);
    } finally {
      setIsCompressingMemory(false);
    }
    return -1;
  };

  // Manual Trigger Proactive Message simulation

  const scheduleNextProactiveMessage = (friend: Character): number => {
    const startTime = friend.proactiveStartTime || "09:00";
    const endTime = friend.proactiveEndTime || "22:00";
    const now = new Date();
    
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    
    const isOvernight = endMinutes < startMinutes;
    if (isOvernight) {
      endMinutes += 24 * 60;
    }

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const windowStartMs = todayStart.getTime() + startMinutes * 60000;
    const windowEndMs = todayStart.getTime() + endMinutes * 60000;

    let possibleStartMs = windowStartMs;
    const currentTimeMs = now.getTime();

    if (currentTimeMs >= windowEndMs) {
      // Today's window is in the past. Schedule in tomorrow's window.
      const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const tomorrowStartMs = tomorrowStart.getTime() + startMinutes * 60000;
      const tomorrowEndMs = tomorrowStart.getTime() + endMinutes * 60000;
      const randomOffset = Math.random() * (tomorrowEndMs - tomorrowStartMs);
      return Math.floor(tomorrowStartMs + randomOffset);
    } else if (currentTimeMs > windowStartMs) {
      // Currently inside today's window. Schedule between now and the end of the window.
      possibleStartMs = currentTimeMs;
      const randomOffset = Math.random() * (windowEndMs - possibleStartMs);
      return Math.floor(possibleStartMs + randomOffset);
    } else {
      // Before today's window. Schedule between today's start and today's end.
      const randomOffset = Math.random() * (windowEndMs - windowStartMs);
      return Math.floor(windowStartMs + randomOffset);
    }
  };

  // Automated background proactive message generator for any character
  const triggerProactiveFor = async (relationId: string, customTaskText?: string, backdateTimestamp?: number) => {
    if (isOfflineStoryActiveFor(relationId) || proactiveMessageInFlightRef.current.has(relationId)) return;
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
      const recentConversation = analyzeRecentConversation(charMsgs, friend.id);
      const conversationGuidance = formatProactiveConversationGuidance(recentConversation);
      const scanText = charMsgs.slice(-10).map(m => m.content).join("\n");
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
        queryText: recentConversation.recentMessages.slice(-2).map((message) => message.content).join(" "),
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
        routine: buildCharacterRoutine(friend.routine),
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
      const proactiveResult = await generateProactiveChatTurn({
        prompt: {
          scenario: "proactive-message",
          message: "(你主动给用户发送了一条信息)",
          history: recentConversation.recentMessages.map((message) => ({ role: message.sender === "user" ? "user" : "model", text: message.content })),
          systemInstruction,
          historyInjections: wbBlocks.at_depth,
        },
        settings,
        characterId: friend.id,
        disableBracketActions: friend.disableBracketActions || false,
        keepPeriods,
        createId: (idx) => `${Date.now()}-friend-proactive-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        currentTime: (idx) => backdateTimestamp ? (backdateTimestamp + idx) : (Date.now() + idx),
        cognitiveContext,
        transformBubble: (bubbleText, idx) => {
          const isVoice = shouldConvertBubbleToVoice(friend, null, charMsgs, idx, bubbleText);
          if (!isVoice) return bubbleText;
          const secs = Math.max(1, Math.min(60, Math.ceil(bubbleText.length * 0.35 + 1.2)));
          return `[语音]|${secs}|${bubbleText}`;
        },
      });

      if (proactiveResult.data && proactiveResult.data.text) {
        proactiveResult.messages.forEach((message) => onSendMessage({
          ...message,
          relationId,
          conversationId: relationship.conversationId || getConversationId(relationId),
        }));
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
    } catch (err) {
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
  const buildRelationMomentContext = (
    character: Character,
    relationship: CharacterRelationship,
    occurredAt: number,
  ) => {
    const confirmedClaimMemories: MemoryItem[] = loadKnowledgeClaims().value
      .filter((claim) => claim.relationId === relationship.id
        && claim.characterId === relationship.characterId
        && claim.userIdentityId === relationship.userIdentityId
        && claim.status === "active"
        && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted"))
      .map((claim) => ({
        id: `moment-claim:${claim.id}`,
        characterId: claim.characterId,
        relationId: claim.relationId,
        content: claim.statement,
        timestamp: claim.recordedAt,
        importance: 5,
      }));
    const explicitManualMemories = (memories || []).filter((memory) =>
      memory.characterId === character.id
      && memory.relationId === relationship.id
      && memory.isManual === true);
    return buildMomentCognitiveContext({
      character,
      relationship,
      memories: [...confirmedClaimMemories, ...explicitManualMemories],
      events: listCharacterEventsByRelation(relationship.id),
      occurredAt,
      routine: buildCharacterRoutine(character.routine),
    });
  };

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

  const momentSourceText = (context: CharacterCognitiveContext) => [
    context.persona.personality,
    context.persona.backstory,
    ...context.knownFacts.map((fact) => fact.content),
    ...context.recentEvents.map((event) => event.summary),
  ].filter(Boolean).join("\n");

  const handleAutoCommentOnUserMoment = async (newMo: Moment) => {
    if (activeRelationships.length === 0) return;

    let commentingRelationships = activeRelationships.filter(() => Math.random() < 0.6);
    if (commentingRelationships.length === 0) {
      commentingRelationships = [activeRelationships[Math.floor(Math.random() * activeRelationships.length)]];
    }

    commentingRelationships = commentingRelationships.slice(0, 3);

    for (const relationship of commentingRelationships) {
      const friend = characters.find((character) => character.id === relationship.characterId);
      if (!friend || friend.isGroupChat) continue;
      const delay = Math.random() * 8000 + 4000; // 4 to 12 seconds delay
      setTimeout(async () => {
        try {
          const temporalContext = createMomentTemporalContext(new Date());
          const relationContext = buildRelationMomentContext(friend, relationship, temporalContext.generatedAt.getTime());
          const relationWorldKnowledge = buildMomentWorldKnowledge(
            worldBookEntries || [], friend, relationship,
            `${newMo.content}\n${momentSourceText(relationContext)}`,
          );
          const publicContext = buildPublicMomentContext({
            character: friend,
            moments: [newMo],
            topicHistory: loadMomentTopicRecords().value,
            routine: buildCharacterRoutine(friend.routine),
            now: Date.now(),
          });

          const systemInstruction = `Your task: Write a short, natural comment on the Moment.
🚨 [CRITICAL WECHAT COMMENT RULES]:
1. The comment must be brief, extremely natural, and fit the character and current relationship context supplied by the Moment Prompt Adapter.
2. Keep it under 35 characters and follow the character language policy below.
3. No OOC, no narrative brackets like (微笑), just the direct comment text.
4. You may naturally reference confirmed shared experiences or relationship facts from the supplied context, but never invent them or mention another relationship or user identity.
${MOMENT_CHARACTER_EXPRESSION_PROMPT}
${CHARACTER_LANGUAGE_POLICY}

${formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(friend, relationWorldKnowledge.map((entry) => `${entry.title}\n${entry.content}`)))}
`;

          const composedPrompt = PromptComposer.compose({
            scenario: "moment-comment",
            message: "请仅根据公开朋友圈内容和角色公开资料，写一条简短自然的微信评论：",
            history: [],
            systemInstruction,
          });
          const comment = await requestAutomaticMomentComment({
            requestAi: apiChat,
            request: {
            ...composedPrompt,
            apiKey: settings.apiKey,
            model: settings.selectedModel || "gemini-3.5-flash",
            apiEndpoint: settings.apiEndpoint,
            apiTemperature: settings.apiTemperature,
            },
            character: friend,
            cleanText: (text) => cleanOnlineMessage(text, true),
            temporalContext,
            publicContext,
            relationContext,
            relationWorldKnowledge,
          });
          if (comment) onAddCommentToMoment(newMo.id, comment);
        } catch (err) {
          console.error(`Failed to generate automatic comment for ${friend.name}:`, err);
        }
      }, delay);
    }
  };

  const handleAutoReplyToUserComment = async (momentId: string, userCommentText: string, replyingTo?: MomentComment) => {
    // Find the moment
    const targetMoment = moments.find(m => m.id === momentId);
    if (!targetMoment) return;

    // Identify which character should reply
    let targetChar: Character | undefined;
    if (replyingTo) {
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
        const temporalContext = createMomentTemporalContext(new Date());
        const relationContext = buildRelationMomentContext(friend, relationship, temporalContext.generatedAt.getTime());
        const relationWorldKnowledge = buildMomentWorldKnowledge(
          worldBookEntries || [], friend, relationship,
          `${targetMoment.content}\n${userCommentText}\n${momentSourceText(relationContext)}`,
        );
        const publicContext = buildPublicMomentContext({
          character: friend,
          moments: [targetMoment],
          comments: [
            ...targetMoment.comments,
            {
              id: "public-comment-input",
              authorName: settings.name,
              authorAvatar: settings.avatar,
              content: userCommentText,
              timestamp: Date.now(),
            },
          ],
          topicHistory: loadMomentTopicRecords().value,
          routine: buildCharacterRoutine(friend.routine),
          now: Date.now(),
        });

        const systemInstruction = `Your task: Write a short, extremely natural WeChat reply/comment.
🚨 [CRITICAL WECHAT COMMENT RULES]:
1. The reply must be brief, lively, extremely natural, and match the character and current relationship context supplied by the Moment Prompt Adapter.
2. Keep it under 35 characters and follow the character language policy below.
3. Speak directly to the user without formal prefixes. Do not write narrative actions or brackets like "(害羞)", just output the comment text.
4. You may naturally reference only confirmed material from this supplied relationship context. Never invent shared experiences or use another relationship's information.
${MOMENT_CHARACTER_EXPRESSION_PROMPT}
${CHARACTER_LANGUAGE_POLICY}

${formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(friend, relationWorldKnowledge.map((entry) => `${entry.title}\n${entry.content}`)))}
`;

        const composedPrompt = PromptComposer.compose({
          scenario: "moment-reply",
          message: `请仅针对这条公开朋友圈评论 "${userCommentText}"，写一条符合角色公开人设的简短微信回复：`,
          history: [],
          systemInstruction,
        });
        const reply = await requestMomentCommentReply({
          requestAi: apiChat,
          request: {
          ...composedPrompt,
          apiKey: settings.apiKey,
          model: settings.selectedModel || "gemini-3.5-flash",
          apiEndpoint: settings.apiEndpoint,
          apiTemperature: settings.apiTemperature,
          },
          character: friend,
          userName: settings.name,
          cleanText: (text) => cleanOnlineMessage(text, true),
          temporalContext,
          publicContext,
          relationContext,
          relationWorldKnowledge,
        });
        if (reply) onAddCommentToMoment(momentId, reply);
      } catch (err) {
        console.error(`Failed to generate reply to user comment for ${friend.name}:`, err);
      }
    }, delay);
  };

  const generateCharacterMoment = async (relationship: CharacterRelationship, occurredAt: number) => {
    const friend = characters.find((character) => character.id === relationship.characterId);
    if (!friend || friend.isGroupChat || isOfflineStoryActiveFor(relationship.id)) return;
    try {
      const ownerMomentHistory = moments
        .filter((moment) => Boolean(moment.characterId))
        .filter((moment) => moment.characterId === friend.id)
        .filter((moment) => (moment.ownerIdentityId || "identity-1") === (relationship.userIdentityId || "identity-1"))
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 12);
      const temporalContext = createMomentTemporalContext(new Date(occurredAt));
      const relationContext = buildRelationMomentContext(friend, relationship, occurredAt);
      const relationWorldKnowledge = buildMomentWorldKnowledge(
        worldBookEntries || [], friend, relationship,
        momentSourceText(relationContext),
      );
      const publicContext = buildPublicMomentContext({
        character: friend,
        moments: ownerMomentHistory,
        topicHistory: loadMomentTopicRecords().value,
        routine: buildCharacterRoutine(friend.routine),
        now: occurredAt,
      });

      const systemInstruction = `Your task: Write a WeChat Moment post from the character's scoped life context supplied by the Moment Prompt Adapter.
🚨 [CRITICAL WECHAT MOMENT RULES]:
1. The post must fit the character and may draw on confirmed material from this exact relationship, including confirmed offline experiences and relationship progress.
2. The post content must be natural, engaging, and use the final output language specified below.
3. Vary the form and length: a one-line fragment (5-30 Chinese characters), a short thought (20-60), or a concrete life record (60-160). Do not force every post into the same paragraph length or literary style.
4. Write in first person only. Do NOT use OOC tags, narration brackets, AI labels, or talk like an AI. Just output the text of the Moment post.
5. Moments do not support chat stickers or sticker links. Never output [表情]、[表情]|名称|URL、blob: URL, sticker names, or chat attachment markup. Use post text, with only the dedicated final "(配图：...)" text-image line permitted by rule 7.
6. Do NOT include any parenthesized meta-narration or action descriptions like "(凌晨两点 范千发了条朋友圈)".
7. Decide explicitly whether this post benefits from a visual. When a concrete scene, food, object, ticket, music, street view, outfit, or shared outing is central, prefer a text-image card. Add one final separate line in exactly this format: "(配图：图片描述)". This is an allowed Moment-only rendering instruction, not a chat attachment or body text.
8. Do NOT write mock self-comments like "(评论区自己补了一条：...)" inside parentheses. If you want to add a self-comment under your own post, write it at the very end of your response as a separate line starting with "评论：" (e.g. "评论：别猜了 没说是谁 困了 睡觉"), we will automatically publish it as a real comment under your post.
9. Do not reuse the same topic, angle, sentence pattern, opening, image idea, or emotional conclusion from the supplied feed history. Prefer a specific detail from the scoped context over generic weather, tiredness, coffee, work, or vague feelings.
10. Never use material from another character, relationship, or user identity. Never use director/IF/hypothetical content, unconfirmed offline content, or AI-inferred events. If there is no fresh scoped topic, output exactly "SKIP" and nothing else.

${formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(friend, relationWorldKnowledge.map((entry) => `${entry.title}\n${entry.content}`)))}
`;

      const composedPrompt = PromptComposer.compose({
        scenario: "moment-post",
        message: "请仅根据角色公开资料与公开动态历史，判断是否有值得发布且明显不同于历史动态的新内容；有则写一条，没有则只输出 SKIP。不要为了完成任务硬发。",
        history: [],
        systemInstruction,
      });
      const generated = await requestCharacterMomentOnce({
        requestAi: apiChat,
        request: {
        ...composedPrompt,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
        },
        character: friend,
        ownerIdentityId: activeIdentityId,
        parseContent: cleanAndExtractMoment,
        relationId: relationship.id,
        occurredAt: () => occurredAt,
        temporalContext,
        existingMoments: ownerMomentHistory,
        publicContext,
        relationContext,
        relationWorldKnowledge,
      });
      if (generated.blockedReason === "prohibited-content") {
        // Automatic Moments are optional background content. A provider safety
        // rejection should silently skip this post instead of asking the user
        // to rewrite the character or World Book for a non-essential feature.
        return;
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
      }
      // A public Moment is not a verified private relationship fact. Keep the
      // generator's legacy return value for compatibility, but do not write it
      // into relation-scoped Memory without an explicit user confirmation path.
    } catch (err: any) {
      console.error(`Failed to generate Moment for character ${friend.name}:`, err);
      const errMsgStr = err?.message || String(err);
      const isAuthError = errMsgStr.toLowerCase().includes("401") ||
                          errMsgStr.toLowerCase().includes("api_key") ||
                          errMsgStr.toLowerCase().includes("key") ||
                          errMsgStr.toLowerCase().includes("invalid") ||
                          errMsgStr.toLowerCase().includes("authentication fails");
      if (isAuthError) {
        showToast(`⚠️ [动态生成失败] 「${friend.name}」发布朋友圈时 API 验证失败，请在设置中检查您的 API Key 是否正确。`);
      } else {
        showToast(`⚠️ [动态生成失败] 「${friend.name}」：${errMsgStr}`);
      }
    }
  };

  const checkAndTriggerCharacterMoments = async () => {
    if (activeRelationships.length === 0) return;

    for (const relationship of activeRelationships) {
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
        await generateCharacterMoment(relationship, occurredAt);
        // Break to avoid generating multiple moments simultaneously
        break;
      }
    }
  };

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

    // Auto-comment trigger
    handleAutoCommentOnUserMoment(newMo);
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
    handleAutoCommentOnUserMoment(newMo);
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
      <Modal
        open={Boolean(innerVoiceCharacter)}
        onClose={closeInnerVoice}
        title={innerVoiceMode === "history" ? "历史心声" : "角色心声"}
        description={innerVoiceCharacter ? (
          <span className="flex items-center gap-2">
            <RenderAvatar src={innerVoiceCharacter.avatar} alt="" name={innerVoiceCharacter.name} className="h-7 w-7 rounded-full object-cover" />
            <span>{innerVoiceCharacter.remark || innerVoiceCharacter.name}</span>
          </span>
        ) : undefined}
        ariaLabel="角色心声"
        footer={innerVoiceMode === "current" ? (
          <Button variant="secondary" fullWidth onClick={() => setInnerVoiceMode("history")}>查看历史心声</Button>
        ) : (
          <Button variant="secondary" fullWidth onClick={() => setInnerVoiceMode("current")}>返回当前心声</Button>
        )}
      >
        {innerVoiceMode === "current" ? (
          <div className="space-y-3">
            {innerVoiceLoading && <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">正在捕捉此刻的心声…</p>}
            {!innerVoiceLoading && innerVoiceError && <p className="py-6 text-center text-sm text-red-500">{innerVoiceError}</p>}
            {!innerVoiceLoading && innerVoiceRecord && (
              <Card variant="secondary" padding="md" className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">此刻的心声</h3>
                <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-primary)]">{innerVoiceRecord.content}</p>
                {innerVoiceRecord.translation && (
                  <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-secondary)]">{innerVoiceRecord.translation}</p>
                )}
                <div className="border-t border-[var(--divider)]" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-[var(--color-text-secondary)]">此刻情绪</h4>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-primary)]">{getInnerVoiceEmotion(innerVoiceRecord)}</p>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {innerVoiceHistory.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">还没有历史心声。</p>
            ) : innerVoiceHistory.map((record) => (
              <div key={record.id}>
              <Card variant="outlined" padding="md" className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
                  <span>{new Date(record.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">此刻的心声</h3>
                <p className="whitespace-pre-wrap text-sm leading-6">{record.content}</p>
                {record.translation && <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]">{record.translation}</p>}
                <div className="border-t border-[var(--divider)]" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-[var(--color-text-secondary)]">此刻情绪</h4>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-primary)]">{getInnerVoiceEmotion(record)}</p>
                </div>
              </Card>
              </div>
            ))}
          </div>
        )}
      </Modal>
      
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
                #conv-screen .transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  border: ${settings.bubbleBorderWidth !== undefined ? settings.bubbleBorderWidth : 1}px solid ${settings.selfBubbleBorderColor || '#27272a'} !important;
                }
                #conv-screen .chat-bubble-other,
                #conv-screen .received-transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  border: ${settings.bubbleBorderWidth !== undefined ? settings.bubbleBorderWidth : 1}px solid ${settings.otherBubbleBorderColor || '#e4e4e7'} !important;
                }
              ` : `
                #conv-screen .chat-bubble-self,
                #conv-screen .transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-self,
                #conv-screen .chat-bubble-other,
                #conv-screen .received-transfer-card,
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
                #conv-screen .transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  border-radius: ${settings.selfBubbleRadius}px !important;
                }
              ` : ""}
              ${!isLiquidGlass && !hasUserCustomChatCss && settings.otherBubbleRadius !== undefined ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .received-transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  border-radius: ${settings.otherBubbleRadius}px !important;
                }
              ` : ""}

              ${!isLiquidGlass && settings.otherBubbleBg ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .received-transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  background-color: ${getBubbleBackgroundStyle(settings.otherBubbleBg, settings.otherBubbleOpacity !== undefined ? settings.otherBubbleOpacity : 100)} !important;
                  background-image: none !important;
                }
              ` : ''}

              ${!isLiquidGlass && settings.otherBubbleColor ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .chat-bubble-other *,
                #conv-screen .received-transfer-card,
                #conv-screen .received-transfer-card *,
                #conv-screen .voice-message-bar.chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other * {
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
                  : settings.selfBubbleBg
                    ? getBubbleBackgroundStyle(settings.selfBubbleBg, settings.selfBubbleOpacity ?? 100)
                    : "var(--button-primary-bg)"};
                --chat-ai-bg: ${isLiquidGlass
                  ? getBubbleBackgroundStyle(
                    settings.liquidGlassOtherBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
                    settings.liquidGlassOtherBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
                  )
                  : settings.otherBubbleBg
                    ? getBubbleBackgroundStyle(settings.otherBubbleBg, settings.otherBubbleOpacity ?? 100)
                    : "var(--surface-raised)"};
                --chat-user-text: ${isLiquidGlass
                  ? settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR
                  : settings.selfBubbleColor || "var(--button-primary-text)"};
                --chat-ai-text: ${isLiquidGlass
                  ? settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR
                  : settings.otherBubbleColor || "var(--text-primary)"};
              }

              ${!isLiquidGlass && settings.selfBubbleBg ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  background-color: ${getBubbleBackgroundStyle(settings.selfBubbleBg, settings.selfBubbleOpacity !== undefined ? settings.selfBubbleOpacity : 100)} !important;
                  background-image: none !important;
                }
              ` : ''}

              ${!isLiquidGlass && settings.selfBubbleColor ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .chat-bubble-self *,
                #conv-screen .transfer-card,
                #conv-screen .transfer-card *,
                #conv-screen .voice-message-bar.chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self * {
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
                  font-size: 11px !important;
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
                #conv-screen.style-liquid-glass .transfer-card,
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
                  font-size: 12px !important;
                  font-weight: 600 !important;
                  line-height: 1.4 !important;
                  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.04) !important;
                }
                #conv-screen.style-liquid-glass .chat-bubble-self *,
                #conv-screen.style-liquid-glass .transfer-card *,
                #conv-screen.style-liquid-glass .voice-message-bar.chat-bubble-self *,
                .phone-screen-container .style-liquid-glass .chat-bubble-self *,
                .style-liquid-glass .chat-bubble-self * {
                  color: ${settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR} !important;
                }

                #conv-screen.style-liquid-glass .chat-bubble-other,
                #conv-screen.style-liquid-glass .received-transfer-card,
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
                  font-size: 12px !important;
                  font-weight: 600 !important;
                  line-height: 1.4 !important;
                  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.04) !important;
                }
                #conv-screen.style-liquid-glass .chat-bubble-other *,
                #conv-screen.style-liquid-glass .received-transfer-card *,
                #conv-screen.style-liquid-glass .voice-message-bar.chat-bubble-other *,
                .phone-screen-container .style-liquid-glass .chat-bubble-other *,
                .style-liquid-glass .chat-bubble-other * {
                  color: ${settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR} !important;
                }
 
                /* 气泡元数据 */
                .msg-meta-header {
                  margin-bottom: 6px !important;
                }
                .msg-meta-name {
                  color: #3f3f46 !important;
                  font-size: 9px !important;
                  font-weight: 800 !important;
                  letter-spacing: 0.08em !important;
                  margin-bottom: 2px !important;
                }
                .msg-meta-date, .msg-meta-time {
                  color: #71717a !important;
                  font-size: 9px !important;
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
                  font-size: 11px !important;
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
                  width: 42px !important;
                  height: 42px !important;
                  flex: 0 0 42px !important;
                  border-radius: 50% !important;
                  background: rgba(255, 255, 255, 0.76) !important;
                  background-color: rgba(255, 255, 255, 0.76) !important;
                  border: 1px solid rgba(255, 255, 255, 0.7) !important;
                  box-shadow: 0 4px 14px rgba(34, 46, 66, 0.08) !important;
                }
                #conv-screen.style-liquid-glass .chat-composer__attachment-panel > * > span {
                  color: #334155 !important;
                  font-size: 10px !important;
                  line-height: 14px !important;
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
                  loadCharacterDraft(activeCharacter);
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
                     <span>清空对话记录</span>
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
                      <h3 className="font-bold text-slate-800 text-sm">清空对话记录</h3>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        请选择如何处理当前对话。提炼整理记忆可让角色长久记住你们的互动与好感。
                      </p>
                    </div>
                    <div className="flex flex-col gap-2.5 pt-2">
                      <button
                        onClick={async () => {
                          setShowClearHistoryModal(false);
                          // Step 1: Extract memories to Memory Vault
                          const count = await handleExtractMemories();
                          // Step 2: Clear messages
                          if (onClearMessages) {
                            clearMessagesAndLinkedArtifacts(activeChatCharId, activeRelationship?.id);
                          }
                          // Reset greeting checked state so a new proactive greeting can be generated immediately
                          setEmptyGreetingCheckedCharIds((prev) => prev.filter((id) => id !== activeChatCharId));
                          setSentGreetings((prev) => prev.filter((id) => id !== activeChatCharId));
                          alert(`成功提取并整理了 ${count} 条核心记忆存入“记忆书”，当前对话已安全清除！`);
                        }}
                        disabled={isCompressingMemory}
                        className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isCompressingMemory ? "正在提炼并清空..." : "💡 提炼记忆存入记忆书再清空"}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("确定要直接清空所有对话记录吗？该操作不可撤销，且不会保存任何新记忆。")) {
                            setShowClearHistoryModal(false);
                            if (onClearMessages) {
                              clearMessagesAndLinkedArtifacts(activeChatCharId, activeRelationship?.id);
                            }
                            // Reset greeting checked state so a new proactive greeting can be generated immediately
                            setEmptyGreetingCheckedCharIds((prev) => prev.filter((id) => id !== activeChatCharId));
                            setSentGreetings((prev) => prev.filter((id) => id !== activeChatCharId));
                          }
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
                            onDeleteCharacter(activeChatCharId!, true);
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
          <div className={`chat-content-scope chat-page chat-theme chat-page__background ${activeStylePreset === "liquid-glass" ? "style-liquid-glass" : ""} ${hasUserCustomChatCss ? "user-custom-chat-css" : ""} flex min-h-0 flex-1 flex-col`}>
          <MessageList
            messages={visibleChatMessages}
            scrollRef={scrollContainerRef}
            className="relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-visible p-4 space-y-4 cv-messages-list chat-message-list"
            style={{
              background: activeCharacter.chatBg
                ? `url(${activeCharacter.chatBg}) center/cover no-repeat`
                : undefined,
              WebkitOverflowScrolling: "touch",
            }}
            renderMessage={(msg, idx) => {
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

              const wrapMessageWithDivider = (messageElement: React.ReactElement) => {
                if (!showWeChatDivider) return messageElement;
                return (
                  <React.Fragment key={`msg-group-${msg.id}`}>
                    <div className="w-full flex justify-center my-3.5 select-none animate-fade-in chat-timestamp" id={`timestamp-divider-${msg.id}`}>
                      <div className="bg-black/5 dark:bg-white/10 text-[#888888] dark:text-stone-400 text-[11.5px] px-2.5 py-0.5 rounded-[4px] tracking-wide font-normal chat-timestamp__label">
                        {dividerText}
                      </div>
                    </div>
                    {messageElement}
                  </React.Fragment>
                );
              };

              if (isOfflineModeActive) {
                // 1. Narration (centered divider with grey text and dashed line)
                if (msg.isNarration) {
                  return (
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

                // 2. Character lines & descriptions (beautiful book paragraph layout, NO bubble, NO avatar)
                if (msg.sender === "character") {
                  return (
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
                    </div>
                  );
                }

                // 3. User spoken dialogue ("我的发言", beautiful center-right soft grey bubble)
                return (
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
                  </div>
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
                      const timer = setTimeout(() => {
                        setActiveMenuMsg(msg);
                        setMenuPosition({ x: clientX, y: clientY });
                      }, 500);
                      (e.currentTarget as any)._longPressTimer = timer;
                    }}
                    onPointerUp={(e) => {
                      const timer = (e.currentTarget as any)._longPressTimer;
                      if (timer) clearTimeout(timer);
                    }}
                    onPointerCancel={(e) => {
                      const timer = (e.currentTarget as any)._longPressTimer;
                      if (timer) clearTimeout(timer);
                    }}
                    onPointerLeave={(e) => {
                      const timer = (e.currentTarget as any)._longPressTimer;
                      if (timer) clearTimeout(timer);
                    }}
                    className="flex items-center gap-1 group relative cursor-pointer select-none"
                  >
                    {/* Actual chat bubble + user-controlled corner decoration slot */}
                    <div className={`bubble-deco-wrapper relative w-fit max-w-full overflow-visible ${messageGroupClass}`}>
                      <div className="max-w-full">
                      {msg.diaryShareId ? (() => {
                        const share = diarySharesForCurrentIdentity.find((item) => item.id === msg.diaryShareId && item.messageId === msg.id && item.targetRelationId === msg.relationId && item.conversationId === msg.conversationId);
                        return share ? <div className="w-[210px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left shadow-sm"><div className="flex items-center gap-2 text-xs font-bold"><BookOpen size={15}/>日记分享</div><p className="mt-2 text-[11px] text-[var(--text-secondary)]">{share.snapshot.authorName} · {new Date(share.snapshot.occurredAt).toLocaleDateString("zh-CN")}</p><p className="mt-2 line-clamp-3 text-xs leading-5">{share.snapshot.body}</p></div> : <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">日记分享已不可用</div>;
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
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                            论坛分享已不可用
                          </div>
                        );
                      })() : msg.imageAssetId ? (
                        <StoredChatImage assetId={msg.imageAssetId} alt="generated chat image" generated={msg.imageSource === "generated"} />
                      ) : msg.content.startsWith("data:image/") ? (
                        <img
                          src={msg.content}
                          alt="chat-pic"
                          className="max-w-[160px] rounded-lg border object-cover cursor-zoom-in shadow-sm bg-stone-100"
                        />
                      ) : parseTextImageDescription(msg.content) ? (() => {
                        const description = parseTextImageDescription(msg.content)!;
                        return (
                          <button
                            type="button"
                            onClick={() => setViewingImageDescription(description)}
                            className="w-[210px] min-h-32 rounded-2xl border border-[var(--border)] bg-[var(--media-placeholder-bg)] px-4 py-3 text-left shadow-sm"
                          >
                            <ImageIcon className="mb-4 h-4 w-4 text-[var(--media-placeholder-text)]" />
                            <p className="line-clamp-3 text-xs leading-relaxed text-[var(--text-primary)]">{description}</p>
                            <span className="mt-2 block text-[10px] text-[var(--media-placeholder-text)]">文字图 · 点击查看</span>
                          </button>
                        );
                      })() : msg.content.startsWith("[表情]|") ? (() => {
                        const [_, stickerName, stickerUrl] = msg.content.split("|");
                        // Resolve fresh hydrated URL from local sticker groups
                        const foundSticker = stickerGroups.flatMap(g => g.stickers).find(s => s.name === stickerName);
                        const displayUrl = foundSticker ? foundSticker.url : stickerUrl;
                        return (
                          <div className="max-w-[130px] rounded-xl overflow-hidden relative select-none">
                            <img
                              src={displayUrl}
                              alt={stickerName}
                              className="w-full h-auto max-h-[130px] object-contain"
                              referrerPolicy="no-referrer"
                            />
                            <span className="sr-only">[{stickerName}]</span>
                          </div>
                        );
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
                            className={`inline-flex items-center gap-1.5 px-3 py-2 shadow-sm cv-bubble message-bubble relative ${bubbleStyle} ${messageGroupClass} ${canOpenDetail ? "transition-transform active:scale-[0.98]" : "cursor-default"}`}
                            title={canOpenDetail ? "查看通话内容" : resultLabel}
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-xs font-medium whitespace-nowrap">{resultLabel}</span>
                            <span className="sr-only">{callRecord.callType}</span>
                          </button>
                        );
                      })() : isRedPacketMarkup(msg.content) ? (() => {
                        const [, amount, greeting] = msg.content.split("|");
                        const status = getRedPacketActualStatus(msg);
                        return <RedPacketCard amount={amount || "8.88"} greeting={greeting || "恭喜发财，万事如意"} status={status} isSelf={isSelf} onClick={() => {
                          const char = characters.find((character) => character.id === msg.characterId);
                          setOpenRedPacketDetail({ id: msg.id, amount: amount || "8.88", greeting: greeting || "恭喜发财", senderName: char?.remark || char?.name || "未知好友", senderAvatar: char?.avatar || "🧧", sender: msg.sender as "user" | "character", timestamp: msg.timestamp, message: msg });
                          setShowRedPacketOpenModal(true);
                        }} />;
                      })() : isTransferMarkup(msg.content) ? (() => {
                        const [, amount, memo, isConfirmedStr] = msg.content.split("|");
                        const isConfirmed = isConfirmedStr === "true";
                        return <TransferCard amount={amount || "100.00"} memo={memo || "转账"} status={isConfirmed ? "confirmed" : "pending"} onClick={() => {
                          setOpenTransferDetail({ amount: amount || "100.00", memo: memo || "转账", isConfirmed });
                          setShowTransferDetailModal(true);
                        }} />;
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
                                className={`flex items-center gap-2 px-3 py-1.5 shadow-sm cv-bubble message-bubble voice-message-bar cursor-pointer select-none transition-all duration-200 hover:shadow-md active:scale-[0.98] relative ${bubbleBgAndShape} ${messageGroupClass}`}
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
                                <div className="flex-1 flex items-end justify-center gap-[2px] h-5 px-1 overflow-hidden pb-[1px]">
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
                                <span className="font-sans text-[11px] font-bold text-current opacity-70 shrink-0">
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
                                className={`px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble relative group/bubble mt-0.5 max-w-[240px] ${
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
                        <div className={parseQuoteReply(msg.content) ? `message-quote-reply-wrapper ${isSelf ? "message-quote-reply-wrapper--self" : "message-quote-reply-wrapper--other"}` : `px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble relative group/bubble ${
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
                                <div className={`message-quote__reply-body px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble relative group/bubble ${
                                  isSelf
                                    ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 chat-bubble-self pr-6" : "bg-blue-500 text-white chat-bubble-self pr-6")
                                    : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 chat-bubble-other pr-6" : "bg-white text-slate-800 chat-bubble-other border border-slate-100 pr-6")
                                } ${messageGroupClass}`}>{quoteReply.body}</div>
                              </>
                            ) : <div className="text-left">{msg.content}</div>;
                          })()}
                          {msg.translation && (
                            <>
                              <div className={`my-1.5 border-t border-dashed ${isSelf ? "border-white/20" : "border-stone-200"}`} />
                              <div className={`text-left text-[11px] leading-relaxed ${isSelf ? "text-white/90" : "text-stone-500"}`}>
                                {msg.translation}
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
                      (isConsecutivePrev && shouldCollapse) ? "mt-1.5" : "mt-4.5"
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
                            <div className="flex items-center gap-1 font-bold text-slate-700/85 tracking-wider uppercase msg-meta-name">
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
                      (isConsecutivePrev && shouldCollapse) ? "mt-1.5" : "mt-4.5"
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
                            <div className="flex items-center gap-1 font-bold text-slate-700/85 tracking-wider uppercase msg-meta-name">
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
                  <div className={`w-full flex flex-col items-start ${isTypingConsecutive ? "mt-1.5" : "mt-4.5"} cv-msg-row message message-container`}>
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

          <BubbleTipPortalLayer enabled={!isShowingCardModal && activeBubbleTailEnabled} />

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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendOnly(e);
              }}
              className="px-3 py-2 flex items-center gap-2 chat-composer__form"
            >
              {/* Plus (+) Button */}
              <button
                type="button"
                onClick={() => {
                  setShowAttachPanel(!showAttachPanel);
                  setShowStickerSelector(false);
                }}
                className={`w-10 h-10 transition-all shrink-0 flex items-center justify-center cv-func-btn toggle-tools-btn chat-action-btn chat-composer__button chat-composer__attach-button ${
                  showAttachPanel
                    ? "chat-composer__button--open rotate-45"
                    : "chat-composer__button--idle"
                }`}
                title="附加菜单"
              >
                <span className="cv-plus-icon flex items-center justify-center w-full h-full">
                  <ChatIcon src={getChatIcon("plus")} className="w-3.5 h-3.5"><Plus className="w-3.5 h-3.5" /></ChatIcon>
                </span>
              </button>

              {/* Chat Input text box */}
              <ChatTextInput
                type="text"
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                placeholder={
                  isOfflineModeActive
                    ? (isInputNarration
                        ? "输入旁白..."
                        : "输入发言，继续剧本对话...")
                    : `发送消息给 ${activeCharacter.name}...`
                }
                className="flex-1 h-10 px-4 text-xs chat-input chat-composer__input"
              />

              {/* Send Button 1 (User send only - gray background with white upward arrow) */}
              <button
                type="button"
                onClick={(e) => handleSendOnly(e)}
                disabled={!chatInputText.trim() || isTyping}
                className="w-10 h-10 transition-all flex items-center justify-center shrink-0 cv-send-only-btn chat-composer__button chat-composer__send-only-button chat-composer__send-button"
                title="仅发送消息 (不立即得到回复)"
              >
                <span className="cv-send-only-icon flex items-center justify-center w-full h-full">
                  <ChatIcon src={getChatIcon("send")} className="w-4 h-4"><ArrowUp className="w-4 h-4 stroke-[2.5]" /></ChatIcon>
                </span>
              </button>

              {/* Send Button 2 (Send and AI Reply - black background with white paper plane) */}
              <button
                type="button"
                onClick={(e) => handleSendAndReply(e)}
                disabled={isTyping}
                className="w-10 h-10 transition-all flex items-center justify-center shrink-0 send-button chat-composer__button chat-composer__send-reply-button chat-composer__send-button"
                title="发送消息并获取回复"
              >
                <span className="cv-send-reply-icon flex items-center justify-center w-full h-full">
                  <ChatIcon src={getChatIcon("send")} className="w-3.5 h-3.5"><Send className="w-3.5 h-3.5 fill-current text-current" /></ChatIcon>
                </span>
              </button>
            </form>

            {/* Attach Panel */}
            {showAttachPanel && (
              <AttachmentMenu className={`py-2.5 px-3 flex items-center justify-between gap-1 animate-slide-up select-none shrink-0 overflow-x-auto chat-composer__attachment-panel ${
                activeStylePreset === "liquid-glass"
                  ? "bg-white/60 backdrop-blur-md border-t border-white/40"
                  : "bg-slate-50 border-t border-slate-100"
              }`}>
                {/* 1. 相册 (Album) */}
                <label className="flex-1 flex flex-col items-center justify-center cursor-pointer group min-w-10">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("image")} className="w-4 h-4"><ImageIcon className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">相册</span>
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

                <button type="button" onClick={() => { setImageRequestText(""); setShowImageGenerator(true); setShowAttachPanel(false); }} className="flex-1 flex flex-col items-center justify-center group min-w-10" title="发送文字图">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors"><Camera className="w-4 h-4 text-slate-700" /></div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">文字图</span>
                </button>

                {/* 2. 红包 (Red Packet) */}
                <button
                  type="button"
                  onClick={() => {
                    setRedPacketAmount("8.88");
                    setRedPacketGreeting("恭喜发财，万事如意");
                    setActiveAttachModal("redpacket");
                    setShowAttachPanel(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("redPacket")} className="w-4 h-4"><Gift className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">红包</span>
                </button>

                {/* 3. 语音 (Voice) */}
                <button
                  type="button"
                  onClick={() => {
                    setVoiceText("");
                    setActiveAttachModal("voice");
                    setShowAttachPanel(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("voice")} className="w-4 h-4"><Mic className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">语音</span>
                </button>

                {/* 5. 电话 (Phone) */}
                <button
                  type="button"
                  onClick={() => {
                    beginVoiceCall(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("call")} className="w-4 h-4"><Phone className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">电话</span>
                </button>

                {/* 7. 位置 (Location) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveAttachModal("location");
                    setShowAttachPanel(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("location")} className="w-4 h-4"><MapPin className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">位置</span>
                </button>

                {/* 8. 表情 (Emoji) */}
                <button
                  type="button"
                  onClick={() => {
                    setShowStickerSelector(true);
                    setShowAttachPanel(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ChatIcon src={getChatIcon("sticker")} className="w-4 h-4"><Smile className="w-4 h-4 text-slate-700" /></ChatIcon>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">表情</span>
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
                              sendCustomMessage(`[表情]|${sticker.name}|${sticker.url}`, activeRuntimeContext, { triggerReply: false });
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
                  {/* Amount Field */}
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 focus-within:ring-1 focus-within:ring-[#e15241]/30 focus-within:border-[#e15241]/50 transition-all">
                    <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-wider mb-1.5">红包金额 (元)</label>
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
                      if (walletBalance < amt) {
                        showToast("❌ 零钱余额不足，请在“我” -> “钱包”中充值后再发送红包！");
                        return;
                      }
                      // Deduct wallet balance
                      setWalletBalance(prev => {
                        const next = prev - amt;
                        return next;
                      });
                      sendCustomMessage(`[红包]|${finalAmount}|${finalGreeting}`);
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
                            ? (status === "claimed" ? "对方已领收红包" : "等待对方拆开中") 
                            : (status === "claimed" ? "给您发了一个红包" : "给你塞钱进红包啦")}
                        </p>
                      </div>

                      {/* Displaying state-specific header message */}
                      {status === "claimed" ? (
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

                    {/* Footer / Golden Open Button block */}
                    <div className="flex flex-col items-center justify-center shrink-0 mt-6 relative h-28">
                      {status === "unclaimed" && !isSelf ? (
                        // THE LEGENDARY CHINESE "KAI" (OPEN) SPINNING BUTTON WITH BOUNCE SHADOW
                        <button
                          type="button"
                          onClick={() => {
                            if (isOpeningRedPacket) return;
                            setIsOpeningRedPacket(true);
                            setTimeout(() => {
                              setIsOpeningRedPacket(false);
                              // Mark as claimed
                              updateRedPacketStatus(openRedPacketDetail.message, "claimed");
                              // Deposit money
                              const parsed = parseFloat(openRedPacketDetail.amount);
                              if (!isNaN(parsed)) {
                                setWalletBalance(prev => {
                                  const next = prev + parsed;
                                  return next;
                                });
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
                    const raw = localStorage.getItem("phone_music_tracks");
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
                    <div ref={callTranscriptEndRef} aria-hidden="true" className="h-px" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={callingInputText}
                      onChange={(e) => setCallingInputText(e.target.value)}
                      placeholder="输入消息..."
                      className="flex-1 bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-white/30 border border-white/10 rounded-[14px] px-3 py-3 text-sm outline-none transition-all"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendVoiceCallMessage();
                      }}
                    />
                    <button
                      type="button"
                      onClick={sendVoiceCallMessage}
                      disabled={!callingInputText.trim()}
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
          {false && activeTab === "moments" && (() => {
            const filterChar = momentsFilterCharId ? characters.find((c) => c.id === momentsFilterCharId) : null;
            const momentsTabName = filterChar ? (filterChar.remark || filterChar.name) : settings.name;
            const momentsTabAvatar = filterChar ? filterChar.avatar : settings.avatar;
            const momentsTabCover = filterChar ? (filterChar.momentsCover || "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&h=500&fit=crop") : (settings.momentsCover || "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&h=500&fit=crop");
            return (
              <div className="bg-white min-h-full pb-20 overflow-y-auto">
                {/* Moments Cover banner */}
                <div className="h-64 bg-slate-200 relative shrink-0">
                  <img
                    src={momentsTabCover}
                    alt="Moments Cover"
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Overlay Controls */}
                  <button
                    onClick={onClose}
                    className="absolute top-4 left-4 p-1.5 rounded-full bg-black/40 hover:bg-black/65 text-white z-20 transition-colors shadow-sm"
                    title="返回主页"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div className="absolute top-4 right-4 flex gap-2.5 z-20">
                    <label
                      className="p-1.5 rounded-full bg-black/40 hover:bg-black/65 text-white cursor-pointer transition-colors shadow-sm"
                      title="更换封面图"
                    >
                      <Camera className="w-5 h-5" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleMomentsCoverUpload}
                      />
                    </label>
                    <button
                      onClick={() => setShowMomentPublisher(true)}
                      className="p-1.5 rounded-full bg-black/40 hover:bg-black/65 text-white transition-colors shadow-sm"
                      title="发布新动态"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Overlapping User Avatar & Name */}
                  <div className="absolute right-4 -bottom-6 flex items-end gap-3 z-30">
                    <span className="text-sm font-bold text-white tracking-tight pb-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none">
                      {momentsTabName}
                    </span>
                    <img
                      src={momentsTabAvatar}
                      alt=""
                      className="w-16 h-16 rounded-[12px] border-2 border-white object-cover bg-white shadow-md z-40"
                    />
                  </div>
                </div>

                {/* Top Spacing for Overlapping Avatar */}
                <div className="h-10"></div>

                {/* Filter State Banner */}
                {momentsFilterCharId && (
                  <div className="mx-4 my-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-500">正在查看好友的朋友圈</span>
                    <button
                      onClick={() => setMomentsFilterCharId(null)}
                      className="text-blue-500 hover:text-blue-600 font-bold"
                    >
                      查看全部
                    </button>
                  </div>
                )}

                {/* Moments publishing Modal inline */}
                {showMomentPublisher && (
                  <form
                    onSubmit={handlePublishMoment}
                    className="bg-white p-4 border border-slate-100 space-y-3 mx-4 my-3 rounded-2xl shadow-sm"
                  >
                    <div className="flex justify-between items-center pb-1">
                      <span className="text-xs font-bold text-slate-400">分享新鲜事...</span>
                      <button type="button" onClick={() => setShowMomentPublisher(false)} className="text-slate-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <textarea
                      rows={3}
                      required
                      value={momentInputText}
                      onChange={(e) => setMomentInputText(e.target.value)}
                      placeholder="说点什么吧，可以配个好看的插图..."
                      className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-100 focus:outline-none text-xs resize-none leading-relaxed text-left"
                    />

                    <div className="flex justify-between items-center">
                      <label className="cursor-pointer text-slate-400 hover:text-blue-500 flex items-center gap-1.5 text-xs font-semibold">
                        <ImageIcon className="w-4 h-4" />
                        <span>添加配图</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleMomentImageUpload}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setShowTextImageInput((value) => !value)}
                        className="text-slate-400 hover:text-blue-500 flex items-center gap-1.5 text-xs font-semibold"
                      >
                        <FileText className="w-4 h-4" />
                        <span>文字图</span>
                      </button>

                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-neutral-950 hover:bg-neutral-900 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                      >
                        发布动态
                      </button>
                    </div>

                    {showTextImageInput && (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 space-y-2">
                        <p className="text-[11px] text-slate-500">填写图片描述。发布后会以文字图显示，点击可查看完整描述。</p>
                        <textarea
                          rows={2}
                          value={momentTextImageDescription}
                          onChange={(e) => setMomentTextImageDescription(e.target.value)}
                          placeholder="例如：傍晚的操场，跑道边放着一瓶喝了一半的水"
                          className="w-full px-2.5 py-2 rounded-lg bg-white border border-slate-200 focus:outline-none text-xs resize-none"
                        />
                      </div>
                    )}

                    {momentAttachedImage && (
                      <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                        <img src={momentAttachedImage} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setMomentAttachedImage(null)}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </form>
                )}

              {/* Moments list */}
              <div className="px-4 divide-y divide-slate-100 max-w-md mx-auto">
                {filteredMoments.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs">
                    暂无动态，点击右上角相机发布第一条朋友圈吧！
                  </div>
                ) : (
                  filteredMoments.map((mom) => {
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
                          <h4 className="text-xs font-bold text-[#576b95] hover:underline cursor-pointer">
                            {momAuthorName}
                          </h4>

                          {/* Content text */}
                          <p 
                            className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap mt-1 select-none cursor-pointer hover:bg-slate-50/50 rounded p-1 transition-colors relative"
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

                          {/* Attached Photo */}
                          {textImageDescription && (
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
                            <div className="mt-2.5 rounded-lg overflow-hidden border border-slate-100 max-w-[200px] max-h-52 flex justify-start bg-slate-50">
                              <img src={mom.image} alt="" className="object-contain max-h-52 rounded-lg" />
                            </div>
                          )}

                          {/* Footer Action Row */}
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

                          {/* Integrated Like & Comment Block (WeChat style) */}
                          {(mom.likes.length > 0 || getMomentComments(mom).length > 0) && (
                            <div className="moments-reaction-shelf bg-[#f7f7f7] rounded-[4px] p-2 text-[11px] mt-2 space-y-2">
                              {/* Likes list */}
                              {mom.likes.length > 0 && (
                                <div className="moments-reaction-divider flex items-center gap-1.5 text-[#576b95] font-bold flex-wrap pb-1">
                                  <Heart className="w-3 h-3 text-rose-500 fill-current shrink-0" />
                                  <span className="leading-tight">{mom.likes.join(", ")}</span>
                                </div>
                              )}

                              {/* Comments list */}
                              {getMomentComments(mom).length > 0 && (
                                <div className="moments-comment-list py-0.5">
                                  {getMomentComments(mom).map((comm) => {
                                    const commChar = characters.find((c) => c.name === comm.authorName);
                                    const commAuthorName = commChar ? (commChar.remark || commChar.name) : comm.authorName;
                                    return (
                                      <div
                                        key={comm.id}
                                        onClick={() => handleMomentCommentClick(mom.id, comm)}
                                        onPointerDown={() => handleMomentCommentPointerDown(mom.id, comm.id)}
                                        onPointerUp={clearMomentCommentLongPress}
                                        onPointerLeave={clearMomentCommentLongPress}
                                        onPointerCancel={clearMomentCommentLongPress}
                                        onContextMenu={(event) => event.preventDefault()}
                                        className="py-1.5 leading-relaxed text-slate-800 cursor-pointer transition-colors text-[11px] block text-left moments-comment-item"
                                        title={`点击回复；长按删除评论`}
                                      >
                                        <span className="font-bold text-[#576b95] mr-1">
                                          {commAuthorName}
                                        </span>
                                        <span className="text-slate-700">{comm.content}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Quick inline comment input */}
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
          )})()}

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
                          const isActive = idty.name === settings.name;
                          return (
                            <div
                              key={idty.id}
                              onClick={() => {
                                setEditMyName(idty.name);
                                setEditMyAvatar(idty.avatar);
                                setEditMySignature(idty.signature || "");
                                setEditMyBio(idty.bio || "");
                                onSaveSettings({
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
                            const [_, amountStr, greetingStr] = m.content.split("|");
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
                            className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap mt-1 select-none cursor-pointer hover:bg-slate-50/50 rounded p-1 transition-colors relative"
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
                          {textImageDescription && (
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
                            <div className="mt-2.5 rounded-lg overflow-hidden border border-slate-100 max-w-[200px] max-h-52 flex justify-start bg-slate-50">
                              <img src={mom.image} alt="" className="object-contain max-h-52 rounded-lg" />
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
                                        onPointerDown={() => handleMomentCommentPointerDown(mom.id, comm.id)}
                                        onPointerUp={clearMomentCommentLongPress}
                                        onPointerLeave={clearMomentCommentLongPress}
                                        onPointerCancel={clearMomentCommentLongPress}
                                        onContextMenu={(event) => event.preventDefault()}
                                        className="py-1.5 leading-relaxed text-slate-800 cursor-pointer transition-colors text-[11px] block text-left moments-comment-item"
                                        title={`点击回复；长按删除评论`}
                                      >
                                        <span className="font-bold text-[#576b95] mr-1">{commAuthorName}</span>
                                        <span className="text-slate-700">{comm.content}</span>
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
                          
                          onSaveSettings({
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
      {activeMenuMsg && (
        <div 
          className="fixed inset-0 z-50 bg-black/10 flex items-center justify-center backdrop-blur-[1px]"
          onClick={() => setActiveMenuMsg(null)}
          onContextMenu={(e) => { e.preventDefault(); setActiveMenuMsg(null); }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-stone-200/80 p-2.5 min-w-[140px] text-stone-800 space-y-1"
            style={{
              position: "absolute",
              top: Math.max(10, Math.min(window.innerHeight - 220, menuPosition.y - 10)),
              left: Math.max(10, Math.min(window.innerWidth - 160, menuPosition.x - 70)),
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
      )}

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
            className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-stone-200/80 p-2.5 min-w-[140px] text-stone-800 space-y-1"
            style={{
              position: "absolute",
              top: Math.max(10, Math.min(window.innerHeight - 220, momentContextMenu.y - 10)),
              left: Math.max(10, Math.min(window.innerWidth - 160, momentContextMenu.x - 70)),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleCopyMomentText(momentContextMenu.text)}
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-stone-500" />
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
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Heart className={`w-3.5 h-3.5 ${momentFavorites.some(f => f.momentId === momentContextMenu.momentId && f.content === momentContextMenu.text) ? "fill-rose-500 text-rose-500" : "text-stone-400"}`} />
              <span>
                {momentFavorites.some(f => f.momentId === momentContextMenu.momentId && f.content === momentContextMenu.text) ? "取消收藏" : "加入收藏"}
              </span>
            </button>

            <button
              onClick={() => handleTranslateMoment(momentContextMenu.momentId, momentContextMenu.text)}
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-stone-700 transition-colors"
            >
              <Languages className="w-3.5 h-3.5 text-stone-500" />
              <span>{momentTranslations[momentContextMenu.momentId] ? "显示原文" : "AI 翻译"}</span>
            </button>

            <button
              onClick={() => handleDeleteMomentClick(momentContextMenu.momentId)}
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 text-red-500 hover:text-red-600 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
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
