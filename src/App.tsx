import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { motion } from "motion/react";
import { apiChat, apiExtractMemories, apiTranslate } from "./utils/apiHelper";
import { audioDb, getTrackAudioAssetId } from "./utils/audioDb";
import { loadSettings, resolveSettingsUpdate, saveSettings } from "./core/storage/repositories/settingsRepository";
import { loadCharacters, saveCharacters } from "./core/storage/repositories/characterRepository";
import { loadMessages, saveMessages } from "./core/storage/repositories/messageRepository";
import { loadMoments, saveMoments } from "./core/storage/repositories/momentRepository";
import { recordDeletedCharacterMoment } from "./features/moments/services/momentGenerationGuard";
import { removeMemoriesForMoment } from "./features/moments/services/momentMemory";
import { sanitizeMomentPublishText } from "./features/moments/services/momentContent";
import { loadWorldBookEntries, saveWorldBookEntries } from "./core/storage/repositories/worldBookRepository";
import { loadMemories, loadMemorySettings, saveMemories, saveMemorySettings } from "./core/storage/repositories/memoryRepository";
import { loadOfflineStories, saveOfflineStories } from "./core/storage/repositories/offlineRepository";
import { loadRelationships, saveRelationships } from "./core/storage/repositories/relationshipRepository";
import { appendMany as appendKnowledgeClaims, loadKnowledgeClaims, retractBySourceMessageIds, retractBySourceStoryIds } from "./core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries, saveConversationSummaries, retractConversationSummariesBySourceMessageIds } from "./core/storage/repositories/conversationSummaryRepository";
import { loadBehaviorCorrections, saveBehaviorCorrections, retractBehaviorCorrectionsBySourceMessageIds } from "./core/storage/repositories/behaviorCorrectionRepository";
import { loadCharacterKnowledgeMigrationState, saveCharacterKnowledgeMigrationState } from "./core/storage/repositories/characterKnowledgeMigrationRepository";
import { loadInnerVoiceRecords, removeInnerVoicesByCharacter, saveInnerVoiceRecords } from "./core/storage/repositories/innerVoiceRepository";
import { loadCalendarEvents, saveCalendarEvents } from "./core/storage/repositories/calendarRepository";
import { loadPresets, savePresets } from "./core/storage/repositories/presetRepository";
import { cleanupForumDmForRelations, commitForumMutation, loadForumActivityTasks, loadForumActorStates, loadForumGenerationTasks, loadForumReplies, loadForumShares, loadForumThreads } from "./core/storage/repositories/forumRepository";
import { MemoryService, formatDelicateMemoryDiary, formatExtractedMemorySummary } from "./domain/memory/MemoryService";
import { migrateLegacyCharacterIdentityData, resolveCanonicalCharacterId } from "./domain/character/characterIdentity";
import { migrateLegacyRelationshipData } from "./domain/relationship/relationshipMigration";
import { removeCanonicalCharacterData } from "./domain/relationship/relationshipCleanup";
import { cleanupForumDataForDeletedCharacter } from "./domain/forum/forumShare";
import { cleanupDiaryForRelations } from "./domain/diary/diaryCleanup";
import { loadDiaryEntries, loadDiaryGenerationTasks, loadDiaryShares, loadDiaryTranslations, saveDiaryEntries, saveDiaryGenerationTasks, saveDiaryShares, saveDiaryTranslations } from "./core/storage/repositories/diaryRepository";
import { removeForumGenerationTasksByRelations } from "./domain/forum/forumGenerationGuard";
import { loadImageGenerationRecords, removeImageGenerationRecordsByCharacter, saveImageGenerationRecords } from "./core/storage/repositories/imageGenerationRepository";
import {
  bindDualMusicWidget,
  loadDualMusicWidgetConfigs,
  loadIdentityMusicStates,
  loadRelationshipMusicStates,
  removeMusicDataByRelations,
  removeMusicTrackReferences,
  saveDualMusicWidgetConfigs,
  saveIdentityMusicStates,
  saveRelationshipMusicStates,
  upsertIdentityMusicTrack,
} from "./core/storage/repositories/musicWidgetRepository";
import { imageAssetDb } from "./utils/imageAssetDb";
import { isTransparencyPreservedImage } from "./utils/pngParser";
import { DEFAULT_IDENTITY_ID, getConversationId, getOfflineModeStorageKey, getOfflineStoryStorageKey, type CharacterRelationship } from "./domain/relationship/characterRelationship";
import { messageMatchesMutationScope, type MessageMutationScope } from "./features/chat/context/directInteractionScope";
import { RED_PACKET_STATUSES_KEY, removePaymentStatusesByRelation, removePaymentStatusesForMessages, type RedPacketStatusMap } from "./features/chat/services/paymentScope";
import { Character, Message, Moment, UserSettings, StylePreset, MusicTrack, MusicPlaylist, CalendarEvent, WorldBookEntry, MomentComment, HomeScreenItem, MemoryItem, MemoryVaultSettings, ImmediateSummaryTask, OfflineStory, InnerVoiceRecord, type DualMusicWidgetConfig, type HomeScreenPosition, type IdentityMusicState, type RelationshipMusicState, type UserSettingsUpdate } from "./types";
import { 
  AlbumWidget, 
  CalendarAlbumWidget,
  MusicWidget,
  DualMusicWidget,
  AnniversaryWidget, 
  TodoWidget, 
  AddWidgetSheet 
} from "./components/HomeScreenWidgets";
import {
  HOME_GRID_COLUMNS,
  MAX_HOME_PAGES,
  canPlaceAt,
  findFirstAvailablePosition,
  getHomeGridPositionFromPoint,
  getHighestOccupiedPage,
  getHomeItemDimensions,
  getOverlappingItemIds,
  getResponsiveHomeGridRowCount,
  getVisibleHomePageCount,
  normalizeHomeScreenLayout,
  placeItemAt,
  placeItemWithDisplacement,
  swapOneByOneItems,
} from "./features/home/homeGrid";
import { applyRelationshipRecommendation, recommendDualMusicTrack } from "./features/music/services/dualMusicRecommendationService";
import { getMusicPlaybackAction, shouldRecordIdentityListening } from "./features/music/services/musicPlayback";
import { resolveDesktopBackground } from "./features/theme/desktopBackground";
import { useTheme } from "./features/theme/ThemeProvider";
import { useVisualViewport } from "./features/viewport/useVisualViewport";
import { removeCharacterLifeEventsForRelations } from "./features/characterLife/services/characterEventCaptureService";
import { retractByOfflineStoryIds } from "./core/storage/repositories/characterEventRepository";
import { removeCharacterTruthForRelations } from "./features/characterKnowledge/services/characterTruthCleanupService";
import { removeMomentTopicsForCharacters, removeMomentTopicsForMoments } from "./core/storage/repositories/momentTopicRepository";
import { removeProactiveTopicsForRelations, removeProactiveTopicsForCharacters } from "./core/storage/repositories/proactiveTopicRepository";
import { migrateLegacyCharacterKnowledge } from "./features/characterKnowledge/services/legacyCharacterKnowledgeMigration";
import { createConversationSummaryRecord } from "./features/characterKnowledge/services/conversationSummaryService";
import { CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION, CHARACTER_KNOWLEDGE_MIGRATION_VERSION } from "./domain/characterKnowledge/characterKnowledgeMigrationTypes";
import { isInternalDeliveryMarkerOnly } from "./features/chat/services/messageParser";
import StatusBar from "./components/StatusBar";
import AppChat from "./components/AppChat";
import AppArchives from "./components/AppArchives";
import AppWorldBook from "./components/AppWorldBook";
import AppMusic from "./components/AppMusic";
import AppForum from "./components/AppForum";
import AppStore from "./components/AppStore";
import AppSettings from "./components/AppSettings";
import AppNotes from "./components/AppNotes";
import AppDiary from "./components/AppDiary";
import AppMemory from "./components/AppMemory";
import { useForumActivityEngine } from "./features/forum/hooks/useForumActivityEngine";
import AppOffline from "./components/AppOffline";
import {
  BookOpen,
  Bookmark,
  CalendarDays,
  Cloud,
  ContactRound,
  Images,
  Layers3,
  MessageCircle,
  Music2,
  NotebookTabs,
  NotebookText,
  BookHeart,
  Palette,
  PartyPopper,
  ScanLine,
  Settings as SettingsIcon,
  ShoppingBag,
  WalletCards,
  X
} from "lucide-react";

const AppIcons = {
  archives: (className = "w-6 h-6") => <ContactRound className={className} strokeWidth={1.8} />,
  worldbook: (className = "w-6 h-6") => <BookOpen className={className} strokeWidth={1.8} />,
  chat: (className = "w-6 h-6") => <MessageCircle className={className} strokeWidth={1.8} />,
  offline: (className = "w-6 h-6") => <Layers3 className={className} strokeWidth={1.8} />,
  music: (className = "w-6 h-6") => <Music2 className={className} strokeWidth={1.8} />,
  notes: (className = "w-6 h-6") => <NotebookText className={className} strokeWidth={1.8} />,
  diary: (className = "w-6 h-6") => <BookHeart className={className} strokeWidth={1.8} />,
  memory: (className = "w-6 h-6") => <NotebookTabs className={className} strokeWidth={1.8} />,
  store: (className = "w-6 h-6") => <ShoppingBag className={className} strokeWidth={1.8} />,
  settings: (className = "w-6 h-6") => <SettingsIcon className={className} strokeWidth={1.8} />,
  forum: (className = "w-6 h-6") => <Images className={className} strokeWidth={1.8} />,
  schedule: (className = "w-6 h-6") => <CalendarDays className={className} strokeWidth={1.8} />,
  timeline: (className = "w-6 h-6") => <CalendarDays className={className} strokeWidth={1.8} />,
  theme: (className = "w-6 h-6") => <Palette className={className} strokeWidth={1.8} />,
  activities: (className = "w-6 h-6") => <PartyPopper className={className} strokeWidth={1.8} />,
  favorites: (className = "w-6 h-6") => <Bookmark className={className} strokeWidth={1.8} />,
  cloud: (className = "w-6 h-6") => <Cloud className={className} strokeWidth={1.8} />,
  scan: (className = "w-6 h-6") => <ScanLine className={className} strokeWidth={1.8} />,
  wallet: (className = "w-6 h-6") => <WalletCards className={className} strokeWidth={1.8} />,
};

const hexToRgba = (hex: string, opacityPercent: number) => {
  if (!hex || !hex.startsWith("#")) {
    return `rgba(255, 255, 255, ${opacityPercent / 100})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${isNaN(r) ? 255 : r}, ${isNaN(g) ? 255 : g}, ${isNaN(b) ? 255 : b}, ${opacityPercent / 100})`;
};

const isStandalonePwa = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

interface DragSession {
  itemId: string;
  origin: HomeScreenPosition;
  target?: HomeScreenPosition;
  grabOffsetX: number;
  grabOffsetY: number;
  validity: "valid" | "invalid" | "swap" | "displace";
  swapWithId?: string;
}

const DEFAULT_HOME_SCREEN_ITEMS: HomeScreenItem[] = [
  { id: "album_widget_1", type: "widget", widgetType: "album", size: "2x2", page: 0, position: { page: 0, row: 0, column: 0 } },
  { id: "archives", type: "app", size: "1x1", page: 0, position: { page: 0, row: 0, column: 2 } },
  { id: "worldbook", type: "app", size: "1x1", page: 0, position: { page: 0, row: 0, column: 3 } },
  { id: "chat", type: "app", size: "1x1", page: 0, position: { page: 0, row: 1, column: 2 } },
  { id: "offline", type: "app", size: "1x1", page: 0, position: { page: 0, row: 1, column: 3 } },
  { id: "music", type: "app", size: "1x1", page: 0, position: { page: 0, row: 2, column: 0 } },
  { id: "memory", type: "app", size: "1x1", page: 0, position: { page: 0, row: 2, column: 1 } },
  { id: "music_widget_1", type: "widget", widgetType: "music", size: "2x2", page: 0, position: { page: 0, row: 2, column: 2 } },
  { id: "store", type: "app", size: "1x1", page: 0, position: { page: 0, row: 3, column: 0 } },
  { id: "settings", type: "app", size: "1x1", page: 0, position: { page: 0, row: 3, column: 1 } },
  { id: "notes", type: "app", size: "1x1", page: 0, position: { page: 0, row: 4, column: 0 } },
];

const DEFAULT_WORLDBOOK_ENTRIES: WorldBookEntry[] = [];

// Default Seed Characters
const DEFAULT_CHARACTERS: Character[] = [];

const DEFAULT_SETTINGS: UserSettings = {
  name: "饭饭",
  avatar: "https://free.picui.cn/free/2026/07/08/6a4e12049700d.png",
  signature: "今天你也想我了吗",
  bio: "",
  apiKey: "",
  selectedModel: "gemini-3.5-flash",
  wallpaper: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
  customIcons: {},
  globalChatStylePreset: "default",
  bubbleCss: `.chat-bubble-self {
  background: #18181b !important;
  color: #ffffff !important;
  border-radius: 18px 18px 2px 18px !important;
}
.chat-bubble-other {
  background: #f4f4f5 !important;
  color: #18181b !important;
  border-radius: 18px 18px 18px 2px !important;
}`,
  globalCss: ``,
  chatGlobalCSS: ``,
  chatIcons: {},
  customFontName: "",
  customFontData: "",
  activePreset: "温和灰蓝 (Default)",
  momentsCover: "",
  apiEndpoint: "",
  apiTemperature: 0.7,
  streamCompatible: false,
  enableTimeAwareness: true,
  activeApiPresetId: "preset-gemini",
  apiPresets: [
    {
      id: "preset-gemini",
      name: "Default Gemini",
      apiEndpoint: "",
      apiKey: "",
      selectedModel: "gemini-3.5-flash",
      apiTemperature: 0.7,
      streamCompatible: false
    },
    {
      id: "preset-deepseek",
      name: "DeepSeek Official",
      apiEndpoint: "https://api.deepseek.com/v1",
      apiKey: "",
      selectedModel: "deepseek-v4-flash",
      apiTemperature: 0.7,
      streamCompatible: false
    }
  ],
  activeIdentityId: "identity-1",
  identities: [
    {
      id: "identity-1",
      name: "饭饭",
      avatar: "https://free.picui.cn/free/2026/07/08/6a4e12049700d.png",
      signature: "今天你也想我了吗",
      bio: ""
    },
    {
      id: "identity-2",
      name: "",
      avatar: "https://free.picui.cn/free/2026/07/08/6a4e12049700d.png",
      signature: "",
      bio: ""
    },
    {
      id: "identity-3",
      name: "",
      avatar: "https://free.picui.cn/free/2026/07/08/6a4e12049700d.png",
      signature: "",
      bio: ""
    }
  ],
  dockColor: "#ffffff",
  dockOpacity: 70,
  widgetOpacity: 70,
  dockBorderRadius: 26,
  widgetBorderRadius: 22,
  desktopIconMode: "dark",
  iconBorderEnabled: true,
  selfBubbleRadius: 6,
  otherBubbleRadius: 6,
  bubbleTailEnabled: false,
  bubbleTailVertical: "top",
  bubblePosition: "side"
  ,enableImageGeneration: false,
  imageApiPresets: [
    { id: "image-preset-default", name: "图片 API 配置", protocol: "openai-images", apiEndpoint: "", apiKey: "", selectedModel: "" }
  ],
  activeImageApiPresetId: "image-preset-default",
};

const DEFAULT_MESSAGES: Message[] = [];

export default function App() {
  const { resolvedTheme } = useTheme();
  useVisualViewport();
  // Load initial states from LocalStorage or fallbacks
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters(DEFAULT_CHARACTERS).value);

  const [settings, setSettingsState] = useState<UserSettings>(() => loadSettings(DEFAULT_SETTINGS).value);
  const settingsRef = useRef<UserSettings>(settings);
  const settingsChangedByUser = useRef(false);
  const setSettings = (update: UserSettingsUpdate): void => {
    const nextSettings = resolveSettingsUpdate(settingsRef.current, update);
    settingsRef.current = nextSettings;
    settingsChangedByUser.current = true;
    setSettingsState(nextSettings);

    const result = saveSettings(nextSettings);
    if (result.success) {
      settingsChangedByUser.current = false;
    } else {
      console.error("Failed to save settings to localStorage:", result.error);
    }
  };

  const [messages, setMessages] = useState<Message[]>(() => loadMessages(DEFAULT_MESSAGES).value.filter((message) =>
    !(message.sender === "character" && isInternalDeliveryMarkerOnly(message.content)),
  ));

  const [moments, setMoments] = useState<Moment[]>(() => loadMoments([]).value);

  const [presets, setPresets] = useState<StylePreset[]>(() => loadPresets([]).value);

  const [tracks, setTracks] = useState<MusicTrack[]>(() => {
    const raw = localStorage.getItem("phone_music_tracks");
    return raw ? JSON.parse(raw) : [];
  });
  const tracksRef = useRef<MusicTrack[]>(tracks);
  const [dualMusicConfigs, setDualMusicConfigs] = useState<DualMusicWidgetConfig[]>(() => loadDualMusicWidgetConfigs());
  const [identityMusicStates, setIdentityMusicStates] = useState<IdentityMusicState[]>(() => loadIdentityMusicStates());
  const [relationshipMusicStates, setRelationshipMusicStates] = useState<RelationshipMusicState[]>(() => loadRelationshipMusicStates());
  const [playbackOrigin, setPlaybackOrigin] = useState<string | null>(null);
  const [musicPlaybackError, setMusicPlaybackError] = useState<string | null>(null);
  const [musicRecommendationRelationId, setMusicRecommendationRelationId] = useState<string | null>(null);
  const [musicRecommendationError, setMusicRecommendationError] = useState<string | null>(null);
  const musicRecommendationInFlightRef = useRef(new Set<string>());

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => () => {
    tracksRef.current.forEach((track) => {
      if (track.isLocal && track.url.startsWith("blob:")) URL.revokeObjectURL(track.url);
    });
  }, []);

  const [playlists, setPlaylists] = useState<MusicPlaylist[]>(() => {
    const raw = localStorage.getItem("phone_music_playlists");
    return raw ? JSON.parse(raw) : [];
  });

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => loadCalendarEvents([]).value);

  const [worldBookEntries, setWorldBookEntries] = useState<WorldBookEntry[]>(() => loadWorldBookEntries(DEFAULT_WORLDBOOK_ENTRIES).value);

  // Navigation State
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [activeChatCharId, setActiveChatCharId] = useState<string | null>(null);
  const [activeChatRelationId, setActiveChatRelationId] = useState<string | null>(null);
  const [pendingForumShareMessageId, setPendingForumShareMessageId] = useState<string | null>(null);
  const [pendingDiaryShareMessageId, setPendingDiaryShareMessageId] = useState<string | null>(null);
  const [openForumShareId, setOpenForumShareId] = useState<string | null>(null);
  const [relationships, setRelationships] = useState<CharacterRelationship[]>(() => loadRelationships([]).value);

  // Offline Stories State & Handlers
  const [offlineStories, setOfflineStories] = useState<OfflineStory[]>(() => loadOfflineStories([]).value);
  const charactersPersistenceReady = useRef(false);
  const messagesPersistenceReady = useRef(false);
  const momentsPersistenceReady = useRef(false);
  const presetsPersistenceReady = useRef(false);
  const calendarPersistenceReady = useRef(false);
  const worldBookPersistenceReady = useRef(false);
  const memoriesPersistenceReady = useRef(false);
  const skipNextMemoriesPersistenceRef = useRef(false);
  const characterIdentityMigrationLogRef = useRef(new Set<string>());
  const memorySettingsPersistenceReady = useRef(false);
  const offlineStoriesPersistenceReady = useRef(false);
  const relationshipsPersistenceReady = useRef(false);

  const handleSaveOfflineStory = (story: OfflineStory) => {
    setOfflineStories((prev) => {
      const idx = prev.findIndex((s) => s.id === story.id);
      let updated;
      if (idx !== -1) {
        updated = [...prev];
        updated[idx] = story;
      } else {
        updated = [story, ...prev];
      }
      return updated;
    });
  };

  const handleDeleteOfflineStory = (storyId: string) => {
    retractBySourceStoryIds([storyId]);
    retractByOfflineStoryIds([storyId]);
    setOfflineStories((prev) => {
      const filtered = prev.filter((s) => s.id !== storyId);
      return filtered;
    });
  };

  // Global message notification banner state
  const [globalNotification, setGlobalNotification] = useState<{
    characterId: string;
    avatar: string;
    name: string;
    content: string;
    timestamp: number;
  } | null>(null);

  // Global Toast warning/success state (P2: alert on save failures)
  const [globalToast, setGlobalToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const showGlobalToast = (message: string, isError?: boolean) => {
    setGlobalToast({ message, isError });
    setTimeout(() => {
      setGlobalToast(null);
    }, 3000);
  };

  const [isStandaloneMode, setIsStandaloneMode] = useState(isStandalonePwa);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const updateAppFrame = () => {
      const standalone = isStandalonePwa();
      setIsStandaloneMode(standalone);

    };

    const handleDisplayModeChange = () => updateAppFrame();

    updateAppFrame();
    window.addEventListener("resize", updateAppFrame);
    if (standaloneQuery.addEventListener) {
      standaloneQuery.addEventListener("change", handleDisplayModeChange);
    } else {
      standaloneQuery.addListener(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener("resize", updateAppFrame);
      if (standaloneQuery.removeEventListener) {
        standaloneQuery.removeEventListener("change", handleDisplayModeChange);
      } else {
        standaloneQuery.removeListener(handleDisplayModeChange);
      }
    };
  }, []);

  // Restore local track object URLs on mount from IndexedDB
  useEffect(() => {
    const restoreLocalTracks = async () => {
      const raw = localStorage.getItem("phone_music_tracks");
      if (!raw) return;
      try {
        const parsedTracks = JSON.parse(raw) as MusicTrack[];
        const localTracks = parsedTracks.filter((t) => t.isLocal);
        if (localTracks.length === 0) return;

        let updated = false;
        const restored = await Promise.all(
          parsedTracks.map(async (track) => {
            if (track.isLocal) {
              try {
                const blob = await audioDb.getTrackFile(getTrackAudioAssetId(track));
                if (blob) {
                  const newUrl = URL.createObjectURL(blob);
                  updated = true;
                  return {
                    ...track,
                    audioAssetId: track.audioAssetId || track.id,
                    audioMimeType: track.audioMimeType || blob.type || undefined,
                    url: newUrl,
                  };
                }
              } catch (err) {
                console.error("Failed to restore local track:", track.id, err);
              }
            }
            return track;
          })
        );

        if (updated) {
          setTracks(restored);
          // Also sync currentTrack if it's local
          setCurrentTrack((current) => {
            if (current && current.isLocal) {
              const matching = restored.find((t) => t.id === current.id);
              if (matching) {
                return matching;
              }
            }
            return current;
          });
        }
      } catch (e) {
        console.error("Failed to parse music tracks for restoration:", e);
      }
    };

    restoreLocalTracks();
  }, []);

  // Auto-close global notification after 3 seconds
  useEffect(() => {
    if (globalNotification) {
      const timer = setTimeout(() => {
        setGlobalNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [globalNotification]);

  // Monitor messages to show notification banner if not currently chatting with the sender
  useEffect(() => {
    if (messages.length > 0) {
      const latestMsg = messages[messages.length - 1];
      if (
        latestMsg &&
        latestMsg.sender === "character" &&
        Date.now() - latestMsg.timestamp < 4000
      ) {
        const isNotActiveChat = activeApp !== "chat" || activeChatCharId !== latestMsg.characterId;
        if (isNotActiveChat) {
          const char = characters.find((c) => c.id === latestMsg.characterId);
          if (char) {
            setGlobalNotification({
              characterId: char.id,
              avatar: char.avatar,
              name: char.remark || char.name,
              content: latestMsg.content,
              timestamp: latestMsg.timestamp,
            });
          }
        }
      }
    }
  }, [messages, activeApp, activeChatCharId, characters]);

  const phoneScreenRef = useRef<HTMLDivElement>(null);

  const [installedAppIds, setInstalledAppIds] = useState<string[]>(() => {
    const raw = localStorage.getItem("phone_installed_apps");
    let parsed: string[] = ["chat", "archives", "worldbook", "music", "notes", "offline", "store", "settings"];
    if (raw) {
      try {
        const candidate = JSON.parse(raw);
        if (Array.isArray(candidate)) {
          parsed = candidate.filter((id): id is string => typeof id === "string" && Boolean(id));
        }
      } catch {
        // Keep the safe defaults when a legacy value is malformed.
      }
    }
    const filtered = parsed.filter(id => id !== "schedule");
    if (!filtered.includes("notes")) {
      filtered.push("notes");
    }
    if (!filtered.includes("offline")) {
      filtered.push("offline");
    }
    return filtered;
  });

  useEffect(() => {
    localStorage.setItem("phone_installed_apps", JSON.stringify(installedAppIds));
  }, [installedAppIds]);

  // Global Music Player State
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<"single" | "list" | "random">("list");
  const [volume, setVolume] = useState(0.8);
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);

  const PRESEED_MUSIC_TRACKS: MusicTrack[] = [];

  const handleNextTrack = () => {
    const allTracks = [...PRESEED_MUSIC_TRACKS, ...tracks];
    if (allTracks.length === 0) return;
    
    if (playMode === "single") {
      const audio = globalAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
      }
    } else if (playMode === "random") {
      const randomIndex = Math.floor(Math.random() * allTracks.length);
      const nextTrack = allTracks[randomIndex];
      setCurrentTrack(nextTrack);
      if (playbackOrigin && shouldRecordIdentityListening(playbackOrigin)) {
        setIdentityMusicStates((states) => upsertIdentityMusicTrack(states, settings.activeIdentityId || DEFAULT_IDENTITY_ID, nextTrack.id));
      }
      setIsPlaying(true);
    } else {
      const currentIndex = allTracks.findIndex((t) => t.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % allTracks.length;
      const nextTrack = allTracks[nextIndex];
      setCurrentTrack(nextTrack);
      if (playbackOrigin && shouldRecordIdentityListening(playbackOrigin)) {
        setIdentityMusicStates((states) => upsertIdentityMusicTrack(states, settings.activeIdentityId || DEFAULT_IDENTITY_ID, nextTrack.id));
      }
      setIsPlaying(true);
    }
  };

  const handlePrevTrack = () => {
    const allTracks = [...PRESEED_MUSIC_TRACKS, ...tracks];
    if (allTracks.length === 0) return;
    const currentIndex = allTracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = (currentIndex - 1 + allTracks.length) % allTracks.length;
    const previousTrack = allTracks[prevIndex];
    setCurrentTrack(previousTrack);
    if (playbackOrigin && shouldRecordIdentityListening(playbackOrigin)) {
      setIdentityMusicStates((states) => upsertIdentityMusicTrack(states, settings.activeIdentityId || DEFAULT_IDENTITY_ID, previousTrack.id));
    }
    setIsPlaying(true);
  };

  useEffect(() => {
    if (!globalAudioRef.current) {
      globalAudioRef.current = new Audio();
    }
    const audio = globalAudioRef.current;
    
    const handleEnded = () => {
      if (playbackOrigin?.endsWith(":right")) {
        setIsPlaying(false);
        return;
      }
      handleNextTrack();
    };
    const handleAudioError = () => {
      setIsPlaying(false);
      setMusicPlaybackError("无法播放这首歌，请检查音频格式、网络链接或重新导入文件。");
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleAudioError);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleAudioError);
    };
  }, [tracks, currentTrack, playMode, playbackOrigin]);

  useEffect(() => {
    const audio = globalAudioRef.current;
    if (!audio) return;
    
    if (currentTrack) {
      if (audio.src !== currentTrack.url) {
        audio.src = currentTrack.url;
      }
      if (isPlaying) {
        audio.play().catch(() => {
          setIsPlaying(false);
          setMusicPlaybackError("浏览器未能播放这首歌，请再次点击或检查音频格式。");
        });
      } else {
        audio.pause();
      }
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

  const toggleTrack = (trackId: string, origin: string, recordIdentityPlayback = false, trackOverride?: MusicTrack) => {
    const track = trackOverride || tracks.find((item) => item.id === trackId);
    if (!track) {
      setMusicPlaybackError("歌曲已不存在，请重新选择。");
      return;
    }
    if (track.isLocal && (!track.url || !track.url.startsWith("blob:"))) {
      setMusicPlaybackError("本地音频文件缺失，请重新导入这首歌。");
      return;
    }
    if (!track.isLocal && !/^https?:\/\//i.test(track.url)) {
      setMusicPlaybackError("歌曲链接无效，请在音乐库中更新。");
      return;
    }
    setMusicPlaybackError(null);
    if (getMusicPlaybackAction({
      currentTrackId: currentTrack?.id,
      currentOrigin: playbackOrigin,
      isPlaying,
      targetTrackId: track.id,
      targetOrigin: origin,
    }) === "pause") {
      setIsPlaying(false);
      return;
    }
    setCurrentTrack(track);
    setPlaybackOrigin(origin);
    setIsPlaying(true);
    if (recordIdentityPlayback && shouldRecordIdentityListening(origin)) {
      const ownerIdentityId = settings.activeIdentityId || DEFAULT_IDENTITY_ID;
      setIdentityMusicStates((states) => upsertIdentityMusicTrack(states, ownerIdentityId, track.id));
    }
  };

  // Sync with navigator.mediaSession for robust background playback
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator) || !currentTrack) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || "未知曲目",
        artist: currentTrack.artist || "未知歌手",
        album: "朋友圈音乐馆",
        artwork: [
          { src: currentTrack.coverUrl || "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=256&h=256&fit=crop", sizes: "256x256", type: "image/jpeg" }
        ]
      });

      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

      navigator.mediaSession.setActionHandler("play", () => {
        setIsPlaying(true);
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        setIsPlaying(false);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        handlePrevTrack();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        handleNextTrack();
      });
    } catch (e) {
      console.warn("MediaSession interaction error: ", e);
    }

    return () => {
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("play", null);
          navigator.mediaSession.setActionHandler("pause", null);
          navigator.mediaSession.setActionHandler("previoustrack", null);
          navigator.mediaSession.setActionHandler("nexttrack", null);
        } catch (err) {
          // ignore cleanup failures
        }
      }
    };
  }, [currentTrack, isPlaying, tracks, playMode]);

  // HomeScreen layout items (Apps + Widgets)
  const [homeScreenItems, setHomeScreenItems] = useState<HomeScreenItem[]>(() => {
    const raw = localStorage.getItem("phone_homescreen_items");
    let items: HomeScreenItem[];
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        items = Array.isArray(parsed) ? parsed : [];
      } catch {
        items = [];
      }
    } else {
      items = DEFAULT_HOME_SCREEN_ITEMS.map((item) => ({
        ...item,
        position: item.position ? { ...item.position } : undefined,
      }));
    }

    items = items
      .filter((item) => item.id !== "schedule" && !(item.widgetType === "album" && item.size === "1x4"))
      .map((item) => item.widgetType === "album" && item.size === "2x4"
        ? { ...item, widgetType: "calendar-album" }
        : item);
    const normalized = normalizeHomeScreenLayout(items);
    localStorage.setItem("phone_homescreen_items", JSON.stringify(normalized));
    return normalized;
  });

  // Memory Vault (Memory Book) States
  const [memories, setMemories] = useState<MemoryItem[]>(() => loadMemories([]).value);

  // A one-time, idempotent bridge from character-keyed legacy data to the
  // default historical relationship. New direct data is always relation keyed.
  useEffect(() => {
    const rawFriendIds = (() => {
      try { return JSON.parse(localStorage.getItem("phone_friend_ids") || "[]") as string[]; } catch { return []; }
    })();
    const result = migrateLegacyRelationshipData({
      characters,
      relationships,
      legacyFriendIds: rawFriendIds,
      messages,
      memories,
      offlineStories,
      // Legacy records predate identity-scoped relationships. They always
      // belong to the historical primary identity, never whichever identity
      // happens to be active when the app starts.
      defaultIdentityId: DEFAULT_IDENTITY_ID,
      now: Date.now(),
    });
    const relationshipsChanged = result.createdRelationshipCount || result.deduplicatedRelationshipCount;
    if (relationshipsChanged) setRelationships(result.relationships);
    if (result.migratedMessageCount || result.deduplicatedRelationshipCount) setMessages(result.messages);
    if (result.migratedMemoryCount || result.deduplicatedRelationshipCount) setMemories(result.memories);
    if (result.migratedStoryCount || result.deduplicatedRelationshipCount) setOfflineStories(result.offlineStories);
    Object.entries(result.relationIdRemaps).forEach(([fromRelationId, toRelationId]) => {
      const sourceStoryId = localStorage.getItem(getOfflineStoryStorageKey(fromRelationId));
      if (sourceStoryId && !localStorage.getItem(getOfflineStoryStorageKey(toRelationId))) {
        localStorage.setItem(getOfflineStoryStorageKey(toRelationId), sourceStoryId);
      }
      localStorage.removeItem(getOfflineStoryStorageKey(fromRelationId));
      localStorage.removeItem(getOfflineModeStorageKey(fromRelationId));
    });
  }, [characters, relationships, messages, memories, offlineStories]);

  // Keep legacy contact copies readable, while canonicalizing dependent data so
  // every feature sees one archive character for the same identity.
  useEffect(() => {
    const migration = migrateLegacyCharacterIdentityData({
      characters,
      memories,
      moments,
      offlineStories,
    });
    if (migration.idMap.size === 0) return;

    const logMigration = (message: string) => {
      if (characterIdentityMigrationLogRef.current.has(message)) return;
      characterIdentityMigrationLogRef.current.add(message);
      console.info(`[character identity migration] ${message}`);
    };
    migration.duplicateLogs.forEach(logMigration);
    if (migration.migratedMemoryCount > 0) {
      logMigration(`Migrated memory records: ${migration.migratedMemoryCount}.`);
    }
    if (migration.migratedMomentCount > 0) {
      logMigration(`Migrated moment author records: ${migration.migratedMomentCount}.`);
    }
    if (migration.referencedOfflineStoryCount > 0) {
      logMigration(`Offline stories retaining legacy references: ${migration.referencedOfflineStoryCount}.`);
    }

    const memoriesChanged = migration.memories.some((memory, index) =>
      memory.characterId !== memories[index]?.characterId,
    );
    const momentsChanged = migration.moments.some((moment, index) =>
      moment.characterId !== moments[index]?.characterId,
    );
    if (memoriesChanged) setMemories(migration.memories);
    if (momentsChanged) setMoments(migration.moments);
  }, [characters, memories, moments, offlineStories]);

  // Truth Layer migration is deliberately additive. Legacy Memory and
  // compressed-memory fields remain untouched for rollback and old-build
  // readability; deterministic source IDs make this safe on every startup.
  useEffect(() => {
    if (characters.length === 0 || relationships.length === 0) return;
    const existingClaims = loadKnowledgeClaims().value;
    const existingSummaries = loadConversationSummaries().value;
    const existingCorrections = loadBehaviorCorrections().value;
    const result = migrateLegacyCharacterKnowledge({
      characters,
      relationships,
      memories,
      offlineStories,
      existingClaims,
      existingSummaries,
      existingCorrections,
      now: Date.now(),
    });
    if (result.claims.length > 0) {
      const write = appendKnowledgeClaims(result.claims);
      if (!write.success) console.error("Failed to persist migrated character knowledge claims:", write.error);
    }
    if (result.summaries.length > 0) {
      const write = saveConversationSummaries([...existingSummaries, ...result.summaries]);
      if (!write.success) console.error("Failed to persist migrated conversation summaries:", write.error);
    }
    if (result.corrections.length > 0) {
      const write = saveBehaviorCorrections([...existingCorrections, ...result.corrections]);
      if (!write.success) console.error("Failed to persist migrated behavior corrections:", write.error);
    }
    const previous = loadCharacterKnowledgeMigrationState().value;
    saveCharacterKnowledgeMigrationState({
      schemaVersion: CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION,
      migrationVersion: CHARACTER_KNOWLEDGE_MIGRATION_VERSION,
      lastRunAt: Date.now(),
      migratedMemoryIds: Array.from(new Set([...previous.migratedMemoryIds, ...result.migratedMemoryIds])),
      migratedSummaryIds: Array.from(new Set([...previous.migratedSummaryIds, ...result.migratedSummaryIds])),
      migratedCorrectionIds: Array.from(new Set([...previous.migratedCorrectionIds, ...result.migratedCorrectionIds])),
      orphanRecordIds: Array.from(new Set([...previous.orphanRecordIds, ...result.orphanRecordIds])),
    });
    result.diagnostics.forEach((diagnostic) => {
      console.warn(`[character truth migration] ${diagnostic.recordId}: ${diagnostic.diagnostic}`);
    });
  }, [characters, relationships, memories, offlineStories]);

  // Offline-story handoffs must be persisted before their story is marked as
  // synced. The ordinary effect remains the single path for every other memory
  // update, while this callback gives the offline exit flow a durable result.
  const persistOfflineStoryMemories = (nextMemories: MemoryItem[]): boolean => {
    const result = saveMemories(nextMemories);
    if (!result.success) {
      console.error("Failed to persist offline story memories:", result.error);
      return false;
    }
    skipNextMemoriesPersistenceRef.current = true;
    setMemories(nextMemories);
    return true;
  };

  const [recallSettings, setRecallSettings] = useState<MemoryVaultSettings>(() => loadMemorySettings({
    extractModel: "gemini-3.5-flash",
    recallCount: 5,
    autoExtract: true,
    extractInterval: 10,
  }).value);

  const [immediateSummaryTask, setImmediateSummaryTask] = useState<ImmediateSummaryTask>(() => {
    const raw = localStorage.getItem("phone_immediate_summary_task");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.status === "summarizing") {
          parsed.status = "idle";
        }
        return parsed;
      } catch (e) {}
    }
    return {
      characterId: "",
      status: "idle",
      rounds: 15,
      extractedCount: 0,
    };
  });

  useEffect(() => {
    localStorage.setItem("phone_immediate_summary_task", JSON.stringify(immediateSummaryTask));
  }, [immediateSummaryTask]);

  const handleStartImmediateSummary = async (characterId: string, rounds: number, relationId?: string, conversationId?: string) => {
    setImmediateSummaryTask({
      characterId,
      relationId,
      conversationId,
      status: "summarizing",
      rounds,
      extractedCount: 0,
    });

    try {
      const char = characters.find(c => c.id === characterId);
      if (!char) {
        setImmediateSummaryTask(prev => ({ ...prev, status: "error", error: "角色不存在" }));
        return;
      }

      // A summary without a relation cannot be assigned to one user's
      // relationship scope. Keep legacy records readable, but never create a
      // new long-term memory from a characterId-only fallback.
      if (!relationId) {
        setImmediateSummaryTask(prev => ({
          ...prev,
          status: "error",
          error: "需要明确当前关系后才能总结记忆",
        }));
        return;
      }

      const retrievalLimit = char.retrievalHistoryLimit || 100;
      const relation = relationships.find((item) =>
        item.id === relationId
        && item.characterId === characterId
        && item.conversationId === (conversationId || item.conversationId),
      );
      if (!relation) {
        setImmediateSummaryTask(prev => ({ ...prev, status: "error", error: "当前关系作用域无效，无法写入长期认知" }));
        return;
      }
      const charMsgs = messages.filter((message) => message.relationId === relationId).slice(-retrievalLimit);
      if (charMsgs.length === 0) {
        setImmediateSummaryTask(prev => ({ ...prev, status: "error", error: "暂无与该角色的聊天记录，无法进行总结" }));
        return;
      }

      const msgsToSummarize = charMsgs.slice(-rounds * 2);

      // Preserve the original one-item summary format and save it only once.
      const isDelicate = char.archiveTemplateType === "delicate";
      const headerLabel = isDelicate ? `【心境日记一键归档 (细腻版 - 最近 ${rounds} 轮)】` : `【精炼事件日志一键归档 (精炼版 - 最近 ${rounds} 轮)】`;
      const result = await MemoryService.summarizeConversation({
        character: char,
        characterId,
        relationId,
        userIdentityId: relation.userIdentityId,
        conversationId: relation.conversationId,
        recentMessages: msgsToSummarize,
        existingMemories: memories,
        scenario: "immediate-summary",
        apiKey: settings.apiKey,
        model: (!recallSettings?.extractModel || recallSettings.extractModel === "default-chat-model") ? (settings.selectedModel || "gemini-3.5-flash") : recallSettings.extractModel,
        apiEndpoint: settings.apiEndpoint,
        templateType: char.archiveTemplateType,
        createId: () => (Date.now() + Math.random()).toString(),
        currentTime: () => Date.now(),
        formatContent: (items, formatOptions) => isDelicate
          ? formatDelicateMemoryDiary(headerLabel, formatOptions?.displayItems || items)
          : formatExtractedMemorySummary(headerLabel, items),
      }, apiExtractMemories);
      if (result.apiError) {
        setImmediateSummaryTask(prev => ({
          ...prev,
          status: "error",
          error: result.apiError || "提炼失败，未提取到有效记忆或API请求出错",
        }));
        return;
      }
      const addedCount = result.extractedMemories.length;
      if (result.acceptedClaims.length > 0 && !appendKnowledgeClaims(result.acceptedClaims).success) {
        setImmediateSummaryTask(prev => ({ ...prev, status: "error", error: "长期认知写入失败，未更新兼容记忆" }));
        return;
      }
      const extractedSummary = createConversationSummaryRecord({
        scope: {
          relationId: relation.id,
          characterId: relation.characterId,
          userIdentityId: relation.userIdentityId,
          conversationId: relation.conversationId,
        },
        claims: result.acceptedClaims,
        sourceMessageIds: msgsToSummarize.map((message) => message.id),
        generatedAt: Date.now(),
        rangeStartAt: msgsToSummarize[0]?.timestamp,
        rangeEndAt: msgsToSummarize[msgsToSummarize.length - 1]?.timestamp,
      });
      if (extractedSummary) {
        const summaryWrite = saveConversationSummaries([...loadConversationSummaries().value, extractedSummary]);
        if (!summaryWrite.success) console.warn("Conversation summary cache could not be persisted:", summaryWrite.error);
      }
      if (addedCount > 0) {
        setMemories(prev => MemoryService.mergeMemories(prev, result.extractedMemories));
      }

      setImmediateSummaryTask({
        characterId,
        relationId,
        conversationId,
        status: "completed",
        rounds,
        extractedCount: addedCount,
      });

      // Direct-chat summary markers belong to the relationship. Character keeps no
      // cross-identity conversation state.
      const lastMsg = msgsToSummarize[msgsToSummarize.length - 1];
      if (lastMsg && relationId) {
        setRelationships((previous) => previous.map((relation) => relation.id === relationId
          ? { ...relation, lastImmediateSummaryMsgId: lastMsg.id, updatedAt: Date.now() }
          : relation));
      }
    } catch (err: any) {
      setImmediateSummaryTask(prev => ({
        ...prev,
        status: "error",
        error: "网络错误或请求超时，请稍后重试",
      }));
    }
  };

  const handleResetImmediateSummary = () => {
    setImmediateSummaryTask({
      characterId: "",
      status: "idle",
      rounds: 15,
      extractedCount: 0,
    });
  };

  const [currentPage, setCurrentPage] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isEditingHomeScreen, setIsEditingHomeScreen] = useState(false);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [homeLayoutError, setHomeLayoutError] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const pendingItemPressRef = useRef<{
    item: HomeScreenItem;
    startX: number;
    startY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    longPressed: boolean;
    pointerId: number;
    targetElement: HTMLDivElement;
  } | null>(null);
  const suppressNextItemClickRef = useRef(false);
  const [isShowingAddWidget, setIsShowingAddWidget] = useState(false);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const pageViewportRef = useRef<HTMLDivElement | null>(null);
  const [homeGridWidth, setHomeGridWidth] = useState(() =>
    typeof window === "undefined" ? 343 : Math.max(0, window.innerWidth - 32),
  );
  const [homeGridHeight, setHomeGridHeight] = useState(0);
  const homeGridIconWidth = settings.hideAppNames ? 60 : 52;
  const homeGridPadding = 12;
  const homeGridInnerWidth = homeGridWidth - homeGridPadding * 2;
  const homeGridGap = 16;
  const homeGridColumnGap = homeGridGap;
  const homeGridRowGap = homeGridGap;
  const homeGridTrackWidth = Math.max(
    homeGridIconWidth,
    (homeGridInnerWidth - homeGridColumnGap * (HOME_GRID_COLUMNS - 1)) / HOME_GRID_COLUMNS,
  );
  const homeGridRowHeight = homeGridTrackWidth;
  const homeGridRows = getResponsiveHomeGridRowCount({
    containerHeight: homeGridHeight,
    paddingTop: 14,
    paddingBottom: 14,
    rowHeight: homeGridRowHeight,
    rowGap: homeGridRowGap,
  });
  const pageSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pageSwitchEdgeRef = useRef<"left" | "right" | null>(null);
  const draggedItem = dragSession
    ? homeScreenItems.find((item) => item.id === dragSession.itemId) || null
    : null;
  const visibleHomePageCount = getVisibleHomePageCount(homeScreenItems, isEditingHomeScreen);

  useEffect(() => {
    localStorage.setItem("phone_homescreen_items", JSON.stringify(homeScreenItems));
  }, [homeScreenItems]);

  useEffect(() => {
    const placedAppIds = homeScreenItems
      .filter((item) => item.type === "app")
      .map((item) => item.id);
    setInstalledAppIds((current) => {
      const merged = [...new Set([...current, ...placedAppIds])];
      return merged.length === current.length && merged.every((id, index) => id === current[index])
        ? current
        : merged;
    });
  }, [homeScreenItems]);

  useEffect(() => {
    setCurrentPage((page) => Math.max(0, Math.min(page, visibleHomePageCount - 1)));
  }, [visibleHomePageCount]);

  useLayoutEffect(() => {
    const grid = pageContainerRef.current;
    const viewport = pageViewportRef.current;
    if (!grid && !viewport) return;
    const updateGridSize = () => {
      const gridRect = grid?.getBoundingClientRect();
      const viewportRect = viewport?.getBoundingClientRect();
      const width = gridRect?.width || viewportRect?.width || 0;
      const height = gridRect?.height || 0;
      if (width > 0) setHomeGridWidth(width);
      if (height > 0) setHomeGridHeight(height);
    };
    updateGridSize();
    const observer = new ResizeObserver(updateGridSize);
    if (grid) observer.observe(grid);
    if (viewport && viewport !== grid) observer.observe(viewport);
    return () => observer.disconnect();
  }, [currentPage, visibleHomePageCount]);

  const handleInstallApp = (id: string) => {
    if (installedAppIds.includes(id)) return;
    setHomeScreenItems((current) => {
      if (current.some((item) => item.id === id)) {
        setInstalledAppIds((previous) => {
          const next = previous.includes(id) ? previous : [...previous, id];
          localStorage.setItem("phone_installed_apps", JSON.stringify(next));
          return next;
        });
        return current;
      }
      const position = findFirstAvailablePosition(current, "1x1", 0, homeGridRows);
      if (!position) {
        setHomeLayoutError(`桌面已达到 ${MAX_HOME_PAGES} 页上限，无法安装更多应用。`);
        return current;
      }
      setInstalledAppIds((previous) => {
        const next = previous.includes(id) ? previous : [...previous, id];
        localStorage.setItem("phone_installed_apps", JSON.stringify(next));
        return next;
      });
      setTimeout(() => setCurrentPage(position.page), 50);
      const next = [...current, { id, type: "app" as const, size: "1x1" as const, page: position.page, position }];
      localStorage.setItem("phone_homescreen_items", JSON.stringify(next));
      return next;
    });
  };

  const handleUninstallApp = (id: string) => {
    setInstalledAppIds((prev) => prev.filter((appId) => appId !== id));
    setHomeScreenItems((current) => current.filter((item) => item.id !== id));
    if (activeApp === id) {
      setActiveApp(null);
    }
  };

  const handleItemPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    item: HomeScreenItem,
  ) => {
    if ((e.target as HTMLElement).closest("[data-home-delete]")) return;
    e.stopPropagation();
    const itemRect = e.currentTarget.getBoundingClientRect();
    pendingItemPressRef.current = {
      item,
      startX: e.clientX,
      startY: e.clientY,
      grabOffsetX: e.clientX - itemRect.left,
      grabOffsetY: e.clientY - itemRect.top,
      longPressed: isEditingHomeScreen,
      pointerId: e.pointerId,
      targetElement: e.currentTarget,
    };
    setDragCurrent({ x: e.clientX, y: e.clientY });
    swipeStartRef.current = { x: e.clientX, y: e.clientY };

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (!isEditingHomeScreen) {
      longPressTimerRef.current = setTimeout(() => {
        setIsEditingHomeScreen(true);
        const pending = pendingItemPressRef.current;
        if (pending?.item.id === item.id && pending.item.position) {
          pending.longPressed = true;
          try {
            pending.targetElement.setPointerCapture(pending.pointerId);
          } catch {
            // Pointer capture may be unavailable after a browser gesture cancellation.
          }
          const nextSession: DragSession = {
            itemId: pending.item.id,
            origin: { ...pending.item.position },
            target: { ...pending.item.position },
            grabOffsetX: pending.grabOffsetX,
            grabOffsetY: pending.grabOffsetY,
            validity: "valid",
          };
          suppressNextItemClickRef.current = true;
          dragSessionRef.current = nextSession;
          setDragSession(nextSession);
        }
      }, 400);
    }
  };

  const debouncePageSwitch = (targetPage: number, edge: "left" | "right") => {
    if (pageSwitchTimeoutRef.current || pageSwitchEdgeRef.current === edge) return;
    pageSwitchEdgeRef.current = edge;
    pageSwitchTimeoutRef.current = setTimeout(() => {
      setCurrentPage(targetPage);
      const session = dragSessionRef.current;
      const nextSession = session
        ? {
            ...session,
            target: session.target ? { ...session.target, page: targetPage } : undefined,
            validity: "invalid" as const,
            swapWithId: undefined,
          }
        : null;
      dragSessionRef.current = nextSession;
      setDragSession(nextSession);
      pageSwitchTimeoutRef.current = null;
    }, 600);
  };

  const clearPageSwitchTimeout = (resetEdge = true) => {
    if (pageSwitchTimeoutRef.current) {
      clearTimeout(pageSwitchTimeoutRef.current);
      pageSwitchTimeoutRef.current = null;
    }
    if (resetEdge) pageSwitchEdgeRef.current = null;
  };

  const updateDragTarget = (e: PointerEvent, session: DragSession) => {
    const item = homeScreenItems.find((candidate) => candidate.id === session.itemId);
    const container = pageContainerRef.current;
    if (!item || !container) return;
    const rect = container.getBoundingClientRect();
    const style = window.getComputedStyle(container);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const columnGap = Number.parseFloat(style.columnGap) || 0;
    const rowGap = Number.parseFloat(style.rowGap) || 0;
    const fallbackTrackWidth = (rect.width - paddingLeft - paddingRight
      - columnGap * (HOME_GRID_COLUMNS - 1)) / HOME_GRID_COLUMNS;
    const target = getHomeGridPositionFromPoint({
      page: currentPage,
      pointerX: e.clientX,
      pointerY: e.clientY,
      grabOffsetX: session.grabOffsetX,
      grabOffsetY: session.grabOffsetY,
      containerLeft: rect.left,
      containerTop: rect.top,
      containerWidth: rect.width,
      paddingLeft,
      paddingRight,
      paddingTop,
      columnGap,
      rowGap,
      rowHeight: Number.parseFloat(style.gridAutoRows) || fallbackTrackWidth,
      rowCount: homeGridRows,
      size: item.size,
    });
    const overlaps = getOverlappingItemIds(homeScreenItems, item, target, homeGridRows);
    const swapTarget = overlaps.length === 1
      ? homeScreenItems.find((candidate) => candidate.id === overlaps[0])
      : undefined;
    const canSwap = Boolean(
      swapTarget
      && item.size === "1x1"
      && swapTarget.size === "1x1",
    );
    const displacedLayout = overlaps.length > 0
      ? placeItemWithDisplacement(homeScreenItems, item.id, target, homeGridRows)
      : null;
    const displacedItem = displacedLayout?.find((candidate) => candidate.id === item.id);
    const canDisplace = Boolean(
      overlaps.length > 0
      && displacedItem?.position?.page === target.page
      && displacedItem.position.row === target.row
      && displacedItem.position.column === target.column,
    );
    const nextSession: DragSession = {
      ...session,
      target,
      validity: overlaps.length === 0 && canPlaceAt(homeScreenItems, item, target, homeGridRows)
        ? "valid"
        : canSwap
          ? "swap"
          : canDisplace
            ? "displace"
          : "invalid",
      swapWithId: canSwap ? swapTarget?.id : undefined,
    };
    dragSessionRef.current = nextSession;
    setDragSession(nextSession);
  };

  const handlePointerMove = (e: PointerEvent) => {
    const pending = pendingItemPressRef.current;
    const activeSession = dragSessionRef.current;
    if (!activeSession && pending) {
      const distance = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
      if (!pending.longPressed && distance > 24) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        pendingItemPressRef.current = null;
        return;
      }
      if (pending.longPressed && distance > 6 && pending.item.position) {
        const nextSession: DragSession = {
          itemId: pending.item.id,
          origin: { ...pending.item.position },
          target: { ...pending.item.position },
          grabOffsetX: pending.grabOffsetX,
          grabOffsetY: pending.grabOffsetY,
          validity: "valid",
        };
        suppressNextItemClickRef.current = true;
        dragSessionRef.current = nextSession;
        setDragSession(nextSession);
        updateDragTarget(e, nextSession);
      }
      return;
    }
    if (!activeSession) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    const cloneEl = document.getElementById("tactile-drag-clone");
    if (cloneEl) {
      cloneEl.style.left = `${clientX}px`;
      cloneEl.style.top = `${clientY}px`;
    }

    setDragCurrent({ x: clientX, y: clientY });

    if (pageViewportRef.current) {
      const rect = pageViewportRef.current.getBoundingClientRect();
      const relativeX = clientX - rect.left;

      if (relativeX < 40 && currentPage > 0) {
        debouncePageSwitch(currentPage - 1, "left");
      } else if (relativeX > rect.width - 40) {
        const highestPage = getHighestOccupiedPage(homeScreenItems);
        const lastVisiblePage = Math.min(
          MAX_HOME_PAGES - 1,
          highestPage + (isEditingHomeScreen ? 1 : 0),
        );
        if (currentPage < lastVisiblePage) {
          debouncePageSwitch(currentPage + 1, "right");
        }
      } else {
        clearPageSwitchTimeout();
      }
    }
    updateDragTarget(e, activeSession);
  };

  const finishDrag = (cancelled: boolean) => {
    clearPageSwitchTimeout();
    const completedSession = dragSessionRef.current;
    if (!cancelled && completedSession?.target) {
      setHomeScreenItems((current) => {
        if (completedSession.validity === "swap" && completedSession.swapWithId) {
          return swapOneByOneItems(current, completedSession.itemId, completedSession.swapWithId);
        }
        if (completedSession.validity === "displace") {
          return placeItemWithDisplacement(
            current,
            completedSession.itemId,
            completedSession.target!,
            homeGridRows,
          );
        }
        if (completedSession.validity === "valid") {
          return placeItemAt(current, completedSession.itemId, completedSession.target!, homeGridRows);
        }
        return current;
      });
    }
    pendingItemPressRef.current = null;
    dragSessionRef.current = null;
    setDragSession(null);
    setTimeout(() => {
      suppressNextItemClickRef.current = false;
    }, 0);
  };

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (dragSessionRef.current || pendingItemPressRef.current) {
        handlePointerMove(e);
        return;
      }

      if (swipeStartRef.current) {
        const dx = e.clientX - swipeStartRef.current.x;
        const dy = e.clientY - swipeStartRef.current.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 10) {
          // User is moving! Cancel any active long press timers
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }

        // Update swipeOffset in real-time for physical feedback
        if (Math.abs(dx) > 10) {
          setSwipeOffset(dx);
        }
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      const wasDragging = Boolean(dragSessionRef.current);
      if (wasDragging) finishDrag(false);
      pendingItemPressRef.current = null;

      if (swipeStartRef.current && !wasDragging) {
        const dx = e.clientX - swipeStartRef.current.x;
        const dy = e.clientY - swipeStartRef.current.y;

        if (Math.abs(dx) > 50 && Math.abs(dy) < 100) {
          const totalPages = getHighestOccupiedPage(homeScreenItems) + 1;
          if (dx < -50 && currentPage < totalPages - 1) {
            setCurrentPage(prev => prev + 1);
          } else if (dx > 50 && currentPage > 0) {
            setCurrentPage(prev => prev - 1);
          }
        }
      }
      swipeStartRef.current = null;
      setSwipeOffset(0);
    };
    const handleGlobalPointerCancel = () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      pendingItemPressRef.current = null;
      swipeStartRef.current = null;
      setSwipeOffset(0);
      if (dragSessionRef.current) finishDrag(true);
    };

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp, { passive: true });
    window.addEventListener("pointercancel", handleGlobalPointerCancel, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerCancel);
    };
  }, [dragSession, currentPage, homeScreenItems, homeGridRows, isEditingHomeScreen]);

  const handleDesktopPointerDown = (e: React.PointerEvent) => {
    if (
      (e.target as HTMLElement).closest(".grid-item") || 
      (e.target as HTMLElement).closest(".dock-container") ||
      (e.target as HTMLElement).closest("button") ||
      (e.target as HTMLElement).closest("form") ||
      (e.target as HTMLElement).closest("input")
    ) {
      return;
    }

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    // Track swipe start on empty desktop as well
    swipeStartRef.current = { x: e.clientX, y: e.clientY };

    longPressTimerRef.current = setTimeout(() => {
      setIsEditingHomeScreen(true);
      setIsShowingAddWidget(true);
    }, 500);
  };

  const handleDesktopPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDesktopClick = (e: React.MouseEvent) => {
    if (
      isEditingHomeScreen &&
      !(e.target as HTMLElement).closest(".grid-item") &&
      !(e.target as HTMLElement).closest(".dock-container") &&
      !(e.target as HTMLElement).closest(".add-widget-sheet")
    ) {
      if (dragSession) finishDrag(true);
      setIsEditingHomeScreen(false);
    }
  };

  const handleAddWidget = (widgetType: "album" | "music" | "dual_music" | "anniversary" | "todo" | "calendar_album" | "welcome") => {
    if (widgetType === "welcome") {
      setSettings(prev => ({ ...prev, hideHomeWelcomeWidget: false }));
      setIsShowingAddWidget(false);
      return;
    }

    setHomeScreenItems((current) => {
      let size: HomeScreenItem["size"] = "2x2";
      let actualWidgetType: NonNullable<HomeScreenItem["widgetType"]> = "todo";

      if (widgetType === "calendar_album") {
        size = "2x4";
        actualWidgetType = "calendar-album";
      } else if (widgetType === "album") {
        size = "2x2";
        actualWidgetType = "album";
      } else if (widgetType === "dual_music") {
        size = "2x3";
        actualWidgetType = "dual-music";
      } else {
        size = "2x2";
        actualWidgetType = widgetType as any;
      }

      const position = findFirstAvailablePosition(current, size, 0, homeGridRows);
      if (!position) {
        setHomeLayoutError(`桌面已达到 ${MAX_HOME_PAGES} 页上限，无法添加更多小组件。`);
        return current;
      }
      const newWidget: HomeScreenItem = {
        id: `widget-${widgetType}-${Date.now()}`,
        type: "widget",
        widgetType: actualWidgetType,
        size,
        page: position.page,
        position,
      };

      setTimeout(() => setCurrentPage(position.page), 50);

      return [...current, newWidget];
    });
    setIsShowingAddWidget(false);
  };

  const handleRemoveWidget = (id: string) => {
    setHomeScreenItems(current => current.filter(item => item.id !== id));
    setDualMusicConfigs((configs) => configs.filter((config) => config.widgetId !== id));
  };

  const getWidgetComponent = (type?: string) => {
    switch (type) {
      case "album": return AlbumWidget;
      case "calendar-album": return CalendarAlbumWidget;
      case "music": return MusicWidget;
      case "dual-music": return DualMusicWidget;
      case "anniversary": return AnniversaryWidget;
      case "todo": default: return TodoWidget;
    }
  };

  const handleItemClick = (item: HomeScreenItem) => {
    if (isEditingHomeScreen || suppressNextItemClickRef.current) return;
    if (item.type === "app") {
      setActiveApp(item.id);
    }
  };
  useEffect(() => {
    if (!charactersPersistenceReady.current) {
      charactersPersistenceReady.current = true;
      return;
    }
    const result = saveCharacters(characters);
    if (!result.success) console.error("Failed to save characters to localStorage:", result.error);
  }, [characters]);

  useEffect(() => {
    if (!settingsChangedByUser.current) return;

    const result = saveSettings(settingsRef.current);
    if (result.success) {
      settingsChangedByUser.current = false;
    } else {
      console.error("Failed to save settings to localStorage:", result.error);
    }
  }, [settings]);

  useEffect(() => {
    if (!messagesPersistenceReady.current) {
      messagesPersistenceReady.current = true;
      return;
    }
    const result = saveMessages(messages);
    if (!result.success) console.error("Failed to save messages to localStorage:", result.error);
  }, [messages]);

  useEffect(() => {
    if (!momentsPersistenceReady.current) {
      momentsPersistenceReady.current = true;
      return;
    }
    const result = saveMoments(moments);
    if (!result.success) console.error("Failed to save moments to localStorage:", result.error);
  }, [moments]);

  useEffect(() => {
    if (!presetsPersistenceReady.current) {
      presetsPersistenceReady.current = true;
      return;
    }
    const result = savePresets(presets);
    if (!result.success) console.error("Failed to save presets to localStorage:", result.error);
  }, [presets]);

  useEffect(() => {
    try {
      localStorage.setItem("phone_music_tracks", JSON.stringify(tracks.map((track) =>
        track.isLocal ? { ...track, url: "" } : track)));
    } catch (e) {
      console.error("Failed to save tracks to localStorage:", e);
    }
  }, [tracks]);

  useEffect(() => { saveDualMusicWidgetConfigs(dualMusicConfigs); }, [dualMusicConfigs]);
  useEffect(() => { saveIdentityMusicStates(identityMusicStates); }, [identityMusicStates]);
  useEffect(() => { saveRelationshipMusicStates(relationshipMusicStates); }, [relationshipMusicStates]);

  useEffect(() => {
    try {
      localStorage.setItem("phone_music_playlists", JSON.stringify(playlists));
    } catch (e) {
      console.error("Failed to save playlists to localStorage:", e);
    }
  }, [playlists]);

  useEffect(() => {
    if (!calendarPersistenceReady.current) {
      calendarPersistenceReady.current = true;
      return;
    }
    const result = saveCalendarEvents(calendarEvents);
    if (!result.success) console.error("Failed to save calendar events to localStorage:", result.error);
  }, [calendarEvents]);

  useEffect(() => {
    if (!worldBookPersistenceReady.current) {
      worldBookPersistenceReady.current = true;
      return;
    }
    const result = saveWorldBookEntries(worldBookEntries);
    if (!result.success) console.error("Failed to save worldbook entries to localStorage:", result.error);
  }, [worldBookEntries]);

  useEffect(() => {
    if (!memoriesPersistenceReady.current) {
      memoriesPersistenceReady.current = true;
      return;
    }
    if (skipNextMemoriesPersistenceRef.current) {
      skipNextMemoriesPersistenceRef.current = false;
      return;
    }
    const result = saveMemories(memories);
    if (!result.success) console.error("Failed to save memories to localStorage:", result.error);
  }, [memories]);

  useEffect(() => {
    if (!memorySettingsPersistenceReady.current) {
      memorySettingsPersistenceReady.current = true;
      return;
    }
    const result = saveMemorySettings(recallSettings);
    if (!result.success) console.error("Failed to save memory settings to localStorage:", result.error);
  }, [recallSettings]);

  useEffect(() => {
    if (!offlineStoriesPersistenceReady.current) {
      offlineStoriesPersistenceReady.current = true;
      return;
    }
    const result = saveOfflineStories(offlineStories);
    if (!result.success) console.error("Failed to save offline stories to localStorage:", result.error);
  }, [offlineStories]);

  useEffect(() => {
    if (!relationshipsPersistenceReady.current) {
      relationshipsPersistenceReady.current = true;
      return;
    }
    const result = saveRelationships(relationships);
    if (!result.success) console.error("Failed to save relationships to localStorage:", result.error);
  }, [relationships]);

  // Global Scroll Event Capture to handle show-on-scroll custom thin scrollbars
  useEffect(() => {
    const scrollTimeoutMap = new Map<HTMLElement, any>();

    const handleScrollCapture = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      // Add the scrolling tracking class
      target.classList.add("is-scrolling");

      // Clear any existing idle timeout for this scrolling element
      if (scrollTimeoutMap.has(target)) {
        clearTimeout(scrollTimeoutMap.get(target));
      }

      // Hide scrollbar after 1000ms of scrolling inactivity
      const timeout = setTimeout(() => {
        target.classList.remove("is-scrolling");
        scrollTimeoutMap.delete(target);
      }, 1000);

      scrollTimeoutMap.set(target, timeout);
    };

    // Capture phase true allows intercepting all scroll events on any child element
    window.addEventListener("scroll", handleScrollCapture, true);
    return () => {
      window.removeEventListener("scroll", handleScrollCapture, true);
      scrollTimeoutMap.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  // Handle character creation & updates
  const handleSaveCharacter = (char: Character) => {
    setCharacters((prev) => {
      const exists = prev.some((c) => c.id === char.id);
      if (exists) {
        return prev.map((c) => (c.id === char.id ? char : c));
      }
      return [...prev, char];
    });
  };

  const handleDeleteCharacter = (id: string, skipConfirm = false) => {
    if (skipConfirm || confirm("确定要删除这名角色人设吗？删除后其相关聊天和动态也将被清空。")) {
      // A previous bad merge could leave a relationship pointing to a contact
      // copy. Delete that legacy reference together with its archive profile,
      // otherwise it remains visible in the address book after archive deletion.
      const characterIds = new Set<string>(characters
        .filter((character) => character.id === id || character.profileSourceId === id)
        .map((character) => character.id));
      characterIds.add(id);
      const deletedCharacterIds = [...characterIds];
      const relationIds = relationships
        .filter((relation) => characterIds.has(relation.characterId))
        .map((relation) => relation.id);
      removeCharacterLifeEventsForRelations(relationIds);
      removeCharacterTruthForRelations(relationIds);
      removeMomentTopicsForCharacters(deletedCharacterIds);
      removeProactiveTopicsForRelations(relationIds);
      removeProactiveTopicsForCharacters(deletedCharacterIds);
      const cleaned = removeCanonicalCharacterData(
        { relationships, messages, memories, offlineStories },
        id,
        deletedCharacterIds,
      );
      try {
        const parsed = JSON.parse(localStorage.getItem(RED_PACKET_STATUSES_KEY) || "{}") as RedPacketStatusMap;
        const removedMessages = messages.filter((message) => relationIds.includes(message.relationId || "") || characterIds.has(message.characterId));
        const withoutRelations = relationIds.reduce((statuses, relationId) => removePaymentStatusesByRelation(statuses, relationId), parsed);
        localStorage.setItem(RED_PACKET_STATUSES_KEY, JSON.stringify(removePaymentStatusesForMessages(withoutRelations, removedMessages)));
      } catch (error) {
        console.warn("Unable to clear payment state for deleted character:", error);
      }
      setCharacters((prev) => prev
        .filter((character) => !characterIds.has(character.id))
        .map((character) => character.isGroupChat && character.memberIds
          ? { ...character, memberIds: character.memberIds.filter((memberId) => !characterIds.has(memberId)) }
          : character));
      setRelationships(cleaned.relationships);
      setMessages(cleaned.messages);
      setMemories(cleaned.memories);
      setOfflineStories(cleaned.offlineStories);
      const musicCleanup = removeMusicDataByRelations(dualMusicConfigs, relationshipMusicStates, relationIds);
      setDualMusicConfigs(musicCleanup.configs);
      setRelationshipMusicStates(musicCleanup.states);
      const forumCleanup = cleanupForumDataForDeletedCharacter({
        shares: loadForumShares().value,
        threads: loadForumThreads().value,
        relationIds,
        characterIds: deletedCharacterIds,
      });
      const forumReplies = loadForumReplies().value.map((reply) =>
        reply.privateActor?.kind === "relationship" && relationIds.includes(reply.privateActor.relationId)
          ? (() => { const { privateActor: _privateActor, ...publicReply } = reply; return publicReply; })()
          : reply);
      commitForumMutation({
        shares: forumCleanup.shares,
        threads: forumCleanup.threads,
        replies: forumReplies,
        generationTasks: removeForumGenerationTasksByRelations(
          loadForumGenerationTasks().value,
          relationIds,
        ),
        actorStates: loadForumActorStates().value.filter((state) =>
          state.actor.kind !== "relationship" || !relationIds.includes(state.actor.relationId)),
        activityTasks: loadForumActivityTasks().value.map((task) => ({
          ...task,
          pendingEvents: task.pendingEvents.filter((event) => event.privateActor?.kind !== "relationship" || !relationIds.includes(event.privateActor.relationId)),
        })),
      });
      cleanupForumDmForRelations(relationIds);
      const diaryCleanup = cleanupDiaryForRelations({
        relationIds,
        entries: loadDiaryEntries().value,
        shares: loadDiaryShares().value,
        tasks: loadDiaryGenerationTasks().value,
        translations: loadDiaryTranslations().value,
      });
      saveDiaryEntries(diaryCleanup.entries);
      saveDiaryShares(diaryCleanup.shares);
      saveDiaryGenerationTasks(diaryCleanup.tasks);
      saveDiaryTranslations(diaryCleanup.translations);
      relationIds.forEach((relationId) => {
        localStorage.removeItem(getOfflineModeStorageKey(relationId));
        localStorage.removeItem(getOfflineStoryStorageKey(relationId));
      });
      // Relation-aware UI state is intentionally stored as maps keyed by the
      // relation ID. Remove only the deleted character's relation entries.
      ["phone_initiated_chat_ids", "phone_last_read_timestamps"].forEach((key) => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          const next = Array.isArray(parsed)
            ? parsed.filter((value) => !relationIds.includes(value))
            : Object.fromEntries(Object.entries(parsed).filter(([relationId]) => !relationIds.includes(relationId)));
          localStorage.setItem(key, JSON.stringify(next));
        } catch (error) {
          console.warn(`Unable to clear relationship state from ${key}:`, error);
        }
      });
      setMoments((prev) => prev.filter((moment) => !characterIds.has(moment.characterId)));
      // Inner voices are private chat-experience records and must not survive
      // deletion of their canonical character.
      const innerVoices = loadInnerVoiceRecords([]).value;
      const remainingInnerVoices = deletedCharacterIds.reduce<InnerVoiceRecord[]>(
        (records, characterId) => removeInnerVoicesByCharacter(records, characterId),
        innerVoices,
      );
      if (remainingInnerVoices.length !== innerVoices.length) saveInnerVoiceRecords(remainingInnerVoices);
      const imageRecords = loadImageGenerationRecords([]).value;
      const remainingImageRecords = deletedCharacterIds.reduce(
        (records, characterId) => removeImageGenerationRecordsByCharacter(records, characterId),
        imageRecords,
      );
      const removedImageAssetIds = imageRecords.filter((record) => !remainingImageRecords.some((next) => next.id === record.id)).map((record) => record.imageAssetId);
      if (remainingImageRecords.length !== imageRecords.length) {
        saveImageGenerationRecords(remainingImageRecords);
        removedImageAssetIds.forEach((assetId) => imageAssetDb.deleteImage(assetId).catch((error) => console.warn("Failed to delete generated image asset:", error)));
      }
      deletedCharacterIds.forEach((characterId) => {
        const character = characters.find((item) => item.id === characterId);
        if (character?.imageReferenceAssetId) imageAssetDb.deleteImage(character.imageReferenceAssetId).catch((error) => console.warn("Failed to delete character reference image:", error));
      });
      setActiveChatCharId((current) => current && characterIds.has(current) ? null : current);
      setActiveChatRelationId((current) => current && relationIds.includes(current) ? null : current);
      setGlobalNotification((current) => current?.characterId && characterIds.has(current.characterId) ? null : current);
    }
  };

  const handleClearMessages = (characterId: string, keepLastCount?: number, relationId?: string) => {
    setMessages((prev) => {
      const matches = (message: Message) => relationId ? message.relationId === relationId : message.characterId === characterId;
      const charMsgs = prev.filter(matches);
      if (typeof keepLastCount === "number" && keepLastCount > 0) {
        const toKeep = charMsgs.slice(-keepLastCount);
        const others = prev.filter((m) => !matches(m));
        return [...others, ...toKeep];
      }
      return prev.filter((m) => !matches(m));
    });
  };

  // Chat message send handler
  const handleSendMessage = (msg: Message) => {
    const isGroupMessage = characters.some((character) => character.id === msg.characterId && character.isGroupChat);
    let messageToSave = msg;
    if (!isGroupMessage) {
      const relationship = msg.relationId ? relationships.find((item) => item.id === msg.relationId) : undefined;
      if (!relationship
        || relationship.characterId !== msg.characterId
        || (msg.conversationId && msg.conversationId !== (relationship.conversationId || getConversationId(relationship.id)))) {
        console.warn("Direct message write rejected because its relationship scope is missing or inconsistent.", msg.id);
        return;
      }
      messageToSave = { ...msg, conversationId: relationship.conversationId || getConversationId(relationship.id) };
    }
    setMessages((prev) => [...prev, messageToSave]);

    // Update character's last active time on message exchange
      if (messageToSave.relationId) {
        setRelationships((previous) => previous.map((relation) => relation.id === messageToSave.relationId ? { ...relation, lastActiveTime: Date.now(), updatedAt: Date.now() } : relation));
      }

    // Check if auto-translation is enabled and the message needs translation
    const char = characters.find((c) => c.id === messageToSave.characterId);
    if (
      char &&
      char.enableAutoTranslate &&
      messageToSave.sender === "character" &&
      !messageToSave.isNarration &&
      !messageToSave.content.startsWith("data:image/") &&
      !messageToSave.content.startsWith("[红包]")
    ) {
      // Check if text is non-Chinese
      const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(messageToSave.content);
      const hasKorean = /[\uac00-\ud7af]/.test(messageToSave.content);
      const hasChinese = /[\u4e00-\u9fa5]/.test(messageToSave.content);
      const hasEnglish = /[a-zA-Z]{3,}/.test(messageToSave.content);
      const isNonChinese = hasJapanese || hasKorean || (!hasChinese && hasEnglish);

      if (isNonChinese) {
        apiTranslate({
          text: messageToSave.content,
          apiKey: settings.apiKey || "",
          model: settings.selectedModel,
          apiEndpoint: settings.apiEndpoint,
        })
          .then((res) => {
            if (res && res.text && res.text !== messageToSave.content) {
              setMessages((prev) =>
                prev.map((m) => (m.id === messageToSave.id && messageMatchesMutationScope(m, messageToSave) ? { ...m, translation: res.text } : m))
              );
            }
          })
          .catch((err) => {
            console.error("Auto translation error:", err);
          });
      }
    }
  };

  const handleToggleBookmark = (id: string, scope?: MessageMutationScope) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && messageMatchesMutationScope(m, scope) ? { ...m, isBookmarked: !m.isBookmarked } : m))
    );
  };

  const handleDeleteMessage = (id: string, scope?: MessageMutationScope) => {
    const deletedMessage = messages.find((message) => message.id === id && messageMatchesMutationScope(message, scope));
    if (!deletedMessage) return;
    const sourceRelation = deletedMessage.relationId
      ? relationships.find((relation) => relation.id === deletedMessage.relationId)
      : undefined;
    const sourceScope = sourceRelation
      ? {
        relationId: sourceRelation.id,
        characterId: sourceRelation.characterId,
        userIdentityId: sourceRelation.userIdentityId,
        conversationId: sourceRelation.conversationId,
      }
      : undefined;
    // Source-linked truth is retained for auditability but cannot remain
    // active after its evidence message is deleted.
    retractBySourceMessageIds([id], sourceScope);
    retractConversationSummariesBySourceMessageIds([id], sourceScope);
    retractBehaviorCorrectionsBySourceMessageIds([id], sourceScope);
    setMessages((prev) => prev.filter((m) => m.id !== id || !messageMatchesMutationScope(m, scope)));
  };

  const handleUpdateMessage = (id: string, updatedFields: Partial<Message>, scope?: MessageMutationScope) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && messageMatchesMutationScope(m, scope) ? { ...m, ...updatedFields } : m))
    );
  };

  // Moments Handlers
  const handleAddMoment = (newMo: Moment) => {
    const content = sanitizeMomentPublishText(newMo.content);
    if (!content && !newMo.image && !newMo.imageDescription) return;
    setMoments((prev) => [{
      ...newMo,
      content,
      comments: newMo.comments
        .map((comment) => ({ ...comment, content: sanitizeMomentPublishText(comment.content) }))
        .filter((comment) => Boolean(comment.content)),
    }, ...prev]);
  };

  const handleLikeMoment = (id: string, userName: string) => {
    setMoments((prev) =>
      prev.map((mom) => {
        if (mom.id === id) {
          const liked = mom.likes.includes(userName);
          return {
            ...mom,
            likes: liked ? mom.likes.filter((n) => n !== userName) : [...mom.likes, userName],
          };
        }
        return mom;
      })
    );
  };

  const handleDeleteMoment = (momentId: string) => {
    const deletedMoment = moments.find((moment) => moment.id === momentId);
    if (deletedMoment) {
      if (!recordDeletedCharacterMoment(deletedMoment)) {
        console.error("Failed to persist deleted character Moment generation task.");
      }
      setMemories((previous) => removeMemoriesForMoment(previous, deletedMoment));
    }
    removeMomentTopicsForMoments([momentId]);
    setMoments((prev) => {
      return prev.filter((moment) => moment.id !== momentId);
    });
  };

  const handleDeleteMomentsByRelation = (relationId: string) => {
    const removedMomentIds = moments.filter((moment) => moment.relationId === relationId).map((moment) => moment.id);
    removeMomentTopicsForMoments(removedMomentIds);
    setMoments((previous) => previous.filter((moment) => moment.relationId !== relationId));
  };

  const handleAddCommentToMoment = (momentId: string, comment: MomentComment) => {
    const content = sanitizeMomentPublishText(comment.content);
    if (!content) return;
    setMoments((prev) =>
      prev.map((mom) => {
        if (mom.id === momentId) {
          return {
            ...mom,
            comments: [...mom.comments, { ...comment, content }],
          };
        }
        return mom;
      })
    );
  };

  const handleDeleteCommentFromMoment = (momentId: string, commentId: string) => {
    setMoments((prev) =>
      prev.map((mom) =>
        mom.id === momentId
          ? {
              ...mom,
              comments: mom.comments.filter((comment) => comment.id !== commentId),
              deletedCommentIds: mom.comments.some((comment) => comment.id === commentId)
                ? mom.deletedCommentIds
                : [...(mom.deletedCommentIds || []), commentId],
            }
          : mom
      )
    );
  };

  // Worldbook handlers
  const handleSaveWorldBookEntry = (entry: WorldBookEntry) => {
    setWorldBookEntries((prev) => {
      let next;
      const exists = prev.some((e) => e.id === entry.id);
      if (exists) {
        next = prev.map((e) => (e.id === entry.id ? entry : e));
      } else {
        next = [entry, ...prev];
      }
      return next;
    });
  };

  const handleSaveWorldBookEntries = (entries: WorldBookEntry[]) => {
    setWorldBookEntries((prev) => {
      const incomingIds = new Set(entries.map(e => e.id));
      const filtered = prev.filter(e => !incomingIds.has(e.id));
      const next = [...entries, ...filtered];
      return next;
    });
  };

  const handleDeleteWorldBookEntry = (id: string) => {
    setWorldBookEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      return next;
    });
  };

  // Calendar Schedule handlers
  const handleAddCalendarEvent = (ev: CalendarEvent) => {
    setCalendarEvents((prev) => [...prev, ev]);
  };

  const handleToggleCalendarEventDone = (id: string) => {
    setCalendarEvents((prev) =>
      prev.map((ev) => (ev.id === id ? { ...ev, isDone: !ev.isDone } : ev))
    );
  };

  const handleDeleteCalendarEvent = (id: string) => {
    setCalendarEvents((prev) => prev.filter((ev) => ev.id !== id));
  };

  // Music Handlers
  const handleAddMusicTrack = (track: MusicTrack) => {
    setTracks((prev) => [...prev, track]);
  };

  const handleDeleteMusicTrack = (id: string) => {
    const track = tracks.find((item) => item.id === id);
    if (track?.isLocal) {
      audioDb.deleteTrackFile(getTrackAudioAssetId(track)).catch((err) => {
        console.error("Failed to delete local track from IndexedDB:", err);
      });
    }
    if (track?.coverAssetId) {
      audioDb.deleteTrackCover(track.coverAssetId).catch((err) => {
        console.error("Failed to delete local track cover:", err);
      });
    }
    if (track?.url?.startsWith("blob:")) URL.revokeObjectURL(track.url);
    setTracks((prev) => prev.filter((item) => item.id !== id));
    setPlaylists((prev) => prev.map((playlist) => ({ ...playlist, tracks: playlist.tracks.filter((trackId) => trackId !== id) })));
    const cleaned = removeMusicTrackReferences(identityMusicStates, relationshipMusicStates, id);
    setIdentityMusicStates(cleaned.identityStates);
    setRelationshipMusicStates(cleaned.relationshipStates);
    if (currentTrack?.id === id) {
      globalAudioRef.current?.pause();
      if (globalAudioRef.current) globalAudioRef.current.removeAttribute("src");
      setCurrentTrack(null);
      setIsPlaying(false);
      setPlaybackOrigin(null);
    }
  };

  const refreshRelationshipMusic = async (relationId: string) => {
    if (musicRecommendationInFlightRef.current.has(relationId)) return;
    const relationship = relationships.find((item) => item.id === relationId);
    if (!relationship) return;
    const characterId = resolveCanonicalCharacterId(relationship.characterId, characters);
    const character = characters.find((item) => item.id === characterId);
    if (!character || character.isGroupChat) return;
    if (!tracks.length) {
      setMusicRecommendationError("请先在音乐库添加歌曲。");
      return;
    }
    musicRecommendationInFlightRef.current.add(relationId);
    setMusicRecommendationRelationId(relationId);
    setMusicRecommendationError(null);
    try {
      const recommendation = await recommendDualMusicTrack({
        tracks,
        character,
        relationship,
        messages,
        memories,
        currentState: relationshipMusicStates.find((state) => state.relationId === relationId),
        settings,
        requestAi: apiChat,
      });
      if (!recommendation) {
        setMusicRecommendationError("暂时没有选到合适的歌曲，可以稍后重试。");
        return;
      }
      setRelationshipMusicStates((states) => applyRelationshipRecommendation(states, {
        relationship,
        characterId,
        recommendation,
      }));
    } catch {
      setMusicRecommendationError("选歌失败，已保留原来的歌曲。");
    } finally {
      musicRecommendationInFlightRef.current.delete(relationId);
      setMusicRecommendationRelationId(null);
    }
  };

  const handleBindMusicRelationship = (widgetId: string, relationId: string) => {
    const ownerIdentityId = settings.activeIdentityId || DEFAULT_IDENTITY_ID;
    const relationship = relationships.find((item) =>
      item.id === relationId && item.userIdentityId === ownerIdentityId);
    if (!relationship) {
      setMusicRecommendationError("该好友不属于当前身份，无法绑定。");
      return;
    }
    const characterId = resolveCanonicalCharacterId(relationship.characterId, characters);
    setDualMusicConfigs((configs) => bindDualMusicWidget(configs, {
      widgetId,
      ownerIdentityId,
      relationId,
      characterId,
    }));
    if (!relationshipMusicStates.some((state) => state.relationId === relationId)) {
      void refreshRelationshipMusic(relationId);
    }
  };

  const handleDeleteRelationshipMusic = (relationId: string) => {
    setDualMusicConfigs((configs) => configs.map((config) => config.relationId === relationId
      ? { ...config, relationId: undefined, characterId: undefined, updatedAt: Date.now() }
      : config));
    setRelationshipMusicStates((states) => states.filter((state) => state.relationId !== relationId));
  };

  useEffect(() => {
    if (activeApp !== null) return;
    const ownerIdentityId = settings.activeIdentityId || DEFAULT_IDENTITY_ID;
    const now = Date.now();
    const dueRelationIds = new Set<string>(dualMusicConfigs
      .filter((config) =>
        config.ownerIdentityId === ownerIdentityId
        && config.relationId
        && homeScreenItems.some((item) =>
          item.id === config.widgetId && item.widgetType === "dual-music" && item.page === currentPage))
      .map((config) => config.relationId!)
      .filter((relationId) => {
        const state = relationshipMusicStates.find((item) => item.relationId === relationId);
        return !state || (state.nextRefreshAt !== undefined && state.nextRefreshAt <= now);
      }));
    dueRelationIds.forEach((relationId) => { void refreshRelationshipMusic(relationId); });
  }, [activeApp, currentPage, dualMusicConfigs, homeScreenItems, relationshipMusicStates, settings.activeIdentityId, tracks.length]);

  const handleAddMusicPlaylist = (pl: MusicPlaylist) => {
    setPlaylists((prev) => {
      const exists = prev.some((p) => p.id === pl.id);
      if (exists) {
        return prev.map((p) => (p.id === pl.id ? pl : p));
      }
      return [...prev, pl];
    });
  };

  const handleDeleteMusicPlaylist = (id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  };

  // Preset Handlers
  const handleSavePreset = (preset: StylePreset) => {
    setPresets((prev) => [...prev, preset]);
  };

  const handleDeletePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  // Desktop App Items rendering configuration
  const desktopApps = [
    {
      id: "chat",
      name: "聊天",
      icon: AppIcons.chat(),
    },
    {
      id: "archives",
      name: "档案馆",
      icon: AppIcons.archives(),
    },
    {
      id: "worldbook",
      name: "世界书",
      icon: AppIcons.worldbook(),
    },
    {
      id: "music",
      name: "音乐",
      icon: AppIcons.music(),
    },
    {
      id: "forum",
      name: "论坛",
      icon: AppIcons.forum(),
    },
    {
      id: "store",
      name: "应用商店",
      icon: AppIcons.store(),
    },
    {
      id: "notes",
      name: "备忘录",
      icon: AppIcons.notes(),
    },
    {
      id: "diary",
      name: "日记",
      icon: AppIcons.diary(),
    },
    {
      id: "memory",
      name: "记忆书",
      icon: AppIcons.memory(),
    },
    {
      id: "offline",
      name: "线下",
      icon: AppIcons.offline(),
    },
    {
      id: "settings",
      name: "设置",
      icon: AppIcons.settings(),
    }
  ];
  const activeIdentityId = settings.activeIdentityId || DEFAULT_IDENTITY_ID;
  const activeIdentity = settings.identities?.find((identity) => identity.id === activeIdentityId) || {
    id: activeIdentityId,
    name: settings.name,
    avatar: settings.avatar,
    signature: settings.signature,
    bio: settings.bio,
  };
  // Keep forum activity processing alive while the user navigates between apps.
  // The engine still respects document visibility and persists all pending work.
  useForumActivityEngine({
    ownerIdentityId: activeIdentity.id,
    relationships,
    characters,
    messages,
    memories,
    worldBookEntries,
    settings,
  });
  const availableMusicRelationships = relationships
    .filter((relationship) => relationship.userIdentityId === activeIdentityId)
    .map((relationship) => ({
      relationship,
      character: characters.find((character) =>
        character.id === resolveCanonicalCharacterId(relationship.characterId, characters)),
    }))
    .filter((item): item is { relationship: CharacterRelationship; character: Character } =>
      Boolean(item.character && !item.character.isGroupChat));

  return (
    <div
      className="app-viewport-root min-h-0 md:min-h-screen w-full bg-[#f3f4f6] flex items-start md:items-center justify-center p-0 md:p-6 select-none bg-gradient-to-br from-[#f5f5f7] to-[#e5e5eb] overflow-hidden"
      data-app-shell
      data-pwa-standalone={isStandaloneMode ? "true" : "false"}
      style={{
        position: (typeof window !== "undefined" && window.innerWidth < 768) ? "fixed" : "relative",
        top: (typeof window !== "undefined" && window.innerWidth < 768) ? 0 : undefined,
        left: (typeof window !== "undefined" && window.innerWidth < 768) ? 0 : undefined,
        width: "100%",
        height: (typeof window !== "undefined" && window.innerWidth < 768) ? "var(--app-viewport-height, 100dvh)" : "100dvh",
        minHeight: (typeof window !== "undefined" && window.innerWidth < 768) ? 0 : undefined,
      }}
    >
      
      {/* Live Custom CSS Styling injection */}
      <style>{`
        @media (max-width: 767px) {
          html, body {
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
        :root, .phone-screen-container {
          --app-icon-radius: ${settings.iconBorderRadius !== undefined ? settings.iconBorderRadius : 35}%;
          --app-icon-bg-opacity: ${(settings.iconBgOpacity !== undefined ? settings.iconBgOpacity : 100) / 100};
          --app-icon-border-width: ${settings.iconBorderWidth !== undefined ? settings.iconBorderWidth : 1}px;
          --app-icon-border-opacity: ${(settings.iconBorderOpacity !== undefined ? settings.iconBorderOpacity : 100) / 100};
          --app-default-icon-color: ${settings.desktopIconMode === "dark" ? "#1d1d1f" : "#f3f3f5"};
          --app-default-icon-surface: ${hexToRgba(settings.desktopIconMode === "dark" ? "#ffffff" : "#17181b", settings.iconBgOpacity !== undefined ? settings.iconBgOpacity : 100)};
          --app-default-icon-border: ${settings.desktopIconMode === "dark" ? "#e5e5e2" : "#2d2e33"};
          --desktop-app-text-color: ${settings.desktopAppTextColor || "#ffffff"};
        }
        .phone-screen-container .app-icon-surface {
          background-color: var(--app-default-icon-surface) !important;
          border-color: var(--app-default-icon-border) !important;
          color: var(--app-default-icon-color) !important;
        }
        .phone-screen-container .app-icon-surface .app-default-icon {
          color: inherit !important;
        }
        .phone-screen-container .app-icon-surface.transparent-custom-icon {
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        .phone-screen-container .home-screen-drag-surface,
        .phone-screen-container .home-screen-drag-surface * {
          -webkit-touch-callout: none !important;
        }
        .phone-screen-container .home-screen-drag-surface img {
          -webkit-user-drag: none !important;
          user-select: none !important;
        }
        .phone-screen-container .desktop-app-label {
          color: var(--desktop-app-text-color) !important;
        }
        .phone-screen-container div[style*="--app-icon-radius"]:not(.app-icon-surface),
        .phone-screen-container button[style*="--app-icon-radius"]:not(.app-icon-surface),
        .phone-screen-container div.bg-white[style*="--app-icon-radius"]:not(.app-icon-surface),
        .phone-screen-container button.bg-white[style*="--app-icon-radius"]:not(.app-icon-surface) {
          background-color: rgba(255, 255, 255, var(--app-icon-bg-opacity, 1)) !important;
          border-width: var(--app-icon-border-width, 1px) !important;
          border-color: rgba(240, 240, 243, var(--app-icon-border-opacity, 1)) !important;
          border-style: solid !important;
        }
        body, button, input, textarea, select, div, p, span, h1, h2, h3, h4, h5, h6 {
          font-family: "PingFang SC", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif !important;
        }

        /* FIGMA SPECIFICATION OVERRIDES FOR ALL PAGES & COMPONENTS */

        /* 1. Base Colors and Backgrounds: Pure White Canvas & Monochrome Scheme */
        .phone-screen-container .bg-slate-50,
        .phone-screen-container .bg-slate-100,
        .phone-screen-container .bg-stone-50,
        .phone-screen-container .bg-stone-100,
        .phone-screen-container .bg-gray-50,
        .phone-screen-container .bg-gray-100,
        .phone-screen-container .bg-neutral-50,
        .phone-screen-container .bg-neutral-100,
        .phone-screen-container .bg-zinc-50,
        .phone-screen-container .bg-zinc-100,
        .phone-screen-container .bg-[#f3f4f6],
        .phone-screen-container .bg-[#fafafa],
        .phone-screen-container .bg-[#f7f7f7],
        .phone-screen-container .bg-white/80,
        .phone-screen-container .bg-white/90,
        .phone-screen-container .bg-stone-900/10,
        .phone-screen-container .bg-stone-900/20,
        .phone-screen-container .bg-stone-900/80,
        .phone-screen-container .bg-neutral-900/95 {
          background-color: var(--surface) !important;
          background-image: none !important;
          color: var(--text-primary) !important;
        }

        /* Ensure all card/panel containers are white */
        .phone-screen-container div.bg-white:not(.app-icon-surface),
        .phone-screen-container div.bg-stone-50,
        .phone-screen-container div.bg-slate-50 {
          background-color: var(--surface) !important;
        }

        /* 2. Unified Container Radius: form controls are handled separately below. */
        .phone-screen-container .rounded-xl,
        .phone-screen-container .rounded-2xl,
        .phone-screen-container .rounded-3xl,
        .phone-screen-container .rounded-lg,
        .phone-screen-container .rounded-md,
        .phone-screen-container .rounded-[18px],
        .phone-screen-container .rounded-[20px],
        .phone-screen-container .rounded-[22px],
        .phone-screen-container .rounded-[26px],
        .phone-screen-container .rounded-[40px],
        .phone-screen-container .rounded-full:not(img):not(.avatar-img):not(.avatar-icon):not(input):not(select):not(textarea),
        .phone-screen-container button,
        .phone-screen-container [class*="rounded-"]:not(img):not(.avatar-img):not(.avatar-icon):not(input):not(select):not(textarea),
        .phone-screen-container .back-btn,
        .phone-screen-container #schedule_back_btn,
        .phone-screen-container .chat-bubble-self,
        .phone-screen-container .chat-bubble-other,
        .phone-screen-container div[class*="bg-indigo-600"],
        .phone-screen-container div[class*="bg-slate-200"],
        .phone-screen-container div[class*="bg-stone-100"] {
          border-radius: 32px !important;
        }

        /* 3. Strict 16px Padding & Gap of 12px */
        .phone-screen-container .p-3,
        .phone-screen-container .p-4,
        .phone-screen-container .p-5,
        .phone-screen-container .p-6,
        .phone-screen-container .px-4,
        .phone-screen-container .py-4,
        .phone-screen-container .px-5,
        .phone-screen-container .py-5 {
          padding: 16px !important;
        }

        .phone-screen-container .gap-3,
        .phone-screen-container .gap-4,
        .phone-screen-container .gap-5,
        .phone-screen-container .space-y-3,
        .phone-screen-container .space-y-4,
        .phone-screen-container .space-y-5 {
          gap: 12px !important;
        }

        /* 4. Stroke Style: 1px Inside Subtle Outlines on Inputs, Cards, and Selectors */
        .phone-screen-container input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="file"]),
        .phone-screen-container textarea,
        .phone-screen-container select,
        .phone-screen-container .border,
        .phone-screen-container .border-slate-100,
        .phone-screen-container .border-slate-200,
        .phone-screen-container .border-stone-100,
        .phone-screen-container .border-stone-200,
        .phone-screen-container .border-neutral-200/20 {
          border-width: 1px !important;
          border-style: solid !important;
          border-color: var(--border) !important;
        }

        /* Form controls use a fixed rectangular radius; never inherit avatar/pill rounding. */
        .phone-screen-container input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="file"]),
        .phone-screen-container textarea,
        .phone-screen-container select {
          border-radius: 14px;
          background-color: var(--input-bg) !important;
          color: var(--text-primary) !important;
          box-shadow: 0 4px 12px var(--shadow-color) !important;
          outline: none !important;
        }

        /* Settings pages use one consistent card primitive across every secondary tab. */
        .phone-screen-container [data-settings-shell] .settings-card {
          border-radius: 16px !important;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06) !important;
          background: var(--surface) !important;
          border-color: var(--border) !important;
        }
        .phone-screen-container [data-settings-shell] .bg-white.p-5 {
          border-radius: 16px !important;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06) !important;
          background: var(--surface) !important;
          border-color: var(--border) !important;
        }
        .phone-screen-container [data-settings-shell] .settings-section-header {
          color: var(--text-tertiary);
          font-size: 14px;
          line-height: 20px;
          padding-inline: 4px;
        }
        .phone-screen-container [data-settings-shell] [data-settings-beauty] [class~="rounded-[24px]"] {
          border-radius: 16px !important;
        }
        .phone-screen-container [data-settings-shell] .settings-compact-toggle {
          width: 42px;
          height: 24px;
          border-radius: 12px !important;
        }
        .phone-screen-container [data-settings-shell] button[role="switch"] {
          width: 42px;
          height: 24px;
          border-radius: 12px !important;
        }
        .phone-screen-container [data-settings-shell] button[role="switch"] > span {
          width: 20px;
          height: 20px;
          border-radius: 50% !important;
        }
        .phone-screen-container [data-settings-shell] .settings-compact-toggle > span,
        .phone-screen-container [data-settings-shell] .settings-compact-toggle > div {
          width: 20px;
          height: 20px;
          border-radius: 50% !important;
        }
        .phone-screen-container [data-settings-shell] .settings-compact-toggle > div {
          flex: 0 0 20px;
        }
        .phone-screen-container [data-settings-shell] .settings-card button:not([role="switch"]),
        .phone-screen-container [data-settings-shell] .bg-white.p-5 button:not([role="switch"]) {
          border-radius: 12px !important;
        }

        /* Shared settings primitives for feature pages outside the main settings shell. */
        .phone-screen-container .settings-panel-card {
          background: var(--surface) !important;
          border: 1px solid var(--border) !important;
          border-radius: 16px !important;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06) !important;
        }
        .phone-screen-container .settings-wide-action-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }
        .phone-screen-container .settings-wide-action {
          width: 100%;
          min-height: 44px;
          border-radius: 12px !important;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
          font-size: 14px;
          font-weight: 600;
          line-height: 20px;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }
        .phone-screen-container .settings-wide-action-primary {
          background: var(--text-primary) !important;
          color: var(--surface) !important;
          border: 1px solid var(--text-primary) !important;
        }
        .phone-screen-container .settings-wide-action-primary:hover {
          background: var(--text-secondary) !important;
        }
        .phone-screen-container .settings-wide-action-secondary {
          background: var(--surface) !important;
          color: var(--text-primary) !important;
          border: 1px solid var(--border) !important;
        }
        .phone-screen-container .settings-wide-action-secondary:hover {
          background: var(--surface-raised) !important;
        }

        /* Diary editing follows the compact offline-story card geometry. */
        .phone-screen-container [data-theme-page="diary"] .diary-editor-field {
          border-radius: 16px !important;
        }

        /* 5. Minimal Shadow Style (Shadows/Base/6) */
        .phone-screen-container .shadow,
        .phone-screen-container .shadow-sm,
        .phone-screen-container .shadow-md,
        .phone-screen-container .shadow-lg,
        .phone-screen-container .shadow-xl,
        .phone-screen-container .shadow-2xl {
          box-shadow: 0 4px 12px var(--shadow-color) !important;
        }

        /* 6. Typography & Text Levels Hierarchy */
        .phone-screen-container h1,
        .phone-screen-container h2,
        .phone-screen-container .font-bold.text-slate-800 {
          color: var(--text-primary) !important;
          font-weight: 800 !important;
          letter-spacing: -0.025em !important;
        }

        .phone-screen-container h3,
        .phone-screen-container h4 {
          color: var(--text-primary) !important;
          font-weight: 600 !important;
        }

        /* Unified Form Field Labels: size 11px, color #52525b */
        .phone-screen-container label,
        .phone-screen-container .block.text-xs.font-semibold.text-slate-500,
        .phone-screen-container .text-xs.font-semibold.text-slate-500,
        .phone-screen-container .text-xs.font-extrabold.text-stone-600,
        .phone-screen-container .text-xs.font-extrabold.text-stone-500,
        .phone-screen-container .text-xs.font-extrabold.text-slate-600,
        .phone-screen-container .text-xs.font-extrabold.text-slate-500,
        .phone-screen-container [class*="text-xs"][class*="font-extrabold"][class*="text-stone-"],
        .phone-screen-container [class*="text-xs"][class*="font-semibold"][class*="text-slate-"],
        .phone-screen-container [class*="text-xs"][class*="font-bold"][class*="text-stone-"] {
          font-size: 11px !important;
          color: var(--text-secondary) !important;
          font-weight: 700 !important;
          letter-spacing: 0.02em !important;
        }

        /* Unified Helper Small Text: light grey #a1a1aa */
        .phone-screen-container .text-[10px],
        .phone-screen-container .text-xs.text-stone-400,
        .phone-screen-container .text-xs.text-slate-400,
        .phone-screen-container .text-stone-400,
        .phone-screen-container .text-slate-400,
        .phone-screen-container .text-gray-400,
        .phone-screen-container .text-neutral-400,
        .phone-screen-container .text-stone-500/70,
        .phone-screen-container span[class*="text-[10px]"],
        .phone-screen-container span[class*="text-stone-400"],
        .phone-screen-container span[class*="text-slate-400"],
        .phone-screen-container div[class*="text-stone-400"],
        .phone-screen-container div[class*="text-slate-400"] {
          color: var(--text-tertiary) !important;
          font-size: 10px !important;
        }

        /* 7. Button Elements Global Harmonization */
        /* High importance/CTA buttons -> Solid Black/Charcoal with pure White text */
        .phone-screen-container button.bg-indigo-600,
        .phone-screen-container button.bg-blue-600,
        .phone-screen-container button.bg-neutral-950,
        .phone-screen-container button.bg-emerald-500,
        .phone-screen-container button.bg-purple-600,
        .phone-screen-container button.bg-violet-600,
        .phone-screen-container button.bg-[#3b82f6],
        .phone-screen-container .bg-neutral-950 {
          background-color: var(--accent) !important;
          color: var(--accent-contrast) !important;
          border-color: var(--accent) !important;
          border-radius: 32px !important;
        }

        /* Direct rule to guarantee selected dark button text is white and visible */
        .phone-screen-container .bg-neutral-950,
        .phone-screen-container .bg-neutral-950 *,
        .phone-screen-container button.bg-neutral-950,
        .phone-screen-container button.bg-neutral-950 * {
          color: var(--accent-contrast) !important;
        }

        /* Secondary text-based button links -> Clean support gray text with link look */
        .phone-screen-container .text-indigo-600,
        .phone-screen-container .text-blue-600,
        .phone-screen-container .text-purple-600,
        .phone-screen-container .text-emerald-500 {
          color: var(--text-secondary) !important;
        }

        /* Back/Close buttons (x/arrow) -> Circle with 1px light grey outline, rounded standardized */
        .phone-screen-container button[title="返回"],
        .phone-screen-container button[title="关闭"],
        .phone-screen-container #schedule_back_btn,
        .phone-screen-container .back-btn {
          border-radius: 32px !important;
          background-color: var(--surface) !important;
          border: 1px solid var(--border) !important;
          color: var(--text-primary) !important;
          width: 32px !important;
          height: 32px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 !important;
        }

        /* 8. Specific Chat Bubble Alignment */
        /* Self bubble: Solid charcoal black, crisp white text, 32px round */
        .phone-screen-container .chat-bubble-self,
        .phone-screen-container div[class*="bg-indigo-600"] {
          background-color: var(--chat-user-bg) !important;
          color: var(--chat-user-text) !important;
          border-radius: 32px !important;
          border: none !important;
        }
        .phone-screen-container .chat-bubble-self *,
        .phone-screen-container div[class*="bg-indigo-600"] * {
          color: var(--chat-user-text) !important;
        }

        /* Other bubble: Soft light gray, charcoal text, 32px round */
        .phone-screen-container .chat-bubble-other,
        .phone-screen-container div[class*="bg-slate-200"],
        .phone-screen-container div[class*="bg-stone-100"] {
          background-color: var(--chat-ai-bg) !important;
          color: var(--chat-ai-text) !important;
          border-radius: 32px !important;
          border: 1px solid var(--border) !important;
        }

        /* Double segment buttons (such as stays/experiences, notes/todo tabs) */
        .phone-screen-container .flex-1.py-2.rounded-xl {
          border-radius: 32px !important;
        }

        /* 9. Unified Slider Range Input track and thumb styling */
        .phone-screen-container input[type="range"] {
          -webkit-appearance: none !important;
          appearance: none !important;
          background: transparent !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 0 !important;
          min-height: 0 !important;
          width: 100% !important;
          height: 24px !important;
          display: flex !important;
          align-items: center !important;
          cursor: pointer !important;
        }

        /* Track style - Webkit */
        .phone-screen-container input[type="range"]::-webkit-slider-runnable-track {
          width: 100% !important;
          height: 6px !important;
          background-color: var(--surface-muted) !important;
          border-radius: 32px !important; /* Unified border radius size */
          border: 1px solid var(--border) !important;
        }

        /* Thumb style - Webkit */
        .phone-screen-container input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 16px !important;
          width: 16px !important;
          border-radius: 32px !important; /* Unified border radius size */
          background-color: var(--accent) !important;
          border: 2px solid var(--surface) !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;
          cursor: pointer !important;
          margin-top: -5px !important; /* Center on track */
          transition: transform 0.1s ease !important;
        }
        .phone-screen-container input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.1) !important;
        }

        /* Track style - Firefox */
        .phone-screen-container input[type="range"]::-moz-range-track {
          width: 100% !important;
          height: 6px !important;
          background-color: var(--surface-muted) !important;
          border-radius: 32px !important;
          border: 1px solid var(--border) !important;
        }

        /* Thumb style - Firefox */
        .phone-screen-container input[type="range"]::-moz-range-thumb {
          height: 16px !important;
          width: 16px !important;
          border-radius: 32px !important;
          background-color: var(--accent) !important;
          border: 2px solid var(--surface) !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;
          cursor: pointer !important;
        }

        ${settings.bubbleCss || ""}
        ${settings.globalCss || ""}
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slide-down {
          from { transform: translateY(-50%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes jiggle {
          0% { transform: rotate(-1.2deg); }
          50% { transform: rotate(1.2deg); }
          100% { transform: rotate(-1.2deg); }
        }
        @keyframes jiggle-reverse {
          0% { transform: rotate(1.2deg); }
          50% { transform: rotate(-1.2deg); }
          100% { transform: rotate(1.2deg); }
        }
        .animate-jiggle {
          animation: jiggle 0.24s ease-in-out infinite;
        }
        .animate-jiggle-reverse {
          animation: jiggle-reverse 0.24s ease-in-out infinite;
        }
        .animate-slide-up {
          animation: slide-up 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-down {
          animation: slide-down 0.2s ease-out forwards;
        }
        .text-shadow-sm {
          text-shadow: 0 1px 1px rgba(0,0,0,0.1);
        }
      `}</style>

      {/* Phone Glass Screen Frame (Adaptive layout) */}
      <div
        id="phone_glass_screen"
        ref={phoneScreenRef}
        className="w-full md:h-[812px] md:w-[375px] md:rounded-[40px] md:shadow-2xl overflow-hidden relative flex flex-col bg-slate-100 border-none phone-screen-container"
        style={{
          background: resolveDesktopBackground({
            resolvedTheme,
            wallpaper: settings.wallpaper,
            wallpaperSource: settings.wallpaperSource,
          }).background,
          // Remains visible when a previously saved image URL or Blob can no longer load.
          // The configured wallpaper is never overwritten just because its resource is unavailable.
          backgroundColor: "var(--desktop-default-bg)",
          position: "relative",
          height: (typeof window !== "undefined" && window.innerWidth < 768) ? "100%" : undefined,
          transition: "background 0.3s ease, width 0.3s ease",
        }}
      >
        {/* Real-time Status Bar (Wi-Fi, Battery, Cellular) is now overlaid absolutely at the bottom of the container to stay on top of everything */}

        {/* Global New Message Notification Banner */}
        {globalNotification && (
          <div
            onClick={(e) => {
              setActiveApp("chat");
              setActiveChatCharId(globalNotification.characterId);
              setGlobalNotification(null);
            }}
            className="absolute left-3.5 right-3.5 z-50 animate-slide-down bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-100 p-3 flex items-center gap-3 cursor-pointer select-none animate-fade-in"
             style={{ top: settings.hideStatusBar ? "8px" : "calc(env(safe-area-inset-top, 0px) + 48px)" }}
          >
            {/* Avatar */}
            <img
              src={globalNotification.avatar}
              alt={globalNotification.name}
              className="w-10 h-10 rounded-full object-cover border border-slate-100 shrink-0 aspect-square"
              referrerPolicy="no-referrer"
            />
            {/* Middle info */}
            <div className="flex-1 min-w-0 pr-6">
              <h5 className="text-[11px] font-bold text-slate-800 truncate">
                {globalNotification.name}
              </h5>
              <p className="text-[10px] text-slate-500 truncate mt-0.5 leading-normal">
                {globalNotification.content}
              </p>
            </div>
            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent jumping to chat
                setGlobalNotification(null);
              }}
              className="absolute top-2.5 right-2.5 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              title="关闭"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Home Screen Icons Layout or Active Application Render */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          {activeApp === null ? (
            <div 
              className="home-screen-drag-surface flex-1 min-h-0 overflow-hidden flex flex-col p-4 select-none touch-none"
              style={{
                 paddingTop: settings.hideStatusBar ? "0px" : "calc(env(safe-area-inset-top, 0px) + 40px)",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)"
              }}
              onContextMenu={(event) => event.preventDefault()}
              onDragStartCapture={(event) => event.preventDefault()}
              onPointerDown={handleDesktopPointerDown}
              onPointerUp={handleDesktopPointerUp}
              onPointerLeave={handleDesktopPointerUp}
              onClick={handleDesktopClick}
            >
              
              {/* Multiple Pages Grid Section */}
              {(() => {
                const totalPages = visibleHomePageCount;
                let activeOffset = swipeOffset;
                if (currentPage === 0 && activeOffset > 0) {
                  activeOffset = Math.pow(activeOffset, 0.82); // elastic boundary feel
                } else if (currentPage === totalPages - 1 && activeOffset < 0) {
                  activeOffset = -Math.pow(-activeOffset, 0.82); // elastic boundary feel
                }
                return (
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative py-2 select-none">
                    <div ref={pageViewportRef} className="flex-1 min-h-0 overflow-hidden relative">
                      {/* Sliding track for page push effect */}
                      <div 
                        className="flex h-full w-full"
                        style={{
                          transform: `translateX(calc(-${currentPage * 100}% + ${activeOffset}px))`,
                          transition: swipeOffset === 0 ? "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)" : "none"
                        }}
                      >
                        {Array.from({ length: totalPages }).map((_, pageIdx) => {
                          const isHiddenNames = !!settings.hideAppNames;
                          const iconWidth = homeGridIconWidth;
                          const iconSizeStyle = isHiddenNames 
                            ? { width: "60px", height: "60px" } 
                            : { width: "52px", height: "52px" };

                          const gridPadding = homeGridPadding; // 12px padding left/right (matches px-3 of dock!)
                          const gapWidth = homeGridColumnGap;
                          const widgetHeight = `${2 * homeGridRowHeight + homeGridRowGap}px`;
                          const rowGapValue = homeGridRowGap;
                          const rowHeightValue = homeGridRowHeight;

                          const gridStyle = {
                            paddingLeft: `${gridPadding}px`,
                            paddingRight: `${gridPadding}px`,
                            paddingTop: "14px",
                            paddingBottom: "14px",
                            display: "grid",
                            gridTemplateColumns: `repeat(${HOME_GRID_COLUMNS}, minmax(0, 1fr))`,
                            justifyContent: "stretch",
                            columnGap: `${gapWidth}px`,
                            gridTemplateRows: `repeat(${homeGridRows}, ${rowHeightValue}px)`,
                            gridAutoRows: `${rowHeightValue}px`,
                            rowGap: `${rowGapValue}px`
                          };

                          return (
                            <div 
                              key={pageIdx}
                              className="w-full h-full min-h-0 flex-shrink-0 flex flex-col select-none px-0"
                            >
                              {/* Home Widget Card (Clock / Welcoming Card) inside Page 0 only */}
                              {pageIdx === 0 && !settings.hideHomeWelcomeWidget && (
                                <div className="relative shrink-0 mt-3 mb-3.5" style={{ marginLeft: `${gridPadding}px`, marginRight: `${gridPadding}px` }}>
                                  <div 
                                    className={`backdrop-blur-md border border-neutral-200/20 p-3.5 rounded-[22px] text-neutral-850 shadow-sm select-none flex items-center gap-3.5 w-full h-full ${
                                      isEditingHomeScreen ? "animate-jiggle" : ""
                                    }`}
                                    style={{
                                      backgroundColor: `rgba(255, 255, 255, ${(settings.widgetOpacity !== undefined ? settings.widgetOpacity : 70) / 100})`,
                                      borderRadius: settings.widgetBorderRadius !== undefined ? `${settings.widgetBorderRadius}px` : "22px"
                                    }}
                                  >
                                    <img
                                      src={settings.avatar}
                                      alt={settings.name}
                                      className="w-12 h-12 rounded-full object-cover border border-slate-200/20 shadow-sm shrink-0"
                                      referrerPolicy="no-referrer"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <h2 className="text-sm font-extrabold text-neutral-900 tracking-tight leading-tight">
                                        {settings.name}
                                      </h2>
                                      <p className="text-[11px] text-neutral-500 mt-1 line-clamp-1 leading-relaxed">
                                        {settings.signature}
                                      </p>
                                    </div>
                                  </div>

                                  {isEditingHomeScreen && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSettings(prev => ({ ...prev, hideHomeWelcomeWidget: true }));
                                      }}
                                      className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-stone-900/90 hover:bg-stone-950 text-white rounded-full flex items-center justify-center text-xs font-black shadow z-30 transition-transform active:scale-90"
                                    >
                                      -
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* The grid of apps and widgets for this page */}
                              <div 
                                ref={pageIdx === currentPage ? pageContainerRef : undefined}
                                className="flex-1 min-h-0 content-start select-none"
                                style={gridStyle}
                              >
                                {dragSession?.target?.page === pageIdx && draggedItem && (() => {
                                  const span = getHomeItemDimensions(draggedItem.size);
                                  return (
                                    <div
                                      className={`pointer-events-none z-40 rounded-xl border-2 ${
                                        dragSession.validity === "invalid"
                                          ? "border-rose-500 bg-rose-400/20"
                                          : dragSession.validity === "swap" || dragSession.validity === "displace"
                                            ? "border-amber-500 bg-amber-300/20"
                                            : "border-sky-500 bg-sky-300/20"
                                      }`}
                                      style={{
                                        gridColumnStart: dragSession.target.column + 1,
                                        gridColumnEnd: `span ${span.width}`,
                                        gridRowStart: dragSession.target.row + 1,
                                        gridRowEnd: `span ${span.height}`,
                                      }}
                                    />
                                  );
                                })()}
                                {homeScreenItems
                                  .filter((item) => item.position?.page === pageIdx)
                                  .map((item, index) => {
                                  const alignClass = "justify-self-center items-center text-center";
                                  const itemPosition = item.position!;
                                  const itemSpan = getHomeItemDimensions(item.size);
                                  const explicitGridStyle = {
                                    gridColumnStart: itemPosition.column + 1,
                                    gridColumnEnd: `span ${itemSpan.width}`,
                                    gridRowStart: itemPosition.row + 1,
                                    gridRowEnd: `span ${itemSpan.height}`,
                                  };

                                  if (item.type === "app") {
                                    const app = desktopApps.find(a => a.id === item.id);
                                    if (!app) return null;
                                    const isDragged = draggedItem?.id === item.id;
                                    const customIconUrl = settings.customIcons[app.id];
                                    const isTransparentCustomIcon = isTransparencyPreservedImage(customIconUrl);

                                    return (
                                      <div
                                        key={item.id}
                                        data-id={item.id}
                                        data-page={pageIdx}
                                        className={`grid-item col-span-1 row-span-1 flex flex-col ${alignClass} justify-start relative group transition-opacity duration-200 min-w-0 ${
                                          isDragged ? "z-30 opacity-30 scale-95 cursor-grabbing" : "cursor-pointer"
                                        }`}
                                        style={explicitGridStyle}
                                        onPointerDown={(e) => {
                                          if (isEditingHomeScreen) e.preventDefault();
                                          handleItemPointerDown(e, item);
                                        }}
                                        onClick={() => handleItemClick(item)}
                                      >
                                        <div className={`w-full flex flex-col ${alignClass} ${
                                          isEditingHomeScreen && !isDragged 
                                            ? (index % 2 === 0 ? "animate-jiggle" : "animate-jiggle-reverse") 
                                            : ""
                                        }`}>
                                          <div 
                                            className={`app-icon-surface flex items-center justify-center transform active:scale-95 transition-all duration-150 overflow-hidden shrink-0 ${
                                              isTransparentCustomIcon
                                                ? "transparent-custom-icon"
                                                : "bg-white border border-[#f0f0f3] shadow-[0_3px_8px_rgba(0,0,0,0.05)]"
                                            }`}
                                            style={{
                                              borderRadius: isTransparentCustomIcon ? 0 : "var(--app-icon-radius, 35%)",
                                              ...iconSizeStyle,
                                            }}
                                          >
                                            {customIconUrl ? (
                                              <img
                                                src={customIconUrl}
                                                alt={app.name}
                                                className={`w-full h-full ${
                                                  isTransparentCustomIcon ? "object-contain" : "object-cover"
                                                }`}
                                              />
                                            ) : (
                                              <div className="app-default-icon w-full h-full flex items-center justify-center scale-90">
                                                {app.icon}
                                              </div>
                                            )}
                                          </div>
                                          {!isHiddenNames && (
                                            <span className="desktop-app-label text-[10px] font-extrabold mt-1 truncate max-w-[72px] w-[calc(100%+20px)] block select-none tracking-tight font-sans text-center">
                                              {app.name}
                                            </span>
                                          )}
                                        </div>

                                        {isEditingHomeScreen && item.id !== "store" && item.id !== "settings" && (
                                          <button
                                            data-home-delete
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleUninstallApp(item.id);
                                            }}
                                            className="absolute -top-1 -left-1 w-4 h-4 bg-stone-900/90 hover:bg-stone-950 text-white rounded-full flex items-center justify-center text-[10px] font-black shadow z-20 transition-transform active:scale-90"
                                          >
                                            -
                                          </button>
                                        )}
                                      </div>
                                    );
                                  } else {
                                    const isDragged = draggedItem?.id === item.id;
                                    const WidgetComponent = getWidgetComponent(item.widgetType);
                                    
                                    let colSpanClass = "col-span-2";
                                    let rowSpanClass = "row-span-2";
                                    let currentWidgetHeight = widgetHeight;

                                    if (item.size === "1x4") {
                                      colSpanClass = "col-span-4";
                                      rowSpanClass = "row-span-1";
                                      currentWidgetHeight = `${rowHeightValue}px`;
                                    } else if (item.size === "2x4") {
                                      colSpanClass = "col-span-4";
                                      rowSpanClass = "row-span-2";
                                      currentWidgetHeight = `${2 * rowHeightValue + rowGapValue}px`;
                                    } else if (item.size === "2x3") {
                                      colSpanClass = "col-span-3";
                                      rowSpanClass = "row-span-2";
                                      currentWidgetHeight = `${2 * rowHeightValue + rowGapValue}px`;
                                    } else if (item.size === "2x2") {
                                      colSpanClass = "col-span-2";
                                      rowSpanClass = "row-span-2";
                                      currentWidgetHeight = widgetHeight;
                                    }

                                    return (
                                      <div
                                        key={item.id}
                                        data-id={item.id}
                                        data-page={pageIdx}
                                        className={`grid-item ${colSpanClass} ${rowSpanClass} relative transition-opacity duration-200 ${
                                          isDragged ? "z-30 opacity-30 scale-95" : ""
                                        }`}
                                        style={{ ...explicitGridStyle, height: currentWidgetHeight }}
                                        onPointerDown={(e) => {
                                          if (isEditingHomeScreen) e.preventDefault();
                                          handleItemPointerDown(e, item);
                                        }}
                                        onClickCapture={(event) => {
                                          if (isEditingHomeScreen && !(event.target as HTMLElement).closest("[data-home-delete]")) {
                                            event.preventDefault();
                                            event.stopPropagation();
                                          }
                                        }}
                                      >
                                        <div className={`w-full h-full ${
                                          isEditingHomeScreen && !isDragged 
                                            ? (index % 2 === 0 ? "animate-jiggle" : "animate-jiggle-reverse") 
                                            : ""
                                        }`}>
                                          <WidgetComponent 
                                            id={item.id} 
                                            isEditing={isEditingHomeScreen}
                                            onRemove={() => handleRemoveWidget(item.id)}
                                            isPlaying={isPlaying}
                                            onTogglePlay={() => setIsPlaying(!isPlaying)}
                                            onNext={handleNextTrack}
                                            currentTrack={currentTrack || null}
                                            characters={characters}
                                            onOpenApp={setActiveApp}
                                            installedAppIds={installedAppIds}
                                            widgetOpacity={settings.widgetOpacity}
                                            widgetBorderRadius={settings.widgetBorderRadius}
                                            size={item.size}
                                            tracks={tracks}
                                            activeIdentity={activeIdentity}
                                            dualMusicConfig={dualMusicConfigs.find((config) => config.widgetId === item.id && config.ownerIdentityId === activeIdentityId)}
                                            identityMusicState={identityMusicStates.find((state) => state.ownerIdentityId === activeIdentityId)}
                                            relationshipMusicState={relationshipMusicStates.find((state) =>
                                              state.relationId === dualMusicConfigs.find((config) => config.widgetId === item.id && config.ownerIdentityId === activeIdentityId)?.relationId)}
                                            availableMusicRelationships={availableMusicRelationships}
                                            playbackOrigin={playbackOrigin}
                                            onToggleTrack={(trackId: string, origin: string) => toggleTrack(trackId, origin, origin.endsWith(":left"))}
                                            onBindMusicRelationship={handleBindMusicRelationship}
                                            onRefreshRelationshipMusic={(relationId: string) => { void refreshRelationshipMusic(relationId); }}
                                            musicRecommendationLoading={musicRecommendationRelationId === dualMusicConfigs.find((config) => config.widgetId === item.id && config.ownerIdentityId === activeIdentityId)?.relationId}
                                            musicError={musicRecommendationError || musicPlaybackError}
                                          />
                                        </div>
                                      </div>
                                    );
                                  }
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* iOS-style Page Indicator Dots */}
                    {totalPages > 1 && (
                      <div className="flex justify-center items-center gap-1.5 py-1 z-20 mt-1">
                        {Array.from({ length: totalPages }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(i)}
                            className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                              i === currentPage 
                                ? "bg-stone-800 scale-125" 
                                : "bg-stone-400/50"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Elegant Dock section (containing quick indicators) */}
              {(() => {
                const isHiddenNames = !!settings.hideAppNames;
                const iconWidth = isHiddenNames ? 60 : 52;
                const iconSizeStyle = isHiddenNames 
                  ? { width: "60px", height: "60px" } 
                  : { width: "52px", height: "52px" };
                const isTransparentDockIcon = (appId: string) =>
                  isTransparencyPreservedImage(settings.customIcons[appId]);

                return (
                  <div 
                    className="dock-container relative z-20 w-full flex-none backdrop-blur-xl border border-neutral-200/20 py-2.5 shadow-lg mx-0 px-3"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(4, ${iconWidth}px)`,
                      justifyContent: "space-between",
                      alignItems: "center",
                      backgroundColor: hexToRgba(settings.dockColor || "#ffffff", settings.dockOpacity !== undefined ? settings.dockOpacity : 70),
                      borderRadius: settings.dockBorderRadius !== undefined ? `${settings.dockBorderRadius}px` : "26px"
                    }}
                  >
                    <div className="flex items-center justify-center w-full h-full">
                      {installedAppIds.includes("chat") ? (
                        <button
                          onClick={() => setActiveApp("chat")}
                          className={`app-icon-surface flex items-center justify-center active:scale-90 transition-all overflow-hidden shrink-0 ${
                            isTransparentDockIcon("chat")
                              ? "transparent-custom-icon"
                              : "bg-white border border-[#f0f0f3] shadow-[0_3px_8px_rgba(0,0,0,0.05)] hover:bg-stone-50"
                          }`}
                          style={{ borderRadius: isTransparentDockIcon("chat") ? 0 : "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                        >
                          {settings.customIcons["chat"] ? (
                            <img src={settings.customIcons["chat"]} alt="" className={`w-full h-full ${isTransparentDockIcon("chat") ? "object-contain" : "object-cover"}`} />
                          ) : (
                            <div className="app-default-icon w-full h-full flex items-center justify-center scale-90">
                              {AppIcons.chat()}
                            </div>
                          )}
                        </button>
                      ) : (
                        <div className="shrink-0" style={iconSizeStyle} />
                      )}
                    </div>

                    <div className="flex items-center justify-center w-full h-full">
                      {installedAppIds.includes("music") ? (
                        <button
                          onClick={() => setActiveApp("music")}
                          className={`app-icon-surface flex items-center justify-center active:scale-90 transition-all overflow-hidden shrink-0 ${
                            isTransparentDockIcon("music")
                              ? "transparent-custom-icon"
                              : "bg-white border border-[#f0f0f3] shadow-[0_3px_8px_rgba(0,0,0,0.05)] hover:bg-stone-50"
                          }`}
                          style={{ borderRadius: isTransparentDockIcon("music") ? 0 : "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                        >
                          {settings.customIcons["music"] ? (
                            <img src={settings.customIcons["music"]} alt="" className={`w-full h-full ${isTransparentDockIcon("music") ? "object-contain" : "object-cover"}`} />
                          ) : (
                            <div className="app-default-icon w-full h-full flex items-center justify-center scale-90">
                              {AppIcons.music()}
                            </div>
                          )}
                        </button>
                      ) : (
                        <div className="shrink-0" style={iconSizeStyle} />
                      )}
                    </div>

                    <div className="flex items-center justify-center w-full h-full">
                      {installedAppIds.includes("archives") ? (
                        <button
                          onClick={() => setActiveApp("archives")}
                          className={`app-icon-surface flex items-center justify-center active:scale-90 transition-all overflow-hidden shrink-0 ${
                            isTransparentDockIcon("archives")
                              ? "transparent-custom-icon"
                              : "bg-white border border-[#f0f0f3] shadow-[0_3px_8px_rgba(0,0,0,0.05)] hover:bg-stone-50"
                          }`}
                          style={{ borderRadius: isTransparentDockIcon("archives") ? 0 : "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                        >
                          {settings.customIcons["archives"] ? (
                            <img src={settings.customIcons["archives"]} alt="" className={`w-full h-full ${isTransparentDockIcon("archives") ? "object-contain" : "object-cover"}`} />
                          ) : (
                            <div className="app-default-icon w-full h-full flex items-center justify-center scale-90">
                              {AppIcons.archives()}
                            </div>
                          )}
                        </button>
                      ) : (
                        <div className="shrink-0" style={iconSizeStyle} />
                      )}
                    </div>

                    <div className="flex items-center justify-center w-full h-full">
                      <button
                        onClick={() => setActiveApp("settings")}
                        className={`app-icon-surface flex items-center justify-center active:scale-90 transition-all overflow-hidden shrink-0 ${
                          isTransparentDockIcon("settings")
                            ? "transparent-custom-icon"
                            : "bg-white border border-[#f0f0f3] shadow-[0_3px_8px_rgba(0,0,0,0.05)] hover:bg-stone-50"
                        }`}
                        style={{ borderRadius: isTransparentDockIcon("settings") ? 0 : "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                      >
                        {settings.customIcons["settings"] ? (
                          <img src={settings.customIcons["settings"]} alt="" className={`w-full h-full ${isTransparentDockIcon("settings") ? "object-contain" : "object-cover"}`} />
                        ) : (
                          <div className="app-default-icon w-full h-full flex items-center justify-center scale-90">
                            {AppIcons.settings()}
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Preset bottom sheet for choosing widgets */}
              {isShowingAddWidget && (
                <div className="add-widget-sheet">
                  <AddWidgetSheet 
                    onAdd={handleAddWidget} 
                    onClose={() => setIsShowingAddWidget(false)} 
                    settings={settings}
                  />
                </div>
              )}
              {musicPlaybackError && (
                <button
                  type="button"
                  onClick={() => setMusicPlaybackError(null)}
                  className="absolute bottom-24 left-1/2 z-[60] w-[86%] -translate-x-1/2 rounded-2xl bg-rose-50 px-4 py-3 text-left text-[11px] font-bold text-rose-600 shadow-lg"
                >
                  {musicPlaybackError}
                </button>
              )}
              {homeLayoutError && (
                <button
                  type="button"
                  onClick={() => setHomeLayoutError(null)}
                  className="absolute bottom-24 left-1/2 z-[61] w-[86%] -translate-x-1/2 rounded-2xl bg-rose-50 px-4 py-3 text-left text-[11px] font-bold text-rose-600 shadow-lg"
                >
                  {homeLayoutError}
                </button>
              )}

            </div>
          ) : (
            // Full screen app view ports with transitions
            <div 
              className="absolute inset-0 z-30 bg-slate-50/92 backdrop-blur-md flex flex-col h-full"
              style={{
                 paddingTop: settings.hideStatusBar ? "0px" : "calc(env(safe-area-inset-top, 0px) + 36px)",
                paddingBottom: "env(safe-area-inset-bottom, 0px)"
              }}
            >
              <div className="w-full flex-1 min-h-0 relative">
                <div style={{ display: activeApp === "chat" ? "block" : "none" }} className="w-full h-full absolute inset-0">
                  <AppChat
                    characters={characters}
                    relationships={relationships}
                    settings={settings}
                    messages={messages}
                    moments={moments}
                    onSendMessage={handleSendMessage}
                    onSaveCharacter={handleSaveCharacter}
                    onAddMoment={handleAddMoment}
                    onAddCommentToMoment={handleAddCommentToMoment}
                    onDeleteCommentFromMoment={handleDeleteCommentFromMoment}
                    onLikeMoment={handleLikeMoment}
                    onDeleteMoment={handleDeleteMoment}
                    onDeleteMomentsByRelation={handleDeleteMomentsByRelation}
                    onToggleBookmark={handleToggleBookmark}
                    onDeleteMessage={handleDeleteMessage}
                    onUpdateMessage={handleUpdateMessage}
                    onClose={() => setActiveApp(null)}
                    onSaveSettings={setSettings}
                    onNavigateToApp={setActiveApp}
                    worldBookEntries={worldBookEntries}
                    onClearMessages={handleClearMessages}
                    memories={memories}
                    onSaveMemories={setMemories}
                    recallSettings={recallSettings}
                    activeChatCharId={activeChatCharId}
                    setActiveChatCharId={setActiveChatCharId}
                    activeChatRelationId={activeChatRelationId}
                    setActiveChatRelationId={setActiveChatRelationId}
                    onSaveRelationships={setRelationships}
                    offlineStories={offlineStories}
                    onSaveOfflineStory={handleSaveOfflineStory}
                    onDeleteOfflineStory={handleDeleteOfflineStory}
                    onDeleteCharacter={handleDeleteCharacter}
                    onDeleteRelationshipMusic={handleDeleteRelationshipMusic}
                    musicTracks={tracks}
                    identityMusicStates={identityMusicStates}
                    relationshipMusicStates={relationshipMusicStates}
                    pendingForumShareMessageId={pendingForumShareMessageId}
                    onForumShareHandled={() => setPendingForumShareMessageId(null)}
                    pendingDiaryShareMessageId={pendingDiaryShareMessageId}
                    onDiaryShareHandled={() => setPendingDiaryShareMessageId(null)}
                    onOpenForumShare={(shareId) => {
                      setOpenForumShareId(shareId);
                      setActiveApp("forum");
                    }}
                  />
                </div>

                {activeApp === "archives" && (
                  <AppArchives
                    characters={characters}
                    worldBookEntries={worldBookEntries}
                    onSaveCharacter={handleSaveCharacter}
                    onDeleteCharacter={handleDeleteCharacter}
                    onClose={() => setActiveApp(null)}
                    onSaveWorldBookEntries={handleSaveWorldBookEntries}
                  />
                )}

                {activeApp === "worldbook" && (
                  <AppWorldBook
                    entries={worldBookEntries}
                    characters={characters}
                    onSaveEntry={handleSaveWorldBookEntry}
                    onSaveEntries={handleSaveWorldBookEntries}
                    onDeleteEntry={handleDeleteWorldBookEntry}
                    onClose={() => setActiveApp(null)}
                  />
                )}

                {activeApp === "music" && (
                  <AppMusic
                    tracks={tracks}
                    playlists={playlists}
                    onAddTrack={handleAddMusicTrack}
                    onDeleteTrack={handleDeleteMusicTrack}
                    onAddPlaylist={handleAddMusicPlaylist}
                    onDeletePlaylist={handleDeleteMusicPlaylist}
                    onClose={() => setActiveApp(null)}
                    currentTrack={currentTrack}
                    setCurrentTrack={setCurrentTrack}
                    isPlaying={isPlaying}
                    setIsPlaying={setIsPlaying}
                    audioRef={globalAudioRef}
                    playMode={playMode}
                    setPlayMode={setPlayMode}
                    volume={volume}
                    setVolume={setVolume}
                    onPlayTrack={(track) => toggleTrack(track.id, "music-library", true, track)}
                  />
                )}

                {activeApp === "forum" && (
                  <AppForum
                    activeIdentity={activeIdentity}
                    characters={characters}
                    relationships={relationships}
                    messages={messages}
                    memories={memories}
                    worldBookEntries={worldBookEntries}
                    settings={settings}
                    openForumShareId={openForumShareId}
                    onOpenForumShareHandled={() => setOpenForumShareId(null)}
                    onSendMessage={handleSendMessage}
                    onOpenChat={(characterId, relationId, sourceMessageId) => {
                      setActiveChatCharId(characterId);
                      setActiveChatRelationId(relationId);
                      setPendingForumShareMessageId(sourceMessageId);
                      setActiveApp("chat");
                    }}
                    onClose={() => setActiveApp(null)}
                  />
                )}

                {activeApp === "notes" && (
                  <AppNotes
                    onClose={() => setActiveApp(null)}
                  />
                )}

                {activeApp === "diary" && (
                  <AppDiary
                    activeIdentity={activeIdentity}
                    characters={characters}
                    relationships={relationships}
                    messages={messages}
                    settings={settings}
                    onSendMessage={handleSendMessage}
                    onOpenChat={(characterId, relationId, sourceMessageId) => {
                      setActiveChatCharId(characterId);
                      setActiveChatRelationId(relationId);
                      setPendingDiaryShareMessageId(sourceMessageId || null);
                      setActiveApp("chat");
                    }}
                    onClose={() => setActiveApp(null)}
                  />
                )}

                {activeApp === "store" && (
                  <AppStore
                    installedAppIds={installedAppIds}
                    onInstallApp={handleInstallApp}
                    onUninstallApp={handleUninstallApp}
                    onClose={() => setActiveApp(null)}
                    renderAppIcon={(id, className) => {
                      const customIconUrl = settings.customIcons[id];
                      if (customIconUrl) {
                        return <img src={customIconUrl} alt={id} className="w-full h-full object-cover" />;
                      }
                      const iconFn = AppIcons[id as keyof typeof AppIcons];
                      return iconFn ? iconFn(className) : null;
                    }}
                  />
                )}

                {activeApp === "settings" && (
                  <AppSettings
                    settings={settings}
                    presets={presets}
                    onSaveSettings={setSettings}
                    onSavePreset={handleSavePreset}
                    onDeletePreset={handleDeletePreset}
                    onClose={() => setActiveApp(null)}
                  />
                )}

                {activeApp === "memory" && (
                  <AppMemory
                    characters={characters}
                    relationships={relationships}
                    memories={memories}
                    onSaveMemories={setMemories}
                    recallSettings={recallSettings}
                    onSaveRecallSettings={setRecallSettings}
                    onUpdateCharacter={handleSaveCharacter}
                    immediateSummaryTask={immediateSummaryTask}
                    onStartImmediateSummary={handleStartImmediateSummary}
                    onResetImmediateSummary={handleResetImmediateSummary}
                    onClose={() => setActiveApp(null)}
                    selectedModel={settings.selectedModel}
                    apiEndpoint={settings.apiEndpoint}
                  />
                )}

                {activeApp === "offline" && (
                  <AppOffline
                    characters={characters}
                    relationships={relationships}
                    settings={settings}
                    offlineStories={offlineStories}
                    messages={messages}
                    activeChatCharId={activeChatCharId}
                    worldBookEntries={worldBookEntries}
                    onSaveOfflineStory={handleSaveOfflineStory}
                    onSaveRelationships={setRelationships}
                    onDeleteOfflineStory={handleDeleteOfflineStory}
                    onClose={() => setActiveApp(null)}
                    activeChatRelationId={activeChatRelationId}
                    onNavigateToChat={(charId, relationId, conversationId) => {
                      const ownerIdentityId = settings.activeIdentityId || DEFAULT_IDENTITY_ID;
                      const relationship = relationId
                        ? relationships.find((candidate) =>
                            candidate.id === relationId
                            && candidate.userIdentityId === ownerIdentityId
                            && resolveCanonicalCharacterId(candidate.characterId, characters)
                              === resolveCanonicalCharacterId(charId, characters),
                          )
                        : undefined;
                      if (relationId && (
                        !relationship
                        || (conversationId
                          && conversationId !== (relationship.conversationId || getConversationId(relationship.id)))
                      )) return;
                      const groupCharacter = !relationId
                        ? characters.find((character) => character.id === charId && character.isGroupChat)
                        : undefined;
                      if (!relationId && conversationId?.startsWith("group:")
                        && (!groupCharacter || conversationId !== `group:${groupCharacter.id}`)) return;
                      setActiveChatCharId(relationship?.characterId || charId);
                      setActiveChatRelationId(relationship?.id || null);
                      setActiveApp("chat");
                    }}
                    memories={memories}
                    onSaveMemories={setMemories}
                    onPersistMemories={persistOfflineStoryMemories}
                    recallSettings={recallSettings}
                  />
                )}
              </div>
            </div>
          )}

          {/* Real-time Status Bar (Wi-Fi, Battery, Cellular) - Overlaid absolutely on top of everything */}
          {(() => {
            const activeChar = characters.find(c => c.id === activeChatCharId);
            const desktopBackground = resolveDesktopBackground({
              resolvedTheme,
              wallpaper: settings.wallpaper,
              wallpaperSource: settings.wallpaperSource,
            });
            const activeWallpaper = (activeApp === "chat" && activeChar && activeChar.chatBg)
              ? activeChar.chatBg
              : (desktopBackground.hasUserWallpaper ? settings.wallpaper : undefined);
            return <StatusBar
              wallpaper={activeWallpaper}
              hasUserWallpaper={Boolean(activeWallpaper)}
              fallbackTheme={resolvedTheme}
              hideStatusBar={settings.hideStatusBar}
            />;
          })()}
        </div>

        {/* Tactile absolute clone of the dragged item following cursor */}
        {draggedItem && (
          <div
            id="tactile-drag-clone"
            className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-1/2 scale-110 shadow-2xl opacity-90 transition-none"
            style={{
              left: dragCurrent.x,
              top: dragCurrent.y,
            }}
          >
            {draggedItem.type === "app" ? (
              <div className="flex flex-col items-center">
                <div 
                  className={`flex items-center justify-center overflow-hidden shrink-0 ${
                    isTransparencyPreservedImage(settings.customIcons[draggedItem.id])
                      ? "bg-transparent border-0 shadow-none"
                      : "bg-white border border-[#f0f0f3] shadow-lg"
                  }`}
                  style={{ 
                    borderRadius: isTransparencyPreservedImage(settings.customIcons[draggedItem.id])
                      ? 0
                      : "var(--app-icon-radius, 35%)",
                    width: settings.hideAppNames ? "52px" : "44px",
                    height: settings.hideAppNames ? "52px" : "44px"
                  }}
                >
                  {settings.customIcons[draggedItem.id] ? (
                    <img
                      src={settings.customIcons[draggedItem.id]}
                      alt=""
                      className={`w-full h-full ${
                        isTransparencyPreservedImage(settings.customIcons[draggedItem.id])
                          ? "object-contain"
                          : "object-cover"
                      }`}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center scale-90 text-stone-800">
                      {desktopApps.find(a => a.id === draggedItem.id)?.icon}
                    </div>
                  )}
                </div>
                {!settings.hideAppNames && (
                  <span className="desktop-app-label text-[10px] font-black mt-1">
                    {desktopApps.find(a => a.id === draggedItem.id)?.name}
                  </span>
                )}
              </div>
            ) : (
              <div 
                style={{ 
                  width: draggedItem.size === "1x4" || draggedItem.size === "2x4" ? "300px" : draggedItem.size === "2x3" ? "225px" : (settings.hideAppNames ? "154px" : "150px"),
                  height: draggedItem.size === "1x4" ? "54px" : draggedItem.size === "2x4" || draggedItem.size === "2x3" ? "120px" : (settings.hideAppNames ? "154px" : "150px")
                }}
              >
                {React.createElement(getWidgetComponent(draggedItem.widgetType), {
                  id: draggedItem.id,
                  isPlaying,
                  currentTrack: currentTrack || null,
                  characters,
                  installedAppIds,
                  widgetOpacity: settings.widgetOpacity,
                  widgetBorderRadius: settings.widgetBorderRadius,
                  size: draggedItem.size,
                  tracks,
                  activeIdentity,
                  dualMusicConfig: dualMusicConfigs.find((config) => config.widgetId === draggedItem.id && config.ownerIdentityId === activeIdentityId),
                  identityMusicState: identityMusicStates.find((state) => state.ownerIdentityId === activeIdentityId),
                  availableMusicRelationships,
                })}
              </div>
            )}
          </div>
        )}

        {/* Floating Back to Home Button */}
        {settings.showHomeButton && activeApp !== null && (
          <motion.div
            id="floating_home_button"
            drag
            dragConstraints={phoneScreenRef}
            dragElastic={0.05}
            dragMomentum={false}
            onClick={() => setActiveApp(null)}
            className="absolute bottom-24 right-4 w-12 h-12 bg-white/45 hover:bg-white/70 backdrop-blur-md rounded-full border border-neutral-300/30 shadow-lg flex items-center justify-center cursor-pointer z-50 group active:scale-95 select-none transition-all duration-200"
            style={{
              boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.15)",
              touchAction: "none"
            }}
            title="一键返回主页"
          >
            {/* Concentric physical circular Home button design */}
            <div className="w-10 h-10 rounded-full border border-neutral-400/25 flex items-center justify-center bg-white/10">
              <div className="w-7 h-7 rounded-full border border-neutral-500/40 flex items-center justify-center">
                <div className="w-3.5 h-3.5 border-2 border-neutral-600/70 rounded-md" />
              </div>
            </div>
          </motion.div>
        )}

        {/* Global Toast Warning Overlay */}
        {globalToast && (
          <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-[9999] px-4 py-3 rounded-2xl shadow-xl border text-xs font-medium max-w-[90%] text-center flex items-center gap-2 backdrop-blur-md transition-all duration-300 ${
            globalToast.isError 
              ? "border-rose-200 bg-rose-50 text-rose-800" 
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}>
            <span>{globalToast.message}</span>
          </div>
        )}

      </div>
    </div>
  );
}
