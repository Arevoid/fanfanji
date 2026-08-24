import React, { useEffect } from "react";
import { 
  ArrowLeft, Plus, Trash2, Pencil, Send, Sparkles, BookOpen,
  Link2, Calendar, MessageSquare, ChevronRight,
  RefreshCw, Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Character, Message, OfflineStory, MemoryItem, MemoryVaultSettings, UserSettings, WorldBookEntry } from "../types";
import { apiChat, apiExtractMemoriesWithModelFallback } from "../utils/apiHelper";
import { appendMany as appendKnowledgeClaims, loadKnowledgeClaims } from "../core/storage/repositories/characterKnowledgeRepository";
import { formatDelicateMemoryDiary, formatExtractedMemorySummary, MemoryService } from "../domain/memory/MemoryService";
import { shouldAutoSyncOnlineContinuation } from "../domain/memory/offlineMemorySync";
import { canSyncOfflineStoryToMemory } from "../domain/offlineStory/offlineStoryFactPolicy";
import { getLatestWorldBookEntries } from "../utils/worldBook";
import { loadMessages } from "../core/storage/repositories/messageRepository";
import "./offline/offlineStory.css";
import { OfflineGuidancePanel } from "./offline/OfflineGuidancePanel";
import { OfflineReadingPreferences, OfflineReadingSettings } from "./offline/OfflineReadingSettings";
import { OfflineWorkspaceHeader } from "../features/offline/components/OfflineWorkspaceHeader";
import { useOfflineStorySettings } from "../features/offline/hooks/useOfflineStorySettings";
import { useOfflineToast } from "../features/offline/hooks/useOfflineToast";
import { OfflineStoryCard } from "./offline/OfflineStoryCard";
import { MessageList } from "../features/chat/components/MessageList";
import { OfflineStoryEditor } from "./offline/OfflineStoryEditor";
import { resolveCanonicalCharacterId, resolveOfflineStoryCharacterId, resolveOfflineStoryCharacterIds } from "../domain/character/characterIdentity";
import { findRelationshipForCanonicalCharacter, getConversationId, getOfflineGroupModeStorageKey, getOfflineGroupStoryStorageKey, getOfflineModeStorageKey, getOfflineStoryStorageKey, type CharacterRelationship } from "../domain/relationship/characterRelationship";
import { applyConfirmedOfflineRelationshipTransition } from "../domain/relationship/offlineRelationshipTransition";
import type { KnowledgeClaim } from "../domain/characterKnowledge/characterKnowledgeTypes";
import { countOfflineStoriesForRelation } from "../domain/relationship/offlineStoryScope";
import { resolveOfflineChatNavigationTarget } from "../domain/relationship/offlineChatNavigation";
import { captureOfflineStoryCompletedEvent } from "../features/characterLife/services/offlineStoryEventCaptureService";
import { buildOfflineIdentityBinding, removeSingleActorSelfVocative } from "../domain/prompt/offlineIdentityBinding";
import { Button, ConfirmDialog, IconButton } from "./ui";
import { PromptComposer } from "../domain/prompt/PromptComposer";
import { collectOfflineWorldBookContext, formatOfflineWorldBookEntries } from "../features/offline/prompts/offlineWorldBookContext";
import { applyOfflineStoryRegeneration, prepareOfflineStoryRegeneration } from "../domain/offlineStory/offlineStoryRegeneration";
import { createOfflineGroupParticipantMemories } from "../features/offline/services/offlineGroupMemorySync";
import { useOfflineWorkspaceScope } from "../features/offline/hooks/useOfflineWorkspaceScope";
import { useOfflineStoryCreationState } from "../features/offline/hooks/useOfflineStoryCreationState";
import { useOfflineStoryCreationActions } from "../features/offline/hooks/useOfflineStoryCreationActions";
import { useOfflineStoryMemorySyncActions } from "../features/offline/hooks/useOfflineStoryMemorySyncActions";
import { useOfflineStoryGenerationActions } from "../features/offline/hooks/useOfflineStoryGenerationActions";
import { useOfflineReadingState } from "../features/offline/hooks/useOfflineReadingState";
import { useOfflineStoryRuntimeState } from "../features/offline/hooks/useOfflineStoryRuntimeState";
import { useOfflineStoryPersistence } from "../features/offline/hooks/useOfflineStoryPersistence";
import { useOfflineMessageEditorState } from "../features/offline/hooks/useOfflineMessageEditorState";
import { useOfflineMessageEditorActions } from "../features/offline/hooks/useOfflineMessageEditorActions";
import { useOfflineStoryManagementActions } from "../features/offline/hooks/useOfflineStoryManagementActions";
import { useOfflineMessageActions } from "../features/offline/hooks/useOfflineMessageActions";
import { useOfflineRegenerationActions } from "../features/offline/hooks/useOfflineRegenerationActions";
import { useOfflineWorkspaceExitActions } from "../features/offline/hooks/useOfflineWorkspaceExitActions";
import { useOfflineStoryExitFinalization } from "../features/offline/hooks/useOfflineStoryExitFinalization";
import { useOfflineStoryAutoStart } from "../features/offline/hooks/useOfflineStoryAutoStart";
import { getOfflineStoryMemoryRepairNeeds } from "../features/offline/services/offlineStoryMemoryRepairPolicy";
import { serializeMessageContentForPrompt, serializeMessageToPromptTurns } from "../features/chat/prompts/messagePromptSerializer";
import { writeString } from "../core/storage/storageAdapter";
import { createId } from "../core/id/createId";
import type { Appointment } from "../domain/schedule/scheduleTypes";
import { isWorldBookEntryForAnyCharacter, isWorldBookEntryForCharacter } from "../domain/worldbook/worldBookVisibility";
import { buildOfflineHandoffFacts, formatOfflineHandoffFactsForPrompt, OFFLINE_HANDOFF_MESSAGE_LIMIT } from "../domain/offlineStory/offlineHandoffContext";

interface AppOfflineProps {
  characters: Character[];
  relationships: CharacterRelationship[];
  settings: UserSettings;
  offlineStories: OfflineStory[];
  onSaveOfflineStory: (story: OfflineStory) => boolean | Promise<boolean>;
  onSaveRelationships: (relationships: CharacterRelationship[]) => void;
  onDeleteOfflineStory: (storyId: string) => void;
  onClose: () => void;
  onNavigateToChat?: (charId: string, relationId?: string, conversationId?: string) => void;
  memories: MemoryItem[];
  onSaveMemories: (mems: MemoryItem[]) => void;
  /** Resolves only after the offline handoff memories are durably persisted. */
  onPersistMemories?: (mems: MemoryItem[]) => boolean | Promise<boolean>;
  recallSettings: MemoryVaultSettings;
  messages?: Message[];
  activeChatCharId?: string | null;
  activeChatRelationId?: string | null;
  worldBookEntries?: WorldBookEntry[];
  appointments?: Appointment[];
  onSaveAppointment?: (appointment: Appointment) => boolean;
  /** Story requested by the previous chat screen; consumed by the story opener. */
  openStoryId?: string | null;
  onOpenOfflineStoryHandled?: (storyId: string) => void;
}

export default function AppOffline({
  characters = [],
  relationships = [],
  settings,
  offlineStories = [],
  onSaveOfflineStory,
  onSaveRelationships,
  onDeleteOfflineStory,
  onClose,
  onNavigateToChat,
  memories = [],
  onSaveMemories,
  onPersistMemories,
  recallSettings,
  messages = [],
  activeChatCharId = null,
  activeChatRelationId = null,
  worldBookEntries = [],
  appointments = [],
  onSaveAppointment,
  openStoryId = null,
  onOpenOfflineStoryHandled,
}: AppOfflineProps) {
  const activeIdentityId = settings.activeIdentityId || "identity-1";
  const resolveCharacterId = (characterId: string) => resolveCanonicalCharacterId(characterId, characters);
  const { toast, showToast } = useOfflineToast();
  const {
    selectableCharacters,
    selectableCharacterIds,
    selectedCharId,
    setSelectedCharId,
    selectedRelationId,
    setSelectedRelationId,
    relationChoices,
    activeStory,
    setActiveStory,
    activeStoryRef,
    clearActiveStorySnapshot,
    canAccessStoryFromCurrentRelation,
    isGroupOfflineStory,
    handleOpenStory,
    clearOfflineSession,
  } = useOfflineWorkspaceScope({
    characters,
    relationships,
    activeIdentityId,
    activeChatCharId,
    activeChatRelationId,
    offlineStories,
    openStoryId,
    onOpenOfflineStoryHandled,
    showToast,
  });
  const creationCharacters = selectableCharacters.filter((character) => !character.isGroupChat);
  
  const {
    showCreateModal, setShowCreateModal,
    editingStory, setEditingStory,
    editingStoryTitle, setEditingStoryTitle,
    editingStoryIfPrompt, setEditingStoryIfPrompt,
    selectedCharIds, setSelectedCharIds,
    newTitle, setNewTitle,
    newMode, setNewMode,
    newIfPrompt, setNewIfPrompt,
    newStartFromChat, setNewStartFromChat,
    newTimeAwareness, setNewTimeAwareness,
  } = useOfflineStoryCreationState({ selectableCharacters, selectedCharId, characters });

  // Story composer input state
  const {
    inputText, setInputText,
    isGenerating, setIsGenerating,
    errorMsg, setErrorMsg,
    memorySyncInFlightRef,
    memorySyncingStoryId, setMemorySyncingStoryId,
    storyPersistenceRef,
    workspaceScrollRef,
    workspaceEndRef,
  } = useOfflineStoryRuntimeState();

  const { saveActiveStorySnapshot } = useOfflineStoryPersistence({
    activeStoryRef,
    setActiveStory,
    storyPersistenceRef,
    onSaveOfflineStory,
    showToast,
  });
  const { handleCreateStory } = useOfflineStoryCreationActions({
    characters,
    relationships,
    messages,
    memories,
    worldBookEntries: worldBookEntries || [],
    activeIdentityId,
    selectedCharId,
    selectedCharIds,
    selectedRelationId,
    relationChoices,
    newTitle,
    newMode,
    newIfPrompt,
    newStartFromChat,
    newTimeAwareness,
    onSaveStorySnapshot: saveActiveStorySnapshot,
    setShowCreateModal,
    setNewTitle,
    setNewMode,
    setNewIfPrompt,
    setNewStartFromChat,
    setNewTimeAwareness,
    showToast,
  });

  const { editingMessageId, setEditingMessageId, editingText, setEditingText } = useOfflineMessageEditorState();

  const { handleStartEdit, handleSaveEdit, handleCancelEdit } = useOfflineMessageEditorActions({
    activeStory,
    editingText,
    saveActiveStorySnapshot,
    setEditingMessageId,
    setEditingText,
    showToast,
  });

  const {
    isReadingSettingsOpen, setIsReadingSettingsOpen,
    readingPreferences, setReadingPreferences,
    activeNodeMenuId, setActiveNodeMenuId,
    pendingDeleteMessageId, setPendingDeleteMessageId,
    isGuidancePanelOpen, setIsGuidancePanelOpen,
    guidanceDraft, setGuidanceDraft,
  } = useOfflineReadingState(activeStory);
  const offlineStorySettings = useOfflineStorySettings({
    activeStory,
    characters,
    worldBookEntries: worldBookEntries || [],
    saveStory: saveActiveStorySnapshot,
    showToast,
  });
  const {
    isSettingsOpen, setIsSettingsOpen, customPresets, defaultStylePresets,
    settingsWordLimit, setSettingsWordLimit, settingsPartnerP, setSettingsPartnerP,
    settingsUserP, setSettingsUserP, settingsAllowCharacterToSpeakForUser, setSettingsAllowCharacterToSpeakForUser,
    settingsStylePresetId, setSettingsStylePresetId, settingsStylePromptName, setSettingsStylePromptName,
    settingsStylePromptContent, setSettingsStylePromptContent, settingsCustomCss, setSettingsCustomCss,
    hasSelectedCustomPreset, handleSaveSettings, handleRefreshWorldBookSnapshot, handleCreateCustomPreset, handleDeleteCustomPreset,
  } = offlineStorySettings;
  const selectedChar = selectableCharacters.find(c => c.id === selectedCharId) || selectableCharacters[0];
  const charStories = offlineStories.filter((story) =>
    canAccessStoryFromCurrentRelation(story)
    && (resolveOfflineStoryCharacterId(story, characters) === selectedCharId
      || resolveOfflineStoryCharacterIds(story, characters).includes(selectedCharId))
  );

  // Keep an empty-state-safe actor projection for story views. This is also a
  // compatibility guard for stories created before characterIds was added.
  const storyChars: Character[] = activeStory
    ? (activeStory.characterIds && activeStory.characterIds.length > 0
        ? selectableCharacters.filter(c => resolveOfflineStoryCharacterIds(activeStory, characters).includes(c.id))
        : selectedChar ? [selectedChar] : [])
    : selectedChar ? [selectedChar] : [];
  void storyChars;

  // Online messages are an invisible handoff context, never part of the offline
  // manuscript. The id check also hides snapshots created before this flag existed.
  const visibleStoryMessages = (Array.isArray(activeStory?.messages) ? activeStory.messages : []).filter((message) =>
    !message.isImportedContext && !message.id.startsWith("offline-import-")
  );
  const editingMessage = (Array.isArray(activeStory?.messages) ? activeStory.messages : []).find((message) => message.id === editingMessageId) || null;
  const readingStyle = {
    "--offline-reading-font-size": `calc(${readingPreferences.fontSize}px * var(--app-font-scale, 1))`,
    "--offline-reading-letter-spacing": `${readingPreferences.letterSpacing}em`,
    "--offline-reading-line-height": String(readingPreferences.lineHeight),
    "--offline-reading-paragraph-gap": `${readingPreferences.paragraphSpacing}px`,
    "--offline-reading-text": readingPreferences.textColor.toUpperCase() === "#1D1D1F" ? "var(--text-primary)" : readingPreferences.textColor,
    "--offline-reading-card": readingPreferences.cardBackground.toUpperCase() === "#FFFFFF" ? "var(--surface)" : readingPreferences.cardBackground,
  } as React.CSSProperties;
  const linkedChatTarget = activeStory
    ? resolveOfflineChatNavigationTarget({
        story: activeStory,
        relationships,
        characters,
        ownerIdentityId: activeIdentityId,
      })
    : null;

  useEffect(() => {
    if (workspaceEndRef.current) {
      workspaceEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeStory?.messages, isGenerating]);

  const getMemoryRepairNeeds = (story: OfflineStory) => getOfflineStoryMemoryRepairNeeds(story, memories);
  const needsLegacyHandoffRepair = (story: OfflineStory) => getMemoryRepairNeeds(story).legacyHandoff;
  const needsMissingSummaryRepair = (story: OfflineStory) => getMemoryRepairNeeds(story).missingSummary;
  const needsUninformativeSummaryRepair = (story: OfflineStory) => getMemoryRepairNeeds(story).uninformativeSummary;

  const { handleSyncMemoryToBrain } = useOfflineStoryMemorySyncActions({
    characters,
    relationships,
    settings,
    memories,
    recallSettings,
    activeIdentityId,
    activeStoryRef,
    memorySyncInFlightRef,
    setMemorySyncingStoryId,
    onSaveOfflineStory,
    onSaveMemories,
    onPersistMemories,
    onSaveRelationships,
    saveActiveStorySnapshot,
    showToast,
    needsLegacyHandoffRepair,
    needsMissingSummaryRepair,
    needsUninformativeSummaryRepair,
  });

  const shouldSyncStoryMemory = (story: OfflineStory) =>
    story.mode === "continue"
    && (shouldAutoSyncOnlineContinuation(story)
      || needsLegacyHandoffRepair(story)
      || needsMissingSummaryRepair(story)
      || needsUninformativeSummaryRepair(story));

  const { finalizeStoryBeforeLeaving } = useOfflineStoryExitFinalization({
    activeStoryRef,
    appointments,
    shouldSyncStoryMemory,
    handleSyncMemoryToBrain,
    onSaveAppointment,
    onSaveOfflineStory,
    saveActiveStorySnapshot,
    showToast,
  });

  const { handleExitStoryWorkspace, handleReturnToOnlineChat } = useOfflineWorkspaceExitActions({
    activeStoryRef,
    storyPersistenceRef,
    finalizeStoryBeforeLeaving,
    clearOfflineSession,
    clearActiveStorySnapshot,
    setIsSettingsOpen,
    showToast,
    onNavigateToChat,
    resolveChatTarget: (story) => resolveOfflineChatNavigationTarget({
      story,
      relationships,
      characters,
      ownerIdentityId: activeIdentityId,
    }),
  });

  const { handleDeleteStory, handleStartEditStory, handleSaveStoryEdit } = useOfflineStoryManagementActions({
    offlineStories,
    activeStoryRef,
    clearOfflineSession,
    onDeleteOfflineStory,
    clearActiveStorySnapshot,
    onSaveOfflineStory,
    saveActiveStorySnapshot,
    showToast,
    editingStory,
    editingStoryTitle,
    editingStoryIfPrompt,
    setEditingStory,
    setEditingStoryTitle,
    setEditingStoryIfPrompt,
  });

  const { handleDeleteMessage } = useOfflineMessageActions({
    activeStory,
    saveActiveStorySnapshot,
    showToast,
  });

  const { handleSendMessage } = useOfflineStoryGenerationActions({
    activeStory,
    activeStoryRef,
    characters,
    selectableCharacters,
    relationships,
    memories,
    settings,
    worldBookEntries: worldBookEntries || [],
    selectedChar,
    inputText,
    isGenerating,
    setInputText,
    setIsGenerating,
    setErrorMsg,
    resolveCharacterId,
    saveActiveStorySnapshot,
    showToast,
    guidanceDraft,
    setGuidanceDraft,
  });

  const { handleRegenerateMessage } = useOfflineRegenerationActions({ setActiveNodeMenuId, handleSendMessage });

  useOfflineStoryAutoStart({ activeStory, activeStoryRef, isGenerating, saveActiveStorySnapshot, handleSendMessage });

  return (
    <div
      data-theme-page="offline"
      className="offline-page w-full h-full min-h-0 flex flex-col relative overflow-hidden font-sans select-none"
      style={readingStyle}
    >
      
      {/* Dynamic Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100%-32px)] whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 shadow-md"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!activeStory ? (
          /* ================= STORY DIRECTORY VIEW ================= */
          <motion.div 
            key="story-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-slate-50"
          >
            {/* Header */}
            <div className="px-4 py-3.5 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <button 
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h1 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <span>线下剧本模式</span>
                  </h1>
                  <p className="text-[10px] text-slate-500">线下独立走向，与线上大脑记忆互通</p>
                </div>
              </div>

              <button 
                onClick={() => selectedChar && setShowCreateModal(true)}
                disabled={!selectedChar}
                className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shadow-sm transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                title={selectedChar ? (selectedChar.isGroupChat ? "新建多人故事" : "新建故事") : "请先在档案馆创建角色"}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Character Selector Grid */}
            <div className="p-3 bg-white border-b border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">选择人物剧本空间</p>
              <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar">
                {selectableCharacters.map(char => {
                  const isSel = char.id === selectedCharId;
                  const charRelation = relationships.find((relation) =>
                    relation.userIdentityId === activeIdentityId
                    && resolveCanonicalCharacterId(relation.characterId, characters) === char.id,
                  );
                  const charStoriesCount = char.isGroupChat
                    ? offlineStories.filter((story) =>
                        canAccessStoryFromCurrentRelation(story)
                        && resolveOfflineStoryCharacterId(story, characters) === char.id,
                      ).length
                    : charRelation
                    ? countOfflineStoriesForRelation({
                        stories: offlineStories,
                        relationId: charRelation.id,
                        characterId: char.id,
                        relationships,
                        characters,
                      })
                    : 0;
                  return (
                    <button
                      key={char.id}
                      onClick={() => setSelectedCharId(char.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all shrink-0 ${
                        isSel 
                          ? "bg-slate-900 border-slate-900 text-white font-bold shadow-sm" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300"
                      }`}
                    >
                      <img src={char.avatar} alt="" className="w-5 h-5 rounded-full object-cover border border-slate-200" />
                      <span className="text-xs font-bold">{char.remark || char.name}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500">
                        {charStoriesCount}
                      </span>
                    </button>
                  );
                })}
              </div>
              {relationChoices.length > 0 && (
                <div className="mt-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {relationChoices.map((relation) => {
                    const identity = settings.identities?.find((item) => item.id === relation.userIdentityId);
                    return <button key={relation.id} onClick={() => setSelectedRelationId(relation.id)} className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 ${selectedRelationId === relation.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{identity?.name || relation.userIdentityId}</button>;
                  })}
                </div>
              )}
            </div>

            {/* Stories Directory Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h2 className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  <span>故事列表 ({charStories.length})</span>
                </h2>
                {selectedChar && (
                  <span className="text-[11px] text-slate-500">当前角色: {selectedChar.remark || selectedChar.name}</span>
                )}
              </div>

              {!selectedChar ? (
                <div className="py-16 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-700">还没有可用的角色档案</p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">请先在档案馆创建角色，再回来开启线下故事。</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all inline-block shadow-sm"
                  >
                    返回桌面
                  </button>
                </div>
              ) : charStories.length === 0 ? (
                <div className="py-16 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-700">暂无线下故事</p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">选择角色并点击右上角的“新建故事”来开启一段惊心动魄的虚构走向吧！</p>
                  </div>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all inline-block shadow-sm"
                  >
                    立刻开启新故事
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {charStories.map(story => {
                    const storyModeLabel = story.mode === "director" ? "导演" : story.mode === "if" ? "IF线" : "续写";
                    const storyModeColor = story.mode === "director" ? "bg-rose-50 text-rose-600 border-rose-200/60" : story.mode === "if" ? "bg-amber-50 text-amber-600 border-amber-200/60" : "bg-teal-50 text-teal-600 border-teal-200/60";
                    const storyParticipantIds = resolveOfflineStoryCharacterIds(story, characters);
                    const storyParticipants = storyParticipantIds
                      .map((participantId) => characters.find((character) => character.id === participantId))
                      .filter((character): character is Character => Boolean(character));
                    const participantSnapshots = story.participantSnapshots || storyParticipants.map((character) => ({
                      id: character.id,
                      name: character.remark || character.name,
                      avatar: character.avatar,
                    }));
                    const isMultiplayerStory = storyParticipantIds.length > 1;
                    return (
                      <div
                        key={story.id}
                        onClick={() => handleOpenStory(story)}
                        className="p-4 rounded-2xl bg-white border border-slate-150 hover:border-slate-250 hover:bg-slate-50/50 cursor-pointer transition-all flex items-start justify-between group shadow-sm hover:shadow-md"
                      >
                        <div className="space-y-2 flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${storyModeColor}`}>
                              {storyModeLabel}
                            </span>
                            {story.sourceChatId && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-0.5">
                                <Link2 className="w-2.5 h-2.5 text-slate-400" />
                                引用线上
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(story.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                          
                          <h3 className="text-sm font-bold text-slate-800 group-hover:text-slate-900 transition-colors truncate">
                            {story.title}
                          </h3>

                          {story.mode === "if" && story.ifPrompt && (
                            <p className="text-xs text-amber-600 font-medium italic truncate max-w-full">
                              设定: {story.ifPrompt}
                            </p>
                          )}

                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                            <span>共 {story.messages.length} 段剧情记录</span>
                          </div>

                          {isMultiplayerStory && (
                            <div className="flex items-center gap-2 pt-1" aria-label={`参与角色：${participantSnapshots.map((participant) => participant.name).join("、")}`}>
                              <div className="flex -space-x-2">
                                {participantSnapshots.slice(0, 6).map((participant) => (
                                  <img
                                    key={participant.id}
                                    src={participant.avatar || ""}
                                    alt={participant.name}
                                    title={participant.name}
                                    className="h-7 w-7 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm"
                                  />
                                ))}
                                {participantSnapshots.length > 6 && (
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[9px] font-bold text-slate-600">
                                    +{participantSnapshots.length - 6}
                                  </span>
                                )}
                              </div>
                              <span className="min-w-0 truncate text-[10px] text-slate-500">
                                {participantSnapshots.map((participant) => participant.name).join("、")}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end justify-between h-full space-y-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => handleStartEditStory(story, e)}
                              className="w-7 h-7 rounded-lg bg-slate-150/70 hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all border border-slate-200"
                              title="编辑剧本"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteStory(story.id, e)}
                              className="w-7 h-7 rounded-lg bg-slate-150/70 hover:bg-red-50 text-slate-500 hover:text-red-600 flex items-center justify-center transition-all opacity-100 border border-slate-200"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          /* ================= ACTIVE STORY WORKSPACE ================= */
          <motion.div 
            key="story-workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-slate-50 offline-workspace-container"
          >
            {isSettingsOpen ? (
              /* ================= STORY SETTINGS PAGE ================= */
              <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-[#F7F7F9]">
                {/* Header */}
                <div className="px-4 py-3 bg-white border-b border-[#F0F0F0] flex items-center justify-between shadow-sm z-10 shrink-0 relative">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                    title="返回剧本空间"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <h3 className="text-base font-semibold text-[#111111] absolute left-1/2 -translate-x-1/2 w-max">
                    剧本高级设置
                  </h3>
                  <div className="w-8 h-8" />
                </div>

                {/* Settings Body */}
                <div className="flex-1 overflow-y-auto px-4 pb-[calc(34px+16px)] pt-4 space-y-5">
                  {/* Sync memory button is now placed at the top of settings as requested */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-medium text-[#999999]">同步设置</h4>
                    <div className="rounded-2xl border border-[#F0F0F0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-2 text-left">
                    <span className="text-[15px] font-medium text-[#111111]">同步剧本记忆</span>
                    <p className="text-xs leading-5 text-[#8E8E93]">
                      {activeStory.mode === "continue"
                        ? "续写剧情结束时会自动总结并同步；也可以在此立即同步当前进展。"
                        : "导演和 IF 模式结束时不会自动同步。只有点击下方按钮手动确认后，剧情才会进入角色长期记忆并同步到线上。"}
                    </p>
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      onClick={() => void handleSyncMemoryToBrain(activeStory, { userConfirmed: true, syncIntent: "manual_settings" })}
                      loading={memorySyncingStoryId === activeStory.id}
                      loadingLabel="同步中，请稍候…"
                      className="text-xs"
                    >
                      同步当前进展记忆至角色大脑
                    </Button>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm font-medium text-[#999999]">世界书快照</h4>
                    <div className="rounded-2xl border border-[#F0F0F0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-2 text-left">
                      <span className="text-[15px] font-medium text-[#111111]">当前快照 {activeStory.worldBookSnapshot?.length || 0} 条</span>
                      <p className="text-xs leading-5 text-[#8E8E93]">
                        剧情每轮只会从快照中按常驻词条或最近约 10 条剧情关键词激活。刷新后，后续剧情才会使用当前项目中的最新世界书。
                      </p>
                      <button
                        type="button"
                        onClick={handleRefreshWorldBookSnapshot}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#F0F0F0] bg-[#F7F7F9] py-3 text-xs font-semibold text-[#111111] transition-colors hover:bg-[#EFEFF4]"
                      >
                        <RefreshCw className="h-4 w-4" />
                        刷新世界书快照
                      </button>
                    </div>
                  </section>

                  {/* Word limit */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-medium text-[#999999]">生成设置</h4>
                  <div className="rounded-2xl border border-[#F0F0F0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3 text-left">
                    <label className="text-[15px] font-medium text-[#111111] block">每次生成回复字数限制</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={settingsWordLimit}
                        onChange={(e) => setSettingsWordLimit(e.target.value)}
                        placeholder="不限制 (或输入数字，如：300)"
                        className="flex-1 rounded-[14px] border border-[#F0F0F0] bg-[#F7F7F9] px-3 py-2 text-sm text-[#111111] outline-none focus:border-slate-400"
                      />
                      {settingsWordLimit && (
                        <button
                          type="button"
                          onClick={() => setSettingsWordLimit("")}
                          className="px-2.5 py-1 text-xs font-medium border border-[#F0F0F0] rounded-lg text-[#8E8E93] hover:bg-[#F7F7F9]"
                        >
                          清除限制
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#8E8E93]">设定单次生成的最大字数范围，避免回复过长或过短。</p>

                    <div className="border-t border-[#F0F0F0] pt-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[15px] font-medium text-[#111111]">允许对方替我做出回应</div>
                          <p className="mt-1 text-xs leading-5 text-[#8E8E93]">关闭后，对方不能替你说话、决定或补写新的主动回应。</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={settingsAllowCharacterToSpeakForUser}
                          onClick={() => setSettingsAllowCharacterToSpeakForUser((current) => !current)}
                          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settingsAllowCharacterToSpeakForUser ? "bg-[#111111]" : "bg-[#E5E5EA]"}`}
                        >
                          <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${settingsAllowCharacterToSpeakForUser ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-[#F0F0F0] pt-3">
                    <label className="text-[15px] font-medium text-[#111111] block">人称写作视角选择</label>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-xs text-[#8E8E93] block">对方（角色们）的人称</span>
                        <select
                          value={settingsPartnerP}
                          onChange={(e) => setSettingsPartnerP(e.target.value)}
                          className="w-full rounded-[14px] border border-[#F0F0F0] bg-[#F7F7F9] px-2.5 py-2 text-sm text-[#111111] outline-none focus:border-slate-400"
                        >
                          <option value="third">名字</option>
                          <option value="first">我</option>
                          <option value="second">你</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs text-[#8E8E93] block">我（主角/用户）的人称</span>
                        <select
                          value={settingsUserP}
                          onChange={(e) => setSettingsUserP(e.target.value)}
                          className="w-full rounded-[14px] border border-[#F0F0F0] bg-[#F7F7F9] px-2.5 py-2 text-sm text-[#111111] outline-none focus:border-slate-400"
                        >
                          <option value="first">我</option>
                          <option value="second">你</option>
                          <option value="third">名字</option>
                        </select>
                      </div>
                    </div>
                    </div>
                  </div>
                  </section>

                  {/* Style Presets */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-medium text-[#999999]">文风设置</h4>
                  <div className="rounded-2xl border border-[#F0F0F0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3 text-left">
                    <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">自定义剧本文风设定</label>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 block font-medium">快捷文风预设</span>
                      <div className="flex items-center gap-2">
                      <select
                        value={settingsStylePresetId}
                        onChange={(e) => {
                          const selId = e.target.value;
                          setSettingsStylePresetId(selId);
                          const matched = [...defaultStylePresets.slice(0, 1), ...customPresets].find(p => p.id === selId);
                          if (matched) {
                            setSettingsStylePromptName(matched.name === "默认风格" ? "" : matched.name);
                            setSettingsStylePromptContent(selId === "none" ? "" : matched.description);
                          }
                        }}
                        className="min-w-0 flex-1 rounded-[14px] border border-[#F0F0F0] bg-[#F7F7F9] px-2.5 py-2 text-sm text-[#111111] outline-none focus:border-slate-400"
                      >
                        {[...defaultStylePresets.slice(0, 1), ...customPresets].map(p => (
                          <option key={p.id} value={p.id}>
                            {p.id.startsWith("custom_") ? `⭐ ${p.name} (自定义)` : p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsStylePresetId("custom_edit");
                          setSettingsStylePromptName("");
                          setSettingsStylePromptContent("");
                        }}
                        aria-label="新建文风预设"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#F0F0F0] bg-[#F7F7F9] text-[#111111] transition-colors hover:bg-[#EFEFF1]"
                      >
                        <Plus size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteCustomPreset}
                          disabled={!hasSelectedCustomPreset}
                        aria-label="删除当前文风预设"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Trash2 size={17} />
                      </button>
                      </div>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-[#F0F0F0]">
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">文风名称</span>
                        <input
                          type="text"
                          value={settingsStylePromptName}
                          onChange={(e) => {
                            setSettingsStylePromptName(e.target.value);
                            setSettingsStylePresetId("custom_edit");
                          }}
                          placeholder="例如: 刀刀见血 / 王家卫风..."
                          className="w-full rounded-[14px] border border-[#F0F0F0] bg-[#F7F7F9] px-3 py-2 text-sm text-[#111111] outline-none focus:border-slate-400"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">文风详细提示词 (Prompt)</span>
                        <textarea
                          value={settingsStylePromptContent}
                          onChange={(e) => {
                            setSettingsStylePromptContent(e.target.value);
                            setSettingsStylePresetId("custom_edit");
                          }}
                          placeholder="描述你想要的语言笔触，例：充满电影感、留白极多，使用短句、充满孤寂感。角色说话前会微眯眼睛等..."
                          rows={3}
                          className="w-full rounded-[14px] border border-[#F0F0F0] bg-[#F7F7F9] px-3 py-2 text-sm text-[#111111] outline-none focus:border-slate-400"
                        />
                      </div>

                      {settingsStylePromptName.trim() && settingsStylePromptContent.trim() && (
                        <button
                          type="button"
                          onClick={handleCreateCustomPreset}
                          className="w-full rounded-xl bg-[#111111] py-3 text-xs font-semibold text-white transition-colors hover:bg-black"
                        >
                          💾 保存当前文风为自定义永久预设
                        </button>
                      )}
                    </div>
                  </div>
                  </section>

                  {/* Custom CSS */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-medium text-[#999999]">自定义美化</h4>
                  <div className="rounded-2xl border border-[#F0F0F0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-3 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">线下卡片美化 (自定义 CSS)</label>
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsCustomCss(`/* 仿宣纸文艺背景 */
.offline-workspace-container {
  background-color: #fdfaf2 !important;
}
.offline-message-list {
  background-color: transparent !important;
}
.offline-msg-content {
  font-size: calc(15px * var(--app-font-scale, 1)) !important;
  color: #3f3f46 !important;
  line-height: 1.8 !important;
  letter-spacing: 0.05em !important;
}
.offline-dialogue-text {
  color: #c2410c !important; /* 朱红色对话高亮 */
  font-weight: 600 !important;
}
.offline-narrative-text {
  color: #52525b !important;
  font-style: italic !important;
}`);
                        }}
                        className="text-[10px] text-indigo-600 font-bold hover:underline"
                      >
                        导入文艺宣纸模板
                      </button>
                    </div>
                    <textarea
                      value={settingsCustomCss}
                      onChange={(e) => setSettingsCustomCss(e.target.value)}
                      placeholder={`/* 支持代码美化，常用CSS类名： */
.offline-workspace-container { ... }
.offline-message-list { ... }
.offline-msg-content { ... }`}
                      rows={5}
                      className="w-full rounded-[14px] border border-[#F0F0F0] bg-[#F7F7F9] px-3 py-2 font-mono text-xs text-[#111111] outline-none focus:border-slate-400"
                    />
                    <p className="text-[10px] text-slate-400">在这里输入 CSS 样式规则，点击保存后即可在当前剧本空间内实时渲染应用！</p>
                  </div>
                  </section>
                </div>

                {/* Footer buttons */}
                <div className="p-4 bg-white border-t border-[#F0F0F0] shrink-0 space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="w-full rounded-xl border border-[#F0F0F0] bg-white py-3 text-xs font-semibold text-[#111111] transition-colors hover:bg-[#F7F7F9]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveSettings();
                      setIsSettingsOpen(false);
                    }}
                    className="w-full rounded-xl bg-[#111111] py-3 text-xs font-semibold text-white transition-colors hover:bg-black"
                  >
                    保存设置
                  </button>
                </div>
              </div>
            ) : (
              <>
            <OfflineWorkspaceHeader
              story={activeStory}
              characterName={selectedChar.remark || selectedChar.name}
              onExit={handleExitStoryWorkspace}
              onOpenReadingSettings={() => setIsReadingSettingsOpen(true)}
              onOpenStorySettings={() => setIsSettingsOpen(true)}
            />

            {activeStory.sourceChatId && (
              <section className="offline-chat-link-card" aria-label="线上聊天关联状态">
                <div className="offline-chat-link-copy">
                  <Link2 size={16} />
                  <span>已关联线上聊天记录（导入了 {activeStory.sourceChatMsgCount || 0} 条历史对话）</span>
                </div>
                {onNavigateToChat && linkedChatTarget && (
                  <button type="button" className="offline-chat-link-action" onClick={handleReturnToOnlineChat}>
                    返回线上聊天
                  </button>
                )}
              </section>
            )}

            {activeStory.mode === "if" && activeStory.ifPrompt && (
              <div className="offline-if-context">
                <Layers size={14} />
                <span>IF 假想设定：{activeStory.ifPrompt}</span>
              </div>
            )}

            <MessageList
              messages={visibleStoryMessages}
              scrollRef={workspaceScrollRef}
              className="offline-story-scroll offline-message-list"
              style={{}}
              contentClassName="offline-story-list"
              header={(
                <>
                  {activeStory.customCss && <style dangerouslySetInnerHTML={{ __html: activeStory.customCss }} />}
                  {visibleStoryMessages.length > 0 && <div className="offline-story-session"><span>{new Date(activeStory.createdAt).toLocaleDateString()} · 剧情记录</span><span>{visibleStoryMessages.length} 段</span></div>}
                  {visibleStoryMessages.length === 0 && (
                    <div className="offline-empty-state">
                      <p>剧本空间已经准备好。写下一个动作、一句对白，或让角色为这一幕打开故事。</p>
                      <button onClick={() => handleSendMessage(undefined, true)}>让 {selectedChar.remark || selectedChar.name} 开启第一幕</button>
                    </div>
                  )}
                </>
              )}
              renderMessage={(msg) => {
                let charToUse = selectedChar;
                if (msg.sender !== "user" && activeStory.characterIds?.length) {
                  const matched = characters.filter((character) => activeStory.characterIds?.includes(character.id)).find((character) => msg.content.includes(character.remark || character.name));
                  if (matched) charToUse = matched;
                }
                return <OfflineStoryCard
                  message={msg}
                  character={charToUse}
                  settings={settings}
                  showAvatars
                  menuOpen={activeNodeMenuId === msg.id}
                  onMenuToggle={() => setActiveNodeMenuId((current) => current === msg.id ? null : msg.id)}
                  onEdit={() => { setActiveNodeMenuId(null); handleStartEdit(msg.id, msg.content); }}
                  onDelete={() => { setActiveNodeMenuId(null); setPendingDeleteMessageId(msg.id); }}
                  onGuidance={() => { setActiveNodeMenuId(null); setIsGuidancePanelOpen(true); }}
                  onRegenerate={() => handleRegenerateMessage(msg.id)}
                />;
              }}
            >
                {isGenerating && <div className="offline-story-status"><RefreshCw size={15} className="animate-spin" />{selectedChar.remark || selectedChar.name} 正在续写这一幕…</div>}
                {errorMsg && <div className="offline-story-error">{errorMsg}</div>}
                <div ref={workspaceEndRef} />
            </MessageList>

            <div className="offline-composer-wrap">
              <form onSubmit={(event) => { event.preventDefault(); handleSendMessage(undefined, !inputText.trim()); }} className="offline-composer">
                <textarea
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  placeholder={activeStory.mode === "director" ? "继续写下去，或留下这一幕的方向…" : "继续写下去…"}
                  className="offline-composer-input-field"
                  rows={1}
                  disabled={isGenerating}
                />
                <IconButton type="submit" disabled={isGenerating} aria-label="发送并继续剧情" icon={<Send size={17} />} className="offline-composer-submit" />
              </form>
            </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isReadingSettingsOpen && (
        <OfflineReadingSettings
          value={readingPreferences}
          onChange={setReadingPreferences}
          onClose={() => setIsReadingSettingsOpen(false)}
        />
      )}

      {isGuidancePanelOpen && (
        <OfflineGuidancePanel
          initialOneTime={guidanceDraft.oneTime}
          initialOngoing={guidanceDraft.ongoing}
          onClose={() => setIsGuidancePanelOpen(false)}
          onSave={(oneTime, ongoing) => {
            const nextGuidance = { oneTime: oneTime.trim(), ongoing: ongoing.trim() };
            setGuidanceDraft(nextGuidance);
            const story = activeStoryRef.current;
            if (story) {
              saveActiveStorySnapshot({
                ...story,
                oneTimeGuidance: nextGuidance.oneTime || undefined,
                ongoingGuidance: nextGuidance.ongoing || undefined,
                updatedAt: Date.now(),
              });
            }
            setIsGuidancePanelOpen(false);
            showToast("场外指导已保存，将影响后续剧情生成");
          }}
        />
      )}

      {editingMessage && selectedChar && (
        <OfflineStoryEditor
          message={editingMessage}
          character={selectedChar}
          settings={settings}
          value={editingText}
          onChange={setEditingText}
          onCancel={handleCancelEdit}
          onSave={() => handleSaveEdit(editingMessage.id)}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteMessageId !== null}
        title="删除当前剧情节点？"
        description="删除后无法恢复这一段剧情文字。"
        tone="danger"
        confirmLabel="删除"
        onClose={() => setPendingDeleteMessageId(null)}
        onConfirm={() => {
          if (pendingDeleteMessageId) handleDeleteMessage(pendingDeleteMessageId);
          setPendingDeleteMessageId(null);
        }}
      />

      <AnimatePresence>
        {editingStory && (
          <div
            className="app-viewport-overlay offline-story-edit-overlay fixed inset-x-0 top-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => setEditingStory(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="settings-panel-card offline-story-edit-card w-full max-w-sm space-y-4 p-5 text-slate-800"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800">编辑剧本</h3>
                <button type="button" onClick={() => setEditingStory(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">取消</button>
              </div>
              <label className="block space-y-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">故事名称</span>
                <input
                  autoFocus
                  value={editingStoryTitle}
                  onChange={(event) => setEditingStoryTitle(event.target.value)}
                  className="w-full rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                />
              </label>
              {editingStory.mode === "if" && (
                <label className="block space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-600">IF 线设定</span>
                  <textarea
                    value={editingStoryIfPrompt}
                    onChange={(event) => setEditingStoryIfPrompt(event.target.value)}
                    rows={4}
                    placeholder="填写或修改这条 IF 线的设定…"
                    className="offline-story-if-prompt w-full resize-none rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                </label>
              )}
              <div className="settings-wide-action-group">
                <button type="button" onClick={handleSaveStoryEdit} className="settings-wide-action settings-wide-action-primary">保存修改</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= STORY CREATION DIALOG / MODAL ================= */}
      <AnimatePresence>
        {showCreateModal && selectedChar && (
          <div className="app-viewport-overlay fixed inset-x-0 top-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="settings-panel-card max-h-full w-full max-w-sm overflow-y-auto p-5 text-slate-800 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                  <span>新建线下剧本故事</span>
                </h3>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  取消
                </button>
              </div>

                <div className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">故事类型</label>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[10px] font-bold text-indigo-700">
                    {selectedChar.isGroupChat ? `多人线下 · ${selectedChar.remark || selectedChar.name}` : "单人线下"}
                  </div>
                </div>

                {!selectedChar.isGroupChat ? <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">角色</label>
                  <select
                    value={selectedCharId}
                    onChange={(event) => setSelectedCharId(event.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    {creationCharacters.map((character) => <option key={character.id} value={character.id}>{character.remark || character.name}</option>)}
                  </select>
                </div> : (
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">参与角色</label>
                    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
                      {(selectedChar.memberIds || []).map((memberId) => {
                        const member = characters.find((character) => character.id === memberId);
                        if (!member) return null;
                        const checked = selectedCharIds.includes(member.id);
                        return <label key={member.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedCharIds((current) => checked
                              ? current.filter((id) => id !== member.id)
                              : [...current, member.id])}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <img src={member.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                          <span className="font-bold text-slate-700">{member.remark || member.name}</span>
                        </label>;
                      })}
                    </div>
                    <p className="text-[9px] text-slate-400">已选择 {selectedCharIds.length} 名参与角色，至少需要 2 名。</p>
                  </div>
                )}

                {!selectedChar.isGroupChat && <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">当前身份关系</label>
                  <select
                    value={selectedRelationId}
                    onChange={(event) => setSelectedRelationId(event.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">选择关系</option>
                    {relationChoices.map((relation) => {
                      const identity = settings.identities?.find((item) => item.id === relation.userIdentityId);
                      return <option key={relation.id} value={relation.id}>{identity?.name || relation.userIdentityId}</option>;
                    })}
                  </select>
                </div>}

                {/* Title input */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">故事名称 (选填)</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="例如: 废土末日平行线 / 暴雨中的午后 / 导演控制篇..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Mode Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">剧本模式设定</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "director", label: "导演导演", desc: "指令驱动" },
                      { id: "continue", label: "续写续写", desc: "顺应逻辑" },
                      { id: "if", label: "IF线", desc: "设定颠覆" }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setNewMode(m.id as any)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all ${
                          newMode === m.id 
                            ? "bg-[var(--segmented-active-bg)] border-[var(--segmented-active-bg)] text-[var(--segmented-active-text)] font-bold"
                            : "bg-[var(--segmented-inactive-bg)] border-[var(--border)] text-[var(--segmented-inactive-text)] hover:bg-[var(--surface-raised)]"
                        }`}
                      >
                        <span className="font-bold text-[11px]">{m.label}</span>
                        <span className={`text-[8px] mt-0.5 ${newMode === m.id ? "text-[var(--segmented-active-text)]" : "text-[var(--segmented-inactive-text)]"}`}>{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {(newMode === "director" || newMode === "if") && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-700">
                    当前模式结束时不会自动总结或同步记忆。如需让线上角色记住本剧情，请进入“剧本设置”并手动同步。
                  </div>
                )}

                {/* IF premise prompt field */}
                {newMode === "if" && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">假想平行宇宙设定</label>
                    <textarea
                      value={newIfPrompt}
                      onChange={(e) => setNewIfPrompt(e.target.value)}
                      placeholder="例：如果我们在一个赛博朋克霓虹街头第一次相遇，你是一个身负重伤的骇客，而我是一个义体医生..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {/* Import history switch */}
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 block">引用线上聊天切入故事</span>
                    <span className="text-[8px] text-slate-400">自动同步该角色最后的 15 条聊天历史作为上下文</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={newStartFromChat}
                    onChange={(e) => setNewStartFromChat(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-slate-50 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 block">时间感知</span>
                    <span className="text-[8px] text-slate-400">
                      {newStartFromChat
                        ? "线上转线下时自动继承该角色线上聊天的时间感知设置"
                        : "自导自演 / IF 线独立使用当前真实时间"
                      }
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={newStartFromChat
                      ? Boolean(characters.find(c => c.id === selectedCharId)?.enableTimeAwareness)
                      : newTimeAwareness}
                    disabled={newStartFromChat}
                    onChange={(e) => setNewTimeAwareness(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-slate-50 cursor-pointer disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="settings-wide-action-group">
                <button
                  onClick={handleCreateStory}
                  className="settings-wide-action settings-wide-action-primary"
                >
                  开启剧本空间
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



    </div>
  );
}
