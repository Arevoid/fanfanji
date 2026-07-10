import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { apiChat, apiExtractMemories } from "../utils/apiHelper";
import { Character, Message, Moment, UserSettings, MomentComment, WorldBookEntry, MemoryItem, MemoryVaultSettings, OfflineStory } from "../types";
import { splitTextToOfflineSegments, cleanOnlineMessage, splitIntoWeChatBubbles, compressImage } from "../utils/pngParser";
import { LIVING_HUMAN_PROMPT } from "../utils/livingPrompt";
import { getRelevantMemories } from "./AppMemory";
import {
  MessageSquare,
  Users,
  Compass,
  User,
  Send,
  ArrowUp,
  MoreHorizontal,
  Bookmark,
  Pin,
  Image as ImageIcon,
  Heart,
  MessageCircle,
  FolderHeart,
  Settings,
  ChevronLeft,
  X,
  Plus,
  Sliders,
  Camera,
  Music,
  Video,
  Phone,
  FileText,
  MapPin,
  Gift,
  DollarSign,
  Trash2,
  AlertCircle,
  Quote,
  Mic,
  Volume2,
  Smile,
  Copy,
  BookOpen,
  RefreshCw
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

interface AppChatProps {
  characters: Character[];
  settings: UserSettings;
  messages: Message[];
  moments: Moment[];
  onSendMessage: (msg: Message) => void;
  onSaveCharacter: (char: Character) => void; // Support updating character remark, pinned status, chatBg
  onAddMoment: (moment: Moment) => void;
  onAddCommentToMoment: (momentId: string, comment: MomentComment) => void;
  onLikeMoment: (momentId: string, userName: string) => void;
  onToggleBookmark: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onClose: () => void;
  onSaveSettings: (settings: UserSettings) => void;
  onNavigateToApp: (appId: string) => void;
  worldBookEntries?: WorldBookEntry[];
  onClearMessages?: (charId: string, keepLastCount?: number) => void;
  memories: MemoryItem[];
  onSaveMemories: (updated: MemoryItem[]) => void;
  recallSettings: MemoryVaultSettings;
  activeChatCharId: string | null;
  setActiveChatCharId: (id: string | null) => void;
  offlineStories?: OfflineStory[];
  onSaveOfflineStory?: (story: OfflineStory) => void;
}

const PRESEED_MOMENTS: Moment[] = [];

const getMomentsContextString = (allMoments: Moment[], activeChar: Character, ownerName: string) => {
  if (!allMoments || allMoments.length === 0) return "";
  
  // Take last 8 moments
  const sortedMoments = [...allMoments].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  
  const momentLines = sortedMoments.map((m) => {
    const author = m.characterId === activeChar.id ? "你(发布人)" : (m.characterId ? m.authorName : `${ownerName}(机主)`);
    const dateStr = new Date(m.timestamp).toLocaleDateString("zh-CN");
    const likesStr = m.likes.length > 0 ? ` [点赞人: ${m.likes.join(", ")}]` : "";
    const commentsStr = m.comments.length > 0 ? ` [评论: ${m.comments.map(c => `${c.authorName}: ${c.content}`).join("; ")}]` : "";
    return `- ${dateStr} | ${author} 发表朋友圈: "${m.content}"${likesStr}${commentsStr}`;
  });

  return `[🚨 微信朋友圈记忆 (Moments Memory)]
以下是最近微信朋友圈里的动态，你对这些内容拥有清晰的记忆。你不一定要主动提起它们，但它们是你们共享的日常生活背景。在交流中，你可以根据你们的亲疏关系极度自然地参考这些生活点滴，例如偶尔作为话题，或对对方最近的状态有所了解。
${momentLines.join("\n")}`;
};

const getOfflineStoriesContextString = (offlineStories: OfflineStory[] | undefined, activeCharId: string, charName: string) => {
  if (!offlineStories || offlineStories.length === 0) return "";
  const charStories = offlineStories.filter(s => s.characterId === activeCharId);
  if (charStories.length === 0) return "";

  // Take the last 3 offline stories to avoid token overflow
  const recentStories = [...charStories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  
  const storyLines = recentStories.map((story) => {
    // Get last 6 messages to keep context concise but rich
    const lastMsgs = story.messages.slice(-6);
    const msgContent = lastMsgs.map(m => {
      const senderName = m.isNarration ? "[旁白描述]" : (m.sender === "user" ? "我" : charName);
      return `  - ${senderName}: ${m.content}`;
    }).join("\n");
    return `- 线下小说剧本《${story.title}》 (创建于: ${new Date(story.createdAt).toLocaleDateString()}):
${msgContent || "  (暂无剧情)"}`;
  });

  return `[🚨 线下剧本走向与平行宇宙记忆 (Offline Stories Memory)]
以下是你们在线下剧本/平行时空剧情模式（Offline Mode）中共同创造的小说故事线与经历，你对这些线下剧情细节拥有清晰的记忆。
当线上聊天涉及相关话题时，你可以在不破坏线上微信身份的前提下，极为自然地将这些经历作为你们两人“发生过的默契、回忆、平行宇宙经历”来进行互动：
${storyLines.join("\n\n")}`;
};

const getPostIntervalMs = (character: Character) => {
  const bioAndPersonality = ((character.personality || "") + " " + (character.backstory || "")).toLowerCase();
  const lovesSharing = /(热爱分享|喜欢分享|热爱生活|发朋友圈|爱分享|活跃|话唠|分享欲)/i.test(bioAndPersonality);
  
  if (lovesSharing) {
    // 1-2 days
    return (24 + Math.random() * 24) * 60 * 60 * 1000; 
  } else {
    // 1-5 days
    return (24 + Math.random() * 96) * 60 * 60 * 1000;
  }
};

const getCharacterLastMomentTimestamp = (moments: Moment[], charId: string) => {
  const charMoments = moments.filter(m => m.characterId === charId);
  if (charMoments.length === 0) return 0;
  return Math.max(...charMoments.map(m => m.timestamp));
};

export default function AppChat({
  characters,
  settings,
  messages,
  moments,
  onSendMessage,
  onSaveCharacter,
  onAddMoment,
  onAddCommentToMoment,
  onLikeMoment,
  onToggleBookmark,
  onDeleteMessage,
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
  offlineStories = [],
  onSaveOfflineStory,
}: AppChatProps) {
  const [activeTab, setActiveTab] = useState<"chats" | "contacts" | "moments" | "me">("chats");

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
    if (activeChatCharId && !initiatedChatIds.includes(activeChatCharId)) {
      setInitiatedChatIds((prev) => [...prev, activeChatCharId]);
    }
  }, [activeChatCharId, initiatedChatIds]);

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
    if (activeChatCharId) {
      setLastReadTimestamps((prev) => ({
        ...prev,
        [activeChatCharId]: Date.now(),
      }));
    }
  }, [activeChatCharId, messages.length]);

  const getUnreadCount = (charId: string) => {
    if (activeChatCharId === charId) return 0;
    const lastRead = lastReadTimestamps[charId] || 0;
    const charMsgs = messages.filter(
      (m) => m.characterId === charId && m.sender === "character" && !m.isOffline && m.timestamp > lastRead
    );
    return charMsgs.length;
  };

  const startChatWith = (charId: string) => {
    setActiveChatCharId(charId);
    if (!initiatedChatIds.includes(charId)) {
      setInitiatedChatIds((prev) => [...prev, charId]);
    }
  };
  
  // Navigation State
  const activeCharacter = characters.find((c) => c.id === activeChatCharId);
  const currentChatMessages = messages.filter((m) => m.characterId === activeChatCharId && !m.isOffline);
  const activeStylePreset = (activeCharacter?.chatStylePreset) || (settings.globalChatStylePreset) || "default";
  const isFloatingCute = activeStylePreset === "floating-cute";

  const [momentsFilterCharId, setMomentsFilterCharId] = useState<string | null>(null);
  const [isShowingCardModal, setIsShowingCardModal] = useState(false);
  const [singleCharacterMomentsId, setSingleCharacterMomentsId] = useState<string | null>(null);
  const [isShowingAddFriendDialog, setIsShowingAddFriendDialog] = useState(false);

  const [friendIds, setFriendIds] = useState<string[]>(() => {
    const raw = localStorage.getItem("phone_friend_ids");
    if (raw) return JSON.parse(raw);
    return characters.map(c => c.id);
  });

  useEffect(() => {
    try {
      localStorage.setItem("phone_friend_ids", JSON.stringify(friendIds));
    } catch (e) {
      console.error(e);
    }
  }, [friendIds]);

  const friends = characters.filter((c) => friendIds.includes(c.id));

  // Get location addresses from World Book entries related to this character
  const getDynamicLocations = () => {
    if (!activeCharacter) return [];
    
    const locations: string[] = [];
    
    // 1. Filter entries related to the current character
    const charEntries = worldBookEntries.filter(
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
    const globalEntries = worldBookEntries.filter(
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
  };

  // User profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
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
  const [chatInputText, setChatInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [manualLocationText, setManualLocationText] = useState("");
  const [emptyGreetingCheckedCharIds, setEmptyGreetingCheckedCharIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Offline Mode States (Inline Offline mode inside chat is disabled, transitioned to AppOffline)
  const isOfflineModeActive = false;
  const isInputNarration = false;
  const activeOfflineStoryId = null;

  const handleStartOfflineFromMsg = (msg: Message) => {
    if (!activeChatCharId || !activeCharacter) return;
    
    const charName = activeCharacter.remark || activeCharacter.name;
    const newStory: OfflineStory = {
      id: `story-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      characterId: activeChatCharId,
      title: `「${charName}」的聊天剧本 - ${new Date().toLocaleDateString()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: "continue",
      sourceChatId: activeChatCharId,
      sourceChatMsgCount: 1,
      messages: [{ ...msg, isOffline: true }]
    };
    
    if (onSaveOfflineStory) {
      onSaveOfflineStory(newStory);
    }
    
    localStorage.setItem(`offline_mode_active_${activeChatCharId}`, "true");
    localStorage.setItem(`offline_story_id_${activeChatCharId}`, newStory.id);
    
    showToast("已无痛切换到线下故事模式");

    if (onNavigateToApp) {
      onNavigateToApp("offline");
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 1500);
  };

  // Moments form state
  const [momentInputText, setMomentInputText] = useState("");
  const [momentAttachedImage, setMomentAttachedImage] = useState<string | null>(null);
  const [showMomentPublisher, setShowMomentPublisher] = useState(false);
  const [inlineCommentsTexts, setInlineCommentsTexts] = useState<Record<string, string>>({});
  const [showCommentInputMap, setShowCommentInputMap] = useState<Record<string, boolean>>({});

  // Settings draft states
  const [draftRemark, setDraftRemark] = useState("");
  const [draftIsPinned, setDraftIsPinned] = useState(false);
  const [draftChatBg, setDraftChatBg] = useState<string | undefined>(undefined);
  const [draftCustomCss, setDraftCustomCss] = useState("");
  const [draftChatStylePreset, setDraftChatStylePreset] = useState<"default" | "floating-cute" | "liquid-glass">("default");
  const [draftEnableProactiveChat, setDraftEnableProactiveChat] = useState(false);
  const [draftProactiveChatInterval, setDraftProactiveChatInterval] = useState(3);
  const [draftDisableBracketActions, setDraftDisableBracketActions] = useState(false);
  const [draftHistoryMemoryLimit, setDraftHistoryMemoryLimit] = useState(150);
  const [draftEnableTimeAwareness, setDraftEnableTimeAwareness] = useState(false);

  // Rich Attachment states
  const [showAttachPanel, setShowAttachPanel] = useState(false);
  const [activeAttachModal, setActiveAttachModal] = useState<"redpacket" | "music" | "location" | "file" | "calling" | "voice" | null>(null);
  const [callingType, setCallingType] = useState<"voice" | "video">("voice");
  const [voiceDuration, setVoiceDuration] = useState("5");
  const [callingStatus, setCallingStatus] = useState<"ringing" | "connected" | "ended">("ringing");
  const [callingDuration, setCallingDuration] = useState(0);
  const [redPacketAmount, setRedPacketAmount] = useState("8.88");
  const [redPacketGreeting, setRedPacketGreeting] = useState("恭喜发财，万事如意");
  const [showRedPacketOpenModal, setShowRedPacketOpenModal] = useState<boolean>(false);
  const [openRedPacketDetail, setOpenRedPacketDetail] = useState<{ amount: string; greeting: string } | null>(null);

  // Memory Compression and Proactive Chat states
  const [isCompressingMemory, setIsCompressingMemory] = useState(false);
  const [isTriggeringProactive, setIsTriggeringProactive] = useState(false);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [editingMemoryText, setEditingMemoryText] = useState("");

  // New features: Notes attachment, Quoting, Bubble Menu, Note Reader, OOC Annotation
  const [memoNotes, setMemoNotes] = useState<any[]>([]);
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [activeMenuMsg, setActiveMenuMsg] = useState<Message | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedFileNote, setSelectedFileNote] = useState<{ title: string; content: string } | null>(null);
  const [showOocCommentModal, setShowOocCommentModal] = useState<Message | null>(null);
  const [oocCommentText, setOocCommentText] = useState("");

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

  // Sync editing memory text
  useEffect(() => {
    if (activeCharacter) {
      setEditingMemoryText(activeCharacter.compressedMemory || "");
    }
  }, [activeCharacter, isShowingCardModal]);

  // Update character's last active time when user interacts with chat
  useEffect(() => {
    if (activeChatCharId && activeCharacter) {
      onSaveCharacter({
        ...activeCharacter,
        lastActiveTime: Date.now(),
      });
    }
  }, [activeChatCharId]);

  // Send character's custom opening speech / greeting if there are no messages in the chat history
  useEffect(() => {
    if (!activeChatCharId || !activeCharacter) return;
    
    const currentChatMessages = messages.filter((m) => m.characterId === activeChatCharId && !m.isOffline);
    if (currentChatMessages.length > 0) return;

    if (activeCharacter.greeting && activeCharacter.greeting.trim()) {
      const charMsg: Message = {
        id: `msg-greeting-${Date.now()}`,
        characterId: activeChatCharId,
        sender: "character",
        content: activeCharacter.greeting,
        timestamp: Date.now(),
      };
      onSendMessage(charMsg);
    } else {
      // No custom greeting set. Decide based on personality.
      if (emptyGreetingCheckedCharIds.includes(activeChatCharId)) return;
      
      setEmptyGreetingCheckedCharIds(prev => [...prev, activeChatCharId]);
      
      const personalityText = activeCharacter.personality || "";
      const mbtiText = (activeCharacter.mbti || "").toUpperCase();
      const backstoryText = activeCharacter.backstory || "";
      
      // Get triggered constant world book entries for the active character
      const greetingTriggeredEntries = (worldBookEntries || []).filter((entry) => {
        if (entry.isActive === false) return false;
        const isGlobal = !entry.characterId || entry.characterId === "global";
        if (!isGlobal && entry.characterId !== activeChatCharId) return false;
        return entry.triggerType === "constant";
      });

      const worldBookPromptAdditions = greetingTriggeredEntries
        .map(e => `【设定 - ${e.title}】\n${e.content}`)
        .join("\n\n");
      
      // Local heuristic: extraverted or proactive keywords
      const isExtraverted = mbtiText.startsWith("E") ||
        (/(主动|热情|外向|开朗|活泼|话痨|自来熟|社牛|温暖|元气|积极|话多)/.test(personalityText) &&
         !/(被动|慢热|内向|高冷|冷淡|孤僻|社恐|傲娇|淡漠)/.test(personalityText));

      const decideAndSend = async () => {
        setIsTyping(true);
        try {
          const prompt = `你现在要为一个AI角色判定：在没有设定开场白的情况下，根据该角色的人设，决定它是会【主动发第一条微信消息给用户】还是【等用户先发信息】。
角色的基本信息如下：
- 名字：${activeCharacter.name}
- 性格描述：${personalityText}
- MBTI：${mbtiText}
- 背景故事：${backstoryText}
${worldBookPromptAdditions ? `\n角色的相关世界书背景设定：\n${worldBookPromptAdditions}` : ""}

判定规则：
1. 如果角色性格属于外向、主动、热情、开朗，或MBTI为E型，或者因职业/背景习惯于主动沟通，它会决定【主动发第一条信息】。
2. 如果角色性格属于内向、慢热、被动、高冷、孤僻、傲娇、寡言、冷漠，或MBTI为I型，或者因身份不屑于/不方便主动，它会决定【等用户先发信息】。

请直接以以下JSON格式回复（不要包含 markdown 包裹，直接输出纯 JSON 字符串）：
{
  "shouldInitiate": true / false,
  "firstMessage": "如果 shouldInitiate 为 true，请写一句极其符合该人设性格、口癖和说话习惯的第一条微信消息（控制在50字以内，自然、像真人，不带废话；如果 shouldInitiate 为 false，这里留空字符串即可）"
}
`;

          let apiResponse;
          try {
            apiResponse = await apiChat({
              message: prompt,
              history: [],
              apiKey: settings.apiKey,
              model: settings.selectedModel || "gemini-3.5-flash",
              apiEndpoint: settings.apiEndpoint,
              apiTemperature: 0.7,
              systemInstruction: "你是一个角色扮演设定判别助手。请只输出合法的 JSON 字符串。"
            });
          } catch (e) {
            console.warn("AI decision failed, falling back to local heuristic rules:", e);
          }

          let shouldInitiate = isExtraverted;
          let firstMessage = "";

          if (apiResponse && apiResponse.text) {
            try {
              const cleanText = apiResponse.text.replace(/```json/g, "").replace(/```/g, "").trim();
              const parsed = JSON.parse(cleanText);
              if (typeof parsed.shouldInitiate === "boolean") {
                shouldInitiate = parsed.shouldInitiate;
              }
              if (typeof parsed.firstMessage === "string") {
                firstMessage = parsed.firstMessage;
              }
            } catch (jsonErr) {
              console.warn("Failed to parse JSON response from AI:", jsonErr, apiResponse.text);
            }
          }

          if (shouldInitiate) {
            // Generate a first message if empty
            if (!firstMessage || !firstMessage.trim()) {
              const genPrompt = `请扮演角色“${activeCharacter.name}”。你刚和用户在微信上建立联系，且你们之前没有任何聊天记录。
根据你的以下设定，主动发第一条微信消息向用户打个招呼：
- 性格：${personalityText}
- MBTI：${mbtiText}
- 背景故事：${backstoryText}
${worldBookPromptAdditions ? `\n相关世界书设定：\n${worldBookPromptAdditions}` : ""}

要求：
1. 语言极其符合你的角色口癖、语气和性格。
2. 极其简短，控制在 30 个字以内，像真实的微信聊天。
3. 直接输出你发送的话，绝对不要有任何括号注释、前缀、旁白、markdown 格式或任何多余文字。`;

              const genRes = await apiChat({
                message: genPrompt,
                history: [],
                apiKey: settings.apiKey,
                model: settings.selectedModel || "gemini-3.5-flash",
                apiEndpoint: settings.apiEndpoint,
                apiTemperature: 0.8,
                systemInstruction: `请扮演角色 ${activeCharacter.name}，极其简短、自然地发送第一条微信消息。不要带有任何多余格式。${
                  worldBookPromptAdditions ? `\n请遵循以下相关背景和世界书设定进行扮演：\n${worldBookPromptAdditions}` : ""
                }`
              });
              if (genRes && genRes.text) {
                firstMessage = genRes.text.trim().replace(/^["']|["']$/g, "");
              }
            }

            if (firstMessage && firstMessage.trim()) {
              // Add a slight delay to simulate realistic typing
              await new Promise(resolve => setTimeout(resolve, 1500));
              const charMsg: Message = {
                id: `msg-empty-greeting-${Date.now()}`,
                characterId: activeChatCharId,
                sender: "character",
                content: firstMessage,
                timestamp: Date.now(),
              };
              onSendMessage(charMsg);
            }
          }
        } catch (err) {
          console.error("Error in empty greeting decision process:", err);
        } finally {
          setIsTyping(false);
        }
      };

      decideAndSend();
    }
  }, [activeChatCharId, activeCharacter, messages, onSendMessage, emptyGreetingCheckedCharIds, settings, worldBookEntries]);

  // Background proactive check (every minute)
  useEffect(() => {
    const checkProactive = setInterval(() => {
      friends.forEach((friend) => {
        const lastActive = friend.lastActiveTime || Date.now();
        const threeHoursMs = 3 * 60 * 60 * 1000;
        if (
          friend.enableProactiveChat &&
          Date.now() - lastActive >= threeHoursMs
        ) {
          // Reset timer first to avoid flooding
          onSaveCharacter({
            ...friend,
            lastActiveTime: Date.now(),
          });
          triggerProactiveFor(friend.id);
        }
      });

      // Run character moments check
      checkAndTriggerCharacterMoments();
    }, 60000);
    return () => clearInterval(checkProactive);
  }, [friends, moments]);

  // Run character moments check on mount / tab change
  useEffect(() => {
    const timeout = setTimeout(() => {
      checkAndTriggerCharacterMoments();
    }, 3000);
    return () => clearTimeout(timeout);
  }, [friends, moments]);

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

  const generateResponseForUserMessage = async (userMsg: Message | null, customHistoryOverride?: Message[]) => {
    if (!activeChatCharId || !activeCharacter) return;
    setIsTyping(true);

    try {
      // Collect message history of this specific character to pass to backend
      const sourceMsgs = customHistoryOverride || (userMsg ? [...currentChatMessages, userMsg] : [...currentChatMessages]);
      const uniqueMsgsMap = new Map<string, Message>();
      sourceMsgs.forEach(m => {
        if (m) uniqueMsgsMap.set(m.id, m);
      });
      const finalMsgs = Array.from(uniqueMsgsMap.values()).sort((a, b) => a.timestamp - b.timestamp);

      // Limit history to active character's historyMemoryLimit (default 150 messages / 75 turns)
      const limit = activeCharacter.historyMemoryLimit || 150;
      const slicedMsgs = finalMsgs.slice(-limit);

      const history = slicedMsgs.map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.content,
      }));

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
WeChat messages are usually short, spontaneous, and conversational. Keep replies concise, warm, and highly natural.
Incorporate your background, age, and personality traits organically. Speak in Chinese. Maintain character role-play thoroughly.
Do NOT say you are an AI or Gemini, unless that is your explicit character人设.

🚨🚨🚨 [CRITICAL WECHAT CHAT RULES]:
1. You are in a direct online chat mode (线上聊天模式). You MUST reply using the correct WeChat message format.
2. You are STRICTLY FORBIDDEN from outputting any third-person narration, physical scene descriptions, action descriptions, or character thoughts (坚决不要输出任何第三人称旁白、场景描写、动作描写或任何第三方叙事/心理描写).
3. Do NOT write like a novel or story script. You must ONLY output the direct spoken messages that "${activeCharacter.name}" would type in a chat box. No narratives, no brackets, no third-person descriptions at all.`;

      if (!isOfflineModeActive && activeCharacter.disableBracketActions) {
        mainPromptText += `\n4. [🚨 CRITICAL FORMAT RULE]: Do NOT use any bracketed/parenthesized action descriptions, physical gestures, facial expressions, or ambient narration (e.g., "(微笑)", "（叹气）", "(摸摸头)", "*笑*", etc.) in your messages. You must interact using pure conversational speech/dialogue ONLY, without any action descriptions, unless such expressions are an absolute, unique signature part of how this specific character literally types/speaks. Maintain natural, realistic, text-message style dialogue.`;
      }

      let charDefText = `Roleplay Profile:
- Name: ${activeCharacter.name}
- Age: ${activeCharacter.age}
- Gender: ${activeCharacter.gender}
- MBTI: ${activeCharacter.mbti}
- Personality & Behavior: ${activeCharacter.personality}
- Background Story: ${activeCharacter.backstory}`;

      if (activeCharacter.compressedMemory) {
        charDefText += `\n- Previous Background: ${activeCharacter.compressedMemory}`;
      }

      // Recall memories from Memory Vault
      const topK = recallSettings?.recallCount || 5;
      const relevantMemories = getRelevantMemories(memories || [], activeChatCharId || "", userMsg ? userMsg.content : "", topK);
      if (relevantMemories.length > 0) {
        charDefText += `\n- Reclaimed Memories from previous conversations (Contextually relevant facts/moments):\n${relevantMemories.map((m) => `  * ${m.content}`).join("\n")}`;
      }

      const userProfileText = `User Profile (interacting with you):
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}`;

      // World Book triggering logic
      const triggeredEntries: {
        entry: WorldBookEntry;
        text: string;
      }[] = [];

      const lowerUserMsg = userMsg ? userMsg.content.toLowerCase() : "";

      for (const entry of worldBookEntries) {
        // Skip inactive entries
        if (entry.isActive === false) continue;

        // Check if bound to global or active character
        const isGlobal = !entry.characterId || entry.characterId === "global";
        if (!isGlobal && entry.characterId !== activeChatCharId) {
          continue;
        }

        let isTriggered = false;
        if (entry.triggerType === "constant") {
          isTriggered = true;
        } else if (entry.triggerType === "vector") {
          // Smart simulated vector term-overlap matching
          const textToMatch = (entry.title + " " + (entry.keywords || "") + " " + entry.content).toLowerCase();
          const userWords = lowerUserMsg.split(/[\s,.:;!?，。！？、]/).filter(w => w.length >= 2);
          if (userWords.some(word => textToMatch.includes(word)) || lowerUserMsg.includes(entry.title.toLowerCase())) {
            isTriggered = true;
          }
        } else {
          // "keys" trigger
          const kwStr = entry.keywords || entry.title || "";
          const kws = kwStr
            .split(/[,，]/)
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean);

          if (kws.some((kw) => lowerUserMsg.includes(kw))) {
            isTriggered = true;
          }
        }

        if (isTriggered) {
          triggeredEntries.push({
            entry,
            text: `【设定 - ${entry.title}】\n${entry.content}`
          });
        }
      }

      // Group triggered entries by SillyTavern insertion position
      const entriesByPos = {
        after_main_prompt: [] as string[],
        before_char_def: [] as string[],
        after_char_def: [] as string[],
        before_chat_history: [] as string[]
      };

      // Sort entries by depth ascending (smaller depth is closer / higher priority)
      const sortedTriggered = [...triggeredEntries].sort((a, b) => (a.entry.depth || 5) - (b.entry.depth || 5));

      sortedTriggered.forEach(({ entry, text }) => {
        const pos = entry.position || "after_char_def";
        if (pos in entriesByPos) {
          entriesByPos[pos as keyof typeof entriesByPos].push(text);
        } else {
          entriesByPos.after_char_def.push(text);
        }
      });

      // Assemble system instruction blocks
      let assembledInstructions: string[] = [];

      // 0. Base living human prompt (hidden base system instruction)
      assembledInstructions.push(LIVING_HUMAN_PROMPT);

      // 1. Main Prompt
      assembledInstructions.push(mainPromptText);

      // 1.5 Time awareness prompt if enabled (default to true to ensure correct time perception)
      if (activeCharacter.enableTimeAwareness !== false) {
        const now = new Date();
        const timeStr = now.toLocaleString("zh-CN", { 
          year: "numeric", 
          month: "long", 
          day: "numeric", 
          hour: "2-digit", 
          minute: "2-digit", 
          second: "2-digit",
          weekday: "long" 
        });
        assembledInstructions.push(`[🚨 当前实时物理时间感知同步]
当前现实物理世界的时间是：${timeStr}。
你对时间有精准的实时感知。请在你的回复中，极度自然地融合这一时间感（例如：如果在深夜，你可以表现出困倦或关心地催促对方去睡觉；如果在清晨，可以道早安；如果到饭点，可以提一句吃饭）。
请确保不要刻板、生硬地报时，而是像一个真实生活在该时区、该时刻的真人一样表现和说话。`);
      }

      // 2. After Main Prompt entries
      if (entriesByPos.after_main_prompt.length > 0) {
        assembledInstructions.push(`[World Book Background: Main Prompt Extensions]\n` + entriesByPos.after_main_prompt.join("\n\n"));
      }

      // 3. Before Character Definition entries
      if (entriesByPos.before_char_def.length > 0) {
        assembledInstructions.push(`[World Book Background: Context Primers]\n` + entriesByPos.before_char_def.join("\n\n"));
      }

      // 4. Character Definition
      assembledInstructions.push(charDefText);

      // 5. After Character Definition entries
      if (entriesByPos.after_char_def.length > 0) {
        assembledInstructions.push(`[World Book Background: Profile Extensions]\n` + entriesByPos.after_char_def.join("\n\n"));
      }

      // 6. User Profile
      assembledInstructions.push(userProfileText);

      // 7. Before Chat History entries
      if (entriesByPos.before_chat_history.length > 0) {
        assembledInstructions.push(`[World Book Background: Story Anchor]\n` + entriesByPos.before_chat_history.join("\n\n"));
      }

      // 8. WeChat Moments Context memory
      const momentsContext = getMomentsContextString(moments, activeCharacter, settings.name);
      if (momentsContext) {
        assembledInstructions.push(momentsContext);
      }

      // 8.5 Offline stories context memory
      const offlineStoriesContext = getOfflineStoriesContextString(offlineStories, activeCharacter.id, activeCharacter.name);
      if (offlineStoriesContext) {
        assembledInstructions.push(offlineStoriesContext);
      }

      const systemInstruction = assembledInstructions.join("\n\n---\n\n");

      // Custom tool/attachment format descriptions for character context
      let promptMessage = userMsg ? userMsg.content : "请继续续写我们的故事，继续推进剧情走向或日常对话交互。";
      if (promptMessage.startsWith("data:image/")) {
        promptMessage = `[发送图片/照片] 我给你发送了一张照片，请对此做出符合你人设、生动有趣、短小、像真正情侣或朋友一样的回复。`;
      } else if (promptMessage.startsWith("[红包]")) {
        const parts = promptMessage.split("|");
        const amount = parts[1] || "8.88";
        const greeting = parts[2] || "恭喜发财，万事如意";
        promptMessage = `[发送红包] 我给你发送了一个金额为 ${amount} 元的微信红包，祝福语是：“${greeting}”。请对此做出非常符合你人设、自然且简短可亲的回复，表达谢谢并表达心意。`;
      } else if (promptMessage.startsWith("[位置]")) {
        const parts = promptMessage.split("|");
        const loc = parts[1] || "位置";
        promptMessage = `[发送位置] 我给你分享了一个微信位置：[${loc}]。请对此做出非常符合你人设、极其自然简短的回复，展现你听到这个地点时的真实性格反应。`;
      } else if (promptMessage.startsWith("[音乐]")) {
        const parts = promptMessage.split("|");
        const title = parts[1] || "音乐";
        promptMessage = `[分享音乐] 我给你分享了一首好听的音乐：《${title}》。请以此为话题，表达符合你人设的简短、真实的感受。`;
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
        promptMessage = `[分享文件] 我给你分享了一篇备忘录笔记，标题是《${title}》，内容如下：\n"""\n${decodedContent}\n"""\n请针对这篇笔记的标题和具体内容，做出非常符合你人设、温暖、极具代入感且简短亲密的回复。`;
      } else if (promptMessage.startsWith("[视频通话]")) {
        const parts = promptMessage.split("|");
        const status = parts[1] || "已结束";
        promptMessage = `[视频通话结束] 刚才我们进行了视频通话（通话状态：${status}）。请对此做出一个非常符合你人设、温暖、有爱的微信回复。`;
      } else if (promptMessage.startsWith("[语音通话]")) {
        const parts = promptMessage.split("|");
        const status = parts[1] || "已结束";
        promptMessage = `[语音通话结束] 刚才我们进行了语音通话（通话状态：${status}）。请对此做出一个非常符合 you 人设、温暖、有爱的微信回复。`;
      } else if (promptMessage.startsWith("[语音]|")) {
        const parts = promptMessage.split("|");
        const secs = parts[1] || "5";
        promptMessage = `[发送语音消息] 我给你发送了一条语音消息（时长：${secs}秒）。由于微信语音默认无法直接识别文字，请假设你听到了我用温暖/俏皮的声音发给你的语音（内容可以由你自行结合之前的话题进行脑补/想象，或者是日常可爱的闲聊）。请对此做出一个非常符合你人设、温暖、极其简短像真人在微信回语音或文字一样的回复。`;
      }

      const data = await apiChat({
        message: promptMessage,
        history,
        systemInstruction,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
        streamCompatible: settings.streamCompatible,
      });

      if (data && data.text) {
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

          // Save each segment to the active offline story
          if (activeOfflineStoryId && onSaveOfflineStory) {
            const targetStory = offlineStories.find(s => s.id === activeOfflineStoryId);
            if (targetStory) {
              const updatedStory = {
                ...targetStory,
                messages: [...targetStory.messages, ...newMsgs],
                updatedAt: Date.now()
              };
              onSaveOfflineStory(updatedStory);
            }
          }
        } else {
          const cleanedText = cleanOnlineMessage(data.text, activeCharacter.disableBracketActions || false);
          const textToSplit = cleanedText || data.text;
          const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((activeCharacter?.personality || "") + (activeCharacter?.backstory || ""));
          const bubbles = splitIntoWeChatBubbles(textToSplit, keepPeriods);
          const createdMessages: Message[] = [];
          
          for (let idx = 0; idx < bubbles.length; idx++) {
            const bubbleText = bubbles[idx];
            const charMsg: Message = {
              id: `${Date.now()}-online-${idx}-${Math.random().toString(36).substr(2, 5)}`,
              characterId: activeChatCharId,
              sender: "character",
              content: bubbleText,
              timestamp: Date.now(),
            };
            
            setIsTyping(true);
            const chars = bubbleText.length;
            const duration = Math.max(800, Math.min(3500, chars * 100)) + (Math.floor(Math.random() * 500) - 200);
            await new Promise(resolve => setTimeout(resolve, Math.max(500, duration)));
            
            charMsg.timestamp = Date.now();
            onSendMessage(charMsg);
            createdMessages.push(charMsg);
            setIsTyping(false);
            
            if (idx < bubbles.length - 1) {
              await new Promise(resolve => setTimeout(resolve, Math.max(400, Math.floor(Math.random() * 400) + 400)));
            }
          }

          // Check if auto extraction is enabled and we have reached the trigger round count
          const isAutoExtractEnabled = activeCharacter.enableAutoSummary === true;

          const extractIntervalRounds = activeCharacter.summaryTriggerRound !== undefined
            ? activeCharacter.summaryTriggerRound
            : (recallSettings?.extractInterval || 10);

          if (isAutoExtractEnabled) {
            const triggerCount = extractIntervalRounds * 2;
            const currentMsgs = userMsg ? [...currentChatMessages, userMsg, ...createdMessages] : [...currentChatMessages, ...createdMessages];
            
            let eligibleMsgs = currentMsgs;
            if (activeCharacter.lastImmediateSummaryMsgId) {
              const idx = currentMsgs.findIndex(m => m.id === activeCharacter.lastImmediateSummaryMsgId);
              if (idx !== -1) {
                eligibleMsgs = currentMsgs.slice(idx + 1);
              }
            }

            if (eligibleMsgs.length >= triggerCount) {
              // Trigger automatic memory extraction in background
              setTimeout(async () => {
                const count = await handleExtractMemories(eligibleMsgs);
                if (count > 0 && onClearMessages) {
                  // Keep the last 4 messages to preserve conversational thread
                  onClearMessages(activeChatCharId, 4);
                }
              }, 200);
            }
          }

          // AI autonomously decides on Moments background cover from their own album
          if (activeCharacter.album && activeCharacter.album.length > 0) {
            const needsCover = !activeCharacter.momentsCover;
            const shouldChangeCover = needsCover || Math.random() < 0.35;
            if (shouldChangeCover) {
              const albumList = activeCharacter.album;
              const randomIndex = Math.floor(Math.random() * albumList.length);
              const selectedCover = albumList[randomIndex];
              if (selectedCover !== activeCharacter.momentsCover) {
                onSaveCharacter({
                  ...activeCharacter,
                  momentsCover: selectedCover,
                });
              }
            }
          }
        }
      } else {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          characterId: activeChatCharId,
          sender: "character",
          content: `⚠️ [系统出错]：${(data as any).error || "智能体未能理解该消息。"}`,
          timestamp: Date.now(),
        };
        onSendMessage(errMsg);
      }
    } catch (err: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        characterId: activeChatCharId,
        sender: "character",
        content: "⚠️ [离线错误]：无法建立与智能体服务器的连接，请确认网络并重试。",
        timestamp: Date.now(),
      };
      onSendMessage(errMsg);
    } finally {
      setIsTyping(false);
    }
  };

  const sendCustomMessage = (contentString: string) => {
    if (!activeChatCharId || !activeCharacter) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      characterId: activeChatCharId,
      sender: "user",
      content: contentString,
      timestamp: Date.now(),
    };
    onSendMessage(userMsg);
    generateResponseForUserMessage(userMsg);
  };

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastActiveCharIdRef = useRef<string | null>(null);
  const lastMsgCountRef = useRef<number>(0);

  // Pre-seed moments if state empty
  const allMoments = moments.length === 0 ? PRESEED_MOMENTS : moments;

  // Auto scroll in chats with smart detection
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!activeChatCharId || !container) return;

    const currentChatMsgs = messages.filter(m => m.characterId === activeChatCharId && !m.isOffline);
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
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: isFreshOpen ? "auto" : "smooth" });
        }
      }, 50);
    }
  }, [messages.length, activeChatCharId, isTyping]);

  // Scroll to bottom when visual viewport height changes (mobile keyboard pops up/down)
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleViewportResize = () => {
      if (!activeChatCharId) return;
      // Scroll to bottom when height changes (e.g., keyboard pops up or dismisses)
      setTimeout(() => {
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    };

    const vv = window.visualViewport;
    vv.addEventListener("resize", handleViewportResize);
    return () => {
      vv.removeEventListener("resize", handleViewportResize);
    };
  }, [activeChatCharId]);

  // Handle Send Message (User sends only, no immediate reply)
  const handleSendOnly = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInputText.trim() || !activeChatCharId || !activeCharacter) return;

    let userMsgText = chatInputText.trim();
    if (quotedMessage) {
      const senderName = quotedMessage.sender === "user" ? "我" : (activeCharacter.remark || activeCharacter.name);
      let shortContent = quotedMessage.content;
      if (shortContent.startsWith("[文件]")) {
        const parts = shortContent.split("|");
        shortContent = `[文件] ${parts[1] || "笔记"}`;
      } else if (shortContent.startsWith("[红包]")) {
        shortContent = "[红包]";
      } else if (shortContent.startsWith("[位置]")) {
        shortContent = "[位置]";
      } else if (shortContent.startsWith("[音乐]")) {
        shortContent = "[音乐]";
      }
      userMsgText = `「引用 ${senderName}：${shortContent}」\n${userMsgText}`;
      setQuotedMessage(null);
    }

    setChatInputText("");

    const userMsg: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      characterId: activeChatCharId,
      sender: "user",
      content: userMsgText,
      timestamp: Date.now(),
      isOffline: isOfflineModeActive ? true : undefined,
      isNarration: isOfflineModeActive ? isInputNarration : undefined
    };

    onSendMessage(userMsg);

    if (isOfflineModeActive && activeOfflineStoryId && onSaveOfflineStory) {
      const targetStory = offlineStories.find(s => s.id === activeOfflineStoryId);
      if (targetStory) {
        const updatedStory = {
          ...targetStory,
          messages: [...targetStory.messages, userMsg],
          updatedAt: Date.now()
        };
        onSaveOfflineStory(updatedStory);
      }
    }
  };

  // Handle Send Message and Trigger AI reply
  const handleSendAndReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeChatCharId || !activeCharacter) return;

    if (!chatInputText.trim()) {
      // If user input is empty, trigger AI response directly (continue the story)
      generateResponseForUserMessage(null, currentChatMessages);
      return;
    }

    let userMsgText = chatInputText.trim();
    if (quotedMessage) {
      const senderName = quotedMessage.sender === "user" ? "我" : (activeCharacter.remark || activeCharacter.name);
      let shortContent = quotedMessage.content;
      if (shortContent.startsWith("[文件]")) {
        const parts = shortContent.split("|");
        shortContent = `[文件] ${parts[1] || "笔记"}`;
      } else if (shortContent.startsWith("[红包]")) {
        shortContent = "[红包]";
      } else if (shortContent.startsWith("[位置]")) {
        shortContent = "[位置]";
      } else if (shortContent.startsWith("[音乐]")) {
        shortContent = "[音乐]";
      }
      userMsgText = `「引用 ${senderName}：${shortContent}」\n${userMsgText}`;
      setQuotedMessage(null);
    }

    setChatInputText("");

    const userMsg: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      characterId: activeChatCharId,
      sender: "user",
      content: userMsgText,
      timestamp: Date.now(),
      isOffline: isOfflineModeActive ? true : undefined,
      isNarration: isOfflineModeActive ? isInputNarration : undefined
    };

    onSendMessage(userMsg);

    let currentMessagesWithNewUser = currentChatMessages;
    if (isOfflineModeActive && activeOfflineStoryId && onSaveOfflineStory) {
      const targetStory = offlineStories.find(s => s.id === activeOfflineStoryId);
      if (targetStory) {
        const updatedStory = {
          ...targetStory,
          messages: [...targetStory.messages, userMsg],
          updatedAt: Date.now()
        };
        onSaveOfflineStory(updatedStory);
        currentMessagesWithNewUser = updatedStory.messages;
      }
    } else {
      currentMessagesWithNewUser = [...currentChatMessages, userMsg];
    }

    generateResponseForUserMessage(userMsg, currentMessagesWithNewUser);
  };

  const handleRegenerateResponse = async (targetMsg: Message, oocComment: string) => {
    if (!activeChatCharId || !activeCharacter) return;

    // 1. Delete target message
    if (onDeleteMessage) {
      onDeleteMessage(targetMsg.id);
    }

    // 2. Find the chat history excluding the targetMsg
    const previousMessages = currentChatMessages.filter((m) => m.id !== targetMsg.id);
    // Find the last user message
    const lastUserMsg = [...previousMessages].reverse().find((m) => m.sender === "user");
    if (!lastUserMsg) return;

    setIsTyping(true);

    try {
      // Limit history to active character's historyMemoryLimit (default 150 messages / 75 turns)
      const limit = activeCharacter.historyMemoryLimit || 150;
      const slicedMsgs = previousMessages.slice(-limit);

      // Map history
      const history = slicedMsgs.map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.content,
      }));

      // Construct system instructions
      let mainPromptText = `You are playing the role of "${activeCharacter.name}" in a WeChat chat.
WeChat messages are usually short, spontaneous, and conversational. Keep replies concise, warm, and highly natural.
Incorporate your background, age, and personality traits organically. Speak in Chinese. Maintain character role-play thoroughly.
Do NOT say you are an AI or Gemini.

🚨🚨🚨 [CRITICAL WECHAT CHAT RULES]:
1. You are in a direct online chat mode (线上聊天模式). You MUST reply using the correct WeChat message format.
2. You are STRICTLY FORBIDDEN from outputting any third-person narration, physical scene descriptions, action descriptions, or character thoughts (坚决不要输出任何第三人称旁白、场景描写、动作描写或任何第三方叙事/心理描写).
3. Do NOT write like a novel or story script. You must ONLY output the direct spoken messages that "${activeCharacter.name}" would type in a chat box. No narratives, no brackets, no third-person descriptions at all.`;

      if (activeCharacter.disableBracketActions) {
        mainPromptText += `\n4. [🚨 CRITICAL FORMAT RULE]: Do NOT use any bracketed/parenthesized action descriptions, physical gestures, facial expressions, or ambient narration (e.g., "(微笑)", "（叹气）", "(摸摸头)", "*笑*", etc.) in your messages. You must interact using pure conversational speech/dialogue ONLY, without any action descriptions, unless such expressions are an absolute, unique signature part of how this specific character literally types/speaks.`;
      }

      let charDefText = `Roleplay Profile:
- Name: ${activeCharacter.name}
- Age: ${activeCharacter.age}
- Gender: ${activeCharacter.gender}
- MBTI: ${activeCharacter.mbti}
- Personality & Behavior: ${activeCharacter.personality}
- Background Story: ${activeCharacter.backstory}`;

      if (activeCharacter.compressedMemory) {
        charDefText += `\n- Previous Background: ${activeCharacter.compressedMemory}`;
      }

      // Add OOC comment correction as high priority instruction
      charDefText += `\n\n[🚨 CRITICAL CORRECTION (OOC FEEDBACK)]:
Your previous response was marked as "OOC" (Out Of Character). 
Feedback from the user: "${oocComment}".
Please read the feedback carefully and rewrite your response to perfectly match your profile. Do NOT repeat the previous tone/behavior!`;

      // Recall memories
      const topK = recallSettings?.recallCount || 5;
      const relevantMemories = getRelevantMemories(memories || [], activeChatCharId || "", lastUserMsg.content, topK);
      if (relevantMemories.length > 0) {
        charDefText += `\n- Reclaimed Memories:\n${relevantMemories.map((m) => `  * ${m.content}`).join("\n")}`;
      }

      const userProfileText = `User Profile:
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}`;

      const momentsContextRegen = getMomentsContextString(moments, activeCharacter, settings.name);
      const offlineStoriesContextRegen = getOfflineStoriesContextString(offlineStories, activeCharacter.id, activeCharacter.name);

      // World Book triggering logic for regenerate response
      const triggeredEntries: {
        entry: WorldBookEntry;
        text: string;
      }[] = [];

      const lowerUserMsg = lastUserMsg.content.toLowerCase();

      for (const entry of worldBookEntries) {
        // Skip inactive entries
        if (entry.isActive === false) continue;

        // Check if bound to global or active character
        const isGlobal = !entry.characterId || entry.characterId === "global";
        if (!isGlobal && entry.characterId !== activeChatCharId) {
          continue;
        }

        let isTriggered = false;
        if (entry.triggerType === "constant") {
          isTriggered = true;
        } else if (entry.triggerType === "vector") {
          // Smart simulated vector term-overlap matching
          const textToMatch = (entry.title + " " + (entry.keywords || "") + " " + entry.content).toLowerCase();
          const userWords = lowerUserMsg.split(/[\s,.:;!?，。！？、]/).filter(w => w.length >= 2);
          if (userWords.some(word => textToMatch.includes(word)) || lowerUserMsg.includes(entry.title.toLowerCase())) {
            isTriggered = true;
          }
        } else {
          // "keys" trigger
          const kwStr = entry.keywords || entry.title || "";
          const kws = kwStr
            .split(/[,，]/)
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean);

          if (kws.some((kw) => lowerUserMsg.includes(kw))) {
            isTriggered = true;
          }
        }

        if (isTriggered) {
          triggeredEntries.push({
            entry,
            text: `【设定 - ${entry.title}】\n${entry.content}`
          });
        }
      }

      // Group triggered entries by SillyTavern insertion position
      const entriesByPos = {
        after_main_prompt: [] as string[],
        before_char_def: [] as string[],
        after_char_def: [] as string[],
        before_chat_history: [] as string[]
      };

      const sortedTriggered = [...triggeredEntries].sort((a, b) => (a.entry.depth || 5) - (b.entry.depth || 5));

      sortedTriggered.forEach(({ entry, text }) => {
        const pos = entry.position || "after_char_def";
        if (pos in entriesByPos) {
          entriesByPos[pos as keyof typeof entriesByPos].push(text);
        } else {
          entriesByPos.after_char_def.push(text);
        }
      });

      // Assemble system instruction blocks
      let assembledInstructions: string[] = [];

      // 0. Base living human prompt
      assembledInstructions.push(LIVING_HUMAN_PROMPT);

      // 1. Main Prompt
      assembledInstructions.push(mainPromptText);

      // 1.5 Time awareness prompt if enabled
      if (activeCharacter.enableTimeAwareness !== false) {
        const now = new Date();
        const timeStr = now.toLocaleString("zh-CN", { 
          year: "numeric", 
          month: "long", 
          day: "numeric", 
          hour: "2-digit", 
          minute: "2-digit", 
          second: "2-digit",
          weekday: "long" 
        });
        assembledInstructions.push(`[🚨 当前实时物理时间感知同步]
当前现实物理世界的时间是：${timeStr}。
你对时间有精准的实时感知。请在你的回复中，极度自然地融合这一时间感（例如：如果在深夜，你可以表现出困倦或关心地催促对方去睡觉；如果在清晨，可以道早安；如果到饭点，可以提一句吃饭）。
请确保不要刻板、生硬地报时，而是像一个真实生活在该时区、该时刻的真人一样表现和说话。`);
      }

      // 2. After Main Prompt entries
      if (entriesByPos.after_main_prompt.length > 0) {
        assembledInstructions.push(`[World Book Background: Main Prompt Extensions]\n` + entriesByPos.after_main_prompt.join("\n\n"));
      }

      // 3. Before Character Definition entries
      if (entriesByPos.before_char_def.length > 0) {
        assembledInstructions.push(`[World Book Background: Context Primers]\n` + entriesByPos.before_char_def.join("\n\n"));
      }

      // 4. Character Definition
      assembledInstructions.push(charDefText);

      // 5. After Character Definition entries
      if (entriesByPos.after_char_def.length > 0) {
        assembledInstructions.push(`[World Book Background: Profile Extensions]\n` + entriesByPos.after_char_def.join("\n\n"));
      }

      // 6. User Profile
      assembledInstructions.push(userProfileText);

      // 7. Before Chat History entries
      if (entriesByPos.before_chat_history.length > 0) {
        assembledInstructions.push(`[World Book Background: Story Anchor]\n` + entriesByPos.before_chat_history.join("\n\n"));
      }

      // 8. WeChat Moments Context memory
      if (momentsContextRegen) {
        assembledInstructions.push(momentsContextRegen);
      }

      // 8.5 Offline stories context memory
      if (offlineStoriesContextRegen) {
        assembledInstructions.push(offlineStoriesContextRegen);
      }

      const systemInstruction = assembledInstructions.join("\n\n---\n\n");

      const data = await apiChat({
        message: lastUserMsg.content,
        history,
        systemInstruction,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
        streamCompatible: settings.streamCompatible,
      });

      if (data && data.text) {
        const cleanedText = cleanOnlineMessage(data.text, activeCharacter.disableBracketActions || false);
        const textToSplit = cleanedText || data.text;
        const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((activeCharacter?.personality || "") + (activeCharacter?.backstory || ""));
        const bubbles = splitIntoWeChatBubbles(textToSplit, keepPeriods);
        bubbles.forEach((bubbleText, idx) => {
          const charMsg: Message = {
            id: `${Date.now()}-regen-${idx}-${Math.random().toString(36).substr(2, 5)}`,
            characterId: activeChatCharId,
            sender: "character",
            content: bubbleText,
            timestamp: Date.now() + idx,
          };
          onSendMessage(charMsg);
        });
      }
    } catch (err: any) {
      console.error("Regeneration error:", err);
    } finally {
      setIsTyping(false);
    }
  };

  // Save settings draft
  const handleSaveSettings = () => {
    if (activeCharacter) {
      onSaveCharacter({
        ...activeCharacter,
        remark: draftRemark.trim() || undefined,
        isPinned: draftIsPinned,
        chatBg: draftChatBg,
        customCss: draftCustomCss,
        chatStylePreset: draftChatStylePreset,
        enableProactiveChat: draftEnableProactiveChat,
        proactiveChatInterval: draftProactiveChatInterval,
        disableBracketActions: draftDisableBracketActions,
        historyMemoryLimit: draftHistoryMemoryLimit,
        enableTimeAwareness: draftEnableTimeAwareness,
      });
      setIsShowingCardModal(false);
    }
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
    if (!activeChatCharId || !activeCharacter) return 0;

    setIsCompressingMemory(true);
    try {
      const messagesToCompress = manualMessagesOverride || currentChatMessages;
      if (messagesToCompress.length === 0) {
        return 0;
      }
      
      const history = messagesToCompress.map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.content,
      }));

      const data = await apiExtractMemories({
        history,
        characterName: activeCharacter.name,
        apiKey: settings.apiKey,
        model: (!recallSettings?.extractModel || recallSettings.extractModel === "default-chat-model")
          ? (settings.selectedModel || "gemini-3.5-flash")
          : recallSettings.extractModel,
        apiEndpoint: settings.apiEndpoint,
      });

      if (data && data.items && Array.isArray(data.items)) {
        const validItems = data.items
          .map((content: string) => content.trim())
          .filter((content: string) => content.length > 0);

        if (validItems.length > 0) {
          const bulletPoints = validItems.map((item: string) => `- ${item}`).join("\n");
          const singleSummaryContent = `【自动对话记忆总结】\n${bulletPoints}`;

          const isDup = (memories || []).some(
            (m) =>
              m.characterId === activeChatCharId &&
              m.content.toLowerCase().replace(/[\s,.:;!?"']/g, "") ===
                singleSummaryContent.toLowerCase().replace(/[\s,.:;!?"']/g, "")
          );

          if (!isDup) {
            const newSingleItem: MemoryItem = {
              id: (Date.now() + Math.random()).toString(),
              characterId: activeChatCharId,
              content: singleSummaryContent,
              timestamp: Date.now(),
              importance: 5,
              isManual: false,
            };
            onSaveMemories([newSingleItem, ...(memories || [])]);
            return 1;
          }
        }
        return 0;
      } else {
        console.error("Extract memory API error:", (data as any).error);
      }
    } catch (err: any) {
      console.error("Memory extraction error:", err);
    } finally {
      setIsCompressingMemory(false);
    }
    return 0;
  };

  // Manual Trigger Proactive Message simulation
  const handleTriggerProactiveMessage = async () => {
    if (!activeChatCharId || !activeCharacter) return;

    setIsTriggeringProactive(true);
    setIsTyping(true);
    try {
      let proactivePrompt = `Instructions:
1. Speak in Chinese. Maintain character role-play thoroughly.
2. WeChat messages are usually short, spontaneous, and conversational. Keep replies concise, warm, and highly natural.
3. This is an initiator message, so check in on the user or share something from your day.
4. Do NOT say you are an AI or Gemini, unless that is your explicit character人设.`;

      if (activeCharacter.disableBracketActions) {
        proactivePrompt += `\n5. [🚨 CRITICAL FORMAT RULE]: Do NOT use any bracketed/parenthesized action descriptions, physical gestures, facial expressions, or ambient narration (e.g., "(微笑)", "（叹气）", "(摸摸头)", "*笑*", etc.) in your messages. You must interact using pure conversational speech/dialogue ONLY, without any action descriptions, unless such expressions are an absolute, unique signature part of how this specific character literally types/speaks.`;
      }

      const systemInstruction = `${LIVING_HUMAN_PROMPT}

---

You are playing the role of "${activeCharacter.name}" in a WeChat chat.
Roleplay Profile:
- Age: ${activeCharacter.age}
- Gender: ${activeCharacter.gender}
- MBTI: ${activeCharacter.mbti}
- Personality & Behavior: ${activeCharacter.personality}
- Background Story: ${activeCharacter.backstory}

${activeCharacter.compressedMemory ? `Compressed Memories (Important context from previous conversations): ${activeCharacter.compressedMemory}` : ""}

User Profile (interacting with you):
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}

PROACTIVE CONTACT TASK:
It has been 3 hours since you last talked to the user. You decided to proactively send a message to check on them or share something interesting about your current state, life, or what you are doing right now, matching your personality and backstory perfectly.

${proactivePrompt}`;

      const data = await apiChat({
        message: "(用户失联3小时，你主动给其发送了一条信息)",
        history: [],
        systemInstruction,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
        streamCompatible: settings.streamCompatible,
      });

      if (data && data.text) {
        const cleanedText = cleanOnlineMessage(data.text, activeCharacter.disableBracketActions || false);
        const textToSplit = cleanedText || data.text;
        const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((activeCharacter?.personality || "") + (activeCharacter?.backstory || ""));
        const bubbles = splitIntoWeChatBubbles(textToSplit, keepPeriods);
        bubbles.forEach((bubbleText, idx) => {
          const proactiveMsg: Message = {
            id: `${Date.now()}-proactive-${idx}-${Math.random().toString(36).substr(2, 5)}`,
            characterId: activeChatCharId,
            sender: "character",
            content: bubbleText,
            timestamp: Date.now() + idx,
          };
          onSendMessage(proactiveMsg);
        });
      } else {
        alert(`主动联络失败: ${(data as any).error || "智能体无响应"}`);
      }
    } catch (err: any) {
      alert(`主动联络错误: ${err.message || err}`);
    } finally {
      setIsTriggeringProactive(false);
      setIsTyping(false);
    }
  };

  // Automated background proactive message generator for any character
  const triggerProactiveFor = async (charId: string) => {
    const friend = characters.find((c) => c.id === charId);
    if (!friend) return;

    try {
      let instructionsPrompt = `Instructions:
1. Speak in Chinese. Maintain character role-play thoroughly.
2. WeChat messages are usually short, spontaneous, and conversational. Keep replies concise, warm, and highly natural.
3. This is an initiator message, so check in on the user or share something from your day.
4. Do NOT say you are an AI or Gemini, unless that is your explicit character人设.`;

      if (friend.disableBracketActions) {
        instructionsPrompt += `\n5. [🚨 CRITICAL FORMAT RULE]: Do NOT use any bracketed/parenthesized action descriptions, physical gestures, facial expressions, or ambient narration (e.g., "(微笑)", "（叹气）", "(摸摸头)", "*笑*", etc.) in your messages. You must interact using pure conversational speech/dialogue ONLY, without any action descriptions, unless such expressions are an absolute, unique signature part of how this specific character literally types/speaks.`;
      }

      const systemInstruction = `${LIVING_HUMAN_PROMPT}

---

You are playing the role of "${friend.name}" in a WeChat chat.
Roleplay Profile:
- Age: ${friend.age}
- Gender: ${friend.gender}
- MBTI: ${friend.mbti}
- Personality & Behavior: ${friend.personality}
- Background Story: ${friend.backstory}

${friend.compressedMemory ? `Compressed Memories (Important context from previous conversations): ${friend.compressedMemory}` : ""}

User Profile (interacting with you):
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}

PROACTIVE CONTACT TASK:
It has been 3 hours since you last talked to the user. You decided to proactively send a message to check on them or share something interesting about your current state, life, or what you are doing right now, matching your personality and backstory perfectly. Keep it spontaneous, concise, and realistic.

${instructionsPrompt}`;

      const data = await apiChat({
        message: "(你主动给用户发送了一条信息)",
        history: [],
        systemInstruction,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
        streamCompatible: settings.streamCompatible,
      });

      if (data && data.text) {
        const cleanedText = cleanOnlineMessage(data.text, friend.disableBracketActions || false);
        const textToSplit = cleanedText || data.text;
        const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((friend.personality || "") + (friend.backstory || ""));
        const bubbles = splitIntoWeChatBubbles(textToSplit, keepPeriods);
        bubbles.forEach((bubbleText, idx) => {
          const proactiveMsg: Message = {
            id: `${Date.now()}-friend-proactive-${idx}-${Math.random().toString(36).substr(2, 5)}`,
            characterId: charId,
            sender: "character",
            content: bubbleText,
            timestamp: Date.now() + idx,
          };
          onSendMessage(proactiveMsg);
        });
      }
    } catch (err) {
      console.error("Proactive message auto-trigger error:", err);
    }
  };

  const handleAutoCommentOnUserMoment = async (newMo: Moment) => {
    if (friends.length === 0) return;

    let commentingFriends = friends.filter(() => Math.random() < 0.6);
    if (commentingFriends.length === 0 && friends.length > 0) {
      const randomFriend = friends[Math.floor(Math.random() * friends.length)];
      commentingFriends = [randomFriend];
    }

    // Limit to max 3 friends
    commentingFriends = commentingFriends.slice(0, 3);

    for (const friend of commentingFriends) {
      const delay = Math.random() * 8000 + 4000; // 4 to 12 seconds delay
      setTimeout(async () => {
        try {
          const friendMsgs = messages
            .filter((m) => m.characterId === friend.id)
            .sort((a, b) => a.timestamp - b.timestamp);
          const slicedMsgs = friendMsgs.slice(-60); // 30 rounds of dialogue

          const history = slicedMsgs.map((m) => ({
            role: m.sender === "user" ? "user" : "model",
            text: m.content,
          }));

          const systemInstruction = `You are roleplaying as "${friend.name}".
Character Profile:
- Personality: ${friend.personality}
- Background: ${friend.backstory}

User Profile (Machine Owner / 机主):
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}

The user just posted a new WeChat Moment (朋友圈).
Moment Content: "${newMo.content}"
${newMo.image ? "[User attached an image to this Moment]" : ""}

Below is your recent direct chat history with the user (up to 30 rounds). It represents your current relationship context and shared history:
${slicedMsgs.length > 0 ? slicedMsgs.map(m => `* ${m.sender === "user" ? "我" : friend.name}: ${m.content}`).join("\n") : "(No prior chat history)"}

Your task: Write a short, natural comment on this Moment.
🚨 [CRITICAL WECHAT COMMENT RULES]:
1. The comment must be brief, extremely natural (like a real person typing on WeChat), and perfectly fit your personality, relationship, and recent chat memories with the user.
2. Keep it under 35 characters. Speak in Chinese.
3. No OOC, no narrative brackets like (微笑), just the direct comment text.
4. Try to make it feel deeply personal or reference recent chats subtly if applicable.
`;

          const response = await apiChat({
            message: "请根据以上内容，为机主的新朋友圈写一条符合你人设和记忆的简短微信评论：",
            history,
            systemInstruction,
            apiKey: settings.apiKey,
            model: settings.selectedModel || "gemini-3.5-flash",
            apiEndpoint: settings.apiEndpoint,
            apiTemperature: settings.apiTemperature,
          });

          if (response && response.text) {
            let cleanedComment = response.text.trim();
            cleanedComment = cleanedComment.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

            const newComment: MomentComment = {
              id: `${Date.now()}-comment-${Math.random().toString(36).substr(2, 5)}`,
              authorName: friend.remark || friend.name,
              authorAvatar: friend.avatar,
              content: cleanedComment,
              timestamp: Date.now(),
            };
            onAddCommentToMoment(newMo.id, newComment);
          }
        } catch (err) {
          console.error(`Failed to generate automatic comment for ${friend.name}:`, err);
        }
      }, delay);
    }
  };

  const handleAutoReplyToUserComment = async (momentId: string, userCommentText: string) => {
    // Find the moment
    const targetMoment = moments.find(m => m.id === momentId);
    if (!targetMoment) return;

    // Identify which character should reply
    // It should be the author of the moment (if it's a character), or if it's the user's moment,
    // we can make the character who the user is replying to (or the active character) reply.
    let targetChar: Character | undefined;
    if (targetMoment.characterId) {
      targetChar = characters.find(c => c.id === targetMoment.characterId);
    } else {
      // Fallback to match authorName
      targetChar = characters.find(c => c.name === targetMoment.authorName || c.remark === targetMoment.authorName);
    }

    // If the moment is posted by the user, and they are replying to a character's comment, or if we want a friend to reply
    if (!targetChar) {
      // If it's user's own moment, let the active character reply, or any friend
      targetChar = characters.find(c => c.id === activeChatCharId) || friends[0];
    }

    if (!targetChar) return;

    const friend = targetChar;
    const delay = Math.random() * 5000 + 3000; // 3 to 8 seconds delay
    
    setTimeout(async () => {
      try {
        const friendMsgs = messages
          .filter((m) => m.characterId === friend.id)
          .sort((a, b) => a.timestamp - b.timestamp);
        const slicedMsgs = friendMsgs.slice(-40);

        const history = slicedMsgs.map((m) => ({
          role: m.sender === "user" ? "user" : "model",
          text: m.content,
        }));

        const existingCommentsContext = targetMoment.comments
          .map(c => `* ${c.authorName}: ${c.content}`)
          .join("\n");

        const systemInstruction = `You are roleplaying as "${friend.name}".
Character Profile:
- Personality: ${friend.personality}
- Background: ${friend.backstory}

User Profile (Machine Owner / 机主):
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}

Context:
The user has just commented/replied on a WeChat Moment.
Moment Author: ${targetMoment.authorName}
Moment Content: "${targetMoment.content}"
${targetMoment.image ? "[Attached an image]" : ""}

Existing Comments on this Moment:
${existingCommentsContext || "(No other comments)"}

The User's latest comment/reply:
* ${settings.name}: "${userCommentText}"

Below is your recent direct chat history with the user (up to 20 rounds). It represents your current relationship context and shared history:
${slicedMsgs.length > 0 ? slicedMsgs.map(m => `* ${m.sender === "user" ? "我" : friend.name}: ${m.content}`).join("\n") : "(No prior chat history)"}

Your task: Write a short, extremely natural WeChat reply/comment to the user's latest comment "${userCommentText}".
🚨 [CRITICAL WECHAT COMMENT RULES]:
1. The reply must be brief, lively, extremely natural (like a real person replying on WeChat), and perfectly match your character's personality, tone of voice, relationship depth, and memories with the user.
2. Keep it under 35 characters. Speak in Chinese.
3. Speak directly to the user (e.g. use "你怎么...", "哈哈就是说啊", etc. without any formal prefixes). Do not write narrative actions or brackets like "(害羞)", just output the comment text.
4. Try to make it feel responsive to their comment.
`;

        const response = await apiChat({
          message: `请针对用户在朋友圈下对你（或他人）发表的最新评论 "${userCommentText}"，写一条符合你人设和记忆的简短微信回复：`,
          history,
          systemInstruction,
          apiKey: settings.apiKey,
          model: settings.selectedModel || "gemini-3.5-flash",
          apiEndpoint: settings.apiEndpoint,
          apiTemperature: settings.apiTemperature,
        });

        if (response && response.text) {
          let cleanedReply = response.text.trim();
          cleanedReply = cleanedReply.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

          const newComment: MomentComment = {
            id: `${Date.now()}-reply-${Math.random().toString(36).substr(2, 5)}`,
            authorName: friend.remark || friend.name,
            authorAvatar: friend.avatar,
            content: cleanedReply,
            timestamp: Date.now(),
          };
          onAddCommentToMoment(momentId, newComment);
        }
      } catch (err) {
        console.error(`Failed to generate reply to user comment for ${friend.name}:`, err);
      }
    }, delay);
  };

  const generateCharacterMoment = async (friend: Character) => {
    try {
      const friendMsgs = messages
        .filter((m) => m.characterId === friend.id)
        .sort((a, b) => a.timestamp - b.timestamp);
      const slicedMsgs = friendMsgs.slice(-60); // 30 rounds of dialogue memory

      const history = slicedMsgs.map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.content,
      }));

      const systemInstruction = `You are roleplaying as "${friend.name}".
Character Profile:
- Personality: ${friend.personality}
- Background: ${friend.backstory}

User Profile (Machine Owner / 机主):
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}

Below is your recent direct chat history with the user (up to 30 rounds). It represents your current relationship context and shared history/topics:
${slicedMsgs.length > 0 ? slicedMsgs.map(m => `* ${m.sender === "user" ? "我" : friend.name}: ${m.content}`).join("\n") : "(No prior chat history)"}

Your task: Write a WeChat Moment post (朋友圈) from your perspective.
🚨 [CRITICAL WECHAT MOMENT RULES]:
1. The post must fit your personality. It can be about your own personal life (feelings, work, hobbies) OR about your relationship/recent chats/interactions with the user.
2. The post content must be natural, engaging, and in Chinese.
3. Keep the content brief and spontaneous (usually 10 to 100 characters), matching typical WeChat Moment style.
4. Do NOT use OOC tags, narration brackets, or talk like an AI. Just output the text of the Moment post.
`;

      const response = await apiChat({
        message: "请根据你的设定以及与机主的历史记忆，写一条朋友圈内容（内容可以与你自己有关，也可以与机主有关）：",
        history,
        systemInstruction,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
      });

      if (response && response.text) {
        let cleanedContent = response.text.trim();
        cleanedContent = cleanedContent.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

        let momentImage: string | undefined = undefined;
        if (friend.album && friend.album.length > 0) {
          // 40% chance of attaching a photo from their album
          if (Math.random() < 0.4) {
            const randomIndex = Math.floor(Math.random() * friend.album.length);
            momentImage = friend.album[randomIndex];
          }
        }

        const newMo: Moment = {
          id: `${Date.now()}-char-moment-${Math.random().toString(36).substr(2, 5)}`,
          characterId: friend.id,
          authorName: friend.remark || friend.name,
          authorAvatar: friend.avatar,
          content: cleanedContent,
          timestamp: Date.now(),
          likes: [],
          comments: [],
          image: momentImage,
        };

        onAddMoment(newMo);
      }
    } catch (err) {
      console.error(`Failed to generate Moment for character ${friend.name}:`, err);
    }
  };

  const checkAndTriggerCharacterMoments = async () => {
    if (friends.length === 0) return;

    for (const friend of friends) {
      const lastPostTime = getCharacterLastMomentTimestamp(moments, friend.id);
      const interval = getPostIntervalMs(friend);
      const timeElapsed = Date.now() - lastPostTime;

      if (timeElapsed >= interval) {
        await generateCharacterMoment(friend);
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
    if (!momentInputText.trim() && !momentAttachedImage) return;

    const newMo: Moment = {
      id: Date.now().toString(),
      authorName: settings.name,
      authorAvatar: settings.avatar,
      content: momentInputText.trim(),
      timestamp: Date.now(),
      likes: [],
      comments: [],
      image: momentAttachedImage || undefined,
    };

    onAddMoment(newMo);
    setMomentInputText("");
    setMomentAttachedImage(null);
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

    const newComment: MomentComment = {
      id: Date.now().toString(),
      authorName: settings.name,
      authorAvatar: settings.avatar,
      content: text.trim(),
      timestamp: Date.now(),
    };

    onAddCommentToMoment(momentId, newComment);
    setInlineCommentsTexts({ ...inlineCommentsTexts, [momentId]: "" });
    setShowCommentInputMap(prev => ({ ...prev, [momentId]: false }));

    // Trigger character auto-reply to the user's new comment
    handleAutoReplyToUserComment(momentId, text.trim());
  };

  // Active chat threads list builder
  const chatThreads = characters
    .filter((char) => {
      if (!friendIds.includes(char.id)) return false;
      const threadMsgs = messages.filter((m) => m.characterId === char.id && !m.isOffline);
      const hasMessages = threadMsgs.length > 0;
      const isInitiated = initiatedChatIds.includes(char.id);
      const isActive = char.id === activeChatCharId;
      return hasMessages || isInitiated || isActive;
    })
    .map((char) => {
      const threadMsgs = messages.filter((m) => m.characterId === char.id && !m.isOffline);
      const lastMsg = threadMsgs.length > 0 ? threadMsgs[threadMsgs.length - 1] : null;
      return {
        character: char,
        lastMessage: lastMsg,
        isPinned: char.isPinned || false,
      };
    }).sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0);
    });

  const savedBookmarks = messages.filter((m) => m.isBookmarked);

  // Moments feed filtering
  const filteredMoments = momentsFilterCharId
    ? allMoments.filter((m) => m.characterId === momentsFilterCharId)
    : allMoments;

  const navigateToMomentsOf = (charId: string) => {
    setMomentsFilterCharId(charId);
    setActiveTab("moments");
    setActiveChatCharId(null);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-100 text-neutral-800 font-sans select-none overflow-hidden relative">
      
      {/* Active Chat Windows Overlay (QQ/WeChat Screen) */}
      {activeChatCharId && activeCharacter ? (
        <div className={`absolute inset-0 z-40 bg-slate-50 flex flex-col h-full animate-slide-up ${activeStylePreset === "liquid-glass" ? "style-liquid-glass" : ""}`} id="conv-screen">
          <div id="api-chat-screen" className="flex flex-col h-full w-full relative app-content">
            {activeCharacter.customCss && (
              <style>{activeCharacter.customCss}</style>
            )}

            {/* Beginner manual style adjustments */}
            <style>{`
              ${settings.avatarBorderRadius !== undefined ? `
                #conv-screen .avatar, 
                #conv-screen .user-avatar, 
                #conv-screen .ai-avatar {
                  border-radius: ${settings.avatarBorderRadius}px !important;
                }
              ` : ''}

              ${settings.otherBubbleBg ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .received-transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  background-color: ${getBubbleBackgroundStyle(settings.otherBubbleBg, settings.otherBubbleOpacity !== undefined ? settings.otherBubbleOpacity : 100)} !important;
                  background-image: none !important;
                }
              ` : ''}

              ${settings.otherBubbleColor ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .chat-bubble-other *,
                #conv-screen .received-transfer-card,
                #conv-screen .received-transfer-card *,
                #conv-screen .voice-message-bar.chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other * {
                  color: ${settings.otherBubbleColor} !important;
                }
              ` : ''}

              ${settings.selfBubbleBg ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .transfer-card,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  background-color: ${getBubbleBackgroundStyle(settings.selfBubbleBg, settings.selfBubbleOpacity !== undefined ? settings.selfBubbleOpacity : 100)} !important;
                  background-image: none !important;
                }
              ` : ''}

              ${settings.selfBubbleColor ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .chat-bubble-self *,
                #conv-screen .transfer-card,
                #conv-screen .transfer-card *,
                #conv-screen .voice-message-bar.chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self * {
                  color: ${settings.selfBubbleColor} !important;
                }
              ` : ''}
            `}</style>
            {activeStylePreset === "liquid-glass" && (
              <style>{`
                #conv-screen {
                  background: url("${activeCharacter.chatBg || 'https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW88JqUKBwtMIU2FxO5zQh4CKBC_pHUAACASQAAgvDiFZ7fSrFa6akITwE.png'}") center/cover no-repeat !important;
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
                  border-radius: 50% !important;
                  background: rgba(255, 255, 255, 0.72) !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.55) !important;
                  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05) !important;
                  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .cv-header .back-btn:hover {
                  background: rgba(255, 255, 255, 0.85) !important;
                  transform: scale(1.05) !important;
                }
                /* 菜单按钮 */
                .cv-header .menu-btn {
                  position: relative !important;
                  width: 42px !important;
                  height: 42px !important;
                  border-radius: 50% !important;
                  background: rgba(255, 255, 255, 0.72) !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.55) !important;
                  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05) !important;
                  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .cv-header .menu-btn:hover {
                  background: rgba(255, 255, 255, 0.85) !important;
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
                .phone-screen-container .style-liquid-glass .chat-bubble-self,
                .style-liquid-glass .chat-bubble-self {
                  background: rgba(255, 255, 255, 0.68) !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.55) !important;
                  color: #1c1917 !important;
                  border-radius: 20px !important;
                  border-top-right-radius: 20px !important;
                  border-top-left-radius: 20px !important;
                  border-bottom-right-radius: 20px !important;
                  border-bottom-left-radius: 20px !important;
                  padding: 11px 16px !important;
                  font-size: 12px !important;
                  font-weight: 600 !important;
                  line-height: 1.4 !important;
                  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.04) !important;
                }
                .phone-screen-container .style-liquid-glass .chat-bubble-self *,
                .style-liquid-glass .chat-bubble-self * {
                  color: #1c1917 !important;
                }

                .phone-screen-container .style-liquid-glass .chat-bubble-other,
                .style-liquid-glass .chat-bubble-other {
                  background: rgba(255, 255, 255, 0.68) !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.55) !important;
                  color: #1c1917 !important;
                  border-radius: 20px !important;
                  border-top-right-radius: 20px !important;
                  border-top-left-radius: 20px !important;
                  border-bottom-right-radius: 20px !important;
                  border-bottom-left-radius: 20px !important;
                  padding: 11px 16px !important;
                  font-size: 12px !important;
                  font-weight: 600 !important;
                  line-height: 1.4 !important;
                  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.04) !important;
                }
                .phone-screen-container .style-liquid-glass .chat-bubble-other *,
                .style-liquid-glass .chat-bubble-other * {
                  color: #1c1917 !important;
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
                  background: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                  padding: 12px 14px 24px 14px !important;
                  margin-top: auto !important;
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
                  border-radius: 50% !important;
                  background: rgba(255, 255, 255, 0.72) !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.55) !important;
                  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05) !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  color: #1c1917 !important;
                  transition: all 0.2s ease !important;
                  flex-shrink: 0 !important;
                }
                .cv-footer .chat-input {
                  height: 42px !important;
                  border-radius: 9999px !important;
                  background: rgba(255, 255, 255, 0.45) !important;
                  backdrop-filter: blur(20px) saturate(190%) !important;
                  -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                  border: 1.5px solid rgba(255, 255, 255, 0.45) !important;
                  color: #1c1917 !important;
                  font-size: 11px !important;
                  font-weight: 700 !important;
                  letter-spacing: 0.04em !important;
                  padding-left: 16px !important;
                  padding-right: 16px !important;
                  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03) !important;
                  flex-grow: 1 !important;
                  flex-shrink: 1 !important;
                  min-width: 0 !important;
                }
                .cv-footer .chat-input::placeholder {
                  color: rgba(28, 25, 23, 0.5) !important;
                  font-weight: 600 !important;
                  letter-spacing: 0.05em !important;
                }
                .cv-footer .cv-send-only-btn:disabled {
                  opacity: 0.5 !important;
                  background: rgba(255, 255, 255, 0.4) !important;
                }
                .cv-footer .cv-send-reply-icon svg {
                  fill: #1c1917 !important;
                  color: #1c1917 !important;
                  stroke: #1c1917 !important;
                }
                .cv-footer .cv-send-only-icon svg {
                  color: #1c1917 !important;
                  stroke: #1c1917 !important;
                }
              `}</style>
            )}
            {/* Chat Window Header with standard classes and compact size */}
            <div className={`flex items-center justify-between z-10 shrink-0 relative cv-header header app-top-container default-controls selection-controls ${
              isFloatingCute 
                ? "mx-3.5 mt-3.5 mb-1 bg-white/70 backdrop-blur-md rounded-[28px] border border-slate-200/50 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)] px-4 py-2" 
                : "px-4 py-1.5 bg-transparent"
            }`}>
              <button
                onClick={() => {
                  setActiveChatCharId(null);
                  setIsShowingCardModal(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0 cv-icon-btn back-btn"
              >
                <span className="cv-back-icon flex items-center justify-center w-full h-full">
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </span>
              </button>
              
              <div className="flex items-center gap-1.5 w-max max-w-[200px] header-title">
                <img 
                  src={activeCharacter.avatar} 
                  alt="" 
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/50 header-title-avatar"
                />
                <h2 className="text-[13px] font-bold text-slate-800 tracking-tight truncate header-title-name">
                  {activeCharacter.remark || activeCharacter.name}
                </h2>
                <div className="flex items-center gap-0.5 character-status">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-indicator online animate-pulse" />
                </div>
              </div>

              <button
                onClick={() => {
                  setDraftRemark(activeCharacter.remark || "");
                  setDraftIsPinned(activeCharacter.isPinned || false);
                  setDraftChatBg(activeCharacter.chatBg);
                  setDraftCustomCss(activeCharacter.customCss || "");
                  setDraftChatStylePreset(activeCharacter.chatStylePreset || "default");
                  setDraftEnableProactiveChat(activeCharacter.enableProactiveChat || false);
                  setDraftProactiveChatInterval(activeCharacter.proactiveChatInterval || 3);
                  setDraftDisableBracketActions(activeCharacter.disableBracketActions || false);
                  setDraftHistoryMemoryLimit(activeCharacter.historyMemoryLimit || 150);
                  setDraftEnableTimeAwareness(activeCharacter.enableTimeAwareness || false);
                  setIsShowingCardModal(!isShowingCardModal);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0 cv-icon-btn menu-btn"
              >
                <span className="cv-menu-icon flex items-center justify-center w-full h-full">
                  <MoreHorizontal className="w-4 h-4 text-slate-700" />
                </span>
              </button>
            </div>



          {/* Character Details / Settings Full-Screen Page */}
          {isShowingCardModal && (
            <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col h-full animate-slide-up">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
                <button
                  onClick={() => setIsShowingCardModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </button>
                <h2 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">设置</h2>
                <div className="w-8 shrink-0" />
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Character Profile Summary & Remark Settings */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                  <img
                    src={activeCharacter.avatar}
                    alt={activeCharacter.name}
                    className="w-16 h-16 rounded-full border border-slate-100 object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-base font-bold text-slate-800 truncate">
                      {activeCharacter.name}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={draftRemark}
                        onChange={(e) => setDraftRemark(e.target.value)}
                        placeholder="设置备注昵称..."
                        className="w-full bg-slate-50 px-3 py-1.5 rounded-[32px] border border-slate-200 focus:outline-none text-xs text-slate-600 placeholder-slate-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Operations Group Card */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4 text-xs">
                  {/* Settings toggles */}
                  <div className="divide-y divide-slate-100 pt-1 space-y-4">
                    {/* Pin Chat */}
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-[#52525b] font-bold text-xs">置顶聊天</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftIsPinned}
                          onChange={(e) => setDraftIsPinned(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                      </label>
                    </div>

                     {/* Character Specific Chat Style Preset Selector */}
                    <div className="py-3 border-t border-slate-100 space-y-2">
                      <span className="text-[#52525b] font-bold block text-xs">聊天页面预设样式</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDraftChatStylePreset("default")}
                          className={`py-1.5 px-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                            draftChatStylePreset === "default"
                              ? "border-neutral-950 bg-neutral-950 text-white font-bold shadow-sm"
                              : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100"
                          }`}
                        >
                          <span className="text-[11px]">默认经典</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftChatStylePreset("liquid-glass")}
                          className={`py-1.5 px-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                            draftChatStylePreset === "liquid-glass"
                              ? "border-neutral-950 bg-neutral-950 text-white font-bold shadow-sm"
                              : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100"
                          }`}
                        >
                          <span className="text-[11px]">液态玻璃</span>
                        </button>
                      </div>
                    </div>

                    {/* Disable Bracket Actions */}
                    <div className="flex items-center justify-between py-3 border-t border-slate-100">
                      <div className="space-y-0.5">
                        <span className="text-[#52525b] font-bold text-xs">过滤括号动描</span>
                        <span className="text-[10px] text-slate-400 block">开启后线上模式对话中不使用括号动作/描述，保留纯语言交流（除非人物说话特色）</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftDisableBracketActions}
                          onChange={(e) => setDraftDisableBracketActions(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                      </label>
                    </div>

                    {/* Time Awareness */}
                    <div className="flex items-center justify-between py-3 border-t border-slate-100">
                      <div className="space-y-0.5">
                        <span className="text-[#52525b] font-bold text-xs">时间感知功能</span>
                        <span className="text-[10px] text-slate-400 block">开启后角色在对话时能实时感知物理时间（如清晨、深夜、饭点），并动态生成贴合语境的时间对话</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftEnableTimeAwareness}
                          onChange={(e) => setDraftEnableTimeAwareness(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                      </label>
                    </div>

                    {/* Chat Background customizer */}
                    <div className="py-3 space-y-2 border-t border-slate-100">
                      <span className="text-[#52525b] font-bold block text-xs">专属背景壁纸</span>
                      {draftChatBg ? (
                        <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 h-24 flex items-center justify-center">
                          <img src={draftChatBg} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                          <div className="relative z-10 flex gap-2">
                            <label className="cursor-pointer bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-sm border border-slate-200">
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
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-sm"
                            >
                              移除
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100/50 p-4 rounded-xl text-xs transition-colors group">
                          <span className="text-slate-500 font-medium group-hover:text-slate-700">点击上传专属背景图片</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">支持 PNG, JPG 等格式</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleDraftChatBgUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    {/* History Memory Limit Customizer */}
                    <div className="py-3.5 space-y-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[#52525b] font-bold text-xs block">历史记忆（携带对话轮数）</span>
                          <span className="text-[10px] text-slate-400 block">设置发送至 AI 的最近消息条数限制</span>
                        </div>
                        <span className="text-xs font-bold text-slate-700 font-mono">
                          {draftHistoryMemoryLimit} 条 / {Math.round(draftHistoryMemoryLimit / 2)} 轮
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={1000}
                        step={50}
                        value={draftHistoryMemoryLimit}
                        onChange={(e) => setDraftHistoryMemoryLimit(parseInt(e.target.value))}
                        className="w-full accent-neutral-950 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                        <span>50条</span>
                        <span>250条</span>
                        <span>500条</span>
                        <span>750条</span>
                        <span>1000条</span>
                      </div>
                    </div>

                    {/* Character Specific CSS Customizer */}
                    <div className="py-3 space-y-1.5 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[#52525b] font-bold text-xs">单人专属聊天页 CSS 样式</span>
                        <span className="text-[9px] text-slate-400 font-medium bg-slate-100 px-1.5 py-0.5 rounded-full">优先于全局气泡</span>
                      </div>
                      <textarea
                        rows={12}
                        value={draftCustomCss}
                        onChange={(e) => setDraftCustomCss(e.target.value)}
                        placeholder={`/* 支持全面美化自定义。以下是常用选择器说明： */
.cv-header { /* 导航栏/顶栏 */ }
.cv-messages-list { /* 聊天背景/消息列表 */ }
.user-avatar { /* 个人头像 */ }
.ai-avatar { /* 对方头像 */ }
.chat-bubble-self { /* 个人气泡 */ }
.chat-bubble-other { /* 对方气泡 */ }
.cv-footer { /* 底部输入栏 */ }
.chat-input { /* 输入框样式 */ }

/* 自定义图标样式(隐藏默认SVG并设置图片链接)： */
.cv-back-icon svg { display: none !important; }
.cv-back-icon {
  background: url('返回按钮图片URL') center/contain no-repeat !important;
}

.cv-menu-icon svg { display: none !important; }
.cv-menu-icon {
  background: url('菜单按钮图片URL') center/contain no-repeat !important;
}

.cv-plus-icon svg { display: none !important; }
.cv-plus-icon {
  background: url('加号按钮图片URL') center/contain no-repeat !important;
}

.cv-send-only-icon svg { display: none !important; }
.cv-send-only-icon {
  background: url('仅发送按钮图片URL') center/contain no-repeat !important;
}

.cv-send-reply-icon svg { display: none !important; }
.cv-send-reply-icon {
  background: url('发送回复按钮图片URL') center/contain no-repeat !important;
}
`}
                        className="w-full bg-slate-50 p-4 text-[10px] text-slate-700 rounded-[20px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono leading-relaxed h-48"
                      />
                    </div>

                    {/* Proactive Chat Toggles */}
                    <div className="py-3.5 space-y-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[#52525b] font-bold text-xs block">主动联络</span>
                          <span className="text-[10px] text-slate-400 block">失联一定时间后根据性格主动给您发信息</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draftEnableProactiveChat}
                            onChange={(e) => setDraftEnableProactiveChat(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                          />
                        </label>
                      </div>

                      {draftEnableProactiveChat && (
                        <div className="space-y-3 pt-2.5 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#52525b] font-medium">联络时间间隔</span>
                            <span className="text-xs font-bold text-slate-700 font-mono">{draftProactiveChatInterval} 小时</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={24}
                            value={draftProactiveChatInterval}
                            onChange={(e) => setDraftProactiveChatInterval(parseInt(e.target.value))}
                            className="w-full accent-neutral-950 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                            <span>1h</span>
                            <span>6h</span>
                            <span>12h</span>
                            <span>18h</span>
                            <span>24h</span>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-400 leading-snug">
                              失联后 Ta 将分享日常或关心您。
                            </span>
                            <button
                              type="button"
                              onClick={handleTriggerProactiveMessage}
                              disabled={isTriggeringProactive}
                              className="shrink-0 px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-lg text-[9px] transition-colors shadow-sm disabled:opacity-50"
                            >
                              {isTriggeringProactive ? "正在发送..." : "⚡ 模拟主动发信"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Save button and clear record buttons at bottom of the page */}
                  <div className="pt-4 space-y-3 border-t border-slate-100">
                    <button
                      onClick={handleSaveSettings}
                      className="w-full py-3 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
                    >
                      保存设置
                    </button>
                    
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => setShowClearHistoryModal(true)}
                        className="text-xs text-red-500 hover:text-red-600 font-medium py-1 px-4 rounded-xl hover:bg-red-50/50 transition-colors"
                      >
                        清空对话记录
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Clear History Choice Modal Overlay */}
              {showClearHistoryModal && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl border border-slate-100 text-center space-y-4">
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
                            onClearMessages(activeChatCharId);
                          }
                          // Reset greeting checked state so a new proactive greeting can be generated immediately
                          setEmptyGreetingCheckedCharIds((prev) => prev.filter((id) => id !== activeChatCharId));
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
                              onClearMessages(activeChatCharId);
                            }
                            // Reset greeting checked state so a new proactive greeting can be generated immediately
                            setEmptyGreetingCheckedCharIds((prev) => prev.filter((id) => id !== activeChatCharId));
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
            </div>
          )}

          {/* Active Chat Messages body */}

          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 cv-messages-list"
            style={{
              background: activeCharacter.chatBg
                ? `url(${activeCharacter.chatBg}) center/cover no-repeat`
                : `url("https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW88JqUKBwtMIU2FxO5zQh4CKBC_pHUAACASQAAgvDiFZ7fSrFa6akITwE.png") center/cover no-repeat`,
              WebkitOverflowScrolling: "touch",
            }}
          >


            {currentChatMessages.map((msg, idx) => {
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
                      className="w-full text-left my-4 px-1 py-1 group relative select-text transition-all duration-200 hover:bg-slate-50/10 dark:hover:bg-stone-800/20 rounded-lg cursor-pointer"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setActiveMenuMsg(msg);
                        setMenuPosition({ x: e.clientX, y: e.clientY });
                      }}
                    >
                      <p className="text-[14px] leading-loose text-stone-800 dark:text-stone-200 font-sans tracking-wide text-justify whitespace-pre-wrap">
                        {msg.content}
                      </p>
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

              const isSelf = msg.sender === "user";
              const prevMsg = idx > 0 ? currentChatMessages[idx - 1] : null;
              const shouldCollapse = settings.collapseConsecutiveAvatars !== false;
              const isConsecutivePrev = prevMsg && prevMsg.sender === msg.sender;
              const showAvatar = !isConsecutivePrev || !shouldCollapse;
              
              return (
                <div
                  key={msg.id}
                  className={`w-full flex flex-col ${
                    isSelf ? "items-end" : "items-start"
                  } ${
                    (isConsecutivePrev && shouldCollapse) ? "mt-1.5" : "mt-4.5"
                  } cv-msg-row message message-container`}
                >
                  {/* Avatar + Meta Header */}
                  {showAvatar && (
                    <div className={`flex items-center gap-2.5 mb-1.5 select-none ${
                      isSelf ? "flex-row-reverse" : "flex-row"
                    }`}>
                      <img
                        src={isSelf ? settings.avatar : activeCharacter.avatar}
                        alt=""
                        onClick={() => {
                          if (!isSelf) {
                            setSingleCharacterMomentsId(activeCharacter.id);
                          }
                        }}
                        className={`w-9 h-9 bg-slate-100 object-cover cursor-pointer hover:opacity-90 transition-opacity border shrink-0 aspect-square avatar ${
                          isSelf ? "user-avatar" : "ai-avatar"
                        } ${isFloatingCute ? "rounded-xl border-slate-200/60" : "rounded-full"}`}
                      />
                      <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"} text-[10px] text-slate-500/80 space-y-0.5 msg-meta-header`}>
                        {!isSelf && (
                          <div className="flex items-center gap-1 font-bold text-slate-700/85 tracking-wider uppercase msg-meta-name">
                            <span>🖤</span>
                            <span>{activeCharacter.remark || activeCharacter.name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-[9.5px] text-slate-400 font-mono tracking-wide msg-meta-time-row">
                          <span className="msg-meta-date">{new Date(msg.timestamp || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          <span>•</span>
                          <span className="msg-meta-time">{new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Message Bubble Block */}
                  <div className="max-w-[85%]">
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
                      {/* Actual chat bubble */}
                      <div className="max-w-full">
                        {msg.content.startsWith("data:image/") ? (
                          <img
                            src={msg.content}
                            alt="chat-pic"
                            className="max-w-[160px] rounded-lg border object-cover cursor-zoom-in shadow-sm bg-stone-100"
                          />
                        ) : msg.content.startsWith("[红包]") ? (() => {
                          const [_, amount, greeting] = msg.content.split("|");
                          return (
                            <div 
                              onClick={() => {
                                setOpenRedPacketDetail({ amount: amount || "8.88", greeting: greeting || "恭喜发财" });
                                setShowRedPacketOpenModal(true);
                              }}
                              className={`bg-[#fff6f5] border border-[#fecdd3]/40 text-stone-800 rounded-2xl w-56 overflow-hidden cursor-pointer shadow-sm hover:bg-[#fff0ef] transition-all flex flex-col active:scale-[0.99] select-none cv-transfer ${
                                isSelf ? "transfer-card" : "received-transfer-card"
                              }`}
                            >
                              <div className="p-3.5 flex items-center gap-3 cv-transfer-body transfer-body">
                                <div className="w-9 h-9 bg-[#e15241]/10 rounded-full flex items-center justify-center text-lg leading-none shrink-0 font-bold text-[#e15241] shadow-inner cv-transfer-status transfer-icon confirm-icon">
                                  🧧
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <p className="text-xs font-bold text-stone-800 truncate">{greeting || "恭喜发财，万事如意"}</p>
                                  <p className="text-[10px] text-[#e15241] font-bold mt-0.5 cv-transfer-amount transfer-amount">查看红包</p>
                                </div>
                              </div>
                              <div className="px-3.5 py-2 bg-stone-50 text-stone-400 text-[9px] font-bold flex items-center justify-between border-t border-rose-100/50 cv-transfer-ribbon transfer-status select-none">
                                <span className="font-semibold text-stone-400">微信红包</span>
                                <span className="font-mono text-stone-400/80">金额 ¥{amount || "8.88"}</span>
                              </div>
                            </div>
                          );
                        })() : msg.content.startsWith("[音乐]") ? (() => {
                          const [_, songTitle, artist] = msg.content.split("|");
                          return (
                            <div className="bg-white text-stone-800 rounded-xl border border-stone-200 w-56 p-3 flex items-center gap-3 shadow-sm cv-bubble">
                              <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-yellow-400 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm animate-pulse">
                                <Music className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-stone-900 truncate">{songTitle || "神秘音乐"}</p>
                                <p className="text-[10px] text-stone-400 truncate mt-0.5">{artist || "未知歌手"}</p>
                              </div>
                              <div className="flex flex-col gap-0.5 shrink-0 text-amber-500 animate-pulse">
                                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                                <div className="w-1.5 h-3 bg-amber-500 rounded-full"></div>
                                <div className="w-1.5 h-2 bg-amber-500 rounded-full"></div>
                              </div>
                            </div>
                          );
                        })() : msg.content.startsWith("[位置]") ? (() => {
                          const [_, locName] = msg.content.split("|");
                          return (
                            <div className="bg-white text-stone-800 rounded-xl border border-stone-200 w-56 overflow-hidden shadow-sm cv-bubble">
                              <div className="p-3">
                                <p className="text-xs font-bold text-stone-900 truncate flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                  <span>{locName || "未知位置"}</span>
                                </p>
                                <p className="text-[10px] text-stone-400 mt-1 truncate">共享的实时地理位置</p>
                              </div>
                              <div className="h-16 bg-slate-100 relative flex items-center justify-center overflow-hidden border-t border-stone-100">
                                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]"></div>
                                <div className="absolute top-2 left-0 right-0 h-0.5 bg-slate-200 rotate-12"></div>
                                <div className="absolute top-8 left-0 right-0 h-0.5 bg-slate-200 -rotate-6"></div>
                                <div className="absolute top-0 bottom-0 left-12 w-0.5 bg-slate-200 rotate-45"></div>
                                <div className="absolute top-0 bottom-0 left-28 w-0.5 bg-slate-200 -rotate-12"></div>
                                <div className="w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-white relative animate-bounce shadow-md">
                                  <MapPin className="w-2.5 h-2.5" />
                                  <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-75"></div>
                                </div>
                              </div>
                            </div>
                          );
                        })() : msg.content.startsWith("[文件]") ? (() => {
                          const [_, fileName, fileContentRaw] = msg.content.split("|");
                          let contentText = "";
                          try {
                            contentText = decodeURIComponent(fileContentRaw || "");
                          } catch (e) {
                            contentText = fileContentRaw || "";
                          }
                          const wordCount = contentText.length;
                          return (
                            <div 
                              onClick={() => {
                                setSelectedFileNote({ title: fileName || "无标题笔记", content: contentText });
                              }}
                              className="bg-white text-stone-800 rounded-xl border border-stone-200 w-56 p-3 flex items-center gap-3 shadow-sm hover:bg-slate-50 cursor-pointer active:scale-95 transition-all cv-bubble"
                            >
                              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0 border border-blue-200">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <p className="text-xs font-bold text-stone-900 truncate leading-snug">{fileName || "备忘录笔记"}</p>
                                <p className="text-[9px] text-blue-600 font-semibold mt-1 flex items-center gap-1">
                                  <span>{wordCount} 字</span>
                                  <span>•</span>
                                  <span>点击阅读笔记</span>
                                </p>
                              </div>
                            </div>
                          );
                        })() : msg.content.startsWith("[语音]|") ? (() => {
                          const [_, seconds] = msg.content.split("|");
                          const secs = seconds || "5";
                          const widthPx = Math.min(180, 60 + parseInt(secs) * 8);
                          return (
                            <div 
                              className={`voice-message-bar cv-audio-bubble message-content message-bubble flex items-center gap-2 justify-between cursor-pointer py-2 px-3 text-xs shadow-sm ${
                                isSelf
                                  ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-self" : "bg-blue-500 text-white rounded-tr-sm chat-bubble-self")
                                  : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-other" : "bg-white text-slate-800 rounded-tl-sm border border-slate-100 chat-bubble-other")
                              }`}
                              style={{ width: `${widthPx}px` }}
                              onClick={() => {
                                const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav");
                                audio.volume = 0.4;
                                audio.play().catch(() => {});
                              }}
                            >
                              {isSelf ? (
                                <>
                                  <span className="voice-duration text-[11px] select-none font-mono font-medium">{secs}"</span>
                                  <Volume2 className="w-4 h-4 voice-icon" />
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-4 h-4 voice-icon rotate-180" />
                                  <span className="voice-duration text-[11px] select-none font-mono font-medium">{secs}"</span>
                                </>
                              )}
                            </div>
                          );
                        })() : (msg.content.startsWith("[视频通话]") || msg.content.startsWith("[语音通话]")) ? (() => {
                          const [tag, status] = msg.content.split("|");
                          const isVideo = tag === "[视频通话]";
                          return (
                            <div className={`px-3 py-2 text-xs flex items-center gap-2 shadow-sm cv-bubble message-bubble ${
                              isSelf
                                ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-self" : "bg-blue-500 text-white chat-bubble-self")
                                : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-other" : "bg-white text-slate-800 border border-slate-100 chat-bubble-other")
                            }`}>
                              {isVideo ? <Video className="w-3.5 h-3.5 shrink-0" /> : <Phone className="w-3.5 h-3.5 shrink-0" />}
                              <span>{status || "通话已结束"}</span>
                            </div>
                          );
                        })() : (() => {
                          const match = msg.content.match(/^「引用 (.*?)：([\s\S]*?)」\n([\s\S]*)$/);
                          if (match) {
                            const [_, senderName, quotedText, replyText] = match;
                            return (
                              <div
                                className={`px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble ${
                                  isSelf
                                    ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-self" : "bg-blue-500 text-white chat-bubble-self rounded-tr-sm")
                                    : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other rounded-tl-sm border border-slate-100")
                                }`}
                              >
                                <div className={`p-1.5 rounded-lg text-[10px] mb-1.5 border-l-2 text-left cv-quote-ref ${
                                  isSelf 
                                    ? (isFloatingCute ? "bg-slate-300/40 border-slate-400 text-slate-700" : "bg-blue-600/40 border-blue-200 text-blue-100") 
                                    : "bg-stone-50 border-stone-300 text-stone-500"
                                }`}>
                                  <span className="font-bold">{senderName}: </span>
                                  <span>{quotedText}</span>
                                </div>
                                <div className="text-left">{replyText}</div>
                                <div className="cv-bubble-tail hidden" />
                              </div>
                            );
                          }
                          return (
                            <div
                              className={`px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble ${
                                isSelf
                                  ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-self" : "bg-blue-500 text-white chat-bubble-self rounded-tr-sm")
                                  : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other rounded-tl-sm border border-slate-100")
                              }`}
                            >
                              <div className="text-left">{msg.content}</div>
                              <div className="cv-bubble-tail hidden" />
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI is writing/typing indicator */}
            {isTyping && (
              isOfflineModeActive ? (
                <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold italic px-1 py-2 my-2 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{activeCharacter.remark || activeCharacter.name} 正在编织剧情走向...</span>
                </div>
              ) : (() => {
                const lastMsg = currentChatMessages.length > 0 ? currentChatMessages[currentChatMessages.length - 1] : null;
                const isTypingConsecutive = lastMsg && lastMsg.sender !== "user";
                return (
                  <div className={`w-full flex flex-col items-start ${isTypingConsecutive ? "mt-1.5" : "mt-4.5"} cv-msg-row message message-container`}>
                    {!isTypingConsecutive && (
                      <div className="flex items-center gap-2.5 mb-1.5 select-none">
                        <img 
                          src={activeCharacter.avatar} 
                          alt="" 
                          className={`w-9 h-9 border object-cover shrink-0 aspect-square avatar ai-avatar ${
                            isFloatingCute ? "rounded-xl border-slate-200/60" : "rounded-full"
                          }`} 
                        />
                        <div className="flex flex-col items-start text-[10px] text-slate-500/80 space-y-0.5 msg-meta-header">
                          <span className="text-[9px] text-slate-400 font-bold">对方正在输入...</span>
                        </div>
                      </div>
                    )}
                    <div className="max-w-[85%]">
                      <div className="bg-white border border-slate-100 text-slate-400 px-4 py-2.5 rounded-2xl shadow-sm text-xs flex items-center space-x-1 chat-bubble-other message-bubble">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                );
              })()
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Active Chat Footer Input form */}
          <div className={`${
            isFloatingCute 
              ? "mx-3.5 mb-3.5 mt-1 bg-white/70 backdrop-blur-md rounded-[28px] border border-slate-200/50 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)] overflow-hidden shrink-0 flex flex-col cv-footer chat-input-area" 
              : activeStylePreset === "liquid-glass"
                ? "mx-3.5 mb-3.5 mt-1 bg-transparent border-0 shadow-none overflow-hidden shrink-0 flex flex-col cv-footer chat-input-area"
                : "bg-white border-t border-slate-100 shrink-0 flex flex-col cv-footer chat-input-area"
          }`}>
            {quotedMessage && (
              <div className="px-3 py-1.5 bg-stone-50 border-b border-stone-100 flex items-center justify-between text-[11px] text-stone-600 shrink-0 animate-fade-in">
                <div className="truncate flex-1 pr-4 text-left">
                  <span className="font-extrabold text-stone-700">引用自 {quotedMessage.sender === "user" ? "自己" : (activeCharacter.remark || activeCharacter.name)}: </span>
                  <span className="italic">
                    {quotedMessage.content.startsWith("[文件]") 
                      ? `[文件] ${quotedMessage.content.split("|")[1] || "笔记"}` 
                      : quotedMessage.content.startsWith("[") 
                        ? "[媒体内容]" 
                        : quotedMessage.content}
                  </span>
                </div>
                <button type="button" onClick={() => setQuotedMessage(null)} className="text-stone-400 hover:text-stone-600 p-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            


            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAndReply(e);
              }}
              className="px-3 py-2 flex items-center gap-2"
            >
              {/* Plus (+) Button */}
              <button
                type="button"
                onClick={() => setShowAttachPanel(!showAttachPanel)}
                className={`w-10 h-10 rounded-full border border-slate-300 transition-all shrink-0 flex items-center justify-center cv-func-btn toggle-tools-btn chat-action-btn text-slate-700 ${
                  showAttachPanel
                    ? "bg-stone-100 rotate-45"
                    : "bg-white hover:bg-slate-100"
                }`}
                title="附加菜单"
              >
                <span className="cv-plus-icon flex items-center justify-center w-full h-full">
                  <Plus className="w-3.5 h-3.5" />
                </span>
              </button>

              {/* Chat Input text box */}
              <input
                type="text"
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                onFocus={() => {
                  setTimeout(() => {
                    if (chatEndRef.current) {
                      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
                    }
                  }, 120);
                }}
                placeholder={
                  isOfflineModeActive 
                    ? (isInputNarration 
                        ? "输入旁白..." 
                        : "输入发言，继续剧本对话...")
                    : `发送消息给 ${activeCharacter.name}...`
                }
                className={`flex-1 h-10 border focus:outline-none rounded-[20px] px-4 text-xs text-slate-800 chat-input ${
                  isFloatingCute 
                    ? "bg-white/60 border-slate-200/40 focus:bg-white" 
                    : "bg-slate-50 border-slate-200/80"
                }`}
              />

              {/* Send Button 1 (User send only - gray background with white upward arrow) */}
              <button
                type="button"
                onClick={(e) => handleSendOnly(e)}
                disabled={!chatInputText.trim() || isTyping}
                className="w-10 h-10 rounded-full bg-slate-300 hover:bg-slate-400 disabled:opacity-40 text-white transition-all flex items-center justify-center shrink-0 shadow-sm cv-send-only-btn"
                title="仅发送消息 (不立即得到回复)"
              >
                <span className="cv-send-only-icon flex items-center justify-center w-full h-full">
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </span>
              </button>

              {/* Send Button 2 (Send and AI Reply - black background with white paper plane) */}
              <button
                type="submit"
                disabled={isTyping}
                className="w-10 h-10 rounded-full bg-slate-900 hover:bg-black disabled:opacity-40 text-white transition-all flex items-center justify-center shrink-0 shadow-sm send-button"
                title="发送消息并获取回复"
              >
                <span className="cv-send-reply-icon flex items-center justify-center w-full h-full">
                  <Send className="w-3.5 h-3.5 fill-white text-white" />
                </span>
              </button>
            </form>

            {/* Attach Panel */}
            {showAttachPanel && (
              <div className={`py-2.5 px-3 flex items-center justify-between gap-1 animate-slide-up select-none shrink-0 overflow-x-auto ${
                activeStylePreset === "liquid-glass"
                  ? "bg-white/60 backdrop-blur-md border-t border-white/40"
                  : "bg-slate-50 border-t border-slate-100"
              }`}>
                {/* 1. 相册 (Album) */}
                <label className="flex-1 flex flex-col items-center justify-center cursor-pointer group min-w-10">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <ImageIcon className="w-4 h-4 text-slate-700" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">相册</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const compressed = await compressImage(file, 800, 800, 0.75);
                          sendCustomMessage(compressed);
                          setShowAttachPanel(false);
                        } catch (err) {
                          console.error("Custom chat image compression failed:", err);
                        }
                      }
                    }}
                    className="hidden"
                  />
                </label>

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
                    <Gift className="w-4 h-4 text-slate-700" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">红包</span>
                </button>

                {/* 3. 音乐 (Music) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveAttachModal("music");
                    setShowAttachPanel(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <Music className="w-4 h-4 text-slate-700" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">音乐</span>
                </button>

                {/* 5. 电话 (Phone) */}
                <button
                  type="button"
                  onClick={() => {
                    setCallingType("voice");
                    setCallingStatus("ringing");
                    setActiveAttachModal("calling");
                    setShowAttachPanel(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <Phone className="w-4 h-4 text-slate-700" />
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
                    <MapPin className="w-4 h-4 text-slate-700" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">位置</span>
                </button>

                {/* 8. 表情 (Emoji) */}
                <button
                  type="button"
                  onClick={() => {
                    const emojis = ["😊", "👍", "❤️", "🌹", "🎉", "🔥", "✨", "😆", "🥰", "👀", "😘", "😭", "🥱", "👿", "🤡", "💖", "🌟"];
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    setChatInputText(prev => prev + randomEmoji);
                    setShowAttachPanel(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center group min-w-10"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <Smile className="w-4 h-4 text-slate-700" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">表情</span>
                </button>
              </div>
            )}
          </div>

          {/* Voice Duration Picker Modal Overlay */}
          {activeAttachModal === "voice" && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 animate-fade-in text-slate-800">
              <div className="bg-white rounded-[32px] w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-slate-100 animate-scale-up text-stone-800">
                <div className="px-5 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-bold text-stone-800">发送语音消息</h3>
                  <button 
                    onClick={() => setActiveAttachModal(null)}
                    className="p-1 hover:bg-stone-200/50 rounded-full transition-colors text-stone-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4 flex-1">
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 focus-within:ring-1 focus-within:ring-emerald-500/30 focus-within:border-emerald-500/50 transition-all">
                    <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-wider mb-1.5">语音时长 (秒)</label>
                    <div className="flex items-center">
                      <span className="text-lg font-bold text-emerald-500 mr-1.5 font-mono">⏱</span>
                      <input 
                        type="number"
                        min="1"
                        max="60"
                        value={voiceDuration}
                        onChange={(e) => setVoiceDuration(e.target.value)}
                        className="bg-transparent text-stone-800 font-bold text-base focus:outline-none flex-1 w-full font-mono placeholder-stone-300"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-stone-50 border-t border-stone-100 flex gap-2 shrink-0">
                  <button 
                    onClick={() => setActiveAttachModal(null)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      const secs = parseInt(voiceDuration) || 5;
                      sendCustomMessage(`[语音]|${secs}`);
                      setActiveAttachModal(null);
                    }}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-650 text-white font-bold rounded-xl text-xs transition-all shadow-sm"
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
                  <h3 className="text-xs font-bold text-stone-800">发送红包</h3>
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
                      sendCustomMessage(`[红包]|${finalAmount}|${finalGreeting}`);
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
          {showRedPacketOpenModal && openRedPacketDetail && (
            <div className="absolute inset-0 bg-black/75 z-50 flex items-center justify-center p-6 animate-fade-in text-slate-800">
              <div className="bg-white text-stone-800 rounded-[32px] w-full max-w-xs overflow-hidden shadow-2xl relative flex flex-col border border-stone-100 animate-scale-up text-center p-6 space-y-5">
                <button 
                  onClick={() => setShowRedPacketOpenModal(false)}
                  className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 p-1 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex flex-col items-center mt-2">
                  <div className="w-14 h-14 bg-[#e15241]/10 text-[#e15241] rounded-full flex items-center justify-center text-2xl font-bold shadow-sm border border-[#e15241]/20">
                    🧧
                  </div>
                  <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mt-3.5">已成功开启红包！</h3>
                  <p className="text-sm font-bold text-stone-800 mt-1 leading-relaxed">"{openRedPacketDetail.greeting}"</p>
                </div>

                <div className="bg-[#fff8f8] rounded-2xl p-4 border border-[#fee2e0] text-center">
                  <span className="text-[10px] text-stone-400 font-bold tracking-wide uppercase">获得金额</span>
                  <div className="text-2xl font-black text-[#e15241] mt-1.5 font-mono">
                    ¥{openRedPacketDetail.amount}
                  </div>
                  <span className="text-[9px] text-stone-400 block mt-1">已自动存入钱包零钱</span>
                </div>

                <button 
                  onClick={() => setShowRedPacketOpenModal(false)}
                  className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95"
                >
                  好的，谢谢
                </button>
              </div>
            </div>
          )}

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
                        className="w-full pl-8 pr-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-rose-500/30 focus:border-rose-500"
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
            <div className="absolute inset-0 bg-stone-950 z-50 flex flex-col justify-between p-10 animate-fade-in text-white text-center">
              <div className="space-y-4 mt-16 shrink-0">
                <img 
                  src={activeCharacter.avatar} 
                  alt="" 
                  className="w-24 h-24 rounded-full mx-auto border-2 border-white/25 object-cover shadow-2xl" 
                />
                <div>
                  <h3 className="text-lg font-black">{activeCharacter.remark || activeCharacter.name}</h3>
                  <p className="text-xs text-white/50 mt-1">
                    {callingStatus === "connected" ? "通话中" : (callingType === "video" ? "正在发起视频通话..." : "正在发起语音通话...")}
                  </p>
                </div>

                {callingStatus === "connected" && (
                  <div className="text-sm font-bold text-emerald-400 tracking-wider">
                    {Math.floor(callingDuration / 60).toString().padStart(2, "0")}:
                    {(callingDuration % 60).toString().padStart(2, "0")}
                  </div>
                )}
              </div>

              {/* Action controls */}
              <div className="space-y-12 mb-10 shrink-0">
                {callingStatus === "ringing" ? (
                  <div className="flex justify-around items-center px-4">
                    {/* Decline */}
                    <button
                      onClick={() => {
                        sendCustomMessage(`[${callingType === "video" ? "视频通话" : "语音通话"}]|已取消`);
                        setActiveAttachModal(null);
                      }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg transition-all">
                        <X className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-[10px] text-white/70">挂断</span>
                    </button>

                    {/* Accept (Simulate reply) */}
                    <button
                      onClick={() => {
                        setCallingStatus("connected");
                      }}
                      className="flex flex-col items-center gap-2 animate-bounce"
                    >
                      <div className="w-14 h-14 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center shadow-lg transition-all">
                        <Phone className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-[10px] text-white/70">接听</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    {/* Decline */}
                    <button
                      onClick={() => {
                        const mins = Math.floor(callingDuration / 60).toString().padStart(2, "0");
                        const secs = (callingDuration % 60).toString().padStart(2, "0");
                        sendCustomMessage(`[${callingType === "video" ? "视频通话" : "语音通话"}]|通话已结束 ${mins}:${secs}`);
                        setActiveAttachModal(null);
                      }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg transition-all">
                        <X className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-[10px] text-white/70">挂断</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      ) : null}

      {/* Main Apps Inner Navbar inside Chat Application */}
      <div className="flex-1 overflow-hidden flex flex-col h-full bg-white">
        
        {/* Main tabs viewports */}
        <div className="flex-1 overflow-y-auto">
          
          {/* TABS: CHATS LIST (聊天首页) */}
          {activeTab === "chats" && (
            <div className="divide-y divide-slate-100">
              <div className="px-4 py-1.5 bg-transparent sticky top-0 z-10 flex items-center justify-between relative">
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
                  title="返回主页"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </button>
                <h2 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">聊天 ({chatThreads.length})</h2>
                <div className="w-8 shrink-0" />
              </div>

              {chatThreads.length === 0 ? (
                <div className="text-center py-20 px-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-700">暂无任何对话</h4>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                    您还没有开始任何聊天。请前往底部的“通讯录”，选择一位档案馆中的虚拟伙伴发起首条对话！
                  </p>
                </div>
              ) : (
                chatThreads.map(({ character, lastMessage, isPinned }) => (
                  <div
                    key={character.id}
                    onClick={() => startChatWith(character.id)}
                    className={`flex items-center p-3 cursor-pointer transition-colors relative ${
                      isPinned ? "bg-blue-50/20 hover:bg-blue-50/40" : "hover:bg-slate-50"
                    }`}
                  >
                    {isPinned && (
                      <Pin className="w-3 h-3 text-blue-500 absolute top-2 right-2 rotate-45 opacity-60" />
                    )}

                    {/* Avatar */}
                    <div className="relative shrink-0 mr-3">
                      <img
                        src={character.avatar}
                        alt={character.name}
                        className="w-11 h-11 rounded-full object-cover bg-slate-100 border border-slate-100 aspect-square"
                      />
                      {getUnreadCount(character.id) > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border border-white shadow-sm">
                          {getUnreadCount(character.id)}
                        </span>
                      )}
                    </div>

                    {/* Last details */}
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 truncate">
                          {character.remark || character.name}
                        </h4>
                        {lastMessage && (
                          <span className="text-[9px] text-slate-400 font-medium">
                            {new Date(lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5 leading-normal">
                        {lastMessage ? lastMessage.content : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TABS: CONTACTS LIST (通讯录) */}
          {activeTab === "contacts" && (
            <div className="divide-y divide-slate-100">
              <div className="px-4 py-1.5 bg-transparent sticky top-0 z-10 flex items-center justify-between relative">
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
                  title="返回主页"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </button>
                <h2 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">通讯录 ({friends.length})</h2>
                <button
                  onClick={() => setIsShowingAddFriendDialog(true)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-700 transition-colors shrink-0 z-10"
                  title="添加好友"
                >
                  <Plus className="w-4 h-4 text-slate-700" />
                </button>
              </div>

              {friends.length === 0 ? (
                <div className="text-center py-20 px-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
                    <Users className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-700">通讯录空空如也</h4>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                    暂无好友。请点击右上角“+”号直接从档案馆添加已创建的角色，或到桌面打开“档案馆”新建！
                  </p>
                </div>
              ) : (
                friends.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => startChatWith(char.id)}
                    className="flex items-center p-3 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <img
                      src={char.avatar}
                      alt={char.name}
                      className="w-10 h-10 rounded-full object-cover mr-3 bg-slate-100 border border-slate-100 shrink-0 aspect-square"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-800 truncate">
                        {char.remark || char.name}
                        {char.remark && <span className="text-[10px] font-normal text-slate-400 ml-1.5">({char.name})</span>}
                      </h4>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TABS: MOMENTS FEED (朋友圈) */}
          {activeTab === "moments" && (() => {
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none text-xs resize-none leading-relaxed"
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
                      type="submit"
                      className="px-4 py-1.5 bg-neutral-950 hover:bg-neutral-900 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                    >
                      发布动态
                    </button>
                  </div>

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
                          <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap mt-1">
                            {mom.content}
                          </p>

                          {/* Attached Photo */}
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
                                onClick={() => setShowCommentInputMap(prev => ({ ...prev, [mom.id]: !prev[mom.id] }))}
                                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 font-semibold transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>{mom.comments.length || "评论"}</span>
                              </button>
                            </div>
                          </div>

                          {/* Integrated Like & Comment Block (WeChat style) */}
                          {(mom.likes.length > 0 || mom.comments.length > 0) && (
                            <div className="bg-[#f7f7f7] rounded-[4px] p-2 text-[11px] mt-2 space-y-2">
                              {/* Likes list */}
                              {mom.likes.length > 0 && (
                                <div className="flex items-center gap-1.5 text-[#576b95] font-bold flex-wrap pb-1 border-b border-slate-200/40">
                                  <Heart className="w-3 h-3 text-rose-500 fill-current shrink-0" />
                                  <span className="leading-tight">{mom.likes.join(", ")}</span>
                                </div>
                              )}

                              {/* Comments list */}
                              {mom.comments.length > 0 && (
                                <div className="space-y-1.5">
                                  {mom.comments.map((comm) => {
                                    const commChar = characters.find((c) => c.name === comm.authorName);
                                    const commAuthorName = commChar ? (commChar.remark || commChar.name) : comm.authorName;
                                    return (
                                      <div key={comm.id} className="leading-relaxed text-slate-800">
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
                                placeholder="发表评论..."
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
            <div className="bg-slate-50 min-h-full pb-20">
              {/* Sticky header */}
              <div className="px-4 py-1.5 bg-transparent sticky top-0 z-10 flex items-center justify-between relative">
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
                  title="返回主页"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </button>
                <h2 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">我</h2>
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
                  title="编辑资料"
                >
                  <Settings className="w-4 h-4 text-slate-700" />
                </button>
              </div>

              {/* Profile Card banner */}
              <div className="bg-white p-5 border-b border-slate-100 shadow-sm flex items-center gap-4">
                <img
                  src={settings.avatar}
                  alt="My avatar"
                  className="w-14 h-14 rounded-2xl border bg-slate-100 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-800 truncate">{settings.name}</h3>
                  <p className="text-[11px] text-slate-400 mt-1 truncate leading-normal italic">
                    {settings.signature || "暂无签名"}
                  </p>
                </div>
              </div>

              {/* Personal Biography description */}
              <div className="m-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">我的人设背景</h4>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {settings.bio || "暂无定义人设背景。在桌面打开“设置”即可配置我的人设背景，让档案馆里的伙伴们更好地认识您，展开更个性化的超现实对话！"}
                </p>
              </div>

              {/* SAVED BOOKMARKS LIST (信息收藏) */}
              <div className="m-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FolderHeart className="w-4 h-4 text-amber-500" />
                  <span>信息收藏 ({savedBookmarks.length})</span>
                </h4>

                {savedBookmarks.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">
                    暂无收藏的聊天话语。在聊天窗口中，长按或点击气泡左侧的收藏标签即可将特定对话保存在这里！
                  </p>
                ) : (
                  <div className="space-y-2">
                    {savedBookmarks.map((bm) => {
                      const owner = characters.find((c) => c.id === bm.characterId);
                      return (
                        <div
                          key={bm.id}
                          className="p-3 bg-slate-50 border border-slate-100 rounded-xl relative group flex gap-2.5 items-start"
                        >
                          <img
                            src={bm.sender === "user" ? settings.avatar : (owner?.avatar || "")}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0 text-xs">
                            <span className="font-bold text-slate-500">
                              {bm.sender === "user" ? "我" : (owner?.name || "未知")}
                            </span>
                            <p className="text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed italic bg-white p-2 rounded border border-slate-100">
                              "{bm.content}"
                            </p>
                            <span className="text-[9px] text-slate-400 block mt-1">
                              收藏于 {new Date(bm.timestamp).toLocaleDateString()}
                            </span>
                          </div>

                          <button
                            onClick={() => onToggleBookmark(bm.id)}
                            className="text-rose-400 hover:text-rose-600 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="取消收藏"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* BOTTOM NAVIGATION BAR FOR CHAT APP (聊天、通讯录、朋友圈、我) */}
        <div className="bg-slate-50 border-t border-slate-200/60 py-2 shrink-0 flex justify-around items-center text-[10px] font-bold text-slate-400 z-10">
          <button
            onClick={() => setActiveTab("chats")}
            className={`flex flex-col items-center space-y-1 ${
              activeTab === "chats" ? "text-neutral-950" : "text-neutral-400 hover:text-neutral-650"
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {(() => {
                const totalUnreadCount = friendIds.reduce((sum, id) => sum + getUnreadCount(id), 0);
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
            className={`flex flex-col items-center space-y-1 ${
              activeTab === "contacts" ? "text-neutral-950" : "text-neutral-400 hover:text-neutral-650"
            }`}
          >
            <Users className="w-5 h-5" />
            <span>通讯录</span>
          </button>

          <button
            onClick={() => setActiveTab("moments")}
            className={`flex flex-col items-center space-y-1 ${
              activeTab === "moments" ? "text-neutral-950" : "text-neutral-400 hover:text-neutral-650"
            }`}
          >
            <Compass className="w-5 h-5" />
            <span>朋友圈</span>
          </button>

          <button
            onClick={() => setActiveTab("me")}
            className={`flex flex-col items-center space-y-1 ${
              activeTab === "me" ? "text-neutral-950" : "text-neutral-400 hover:text-neutral-650"
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
                          <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap mt-1">
                            {mom.content}
                          </p>

                          {/* Photo if attached */}
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
                                onClick={() => setShowCommentInputMap(prev => ({ ...prev, [mom.id]: !prev[mom.id] }))}
                                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 font-semibold transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>{mom.comments.length || "评论"}</span>
                              </button>
                            </div>
                          </div>

                          {/* WeChat-style integrated Like & Comment Shelf */}
                          {(mom.likes.length > 0 || mom.comments.length > 0) && (
                            <div className="bg-[#f7f7f7] rounded-[4px] p-2 text-[11px] mt-2 space-y-2">
                              {/* Likes shelf details */}
                              {mom.likes.length > 0 && (
                                <div className="flex items-center gap-1.5 text-[#576b95] font-bold flex-wrap pb-1 border-b border-slate-200/40">
                                  <Heart className="w-3 h-3 text-rose-500 fill-current shrink-0" />
                                  <span className="leading-tight">{mom.likes.join(", ")}</span>
                                </div>
                              )}

                              {/* Comments list shelf */}
                              {mom.comments.length > 0 && (
                                <div className="space-y-1.5">
                                  {mom.comments.map((comm) => {
                                    const commChar = characters.find((c) => c.name === comm.authorName);
                                    const commAuthorName = commChar ? (commChar.remark || commChar.name) : comm.authorName;
                                    return (
                                      <div key={comm.id} className="leading-relaxed text-slate-800">
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
                                placeholder="发表评论..."
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs font-semibold text-slate-800"
                />
              </div>

              {/* Signature Input */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">个性签名</label>
                <input
                  type="text"
                  value={editMySignature}
                  onChange={(e) => setEditMySignature(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-800"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs resize-none leading-relaxed text-slate-800"
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
        const unaddedCharacters = characters.filter((c) => !friendIds.includes(c.id));
        return (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-[320px] w-full flex flex-col max-h-[85%] animate-slide-up border border-slate-100">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-neutral-800" />
                  <span>添加联系人</span>
                </h3>
                <button
                  onClick={() => setIsShowingAddFriendDialog(false)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className={`${unaddedCharacters.length === 0 ? "" : "flex-1 overflow-y-auto"} py-3 space-y-3 pr-1`}>
                {unaddedCharacters.length === 0 ? (
                  <div className="text-center py-4 px-2 space-y-3">
                    <div className="w-12 h-12 bg-slate-50 text-neutral-800 rounded-full flex items-center justify-center mx-auto shadow-inner border border-slate-100">
                      <Users className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      档案馆里所有的角色都已经是您的好友啦！
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        onClick={() => {
                          setIsShowingAddFriendDialog(false);
                          onNavigateToApp("archives");
                        }}
                        className="w-full py-2 bg-neutral-950 hover:bg-neutral-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        去档案馆新建更多角色
                      </button>
                      <button
                        onClick={() => setIsShowingAddFriendDialog(false)}
                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                      >
                        关闭窗口
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] text-slate-400 leading-normal mb-1">
                      选择已在“档案馆”创建好的虚拟角色，一键添加好友：
                    </p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto">
                      {unaddedCharacters.map((char) => (
                        <div
                          key={char.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 gap-2 hover:bg-slate-100/50 transition-colors"
                        >
                          <img
                            src={char.avatar}
                            alt={char.name}
                            className="w-8 h-8 rounded-full object-cover bg-slate-200 border border-slate-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-slate-800 truncate">
                              {char.name}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {char.mbti} &bull; {char.age}岁 &bull; {char.gender}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setFriendIds((prev) => [...prev, char.id]);
                            }}
                            className="px-2.5 py-1 bg-neutral-950 hover:bg-neutral-900 text-white rounded-lg text-[10px] font-bold transition-colors shadow-sm shrink-0"
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
                onToggleBookmark(activeMenuMsg.id);
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
                  onDeleteMessage(activeMenuMsg.id);
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
              className="w-full text-left px-2.5 py-1.5 text-xs font-bold hover:bg-stone-100 rounded-lg flex items-center gap-2 text-indigo-600 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
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
              className="w-full text-[11px] p-2.5 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-950 bg-stone-50/50 resize-none font-medium leading-relaxed text-left"
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
                  
                  const oocMemory: MemoryItem = {
                    id: "ooc-" + Date.now(),
                    characterId: activeChatCharId || "",
                    content: `[OOC 修正记录] 原回答：“${showOocCommentModal.content}” 被指出不符合人设。用户修正意见：${oocCommentText.trim()}`,
                    timestamp: Date.now(),
                    importance: 8,
                  };
                  
                  onSaveMemories([oocMemory, ...memories]);
                  
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

      {/* Visual Toast Notification Overlay */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] bg-stone-900/90 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm transition-all duration-300">
          {toastMessage}
        </div>
      )}

    </div>
  );
}
