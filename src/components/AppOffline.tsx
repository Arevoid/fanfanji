import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, Plus, Trash2, Send, Sparkles, BookOpen, 
  Link2, Calendar, MessageSquare, ChevronRight, HelpCircle, 
  Settings, Check, RefreshCw, Layers, Eye, BookMarked, Cpu, Pencil
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Character, Message, OfflineStory, MemoryItem, UserSettings, WorldBookEntry } from "../types";
import { apiChat } from "../utils/apiHelper";
import { splitTextToOfflineSegments } from "../utils/pngParser";
import { getRelevantMemories } from "./AppMemory";
import { getLatestWorldBookEntries, buildWorldBookSystemBlocks } from "../utils/worldBook";

interface AppOfflineProps {
  characters: Character[];
  settings: UserSettings;
  offlineStories: OfflineStory[];
  onSaveOfflineStory: (story: OfflineStory) => void;
  onDeleteOfflineStory: (storyId: string) => void;
  onClose: () => void;
  onNavigateToChat?: (charId: string) => void;
  memories: MemoryItem[];
  onSaveMemories: (mems: MemoryItem[]) => void;
  messages?: Message[];
  activeChatCharId?: string | null;
  worldBookEntries?: WorldBookEntry[];
}

export default function AppOffline({
  characters = [],
  settings,
  offlineStories = [],
  onSaveOfflineStory,
  onDeleteOfflineStory,
  onClose,
  onNavigateToChat,
  memories = [],
  onSaveMemories,
  messages = [],
  activeChatCharId = null,
  worldBookEntries = []
}: AppOfflineProps) {
  const [selectedCharId, setSelectedCharId] = useState<string>(() => {
    if (activeChatCharId && characters.some(c => c.id === activeChatCharId)) {
      return activeChatCharId;
    }
    return characters[0]?.id || "";
  });
  const [activeStory, setActiveStory] = useState<OfflineStory | null>(null);
  const [lastLoadedCharId, setLastLoadedCharId] = useState<string | null>(null);
  
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

  // Chat/Editor input state
  const [inputText, setInputText] = useState("");
  // Kept as a constant for backward-compatible rendering of older story data.
  // The composer no longer exposes a narration/speech mode selector.
  const inputNarration = false;
  const setInputNarration = (_value: boolean) => undefined;
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
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
    onSaveOfflineStory(updatedStory);
    setActiveStory(updatedStory);
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

    onSaveOfflineStory(updatedStory);
    setActiveStory(updatedStory);
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

  const selectedChar = characters.find(c => c.id === selectedCharId) || characters[0];
  const charStories = offlineStories.filter(s => 
    s.characterId === selectedCharId || (s.characterIds && s.characterIds.includes(selectedCharId))
  );

  const storyChars = activeStory 
    ? (activeStory.characterIds && activeStory.characterIds.length > 0 
        ? characters.filter(c => activeStory.characterIds?.includes(c.id))
        : [selectedChar])
    : [selectedChar];

  const storyCharNamesLabel = storyChars.map(c => c.remark || c.name).join("、");
  const firstActorLabel = storyChars.length > 1 ? "角色们" : (selectedChar.remark || selectedChar.name);

  // Online messages are an invisible handoff context, never part of the offline
  // manuscript. The id check also hides snapshots created before this flag existed.
  const visibleStoryMessages = activeStory?.messages.filter((message) =>
    !message.isImportedContext && !message.id.startsWith("offline-import-")
  ) || [];

  const workspaceEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (workspaceEndRef.current) {
      workspaceEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeStory?.messages, isGenerating]);

  // Load selected character's saved story on select or mount
  useEffect(() => {
    if (selectedCharId && selectedCharId !== lastLoadedCharId) {
      setLastLoadedCharId(selectedCharId);
      const savedStoryId = localStorage.getItem(`offline_story_id_${selectedCharId}`);
      if (savedStoryId) {
        const story = offlineStories.find(s => s.id === savedStoryId);
        if (story) {
          setActiveStory(story);
          return;
        }
      }
      setActiveStory(null);
    }
  }, [selectedCharId, offlineStories, lastLoadedCharId]);

  // Handle opening a story
  const handleOpenStory = (story: OfflineStory) => {
    setActiveStory(story);
    localStorage.setItem(`offline_mode_active_${story.characterId}`, "true");
    localStorage.setItem(`offline_story_id_${story.characterId}`, story.id);
  };

  const getSyncedMessageCount = (story: OfflineStory) =>
    story.lastSyncedMessageCount ?? (story.archivedAt ? story.messages.length : 0);

  const hasUnsyncedOnlineProgress = (story: OfflineStory) =>
    story.messages.length > getSyncedMessageCount(story);

  const clearOfflineSession = (story: OfflineStory) => {
    localStorage.removeItem(`offline_story_id_${story.characterId}`);
    localStorage.setItem(`offline_mode_active_${story.characterId}`, "false");
  };

  // Exit story workspace back to list
  const handleExitStoryWorkspace = () => {
    // Online continuations always archive their newly-written plot immediately
    // on exit, so the next online reply can continue the same topic.
    if (activeStory?.sourceChatId && hasUnsyncedOnlineProgress(activeStory)) {
      handleSyncMemoryToBrain(activeStory);
    }
    if (activeStory) clearOfflineSession(activeStory);
    setActiveStory(null);
    setIsSettingsOpen(false);
  };

  // Create new offline story
  const handleCreateStory = () => {
    if (!selectedCharId) {
      showToast("请先选择一个角色！");
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
      const liveMessages = messages.filter(m => m.characterId === selectedCharId);
      const allChatsRaw = liveMessages.length === 0 ? localStorage.getItem("phone_messages_v3") : null;
      if (liveMessages.length > 0 || allChatsRaw) {
        try {
          const parsed = liveMessages.length > 0 ? liveMessages : JSON.parse(allChatsRaw || "[]") as Message[];
          const contextLimit = characters.find(c => c.id === selectedCharId)?.contextMemoryLimit || 20;
          const relevantMsgs = parsed
            .filter(m => m.characterId === selectedCharId)
            .slice(-contextLimit * 2); // preserve the configured number of dialogue rounds
          
          const importedMessages = relevantMsgs.map(m => ({
            ...m,
            id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            isOffline: true
          }));
          importedContext = {
            messages: importedMessages,
            memories: memories.filter(m => m.characterId === selectedCharId).map(m => m.content),
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
      characterIds: selectedCharIds.length > 0 ? selectedCharIds : [selectedCharId],
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

    onSaveOfflineStory(newStory);
    setActiveStory(newStory);
    localStorage.setItem(`offline_mode_active_${selectedCharId}`, "true");
    localStorage.setItem(`offline_story_id_${selectedCharId}`, newStory.id);
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
      onDeleteOfflineStory(storyId);
      if (activeStory?.id === storyId) {
        setActiveStory(null);
      }
      showToast("故事已删除");
    }
  };

  // Sync memory manually
  const handleSyncMemoryToBrain = (story: OfflineStory) => {
    const syncStart = getSyncedMessageCount(story);
    const messagesToSync = story.messages.slice(syncStart);
    if (!messagesToSync.length) return;
    
    // Create a summarized memory of this offline development
    // Keep the archive concise but include the full newly-written segment when
    // it is short. Long segments retain their latest 12 beats for continuity.
    const lastMsgs = messagesToSync.slice(-12);
    const storyCharsList = story.characterIds && story.characterIds.length > 0 
      ? characters.filter(c => story.characterIds?.includes(c.id))
      : [selectedChar];

    const formattedCharsList = storyCharsList.map(c => c.remark || c.name).join("、");
    const summaryText = lastMsgs
      .map(m => m.isNarration ? `[旁白描述] ${m.content}` : `[对话] ${m.sender === "user" ? "我" : "角色"}: ${m.content}`)
      .join(" \n");

    const syncMarker = `offline-story:${story.id}:${syncStart}-${story.messages.length}`;
    const newMemoryContent = `[线下剧本《${story.title}》新增剧情总结（参与者: ${formattedCharsList}）| ${syncMarker}]\n${summaryText}`;

    // Sync to all participating characters
    const newMems = [...memories];
    let syncedCount = 0;
    storyCharsList.forEach(char => {
      const isDup = memories.some(m => m.characterId === char.id && m.content.includes(syncMarker));
      if (!isDup) {
        const memoryItem: MemoryItem = {
          id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          characterId: char.id,
          content: newMemoryContent,
          timestamp: Date.now(),
          importance: 7,
          isManual: true
        };
        newMems.unshift(memoryItem);
        syncedCount++;
      }
    });

    if (syncedCount > 0) {
      onSaveMemories(newMems);
      const archivedStory = {
        ...story,
        archivedAt: Date.now(),
        archivedMemoryIds: [...(story.archivedMemoryIds || []), ...newMems.slice(0, syncedCount).map(memory => memory.id)],
        lastSyncedMessageCount: story.messages.length,
        updatedAt: Date.now()
      };
      onSaveOfflineStory(archivedStory);
      if (activeStory?.id === story.id) setActiveStory(archivedStory);
      showToast(`剧情记忆已成功同步至 ${syncedCount} 位参与角色的主大脑！`);
    } else {
      showToast("所有角色的最近进展已同步，无需重复同步");
    }
  };

  // Delete individual plot record
  const handleDeleteMessage = (msgId: string) => {
    if (!activeStory) return;
    if (confirm("确定要删除这段剧情记录吗？")) {
      const updatedMsgs = activeStory.messages.filter(m => m.id !== msgId);
      const updatedStory = {
        ...activeStory,
        messages: updatedMsgs,
        updatedAt: Date.now()
      };
      onSaveOfflineStory(updatedStory);
      setActiveStory(updatedStory);
      showToast("剧情记录已删除");
    }
  };

  // Send message inside workspace
  const handleSendMessage = async (textToSend?: string, forceAIOnly = false) => {
    if (!activeStory) return;
    setErrorMsg("");

    const text = textToSend !== undefined ? textToSend : inputText.trim();
    if (!text && !forceAIOnly) return;

    let updatedStory = { ...activeStory };
    
    // 1. If we have user text to add
    if (text && !forceAIOnly) {
      const userMsg: Message = {
        id: `offline-msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        characterId: activeStory.characterId,
        sender: "user",
        content: text,
        timestamp: Date.now(),
        isOffline: true,
        isNarration: false
      };
      updatedStory = {
        ...activeStory,
        messages: [...activeStory.messages, userMsg],
        updatedAt: Date.now()
      };
      onSaveOfflineStory(updatedStory);
      setActiveStory(updatedStory);
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
        ? characters.filter(c => updatedStory.characterIds?.includes(c.id))
        : [selectedChar];
      const sourceChat = characters.find(c => c.id === updatedStory.sourceChatId);
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
- 互通的线上记忆：${char.compressedMemory || "暂无"}
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
        const relevantMems = getRelevantMemories(snapshotMemories, char.id, text || "续写故事", 3);
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
          characterId: activeStory.characterId,
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

        onSaveOfflineStory(finalStory);
        setActiveStory(finalStory);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("呼叫主脑剧本引擎失败，请检查网络或API Key设定。");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800 relative overflow-hidden font-sans select-none">
      
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
            className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50"
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
                {characters.map(char => {
                  const isSel = char.id === selectedCharId;
                  const charStoriesCount = offlineStories.filter(s => s.characterId === char.id).length;
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
            className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 offline-workspace-container"
          >
            {isSettingsOpen ? (
              /* ================= STORY SETTINGS PAGE ================= */
              <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
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
                      onClick={() => handleSyncMemoryToBrain(activeStory)}
                      className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-[16px] border border-indigo-200/50 transition-all text-xs flex items-center justify-center gap-1.5 shadow-sm"
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
            {/* Header */}
            <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button 
                  onClick={handleExitStoryWorkspace}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-850 truncate block max-w-[200px]">
                      {activeStory.title}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 border border-indigo-200/60 uppercase font-extrabold shrink-0">
                      {activeStory.mode === "director" ? "导演" : activeStory.mode === "if" ? "IF线" : "续写"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">与「{selectedChar.remark || selectedChar.name}」的离线剧本空间</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center shrink-0">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                  title="高级剧本配置"
                >
                  <Settings className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Source Reference banner */}
            {activeStory.sourceChatId && (
              <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between text-xs text-indigo-600">
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>已关联线上聊天记录 (导入了 {activeStory.sourceChatMsgCount || 0} 条历史对话)</span>
                </div>
                {onNavigateToChat && (
                  <button 
                    onClick={() => {
                      if (hasUnsyncedOnlineProgress(activeStory)) {
                        handleSyncMemoryToBrain(activeStory);
                      }
                      clearOfflineSession(activeStory);
                      setActiveStory(null);
                      setIsSettingsOpen(false);
                      onNavigateToChat(activeStory.characterId);
                    }}
                    className="text-[10px] underline font-bold hover:text-indigo-700"
                  >
                    返回线上聊天
                  </button>
                )}
              </div>
            )}

            {/* IF-Line Hypothesis Premise banner */}
            {activeStory.mode === "if" && activeStory.ifPrompt && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 font-sans flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>IF假想设定: {activeStory.ifPrompt}</span>
              </div>
            )}

            {/* Messaging Workspace Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-white offline-message-list">
              
              {activeStory.customCss && (
                <style dangerouslySetInnerHTML={{
                  __html: `
                    /* Custom CSS from story settings */
                    ${activeStory.customCss}
                  `
                }} />
              )}
              
              {visibleStoryMessages.length > 0 && (
                /* Elegant session metadata header */
                <div className="flex items-center justify-between border-b border-slate-150/40 pb-3 mb-6 select-none">
                  <span className="text-[11px] font-medium tracking-wide text-slate-400 font-mono">
                    {new Date(activeStory.createdAt).toLocaleDateString()} {new Date(activeStory.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200/40">
                    {activeStory.messages.length} 句
                  </span>
                </div>
              )}

              {visibleStoryMessages.length === 0 && (
                <div className="py-12 text-center text-slate-500 space-y-3 px-6">
                  <p className="text-xs leading-relaxed">🎬 剧本空间已就绪！可以先在输入框选择“旁白/描述”或“发言”来开个头，也可以直接点击下方的 “AI 续写” 让 {selectedChar.remark || selectedChar.name} 主动打破僵局并书写一段精美的小说开场白。</p>
                  <button
                    onClick={() => handleSendMessage(undefined, true)}
                    className="px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-sm"
                  >
                    ✨ 让 {selectedChar.remark || selectedChar.name} 开启第一幕
                  </button>
                </div>
              )}

              {visibleStoryMessages.map((msg) => {
                const isSelf = msg.sender === "user";
                const isUserSpoken = isSelf && !msg.isNarration;
                const showAvatars = activeStory.showAvatars !== false;

                // Determine avatar/name for character messages
                let charToUse = selectedChar;
                if (!isSelf && activeStory.characterIds && activeStory.characterIds.length > 0) {
                  const matched = characters.filter(c => activeStory.characterIds?.includes(c.id)).find(c => {
                    const nameStr = c.remark || c.name;
                    return msg.content.includes(nameStr);
                  });
                  if (matched) charToUse = matched;
                }

                const isEditing = editingMessageId === msg.id;

                if (isUserSpoken) {
                  // User Spoken Dialogue
                  return (
                    <div 
                      key={msg.id}
                      id={`offline-msg-${msg.id}`}
                      className="offline-message-item offline-msg-user w-full flex items-start justify-end my-5 gap-3 group relative pr-7 select-text"
                    >
                      {/* Edit or Delete Action triggers */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-100 transition-all z-10">
                        <button
                          onClick={() => handleStartEdit(msg.id, msg.content)}
                          className="p-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-500 shadow-sm border border-slate-200"
                          title="编辑该段内容"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-500 shadow-sm border border-slate-200"
                          title="删除这段发言"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex flex-col items-end max-w-[80%]">
                        {showAvatars && (
                          <span className="offline-nickname text-[10px] text-slate-400 mb-1">
                            {settings.name || "我"}
                          </span>
                        )}
                        
                        {isEditing ? (
                          <div className="w-full bg-white p-3 rounded-[16px] border border-slate-100 shadow-lg space-y-3 min-w-[240px]">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full p-3 text-xs border border-slate-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-slate-800 min-h-[80px] leading-relaxed resize-none text-left"
                              placeholder="编辑这段文字..."
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1.5 text-[11px] font-bold rounded-[8px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
                              >
                                取消
                              </button>
                              <button
                                onClick={() => handleSaveEdit(msg.id)}
                                className="px-3.5 py-1.5 text-[11px] font-bold rounded-[8px] bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1 transition-all"
                              >
                                <Check className="w-3 h-3" />
                                保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="offline-bubble relative bg-slate-100 rounded-2xl px-4 py-2.5 border border-slate-200/40 shadow-sm hover:shadow-md transition-all">
                            <p className="offline-msg-content text-[13.5px] leading-relaxed text-[#5e6672] font-medium font-sans italic whitespace-pre-wrap">
                              {(() => {
                                const parts = msg.content.split(/(“[^”]*”|「[^」]*」)/g);
                                return parts.map((part, index) => {
                                  if ((part.startsWith('“') && part.endsWith('”')) || (part.startsWith('「') && part.endsWith('」'))) {
                                    return (
                                      <span key={index} className="offline-dialogue-text font-medium text-slate-900">
                                        {part}
                                      </span>
                                    );
                                  }
                                  return (
                                    <span key={index} className="offline-narrative-text text-slate-600">
                                      {part}
                                    </span>
                                  );
                                });
                              })()}
                            </p>
                          </div>
                        )}
                      </div>

                      {showAvatars && (
                        <div className="offline-avatar-container shrink-0">
                          <img 
                            src={settings.avatar} 
                            alt={settings.name || "我"} 
                            referrerPolicy="no-referrer"
                            className="offline-avatar w-8 h-8 rounded-full border border-slate-200 object-cover shadow-sm"
                          />
                        </div>
                      )}
                    </div>
                  );
                } else {
                  // AI Narrative/Dialogue or User Narrative - beautiful flat left-aligned book-style paragraphs
                  return (
                    <div 
                      key={msg.id}
                      id={`offline-msg-${msg.id}`}
                      className="offline-message-item offline-msg-character w-full flex items-start my-4 gap-3 group relative pr-7 select-text transition-all duration-200 hover:bg-slate-50/50 rounded-lg py-1 px-1"
                    >
                      {showAvatars && (
                        <div className="offline-avatar-container shrink-0 mt-0.5">
                          <img 
                            src={charToUse.avatar} 
                            alt={charToUse.remark || charToUse.name} 
                            referrerPolicy="no-referrer"
                            className="offline-avatar w-8 h-8 rounded-full border border-slate-200 object-cover shadow-sm"
                          />
                        </div>
                      )}

                      <div className="flex-1 flex flex-col min-w-0">
                        {showAvatars && (
                          <span className="offline-nickname text-[10px] text-slate-400 mb-1">
                            {charToUse.remark || charToUse.name}
                          </span>
                        )}

                        {isEditing ? (
                          <div className="w-full bg-white p-3 rounded-[16px] border border-slate-100 shadow-lg space-y-3">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full p-3 text-xs border border-slate-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-slate-800 min-h-[100px] leading-relaxed resize-none text-left"
                              placeholder="编辑这段文字..."
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1.5 text-[11px] font-bold rounded-[8px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
                              >
                                取消
                              </button>
                              <button
                                onClick={() => handleSaveEdit(msg.id)}
                                className="px-3.5 py-1.5 text-[11px] font-bold rounded-[8px] bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1 transition-all"
                              >
                                <Check className="w-3 h-3" />
                                保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="offline-msg-content text-[14px] leading-loose text-slate-700 font-sans tracking-wide text-justify whitespace-pre-wrap">
                            {(() => {
                              const parts = msg.content.split(/(“[^”]*”|「[^」]*」)/g);
                              return parts.map((part, index) => {
                                if ((part.startsWith('“') && part.endsWith('”')) || (part.startsWith('「') && part.endsWith('」'))) {
                                  return (
                                    <span key={index} className="offline-dialogue-text font-medium text-slate-900">
                                      {part}
                                    </span>
                                  );
                                }
                                return (
                                  <span key={index} className="offline-narrative-text text-slate-600">
                                    {part}
                                  </span>
                                );
                              });
                            })()}
                          </p>
                        )}
                      </div>

                      {/* Edit or Delete Action triggers */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-100 transition-all z-10">
                        <button
                          onClick={() => handleStartEdit(msg.id, msg.content)}
                          className="p-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-500 shadow-sm border border-slate-200"
                          title="编辑这段内容"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-500 shadow-sm border border-slate-200"
                          title="删除这段剧情"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                }
              })}

              {/* Typing Indicator */}
              {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold italic px-1 py-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{selectedChar.remark || selectedChar.name} 正在编织剧情走向...</span>
                </div>
              )}

              {/* Error indicator */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                  {errorMsg}
                </div>
              )}

              <div ref={workspaceEndRef} />
            </div>

            {/* Bottom control & Input bar */}
            <div className="p-3 bg-white border-t border-slate-100 space-y-2 shadow-inner">
              <div className="hidden">
                
                {/* Input Mode Toggle: Spoken dialogue vs Narrative */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[11px] text-slate-500 uppercase tracking-wide">类型:</span>
                  <button
                    onClick={() => setInputNarration(false)}
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1 shadow-sm ${
                      !inputNarration 
                        ? "bg-slate-900 border-slate-900 text-white !text-white" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={!inputNarration ? "text-white !text-white" : "text-slate-600"}>💬 发言</span>
                  </button>
                  <button
                    onClick={() => setInputNarration(true)}
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1 shadow-sm ${
                      inputNarration 
                        ? "bg-slate-900 border-slate-900 text-white !text-white" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={inputNarration ? "text-white !text-white" : "text-slate-600"}>📖 旁白</span>
                  </button>
                </div>

                {/* AI Auto-write button (續寫) */}
                <button
                  disabled={isGenerating}
                  onClick={() => handleSendMessage(undefined, true)}
                  className="px-3 py-1 rounded bg-slate-50 hover:bg-slate-100 text-indigo-600 font-bold text-[10px] border border-slate-200 transition-all flex items-center gap-1 shadow-sm"
                >
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  <span>✨ 续写</span>
                </button>
              </div>

              {/* Chat Input Field form */}
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(undefined, !inputText.trim()); }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    inputNarration 
                      ? "输入旁白..." 
                      : activeStory.mode === "director" 
                        ? "发出简短指令控制后续走向 (例: [突降暴雨，我们躲在桥下])" 
                        : "输入发言，继续对话剧情..."
                  }
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-[8px] px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center transition-colors shadow-md disabled:opacity-50 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= STORY CREATION DIALOG / MODAL ================= */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-150 rounded-2xl w-full max-w-sm p-5 text-slate-800 space-y-4 shadow-2xl"
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
                            ? "bg-indigo-50 border-indigo-500 text-indigo-600 font-bold" 
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        <span className="font-bold text-[11px]">{m.label}</span>
                        <span className="text-[8px] text-slate-400 mt-0.5">{m.desc}</span>
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
