import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { apiExtractMemories, apiTranslate } from "./utils/apiHelper";
import { audioDb } from "./utils/audioDb";
import { loadSettings, saveSettings } from "./core/storage/repositories/settingsRepository";
import { loadCharacters, saveCharacters } from "./core/storage/repositories/characterRepository";
import { loadMessages, saveMessages } from "./core/storage/repositories/messageRepository";
import { loadMoments, saveMoments } from "./core/storage/repositories/momentRepository";
import { recordDeletedCharacterMoment } from "./features/moments/services/momentGenerationGuard";
import { loadWorldBookEntries, saveWorldBookEntries } from "./core/storage/repositories/worldBookRepository";
import { loadMemories, loadMemorySettings, saveMemories, saveMemorySettings } from "./core/storage/repositories/memoryRepository";
import { loadOfflineStories, saveOfflineStories } from "./core/storage/repositories/offlineRepository";
import { loadRelationships, saveRelationships } from "./core/storage/repositories/relationshipRepository";
import { loadInnerVoiceRecords, removeInnerVoicesByCharacter, saveInnerVoiceRecords } from "./core/storage/repositories/innerVoiceRepository";
import { loadCalendarEvents, saveCalendarEvents } from "./core/storage/repositories/calendarRepository";
import { loadPresets, savePresets } from "./core/storage/repositories/presetRepository";
import { MemoryService, formatExtractedMemorySummary } from "./domain/memory/MemoryService";
import { migrateLegacyCharacterIdentityData } from "./domain/character/characterIdentity";
import { migrateLegacyRelationshipData } from "./domain/relationship/relationshipMigration";
import { removeCanonicalCharacterData } from "./domain/relationship/relationshipCleanup";
import { DEFAULT_IDENTITY_ID, getOfflineModeStorageKey, getOfflineStoryStorageKey, type CharacterRelationship } from "./domain/relationship/characterRelationship";
import { Character, Message, Moment, UserSettings, StylePreset, MusicTrack, MusicPlaylist, CalendarEvent, WorldBookEntry, MomentComment, HomeScreenItem, MemoryItem, MemoryVaultSettings, ImmediateSummaryTask, OfflineStory, InnerVoiceRecord } from "./types";
import { 
  AlbumWidget, 
  CalendarAlbumWidget,
  MusicWidget, 
  AnniversaryWidget, 
  TodoWidget, 
  AddWidgetSheet 
} from "./components/HomeScreenWidgets";
import StatusBar from "./components/StatusBar";
import AppChat from "./components/AppChat";
import AppArchives from "./components/AppArchives";
import AppWorldBook from "./components/AppWorldBook";
import AppMusic from "./components/AppMusic";
import AppForum from "./components/AppForum";
import AppStore from "./components/AppStore";
import AppSettings from "./components/AppSettings";
import AppNotes from "./components/AppNotes";
import AppMemory from "./components/AppMemory";
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
  iconBorderEnabled: true,
  selfBubbleRadius: 6,
  otherBubbleRadius: 6,
  bubbleTailEnabled: false,
  bubbleTailVertical: "top",
  bubblePosition: "side"
};

const DEFAULT_MESSAGES: Message[] = [];

export default function App() {
  // Load initial states from LocalStorage or fallbacks
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters(DEFAULT_CHARACTERS).value);

  const [settings, setSettingsState] = useState<UserSettings>(() => loadSettings(DEFAULT_SETTINGS).value);

  const settingsChangedByUser = useRef(false);
  const setSettings: React.Dispatch<React.SetStateAction<UserSettings>> = (next) => {
    settingsChangedByUser.current = true;
    setSettingsState(next);
  };

  const [messages, setMessages] = useState<Message[]>(() => loadMessages(DEFAULT_MESSAGES).value);

  const [moments, setMoments] = useState<Moment[]>(() => loadMoments([]).value);

  const [presets, setPresets] = useState<StylePreset[]>(() => loadPresets([]).value);

  const [tracks, setTracks] = useState<MusicTrack[]>(() => {
    const raw = localStorage.getItem("phone_music_tracks");
    return raw ? JSON.parse(raw) : [];
  });

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

      // iOS Safari does not always keep 100vh in sync with the standalone app
      // viewport. Expose a pixel value as a stable fallback for full-screen shells.
      const visualHeight = window.visualViewport?.height ?? window.innerHeight;
      const keyboardIsOpen = window.innerHeight - visualHeight > 120;
      const viewportHeight = standalone && !keyboardIsOpen
        ? window.innerHeight
        : visualHeight;
      document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
    };

    const handleDisplayModeChange = () => updateAppFrame();

    updateAppFrame();
    window.addEventListener("resize", updateAppFrame);
    if (standaloneQuery.addEventListener) {
      standaloneQuery.addEventListener("change", handleDisplayModeChange);
    } else {
      standaloneQuery.addListener(handleDisplayModeChange);
    }
    window.visualViewport?.addEventListener("resize", updateAppFrame);

    return () => {
      window.removeEventListener("resize", updateAppFrame);
      if (standaloneQuery.removeEventListener) {
        standaloneQuery.removeEventListener("change", handleDisplayModeChange);
      } else {
        standaloneQuery.removeListener(handleDisplayModeChange);
      }
      window.visualViewport?.removeEventListener("resize", updateAppFrame);
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
                const blob = await audioDb.getTrackFile(track.id);
                if (blob) {
                  const newUrl = URL.createObjectURL(blob);
                  updated = true;
                  return { ...track, url: newUrl };
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
    const parsed = raw ? JSON.parse(raw) as string[] : ["chat", "archives", "worldbook", "music", "notes", "offline"];
    const filtered = parsed.filter(id => id !== "schedule");
    if (!filtered.includes("notes")) {
      filtered.push("notes");
    }
    if (!filtered.includes("offline")) {
      filtered.push("offline");
    }
    return filtered;
  });

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
      setCurrentTrack(allTracks[randomIndex]);
      setIsPlaying(true);
    } else {
      const currentIndex = allTracks.findIndex((t) => t.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % allTracks.length;
      setCurrentTrack(allTracks[nextIndex]);
      setIsPlaying(true);
    }
  };

  const handlePrevTrack = () => {
    const allTracks = [...PRESEED_MUSIC_TRACKS, ...tracks];
    if (allTracks.length === 0) return;
    const currentIndex = allTracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = (currentIndex - 1 + allTracks.length) % allTracks.length;
    setCurrentTrack(allTracks[prevIndex]);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (!globalAudioRef.current) {
      globalAudioRef.current = new Audio();
    }
    const audio = globalAudioRef.current;
    
    const handleEnded = () => {
      handleNextTrack();
    };

    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("ended", handleEnded);
    };
  }, [tracks, currentTrack, playMode]);

  useEffect(() => {
    const audio = globalAudioRef.current;
    if (!audio) return;
    
    if (currentTrack) {
      if (audio.src !== currentTrack.url) {
        audio.src = currentTrack.url;
      }
      if (isPlaying) {
        audio.play().catch(() => setIsPlaying(false));
      } else {
        audio.pause();
      }
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

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
    const migratedV3 = localStorage.getItem("phone_layout_migrated_v3");
    
    let items: HomeScreenItem[] = [];
    if (raw && migratedV3) {
      try {
        items = JSON.parse(raw);
      } catch (e) {}
    } else {
      // Force default gorgeous layout with Album & Music widgets arranged matching user screenshot
      items = [
        { id: "album_widget_1", type: "widget", widgetType: "album", size: "2x2", page: 0 },
        { id: "archives", type: "app", size: "1x1", page: 0 },
        { id: "worldbook", type: "app", size: "1x1", page: 0 },
        { id: "chat", type: "app", size: "1x1", page: 0 },
        { id: "offline", type: "app", size: "1x1", page: 0 },
        { id: "music", type: "app", size: "1x1", page: 0 },
        { id: "memory", type: "app", size: "1x1", page: 0 },
        { id: "music_widget_1", type: "widget", widgetType: "music", size: "2x2", page: 0 },
        { id: "store", type: "app", size: "1x1", page: 0 },
        { id: "settings", type: "app", size: "1x1", page: 0 },
        { id: "notes", type: "app", size: "1x1", page: 1 },
      ];
      localStorage.setItem("phone_homescreen_items", JSON.stringify(items));
      localStorage.setItem("phone_layout_migrated_v3", "true");
    }
    // Remove the retired 1x4 album and upgrade the previous 2x4 album slot
    // to the calendar album without disturbing other desktop items.
    items = items
      .filter((item) => item.id !== "schedule" && !(item.widgetType === "album" && item.size === "1x4"))
      .map((item) => item.widgetType === "album" && item.size === "2x4"
        ? { ...item, widgetType: "calendar-album" }
        : item);
    // Ensure all standard apps and widgets are present in layout
    if (!items.some(item => item.id === "album_widget_1")) {
      items.unshift({ id: "album_widget_1", type: "widget", widgetType: "album", size: "2x2", page: 0 });
    }
    if (!items.some(item => item.id === "music_widget_1")) {
      items.push({ id: "music_widget_1", type: "widget", widgetType: "music", size: "2x2", page: 0 });
    }
    if (!items.some(item => item.id === "memory")) {
      items.push({ id: "memory", type: "app", size: "1x1", page: 0 });
    }
    if (!items.some(item => item.id === "notes")) {
      items.push({ id: "notes", type: "app", size: "1x1", page: 1 });
    }
    if (!items.some(item => item.id === "offline")) {
      items.push({ id: "offline", type: "app", size: "1x1", page: 0 });
    }
    return items;
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

      const retrievalLimit = char.retrievalHistoryLimit || 100;
      const charMsgs = messages.filter((message) => relationId
        ? message.relationId === relationId
        : message.characterId === characterId).slice(-retrievalLimit);
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
        recentMessages: msgsToSummarize,
        existingMemories: memories,
        scenario: "immediate-summary",
        apiKey: settings.apiKey,
        model: (!recallSettings?.extractModel || recallSettings.extractModel === "default-chat-model") ? (settings.selectedModel || "gemini-3.5-flash") : recallSettings.extractModel,
        apiEndpoint: settings.apiEndpoint,
        templateType: char.archiveTemplateType,
        createId: () => (Date.now() + Math.random()).toString(),
        currentTime: () => Date.now(),
        formatContent: (items) => formatExtractedMemorySummary(headerLabel, items),
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
  const [draggedItem, setDraggedItem] = useState<HomeScreenItem | null>(null);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isShowingAddWidget, setIsShowingAddWidget] = useState(false);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const pageSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem("phone_homescreen_items", JSON.stringify(homeScreenItems));
  }, [homeScreenItems]);

  const getPageItemsWithPositions = (pageIdx: number) => {
    const pageItems = homeScreenItems.filter((item) => item.page === pageIdx);
    const columns = 4;
    const grid: boolean[][] = [];

    const getGridCell = (r: number, c: number): boolean => {
      if (!grid[r]) {
        grid[r] = new Array(columns).fill(false);
      }
      return grid[r][c];
    };

    const fillArea = (startRow: number, startCol: number, w: number, h: number) => {
      for (let r = startRow; r < startRow + h; r++) {
        for (let c = startCol; c < startCol + w; c++) {
          if (!grid[r]) {
            grid[r] = new Array(columns).fill(false);
          }
          grid[r][c] = true;
        }
      }
    };

    const isAreaEmpty = (startRow: number, startCol: number, w: number, h: number): boolean => {
      for (let r = startRow; r < startRow + h; r++) {
        for (let c = startCol; c < startCol + w; c++) {
          if (c >= columns) return false;
          if (getGridCell(r, c)) return false;
        }
      }
      return true;
    };

    return pageItems.map((item) => {
      let w = 1;
      let h = 1;
      if (item.size === "2x2") {
        w = 2;
        h = 2;
      } else if (item.size === "1x4") {
        w = 4;
        h = 1;
      } else if (item.size === "2x4") {
        w = 4;
        h = 2;
      }

      let r = 0;
      let c = 0;
      let placed = false;

      while (!placed) {
        if (c + w <= columns && isAreaEmpty(r, c, w, h)) {
          fillArea(r, c, w, h);
          placed = true;
          return { item, col: c, row: r };
        } else {
          c++;
          if (c >= columns) {
            c = 0;
            r++;
          }
        }
      }
      return { item, col: 0, row: 0 };
    });
  };

  const canFitOnPage = (
    existingItems: HomeScreenItem[],
    newItem: { type: "app" | "widget"; size: "1x1" | "2x2" | "1x4" | "2x4" },
    maxRows: number = 4
  ): boolean => {
    const columns = 4;
    const grid: boolean[][] = [];

    const getGridCell = (r: number, c: number): boolean => {
      if (!grid[r]) {
        grid[r] = new Array(columns).fill(false);
      }
      return grid[r][c];
    };

    const setGridCell = (r: number, c: number, val: boolean) => {
      if (!grid[r]) {
        grid[r] = new Array(columns).fill(false);
      }
      grid[r][c] = val;
    };

    const isAreaEmpty = (startRow: number, startCol: number, w: number, h: number): boolean => {
      for (let r = startRow; r < startRow + h; r++) {
        for (let c = startCol; c < startCol + w; c++) {
          if (c >= columns) return false;
          if (getGridCell(r, c)) return false;
        }
      }
      return true;
    };

    const fillArea = (startRow: number, startCol: number, w: number, h: number) => {
      for (let r = startRow; r < startRow + h; r++) {
        for (let c = startCol; c < startCol + w; c++) {
          setGridCell(r, c, true);
        }
      }
    };

    // Place existing items
    for (const item of existingItems) {
      let w = 1;
      let h = 1;
      if (item.size === "2x2") {
        w = 2;
        h = 2;
      } else if (item.size === "1x4") {
        w = 4;
        h = 1;
      } else if (item.size === "2x4") {
        w = 4;
        h = 2;
      }

      let placed = false;
      let r = 0;
      let c = 0;

      while (!placed) {
        if (c + w <= columns && isAreaEmpty(r, c, w, h)) {
          fillArea(r, c, w, h);
          placed = true;
        } else {
          c++;
          if (c >= columns) {
            c = 0;
            r++;
          }
        }
      }
    }

    // Check if the new item can fit
    let nw = 1;
    let nh = 1;
    if (newItem.size === "2x2") {
      nw = 2;
      nh = 2;
    } else if (newItem.size === "1x4") {
      nw = 4;
      nh = 1;
    } else if (newItem.size === "2x4") {
      nw = 4;
      nh = 2;
    }

    let placedNew = false;
    let r = 0;
    let c = 0;

    while (!placedNew) {
      if (c + nw <= columns && isAreaEmpty(r, c, nw, nh)) {
        if (r + nh > maxRows) {
          return false;
        }
        return true;
      } else {
        c++;
        if (c >= columns) {
          c = 0;
          r++;
        }
      }
    }

    return false;
  };

  const findPageForNewItem = (
    currentItems: HomeScreenItem[],
    newItem: { type: "app" | "widget"; size: "1x1" | "2x2" | "1x4" | "2x4" },
    startPage: number = 0
  ): number => {
    let page = startPage;
    while (true) {
      const itemsOnPage = currentItems.filter(item => item.page === page);
      if (canFitOnPage(itemsOnPage, newItem, 4)) {
        return page;
      }
      page++;
    }
  };

  const handleInstallApp = (id: string) => {
    setInstalledAppIds((prev) => {
      if (prev.includes(id)) return prev;
      setHomeScreenItems((current) => {
        if (current.some(item => item.id === id)) return current;
        const targetPage = findPageForNewItem(current, { type: "app", size: "1x1" }, currentPage);
        
        setTimeout(() => {
          setCurrentPage(targetPage);
        }, 50);

        return [...current, { id, type: "app", size: "1x1", page: targetPage }];
      });
      return [...prev, id];
    });
  };

  const handleUninstallApp = (id: string) => {
    setInstalledAppIds((prev) => prev.filter((appId) => appId !== id));
    setHomeScreenItems((current) => current.filter((item) => item.id !== id));
    if (activeApp === id) {
      setActiveApp(null);
    }
  };

  // Unified pointer swiping and stable dragging/swapping logic
  const handleItemPointerDown = (
    e: React.PointerEvent<HTMLDivElement>, 
    item: HomeScreenItem, 
    index: number
  ) => {
    e.stopPropagation(); // Prevents empty desktop long press!

    const clientX = e.clientX;
    const clientY = e.clientY;

    setDragStart({ x: clientX, y: clientY });
    setDragCurrent({ x: clientX, y: clientY });
    swipeStartRef.current = { x: clientX, y: clientY };

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    if (isEditingHomeScreen) {
      // In editing mode: start dragging immediately!
      setDraggedItem(item);
      setDraggedItemIndex(index);
    } else {
      // In non-editing mode: long press for 400ms (snappier!) to enter edit mode and start dragging
      longPressTimerRef.current = setTimeout(() => {
        setIsEditingHomeScreen(true);
        setDraggedItem(item);
        setDraggedItemIndex(index);
      }, 400);
    }
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (draggedItem) {
      setDraggedItem(null);
      setDraggedItemIndex(null);
    }
  };

  const moveDraggedItemToPage = (targetPage: number, itemId: string) => {
    setDraggedItem((prev) => prev ? { ...prev, page: targetPage } : null);
    setHomeScreenItems((current) => {
      return current.map(item => {
        if (item.id === itemId) {
          return { ...item, page: targetPage };
        }
        return item;
      });
    });
  };

  const debouncePageSwitch = (targetPage: number, itemId: string) => {
    if (pageSwitchTimeoutRef.current) return;
    pageSwitchTimeoutRef.current = setTimeout(() => {
      setCurrentPage(targetPage);
      moveDraggedItemToPage(targetPage, itemId);
      pageSwitchTimeoutRef.current = null;
    }, 600);
  };

  const clearPageSwitchTimeout = () => {
    if (pageSwitchTimeoutRef.current) {
      clearTimeout(pageSwitchTimeoutRef.current);
      pageSwitchTimeoutRef.current = null;
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!draggedItem) return;

    const clientX = e.clientX;
    const clientY = e.clientY;

    // Direct DOM styling for real-time responsiveness without waiting for React render cycles
    const cloneEl = document.getElementById("tactile-drag-clone");
    if (cloneEl) {
      cloneEl.style.left = `${clientX}px`;
      cloneEl.style.top = `${clientY}px`;
    }

    setDragCurrent({ x: clientX, y: clientY });

    if (pageContainerRef.current) {
      const rect = pageContainerRef.current.getBoundingClientRect();
      const relativeX = clientX - rect.left;

      if (relativeX < 40 && currentPage > 0) {
        debouncePageSwitch(currentPage - 1, draggedItem.id);
      } else if (relativeX > rect.width - 40) {
        const totalPages = Math.max(1, ...homeScreenItems.map(item => item.page + 1));
        if (currentPage < totalPages - 1) {
          debouncePageSwitch(currentPage + 1, draggedItem.id);
        } else if (currentPage < 4) { // Limit to 5 pages max
          debouncePageSwitch(currentPage + 1, draggedItem.id);
        }
      } else {
        clearPageSwitchTimeout();
      }
    }

    if (pageContainerRef.current) {
      const items = pageContainerRef.current.querySelectorAll(`.grid-item[data-page="${currentPage}"]`);
      let targetId: string | null = null;
      let minDistance = Infinity;

      items.forEach((el) => {
        const id = el.getAttribute("data-id");
        if (id === draggedItem.id) return;

        const rect = el.getBoundingClientRect();
        // Distance-to-center proximity check for incredibly "跟手" and smooth placement
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - centerX, clientY - centerY);

        const threshold = Math.max(rect.width, rect.height) * 0.85;
        if (dist < threshold && dist < minDistance) {
          minDistance = dist;
          targetId = id;
        }
      });

      if (targetId) {
        setHomeScreenItems((current) => {
          const thisPageItems = current.filter(item => item.page === currentPage);
          const otherPageItems = current.filter(item => item.page !== currentPage);

          const dragIdx = thisPageItems.findIndex(item => item.id === draggedItem.id);
          const targetIdx = thisPageItems.findIndex(item => item.id === targetId);

          if (dragIdx !== -1 && targetIdx !== -1 && dragIdx !== targetIdx) {
            const reordered = [...thisPageItems];
            const [removed] = reordered.splice(dragIdx, 1);
            reordered.splice(targetIdx, 0, removed);
            return [...otherPageItems, ...reordered];
          }
          return current;
        });
      }
    }
  };

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      // 1. If we are dragging an item:
      if (draggedItem) {
        handlePointerMove(e);
        return;
      }

      // 2. If we are tracking a swipe start (not yet dragging):
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
      // Clear long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      // 1. If we are dragging an item:
      if (draggedItem) {
        handlePointerUp();
      }

      // 2. If we are swiping the desktop:
      if (swipeStartRef.current && !draggedItem) {
        const dx = e.clientX - swipeStartRef.current.x;
        const dy = e.clientY - swipeStartRef.current.y;

        // If swipe horizontal distance is more than 50px
        if (Math.abs(dx) > 50 && Math.abs(dy) < 100) {
          const totalPages = Math.max(1, ...homeScreenItems.map(item => item.page + 1));
          if (dx < -50 && currentPage < totalPages - 1) {
            // Swipe left -> go to next page
            setCurrentPage(prev => prev + 1);
          } else if (dx > 50 && currentPage > 0) {
            // Swipe right -> go to previous page
            setCurrentPage(prev => prev - 1);
          }
        }
      }

      // Reset swipe tracking and offset
      swipeStartRef.current = null;
      setSwipeOffset(0);
    };

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp, { passive: true });
    window.addEventListener("pointercancel", handleGlobalPointerUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, [draggedItem, currentPage, homeScreenItems]);

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
      setIsEditingHomeScreen(false);
    }
  };

  const handleAddWidget = (widgetType: "album" | "music" | "anniversary" | "todo" | "calendar_album" | "welcome") => {
    if (widgetType === "welcome") {
      setSettings(prev => ({ ...prev, hideHomeWelcomeWidget: false }));
      setIsShowingAddWidget(false);
      return;
    }

    setHomeScreenItems((current) => {
      let size: "1x1" | "2x2" | "1x4" | "2x4" = "2x2";
      let actualWidgetType: "album" | "calendar-album" | "music" | "anniversary" | "todo" = "todo";

      if (widgetType === "calendar_album") {
        size = "2x4";
        actualWidgetType = "calendar-album";
      } else if (widgetType === "album") {
        size = "2x2";
        actualWidgetType = "album";
      } else {
        size = "2x2";
        actualWidgetType = widgetType as any;
      }

      const targetPage = findPageForNewItem(current, { type: "widget", size }, currentPage);
      const newWidget: HomeScreenItem = {
        id: `widget-${widgetType}-${Date.now()}`,
        type: "widget",
        widgetType: actualWidgetType,
        size,
        page: targetPage,
      };

      setTimeout(() => {
        setCurrentPage(targetPage);
      }, 50);

      return [...current, newWidget];
    });
    setIsShowingAddWidget(false);
  };

  const handleRemoveWidget = (id: string) => {
    setHomeScreenItems(current => current.filter(item => item.id !== id));
  };

  const getWidgetComponent = (type?: string) => {
    switch (type) {
      case "album": return AlbumWidget;
      case "calendar-album": return CalendarAlbumWidget;
      case "music": return MusicWidget;
      case "anniversary": return AnniversaryWidget;
      case "todo": default: return TodoWidget;
    }
  };

  const handleItemClick = (item: HomeScreenItem) => {
    if (isEditingHomeScreen) return;
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

    const result = saveSettings(settings);
    if (!result.success) {
      console.error("Failed to save settings to localStorage:", result.error);
    }
    settingsChangedByUser.current = false;
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
      localStorage.setItem("phone_music_tracks", JSON.stringify(tracks));
    } catch (e) {
      console.error("Failed to save tracks to localStorage:", e);
    }
  }, [tracks]);

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
      const cleaned = removeCanonicalCharacterData(
        { relationships, messages, memories, offlineStories },
        id,
        deletedCharacterIds,
      );
      setCharacters((prev) => prev
        .filter((character) => !characterIds.has(character.id))
        .map((character) => character.isGroupChat && character.memberIds
          ? { ...character, memberIds: character.memberIds.filter((memberId) => !characterIds.has(memberId)) }
          : character));
      setRelationships(cleaned.relationships);
      setMessages(cleaned.messages);
      setMemories(cleaned.memories);
      setOfflineStories(cleaned.offlineStories);
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
    setMessages((prev) => [...prev, msg]);

    // Update character's last active time on message exchange
      if (msg.relationId) {
        setRelationships((previous) => previous.map((relation) => relation.id === msg.relationId ? { ...relation, lastActiveTime: Date.now(), updatedAt: Date.now() } : relation));
      }

    // Check if auto-translation is enabled and the message needs translation
    const char = characters.find((c) => c.id === msg.characterId);
    if (
      char &&
      char.enableAutoTranslate &&
      msg.sender === "character" &&
      !msg.isNarration &&
      !msg.content.startsWith("data:image/") &&
      !msg.content.startsWith("[红包]")
    ) {
      // Check if text is non-Chinese
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
              setMessages((prev) =>
                prev.map((m) => (m.id === msg.id ? { ...m, translation: res.text } : m))
              );
            }
          })
          .catch((err) => {
            console.error("Auto translation error:", err);
          });
      }
    }
  };

  const handleToggleBookmark = (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isBookmarked: !m.isBookmarked } : m))
    );
  };

  const handleDeleteMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const handleUpdateMessage = (id: string, updatedFields: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updatedFields } : m))
    );
  };

  // Moments Handlers
  const handleAddMoment = (newMo: Moment) => {
    setMoments((prev) => [newMo, ...prev]);
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
    setMoments((prev) => {
      const deletedMoment = prev.find((moment) => moment.id === momentId);
      if (deletedMoment && !recordDeletedCharacterMoment(deletedMoment)) {
        console.error("Failed to persist deleted character Moment generation task.");
      }
      return prev.filter((moment) => moment.id !== momentId);
    });
  };

  const handleDeleteMomentsByRelation = (relationId: string) => {
    setMoments((previous) => previous.filter((moment) => moment.relationId !== relationId));
  };

  const handleAddCommentToMoment = (momentId: string, comment: MomentComment) => {
    setMoments((prev) =>
      prev.map((mom) => {
        if (mom.id === momentId) {
          return {
            ...mom,
            comments: [...mom.comments, comment],
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
    setTracks((prev) => {
      const track = prev.find((t) => t.id === id);
      if (track?.isLocal) {
        audioDb.deleteTrackFile(id).catch((err) => {
          console.error("Failed to delete local track from IndexedDB:", err);
        });
      }
      return prev.filter((t) => t.id !== id);
    });
  };

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

  return (
    <div
      className="min-h-[100dvh] md:min-h-screen w-full bg-[#f3f4f6] flex items-start md:items-center justify-center p-0 md:p-6 select-none bg-gradient-to-br from-[#f5f5f7] to-[#e5e5eb] overflow-hidden"
      data-pwa-standalone={isStandaloneMode ? "true" : "false"}
      style={{
        position: (typeof window !== "undefined" && window.innerWidth < 768) ? "fixed" : "relative",
        top: (typeof window !== "undefined" && window.innerWidth < 768) ? 0 : undefined,
        left: (typeof window !== "undefined" && window.innerWidth < 768) ? 0 : undefined,
        width: "100%",
        height: (typeof window !== "undefined" && window.innerWidth < 768) ? "var(--app-height, 100dvh)" : "100dvh",
        // `min-h-[100dvh]` is useful before the app mounts, but on Android Edge it can
        // retain the layout viewport height after the IME opens. Override it with the
        // visual viewport height so the flex layout keeps the chat composer above the
        // keyboard instead of leaving an empty area below the messages.
        minHeight: (typeof window !== "undefined" && window.innerWidth < 768) ? "var(--app-height, 100dvh)" : undefined,
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
          --app-default-icon-color: #1d1d1f;
          --app-default-icon-surface: #ffffff;
          --app-default-icon-border: #e5e5e2;
        }
        @media (prefers-color-scheme: dark) {
          :root, .phone-screen-container {
            --app-default-icon-color: #f3f3f5;
            --app-default-icon-surface: #17181b;
            --app-default-icon-border: #2d2e33;
          }
        }
        .phone-screen-container .app-icon-surface {
          background-color: var(--app-default-icon-surface) !important;
          border-color: var(--app-default-icon-border) !important;
          color: var(--app-default-icon-color) !important;
        }
        .phone-screen-container .app-icon-surface .app-default-icon {
          color: inherit !important;
        }
        .phone-screen-container div[style*="--app-icon-radius"],
        .phone-screen-container button[style*="--app-icon-radius"],
        .phone-screen-container div.bg-white[style*="--app-icon-radius"],
        .phone-screen-container button.bg-white[style*="--app-icon-radius"] {
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
          background-color: #ffffff !important;
          background-image: none !important;
          color: #0f0f10 !important;
        }

        /* Ensure all card/panel containers are white */
        .phone-screen-container div.bg-white,
        .phone-screen-container div.bg-stone-50,
        .phone-screen-container div.bg-slate-50 {
          background-color: #ffffff !important;
        }

        /* 2. Unified Border Radius: Strict 32px Rounding */
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
        .phone-screen-container .rounded-full:not(img):not(.avatar-img):not(.avatar-icon),
        .phone-screen-container button,
        .phone-screen-container input:not([type="checkbox"]),
        .phone-screen-container select,
        .phone-screen-container textarea,
        .phone-screen-container [class*="rounded-"]:not(img):not(.avatar-img):not(.avatar-icon),
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
        .phone-screen-container input,
        .phone-screen-container textarea,
        .phone-screen-container select,
        .phone-screen-container .border,
        .phone-screen-container .border-b,
        .phone-screen-container .border-t,
        .phone-screen-container .border-l,
        .phone-screen-container .border-r,
        .phone-screen-container .border-slate-100,
        .phone-screen-container .border-slate-200,
        .phone-screen-container .border-stone-100,
        .phone-screen-container .border-stone-200,
        .phone-screen-container .border-neutral-200/20 {
          border-width: 1px !important;
          border-style: solid !important;
          border-color: rgba(229, 231, 235, 0.8) !important;
        }

        /* For inputs, add clean padding and force the 32px rounding */
        .phone-screen-container input,
        .phone-screen-container textarea,
        .phone-screen-container select {
          border-radius: 32px !important;
          background-color: #ffffff !important;
          color: #0f0f10 !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03) !important;
          outline: none !important;
        }

        /* 5. Minimal Shadow Style (Shadows/Base/6) */
        .phone-screen-container .shadow,
        .phone-screen-container .shadow-sm,
        .phone-screen-container .shadow-md,
        .phone-screen-container .shadow-lg,
        .phone-screen-container .shadow-xl,
        .phone-screen-container .shadow-2xl {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03) !important;
        }

        /* 6. Typography & Text Levels Hierarchy */
        .phone-screen-container h1,
        .phone-screen-container h2,
        .phone-screen-container .font-bold.text-slate-800,
        .phone-screen-container .font-extrabold {
          color: #0f0f10 !important;
          font-weight: 800 !important;
          letter-spacing: -0.025em !important;
        }

        .phone-screen-container h3,
        .phone-screen-container h4,
        .phone-screen-container .font-semibold {
          color: #27272a !important;
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
          color: #52525b !important;
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
          color: #a1a1aa !important;
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
          background-color: #0f0f10 !important;
          color: #ffffff !important;
          border-color: #0f0f10 !important;
          border-radius: 32px !important;
        }

        /* Direct rule to guarantee selected dark button text is white and visible */
        .phone-screen-container .bg-neutral-950,
        .phone-screen-container .bg-neutral-950 *,
        .phone-screen-container button.bg-neutral-950,
        .phone-screen-container button.bg-neutral-950 * {
          color: #ffffff !important;
        }

        /* Secondary text-based button links -> Clean support gray text with link look */
        .phone-screen-container .text-indigo-600,
        .phone-screen-container .text-blue-600,
        .phone-screen-container .text-purple-600,
        .phone-screen-container .text-emerald-500 {
          color: #52525b !important;
        }

        /* Back/Close buttons (x/arrow) -> Circle with 1px light grey outline, rounded standardized */
        .phone-screen-container button[title="返回"],
        .phone-screen-container button[title="关闭"],
        .phone-screen-container #schedule_back_btn,
        .phone-screen-container .back-btn {
          border-radius: 32px !important;
          background-color: #ffffff !important;
          border: 1px solid rgba(229, 231, 235, 0.8) !important;
          color: #0f0f10 !important;
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
          background-color: #0f0f10 !important;
          color: #ffffff !important;
          border-radius: 32px !important;
          border: none !important;
        }
        .phone-screen-container .chat-bubble-self *,
        .phone-screen-container div[class*="bg-indigo-600"] * {
          color: #ffffff !important;
        }

        /* Other bubble: Soft light gray, charcoal text, 32px round */
        .phone-screen-container .chat-bubble-other,
        .phone-screen-container div[class*="bg-slate-200"],
        .phone-screen-container div[class*="bg-stone-100"] {
          background-color: #f4f4f5 !important;
          color: #0f0f10 !important;
          border-radius: 32px !important;
          border: 1px solid rgba(229, 231, 235, 0.8) !important;
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
          background-color: #e4e4e7 !important; /* Light grey track background (#e4e4e7) */
          border-radius: 32px !important; /* Unified border radius size */
          border: 1px solid rgba(228, 228, 231, 0.8) !important;
        }

        /* Thumb style - Webkit */
        .phone-screen-container input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 16px !important;
          width: 16px !important;
          border-radius: 32px !important; /* Unified border radius size */
          background-color: #0f0f10 !important; /* Solid charcoal */
          border: 2px solid #ffffff !important;
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
          background-color: #e4e4e7 !important; /* Light grey track background */
          border-radius: 32px !important;
          border: 1px solid rgba(228, 228, 231, 0.8) !important;
        }

        /* Thumb style - Firefox */
        .phone-screen-container input[type="range"]::-moz-range-thumb {
          height: 16px !important;
          width: 16px !important;
          border-radius: 32px !important;
          background-color: #0f0f10 !important;
          border: 2px solid #ffffff !important;
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
          background: settings.wallpaper.startsWith("linear-gradient")
            ? settings.wallpaper
            : `url(${settings.wallpaper}) center/cover no-repeat`,
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
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 48px)" }}
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
              className="flex-1 flex flex-col justify-between p-4 select-none touch-none"
              style={{
                paddingTop: "calc(env(safe-area-inset-top, 0px) + 40px)",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)"
              }}
              onPointerDown={handleDesktopPointerDown}
              onPointerUp={handleDesktopPointerUp}
              onPointerLeave={handleDesktopPointerUp}
              onClick={handleDesktopClick}
            >
              
              {/* Multiple Pages Grid Section */}
              {(() => {
                const totalPages = Math.max(1, ...homeScreenItems.map(item => item.page + 1));
                let activeOffset = swipeOffset;
                if (currentPage === 0 && activeOffset > 0) {
                  activeOffset = Math.pow(activeOffset, 0.82); // elastic boundary feel
                } else if (currentPage === totalPages - 1 && activeOffset < 0) {
                  activeOffset = -Math.pow(-activeOffset, 0.82); // elastic boundary feel
                }
                return (
                  <div className="flex-1 overflow-hidden flex flex-col relative py-2 select-none">
                    <div className="flex-1 overflow-hidden relative">
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
                          const iconWidth = isHiddenNames ? 60 : 52;
                          const iconSizeStyle = isHiddenNames 
                            ? { width: "60px", height: "60px" } 
                            : { width: "52px", height: "52px" };

                          // Calculate perfect 1:1 widget width/height and grid row height dynamically
                          const gridPadding = 12; // 12px padding left/right (matches px-3 of dock!)
                          const outerWidth = 343; // 375px (screen) - 32px (p-4 parent padding)
                          const innerWidth = outerWidth - 2 * gridPadding; // 319px
                          const gapWidth = (innerWidth - 4 * iconWidth) / 3;
                          const widgetWidthValue = 2 * iconWidth + gapWidth;
                          const widgetHeight = `${widgetWidthValue}px`;

                          const rowGapValue = 16;
                          const rowHeightValue = (widgetWidthValue - rowGapValue) / 2;

                          const gridStyle = {
                            paddingLeft: `${gridPadding}px`,
                            paddingRight: `${gridPadding}px`,
                            paddingTop: "14px",
                            paddingBottom: "14px",
                            display: "grid",
                            gridTemplateColumns: `repeat(4, ${iconWidth}px)`,
                            justifyContent: "space-between",
                            gridAutoRows: `${rowHeightValue}px`,
                            rowGap: `${rowGapValue}px`
                          };

                          return (
                            <div 
                              key={pageIdx}
                              className="w-full h-full flex-shrink-0 flex flex-col select-none px-0"
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
                                className="flex-1 content-start select-none"
                                style={gridStyle}
                              >
                                {getPageItemsWithPositions(pageIdx).map(({ item, col, row }, index) => {
                                  const alignClass = "justify-self-center items-center text-center";

                                  if (item.type === "app") {
                                    const app = desktopApps.find(a => a.id === item.id);
                                    if (!app) return null;
                                    const isDragged = draggedItem?.id === item.id;
                                    const customIconUrl = settings.customIcons[app.id];

                                    return (
                                      <div
                                        key={item.id}
                                        data-id={item.id}
                                        data-page={pageIdx}
                                        className={`grid-item col-span-1 row-span-1 flex flex-col ${alignClass} justify-start relative group transition-opacity duration-200 ${
                                          isDragged ? "opacity-30 scale-95 cursor-grabbing" : "cursor-pointer"
                                        }`}
                                        onPointerDown={(e) => {
                                          if (isEditingHomeScreen) e.preventDefault();
                                          handleItemPointerDown(e, item, index);
                                        }}
                                        onClick={() => handleItemClick(item)}
                                      >
                                        <div className={`w-full flex flex-col ${alignClass} ${
                                          isEditingHomeScreen && !isDragged 
                                            ? (index % 2 === 0 ? "animate-jiggle" : "animate-jiggle-reverse") 
                                            : ""
                                        }`}>
                                          <div 
                                            className="app-icon-surface bg-white border border-[#f0f0f3] flex items-center justify-center shadow-[0_3px_8px_rgba(0,0,0,0.05)] transform active:scale-95 transition-all duration-150 overflow-hidden shrink-0"
                                            style={{ borderRadius: "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                                          >
                                            {customIconUrl ? (
                                              <img src={customIconUrl} alt={app.name} className="w-full h-full object-cover" />
                                            ) : (
                                              <div className="app-default-icon w-full h-full flex items-center justify-center scale-90">
                                                {app.icon}
                                              </div>
                                            )}
                                          </div>
                                          {!isHiddenNames && (
                                            <span className="text-[10px] font-extrabold mt-1 text-neutral-800 truncate w-[72px] -mx-3.5 block select-none tracking-tight font-sans text-center">
                                              {app.name}
                                            </span>
                                          )}
                                        </div>

                                        {isEditingHomeScreen && item.id !== "store" && item.id !== "settings" && (
                                          <button
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
                                          isDragged ? "opacity-30 scale-95" : ""
                                        }`}
                                        style={{ height: currentWidgetHeight }}
                                        onPointerDown={(e) => {
                                          if (isEditingHomeScreen) e.preventDefault();
                                          handleItemPointerDown(e, item, index);
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

                return (
                  <div 
                    className="dock-container backdrop-blur-xl border border-neutral-200/20 py-2.5 shadow-lg shrink-0 mx-0 px-3"
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
                          className="app-icon-surface bg-white border border-[#f0f0f3] flex items-center justify-center shadow-[0_3px_8px_rgba(0,0,0,0.05)] active:scale-90 transition-all hover:bg-stone-50 overflow-hidden shrink-0"
                          style={{ borderRadius: "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                        >
                          {settings.customIcons["chat"] ? (
                            <img src={settings.customIcons["chat"]} alt="" className="w-full h-full object-cover" />
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
                          className="app-icon-surface bg-white border border-[#f0f0f3] flex items-center justify-center shadow-[0_3px_8px_rgba(0,0,0,0.05)] active:scale-90 transition-all hover:bg-stone-50 overflow-hidden shrink-0"
                          style={{ borderRadius: "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                        >
                          {settings.customIcons["music"] ? (
                            <img src={settings.customIcons["music"]} alt="" className="w-full h-full object-cover" />
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
                          className="app-icon-surface bg-white border border-[#f0f0f3] flex items-center justify-center shadow-[0_3px_8px_rgba(0,0,0,0.05)] active:scale-90 transition-all hover:bg-stone-50 overflow-hidden shrink-0"
                          style={{ borderRadius: "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                        >
                          {settings.customIcons["archives"] ? (
                            <img src={settings.customIcons["archives"]} alt="" className="w-full h-full object-cover" />
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
                        className="app-icon-surface bg-white border border-[#f0f0f3] flex items-center justify-center shadow-[0_3px_8px_rgba(0,0,0,0.05)] active:scale-90 transition-all hover:bg-stone-50 overflow-hidden shrink-0"
                        style={{ borderRadius: "var(--app-icon-radius, 35%)", ...iconSizeStyle }}
                      >
                        {settings.customIcons["settings"] ? (
                          <img src={settings.customIcons["settings"]} alt="" className="w-full h-full object-cover" />
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

            </div>
          ) : (
            // Full screen app view ports with transitions
            <div 
              className="absolute inset-0 z-30 bg-slate-50/92 backdrop-blur-md flex flex-col h-full"
              style={{
                paddingTop: "calc(env(safe-area-inset-top, 0px) + 36px)",
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
                  />
                </div>

                {activeApp === "archives" && (
                  <AppArchives
                    characters={characters}
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
                  />
                )}

                {activeApp === "forum" && (
                  <AppForum
                    onClose={() => setActiveApp(null)}
                  />
                )}

                {activeApp === "notes" && (
                  <AppNotes
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
                    onDeleteOfflineStory={handleDeleteOfflineStory}
                    onClose={() => setActiveApp(null)}
                    activeChatRelationId={activeChatRelationId}
                    onNavigateToChat={(charId, relationId) => {
                      setActiveChatCharId(charId);
                      setActiveChatRelationId(relationId || null);
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
            const activeWallpaper = (activeApp === "chat" && activeChar && activeChar.chatBg) 
              ? activeChar.chatBg 
              : settings.wallpaper;
            return <StatusBar wallpaper={activeWallpaper} />;
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
                  className="bg-white border border-[#f0f0f3] flex items-center justify-center overflow-hidden shrink-0 shadow-lg" 
                  style={{ 
                    borderRadius: "var(--app-icon-radius, 35%)",
                    width: settings.hideAppNames ? "52px" : "44px",
                    height: settings.hideAppNames ? "52px" : "44px"
                  }}
                >
                  {settings.customIcons[draggedItem.id] ? (
                    <img src={settings.customIcons[draggedItem.id]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center scale-90 text-stone-800">
                      {desktopApps.find(a => a.id === draggedItem.id)?.icon}
                    </div>
                  )}
                </div>
                {!settings.hideAppNames && (
                  <span className="text-[10px] font-black mt-1 text-neutral-800">
                    {desktopApps.find(a => a.id === draggedItem.id)?.name}
                  </span>
                )}
              </div>
            ) : (
              <div 
                style={{ 
                  width: draggedItem.size === "1x4" ? "300px" : draggedItem.size === "2x4" ? "300px" : (settings.hideAppNames ? "154px" : "150px"),
                  height: draggedItem.size === "1x4" ? "54px" : draggedItem.size === "2x4" ? "120px" : (settings.hideAppNames ? "154px" : "150px")
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
