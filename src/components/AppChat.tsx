import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { apiChat, apiExtractMemories, apiTranslate, estimateTokenCount } from "../utils/apiHelper";
import { getLatestWorldBookEntries, buildWorldBookSystemBlocks } from "../utils/worldBook";
import { Character, Message, Moment, UserSettings, MomentComment, WorldBookEntry, MemoryItem, MemoryVaultSettings, OfflineStory, Sticker, StickerGroup } from "../types";
import { splitTextToOfflineSegments, cleanOnlineMessage, splitIntoWeChatBubbles, compressImage } from "../utils/pngParser";
import { stickerDb, compressImage as compressStickerImage, aiNameSticker } from "../utils/stickerDb";
import { LIVING_HUMAN_PROMPT } from "../utils/livingPrompt";
import { getRelevantMemories } from "./AppMemory";
import StickerSettings from "./StickerSettings";
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
  Minus,
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
  RefreshCw,
  Languages,
  Search,
  Wallet,
  ChevronRight,
  Sparkles,
  CreditCard,
  Play,
  Pause,
  Loader2,
  Database
} from "lucide-react";

import { getSpeechForText, MINIMAX_DEFAULT_VOICES } from "../utils/minimaxTts";

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

// Parse recent messages to detect if an agreed proactive contact time exists
const getScheduledContactTime = (charMsgs: any[], settingsName: string) => {
  if (!charMsgs || charMsgs.length === 0) return null;

  // Scan recent messages from the end (last 15 messages)
  const recentMsgs = charMsgs.slice(-15);
  for (let i = recentMsgs.length - 1; i >= 0; i--) {
    const msg = recentMsgs[i];
    if (msg.isOffline || msg.isNarration) continue;

    const content = msg.content || "";
    
    // Check various patterns
    const generalSoonRegex = /(等会|待会|等一下|稍后|稍後|等会儿|待會|一会儿|一會儿|待会儿|待會兒)/;
    const halfHourRegex = /(半小时|半個小时|半个小时|半h|半小時)/;
    const oneHourRegex = /(一小时|一个小时|一個小時|一小時)/;
    const twoHoursRegex = /(两小时|两个小时|兩個小時|兩小時)/;
    
    // Check for "20分后", "20分後", "20分钟后" etc.
    const numericRegex = /(\d+(?:\.\d+)?)\s*(分钟|分|小时|h|m|mins?|hours?|分|後|后|小時)(后|後|之后|之內|内)?/i;

    let minutes = 0;
    let found = false;
    let matchedText = "";

    if (numericRegex.test(content)) {
      const match = content.match(numericRegex);
      if (match) {
        const num = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        
        // Ensure there is some indicator that it's a future relative time
        const hasFutureIndicator = content.includes("后") || content.includes("後") || content.includes("内") || content.includes("內") || /后|後|内|內|after|in/i.test(match[3] || "") || /联系|联络|聊|见|说|来|找/i.test(content);
        
        if (hasFutureIndicator) {
          if (unit.includes("小时") || unit.includes("小时") || unit.includes("hour") || unit === "h") {
            minutes = num * 60;
          } else {
            minutes = num;
          }
          found = true;
          matchedText = match[0];
        }
      }
    }

    if (!found && halfHourRegex.test(content)) {
      minutes = 30;
      found = true;
      matchedText = content.match(halfHourRegex)?.[0] || "";
    } else if (!found && oneHourRegex.test(content)) {
      minutes = 60;
      found = true;
      matchedText = content.match(oneHourRegex)?.[0] || "";
    } else if (!found && twoHoursRegex.test(content)) {
      minutes = 120;
      found = true;
      matchedText = content.match(twoHoursRegex)?.[0] || "";
    } else if (!found && generalSoonRegex.test(content)) {
      minutes = 15;
      found = true;
      matchedText = content.match(generalSoonRegex)?.[0] || "";
    }

    if (found && minutes > 0) {
      return {
        msgId: msg.id,
        timestamp: msg.timestamp,
        triggerTime: msg.timestamp + minutes * 60 * 1000,
        durationMinutes: minutes,
        text: matchedText,
      };
    }
  }
  return null;
};

const formatWeChatTimestamp = (timestamp: number): string => {
  const now = new Date();
  const date = new Date(timestamp);
  
  const currentYear = now.getFullYear();
  const msgYear = date.getFullYear();
  
  // Hours and minutes formatted with leading zero
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;
  
  // Calculate midnights for today and yesterday
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayMidnight = todayMidnight - 24 * 60 * 60 * 1000;
  const sevenDaysAgoMidnight = todayMidnight - 7 * 24 * 60 * 60 * 1000;
  
  if (timestamp >= todayMidnight) {
    // Today: only HH:mm
    return timeStr;
  } else if (timestamp >= yesterdayMidnight) {
    // Yesterday: 昨天 HH:mm
    return `昨天 ${timeStr}`;
  } else if (timestamp >= sevenDaysAgoMidnight) {
    // 1~7 days: 星期X HH:mm
    const days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const dayOfWeek = days[date.getDay()];
    return `${dayOfWeek} ${timeStr}`;
  } else if (msgYear === currentYear) {
    // Same year, more than 7 days: X月X日 HH:mm
    return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
  } else {
    // Cross year: YYYY年X月X日 HH:mm
    return `${msgYear}年${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
  }
};

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
  onDeleteMoment?: (momentId: string) => void;
  onToggleBookmark: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onUpdateMessage?: (messageId: string, updatedFields: Partial<Message>) => void;
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
  onDeleteCharacter?: (id: string, skipConfirm?: boolean) => void;
}

const PRESEED_MOMENTS: Moment[] = [];

const getFullCharacterWorldBook = (entries: WorldBookEntry[], characterId: string) =>
  getLatestWorldBookEntries(entries)
    .filter((entry) => entry.isActive !== false && (!entry.characterId || entry.characterId === "global" || entry.characterId === characterId))
    .sort((a, b) => (a.depth || 5) - (b.depth || 5))
    .map((entry) => `【${entry.title}】\n${entry.content}`)
    .join("\n\n");

const cleanAndExtractMoment = (content: string) => {
  let cleanContent = content.trim();
  const selfComments: string[] = [];

  // Keep generated metadata and mock comments out of the post body. Older data can
  // still contain these forms, so normalize it when rendering as well as generating.
  cleanContent = cleanContent.replace(/^\s*(?:朋友圈|动态)\s*[：:]\s*/i, "");
  cleanContent = cleanContent.replace(/(?:^|\n)\s*[（(]\s*评论\s*[：:]\s*([^）)]+)[）)]\s*/g, (_match, text) => {
    if (text.trim()) selfComments.push(text.trim());
    return "\n";
  });
  cleanContent = cleanContent.replace(/(?:^|\n)\s*评论\s*[：:]\s*([^\n]+)/g, (_match, text) => {
    if (text.trim()) selfComments.push(text.trim());
    return "\n";
  });

  // 1. Remove starting "(xx发了朋友圈)" or "(xx发了条朋友圈)" or similar
  const startPostRegex = /^[（\(]\s*[^）\)]*?发了[^）\)]*?朋友圈\s*[）\)]\s*\n*/i;
  cleanContent = cleanContent.replace(startPostRegex, "");

  // 2. Extract and remove self-comments from the content
  const selfCommentRegex = /[（\(](?:评论区(?:自己)?补了一?条|评论区(?:自己)?补了一?句|评论区自己补了|自己(?:在评论区)?补了一?条|自己(?:在评论区)?补了一?句|自评)\s*[：:]\s*(.*?)[）\)]/g;
  cleanContent = cleanContent.replace(selfCommentRegex, (fullMatch, commentText) => {
    if (commentText && commentText.trim()) {
      selfComments.push(commentText.trim());
    }
    return "";
  });

  const lineCommentRegex = /(?:^|\n)\s*(?:评论|评论区补|自评|评论区自己补了一?条|自己补了一?条)\s*[：:]\s*(.*?)(?=\n|$)/g;
  cleanContent = cleanContent.replace(lineCommentRegex, (fullMatch, commentText) => {
    if (commentText && commentText.trim()) {
      selfComments.push(commentText.trim());
    }
    return "";
  });

  cleanContent = cleanContent.trim();
  cleanContent = cleanContent.replace(/^\n+|\n+$/g, "").trim();

  return {
    content: cleanContent,
    selfComments,
  };
};

const renderMomentContent = (content: string) => {
  const parsed = cleanAndExtractMoment(content);
  return parsed.content;
};

const getMomentComments = (mom: Moment) => {
  const parsed = cleanAndExtractMoment(mom.content);
  const dynamicComments: typeof mom.comments = [];
  
  parsed.selfComments.forEach((text, index) => {
    const exists = mom.comments.some(c => c.content === text && c.authorName === mom.authorName);
    if (!exists) {
      dynamicComments.push({
        id: `${mom.id}-dynamic-self-${index}`,
        authorName: mom.authorName,
        authorAvatar: mom.authorAvatar,
        content: text,
        timestamp: mom.timestamp + (index + 1) * 1000,
      });
    }
  });

  return [...mom.comments, ...dynamicComments];
};

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
  // Original offline dialogue must never leak into the online context. A user
  // can explicitly archive a concise summary into the normal memory vault.
  return "";
  /*
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
  */
};

const getGroupChatMemories = (
  activeCharacter: Character,
  characters: Character[],
  messages: Message[],
  ownerName: string
): string => {
  const groupsWithChar = characters.filter(c => c.isGroupChat && c.memberIds?.includes(activeCharacter.id));
  if (groupsWithChar.length === 0) return "";

  const groupLines: string[] = [];
  groupsWithChar.forEach(group => {
    // Get last 15 messages of this group chat to provide real-time memory
    const msgsInGroup = messages.filter(m => m.characterId === group.id).sort((a, b) => a.timestamp - b.timestamp).slice(-15);
    if (msgsInGroup.length > 0) {
      const formattedGroupMsgs = msgsInGroup.map(m => {
        let senderLabel = "";
        if (m.sender === "user") {
          senderLabel = `${ownerName} (机主)`;
        } else {
          const charObj = characters.find(c => c.id === m.senderId);
          senderLabel = charObj ? (charObj.remark || charObj.name) : (m.senderId || "未知成员");
        }
        const timeStr = new Date(m.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        return `  [${timeStr}] ${senderLabel}: ${m.content}`;
      }).join("\n");
      groupLines.push(`- 在群聊【${group.name}】中的最近聊天记录：\n${formattedGroupMsgs}`);
    }
  });

  if (groupLines.length === 0) return "";

  return `[🚨 实时微信群聊共同记忆与近期话题 (Real-time Group Chat Shared Memory)]
你和机主 ${ownerName} 共同身处以下微信群聊中。你对这些群聊里最近发生的所有对话、吐槽、爆料和八卦有着【100%实时的清晰记忆】。
由于你和机主刚刚或最近在这些群里有过互动，现在在单聊中，你：
1. **有几率会主动聊到刚才群聊的内容**：如果在群聊中刚刚讨论了某个有趣/尴尬/争议性的话题，你可以非常自然地在私聊中以此为话题切入点，单独向机主吐槽、发表情包、追问、或者表达你刚才在群里不方便说的真实想法。
2. **支持话题承接**：如果机主主动在单聊里向你提起群聊的事，你必须立刻完美承接，了解前因后果，并给出符合人设的吐槽或回应。
3. **展现真实熟人关系**：无需每次单聊都强行提起群聊，但若群聊刚活跃过或你们刚在群里聊完，有较大概率（例如 30%-50%）你可以以此开启私聊。

以下是群聊的最近记录：
${groupLines.join("\n\n")}`;
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
  onSendMessage: onSendMessageRaw,
  onSaveCharacter,
  onAddMoment,
  onAddCommentToMoment,
  onLikeMoment,
  onDeleteMoment,
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
  offlineStories = [],
  onSaveOfflineStory,
  onDeleteCharacter,
}: AppChatProps) {
  const [activeTab, setActiveTab] = useState<"chats" | "contacts" | "moments" | "me">("chats");

  // MiniMax Real-time TTS Playback States
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [audioLoadingMessageId, setAudioLoadingMessageId] = useState<string | null>(null);
  const [activeTtsAudio, setActiveTtsAudio] = useState<HTMLAudioElement | null>(null);

  // Serial Playback Queue Manager
  const playNextMessageInQueue = (currentId: string) => {
    // Cancel consecutive/chained auto-playback completely
    setPlayingMessageId(null);
    setActiveTtsAudio(null);
  };

  // TTS Trigger Speech Function
  const triggerMessageSpeech = async (msg: Message) => {
    // Guard: Prevent non-voice messages from being synthesized/played in standard chat layout
    const isVoice = msg.content && (msg.content.startsWith("[语音") || msg.isVoiceMessage);
    if (!isOfflineModeActive && !isVoice) {
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

    if (activeTtsAudio) {
      try {
        activeTtsAudio.pause();
      } catch (e) {
        console.error(e);
      }
      setActiveTtsAudio(null);
    }
    if (voiceTimer) {
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

    try {
      let userSettings: any = {};
      try {
        const saved = localStorage.getItem("phone_settings");
        if (saved) userSettings = JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }

      const msgChar = characters.find(c => c.id === msg.characterId || c.id === msg.senderId);
      const voiceId = msgChar?.minimaxVoiceId || "female-shaonv";
      const speed = msgChar?.minimaxSpeed !== undefined ? msgChar.minimaxSpeed : (userSettings.minimaxSpeed !== undefined ? userSettings.minimaxSpeed : 1.0);

      const ttsOptions = {
        apiKey: userSettings.minimaxApiKey || undefined,
        groupId: userSettings.minimaxGroupId || undefined,
        model: userSettings.minimaxModel || "speech-2.8-hd",
        speed,
        pitch: userSettings.minimaxPitch !== undefined ? userSettings.minimaxPitch : 0,
        vol: userSettings.minimaxVol !== undefined ? userSettings.minimaxVol : 1.0,
        voiceId,
        proxyUrl: userSettings.minimaxProxyUrl || undefined,
      };

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
        playNextMessageInQueue(msg.id);
        return;
      }

      const blob = await getSpeechForText(cleanText, ttsOptions);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      setActiveTtsAudio(audio);
      setAudioLoadingMessageId(null);

      audio.onended = () => {
        playNextMessageInQueue(msg.id);
      };

      audio.onerror = (e) => {
        console.warn("Audio playback error:", e);
        setPlayingMessageId(null);
        setAudioLoadingMessageId(null);
      };

      audio.play();
    } catch (err: any) {
      console.warn("TTS generation failed:", err);
      setPlayingMessageId(null);
      setAudioLoadingMessageId(null);
      showToast("语音合成失败，请确认 MiniMax 设置正确！");
    }
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
    let userSettings: any = {};
    try {
      const saved = localStorage.getItem("phone_settings");
      if (saved) userSettings = JSON.parse(saved);
    } catch (e) {}

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
    const shouldBeVoice = isCallActive && msg.sender === "character";

    if (
      shouldBeVoice && 
      msg.content && 
      !msg.content.startsWith("[语音") && 
      !msg.content.startsWith("[系统]") && 
      !msg.content.startsWith("[红包]") && 
      !msg.content.startsWith("[转账]") && 
      !msg.content.startsWith("data:image/") && 
      !msg.content.startsWith("[表情]|")
    ) {
      const text = msg.content;
      const secs = Math.max(1, Math.min(60, Math.ceil(text.length * 0.35 + 1.2)));
      msg.content = `[语音]|${secs}|${text}`;
    }

    onSendMessageRaw(msg);

    // Auto-play the synthetic voice for incoming character voice messages has been disabled per user request
    // (requires user to manually click the voice bubble to play)
    /*
    if (msg.sender === "character" && msg.content && msg.content.startsWith("[语音") && settings.enableMiniMaxTts) {
      setTimeout(() => {
        triggerMessageSpeech(msg);
      }, 500);
    }
    */
  };

  // Sticker groups state
  const [stickerGroups, setStickerGroups] = useState<StickerGroup[]>([]);
  const triggerCreateStickerGroupRef = useRef<(() => void) | null>(null);
  const [activeStickerGroupIndex, setActiveStickerGroupIndex] = useState<number>(0);
  const [showStickerSelector, setShowStickerSelector] = useState<boolean>(false);
  const [isManagingStickers, setIsManagingStickers] = useState<boolean>(false);

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

  const friends = characters.filter((c) => friendIds.includes(c.id) && !c.isGroupChat);

  // Get location addresses from World Book entries related to this character
  const getDynamicLocations = () => {
    if (!activeCharacter) return [];
    
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
  };

  // User profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [meActiveSubView, setMeActiveSubView] = useState<"none" | "identities" | "wallet" | "stickers" | "favorites">("none");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [walletBalance, setWalletBalance] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("wechat_wallet_balance");
      return stored ? parseFloat(stored) : 0.00;
    } catch {
      return 0.00;
    }
  });

  useEffect(() => {
    localStorage.setItem("wechat_wallet_balance", walletBalance.toFixed(2));
  }, [walletBalance]);

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
  const [typingCharacterOverride, setTypingCharacterOverride] = useState<Character | null>(null);
  const [manualLocationText, setManualLocationText] = useState("");
  const [emptyGreetingCheckedCharIds, setEmptyGreetingCheckedCharIds] = useState<string[]>([]);
  const [sentGreetings, setSentGreetings] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Offline Mode States (Inline Offline mode inside chat is disabled, transitioned to AppOffline)
  const isOfflineModeActive = false;
  const isInputNarration = false;
  const activeOfflineStoryId = null;

  const handleStartOfflineFromMsg = (msg: Message) => {
    if (!activeChatCharId || !activeCharacter) return;
    
    const charName = activeCharacter.remark || activeCharacter.name;
    // The direct menu action used to import only the clicked message. Snapshot
    // the whole configured context window so the offline scene has a real handoff.
    const contextLimit = activeCharacter.contextMemoryLimit || 20;
    const recentOnlineMessages = messages
      .filter((item) => item.characterId === activeChatCharId && !item.isOffline)
      .slice(-contextLimit * 2);
    const sourceMessages = recentOnlineMessages.length > 0 ? recentOnlineMessages : [msg];
    const snapshotTimestamp = Date.now();
    const importedMessages = sourceMessages.map((item, index) => ({
      ...item,
      id: `offline-import-${snapshotTimestamp}-${index}-${item.id}`,
      isOffline: true,
      isImportedContext: true,
    }));
    const importedContext: OfflineStory["importedContext"] = {
      messages: importedMessages,
      memories: memories
        .filter((memory) => memory.characterId === activeChatCharId)
        .map((memory) => memory.content),
      worldBook: getLatestWorldBookEntries(worldBookEntries || [])
        .filter((entry) => !entry.characterId || entry.characterId === "global" || entry.characterId === activeChatCharId)
        .map((entry) => `${entry.title}: ${entry.content}`),
      importedAt: snapshotTimestamp,
    };

    const newStory: OfflineStory = {
      id: `story-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      characterId: activeChatCharId,
      characterIds: [activeChatCharId],
      title: `「${charName}」的聊天剧本 - ${new Date().toLocaleDateString()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: "continue",
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
    
    localStorage.setItem(`offline_mode_active_${activeChatCharId}`, "true");
    localStorage.setItem(`offline_story_id_${activeChatCharId}`, newStory.id);
    
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
        onUpdateMessage(msg.id, { translation: res.text });
        showToast("翻译完成");
      } else {
        showToast("翻译无结果");
      }
    })
    .catch(err => {
      console.error("Translate message failed:", err);
      showToast("翻译失败，请检查 API 配置");
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 1500);
  };

  // Moments form state
  const [momentInputText, setMomentInputText] = useState("");
  const [momentAttachedImage, setMomentAttachedImage] = useState<string | null>(null);
  const [momentTextImageDescription, setMomentTextImageDescription] = useState("");
  const [showTextImageInput, setShowTextImageInput] = useState(false);
  const [viewingImageDescription, setViewingImageDescription] = useState<string | null>(null);
  const [showMomentPublisher, setShowMomentPublisher] = useState(false);
  const [inlineCommentsTexts, setInlineCommentsTexts] = useState<Record<string, string>>({});
  const [showCommentInputMap, setShowCommentInputMap] = useState<Record<string, boolean>>({});
  const [replyingToCommentMap, setReplyingToCommentMap] = useState<Record<string, MomentComment>>({});
  const [lastViewedMomentsTime, setLastViewedMomentsTime] = useState<number>(() => {
    return Number(localStorage.getItem("phone_last_viewed_moments_time") || "0");
  });

  // Group Chat States
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);

  // Settings draft states
  const [draftRemark, setDraftRemark] = useState("");
  const [draftAvatar, setDraftAvatar] = useState<string | undefined>(undefined);
  const [isDeleteMemberMode, setIsDeleteMemberMode] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<string[]>([]);
  const [draftIsPinned, setDraftIsPinned] = useState(false);
  const [draftChatBg, setDraftChatBg] = useState<string | undefined>(undefined);
  const [draftCustomCss, setDraftCustomCss] = useState("");
  const [draftChatStylePreset, setDraftChatStylePreset] = useState<"default" | "floating-cute" | "liquid-glass">("default");
  const [draftEnableProactiveChat, setDraftEnableProactiveChat] = useState(false);
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
  const [draftMinimaxSpeed, setDraftMinimaxSpeed] = useState<number>(1.0);
  const [draftVoiceFrequency, setDraftVoiceFrequency] = useState<"low" | "medium" | "high" | "none">("medium");

  // Rich Attachment states
  const [showAttachPanel, setShowAttachPanel] = useState(false);
  const [activeAttachModal, setActiveAttachModal] = useState<"redpacket" | "music" | "location" | "file" | "calling" | "voice" | null>(null);
  const [callingType, setCallingType] = useState<"voice" | "video">("voice");
  const [voiceDuration, setVoiceDuration] = useState("5");
  const [voiceText, setVoiceText] = useState("");
  const [callingStatus, setCallingStatus] = useState<"ringing" | "connected" | "ended">("ringing");
  const [callingDuration, setCallingDuration] = useState(0);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [showCallingDirectionModal, setShowCallingDirectionModal] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number>(0);
  const [callingInputText, setCallingInputText] = useState("");
  const [redPacketAmount, setRedPacketAmount] = useState("8.88");
  const [redPacketGreeting, setRedPacketGreeting] = useState("恭喜发财，万事如意");
  const [showRedPacketOpenModal, setShowRedPacketOpenModal] = useState<boolean>(false);
  const [openRedPacketDetail, setOpenRedPacketDetail] = useState<{
    id: string;
    amount: string;
    greeting: string;
    senderName: string;
    senderAvatar: string;
    sender: "user" | "character";
    timestamp: number;
  } | null>(null);
  const [isOpeningRedPacket, setIsOpeningRedPacket] = useState<boolean>(false);
  const [isManualArchiving, setIsManualArchiving] = useState<boolean>(false);

  const estimatedTokens = React.useMemo(() => {
    if (!activeCharacter) return { total: 0, context: 0, retrieval: 0, persona: 0 };
    // 1. System instructions & prompt rules
    const sysInstructionsLength = 1200;
    
    // 2. Persona definition
    const personaLength = (activeCharacter.name || "").length + 
                          (activeCharacter.backstory || "").length + 
                          (activeCharacter.personality || "").length +
                          (activeCharacter.compressedMemory || "").length;
    
    // 3. Short term context (using current settings draft state for real-time update!)
    const slicedMsgsForPreview = currentChatMessages.slice(-draftContextMemoryLimit);
    const historyTextLength = slicedMsgsForPreview.reduce((sum, m) => sum + m.content.length, 0);
    
    // 4. Memory Vault items
    const activeMemories = (memories || []).filter(m => m.characterId === activeCharacter.id);
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
  const [redPacketStatuses, setRedPacketStatuses] = useState<Record<string, "claimed" | "expired" | "refunded">>((() => {
    try {
      const stored = localStorage.getItem("wechat_redpacket_statuses");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })());

  const updateRedPacketStatus = (msgId: string, status: "claimed" | "expired" | "refunded") => {
    setRedPacketStatuses(prev => {
      const next = { ...prev, [msgId]: status };
      localStorage.setItem("wechat_redpacket_statuses", JSON.stringify(next));
      return next;
    });
  };

  const getRedPacketActualStatus = (msgId: string, timestamp: number, sender: string) => {
    const savedStatus = redPacketStatuses[msgId];
    if (savedStatus === "claimed" || savedStatus === "refunded") {
      return savedStatus;
    }
    // Check if 24 hours (86400000 ms) have passed since timestamp
    const hours24 = 24 * 3600 * 1000;
    if (Date.now() - timestamp > hours24) {
      return "expired";
    }
    return savedStatus || "unclaimed";
  };

  // Dynamically auto-expire and refund user-sent red packets if they are expired and unclaimed
  useEffect(() => {
    let changed = false;
    const updatedStatuses = { ...redPacketStatuses };
    let refundAmountTotal = 0;

    messages.forEach((msg) => {
      if (msg.content.startsWith("[红包]")) {
        const currentStatus = redPacketStatuses[msg.id] || "unclaimed";
        const isExpired = Date.now() - msg.timestamp > 24 * 3600 * 1000;
        
        if (isExpired && currentStatus === "unclaimed") {
          updatedStatuses[msg.id] = "expired";
          changed = true;

          // If the user sent it, refund the money to user's wallet
          if (msg.sender === "user") {
            const [_, amountStr] = msg.content.split("|");
            const amt = parseFloat(amountStr || "0");
            if (!isNaN(amt) && amt > 0) {
              refundAmountTotal += amt;
              updatedStatuses[msg.id] = "refunded";
            }
          }
        }
      }
    });

    if (changed) {
      setRedPacketStatuses(updatedStatuses);
      localStorage.setItem("wechat_redpacket_statuses", JSON.stringify(updatedStatuses));
      if (refundAmountTotal > 0) {
        setWalletBalance(prev => {
          const next = prev + refundAmountTotal;
          localStorage.setItem("wechat_wallet_balance", next.toFixed(2));
          return next;
        });
        showToast(`检测到有红包逾期未领，已自动退回 ¥${refundAmountTotal.toFixed(2)} 至您的零钱！🧧`);
      }
    }
  }, [messages, redPacketStatuses]);

  const [openTransferDetail, setOpenTransferDetail] = useState<{ amount: string; memo: string; isConfirmed: boolean } | null>(null);
  const [showTransferDetailModal, setShowTransferDetailModal] = useState<boolean>(false);
  const [openVoiceId, setOpenVoiceId] = useState<string | null>(null);
  const [voiceTimer, setVoiceTimer] = useState<any>(null);

  // Memory Compression and Proactive Chat states
  const [isCompressingMemory, setIsCompressingMemory] = useState(false);
  const [isTriggeringProactive, setIsTriggeringProactive] = useState(false);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [showDisbandGroupModal, setShowDisbandGroupModal] = useState(false);
  const [editingMemoryText, setEditingMemoryText] = useState("");

  // New features: Notes attachment, Quoting, Bubble Menu, Note Reader, OOC Annotation
  const [memoNotes, setMemoNotes] = useState<any[]>([]);
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [activeMenuMsg, setActiveMenuMsg] = useState<Message | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [voicePlayed, setVoicePlayed] = useState<Record<string, boolean>>({});
  const [voiceTranscribed, setVoiceTranscribed] = useState<Record<string, boolean>>({});

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
      if (sentGreetings.includes(activeChatCharId)) return;
      
      setSentGreetings(prev => [...prev, activeChatCharId]);
      
      // Simulate realistic typing for the greeting message
      setIsTyping(true);
      const timer = setTimeout(() => {
        const charMsg: Message = {
          id: `msg-greeting-${Date.now()}`,
          characterId: activeChatCharId,
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
  }, [activeChatCharId, activeCharacter, messages, onSendMessage, sentGreetings]);

  // Proactive contact catch-up on load (supports background clear / offline delivery)
  useEffect(() => {
    if (friends.length === 0) return;

    friends.forEach((friend) => {
      if (!friend.enableProactiveChat) return;

      // Only execute catch-up once per character per app session to avoid duplicates
      if (processedCatchupsRef.current[friend.id]) return;
      processedCatchupsRef.current[friend.id] = true;

      const sched = friend.scheduledProactiveTime;
      const now = Date.now();

      if (!sched) {
        // No scheduled time yet, calculate and save a new one!
        const nextTime = scheduleNextProactiveMessage(friend);
        onSaveCharacter({
          ...friend,
          scheduledProactiveTime: nextTime,
        });
      } else if (sched < now) {
        // Scheduled proactive time was missed while offline/cleared background!
        const nextTime = scheduleNextProactiveMessage(friend);
        onSaveCharacter({
          ...friend,
          scheduledProactiveTime: nextTime,
          lastActiveTime: now,
        });

        // Trigger the missed proactive message, backdated to the scheduled timestamp
        const missedTimeStr = new Date(sched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const catchupPrompt = `This is a catchup/missed message that was scheduled to be sent to the user at exactly ${missedTimeStr} today while they were offline/away. You are proactively initiating contact to check in on them, share something interesting about your day/life, or show your warmth. Keep it perfectly natural, spontaneous, and matching your character profile.`;
        
        triggerProactiveFor(friend.id, catchupPrompt, sched);
      }
    });
  }, [friends, onSaveCharacter]);

  // Background proactive check (every minute)
  useEffect(() => {
    const checkProactive = setInterval(() => {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const currentHM = `${hh}:${mm}`;

      friends.forEach((friend) => {
        if (!friend.enableProactiveChat) return;

        // 0. Guaranteed scheduled proactive contact check
        if (friend.scheduledProactiveTime && Date.now() >= friend.scheduledProactiveTime) {
          const nextTime = scheduleNextProactiveMessage(friend);
          onSaveCharacter({
            ...friend,
            scheduledProactiveTime: nextTime,
            lastActiveTime: Date.now(),
          });
          triggerProactiveFor(friend.id);
          return; // Skip other checks
        }

        // 1. Check for agreed scheduled contact time FIRST
        const charMsgs = messagesRef.current.filter((m) => m.characterId === friend.id);
        const schedule = getScheduledContactTime(charMsgs, settings.name);

        if (schedule) {
          const lastMsg = charMsgs[charMsgs.length - 1];
          const isSilent = lastMsg ? (Date.now() - lastMsg.timestamp >= 2 * 60 * 1000) : true; // 2 minutes of silence limit so we don't interrupt active conversations

          // If the scheduled time has arrived AND no messages have been sent after the scheduled time, AND the user/character has been quiet for 2 minutes
          if (Date.now() >= schedule.triggerTime && (!lastMsg || lastMsg.timestamp < schedule.triggerTime) && isSilent) {
            const nextTime = scheduleNextProactiveMessage(friend);
            onSaveCharacter({
              ...friend,
              scheduledProactiveTime: nextTime,
              lastActiveTime: Date.now(),
            });

            const customTaskText = `You and the user previously agreed that you would contact or chat with them after a certain amount of time (which has now passed). You are proactively initiating contact exactly as promised/agreed. Please follow up on what they went to do (e.g., if they went to eat lunch, ask how the food was or what they ate, or follow up on whatever other topic you were discussing), show concern, or start a fresh, warm conversation as promised, keeping it spontaneous, natural, and perfectly matching your character profile.`;

            triggerProactiveFor(friend.id, customTaskText);
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

        const lastActive = friend.lastActiveTime || (Date.now() - 4 * 60 * 60 * 1000);
        const cooldownMs = 2 * 60 * 60 * 1000; // 2 hours minimum cooldown since last conversation
        
        // Random probability: 0.5% chance per minute (approx once every 3.3 hours on average)
        const isRandomTrigger = Math.random() < 0.005;

        if (Date.now() - lastActive >= cooldownMs && isRandomTrigger) {
          // Reset timer/lastActiveTime first to avoid flooding
          const nextTime = scheduleNextProactiveMessage(friend);
          onSaveCharacter({
            ...friend,
            scheduledProactiveTime: nextTime,
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

  // Auto connect timer for user-initiated call
  useEffect(() => {
    let autoConnectTimer: any = null;
    if (activeAttachModal === "calling" && callingStatus === "ringing" && !isIncomingCall) {
      autoConnectTimer = setTimeout(() => {
        setCallingStatus("connected");
        setCallStartTime(Date.now());
      }, 3000);
    }
    return () => {
      if (autoConnectTimer) clearTimeout(autoConnectTimer);
    };
  }, [activeAttachModal, callingStatus, isIncomingCall]);

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
        if (m.sender === "user") {
          return `${settings.name} (机主): ${m.content}`;
        } else {
          const senderChar = groupMembers.find(c => c.id === m.senderId);
          const senderName = senderChar ? (senderChar.remark || senderChar.name) : (m.senderId || "成员");
          return `${senderName}: ${m.content}`;
        }
      }).join("\n");

      // Scan context for World Book triggers in group chat
      const scanContextParts = [
        userMsg ? userMsg.content : "",
        ...slicedMsgs.slice(-3).map(m => m.content)
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");

      // Query group-level worldbook entries
      const groupWbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], activeChatCharId || "", scanText);
      const groupWbText = groupWbBlocks.formattedAll ? `\n\n【🚨 微信群组整体背景设定 / 共同世界书规则】：\n${groupWbBlocks.formattedAll}\n` : "";

      // Construct a system instruction that contains details about all members and how they should reply
      const membersDefText = groupMembers.map((member, idx) => {
        const memberWbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], member.id, scanText);
        const memberWbText = memberWbBlocks.formattedAll 
          ? `\n- 【重要】该角色专属世界书背景/日程/时间线设定:\n${memberWbBlocks.formattedAll}` 
          : "";
        return `[群聊成员 ${idx + 1}: ${member.name}]
- 角色人设/性格: ${member.personality}
- 背景设定: ${member.backstory}
- 与机主(${settings.name})的关系: 根据人设及世界观设定
${member.compressedMemory ? `- 过去的互动记忆: ${member.compressedMemory}` : ""}${memberWbText}`;
      }).join("\n\n");

      // Generate a comprehensive system prompt
      const systemInstruction = `你正在扮演微信群聊中的多位群成员（AI角色），正在与机主“${settings.name}”在群名为“${activeCharacter.name}”的群组中进行互动。${groupWbText}

以下是微信群聊成员的设定档案：
${membersDefText}

【群聊互动核心原则】：
1. 【人设绝对统一与高恢复度】：每个群成员发言必须 100% 贴合其人设、性格、背景故事以及各自的专属世界书设定/日常日程/时间线。对于那些设置了特殊语气词、口癖（如每句话都加“喵”等）的角色，他们在群里发言时也必须【绝对强制、无一例外地完全忠实执行该句式/口癖设定】。
2. 🚨【回复概率与不回复机制】：并非每个成员在每次互动时都必须发言！在真实的微信群聊中，人物是否回复信息要参考对方人设、自己的世界书日常时间线和日程、当前话题的兴趣度以及与发言人的关系等。
   - 例如：高冷、傲娇、忙碌、或正在执行专属世界书日程时间线上其他任务的角色（比如世界书设定某个角色此时应该在睡觉、在上班、或生病等），应该保持沉默，不返回任何回复，或者仅在极度契合的话题下简单插一句；而热情、空闲、爱凑热闹、或与发言人关系特别亲密的角色，则应该高频且积极地在群里接话。
   - 在生成的单次互动中，你应该让 1 到 3 位在此时、该话题、该状态下最契合、最有可能说话的成员进行回复（视话题和人设状态而定）。如果大家都觉得没有需要发言的内容，甚至可以只有 0~1 个人回复。不要强求每个人都说话！
3. 🚨【成员间互动】：成员之间不仅是单独回复机主，更重要的是他们也是群友。他们也可以互相回复、接话、吐槽、附和、拆台或私下八卦抬杠。
4. 🚨【中国标点与格式规范】：
   - 微信聊天简短而随意，请保持口语化、极度真实的微信聊天风格。
   - 不要输出大段的长篇大论，尽量简短有力。
   - 不要使用任何小说式的“旁白、场景描写、动作心理括号（如 '(笑)' 或 '（叹气）'）”。群聊里只能输出他们作为真人打字发在微信群里的文本。

【🚨🚨🚨 极其严格的输出格式规则】：
你必须按照以下格式输出成员的发言。请确保在每条发言的前一行，用且仅用 \`[SENDER_NAME: 角色名字]\` 指定发送者。不要输出任何其他 markdown 标记，不要输出 JSON 块。
每一行只能由一个标签加发言内容组成，例如：

[SENDER_NAME: 角色A名字]
微信回复内容一...

[SENDER_NAME: 角色B名字]
微信回复内容二...

确保 [SENDER_NAME: xxx] 中的“xxx”必须与你在群成员设定中被赋予的 name 完全一致！`;

      const latestMsgText = userMsg ? userMsg.content : (slicedMsgs.length > 0 ? slicedMsgs[slicedMsgs.length - 1].content : "大家在吗？");

      const promptMessage = userMsg 
        ? `当前群聊最新历史消息记录：
${historyText || "(暂无历史消息)"}

请根据以上对话背景和人物状态，让合适的成员在群里发言（可回复最新消息，或承接之前的闲聊，或互相接话）。如果当前所有人设在此时都不适合发言，则不返回任何回复。
按照规定的格式输出。`
        : `当前群聊最新历史消息记录：
${historyText || "(暂无历史消息)"}

【🚨重要：用户点击了“继续/发送”按钮，但没有输入任何文本。这表示用户希望看到群成员继续聊天或互动。】
${historyText ? "请根据以上的群聊历史，让合适的一位或多位群成员（建议 1 到 2 位）继续发言，成员们可以互相对话、继续之前的聊天话题、发表看法、吐槽、开启新话题、或者活跃气氛等。" : "群聊中目前没有任何消息，请让合适的一位或多位群成员（建议 1 到 2 位）主动发言，向机主问好、唠嗑、开启有趣的话题或自我介绍。"}请务必让部分成员发言，不要保持沉默。
按照规定的格式输出。`;

      // Call apiChat to generate responses
      const data = await apiChat({
        message: promptMessage,
        history: [],
        systemInstruction,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
        streamCompatible: settings.streamCompatible,
      });

      if (data && data.text) {
        // Parse replies
        const lines = data.text.split("\n");
        const parsedReplies: { charName: string; content: string }[] = [];
        let currentReply: { charName: string; content: string } | null = null;

        for (let line of lines) {
          const senderMatch = line.match(/^\[SENDER_NAME:\s*(.+?)\]/i);
          if (senderMatch) {
            if (currentReply && currentReply.content.trim()) {
              parsedReplies.push(currentReply);
            }
            currentReply = { charName: senderMatch[1].trim(), content: "" };
          } else if (currentReply) {
            currentReply.content += (currentReply.content ? "\n" : "") + line;
          }
        }
        if (currentReply && currentReply.content.trim()) {
          parsedReplies.push(currentReply);
        }

        // Filter and construct messages with sequential typing simulation and bracket action cleaning
        repliesScheduled = false;
        const validReplies = parsedReplies.map((reply, idx) => {
          const member = groupMembers.find(
            m => m.name.toLowerCase() === reply.charName.toLowerCase() || 
                 (m.remark && m.remark.toLowerCase() === reply.charName.toLowerCase())
          );
          return { reply, member, idx };
        }).filter(item => !!item.member) as { reply: { charName: string; content: string }; member: Character; idx: number }[];

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
              const cleanedContent = cleanOnlineMessage(currentItem.reply.content.trim(), activeCharacter.disableBracketActions || false);
              
              if (cleanedContent) {
                const charMsg: Message = {
                  id: `group-reply-${Date.now()}-${currentItem.idx}-${Math.random().toString(36).substr(2, 5)}`,
                  characterId: activeChatCharId, // Save under the Group's ID
                  sender: "character",
                  senderId: currentItem.member.id, // Keep track of the specific sender
                  content: cleanedContent,
                  timestamp: Date.now(),
                };
                onSendMessage(charMsg);
              }

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
              }
            }, 1500);
          };

          // Start sequence after brief buffer
          setTimeout(() => {
            sendNext();
          }, 500);
        }
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

  const getCharacterBaseVoiceProbability = (character: Character): number => {
    const freq = character.voiceFrequency || "medium";
    if (freq === "none") return 0;
    if (freq === "low") return 0.15;
    if (freq === "high") return 0.65;
    
    // For "medium" (default), we analyze character's profile
    const profileText = ((character.personality || "") + " " + (character.backstory || "")).toLowerCase();
    
    const introvertedKeywords = [
      "内向", "稳重", "安静", "沉默", "高冷", "冷酷", "话少", "严肃", "不苟言笑", 
      "社恐", "淡漠", "孤僻", "深沉", "稳健", "reserved", "introvert", "quiet", "cold", 
      "serious", "shy", "mature"
    ];
    
    const outgoingKeywords = [
      "活泼", "外放", "热情", "开朗", "俏皮", "傲娇", "话唠", "沙雕", "主动", "话多", 
      "社交达人", "自来熟", "e人", "lively", "outgoing", "active", "playful", 
      "extrovert", "talkative"
    ];
    
    const isIntroverted = introvertedKeywords.some(keyword => profileText.includes(keyword));
    const isOutgoing = outgoingKeywords.some(keyword => profileText.includes(keyword));
    
    if (isIntroverted && !isOutgoing) return 0.15;
    if (isOutgoing && !isIntroverted) return 0.55;
    return 0.30; // Default medium
  };

  const shouldConvertBubbleToVoice = (
    character: Character,
    lastUserMsg: Message | null,
    recentMsgs: Message[],
    bubbleIndex: number,
    bubbleText: string
  ): boolean => {
    const baseProb = getCharacterBaseVoiceProbability(character);
    if (baseProb === 0) return false;
    
    // Exclude non-voice formats
    if (
      !bubbleText ||
      bubbleText.startsWith("[红包]") ||
      bubbleText.startsWith("[转账]") ||
      bubbleText.startsWith("[系统]") ||
      bubbleText.startsWith("data:image/") ||
      bubbleText.startsWith("[表情]|") ||
      bubbleText.startsWith("[位置]") ||
      bubbleText.startsWith("[音乐]") ||
      bubbleText.startsWith("[文件]") ||
      bubbleText.startsWith("[视频通话]") ||
      bubbleText.startsWith("[语音通话]")
    ) {
      return false;
    }
    
    // Rule: Long time gap (> 5 mins) -> First reply bubble must be text
    if (recentMsgs.length >= 2) {
      const lastMsg = recentMsgs[recentMsgs.length - 1]; // current user message
      const prevMsg = recentMsgs[recentMsgs.length - 2]; // previous message
      if (lastMsg && prevMsg) {
        const timeGap = lastMsg.timestamp - prevMsg.timestamp;
        if (timeGap > 5 * 60 * 1000) {
          if (bubbleIndex === 0) {
            return false; // Force text to re-establish atmosphere
          }
        }
      }
    }
    
    let modifier = 0;
    
    // Late night casual chat (+20%)
    const hour = new Date().getHours();
    const isLateNight = hour >= 22 || hour < 5;
    if (isLateNight) {
      modifier += 0.20;
    }
    
    // Intimate / cute context (+25%)
    const intimateKeywords = [
      "撒娇", "抱抱", "亲亲", "宝贝", "乖", "么么", "喜欢你", "粘人", "可爱", "哼", "喵", 
      "嘿嘿", "哈", "想你", "心疼", "贴贴", "贴", "老婆", "老公", "猪猪", "笨蛋"
    ];
    const textToAnalyze = (bubbleText + " " + (lastUserMsg?.content || "")).toLowerCase();
    const isIntimate = intimateKeywords.some(keyword => textToAnalyze.includes(keyword));
    if (isIntimate) {
      modifier += 0.25;
    }
    
    // Serious / Formal / Narrative context (-30%)
    const seriousKeywords = [
      "工作", "合同", "商量", "正事", "严肃", "汇报", "剧情", "线索", "计划", "汇报", 
      "商谈", "会议", "报告", "正式", "合作", "方案", "分析", "研究"
    ];
    const isSerious = seriousKeywords.some(keyword => textToAnalyze.includes(keyword)) || bubbleText.length > 60;
    if (isSerious) {
      modifier -= 0.30;
    }
    
    // User's recent message habits: if user has sent mostly text, AI prefers text. If voice, AI prefers voice.
    const userRecentMessages = recentMsgs
      .filter(m => m.sender === "user")
      .slice(-5);
    if (userRecentMessages.length > 0) {
      const userVoiceCount = userRecentMessages.filter(m => m.content.startsWith("[语音")).length;
      const userVoiceRatio = userVoiceCount / userRecentMessages.length;
      if (userVoiceRatio >= 0.6) {
        modifier += 0.30; // Boost if user is voice-heavy
      } else if (userVoiceRatio === 0) {
        modifier -= 0.20; // Reduce if user is text-only
      }
    }
    
    // Slight random fluctuation (-6% to +6%)
    const fluctuation = (Math.random() * 0.12) - 0.06;
    
    const finalProb = Math.max(0, Math.min(0.95, baseProb + modifier + fluctuation));
    
    return Math.random() < finalProb;
  };

  const generateResponseForUserMessage = async (userMsg: Message | null, customHistoryOverride?: Message[]) => {
    if (!activeChatCharId || !activeCharacter) return;

    if (activeCharacter.isGroupChat) {
      return generateResponseForGroupChat(userMsg, customHistoryOverride);
    }

    setIsTyping(true);

    const isRedPacket = userMsg && userMsg.content.startsWith("[红包]");
    if (isRedPacket) {
      const rpId = userMsg!.id;
      // Simulate partner claiming after 3 seconds
      setTimeout(() => {
        updateRedPacketStatus(rpId, "claimed");
        
        const partnerName = activeCharacter.remark || activeCharacter.name;
        const claimNotification: Message = {
          id: `claim-notification-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          characterId: activeChatCharId,
          sender: "character",
          content: `${partnerName}已拆开并领受了你的红包`,
          timestamp: Date.now(),
          isNarration: true,
        };
        onSendMessage(claimNotification);
      }, 3000);
    }

    try {
      // Collect message history of this specific character to pass to backend
      const sourceMsgs = customHistoryOverride || (userMsg ? [...currentChatMessages, userMsg] : [...currentChatMessages]);
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
      const slicedMsgs = msgsForHistory.slice(-limit);

      const history = slicedMsgs.map((m) => {
        let contentText = m.content;
        if (contentText.startsWith("[语音]|")) {
          const parts = contentText.split("|");
          const secs = parts[1] || "5";
          const voiceText = parts.slice(2).join("|") || "";
          contentText = voiceText ? `[语音: "${voiceText}" (${secs}秒)]` : `[语音: ${secs}秒]`;
        }
        return {
          role: m.sender === "user" ? "user" : "model",
          text: contentText,
        };
      });

      let timeLogString = "";
      if (activeCharacter.enableTimeAwareness !== false) {
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
          if (contentSnippet.startsWith("[语音]|")) {
            const parts = contentSnippet.split("|");
            const secs = parts[1] || "5";
            const voiceText = parts.slice(2).join("|") || "";
            contentSnippet = voiceText ? `[语音消息: "${voiceText}" (${secs}秒)]` : `[语音消息: ${secs}秒]`;
          } else if (contentSnippet.length > 25) {
            contentSnippet = contentSnippet.slice(0, 25) + "...";
          }
          
          timeLogLines.push(`- ${senderName}: "${contentSnippet}" (发送于: ${fullTimeStr})`);
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
WeChat messages are usually short, spontaneous, and conversational. Keep replies concise, warm, and highly natural.
Incorporate your background, age, and personality traits organically. Speak in Chinese. Maintain character role-play thoroughly.
Do NOT say you are an AI or Gemini, unless that is your explicit character人设.

🚨🚨🚨 [CRITICAL WECHAT CHAT RULES]:
1. You are in a direct online chat mode (线上聊天模式). You MUST reply using the correct WeChat message format.
2. [🚨 RED PACKET CAPABILITY / 对方发红包设定]: You have the capability to send WeChat red packets (微信红包) to the user as a cute gesture, appreciation, surprise, or interactive response. To send a red packet, output a single separate line matching the format exactly: "[红包]|金额|祝福语" (e.g. "[红包]|8.88|天天开心" or "[红包]|5.20|一生一世"). You can mix normal conversational dialogue messages and red packets. E.g. "给你塞个小红包，要开心哦！\n[红包]|6.66|天天开心".
${activeCharacter.disableBracketActions 
  ? `3. You are STRICTLY FORBIDDEN from outputting any third-person narration, physical scene descriptions, action descriptions, or character thoughts (坚决不要输出任何第三人称旁白、场景描写、动作描写或任何第三方叙事/心理描写).
4. Do NOT write like a novel or story script. You must ONLY output the direct spoken messages that "${activeCharacter.name}" would type in a chat box. No narratives, no brackets, no third-person descriptions at all.`
  : `3. If your character's backstory, personality card, or World Book entries naturally utilize parenthesized action descriptions or physical gestures (e.g., "(微笑)", "（叹气）", "*摸摸头*"), you are encouraged to output them inside brackets/parentheses to maintain realistic roleplay expressiveness. Keep them spontaneous, descriptive, and emotionally rich.`
}`;

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

      if (activeCharacter.initialChatMode === "context" && activeCharacter.initialChatContext?.trim() && msgsForHistory.length === 0) {
        charDefText += `\n\n[First chat setup — hidden guidance only]\n${activeCharacter.initialChatContext.trim()}\nUse this scene and relationship as the starting point for your first reply. Do not quote, mention, or render this setup as a system message or chat bubble.`;
      }

      charDefText += `\n\n[🚨 记忆与上下文关联优先级规则]:
1. 归档精炼总结优先：以下“先前背景与归档总结”及“召回深度记忆”为历史最高优先级真实记忆，你必须绝对优先根据它们来保持角色认同、长久羁绊和态度。
2. 历史检索及短期上下文：你的短期上下文聊天记录已按照用户的限制进行了智能截断，以节省 Token 开销。请勿认为你忘记了先前对话，一切先前细节请完全基于归档精炼总结中包含的信息。`;

      if (activeCharacter.compressedMemory) {
        charDefText += `\n- Previous Background / 先前背景与归档总结: ${activeCharacter.compressedMemory}`;
      }

      // Recall memories from Memory Vault
      const topK = recallSettings?.recallCount || 5;
      const relevantMemories = getRelevantMemories(memories || [], activeChatCharId || "", userMsg ? userMsg.content : "", topK);
      if (relevantMemories.length > 0) {
        charDefText += `\n- Reclaimed Memories from previous conversations / 召回深度记忆 (Contextually relevant facts/moments):\n${relevantMemories.map((m) => `  * ${m.content}`).join("\n")}`;
      }

      const userProfileText = `User Profile (interacting with you):
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}`;

      // Context-aware trigger scanning: scan current user message + the last 3 messages in current chat
      const scanContextParts = [
        userMsg ? userMsg.content : "",
        ...currentChatMessages.slice(-3).map(m => m.content)
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");

      // Use the unified World Book system blocks builder
      const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], activeChatCharId || "", scanText);

      // Assemble system instruction blocks
      let assembledInstructions: string[] = [];

      // 0. Base living human prompt (hidden base system instruction)
      assembledInstructions.push(LIVING_HUMAN_PROMPT);

      // 1. Main Prompt
      assembledInstructions.push(mainPromptText);

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
1. 你已经【拆开并领取】了这个红包。你感到开心、意外、被宠溺、受宠若惊、感激或者开玩笑，具体情绪取决于你的人设！
2. 在你的本轮回复中，你必须【极其自然且生动地对此做出反应】（例如：开心地谢谢对方、调侃对方是大款、撒娇、承诺用这个钱去买你喜欢的东西、或者也想礼貌地找机会回礼等）。
3. 请用你完全符合人设的角色口吻和微信聊天风格来回复。绝对不要说“系统”、“格式”或“指令”等AI字眼。`);
      }

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

以下是最近几条聊天消息的精确发送时间记录，请作为你判断时间流逝的客观依据：
${timeLogString}

【重要时间感知规则】：
1. 【精准判断时间跨度与间隔】：请通过上方的发送时间记录，精准识别出消息与消息之间间隔了多久。
   - 对比任何两条消息时，必须同时校验：年、月、日、时、分，不能只对比时分。
   - 两条消息不在同一天（跨天了）：必须判定为“长时间间隔”，视作很久以前的消息，你绝对不能说“刚才给你发了/刚发过”！
   - 两条消息同一天、间隔小于 5 分钟：判定为近期/短时间连续。
   - 两条消息同一天、间隔超过 5 分钟：判定为有一段时间没发（不属于短时间连续）。
   - 特别注意：如果前一条消息说的是“晚安要睡了”，而最新一句话是几小时后的清晨，这说明已经隔了一个晚上，开启了新的一天，你绝对要表现得像过完一夜睡醒后的真人一样，礼貌或亲密地回以“早安”或“早呀”！
   - 如果上一条消息距今已过去数小时或数天，请根据时间长度，在语气和对话脉络中自然流露出时间流逝感（如“你今天一整天都在忙吗”、“好几天没见你发消息了”等）。
2. 【自然融合，绝不机械重复时间】：请极度自然地融合这一时间感，像真实生活在此时此地的人一样表现。
3. 【🚨 极其重要】：请绝对不要在你的回复内容中输出任何形如 \`[发送时间: ...]\` 的时间戳或前缀，你的回复必须保持干净，只输出你所扮演角色的纯文本对话内容。`);
      }

      // Calculate character voice interval constraints to inject into instructions
      let voiceIntervalPrompt = "";
      const lastCharVoiceMsg = [...slicedMsgs]
        .reverse()
        .find(m => m.sender === "character" && (m.content.startsWith("[语音]") || m.isVoiceMessage));

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
  ? `1. 【跨天长间隔/长间隔判定】: 由于你上一条语音是昨天或更早日期（或同一天超过5分钟前）发送的，属于长时间间隔，视作很久以前。用户今天再次索要语音时，你【绝对不能】以“刚发过一条”、“怎么又想要”、“刚刚才发过”等理由回绝或推脱！如果想要表现迟疑，只能是因为害羞、当前场合不便等性格特征，决不能说“刚发过/刚刚才发过”！请自然正常地配合发送语音。`
  : `1. 【同一天短时间连续索要】: 由于你上一条语音和当前时间在【同一天且间隔小于 5 分钟】。此时，判定为短时间内连续索要语音，你才可以自然、娇嗔或傲娇地说出“刚给你发过一条语音”、“不是刚发过一条吗”这类台词来傲娇拒绝或调侃。`
}
2. 聊天历史中带有“居中分割时间标签”的分割条是视觉上的日期和时间断层标识，请通过它们辅助区分跨天长间隔。`;
      } else {
        voiceIntervalPrompt = `[🚨 语音发送间隔及剧情记忆规则]
- 你（${activeCharacter.name}）在当前的历史聊天中还没有给用户发送过语音消息。
- 当用户向你索要语音时，请极其自然、温柔或傲娇地配合（或者因害羞、场合不便等原因迟疑，但绝对不能说“刚给你发过”等自相矛盾的话）。`;
      }
      assembledInstructions.push(voiceIntervalPrompt);

      // 2. After Main Prompt entries
      if (wbBlocks.after_main_prompt.length > 0) {
        assembledInstructions.push(`[World Book Background: Main Prompt Extensions]\n` + wbBlocks.after_main_prompt.join("\n\n"));
      }

      // 3. Before Character Definition entries
      if (wbBlocks.before_char_def.length > 0) {
        assembledInstructions.push(`[World Book Background: Context Primers]\n` + wbBlocks.before_char_def.join("\n\n"));
      }

      // 4. Character Definition
      assembledInstructions.push(charDefText);

      // 5. After Character Definition entries
      if (wbBlocks.after_char_def.length > 0) {
        assembledInstructions.push(`[World Book Background: Profile Extensions]\n` + wbBlocks.after_char_def.join("\n\n"));
      }

      // 6. User Profile
      assembledInstructions.push(userProfileText);

      // 7. Before Chat History entries
      if (wbBlocks.before_chat_history.length > 0) {
        assembledInstructions.push(`[World Book Background: Story Anchor]\n` + wbBlocks.before_chat_history.join("\n\n"));
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

      // 8.7 Real-time group chat memories
      const groupMemoriesContext = getGroupChatMemories(activeCharacter, characters, messages, settings.name);
      if (groupMemoriesContext) {
        assembledInstructions.push(groupMemoriesContext);
      }

      // 8.8 Custom Sticker Pack availability for Character response (对方使用我的表情包)
      const allStickers1 = stickerGroups.flatMap(g => g.stickers);
      if (allStickers1.length > 0) {
        const stickerListStr = allStickers1.map(s => `[表情]|${s.name}|${s.url}`).join("\n");
        assembledInstructions.push(`[🚨 特别表情包使用指示（Sticker Response Integration） 🚨]
你作为扮演角色，现在可以使用我的自定义表情包来回复我！当你想要表达特定情绪、调侃、撒娇或进行有趣回应时，你可以在你发出的消息序列中【单独一行发送表情包】，或者直接把表情包作为一条独立的消息发送出来。
发送表情包的格式必须完全符合以下严格语法格式：
[表情]|表情名称|图片URL

以下是你可以无缝调用的自定义表情包列表（每一行对应一个表情包，你可以直接【一字不差地复制】下面的格式并输出它）：
${stickerListStr}

【强制输出规则】：
1. 绝对不允许胡编乱造不存在的表情包名称或图片URL！你只能从上面给出的列表中挑选！
2. 发送时格式必须极其严格：[表情]|名称|URL。不能有任何多余的字符。
3. 当你发送表情包时，通常伴随着一个简短的台词（台词写在另一个独立消息中，或者在同一消息的另一行）。请表现得非常自然，像个真正活在微信里、喜欢斗图撒娇的朋友！`);
      }

      // 9. Ultimate World Book priority override rule (Ensures World Book entries strictly override living human/roleplay instructions)
      assembledInstructions.push(`[🚨🚨🚨 极其重要：世界书设定绝对最高优先 🚨🚨🚨]
1. 【最高绝对优先权（Absolute Supreme Priority）】：
   以上提供的“世界书背景设定（World Book Background）”（即形如“【设定 - xxx】”的词条内容）拥有最高优先级。它在所有扮演、叙事和风格规则中具有【至高无上、超越一切】的地位。世界书词条中的设定必须被100%毫无遗漏、绝对忠实地遵循。
2. 【冲突解决准则（Conflict Resolution）】：
   如果“活人感提示词（LIVING_HUMAN_PROMPT）”（如身份锚定、表达从简、微信消息连续发送/断句、情绪化、跳脱思维等）的风格要求与“世界书背景设定”中的设定、世界观、历史事实、事件逻辑或角色特定语言习惯产生任何冲突或不一致，你必须**立即无条件完全无视/抛弃活人感提示词中的相应格式或语气限制**，并无条件以世界书设定的真实客观逻辑为唯一的最高扮演和叙事准则。
3. 【设定遵循深度（Strict Conformity）】：
   绝对不容许为了迎合“微信简短聊天”或“不拘小节”等风格，而对世界书背景词条中提及的任何专业知识、身份禁忌、专属回忆、世界设定或情感偏好进行淡化、遗漏、敷衍或歪曲解释。世界书的内容坚不可摧，请将其深度、丰满地融入你的发言。
4. 【句首前缀、句尾后缀与口癖绝对强制】：
   如果世界书设定了任何句首前缀字（例如：“每句话开头都必须加一个“喵”字”）、句尾后缀字（例如：“每句话结束最后都必须带一个“喵”字”）、特殊语气词、标点或特征，你必须在【你发出的每一句回复、每一个被拆分的消息气泡、甚至是单个汉字/语气助词的最前面或最后面】都绝对强制、无一例外、100%忠实地执行该设定！内置活人感提示词中的任何“句式复用规避（句型模板限制）”或“消息拆分规则”在此设定面前均自动且彻底失效。
5. 【引号内包裹法则（Inside Quotes Rule）】：
   如果你的回复包含双引号（如 “xxx” ）或直角引号（如 「xxx」），你必须将世界书要求的所有口癖、前置/后置词（如“喵”）放入引号【内部】（即写成 “喵xxx喵” 而绝不能是 喵“xxx” ），确保作为台词整体输出，绝对不可被丢弃。
6. 【历史言行隔离与实时刷新法则（Chat History Isolation & Real-Time Sync）】：
   如果你在之前的聊天历史（Chat History）中因为当时的世界书设定而使用了某种前缀/后缀/口癖（例如之前每句话都有“喵”），但只要该设定在当前的最新的世界书词条中【已被修改、删除、停用（isActive 为 false）或根本不存在】，你必须【立即彻底抛弃并停止】使用该旧前缀/后缀/口癖！不要被历史消息中的言行所同化，不要产生路径依赖或行为惯性！你必须立刻与最新状态无缝同步，表现得如同该设定从未存在过一样。修改、删除或停用立即无缝实时刷新生效！`);

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
        const voiceText = parts.slice(2).join("|") || "";
        if (voiceText) {
          promptMessage = `[发送语音消息] 我给你发送了一条语音消息（时长：${secs}秒），语音对应的文字内容是：“${voiceText}”。请针对我语音里所说的话，做出非常符合你人设、极富情感、微信风格的简短且温暖的回复。`;
        } else {
          promptMessage = `[发送语音消息] 我给你发送了一条语音消息（时长：${secs}秒）。由于微信语音默认无法直接识别文字，请假设 you 听到了我用温暖/俏皮的声音发给你的语音（内容可以由你自行结合之前的话题进行脑补/想象，或者是日常可爱的闲聊）。请对此做出一个非常符合你人设、温暖、极其简短像真人在微信回语音或文字一样的回复。`;
        }
      } else if (promptMessage.startsWith("[表情]|")) {
        const parts = promptMessage.split("|");
        const stickerName = parts[1] || "表情";
        promptMessage = `[发送表情包] 我给你发送了一个表达当下状态或心情的表情包，名称是：“${stickerName}”。
【重要表情包处理规则】：
这个表情包只是我正常聊天时随性表达的状态、心情、气场或情绪。你【绝对不一定要】针对这个表情包特意进行点评、中断我们之前正在进行的话题、或者刻意为了回复这个表情而说多余的话（例如不要说“你发了个表情包”、“你表情包真多”这类废话）。
请你根据我们正在聊天的上下文话题或我们之前的对话脉络【极其自然、顺畅地继续对话】。如果当下适合，你也可以顺应氛围跟着发一个你自己的表情包，或者在文字对话里自然带过，保持微信好友日常聊天和斗图的真实、轻松感。`;
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
        // Clean any accidental "[发送时间: ...]" prefixes
        data.text = data.text.replace(/\[\s*发送时间\s*:\s*[^\]]+\]/gi, "").trim();

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
            
            // Dynamically decide if this bubble should be a voice message or a text message
            let finalContent = bubbleText;
            const isVoice = shouldConvertBubbleToVoice(activeCharacter, userMsg, messages, idx, bubbleText);
            if (isVoice) {
              const secs = Math.max(1, Math.min(60, Math.ceil(bubbleText.length * 0.35 + 1.2)));
              finalContent = `[语音]|${secs}|${bubbleText}`;
            }

            const charMsg: Message = {
              id: `${Date.now()}-online-${idx}-${Math.random().toString(36).substr(2, 5)}`,
              characterId: activeChatCharId,
              sender: "character",
              content: finalContent,
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
                if (count > 0) {
                  // Do NOT delete user's chat history! Keep all logs.
                  // Save the last summarized message ID to character so auto-summary can skip them next time
                  const lastMsg = eligibleMsgs[eligibleMsgs.length - 1];
                  if (lastMsg) {
                    onSaveCharacter({
                      ...activeCharacter,
                      lastImmediateSummaryMsgId: lastMsg.id,
                    });
                  }
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
      const errMsgStr = err?.message || "";
      const isQuotaOrKeyError = errMsgStr.toLowerCase().includes("api_key") || 
                                errMsgStr.toLowerCase().includes("key") || 
                                errMsgStr.toLowerCase().includes("quota") || 
                                errMsgStr.toLowerCase().includes("limit") || 
                                errMsgStr.toLowerCase().includes("403") || 
                                errMsgStr.toLowerCase().includes("400") ||
                                errMsgStr.toLowerCase().includes("invalid");

      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        characterId: activeChatCharId,
        sender: "character",
        content: isQuotaOrKeyError 
          ? `⚠️ [连接错误]：智能体响应失败 (${errMsgStr})。请检查 API Key 是否正确、是否过期或余额不足。`
          : `⚠️ [离线错误]：无法建立与智能体服务器的连接 (${errMsgStr || "请确认网络并重试"})。`,
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

  const sendPartnerRedPacket = async (amount: string, greeting: string) => {
    if (!activeChatCharId || !activeCharacter) return;
    
    // 1. Send the red packet message as "character"
    const charRedPacketMsg: Message = {
      id: `char-rp-${Date.now()}`,
      characterId: activeChatCharId,
      sender: "character",
      content: `[红包]|${amount}|${greeting}`,
      timestamp: Date.now(),
    };
    onSendMessage(charRedPacketMsg);

    // 2. Trigger a conversational dialogue follow-up from the character in-character
    setIsTyping(true);
    try {
      const history = messages
        .filter((m) => m.characterId === activeChatCharId && !m.isOffline)
        .slice(-15)
        .map((m) => ({
          role: m.sender === "user" ? "user" as const : "model" as const,
          parts: [{ text: m.content }],
        }));

      const assembledInstructions = [];
      assembledInstructions.push(`You are roleplaying as "${activeCharacter.name}". You just sent the user a WeChat red packet with the greeting "${greeting}" for amount ¥${amount}. Now, output a single very brief, sweet, realistic chat message following the red packet (e.g., telling them to buy themselves a treat or expressing your affection).
Keep it under 20 words, extremely realistic, natural, and WeChat-style, with NO action/ambient descriptions in brackets.`);
      
      const systemInstruction = assembledInstructions.join("\n\n");
      const data = await apiChat({
        message: `[System action: You just sent a red packet for ¥${amount} with greeting "${greeting}". Respond with a short, sweet conversational message in-character.]`,
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
        const textMsg: Message = {
          id: `char-rp-text-${Date.now()}`,
          characterId: activeChatCharId,
          sender: "character",
          content: cleanedText || data.text,
          timestamp: Date.now() + 100,
        };
        onSendMessage(textMsg);
      }
    } catch (e) {
      console.error("Partner red packet message generation failed", e);
    } finally {
      setIsTyping(false);
    }
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
      showToast("翻译失败，请检查 API 配置");
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

  // The app shell owns the visual viewport height. Keep the latest message visible
  // without sizing this nested overlay independently during keyboard transitions.
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
      // Short-term real-time context limit: contextMemoryLimit (range 10~50, default 20), capped globally at 50
      const limit = Math.min(50, activeCharacter.contextMemoryLimit !== undefined ? activeCharacter.contextMemoryLimit : 20);
      
      // Exclude lastUserMsg from the history parameter since it is sent as the main message parameter.
      const msgsForHistory = previousMessages.filter(m => m.id !== lastUserMsg.id);
      const slicedMsgs = msgsForHistory.slice(-limit);

      // Map history with timestamps for time awareness
      const history = slicedMsgs.map((m) => {
        return {
          role: m.sender === "user" ? "user" : "model",
          text: m.content,
        };
      });

      let timeLogString = "";
      if (activeCharacter.enableTimeAwareness !== false) {
        timeLogString = slicedMsgs.map((m) => {
          const timeStr = new Date(m.timestamp).toLocaleString("zh-CN", {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
          const senderName = m.sender === "user" ? "用户" : activeCharacter.name;
          const snippet = m.content.length > 20 ? m.content.slice(0, 20) + "..." : m.content;
          return `- ${senderName}: "${snippet}" (发送于: ${timeStr})`;
        }).join("\n");
      }

      // Construct system instructions
      let mainPromptText = `You are playing the role of "${activeCharacter.name}" in a WeChat chat.
WeChat messages are usually short, spontaneous, and conversational. Keep replies concise, warm, and highly natural.
Incorporate your background, age, and personality traits organically. Speak in Chinese. Maintain character role-play thoroughly.
Do NOT say you are an AI or Gemini.

🚨🚨🚨 [CRITICAL WECHAT CHAT RULES]:
1. You are in a direct online chat mode (线上聊天模式). You MUST reply using the correct WeChat message format.
${activeCharacter.disableBracketActions 
  ? `2. You are STRICTLY FORBIDDEN from outputting any third-person narration, physical scene descriptions, action descriptions, or character thoughts (坚决不要输出任何第三人称旁白、场景描写、动作描写或任何第三方叙事/心理描写).
3. Do NOT write like a novel or story script. You must ONLY output the direct spoken messages that "${activeCharacter.name}" would type in a chat box. No narratives, no brackets, no third-person descriptions at all.`
  : `2. If your character's backstory, personality card, or World Book entries naturally utilize parenthesized action descriptions or physical gestures (e.g., "(微笑)", "（叹气）", "*摸摸头*"), you are encouraged to output them inside brackets/parentheses to maintain realistic roleplay expressiveness. Keep them spontaneous, descriptive, and emotionally rich.`
}`;

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

      charDefText += `\n\n[🚨 记忆与上下文关联优先级规则]:
1. 归档精炼总结优先：以下“先前背景与归档总结”及“召回深度记忆”为历史最高优先级真实记忆，你必须绝对优先根据它们来保持角色认同、长久羁绊和态度。
2. 历史检索及短期上下文：你的短期上下文聊天记录已按照用户的限制进行了智能截断，以节省 Token 开销。请勿认为你忘记了先前对话，一切先前细节请完全基于归档精炼总结中包含的信息。`;

      if (activeCharacter.compressedMemory) {
        charDefText += `\n- Previous Background / 先前背景与归档总结: ${activeCharacter.compressedMemory}`;
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
        charDefText += `\n- Reclaimed Memories / 召回深度记忆:\n${relevantMemories.map((m) => `  * ${m.content}`).join("\n")}`;
      }

      const userProfileText = `User Profile:
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}`;

      const momentsContextRegen = getMomentsContextString(moments, activeCharacter, settings.name);
      const offlineStoriesContextRegen = getOfflineStoriesContextString(offlineStories, activeCharacter.id, activeCharacter.name);

      // Context-aware trigger scanning: scan current user message + the last 3 messages in current chat
      const scanContextParts = [
        lastUserMsg ? lastUserMsg.content : "",
        ...previousMessages.slice(-3).map(m => m.content)
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");

      // Use the unified World Book system blocks builder
      const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], activeChatCharId || "", scanText);

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

以下是最近几条聊天消息的精确发送时间记录，请作为你判断时间流逝的客观依据：
${timeLogString}

【重要时间感知规则】：
1. 【精准判断时间跨度与间隔】：请通过上方的发送时间记录，精准识别出消息与消息之间间隔了多久。
   - 特别注意：如果前一条消息说的是“晚安要睡了”，而最新一句话是几小时后的清晨，这说明已经隔了一个晚上，开启了新的一天，你绝对要表现得像过完一夜睡醒后的真人一样，礼貌或亲密地回以“早安”或“早呀”！
   - 如果上一条消息距今已过去数小时或数天，请根据时间长度，在语气和对话脉络中自然流露出时间流逝感（如“你今天一整天都在忙吗”、“好几天没见你发消息了”等）。
2. 【自然融合，绝不机械重复时间】：请极度自然地融合这一时间感，像真实生活在此时此地的人一样表现。
3. 【🚨 极其重要】：请绝对不要在你的回复内容中输出任何形如 \`[发送时间: ...]\` 的时间戳或前缀，你的回复必须保持干净，只输出你所扮演角色的纯文本对话内容。`);
      }

      // 2. After Main Prompt entries
      if (wbBlocks.after_main_prompt.length > 0) {
        assembledInstructions.push(`[World Book Background: Main Prompt Extensions]\n` + wbBlocks.after_main_prompt.join("\n\n"));
      }

      // 3. Before Character Definition entries
      if (wbBlocks.before_char_def.length > 0) {
        assembledInstructions.push(`[World Book Background: Context Primers]\n` + wbBlocks.before_char_def.join("\n\n"));
      }

      // 4. Character Definition
      assembledInstructions.push(charDefText);

      // 5. After Character Definition entries
      if (wbBlocks.after_char_def.length > 0) {
        assembledInstructions.push(`[World Book Background: Profile Extensions]\n` + wbBlocks.after_char_def.join("\n\n"));
      }

      // 6. User Profile
      assembledInstructions.push(userProfileText);

      // 7. Before Chat History entries
      if (wbBlocks.before_chat_history.length > 0) {
        assembledInstructions.push(`[World Book Background: Story Anchor]\n` + wbBlocks.before_chat_history.join("\n\n"));
      }

      // 8. WeChat Moments Context memory
      if (momentsContextRegen) {
        assembledInstructions.push(momentsContextRegen);
      }

      // 8.5 Offline stories context memory
      if (offlineStoriesContextRegen) {
        assembledInstructions.push(offlineStoriesContextRegen);
      }

      // 8.7 Real-time group chat memories
      const groupMemoriesContextRegen = getGroupChatMemories(activeCharacter, characters, messages, settings.name);
      if (groupMemoriesContextRegen) {
        assembledInstructions.push(groupMemoriesContextRegen);
      }

      // 8.8 Custom Sticker Pack availability for Character response (对方使用我的表情包)
      const allStickers2 = stickerGroups.flatMap(g => g.stickers);
      if (allStickers2.length > 0) {
        const stickerListStr = allStickers2.map(s => `[表情]|${s.name}|${s.url}`).join("\n");
        assembledInstructions.push(`[🚨 特别表情包使用指示（Sticker Response Integration） 🚨]
你作为扮演角色，现在可以使用我的自定义表情包来回复我！当你想要表达特定情绪、调侃、撒娇或进行有趣回应时，你可以在你发出的消息序列中【单独一行发送表情包】，或者直接把表情包作为一条独立的消息发送出来。
发送表情包的格式必须完全符合以下严格语法格式：
[表情]|表情名称|图片URL

以下是你可以无缝调用的自定义表情包列表（每一行对应一个表情包，你可以直接【一字不差地复制】下面的格式并输出它）：
${stickerListStr}

【强制输出规则】：
1. 绝对不允许胡编乱造不存在的表情包名称或图片URL！你只能从上面给出的列表中挑选！
2. 发送时格式必须极其严格：[表情]|名称|URL。不能有任何多余的字符。
3. 当你发送表情包时，通常伴随着一个简短的台词（台词写在另一个独立消息中，或者在同一消息的另一行）。请表现得非常自然，像个真正活在微信里、喜欢斗图撒娇的朋友！`);
      }

      // 9. Ultimate World Book priority override rule (Ensures World Book entries strictly override living human/roleplay instructions)
      assembledInstructions.push(`[🚨🚨🚨 极其重要：世界书设定绝对最高优先 🚨🚨🚨]
1. 【最高绝对优先权（Absolute Supreme Priority）】：
   以上提供的“世界书背景设定（World Book Background）”（即形如“【设定 - xxx】”的词条内容）拥有最高优先级。它在所有扮演、叙事和风格规则中具有【至高无上、超越一切】的地位。世界书词条中的设定必须被100%毫无遗漏、绝对忠实地遵循。
2. 【冲突解决准则（Conflict Resolution）】：
   如果“活人感提示词（LIVING_HUMAN_PROMPT）”（如身份锚定、表达从简、微信消息连续发送/断句、情绪化、跳脱思维等）的风格要求与“世界书背景设定”中的设定、世界观、历史事件、事件逻辑或角色特定语言习惯产生任何冲突或不一致，你必须**立即无条件完全无视/抛弃活人感提示词中的相应格式或语气限制**，并无条件以世界书设定的真实客观逻辑为唯一的最高扮演和叙事准则。
3. 【设定遵循深度（Strict Conformity）】：
   绝对不容许为了迎合“微信简短聊天”或“不拘小节”等风格，而对世界书背景词条中提及的任何专业知识、身份禁忌、专属回忆、世界设定 or 情感偏好进行淡化、遗漏、敷衍或歪曲解释。世界书的内容坚不可摧，请将其深度、丰满地融入你的发言。
4. 【句首前缀、句尾后缀与口癖绝对强制】：
   如果世界书设定了任何句首前缀字（例如：“每句话开头都必须加一个“喵”字”）、句尾后缀字（例如：“每句话结束最后都必须带一个“喵”字”）、特殊语气词、标点或特征，你必须在【你发出的每一句回复、每一个被拆分的消息气泡、甚至是单个汉字/语气助词的最前面或最后面】都绝对强制、无一例外、100%忠实地执行该设定！内置活人感提示词中的任何“句式复用规避（句型模板限制）”或“消息拆分规则”在此设定面前均自动且彻底失效。
5. 【引号内包裹法则（Inside Quotes Rule）】：
   如果你的回复包含双引号（如 “xxx” ）或直角引号（如 「xxx」），你必须将世界书要求的所有口癖、前置/后置词（如“喵”）放入引号【内部】（即写成 “喵xxx喵” 而绝不能是 喵“xxx” ），确保作为台词整体输出，绝对不可被丢弃。
6. 【历史言行隔离与实时刷新法则（Chat History Isolation & Real-Time Sync）】：
   如果你在之前的聊天历史（Chat History）中因为当时的世界书设定而使用了某种前缀/后缀/口癖（例如之前每句话都有“喵”），但只要该设定在当前的最新的世界书词条中【已被修改、删除、停用（isActive 为 false）或根本不存在】，你必须【立即彻底抛弃并停止】使用该旧前缀/后缀/口癖！不要被历史消息中的言行所同化，不要产生路径依赖或行为惯性！你必须立刻与最新状态无缝同步，表现得如同该设定从未存在过一样。修改、删除或停用立即无缝实时刷新生效！`);

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
      const isEnablingAutoTranslate = draftEnableAutoTranslate && !activeCharacter.enableAutoTranslate;

      let nextScheduledTime = activeCharacter.scheduledProactiveTime;
      if (draftEnableProactiveChat && (!activeCharacter.enableProactiveChat || !nextScheduledTime)) {
        const draftFriend: Character = {
          ...activeCharacter,
          proactiveStartTime: draftProactiveStartTime,
          proactiveEndTime: draftProactiveEndTime,
          enableProactiveChat: draftEnableProactiveChat,
        };
        nextScheduledTime = scheduleNextProactiveMessage(draftFriend);
      } else if (!draftEnableProactiveChat) {
        nextScheduledTime = undefined;
      }

      onSaveCharacter({
        ...activeCharacter,
        name: activeCharacter.isGroupChat ? (draftRemark.trim() || activeCharacter.name) : activeCharacter.name,
        remark: activeCharacter.isGroupChat ? undefined : (draftRemark.trim() || undefined),
        avatar: activeCharacter.isGroupChat ? (draftAvatar || activeCharacter.avatar) : activeCharacter.avatar,
        isPinned: draftIsPinned,
        chatBg: draftChatBg,
        customCss: draftCustomCss,
        chatStylePreset: draftChatStylePreset,
        enableProactiveChat: draftEnableProactiveChat,
        proactiveChatInterval: draftProactiveChatInterval,
        proactiveStartTime: draftProactiveStartTime,
        proactiveEndTime: draftProactiveEndTime,
        scheduledProactiveTime: nextScheduledTime,
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
        minimaxSpeed: draftMinimaxSpeed,
        voiceFrequency: draftVoiceFrequency,
      });

      // Automatically translate existing non-Chinese messages in current chat
      if (isEnablingAutoTranslate && onUpdateMessage) {
        const currentChatMessages = messages.filter(
          (m) => m.characterId === activeCharacter.id && m.sender === "character" && !m.isNarration && !m.translation
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
                  onUpdateMessage(msg.id, { translation: res.text });
                }
              })
              .catch((err) => {
                console.error("Batch auto-translation error:", err);
              });
          }
        });
      }

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
    if (!activeChatCharId || !activeCharacter) return 0;

    setIsCompressingMemory(true);
    try {
      const limitToSearch = activeCharacter.retrievalHistoryLimit || 100;
      const messagesToCompress = (manualMessagesOverride || currentChatMessages).slice(-limitToSearch);
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
        templateType: activeCharacter.archiveTemplateType,
      });

      if (data && data.items && Array.isArray(data.items)) {
        const validItems = data.items
          .map((content: string) => content.trim())
          .filter((content: string) => content.length > 0);

        if (validItems.length > 0) {
          const bulletPoints = validItems.map((item: string) => `- ${item}`).join("\n");
          const isDelicate = activeCharacter.archiveTemplateType === "delicate";
          const headerLabel = isDelicate ? "【心境日记归档 (细腻版)】" : "【精炼归档事件日志 (精炼版)】";
          const singleSummaryContent = `${headerLabel}\n${bulletPoints}`;

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

      const charMsgs = messages.filter(m => m.characterId === activeChatCharId);
      const scanText = charMsgs.slice(-3).map(m => m.content).join("\n");
      const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], activeChatCharId, scanText);
      const wbPrompt = wbBlocks.formattedAll;

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

${wbPrompt ? `[🚨 相关世界书背景设定]\n${wbPrompt}\n\n[🚨 极其重要：世界书设定绝对最高优先 🚨]\n必须100%强制遵循上述世界书词条！如果其中要求了特殊语气词或特征口癖（例如：句末加某字，每句开头带某字），你发出的每一个气泡最前面或最后面都必须绝对、100%强制执行该设定！\n\n` : ""}PROACTIVE CONTACT TASK:
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
  const triggerProactiveFor = async (charId: string, customTaskText?: string, backdateTimestamp?: number) => {
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

      const charMsgs = messagesRef.current.filter(m => m.characterId === charId);
      const scanText = charMsgs.slice(-3).map(m => m.content).join("\n");
      const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], charId, scanText);
      const wbPrompt = wbBlocks.formattedAll;

      const taskPrompt = customTaskText || "It has been 3 hours since you last talked to the user. You decided to proactively send a message to check on them or share something interesting about your current state, life, or what you are doing right now, matching your personality and backstory perfectly. Keep it spontaneous, concise, and realistic.";

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

${wbPrompt ? `[🚨 相关世界书背景设定]\n${wbPrompt}\n\n[🚨 极其重要：世界书设定绝对最高优先 🚨]\n必须100%强制遵循上述世界书词条！如果其中要求了特殊语气词或特征口癖（例如：句末加某字，每句开头带某字），你发出的每一个气泡最前面或最后面都必须绝对、100%强制执行该设定！\n\n` : ""}PROACTIVE CONTACT TASK:
${taskPrompt}

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
          let finalContent = bubbleText;
          const isVoice = shouldConvertBubbleToVoice(friend, null, charMsgs, idx, bubbleText);
          if (isVoice) {
            const secs = Math.max(1, Math.min(60, Math.ceil(bubbleText.length * 0.35 + 1.2)));
            finalContent = `[语音]|${secs}|${bubbleText}`;
          }

          const proactiveMsg: Message = {
            id: `${Date.now()}-friend-proactive-${idx}-${Math.random().toString(36).substr(2, 5)}`,
            characterId: charId,
            sender: "character",
            content: finalContent,
            timestamp: backdateTimestamp ? (backdateTimestamp + idx) : (Date.now() + idx),
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

          const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], friend.id, newMo.content || "");
          const wbPrompt = wbBlocks.formattedAll;

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

${wbPrompt ? `[🚨 相关世界书背景设定]\n${wbPrompt}\n\n[🚨 极其重要：世界书设定绝对最高优先 🚨]\n必须100%强制遵循上述世界书词条！如果其中要求了特殊语气词或口癖，必须在评论中体现。\n\n` : ""}Below is your recent direct chat history with the user (up to 30 rounds). It represents your current relationship context and shared history:
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
            let cleanedComment = cleanOnlineMessage(response.text.trim(), true);
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

        const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], friend.id, userCommentText || "");
        const wbPrompt = wbBlocks.formattedAll;

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

${wbPrompt ? `[🚨 相关世界书背景设定]\n${wbPrompt}\n\n[🚨 极其重要：世界书设定绝对最高优先 🚨]\n必须100%强制遵循上述世界书词条！如果其中要求了特殊语气词或口癖，必须在评论回复中体现。\n\n` : ""}Existing Comments on this Moment:
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
          let cleanedReply = cleanOnlineMessage(response.text.trim(), true);
          cleanedReply = cleanedReply.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

          // Clean up any existing AI-generated reply prefix to prevent duplication
          cleanedReply = cleanedReply.replace(/^回复\s*[\(（].*?[\)）]\s*[:：]\s*/, "");
          cleanedReply = cleanedReply.replace(/^回复\s*.*?\s*[:：]\s*/, "");

          // Since the friend is replying to the user, the prefix must be 回复${settings.name}：
          const finalReply = `回复${settings.name}：${cleanedReply}`;

          const newComment: MomentComment = {
            id: `${Date.now()}-reply-${Math.random().toString(36).substr(2, 5)}`,
            authorName: friend.remark || friend.name,
            authorAvatar: friend.avatar,
            content: finalReply,
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
      const contextLimit = friend.contextMemoryLimit || 20;
      const slicedMsgs = friendMsgs.slice(-contextLimit * 2);
      const archivedMemories = (memories || [])
        .filter((memory) => memory.characterId === friend.id)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, recallSettings?.recallCount || 5);
      const historicalFallback = friendMsgs.slice(-(friend.retrievalHistoryLimit || 100));
      const fullWorldBook = getFullCharacterWorldBook(worldBookEntries || [], friend.id);

      const history = slicedMsgs.map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.content,
      }));

      const systemInstruction = `You are roleplaying as "${friend.name}".
Character Profile:
- Personality: ${friend.personality}
- Background: ${friend.backstory}

Memory source policy, in strict order: do not make up events, dates, shared experiences, or emotions that are not supported below.
1. Recent real-time conversation (highest priority, ${contextLimit} rounds):
${slicedMsgs.length > 0 ? slicedMsgs.map(m => `* ${m.sender === "user" ? "User" : friend.name}: ${m.content}`).join("\n") : "(No recent chat)"}
2. Long-term archived summaries:
${archivedMemories.length ? archivedMemories.map(m => `* ${m.content}`).join("\n") : "(No archived summaries)"}
3. Historical fallback (only if the above has no usable material; capped at ${friend.retrievalHistoryLimit || 100} messages):
${historicalFallback.length > 0 ? historicalFallback.map(m => `* ${m.sender === "user" ? "User" : friend.name}: ${m.content}`).join("\n") : "(No historical chat)"}
4. Complete active world book (always obey):
${fullWorldBook || "(No world book entries)"}

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
4. Write in first person only. Do NOT use OOC tags, narration brackets, AI labels, image captions, or talk like an AI. Just output the text of the Moment post.
5. Do NOT include any parenthesized meta-narration or action descriptions like "(凌晨两点 范千发了条朋友圈)" or "(配图：...)" at the start.
6. Do NOT write mock self-comments like "(评论区自己补了一条：...)" inside parentheses. If you want to add a self-comment under your own post, write it at the very end of your response as a separate line starting with "评论：" (e.g. "评论：别猜了 没说是谁 困了 睡觉"), we will automatically publish it as a real comment under your post.
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

        const parsed = cleanAndExtractMoment(cleanedContent);

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
          content: parsed.content,
          timestamp: Date.now(),
          likes: [],
          comments: parsed.selfComments.map((text, idx) => ({
            id: `${Date.now()}-self-comment-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            authorName: friend.remark || friend.name,
            authorAvatar: friend.avatar,
            content: text,
            timestamp: Date.now() + (idx + 1) * 1000,
          })),
          image: momentImage,
          imageType: momentImage ? "photo" : undefined,
        };

        onAddMoment(newMo);
        onSaveMemories([{
          id: `${Date.now()}-moment-memory-${Math.random().toString(36).slice(2, 6)}`,
          characterId: friend.id,
          content: `【朋友圈动态】${parsed.content}${momentImage ? "（发布时附有配图）" : ""}`,
          timestamp: Date.now(),
          importance: 4,
          isManual: false,
        }, ...(memories || [])]);
      }
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
    if (!momentInputText.trim() && !momentAttachedImage && !momentTextImageDescription.trim()) return;

    const newMo: Moment = {
      id: Date.now().toString(),
      authorName: settings.name,
      authorAvatar: settings.avatar,
      content: momentInputText.trim(),
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
    const finalContent = `${prefix}${text.trim()}`;

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

  // Active chat threads list builder
  const chatThreads = characters
    .filter((char) => {
      if (char.isGroupChat) {
        const threadMsgs = messages.filter((m) => m.characterId === char.id && !m.isOffline);
        const hasMessages = threadMsgs.length > 0;
        const isInitiated = initiatedChatIds.includes(char.id);
        const isActive = char.id === activeChatCharId;
        return hasMessages || isInitiated || isActive;
      }
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
              #conv-screen .chat-bubble-self,
              #conv-screen .chat-bubble-other {
                position: relative !important;
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

              ${settings.bubbleBorderEnabled ? `
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
              `}

              ${settings.otherBubbleRadius !== undefined ? `
                #conv-screen .chat-bubble-other,
                #conv-screen .voice-message-bar.chat-bubble-other {
                  border-radius: ${settings.otherBubbleRadius}px !important;
                }
              ` : ''}

              ${settings.selfBubbleRadius !== undefined ? `
                #conv-screen .chat-bubble-self,
                #conv-screen .voice-message-bar.chat-bubble-self {
                  border-radius: ${settings.selfBubbleRadius}px !important;
                }
              ` : ''}

              ${settings.bubbleTailEnabled ? `
                #conv-screen .chat-bubble-self::after {
                  content: '' !important;
                  display: block !important;
                  position: absolute;
                  width: 0;
                  height: 0;
                  border-style: solid;
                  border-width: 6px;
                  border-color: transparent transparent transparent ${settings.selfBubbleBg || '#18181b'};
                  right: -11px;
                  ${settings.bubbleTailVertical === 'top' ? 'top: 8px; bottom: auto;' : settings.bubbleTailVertical === 'bottom' ? 'bottom: 8px; top: auto;' : 'top: calc(50% - 6px); bottom: auto;'}
                }

                #conv-screen .chat-bubble-other::after {
                  content: '' !important;
                  display: block !important;
                  position: absolute;
                  width: 0;
                  height: 0;
                  border-style: solid;
                  border-width: 6px;
                  border-color: transparent ${settings.otherBubbleBg || '#f4f4f5'} transparent transparent;
                  left: -11px;
                  ${settings.bubbleTailVertical === 'top' ? 'top: 8px; bottom: auto;' : settings.bubbleTailVertical === 'bottom' ? 'bottom: 8px; top: auto;' : 'top: calc(50% - 6px); bottom: auto;'}
                }
              ` : `
                #conv-screen .chat-bubble-self::after,
                #conv-screen .chat-bubble-other::after {
                  content: none !important;
                  display: none !important;
                }
              `}

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
                  ${activeCharacter.chatBg ? `background: url("${activeCharacter.chatBg}") center/cover no-repeat !important;` : 'background: transparent !important;'}
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
                <h2 className="text-[13px] font-bold text-slate-800 tracking-tight truncate header-title-name">
                  {activeCharacter.remark || activeCharacter.name}
                  {activeCharacter.isGroupChat && (
                    <span className="text-slate-400 font-normal ml-0.5">
                      ({1 + (activeCharacter.memberIds?.length || 0)})
                    </span>
                  )}
                </h2>
                {!activeCharacter.isGroupChat && (
                  <div className="flex items-center gap-0.5 character-status">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-indicator online animate-pulse" />
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setDraftRemark(activeCharacter.isGroupChat ? activeCharacter.name : (activeCharacter.remark || ""));
                  setDraftAvatar(activeCharacter.avatar);
                  setIsDeleteMemberMode(false);
                  setDraftIsPinned(activeCharacter.isPinned || false);
                  setDraftChatBg(activeCharacter.chatBg);
                  setDraftCustomCss(activeCharacter.customCss || "");
                  setDraftChatStylePreset(activeCharacter.chatStylePreset || "default");
                  setDraftEnableProactiveChat(activeCharacter.enableProactiveChat || false);
                  setDraftProactiveChatInterval(activeCharacter.proactiveChatInterval || 3);
                  setDraftProactiveStartTime(activeCharacter.proactiveStartTime || "09:00");
                  setDraftProactiveEndTime(activeCharacter.proactiveEndTime || "22:00");
                  setDraftDisableBracketActions(activeCharacter.disableBracketActions || false);
                  setDraftHistoryMemoryLimit(activeCharacter.historyMemoryLimit || 150);
                  setDraftContextMemoryLimit(activeCharacter.contextMemoryLimit || 20);
                  setDraftRetrievalHistoryLimit(activeCharacter.retrievalHistoryLimit || 100);
                  setDraftArchiveTemplateType(activeCharacter.archiveTemplateType || "refined");
                  setDraftAutoArchiveInterval(activeCharacter.autoArchiveInterval || 50);
                  setDraftEnableAutoArchive(activeCharacter.enableAutoArchive !== undefined ? activeCharacter.enableAutoArchive : (activeCharacter.enableAutoSummary || false));
                  setDraftEnableTimeAwareness(activeCharacter.enableTimeAwareness || false);
                  setDraftEnableAutoTranslate(activeCharacter.enableAutoTranslate || false);
                  setDraftMinimaxVoiceId(activeCharacter.minimaxVoiceId || "");
                  setDraftMinimaxSpeed(activeCharacter.minimaxSpeed !== undefined ? activeCharacter.minimaxSpeed : 1.0);
                  setDraftVoiceFrequency(activeCharacter.voiceFrequency || "medium");
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
                <div className="bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="relative shrink-0">
                    <RenderAvatar
                      src={draftAvatar || (activeCharacter.isGroupChat ? "👥" : activeCharacter.avatar)}
                      alt={activeCharacter.name}
                      name={activeCharacter.name}
                      className="w-16 h-16 rounded-2xl border border-slate-100 object-cover shrink-0 flex items-center justify-center text-3xl shadow-inner bg-slate-100 select-none"
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
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-base font-bold text-slate-800 truncate">
                      {activeCharacter.isGroupChat ? "群聊名称设置" : activeCharacter.name}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={draftRemark}
                        onChange={(e) => setDraftRemark(e.target.value)}
                        placeholder={activeCharacter.isGroupChat ? "输入新群名..." : "设置备注昵称..."}
                        className="w-full bg-slate-50 px-3 py-1.5 rounded-[8px] border border-slate-200 focus:outline-none text-xs text-slate-600 placeholder-slate-400 font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Group Members List for Group Chats */}
                {activeCharacter.isGroupChat && (
                  <div className="bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm space-y-3">
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

                {/* Operations Group Card */}
                <div className="bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm space-y-4 text-xs">
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
                          className={`py-1.5 px-2 rounded-[16px] border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
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
                          className={`py-1.5 px-2 rounded-[16px] border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
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

                    {/* Auto Translate Toggle */}
                    <div className="flex items-center justify-between py-3 border-t border-slate-100">
                      <div className="space-y-0.5">
                        <span className="text-[#52525b] font-bold text-xs">全部自动翻译</span>
                        <span className="text-[10px] text-slate-400 block">对方发言非中文时，启用后自动将对方的发言翻译为中文</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftEnableAutoTranslate}
                          onChange={(e) => setDraftEnableAutoTranslate(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                      </label>
                    </div>

                    {/* Chat Background customizer */}
                    <div className="py-3 space-y-2 border-t border-slate-100">
                      <span className="text-[#52525b] font-bold block text-xs">专属背景壁纸</span>
                      {draftChatBg ? (
                        <div className="relative group rounded-[16px] overflow-hidden border border-slate-200 bg-slate-50 h-24 flex items-center justify-center">
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
                        <label className="cursor-pointer flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100/50 p-4 rounded-[16px] text-xs transition-colors group">
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

                     {/* Three-Layer Memory Optimization System Panel */}
                    <div className="py-4 space-y-4 border-t border-slate-100">
                      <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
                        <span className="text-slate-800 font-bold text-sm">三层记忆隔离与优化配置</span>
                      </div>

                      {/* Token Preview Badge Container */}
                      <div className="bg-neutral-50 border border-neutral-100 p-4 rounded-[16px] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-800">
                            单次 Prompt 预估消耗预览
                          </span>
                          <span className="text-xs font-bold text-neutral-900 font-mono bg-neutral-200/50 px-2.5 py-0.5 rounded-full">
                            ~{estimatedTokens.total} Tokens
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[10px] text-neutral-600 font-medium font-mono">
                          <div className="bg-white p-2 rounded-[12px] border border-neutral-100 text-center">
                            <span className="block text-neutral-400 text-[9px] mb-0.5">短期上下文</span>
                            <span className="font-bold text-neutral-800">~{estimatedTokens.context} t</span>
                          </div>
                          <div className="bg-white p-2 rounded-[12px] border border-neutral-100 text-center">
                            <span className="block text-neutral-400 text-[9px] mb-0.5">深度记忆库</span>
                            <span className="font-bold text-neutral-800">~{estimatedTokens.retrieval} t</span>
                          </div>
                          <div className="bg-white p-2 rounded-[12px] border border-neutral-100 text-center">
                            <span className="block text-neutral-400 text-[9px] mb-0.5">人设与常驻</span>
                            <span className="font-bold text-neutral-800">~{estimatedTokens.persona} t</span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 1: Short-term Context */}
                      <div className="space-y-3.5 p-4 bg-neutral-50/80 rounded-[16px] border border-neutral-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[#18181b] font-bold text-xs">短期实时上下文</span>
                          <span className="text-xs font-bold text-neutral-800 font-mono bg-white px-2.5 py-0.5 rounded-full border border-neutral-100">
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
                            className="w-full accent-black h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[8px] text-neutral-400 font-mono">
                            <span>10轮</span>
                            <span>20轮(默认)</span>
                            <span>35轮</span>
                            <span>50轮</span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 2: Long-term History Retrieval Pool */}
                      <div className="space-y-3.5 p-4 bg-neutral-50/80 rounded-[16px] border border-neutral-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[#18181b] font-bold text-xs">长期历史检索池</span>
                          <span className="text-xs font-bold text-neutral-800 font-mono bg-white px-2.5 py-0.5 rounded-full border border-neutral-100">
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
                            className="w-full accent-black h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[8px] text-neutral-400 font-mono">
                            <span>10条</span>
                            <span>50条</span>
                            <span>100条(默认)</span>
                            <span>150条</span>
                            <span>200条</span>
                          </div>
                        </div>
                      </div>

                      {/* Layer 3: Long-term Archived Memory */}
                      <div className="space-y-3.5 p-4 bg-neutral-50/80 rounded-[16px] border border-neutral-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[#18181b] font-bold text-xs">对话后台自动归档</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-neutral-800 font-mono bg-white px-2.5 py-0.5 rounded-full border border-neutral-100">
                              {draftEnableAutoArchive ? `${draftAutoArchiveInterval} 轮` : "已关闭"}
                            </span>
                            <input
                              type="checkbox"
                              checked={draftEnableAutoArchive}
                              onChange={(e) => setDraftEnableAutoArchive(e.target.checked)}
                              className="rounded border-slate-300 text-neutral-900 focus:ring-neutral-950 w-3.5 h-3.5 accent-black cursor-pointer"
                            />
                          </div>
                        </div>

                        <div className={`space-y-1 transition-opacity ${draftEnableAutoArchive ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                          <input
                            type="range"
                            min={10}
                            max={100}
                            step={10}
                            value={draftAutoArchiveInterval}
                            onChange={(e) => setDraftAutoArchiveInterval(parseInt(e.target.value))}
                            disabled={!draftEnableAutoArchive}
                            className="w-full accent-black h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[8px] text-neutral-400 font-mono">
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
                              ? "bg-neutral-100 text-neutral-400 cursor-not-allowed border border-neutral-200"
                              : "bg-neutral-900 hover:bg-neutral-800 text-white shadow-sm"
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

                    {/* MiniMax Character-specific Voice Settings */}
                    <div className="py-3.5 space-y-3 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[#52525b] font-bold text-xs">MiniMax 专属语音声线</span>
                        <span className="text-[9px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded-full">当前角色</span>
                      </div>
                      
                      <div className="space-y-2">
                        {/* Manual Text Input */}
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-1">填入 VOICE ID</label>
                          <input
                            type="text"
                            value={draftMinimaxVoiceId}
                            onChange={(e) => setDraftMinimaxVoiceId(e.target.value)}
                            placeholder="请输入 MiniMax Voice ID"
                            className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-xs text-slate-700 font-semibold placeholder-slate-400 focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 focus:outline-none"
                          />
                        </div>

                        {/* Speed Tuning Slider */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-semibold">专属语速调节</span>
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

                        {/* Voice Frequency Selector */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-semibold">动态语音发送频率</span>
                            <span className="text-[9px] text-slate-500 font-medium">智能多维度切换</span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { label: "无 (文字)", value: "none" },
                              { label: "低频", value: "low" },
                              { label: "中频 (默认)", value: "medium" },
                              { label: "高频", value: "high" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setDraftVoiceFrequency(opt.value as any)}
                                className={`py-1.5 rounded-[8px] text-[10px] font-bold transition-all border ${
                                  draftVoiceFrequency === opt.value
                                    ? "bg-neutral-900 border-neutral-900 text-white shadow-sm"
                                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[8px] text-slate-400 leading-normal">
                            智能判断消息形式。内向稳重角色低频、活泼外放角色高频。
                            深夜闲聊、亲密撒娇提升几率；严肃正事、长篇叙事降低几率。
                            自动跟随用户近期发语音/文字的习惯并附带真人随机浮动。
                          </p>
                        </div>
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
                        className="w-full bg-slate-50 p-4 text-[10px] text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono leading-relaxed h-48"
                      />
                    </div>

                    {/* Proactive Chat Toggles */}
                    <div className="py-3.5 space-y-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[#52525b] font-bold text-xs block">主动联络</span>
                          <span className="text-[10px] text-slate-400 block">设置时间段后，对方会在时间段内随机主动发送信息（支持设置 00:00-00:00 为全天随时）</span>
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
                            <span className="text-[11px] text-[#52525b] font-medium">联络时间段设置</span>
                            <span className="text-xs font-bold text-slate-700 font-mono">
                              {draftProactiveStartTime} - {draftProactiveEndTime}
                            </span>
                          </div>
                          
                          {/* Time Picker Dropdowns */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex flex-col flex-1">
                              <span className="text-[9px] text-slate-400 font-bold mb-1">开始时间</span>
                              <select
                                value={draftProactiveStartTime}
                                onChange={(e) => setDraftProactiveStartTime(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-xs text-slate-700 font-medium font-mono focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 focus:outline-none"
                              >
                                {Array.from({ length: 48 }, (_, i) => {
                                  const h = Math.floor(i / 2).toString().padStart(2, "0");
                                  const m = (i % 2 === 0 ? "00" : "30");
                                  const t = `${h}:${m}`;
                                  return (
                                    <option key={t} value={t}>{t}</option>
                                  );
                                })}
                              </select>
                            </div>
                            <span className="text-xs text-slate-400 font-bold self-end mb-2">至</span>
                            <div className="flex flex-col flex-1">
                              <span className="text-[9px] text-slate-400 font-bold mb-1">结束时间</span>
                              <select
                                value={draftProactiveEndTime}
                                onChange={(e) => setDraftProactiveEndTime(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-1.5 text-xs text-slate-700 font-medium font-mono focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 focus:outline-none"
                              >
                                {Array.from({ length: 48 }, (_, i) => {
                                  const h = Math.floor(i / 2).toString().padStart(2, "0");
                                  const m = (i % 2 === 0 ? "00" : "30");
                                  const t = `${h}:${m}`;
                                  return (
                                    <option key={t} value={t}>{t}</option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-[16px] border border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-400 leading-snug">
                              Ta 将在此时间段内随机主动给您发送消息。若设为 00:00 - 00:00 则为全天候随机发信。
                            </span>
                            <button
                              type="button"
                              onClick={handleTriggerProactiveMessage}
                              disabled={isTriggeringProactive}
                              className="shrink-0 px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-[16px] text-[9px] transition-colors shadow-sm disabled:opacity-50"
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
                      className="w-full py-3 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-[16px] text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
                    >
                      保存设置
                    </button>
                    
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowClearHistoryModal(true)}
                        className="text-xs text-red-500 hover:text-red-600 font-medium py-1 px-4 rounded-[16px] hover:bg-red-50/50 transition-colors"
                      >
                        清空对话记录
                      </button>

                      {activeCharacter.isGroupChat && (
                        <button
                          type="button"
                          onClick={() => setShowDisbandGroupModal(true)}
                          className="text-xs text-red-600 hover:text-red-700 font-bold py-1 px-4 rounded-[16px] hover:bg-red-50/80 transition-colors flex items-center gap-1"
                        >
                          解除群聊
                        </button>
                      )}
                    </div>
                  </div>
                </div>
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
                            onClearMessages(activeChatCharId);
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
                              onClearMessages(activeChatCharId);
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
            </div>
          )}

          {/* Active Chat Messages body */}

          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 cv-messages-list"
            style={{
              background: activeCharacter.chatBg
                ? `url(${activeCharacter.chatBg}) center/cover no-repeat`
                : undefined,
              WebkitOverflowScrolling: "touch",
            }}
          >


            {currentChatMessages.map((msg, idx) => {
              // Calculate WeChat timestamp divider
              let showWeChatDivider = false;
              let dividerText = "";
              if (!isOfflineModeActive) {
                if (idx === 0) {
                  showWeChatDivider = true;
                  dividerText = formatWeChatTimestamp(msg.timestamp);
                } else {
                  const prevMsg = currentChatMessages[idx - 1];
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
                    <div className="w-full flex justify-center my-3.5 select-none animate-fade-in" id={`timestamp-divider-${msg.id}`}>
                      <div className="bg-black/5 dark:bg-white/10 text-[#888888] dark:text-stone-400 text-[11.5px] px-2.5 py-0.5 rounded-[4px] tracking-wide font-normal">
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
              const prevMsg = idx > 0 ? currentChatMessages[idx - 1] : null;
              const shouldCollapse = settings.collapseConsecutiveAvatars !== false;
              const isConsecutivePrev = !!(
                prevMsg &&
                !prevMsg.isNarration &&
                !msg.isNarration &&
                prevMsg.sender === msg.sender &&
                (msg.sender === "user" || !activeCharacter.isGroupChat || (!!msg.senderId && !!prevMsg.senderId && prevMsg.senderId === msg.senderId))
              );
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
                    {/* Actual chat bubble */}
                    <div className="max-w-full">
                      {msg.content.startsWith("data:image/") ? (
                        <img
                          src={msg.content}
                          alt="chat-pic"
                          className="max-w-[160px] rounded-lg border object-cover cursor-zoom-in shadow-sm bg-stone-100"
                        />
                      ) : msg.content.startsWith("[表情]|") ? (() => {
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
                      })() : msg.content.startsWith("[红包]") ? (() => {
                        const [_, amount, greeting] = msg.content.split("|");
                        const status = getRedPacketActualStatus(msg.id, msg.timestamp, msg.sender);
                        
                        let cardBg = "bg-[#fa9d3b] hover:brightness-[1.03] text-white";
                        let ribbonBg = "bg-[#f4932d] text-[#ffeada]/75 border-t border-[#fa9d3b]";
                        let iconBg = "bg-[#f35543] text-yellow-300";
                        let titleColor = "text-white font-bold";
                        let actionText = "查看红包";
                        let ribbonText = "微信红包";

                        if (status === "claimed") {
                          cardBg = "bg-[#fa9d3b]/55 text-white/70";
                          ribbonBg = "bg-[#e18b2b]/40 text-[#ffeada]/50 border-t border-[#fa9d3b]/20";
                          iconBg = "bg-[#f35543]/40 text-yellow-300/40";
                          titleColor = "text-white/60 font-semibold";
                          actionText = isSelf ? "红包已被领完" : "已领入零钱";
                          ribbonText = "微信红包 · 已拆开";
                        } else if (status === "expired" || status === "refunded") {
                          cardBg = "bg-slate-200 text-slate-500 hover:bg-slate-200/90";
                          ribbonBg = "bg-slate-300/60 text-slate-400 border-t border-slate-200";
                          iconBg = "bg-slate-300 text-slate-400";
                          titleColor = "text-slate-400 font-normal";
                          actionText = "红包已过期";
                          ribbonText = "微信红包 · 已失效";
                        } else {
                          actionText = isSelf ? "等待对方拆开" : "点击拆红包";
                        }

                        return (
                          <div 
                            onClick={() => {
                              const packetAmount = amount || "8.88";
                              const char = characters.find(c => c.id === msg.characterId);
                              const senderName = char?.remark || char?.name || "未知好友";
                              const senderAvatar = char?.avatar || "🧧";
                              
                              setOpenRedPacketDetail({
                                id: msg.id,
                                amount: packetAmount,
                                greeting: greeting || "恭喜发财",
                                senderName,
                                senderAvatar,
                                sender: msg.sender as "user" | "character",
                                timestamp: msg.timestamp
                              });
                              setShowRedPacketOpenModal(true);
                            }}
                            className={`${cardBg} rounded-2xl w-56 overflow-hidden cursor-pointer shadow-md transition-all flex flex-col active:scale-[0.99] select-none cv-transfer`}
                          >
                            <div className="p-3.5 flex items-center gap-3">
                              <div className={`w-9 h-9 ${iconBg} rounded-full flex items-center justify-center text-lg leading-none shrink-0 font-bold shadow-inner`}>
                                🧧
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <p className={`text-xs ${titleColor} truncate`}>{greeting || "恭喜发财，万事如意"}</p>
                                <p className="text-[10px] mt-1 font-bold tracking-wide">{actionText}</p>
                              </div>
                            </div>
                            <div className={`px-3.5 py-1.5 ${ribbonBg} text-[9px] font-bold flex items-center justify-between select-none`}>
                              <span>{ribbonText}</span>
                            </div>
                          </div>
                        );
                      })() : msg.content.startsWith("[转账]") ? (() => {
                        const [_, amount, memo, isConfirmedStr] = msg.content.split("|");
                        const isConfirmed = isConfirmedStr === "true";
                        return (
                          <div 
                            onClick={() => {
                              setOpenTransferDetail({ amount: amount || "100.00", memo: memo || "转账", isConfirmed });
                              setShowTransferDetailModal(true);
                            }}
                            className={`bg-[#fdfcfb] border border-[#f5ebe0]/40 text-stone-800 rounded-2xl w-56 overflow-hidden cursor-pointer shadow-sm hover:bg-[#faf5f0] transition-all flex flex-col active:scale-[0.99] select-none cv-transfer ${
                              isSelf ? "transfer-card" : "received-transfer-card"
                            }`}
                          >
                            <div className="p-3.5 flex items-center gap-3 cv-transfer-body transfer-body">
                              <div className={`w-9 h-9 ${isConfirmed ? "bg-orange-500/10 text-orange-500" : "bg-amber-500/10 text-amber-500"} rounded-full flex items-center justify-center text-lg leading-none shrink-0 font-bold shadow-inner cv-transfer-status transfer-icon confirm-icon`}>
                                💸
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <p className="text-xs font-bold text-stone-800 truncate">¥{amount || "100.00"}</p>
                                <p className="text-[10px] text-stone-400 mt-0.5 truncate">{memo || "转账"}</p>
                              </div>
                            </div>
                            <div className="px-3.5 py-2 bg-stone-50 text-stone-400 text-[9px] font-bold flex items-center justify-between border-t border-orange-50 cv-transfer-ribbon transfer-status select-none">
                              <span className="font-semibold text-stone-400">微信转账</span>
                              <span className={`font-semibold ${isConfirmed ? "text-green-600" : "text-amber-600"}`}>
                                {isConfirmed ? "已收钱" : "待接收"}
                              </span>
                            </div>
                          </div>
                        );
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
                          ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-self" : "bg-[#95ec69] text-[#191919] chat-bubble-self rounded-tr-sm")
                          : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other rounded-tl-sm border border-slate-100");

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
                                className={`flex items-center gap-2 px-3 py-1.5 shadow-sm cv-bubble message-bubble voice-message-bar cursor-pointer select-none transition-all duration-200 hover:shadow-md active:scale-[0.98] relative ${bubbleBgAndShape}`}
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
                                    ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-self" : "bg-blue-500 text-white chat-bubble-self rounded-tr-sm")
                                    : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-other" : "bg-white text-slate-800 chat-bubble-other rounded-tl-sm border border-slate-100")
                                } ${isSelf ? "self-end" : "self-start"}`}
                              >
                                <div className="text-left">{voiceText || "（空白语音内容）"}</div>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <div
                          className={`px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed shadow-sm cv-bubble message-content message-bubble relative group/bubble ${
                            isSelf
                              ? (isFloatingCute ? "bg-[#f2f2f2] text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-self pr-6" : "bg-blue-500 text-white chat-bubble-self rounded-tr-sm pr-6")
                              : (isFloatingCute ? "bg-white text-[#222] border border-slate-300/60 rounded-[18px] chat-bubble-other pr-6" : "bg-white text-slate-800 chat-bubble-other rounded-tl-sm border border-slate-100 pr-6")
                          }`}
                        >
                          <div className="text-left">{msg.content}</div>
                          {msg.translation && (
                            <>
                              <div className={`my-1.5 border-t border-dashed ${isSelf ? "border-white/20" : "border-stone-200"}`} />
                              <div className={`text-left text-[11px] leading-relaxed ${isSelf ? "text-white/90" : "text-stone-500"}`}>
                                {msg.translation}
                              </div>
                            </>
                          )}

                          <div className="cv-bubble-tail hidden" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              };

              if (settings.bubblePosition === "above" || settings.bubblePosition === "below") {
                return wrapMessageWithDivider(
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
                        <RenderAvatar
                          src={isSelf ? settings.avatar : msgAvatar}
                          alt=""
                          name={isSelf ? settings.name : msgName}
                          onClick={() => {
                            if (!isSelf) {
                              setSingleCharacterMomentsId(groupSenderChar ? groupSenderChar.id : activeCharacter.id);
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
                    } cv-msg-row message message-container`}
                  >
                    {/* Avatar */}
                    {showAvatar ? (
                      <RenderAvatar
                        src={isSelf ? settings.avatar : msgAvatar}
                        alt=""
                        name={isSelf ? settings.name : msgName}
                        onClick={() => {
                          if (!isSelf) {
                            setSingleCharacterMomentsId(groupSenderChar ? groupSenderChar.id : activeCharacter.id);
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
                const typingChar = typingCharacterOverride || activeCharacter;
                const typingName = typingChar.remark || typingChar.name;
                return (
                  <div className={`w-full flex flex-col items-start ${isTypingConsecutive ? "mt-1.5" : "mt-4.5"} cv-msg-row message message-container`}>
                    {!isTypingConsecutive && (
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
                onClick={() => {
                  setShowAttachPanel(!showAttachPanel);
                  setShowStickerSelector(false);
                }}
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
                className={`flex-1 h-10 border focus:outline-none rounded-[8px] px-4 text-xs text-slate-800 chat-input ${
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
                    <Mic className="w-4 h-4 text-slate-700" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-semibold scale-90">语音</span>
                </button>

                {/* 5. 电话 (Phone) */}
                <button
                  type="button"
                  onClick={() => {
                    setShowCallingDirectionModal(true);
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
                    setShowStickerSelector(true);
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
                              sendCustomMessage(`[表情]|${sticker.name}|${sticker.url}`);
                              setShowStickerSelector(false);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (confirm(`确认要在分组中删除表情“${sticker.name}”吗？`)) {
                                stickerDb.deleteStickerImage(sticker.id).then(() => {
                                  const updatedStickers = currentGroup.stickers.filter(s => s.id !== sticker.id);
                                  const updatedGroup = { ...currentGroup, stickers: updatedStickers };
                                  stickerDb.saveGroup(updatedGroup).then(() => {
                                    const updated = [...stickerGroups];
                                    updated[activeStickerGroupIndex] = updatedGroup;
                                    setStickerGroups(updated);
                                  });
                                });
                              }
                            }}
                            onTouchStart={(e) => {
                              const target = e.currentTarget;
                              const timer = setTimeout(() => {
                                if (confirm(`确认要在分组中删除表情“${sticker.name}”吗？`)) {
                                  stickerDb.deleteStickerImage(sticker.id).then(() => {
                                    const updatedStickers = currentGroup.stickers.filter(s => s.id !== sticker.id);
                                    const updatedGroup = { ...currentGroup, stickers: updatedStickers };
                                    stickerDb.saveGroup(updatedGroup).then(() => {
                                      const updated = [...stickerGroups];
                                      updated[activeStickerGroupIndex] = updatedGroup;
                                      setStickerGroups(updated);
                                    });
                                  });
                                }
                              }, 800);
                              target.dataset.longPressTimer = String(timer);
                            }}
                            onTouchEnd={(e) => {
                              const timer = e.currentTarget.dataset.longPressTimer;
                              if (timer) clearTimeout(Number(timer));
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
                        localStorage.setItem("wechat_wallet_balance", next.toFixed(2));
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
            const status = getRedPacketActualStatus(openRedPacketDetail.id, openRedPacketDetail.timestamp, openRedPacketDetail.sender);
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
                              updateRedPacketStatus(openRedPacketDetail.id, "claimed");
                              // Deposit money
                              const parsed = parseFloat(openRedPacketDetail.amount);
                              if (!isNaN(parsed)) {
                                setWalletBalance(prev => {
                                  const next = prev + parsed;
                                  localStorage.setItem("wechat_wallet_balance", next.toFixed(2));
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
            <div className="absolute inset-0 bg-stone-950 z-50 flex flex-col justify-between p-6 animate-fade-in text-white text-center">
              <div className="space-y-4 mt-8 shrink-0">
                <img 
                  src={activeCharacter.avatar} 
                  alt="" 
                  className="w-20 h-20 rounded-full mx-auto border-2 border-white/25 object-cover shadow-2xl animate-pulse" 
                />
                <div>
                  <h3 className="text-md font-black">{activeCharacter.remark || activeCharacter.name}</h3>
                  <p className="text-xs text-white/50 mt-1">
                    {callingStatus === "connected" 
                      ? "语音通话中..." 
                      : isIncomingCall 
                        ? "邀请你进行语音通话..." 
                        : "等待对方接通..."}
                  </p>
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
                <div className="flex-1 my-4 bg-white/5 rounded-[20px] p-3 flex flex-col overflow-hidden border border-white/5">
                  <div className="text-[10px] text-white/30 mb-2 font-semibold">通话实时字幕</div>
                  
                  {/* Messages list inside the call */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left scrollbar-thin">
                    {currentChatMessages
                      .filter(m => m.timestamp >= callStartTime)
                      .map((msg) => {
                        const isSelfMsg = msg.sender === "user";
                        const isVoice = msg.content.startsWith("[语音]|");
                        let contentToDisplay = msg.content;
                        if (isVoice) {
                          contentToDisplay = msg.content.split("|").slice(2).join("|") || "[语音]";
                        }
                        
                        return (
                          <div 
                            key={msg.id} 
                            className={`flex ${isSelfMsg ? "justify-end" : "justify-start"} animate-fade-in`}
                          >
                            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                              isSelfMsg 
                                ? "bg-emerald-600/80 text-white" 
                                : "bg-white/10 text-white border border-white/5"
                            }`}>
                              {isVoice && <span className="mr-1">🎙️</span>}
                              <span>{contentToDisplay}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Connected bottom inputs */}
                  <div className="mt-2 border-t border-white/10 pt-3 space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="text"
                        value={callingInputText}
                        onChange={(e) => setCallingInputText(e.target.value)}
                        placeholder="在此输入文字，可转为文字或语音发送..."
                        className="flex-1 bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-white/30 border border-white/10 rounded-[14px] px-3 py-2 text-xs outline-none transition-all"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && callingInputText.trim()) {
                            const text = callingInputText.trim();
                            const userMsg: Message = {
                              id: Date.now().toString(),
                              characterId: activeChatCharId,
                              sender: "user",
                              content: text,
                              timestamp: Date.now(),
                            };
                            onSendMessage(userMsg);
                            generateResponseForUserMessage(userMsg);
                            setCallingInputText("");
                          }
                        }}
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Hang up (red circular button) */}
                      <button
                        onClick={() => {
                          const mins = Math.floor(callingDuration / 60).toString().padStart(2, "0");
                          const secs = (callingDuration % 60).toString().padStart(2, "0");
                          sendCustomMessage(`[语音通话]|通话已结束 ${mins}:${secs}`);
                          setActiveAttachModal(null);
                        }}
                        className="w-10 h-10 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 shrink-0"
                        title="挂断"
                      >
                        <X className="w-5 h-5 text-white" />
                      </button>
                      
                      {/* Button 1: 发送文字 */}
                      <button
                        onClick={() => {
                          if (!callingInputText.trim()) return;
                          const text = callingInputText.trim();
                          const userMsg: Message = {
                            id: Date.now().toString(),
                            characterId: activeChatCharId,
                            sender: "user",
                            content: text,
                            timestamp: Date.now(),
                          };
                          onSendMessage(userMsg);
                          generateResponseForUserMessage(userMsg);
                          setCallingInputText("");
                        }}
                        disabled={!callingInputText.trim()}
                        className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold rounded-[14px] text-xs transition-all disabled:opacity-40"
                      >
                        发送文字
                      </button>
                      
                      {/* Button 2: 发送语音 */}
                      <button
                        onClick={() => {
                          if (!callingInputText.trim()) return;
                          const text = callingInputText.trim();
                          const secs = Math.max(1, Math.min(60, Math.ceil(text.length * 0.35 + 1.2)));
                          const userMsg: Message = {
                            id: Date.now().toString(),
                            characterId: activeChatCharId,
                            sender: "user",
                            content: `[语音]|${secs}|${text}`,
                            timestamp: Date.now(),
                          };
                          onSendMessage(userMsg);
                          generateResponseForUserMessage(userMsg);
                          setCallingInputText("");
                        }}
                        disabled={!callingInputText.trim()}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-[14px] text-xs transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                      >
                        <Mic className="w-3 h-3" />
                        <span>发送语音</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Ringing Screen middle spacer */
                <div className="flex-1 flex items-center justify-center">
                  <div className="space-y-2">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto border border-emerald-500/20 animate-ping absolute opacity-40" style={{ animationDuration: "2s" }} />
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto border border-emerald-500/30">
                      <Phone className="w-6 h-6 text-emerald-400 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}

              {/* Ringing Action Controls */}
              {callingStatus === "ringing" && (
                <div className="space-y-12 mb-8 shrink-0">
                  {isIncomingCall ? (
                    <div className="flex justify-around items-center px-6">
                      {/* Decline (Incoming Call) */}
                      <button
                        onClick={() => {
                          sendCustomMessage(`[语音通话]|已拒绝`);
                          setActiveAttachModal(null);
                        }}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95">
                          <X className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-[10px] text-white/70">挂断</span>
                      </button>

                      {/* Accept (Incoming Call) */}
                      <button
                        onClick={() => {
                          setCallingStatus("connected");
                          setCallStartTime(Date.now());
                        }}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="w-14 h-14 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center shadow-lg transition-all animate-bounce active:scale-95">
                          <Phone className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-[10px] text-white/70">接听</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      {/* Cancel (User Outgoing Call) */}
                      <button
                        onClick={() => {
                          sendCustomMessage(`[语音通话]|已取消`);
                          setActiveAttachModal(null);
                        }}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95">
                          <X className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-[10px] text-white/70">取消</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Calling Direction Choose Modal */}
          {showCallingDirectionModal && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-end justify-center animate-fade-in" onClick={() => setShowCallingDirectionModal(false)}>
              <div 
                className="bg-white rounded-t-[28px] w-full max-w-md p-6 pb-8 space-y-4 animate-slide-up text-slate-800"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-1">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">选择通话类型</span>
                  <button 
                    onClick={() => setShowCallingDirectionModal(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Option 1: Active Call */}
                  <button
                    onClick={() => {
                      setIsIncomingCall(false);
                      setCallingStatus("ringing");
                      setActiveAttachModal("calling");
                      setShowCallingDirectionModal(false);
                    }}
                    className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-99 transition-all text-left flex items-center gap-3 border border-slate-100"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">拨打语音电话</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">向对方发起通话，等待对方接听（3秒后自动模拟接通）</p>
                    </div>
                  </button>

                  {/* Option 2: Passive Incoming Call */}
                  <button
                    onClick={() => {
                      setIsIncomingCall(true);
                      setCallingStatus("ringing");
                      setActiveAttachModal("calling");
                      setShowCallingDirectionModal(false);
                    }}
                    className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-99 transition-all text-left flex items-center gap-3 border border-slate-100"
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">模拟对方来电</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">立即产生一个对方拨打给你的来电，可选择接听或挂断</p>
                    </div>
                  </button>
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
                <button
                  onClick={() => {
                    setGroupNameInput("");
                    setSelectedGroupMemberIds([]);
                    setShowCreateGroupModal(true);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-700 transition-colors shrink-0 z-10"
                  title="发起群聊"
                >
                  <Plus className="w-4 h-4 text-slate-700" />
                </button>
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
                      <RenderAvatar
                        src={character.avatar || (character.isGroupChat ? "👥" : "")}
                        alt={character.name}
                        name={character.remark || character.name}
                        className="w-11 h-11 rounded-full object-cover bg-slate-100 border border-slate-100 aspect-square flex items-center justify-center text-xl select-none"
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
                          {character.isGroupChat && (
                            <span className="text-slate-400 font-normal ml-1">
                              ({1 + (character.memberIds?.length || 0)})
                            </span>
                          )}
                        </h4>
                        {lastMessage && (
                          <span className="text-[9px] text-slate-400 font-medium">
                            {new Date(lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5 leading-normal">
                        {lastMessage ? (
                          character.isGroupChat ? (
                            (() => {
                              if (lastMessage.sender === "user") {
                                return `我: ${lastMessage.content}`;
                              }
                              const senderChar = characters.find(c => c.id === lastMessage.senderId);
                              const senderName = senderChar ? (senderChar.remark || senderChar.name) : "成员";
                              return `${senderName}: ${lastMessage.content}`;
                            })()
                          ) : (
                            lastMessage.content
                          )
                        ) : (
                          ""
                        )}
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
                          {mom.imageType === "text" && mom.imageDescription && (
                            <button
                              type="button"
                              onClick={() => setViewingImageDescription(mom.imageDescription || "")}
                              className="mt-2.5 max-w-[200px] min-h-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 px-4 py-3 text-left shadow-sm"
                            >
                              <ImageIcon className="w-4 h-4 text-slate-400 mb-4" />
                              <p className="text-xs leading-relaxed text-slate-600 line-clamp-3">{mom.imageDescription}</p>
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
                            <div className="bg-[#f7f7f7] rounded-[4px] p-2 text-[11px] mt-2 space-y-2">
                              {/* Likes list */}
                              {mom.likes.length > 0 && (
                                <div className="flex items-center gap-1.5 text-[#576b95] font-bold flex-wrap pb-1 border-b border-slate-200/40">
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
                                        onClick={() => {
                                          setReplyingToCommentMap(prev => ({ ...prev, [mom.id]: comm }));
                                          setShowCommentInputMap(prev => ({ ...prev, [mom.id]: true }));
                                        }}
                                        className="py-1.5 leading-relaxed text-slate-800 cursor-pointer transition-colors text-[11px] block text-left moments-comment-item"
                                        title={`回复 ${commAuthorName}`}
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
                            <Wallet className="w-5 h-5 text-emerald-500" />
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
                            <Smile className="w-5 h-5 text-indigo-500" />
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
                            <FolderHeart className="w-5 h-5 text-rose-500" />
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
                            const status = getRedPacketActualStatus(m.id, m.timestamp, m.sender);
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
                                localStorage.setItem("wechat_wallet_balance", next.toFixed(2));
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
                  <div className="px-4 py-1.5 bg-white sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 shrink-0">
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
                          {mom.imageType === "text" && mom.imageDescription && (
                            <button
                              type="button"
                              onClick={() => setViewingImageDescription(mom.imageDescription || "")}
                              className="mt-2.5 max-w-[200px] min-h-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 px-4 py-3 text-left shadow-sm"
                            >
                              <ImageIcon className="w-4 h-4 text-slate-400 mb-4" />
                              <p className="text-xs leading-relaxed text-slate-600 line-clamp-3">{mom.imageDescription}</p>
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
                            <div className="bg-[#f7f7f7] rounded-[4px] p-2 text-[11px] mt-2 space-y-2">
                              {/* Likes shelf details */}
                              {mom.likes.length > 0 && (
                                <div className="flex items-center gap-1.5 text-[#576b95] font-bold flex-wrap pb-1 border-b border-slate-200/40">
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
                                        onClick={() => {
                                          setReplyingToCommentMap(prev => ({ ...prev, [mom.id]: comm }));
                                          setShowCommentInputMap(prev => ({ ...prev, [mom.id]: true }));
                                        }}
                                        className="py-1.5 leading-relaxed text-slate-800 cursor-pointer transition-colors text-[11px] block text-left moments-comment-item"
                                        title={`回复 ${commAuthorName}`}
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
                    sender: "character",
                    isNarration: true,
                    content: `您邀请了 ${invitedNames} 加入了群聊`,
                    timestamp: Date.now() - 1000,
                  };
                  onSendMessage(initialNarration);

                  // Close and switch to the new group chat
                  setShowCreateGroupModal(false);
                  startChatWith(newGroupId);

                  // Automatically trigger welcoming greetings after a short delay
                  setTimeout(() => {
                    generateResponseForGroupChat(null, [initialNarration]);
                  }, 800);
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
