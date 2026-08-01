import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, Plus, Trash2, Send, Sparkles, BookOpen, 
  Link2, Calendar, MessageSquare, ChevronRight, HelpCircle, 
  Settings, RefreshCw, Layers, Cpu, MoreHorizontal
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Character, Message, OfflineStory, MemoryItem, MemoryVaultSettings, UserSettings, WorldBookEntry } from "../types";
import { apiChat, apiExtractMemories } from "../utils/apiHelper";
import { splitTextToOfflineSegments } from "../utils/pngParser";
import { formatExtractedMemorySummary, MemoryService } from "../domain/memory/MemoryService";
import { collectOfflineHandoffContent, filterOfflineExtractedFacts, getOfflineMemorySourceMessages, getOfflineStorySummaryMarker, hasOfflineStorySummary, hasUnsyncedOfflineMemoryProgress, isOfflineStoryHandoffMemory, shouldAutoSyncOnlineContinuation } from "../domain/memory/offlineMemorySync";
import { canSyncOfflineStoryToMemory } from "../domain/offlineStory/offlineStoryFactPolicy";
import { getLatestWorldBookEntries, buildWorldBookSystemBlocks } from "../utils/worldBook";
import { loadMessages } from "../core/storage/repositories/messageRepository";
import "./offline/offlineStory.css";
import { OfflineGuidancePanel } from "./offline/OfflineGuidancePanel";
import { OfflineReadingPreferences, OfflineReadingSettings } from "./offline/OfflineReadingSettings";
import { OfflineStoryCard } from "./offline/OfflineStoryCard";
import { OfflineStoryEditor } from "./offline/OfflineStoryEditor";
import { getAvailableCanonicalCharacterIds, resolveCanonicalCharacterId, resolveOfflineStoryCharacterId, resolveOfflineStoryCharacterIds } from "../domain/character/characterIdentity";
import { getConversationId, getOfflineModeStorageKey, getOfflineStoryStorageKey, type CharacterRelationship } from "../domain/relationship/characterRelationship";
import { countOfflineStoriesForRelation } from "../domain/relationship/offlineStoryScope";
import { resolveOfflineChatNavigationTarget } from "../domain/relationship/offlineChatNavigation";
import { captureOfflineStoryCompletedEvent } from "../features/characterLife/services/offlineStoryEventCaptureService";
import { ConfirmDialog, IconButton, Input, PopoverMenu } from "./ui";

interface AppOfflineProps {
  characters: Character[];
  relationships: CharacterRelationship[];
  settings: UserSettings;
  offlineStories: OfflineStory[];
  onSaveOfflineStory: (story: OfflineStory) => void;
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
}

export default function AppOffline({
  characters = [],
  relationships = [],
  settings,
  offlineStories = [],
  onSaveOfflineStory,
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
  worldBookEntries = []
}: AppOfflineProps) {
  const selectableCharacters = characters.filter((character) => !character.isGroupChat && !character.isContactInstance);
  const selectableCharacterIds = getAvailableCanonicalCharacterIds(selectableCharacters);
  const resolveCharacterId = (characterId: string) => resolveCanonicalCharacterId(characterId, characters);
  const [selectedCharId, setSelectedCharId] = useState<string>(() => {
    const canonicalActiveChatId = activeChatCharId ? resolveCharacterId(activeChatCharId) : null;
    if (canonicalActiveChatId && selectableCharacters.some(c => c.id === canonicalActiveChatId)) {
      return canonicalActiveChatId;
    }
    return selectableCharacters[0]?.id || "";
  });
  const activeIdentityId = settings.activeIdentityId || "identity-1";
  const relationChoices = Array.from(new Map(
    relationships
      .filter((relation) => relation.characterId === selectedCharId && relation.userIdentityId === activeIdentityId)
      .map((relation) => [`${relation.userIdentityId}\u0000${relation.characterId}`, relation]),
  ).values());
  const canAccessStoryFromCurrentRelation = (story: OfflineStory) => {
    const storyCharacter = characters.find((character) => character.id === story.characterId);
    // Group containers keep their existing shared/group routing semantics.
    if (storyCharacter?.isGroupChat) return true;
    // Every direct story must be owned by the selected current relation. A
    // missing relationId is legacy direct data and is not opened cross-identity.
    return Boolean(
      story.relationId
      && story.relationId === selectedRelationId
      && relationChoices.some((relation) => relation.id === story.relationId),
    );
  };
  const [selectedRelationId, setSelectedRelationId] = useState<string>(() => activeChatRelationId || "");
  useEffect(() => {
    const preferred = activeChatRelationId && relationships.some((relation) => relation.id === activeChatRelationId && relation.characterId === selectedCharId && relation.userIdentityId === activeIdentityId)
      ? activeChatRelationId
      : relationChoices[0]?.id || "";
    if (preferred !== selectedRelationId) setSelectedRelationId(preferred);
  }, [activeChatRelationId, selectedCharId, activeIdentityId, relationships]);
  const [activeStory, setActiveStory] = useState<OfflineStory | null>(null);
  const activeStoryRef = useRef<OfflineStory | null>(null);
  const [lastLoadedStoryScope, setLastLoadedStoryScope] = useState<string | null>(null);
  
  // Creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (showCreateModal) {
      setSelectedCharIds([selectedCharId]);
    }
  }, [showCreateModal, selectedCharId]);
  const [newMode, setNewMode] = useState<"director" | "continue" | "if">("director");
  const [newIfPrompt, setNewIfPrompt] = useState("");
  const [newStartFromChat, setNewStartFromChat] = useState<boolean>(false);
  const [newTimeAwareness, setNewTimeAwareness] = useState<boolean>(false);

  // Story composer input state
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const memorySyncInFlightRef = useRef(new Set<string>());

  const saveActiveStorySnapshot = (story: OfflineStory) => {
    activeStoryRef.current = story;
    onSaveOfflineStory(story);
    setActiveStory(story);
    return story;
  };

  const clearActiveStorySnapshot = () => {
    activeStoryRef.current = null;
    setActiveStory(null);
  };

  // A deleted archive profile may leave historical story records behind. Keep
  // those records intact, but do not leave the deleted character selectable or
  // an orphaned story open as an active workspace.
  useEffect(() => {
    if (selectedCharId && !selectableCharacterIds.has(selectedCharId)) {
      setSelectedCharId(selectableCharacters[0]?.id || "");
    }
    if (activeStoryRef.current && (
      !selectableCharacterIds.has(resolveOfflineStoryCharacterId(activeStoryRef.current, characters))
      || !canAccessStoryFromCurrentRelation(activeStoryRef.current)
    )) {
      clearActiveStorySnapshot();
    }
  }, [characters, selectedCharId, selectedRelationId, activeStory?.id, relationChoices]);
  
  // Toast notifications
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Editing Message Content state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const handleStartEdit = (msgId: string, currentContent: string) => {
    setEditingMessageId(msgId);
    setEditingText(currentContent);
  };

  const handleSaveEdit = (msgId: string) => {
    if (!activeStory) return;
    const updatedMessages = activeStory.messages.map(m => {
      if (m.id === msgId) {
        return { ...m, content: editingText };
      }
      return m;
    });
    const updatedStory = {
      ...activeStory,
      messages: updatedMessages,
      updatedAt: Date.now()
    };
    saveActiveStorySnapshot(updatedStory);
    setEditingMessageId(null);
    setEditingText("");
    showToast("修改内容已保存");
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  // Default Style Presets
  const DEFAULT_STYLE_PRESETS = [
    { id: "none", name: "默认风格", description: "无附加文风限制，由大模型自行生成合适笔触。" },
    { id: "delicate", name: "细腻言情", description: "文笔细腻温柔，富有画面感，注重心理细节、细微神态描写与人物微表情，情感温和而饱满。" },
    { id: "classic_chinese", name: "古典风雅", description: "词藻典雅凝练，带有浓郁的古风或武侠韵味，常运用四字成语、古雅景物描摹以及文质彬彬的对答。" },
    { id: "light_novel", name: "轻小说动漫", description: "语言活泼欢快，多有内心独白或俏皮吐槽，画面感强烈，具有鲜明的轻小说和二次元戏剧色彩。" },
    { id: "realist", name: "硬核写实", description: "笔触洗练干脆、直白有力，绝不娇揉造作，注重尘世烟火、生活细节与真实客观的场景反应。" },
    { id: "philosophical", name: "文艺内敛", description: "富含哲学思考，语调略带沉郁或文艺，善于运用象征、留白与深沉隽永的内心活动描写。" }
  ];

  // Custom style presets state loaded from localStorage
  const [customPresets, setCustomPresets] = useState<any[]>(() => {
    const raw = localStorage.getItem("offline_custom_style_presets");
    return raw ? JSON.parse(raw) : [];
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReadingSettingsOpen, setIsReadingSettingsOpen] = useState(false);
  const [readingPreferences, setReadingPreferences] = useState<OfflineReadingPreferences>({
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 1.5,
    paragraphSpacing: 18,
    textColor: "#1D1D1F",
    cardBackground: "#FFFFFF",
  });
  const [activeNodeMenuId, setActiveNodeMenuId] = useState<string | null>(null);
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<string | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const workspaceMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [isGuidancePanelOpen, setIsGuidancePanelOpen] = useState(false);
  const [guidanceDraft, setGuidanceDraft] = useState({ oneTime: "", ongoing: "" });
  const [settingsWordLimit, setSettingsWordLimit] = useState("");
  const [settingsPartnerP, setSettingsPartnerP] = useState("third");
  const [settingsUserP, setSettingsUserP] = useState("first");
  const [settingsStylePresetId, setSettingsStylePresetId] = useState("none");
  const [settingsStylePromptName, setSettingsStylePromptName] = useState("");
  const [settingsStylePromptContent, setSettingsStylePromptContent] = useState("");
  const [settingsShowAvatars, setSettingsShowAvatars] = useState(true);
  const [settingsCustomCss, setSettingsCustomCss] = useState("");

  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetContent, setNewPresetContent] = useState("");

  useEffect(() => {
    if (activeStory && isSettingsOpen) {
      setSettingsWordLimit(activeStory.wordLimit ? String(activeStory.wordLimit) : "");
      setSettingsPartnerP(activeStory.partnerPerspective || "third");
      setSettingsUserP(activeStory.userPerspective || "first");
      setSettingsStylePresetId(activeStory.stylePresetId || "none");
      setSettingsStylePromptName(activeStory.stylePromptName || "");
      setSettingsStylePromptContent(activeStory.stylePromptContent || "");
      setSettingsShowAvatars(activeStory.showAvatars !== false); // default to true
      setSettingsCustomCss(activeStory.customCss || "");
    }
  }, [activeStory, isSettingsOpen]);

  const handleSaveSettings = () => {
    if (!activeStory) return;

    const limit = parseInt(settingsWordLimit.trim(), 10);
    const parsedLimit = isNaN(limit) || limit <= 0 ? undefined : limit;

    const updatedStory = {
      ...activeStory,
      wordLimit: parsedLimit,
      partnerPerspective: settingsPartnerP,
      userPerspective: settingsUserP,
      stylePresetId: settingsStylePresetId,
      stylePromptName: settingsStylePromptName,
      stylePromptContent: settingsStylePromptContent,
      showAvatars: settingsShowAvatars,
      customCss: settingsCustomCss,
      updatedAt: Date.now()
    };

    saveActiveStorySnapshot(updatedStory);
    setIsSettingsOpen(false);
    showToast("剧本配置已保存！");
  };

  const handleCreateCustomPreset = () => {
    if (!settingsStylePromptName.trim() || !settingsStylePromptContent.trim()) {
      showToast("文风名称和描述不能为空！");
      return;
    }
    const newPreset = {
      id: `custom_${Date.now()}`,
      name: settingsStylePromptName.trim(),
      description: settingsStylePromptContent.trim()
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem("offline_custom_style_presets", JSON.stringify(updated));
    
    // Select the new preset
    setSettingsStylePresetId(newPreset.id);
    showToast("文风保存为预设成功！");
  };

  const selectedChar = selectableCharacters.find(c => c.id === selectedCharId) || selectableCharacters[0];
  const charStories = offlineStories.filter((story) =>
    canAccessStoryFromCurrentRelation(story)
    && (resolveOfflineStoryCharacterId(story, characters) === selectedCharId
      || resolveOfflineStoryCharacterIds(story, characters).includes(selectedCharId))
  );

  const storyChars = activeStory 
    ? (activeStory.characterIds && activeStory.characterIds.length > 0 
        ? selectableCharacters.filter(c => resolveOfflineStoryCharacterIds(activeStory, characters).includes(c.id))
        : [selectedChar])
    : [selectedChar];

  const storyCharNamesLabel = storyChars.map(c => c.remark || c.name).join("、");
  const firstActorLabel = storyChars.length > 1 ? "角色们" : (selectedChar.remark || selectedChar.name);

  // Online messages are an invisible handoff context, never part of the offline
  // manuscript. The id check also hides snapshots created before this flag existed.
  const visibleStoryMessages = activeStory?.messages.filter((message) =>
    !message.isImportedContext && !message.id.startsWith("offline-import-")
  ) || [];
  const editingMessage = activeStory?.messages.find((message) => message.id === editingMessageId) || null;
  const readingStyle = {
    "--offline-reading-font-size": `${readingPreferences.fontSize}px`,
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

  const workspaceEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (workspaceEndRef.current) {
      workspaceEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeStory?.messages, isGenerating]);

  // Direct workspaces are scoped by Character → Relationship. Group stories
  // retain their legacy relation-less container route.
  useEffect(() => {
    const scopeKey = selectedRelationId || `legacy:${selectedCharId}`;
    if (selectedCharId && scopeKey !== lastLoadedStoryScope) {
      setLastLoadedStoryScope(scopeKey);
      const savedStoryId = selectedRelationId ? localStorage.getItem(getOfflineStoryStorageKey(selectedRelationId)) : null;
      if (savedStoryId) {
        const story = offlineStories.find(s => s.id === savedStoryId);
        if (story && canAccessStoryFromCurrentRelation(story)) {
          activeStoryRef.current = story;
          setActiveStory(story);
          return;
        }
      }
      clearActiveStorySnapshot();
    }
  }, [selectedCharId, selectedRelationId, offlineStories, lastLoadedStoryScope]);

  // Handle opening a story
  const handleOpenStory = (story: OfflineStory) => {
    if (!canAccessStoryFromCurrentRelation(story)) {
      showToast("此线下剧情属于另一个人设关系，不能跨身份进入。");
      return;
    }
    activeStoryRef.current = story;
    setActiveStory(story);
    if (story.relationId) {
      localStorage.setItem(getOfflineModeStorageKey(story.relationId), "true");
      localStorage.setItem(getOfflineStoryStorageKey(story.relationId), story.id);
    }
  };

  const clearOfflineSession = (story: OfflineStory) => {
    if (story.relationId) {
      localStorage.removeItem(getOfflineStoryStorageKey(story.relationId));
      localStorage.setItem(getOfflineModeStorageKey(story.relationId), "false");
    }
  };

  const needsLegacyHandoffRepair = (story: OfflineStory) => {
    const summaryMarker = getOfflineStorySummaryMarker(story);
    return memories.some((memory) => isOfflineStoryHandoffMemory(memory, story) && !memory.content.includes(summaryMarker));
  };

  const needsMissingSummaryRepair = (story: OfflineStory) =>
    Boolean(story.archivedAt || story.memorySyncStatus === "synced") && !hasOfflineStorySummary(story, memories);

  const shouldSyncStoryMemory = (story: OfflineStory) =>
    shouldAutoSyncOnlineContinuation(story) || needsLegacyHandoffRepair(story);

  // Exit story workspace back to list
  const handleExitStoryWorkspace = async () => {
    // Only an explicitly linked online continuation may write a handoff on
    // exit. Director and IF stories remain isolated, even when they imported
    // chat history as writing reference.
    const latestStory = activeStoryRef.current;
    let completedStory = latestStory;
    if (latestStory && shouldSyncStoryMemory(latestStory)) {
      completedStory = await handleSyncMemoryToBrain(latestStory);
    }
    if (completedStory) clearOfflineSession(completedStory);
    clearActiveStorySnapshot();
    setIsSettingsOpen(false);
  };

  const handleReturnToOnlineChat = async () => {
    const latestStory = activeStoryRef.current;
    if (!latestStory || !onNavigateToChat) return;
    const target = resolveOfflineChatNavigationTarget({
      story: latestStory,
      relationships,
      characters,
      ownerIdentityId: activeIdentityId,
    });
    if (!target) {
      showToast("未找到当前身份对应的线上聊天关系。");
      return;
    }
    let completedStory = latestStory;
    if (shouldSyncStoryMemory(latestStory)) {
      completedStory = await handleSyncMemoryToBrain(latestStory);
    }
    clearOfflineSession(completedStory);
    clearActiveStorySnapshot();
    setIsSettingsOpen(false);
    onNavigateToChat(target.characterId, target.relationId, target.conversationId);
  };

  // Create new offline story
  const handleCreateStory = () => {
    if (!selectedCharId) {
      showToast("请先选择一个角色！");
      return;
    }
    const relationship = relationChoices.find((relation) => relation.id === selectedRelationId);
    if (!relationship) {
      showToast("Please select the current identity's relationship first.");
      return;
    }

    const storyCharsList = characters.filter(c => selectedCharIds.includes(c.id));
    const charsLabel = storyCharsList.map(c => c.remark || c.name).join("、");
    const modeLabel = newMode === "director" ? "导演剧本" : newMode === "if" ? "IF假想线" : "续写故事";
    const titleToUse = newTitle.trim() || `「${charsLabel}」的${modeLabel} - ${new Date().toLocaleDateString()}`;

    let importedContext: OfflineStory["importedContext"];

    // Reference from current chat history (if requested)
    if (newStartFromChat) {
      // Prefer the live app state: it includes the latest message even before a
      // persistence effect has finished. Local storage remains a fallback.
      const liveMessages = messages.filter(m => m.relationId === selectedRelationId);
      const storedMessages = liveMessages.length === 0 ? loadMessages([]) : null;
      if (liveMessages.length > 0 || storedMessages?.found) {
        try {
          const parsed = liveMessages.length > 0 ? liveMessages : storedMessages?.value || [];
          const contextLimit = characters.find(c => c.id === selectedCharId)?.contextMemoryLimit || 20;
          const relevantMsgs = parsed
            .filter(m => m.relationId === selectedRelationId)
            .slice(-contextLimit * 2); // preserve the configured number of dialogue rounds
          
          const importedMessages = relevantMsgs.map(m => ({
            ...m,
            id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            isOffline: true
          }));
          importedContext = {
            messages: importedMessages,
            memories: memories.filter(m => m.relationId === selectedRelationId).map(m => m.content),
            worldBook: getLatestWorldBookEntries(worldBookEntries || [])
              .filter(entry => !entry.characterId || entry.characterId === selectedCharId)
              .map(entry => `${entry.title}: ${entry.content}`),
            importedAt: Date.now()
          };
        } catch (e) {
          console.error("Failed to copy chat history:", e);
        }
      }
    }

    const newStory: OfflineStory = {
      id: `story-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      characterId: selectedCharId,
      relationId: relationship.id,
      conversationId: relationship.conversationId || getConversationId(relationship.id),
      characterIds: [selectedCharId],
      title: titleToUse,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: newMode,
      ifPrompt: newMode === "if" ? newIfPrompt : undefined,
      sourceChatId: newStartFromChat ? selectedCharId : undefined,
      sourceChatMsgCount: newStartFromChat ? importedContext?.messages.length : undefined,
      importedContext,
      enableTimeAwareness: newStartFromChat
        ? Boolean(characters.find(c => c.id === selectedCharId)?.enableTimeAwareness)
        : newTimeAwareness,
      // Imported chat is context only; newly written plot remains in this independent archive.
      messages: []
    };

    saveActiveStorySnapshot(newStory);
    localStorage.setItem(getOfflineModeStorageKey(relationship.id), "true");
    localStorage.setItem(getOfflineStoryStorageKey(relationship.id), newStory.id);
    setShowCreateModal(false);

    // Reset fields
    setNewTitle("");
    setNewMode("director");
    setNewIfPrompt("");
    setNewStartFromChat(false);
    setNewTimeAwareness(false);

    showToast("线下故事创建成功");
  };

  // Delete a story
  const handleDeleteStory = (storyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除这个线下故事记录吗？此操作无法撤销。")) {
      const story = offlineStories.find((item) => item.id === storyId);
      if (story) clearOfflineSession(story);
      onDeleteOfflineStory(storyId);
      if (activeStoryRef.current?.id === storyId) {
        clearActiveStorySnapshot();
      }
      showToast("故事已删除");
    }
  };

  // Sync memory manually
  const handleSyncMemoryToBrain = async (
    story: OfflineStory,
    options: { userConfirmed?: boolean } = {},
  ): Promise<OfflineStory> => {
    if (memorySyncInFlightRef.current.has(story.id)) return story;
    const repairingLegacyHandoff = needsLegacyHandoffRepair(story);
    const repairingMissingSummary = needsMissingSummaryRepair(story);
    if (!hasUnsyncedOfflineMemoryProgress(story) && !repairingLegacyHandoff && !repairingMissingSummary) return story;
    // A story owns one replaceable summary. Re-reading its source prevents a
    // later incremental sync from discarding facts saved by an earlier one.
    const sourceMessages = getOfflineMemorySourceMessages(story, { includeSynced: true });

    if (!canSyncOfflineStoryToMemory({ story, userConfirmed: options.userConfirmed === true, sourceMessages })) {
      showToast("只有当前关系下、已确认的单角色线上续写可同步至长期记忆；导演、IF 与多人剧情会保留在线下故事空间。");
      return story;
    }

    const character = characters.find((item) => item.id === story.characterId);
    if (!character || character.isGroupChat) {
      showToast("当前线下故事没有可同步的单聊角色记忆");
      return story;
    }

    const now = Date.now();
    const syncMarker = getOfflineStorySummaryMarker(story);
    const markSynced = (memoryIds: string[] = []): OfflineStory => ({
      ...story,
      archivedAt: now,
      archivedMemoryIds: Array.from(new Set([...(story.archivedMemoryIds || []), ...memoryIds])),
      syncedSourceMessageIds: Array.from(new Set([...(story.syncedSourceMessageIds || []), ...sourceMessages.map((message) => message.id)])),
      lastSyncedMessageCount: story.messages.length,
      lastMemorySyncAt: now,
      memorySyncStatus: "synced",
      updatedAt: now,
    });

    memorySyncInFlightRef.current.add(story.id);
    try {
      if (sourceMessages.length === 0) {
        const syncedStory = markSynced();
        if (activeStoryRef.current?.id === story.id) saveActiveStorySnapshot(syncedStory);
        else onSaveOfflineStory(syncedStory);
        if (options.userConfirmed) {
          captureOfflineStoryCompletedEvent({
            story: syncedStory,
            userIdentityId: relationships.find((relation) => relation.id === syncedStory.relationId)?.userIdentityId,
            sourceMessages,
            userConfirmed: true,
            recordedAt: now,
          });
        }
        showToast("没有可提取的线下新增剧情，已保留故事内容");
        return syncedStory;
      }

      const historyLimit = character.retrievalHistoryLimit || 100;
      const headerLabel = character.archiveTemplateType === "delicate"
        ? `【线下剧本《${story.title}》心境归档】`
        : `【线下剧本《${story.title}》关键剧情归档】`;
      let extractedMemories: MemoryItem[] = [];
      try {
        const result = await MemoryService.extractMemories({
          character,
          characterId: story.characterId,
          relationId: story.relationId,
          recentMessages: sourceMessages.slice(-historyLimit),
          existingMemories: memories,
          scenario: "offline",
          apiKey: settings.apiKey,
          model: !recallSettings.extractModel || recallSettings.extractModel === "default-chat-model"
            ? (settings.selectedModel || "gemini-3.5-flash")
            : recallSettings.extractModel,
          apiEndpoint: settings.apiEndpoint,
          templateType: character.archiveTemplateType,
          filterItems: filterOfflineExtractedFacts,
          createId: () => `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          currentTime: () => Date.now(),
          // Source-derived third-person facts are the authoritative record for
          // actor/recipient direction; ambiguous extraction text is excluded.
          formatContent: (items) => `${formatExtractedMemorySummary(headerLabel, items)}\n[${syncMarker}]\n【确认事件（主体与客体固定）】\n${collectOfflineHandoffContent(story, character.remark || character.name)}`,
        }, apiExtractMemories);
        if (result.apiError) throw new Error(result.apiError);
        extractedMemories = result.extractedMemories;
      } catch (error) {
        console.warn("Offline memory extraction unavailable; keeping the story retryable:", error);
      }

      if (extractedMemories.length === 0) {
        throw new Error("Offline story summary did not contain confirmed, safe facts");
      }

      // Replace all previous incremental handoffs for this story. They may be
      // legacy generic fallbacks or prior batches; neither should accumulate.
      const retainedMemories = memories.filter((memory) => !isOfflineStoryHandoffMemory(memory, story));
      const mergedMemories = MemoryService.mergeMemories(retainedMemories, extractedMemories);
      const persisted = onPersistMemories
        ? await onPersistMemories(mergedMemories)
        : (onSaveMemories(mergedMemories), true);
      if (!persisted) throw new Error("Offline story summary persistence failed");

      const syncedStory = markSynced(extractedMemories.map((memory) => memory.id));
      if (activeStoryRef.current?.id === story.id) saveActiveStorySnapshot(syncedStory);
      else onSaveOfflineStory(syncedStory);
      if (options.userConfirmed) {
        captureOfflineStoryCompletedEvent({
          story: syncedStory,
          userIdentityId: relationships.find((relation) => relation.id === syncedStory.relationId)?.userIdentityId,
          sourceMessages,
          userConfirmed: true,
          recordedAt: now,
        });
      }
      showToast("线下剧情摘要已同步到当前角色");
      return syncedStory;
    } catch (error) {
      console.error("Failed to sync offline story memories:", error);
      const failedStory: OfflineStory = { ...story, memorySyncStatus: "failed", updatedAt: Date.now() };
      if (activeStoryRef.current?.id === story.id) saveActiveStorySnapshot(failedStory);
      else onSaveOfflineStory(failedStory);
      showToast("线下剧情记忆同步失败，故事已保留，可稍后重试");
      return failedStory;
    } finally {
      memorySyncInFlightRef.current.delete(story.id);
    }
  };

  // Delete individual plot record
  const handleDeleteMessage = (msgId: string) => {
    if (!activeStory) return;
    const updatedMsgs = activeStory.messages.filter(m => m.id !== msgId);
    const updatedStory = {
      ...activeStory,
      messages: updatedMsgs,
      updatedAt: Date.now()
    };
    saveActiveStorySnapshot(updatedStory);
    showToast("剧情记录已删除");
  };

  // Send message inside workspace
  const handleSendMessage = async (textToSend?: string, forceAIOnly = false) => {
    const storyAtSend = activeStoryRef.current ?? activeStory;
    if (!storyAtSend) return;
    setErrorMsg("");

    const text = textToSend !== undefined ? textToSend : inputText.trim();
    if (!text && !forceAIOnly) return;

    let updatedStory = { ...storyAtSend };
    
    // 1. If we have user text to add
    if (text && !forceAIOnly) {
      const userMsg: Message = {
        id: `offline-msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        characterId: storyAtSend.characterId,
        relationId: storyAtSend.relationId,
        conversationId: storyAtSend.conversationId,
        sender: "user",
        content: text,
        timestamp: Date.now(),
        isOffline: true,
        isNarration: false
      };
      updatedStory = {
        ...storyAtSend,
        messages: [...storyAtSend.messages, userMsg],
        updatedAt: Date.now()
      };
      saveActiveStorySnapshot(updatedStory);
      setInputText("");
    }

    setIsGenerating(true);

    try {
      // Assemble history context
      // If we added a user message in this turn, exclude it from historyContext because it will be passed as the separate 'message' parameter.
      const msgsForHistory = (text && !forceAIOnly && updatedStory.messages.length > 0 && updatedStory.messages[updatedStory.messages.length - 1].sender === "user")
        ? updatedStory.messages.slice(0, -1)
        : updatedStory.messages;

      const historyContext = msgsForHistory.map(m => {
        if (m.sender === "user") {
          return {
            role: "user",
            text: m.isNarration ? `(客观旁白) ${m.content}` : `我: “${m.content}”`
          };
        } else {
          return {
            role: "model",
            text: m.content
          };
        }
      });

      // Assemble World Book context-aware trigger scanning
      const scanContextParts = [
        text || "",
        ...(updatedStory.messages || []).slice(-3).map(m => m.content)
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");

      // We can collect worldbook blocks for all story characters
      const storyCharsList = updatedStory.characterIds && updatedStory.characterIds.length > 0 
        ? selectableCharacters.filter(c => resolveOfflineStoryCharacterIds(updatedStory, characters).includes(c.id))
        : [selectedChar];
      const sourceChat = characters.find(c => c.id === (updatedStory.sourceChatId ? resolveCharacterId(updatedStory.sourceChatId) : undefined));
      const isImportedGroupStory = Boolean(sourceChat?.isGroupChat);

      const wbPrompts = updatedStory.importedContext?.worldBook.length
        ? `【导入时冻结的世界书设定】：\n${updatedStory.importedContext.worldBook.map(item => `- ${item}`).join("\n")}`
        : "";

      // Base Persona
      let sysPrompt = `你现在正在与用户进行“线下故事/小说剧本”的联合创作。本场剧本中共有以下 ${storyCharsList.length} 位角色参与：\n\n`;
      
      storyCharsList.forEach((char, idx) => {
        sysPrompt += `[角色 ${idx + 1}: ${char.name}]
- 姓名：${char.name}
- 年龄：${char.age || "未知"}
- 语气/性格特点：${char.personality}
- 背景设定：${char.backstory}
- 当前关系摘要：${(updatedStory.relationId ? relationships.find((relation) => relation.id === updatedStory.relationId)?.compressedMemory : char.compressedMemory) || "暂无"}
\n`;
      });

      if (isImportedGroupStory) {
        sysPrompt += `\n【群聊关系事实：绝对不可改写】
这是从群聊导入的续写。以上每位角色档案中的身份、与用户的关系、以及角色彼此的关系，均为已确定的事实，必须逐字按其含义延续。
严禁因为多人同场，就把用户擅自写成任一角色的恋人、前任、暧昧对象、家属或专属伴侣；除非对应角色档案已明确这样设定。
用户可能只是朋友、旁观者或 CP 粉。必须保持这种定位，并保持角色之间原有的情侣或其他既定关系，不能自行替换、转移或制造新的恋爱关系。\n`;
      }

      if (wbPrompts) {
        sysPrompt += `\n【相关世界书背景设定】：
${wbPrompts}

🚨 [极其重要：世界书设定绝对最高优先]
在联合剧本创作中，你必须绝对100%强制遵循上述世界书设定的真实客观逻辑。如果词条要求了任何口癖、前置/后置特殊标志，参与的每一位角色在其说话发言时也必须绝对、无条件带上。
\n`;
      }

      sysPrompt += `\n【人设遵循最高优先规则】
1. 🚨 你扮演这几位角色，在他们参与的每句话、神态动作、心理描写中，必须严密、100%地遵循他们各自的性格特征、说话语气和人设。
2. 严禁混淆多位角色的口癖、语气或人物关系。

【人称写作视角限制】
- 对方人物视角（${storyCharsList.map(c => c.name).join("/")}）：【${(activeStory.partnerPerspective || "third") === "first" ? "第一人称" : (activeStory.partnerPerspective || "third") === "second" ? "第二人称" : "第三人称"}】。`;
      if ((activeStory.partnerPerspective || "third") === "first") {
        sysPrompt += `你在描写或代替该人物进行心理解说、旁白叙述或发言时，应当站在该角色自身视角，采用第一人称“我”或契合其身份的自称（如“本座”、“本王”、“人家”等）。`;
      } else if ((activeStory.partnerPerspective || "third") === "second") {
        sysPrompt += `你在叙事中指向对方自身时采用第二人称“你”（极罕见）。`;
      } else {
        sysPrompt += `你在叙事和描述中，应当采用客观的第三人称（如“他”、“她”、“${storyCharsList[0]?.name || "对方"}”）来描述该角色的言行、神态和内心戏。`;
      }
      sysPrompt += `\n- 用户（我）的视角：【${(activeStory.userPerspective || "first") === "first" ? "第一人称 (我)" : (activeStory.userPerspective || "first") === "second" ? "第二人称 (你)" : "第三人称 (他/她/具体名字)"}】。`;
      if ((activeStory.userPerspective || "first") === "first") {
        sysPrompt += `你在叙事中描写用户、机主或提及我时，必须使用第一人称“我”指代用户（例如：“你深深凝视着我，缓步走来”）。`;
      } else if ((activeStory.userPerspective || "first") === "second") {
        sysPrompt += `你在叙事中描写用户、机主或提及我时，必须使用第二人称“你”指代用户（例如：“他走到你面前，拉起你的手”）。`;
      } else {
        sysPrompt += `你在叙事中描写用户、机主或提及我时，必须使用第三人称“他/她/具体名字 ${settings.name || "主角"}”来指代用户（例如：“他向 ${settings.name || "主角"} 微微颔首”）。`;
      }

      if (activeStory.wordLimit && activeStory.wordLimit > 0) {
        sysPrompt += `\n\n🚨 【重要字数限制提示】：你的本次续写回复总字数（包括对话与旁白叙事）必须严格限制在 【${activeStory.wordLimit}】 字以内，请尽量精炼、点到即止，切勿啰嗦冗长！`;
      }

      if (activeStory.stylePromptContent) {
        sysPrompt += `\n\n✨ 【写作风格/笔触规范 (当前预设: ${activeStory.stylePromptName || "自定义"})】：\n${activeStory.stylePromptContent}\n请在生成本次续写内容时，全程严格执行并契合上述写作风格规范。`;
      }

      sysPrompt += `\n\n【线下模式及多角色控制规则】
1. 用户可以通过文字、指令或旁白，像导播、写小说或主控一样描述故事进展。
2. 作为一个优秀的内容创作者，你要输出一整段精美的、小说叙事般的回复，内容包括指定人称视角的场景描写、客观动作、旁白叙事，以及这些角色的对话。
3. 任何发言对话请使用中文引号 “ ” (例如 “你醒了？”) 或 「 」 括起来，以便阅读。任何非发言部分（动作描述、神态、场景描写、内心想法、旁白等）放在引号外面。
4. 确保在对话中，通过在引号前或文中清晰提及名字（例如：A冷笑了一声：“...” / B有些局促地拍了拍衣角：“...”）来指明是谁在说话，使读者能一眼分辨。
5. 必须保持极高的人设契合度、动作细节 and 情感氛围描写。不要说任何破戏（OOC）的话，不要说你是AI。
6. 如果用户给出了导演指令（如：[控制剧情：我们遇到了敌人]），请积极顺应，发挥你强大的故事延展能力，精美自然地推进剧情。

【当前创作模式】：`;

      if (updatedStory.mode === "director") {
        sysPrompt += `\n【导演模式】：用户是编剧/导演，给你发出控制剧本走向的指令。你要自行把控边界，像写小说一样输出一整段包含角色和用户所有完整对话、动作、旁白的文段。`;
      } else if (updatedStory.mode === "if") {
        sysPrompt += `\n【IF平行假想线】：当前故事处于一个脱离原作正统时间线的平行宇宙中！
假想线宇宙设定：${updatedStory.ifPrompt || "自定义世界观设定"}
在此假想规则下，让人物发挥其性格，在此全新背景中与用户互动。`;
      } else {
        sysPrompt += `\n【续写模式】：以现有的聊天/故事为草稿，根据设定和目前的逻辑走向，续写故事的精彩发展。`;
      }

      // Only an explicitly imported online story may use its frozen snapshot.
      // Self-directed and IF stories stay fully isolated from the online vault.
      const allMemoriesParts: string[] = [];
      if (updatedStory.importedContext) storyCharsList.forEach(char => {
        const snapshotMemories = updatedStory.importedContext!.memories.map((content, index) => ({
          id: `snapshot-memory-${index}`,
          characterId: char.id,
          content,
          timestamp: updatedStory.importedContext!.importedAt,
          importance: 5
        }));
        const relevantMems = MemoryService.retrieveRelevantMemories({
          characterId: char.id,
          queryText: text || "续写故事",
          existingMemories: snapshotMemories,
          limit: 3,
          scenario: "offline",
        });
        if (relevantMems.length > 0) {
          const lines = relevantMems.map(m => `  - ${m.content}`).join("\n");
          allMemoriesParts.push(`* 【${char.remark || char.name}】的线上记忆库事实：\n${lines}`);
        }
      });
      if (allMemoriesParts.length > 0) {
        sysPrompt += `\n\n【互通的线上记忆库】：以下是各个参与角色的线上对话中发生并提取的核心事实，请将其有机融入作为故事的背景事实支撑：\n${allMemoriesParts.join("\n")}`;
      }

      // Never fetch live online chat while writing offline. Use the import snapshot only.
      const chatContextParts: string[] = [];
      if (updatedStory.importedContext) storyCharsList.forEach(char => {
        const onlineMsgs = updatedStory.importedContext!.messages
          // Group messages belong to the group container, while senderId identifies
          // the actual member. Include the user's group messages for every member.
          .filter(m => m.characterId === char.id || m.senderId === char.id || (
            m.sender === "user" && isImportedGroupStory && m.characterId === updatedStory.sourceChatId
          ))
          .slice(-15);
        if (onlineMsgs.length > 0) {
          const lines = onlineMsgs.map(m => `  - ${m.sender === "user" ? "我" : char.remark || char.name}: ${m.content}`).join("\n");
          chatContextParts.push(`* 【与 ${char.remark || char.name}】的最新线上聊天：\n${lines}`);
        }
      });
      if (chatContextParts.length > 0) {
        sysPrompt += `\n\n【互通的线上最新对话记忆（Online Chat Context）】：
以下是各位参与角色最近在微信（线上聊天）中的最新真实对话。这些是你们当下关系的最新现状与真实记忆。请确保线下小说剧本的走向与其认知保持连贯和融合，避免发生剧情上的冲突：
${chatContextParts.join("\n")}`;
      }

      const lastUserMsgText = text || "请继续编织并续写这幕场景。";

      const importedTail = updatedStory.importedContext?.messages.slice(-6) || [];
      if (updatedStory.importedContext && importedTail.length > 0) {
        const lastImported = importedTail[importedTail.length - 1];
        const handoffTime = new Date(lastImported.timestamp);
        const handoffClock = handoffTime.toLocaleString("zh-CN", {
          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
        });
        sysPrompt += `\n\n【ONLINE-TO-OFFLINE CONTINUITY — ABSOLUTE RULE】
This scene begins immediately after the imported online conversation, not as a new unrelated scene.
The last imported message is the current canonical handoff. Continue its topic, location, activity, promises, and emotional momentum. Do not replace it with a new activity (for example, do not switch from eating to bathing) unless the user explicitly asks for a time jump or transition.
Imported handoff transcript:\n${importedTail.map(m => `- ${m.sender === "user" ? settings.name : (selectedChar?.name || "Character")}: ${m.content}`).join("\n")}
Canonical handoff time: ${handoffClock}. The first continuation may advance only naturally by a few minutes unless the user explicitly changes the time or scene.`;
      }

      if (updatedStory.enableTimeAwareness) {
        const now = new Date();
        const currentClock = now.toLocaleString("zh-CN", {
          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
        });
        sysPrompt += `\n\n【TIME AWARENESS — REQUIRED】
Current real-world time is ${currentClock}. Use this as the authoritative present time. Do not state a conflicting clock time, and do not casually jump hours. If this is an imported continuation, its handoff time is authoritative for the scene and the present can only move forward naturally from it.`;
      }

      const response = await apiChat({
        message: lastUserMsgText,
        history: historyContext,
        systemInstruction: sysPrompt,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature || 0.8,
        streamCompatible: settings.streamCompatible
      });

      if (response && response.text) {
        // A single generation is one editable script entry. Preserve its paragraphs
        // inside the entry instead of turning every paragraph into a separate message.
        const newMsgs: Message[] = [{
          id: `offline-reply-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          characterId: updatedStory.characterId,
          relationId: updatedStory.relationId,
          conversationId: updatedStory.conversationId,
          sender: "character",
          content: response.text.trim(),
          timestamp: Date.now(),
          isOffline: true,
          isNarration: false
        }];

        const finalStory = {
          ...updatedStory,
          messages: [...updatedStory.messages, ...newMsgs],
          updatedAt: Date.now()
        };

        saveActiveStorySnapshot(finalStory);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("呼叫主脑剧本引擎失败，请检查网络或API Key设定。");
    } finally {
      setIsGenerating(false);
    }
  };

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
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-indigo-600/90 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full shadow-lg border border-indigo-400 font-bold"
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
                onClick={() => setShowCreateModal(true)}
                className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shadow-sm transition-colors"
                title="新建故事"
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
                  const charStoriesCount = charRelation
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

              {charStories.length === 0 ? (
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
                        </div>

                        <div className="flex flex-col items-end justify-between h-full space-y-4">
                          <button
                            onClick={(e) => handleDeleteStory(story.id, e)}
                            className="w-7 h-7 rounded-lg bg-slate-150/70 hover:bg-red-50 text-slate-500 hover:text-red-600 flex items-center justify-center transition-all opacity-100 border border-slate-200"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
              <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-slate-50">
                {/* Header */}
                <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm z-10 shrink-0 relative">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                    title="返回剧本空间"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <h3 className="text-xs font-bold text-slate-800 absolute left-1/2 -translate-x-1/2 w-max">
                    剧本高级设置
                  </h3>
                  <div className="w-8 h-8" />
                </div>

                {/* Settings Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                  {/* Sync memory button is now placed at the top of settings as requested */}
                  <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm space-y-2 text-left">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-bold text-slate-800">同步剧本记忆</span>
                    </div>
                    <p className="text-[10px] text-slate-400">将此离线剧本空间的当前进展记忆同步并沉淀到角色的长期记忆库中，让他们在后续对话中感知到这些事件。</p>
                    <button
                      type="button"
                      onClick={() => void handleSyncMemoryToBrain(activeStory, { userConfirmed: true })}
                      className="w-full py-2 bg-[var(--button-secondary-bg)] hover:bg-[var(--surface-raised)] text-[var(--button-secondary-text)] font-bold rounded-[16px] border border-[var(--button-secondary-border)] transition-all text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:bg-[var(--button-disabled-bg)] disabled:text-[var(--button-disabled-text)] disabled:border-[var(--button-disabled-border)] disabled:opacity-100"
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      <span>同步当前进展记忆至角色大脑</span>
                    </button>
                  </div>

                  {/* Word limit */}
                  <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm space-y-3 text-left">
                    <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">每次生成回复字数限制</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={settingsWordLimit}
                        onChange={(e) => setSettingsWordLimit(e.target.value)}
                        placeholder="不限制 (或输入数字，如：300)"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                      />
                      {settingsWordLimit && (
                        <button
                          type="button"
                          onClick={() => setSettingsWordLimit("")}
                          className="px-2.5 py-1 text-[10px] font-bold border border-slate-200 rounded-[16px] text-slate-500 hover:bg-slate-50"
                        >
                          清除限制
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">设定单次生成的最大字数范围，避免回复过长或过短。</p>
                  </div>

                  {/* Perspectives */}
                  <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm space-y-3 text-left">
                    <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">人称写作视角选择</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">对方 (角色们) 的人称</span>
                        <select
                          value={settingsPartnerP}
                          onChange={(e) => setSettingsPartnerP(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                        >
                          <option value="third">名字</option>
                          <option value="first">我</option>
                          <option value="second">你</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">我 (主角/用户) 的人称</span>
                        <select
                          value={settingsUserP}
                          onChange={(e) => setSettingsUserP(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                        >
                          <option value="first">我</option>
                          <option value="second">你</option>
                          <option value="third">名字</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Style Presets */}
                  <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm space-y-3 text-left">
                    <label className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">自定义剧本文风设定</label>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 block font-medium">快捷文风预设</span>
                      <select
                        value={settingsStylePresetId}
                        onChange={(e) => {
                          const selId = e.target.value;
                          setSettingsStylePresetId(selId);
                          const matched = [...DEFAULT_STYLE_PRESETS.slice(0, 1), ...customPresets].find(p => p.id === selId);
                          if (matched) {
                            setSettingsStylePromptName(matched.name === "默认风格" ? "" : matched.name);
                            setSettingsStylePromptContent(selId === "none" ? "" : matched.description);
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                      >
                        {[...DEFAULT_STYLE_PRESETS.slice(0, 1), ...customPresets].map(p => (
                          <option key={p.id} value={p.id}>
                            {p.id.startsWith("custom_") ? `⭐ ${p.name} (自定义)` : p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2 pt-1.5 border-t border-slate-100">
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
                          className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
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
                          className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>

                      {settingsStylePromptName.trim() && settingsStylePromptContent.trim() && (
                        <button
                          type="button"
                          onClick={handleCreateCustomPreset}
                          className="w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-[16px] border border-indigo-200/50 transition-all text-[10px]"
                        >
                          💾 保存当前文风为自定义永久预设
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Show Avatars Toggle */}
                  <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm flex items-center justify-between text-left">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">是否显示双方头像</span>
                      <span className="text-[10px] text-slate-400">开启后会在剧本左右侧显示头像与名称标识</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsShowAvatars}
                      onChange={(e) => setSettingsShowAvatars(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-white cursor-pointer"
                    />
                  </div>

                  {/* Custom CSS */}
                  <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm space-y-3 text-left">
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
  font-size: 15px !important;
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-[8px] px-3 py-2 text-emerald-400 font-mono text-[10px] focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400">在这里输入 CSS 样式规则，点击保存后即可在当前剧本空间内实时渲染应用！</p>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="p-4 bg-white border-t border-slate-100 flex gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex-1 py-3 rounded-[16px] border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveSettings();
                      setIsSettingsOpen(false);
                    }}
                    className="flex-1 py-3 rounded-[16px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors shadow-md"
                  >
                    保存设置
                  </button>
                </div>
              </div>
            ) : (
              <>
            <header className="offline-workspace-header">
              <div className="offline-workspace-nav">
                <button
                  type="button"
                  onClick={handleExitStoryWorkspace}
                  aria-label="返回线下故事列表"
                  className="offline-icon-button offline-workspace-back"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="offline-workspace-title">
                  <h1>
                    <span className="offline-workspace-title-text">{activeStory.title}</span>
                    <span className="offline-mode-label">{activeStory.mode === "director" ? "导演" : activeStory.mode === "if" ? "IF线" : "续写"}</span>
                  </h1>
                  <p>与「{selectedChar.remark || selectedChar.name}」的离线剧本空间</p>
                </div>
                <div className="offline-workspace-menu-anchor">
                <button
                  ref={workspaceMenuTriggerRef}
                  type="button"
                  onClick={() => setIsWorkspaceMenuOpen((open) => !open)}
                  aria-label="打开线下剧情菜单"
                  className="offline-icon-button"
                >
                  <MoreHorizontal size={18} />
                </button>
                <PopoverMenu open={isWorkspaceMenuOpen} onClose={() => setIsWorkspaceMenuOpen(false)} anchorRef={workspaceMenuTriggerRef} placement="bottom-end" ariaLabel="线下剧情菜单" className="offline-workspace-menu">
                    <button type="button" role="menuitem" onClick={() => { setIsWorkspaceMenuOpen(false); setIsReadingSettingsOpen(true); }}><span className="offline-workspace-menu-icon" aria-hidden="true">Aa</span><span>阅读设置</span></button>
                    <button type="button" role="menuitem" onClick={() => { setIsWorkspaceMenuOpen(false); setIsSettingsOpen(true); }}><Settings size={16} /><span>剧本设置</span></button>
                  </PopoverMenu>
                </div>
              </div>
            </header>

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

            <main className="offline-story-scroll offline-message-list">
              {activeStory.customCss && <style dangerouslySetInnerHTML={{ __html: activeStory.customCss }} />}
              <div className="offline-story-list">
                {visibleStoryMessages.length > 0 && <div className="offline-story-session"><span>{new Date(activeStory.createdAt).toLocaleDateString()} · 剧情记录</span><span>{visibleStoryMessages.length} 段</span></div>}
                {visibleStoryMessages.length === 0 && (
                  <div className="offline-empty-state">
                    <p>剧本空间已经准备好。写下一个动作、一句对白，或让角色为这一幕打开故事。</p>
                    <button onClick={() => handleSendMessage(undefined, true)}>让 {selectedChar.remark || selectedChar.name} 开启第一幕</button>
                  </div>
                )}
                {visibleStoryMessages.map((msg) => {
                  let charToUse = selectedChar;
                  if (msg.sender !== "user" && activeStory.characterIds?.length) {
                    const matched = characters.filter((character) => activeStory.characterIds?.includes(character.id)).find((character) => msg.content.includes(character.remark || character.name));
                    if (matched) charToUse = matched;
                  }
                  return <OfflineStoryCard
                    key={msg.id}
                    message={msg}
                    character={charToUse}
                    settings={settings}
                    showAvatars={activeStory.showAvatars !== false}
                    menuOpen={activeNodeMenuId === msg.id}
                    onMenuToggle={() => setActiveNodeMenuId((current) => current === msg.id ? null : msg.id)}
                    onEdit={() => { setActiveNodeMenuId(null); handleStartEdit(msg.id, msg.content); }}
                    onDelete={() => { setActiveNodeMenuId(null); setPendingDeleteMessageId(msg.id); }}
                    onGuidance={() => { setActiveNodeMenuId(null); setIsGuidancePanelOpen(true); }}
                  />;
                })}
                {isGenerating && <div className="offline-story-status"><RefreshCw size={15} className="animate-spin" />{selectedChar.remark || selectedChar.name} 正在续写这一幕…</div>}
                {errorMsg && <div className="offline-story-error">{errorMsg}</div>}
                <div ref={workspaceEndRef} />
              </div>
            </main>

            <div className="offline-composer-wrap">
              <form onSubmit={(event) => { event.preventDefault(); handleSendMessage(undefined, !inputText.trim()); }} className="offline-composer">
                <Input
                  type="text"
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  placeholder={activeStory.mode === "director" ? "继续写下去，或留下这一幕的方向…" : "继续写下去…"}
                  className="offline-composer-input"
                  inputClassName="offline-composer-input-field"
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
            setGuidanceDraft({ oneTime, ongoing });
            setIsGuidancePanelOpen(false);
            showToast("场外指导已暂存（当前不会改变 AI 生成规则）");
          }}
        />
      )}

      {editingMessage && (
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

      {/* ================= STORY CREATION DIALOG / MODAL ================= */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="app-viewport-overlay fixed inset-x-0 top-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-150 bg-white p-5 text-slate-800 space-y-4 shadow-2xl"
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
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">角色</label>
                  <select
                    value={selectedCharId}
                    onChange={(event) => setSelectedCharId(event.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    {selectableCharacters.map((character) => <option key={character.id} value={character.id}>{character.remark || character.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
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
                </div>

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

              <button
                onClick={handleCreateStory}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-md"
              >
                开启剧本空间
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



    </div>
  );
}
