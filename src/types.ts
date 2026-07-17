export interface CharacterReference {
  id: string;
  title: string;
  content: string;
}

export interface Character {
  id: string;
  name: string;
  age?: number | "";
  avatar: string; // URL, emoji, or base64
  gender?: string;
  mbti?: string;
  personality: string;
  backstory: string;
  remark?: string; // Edit remark in chat menu
  isPinned?: boolean; // Pin chat to top
  chatBg?: string; // Custom chat background image
  momentsCover?: string; // Personal moments background cover
  album?: string[]; // Personal photo gallery / album
  references?: CharacterReference[];
  enableAutoSummary?: boolean;
  enableAutoTranslate?: boolean;
  summaryTriggerRound?: number;
  compressedMemory?: string;
  enableProactiveChat?: boolean;
  proactiveChatInterval?: number;
  proactiveStartTime?: string;
  proactiveEndTime?: string;
  lastActiveTime?: number;
  scheduledProactiveTime?: number;
  customCss?: string;
  chatStylePreset?: "default" | "floating-cute" | "liquid-glass";
  greeting?: string;
  lastImmediateSummaryMsgId?: string;
  disableBracketActions?: boolean;
  historyMemoryLimit?: number;
  contextMemoryLimit?: number; // 10~50, default 20
  retrievalHistoryLimit?: number; // 10~200, default 100
  archiveTemplateType?: "refined" | "delicate"; // "refined" (event log) | "delicate" (first person diary)
  autoArchiveInterval?: number; // 10~100, default 50 rounds
  enableAutoArchive?: boolean;
  enableTimeAwareness?: boolean;
  isGroupChat?: boolean;
  memberIds?: string[];
  minimaxVoiceId?: string;
  minimaxSpeed?: number;
  voiceFrequency?: "low" | "medium" | "high" | "none";
}

export interface Message {
  id: string;
  characterId: string;
  sender: "user" | "character";
  senderId?: string;
  content: string;
  timestamp: number;
  isBookmarked?: boolean;
  isOffline?: boolean;
  isNarration?: boolean;
  translation?: string;
  audioUrl?: string;
  audioDuration?: number;
  isVoiceMessage?: boolean;
}

export interface MomentComment {
  id: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: number;
}

export interface Moment {
  id: string;
  characterId?: string; // If posted by a character, otherwise user
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: number;
  likes: string[]; // List of names
  comments: MomentComment[];
  image?: string; // base64 or URL
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  url: string; // File ObjectURL or raw internet URL
  isLocal: boolean;
  duration?: string;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  tracks: string[]; // Track IDs
}

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description?: string;
  isDone: boolean;
}

export interface WorldBookEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  timestamp: number;
  characterId?: string; // "global" or a specific character's ID
  triggerType?: "keys" | "constant" | "vector";
  keywords?: string;
  isActive?: boolean;
  position?: "after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history";
  depth?: number;
}

export interface UserIdentity {
  id: string;
  name: string;
  avatar: string;
  signature: string;
  bio: string;
}

export interface UserSettings {
  name: string;
  avatar: string;
  signature: string;
  bio: string;
  apiKey: string;
  selectedModel: string;
  wallpaper: string; // Wallpaper URL or base64
  customIcons: Record<string, string>; // appKey -> image base64/URL or empty
  bubbleCss: string; // Custom bubble CSS
  globalCss: string; // Custom global CSS
  globalChatStylePreset?: "default" | "floating-cute" | "liquid-glass";
  activePreset: string; // Preset name
  momentsCover?: string; // Moments cover image URL or base64
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
  apiPresets?: ApiPreset[];
  activeApiPresetId?: string;
  showHomeButton?: boolean;
  dockColor?: string;
  dockOpacity?: number;
  widgetOpacity?: number;
  customFontName?: string;
  customFontData?: string;
  iconBorderRadius?: number;
  iconBgOpacity?: number;
  iconBorderWidth?: number;
  iconBorderOpacity?: number;
  hideAppNames?: boolean;
  enableTimeAwareness?: boolean;
  homeButtonPosition?: { x: number; y: number };
  identities?: UserIdentity[];
  activeIdentityId?: string;
  avatarBorderRadius?: number;
  otherBubbleBg?: string;
  otherBubbleColor?: string;
  otherBubbleRadius?: number;
  otherBubbleOpacity?: number;
  selfBubbleBg?: string;
  selfBubbleColor?: string;
  selfBubbleRadius?: number;
  selfBubbleOpacity?: number;
  collapseConsecutiveAvatars?: boolean;
  hideHomeWelcomeWidget?: boolean;
  dockBorderRadius?: number;
  widgetBorderRadius?: number;
  iconBorderEnabled?: boolean;
  bubbleTailEnabled?: boolean;
  bubbleTailVertical?: "top" | "center" | "bottom";
  bubblePosition?: "side" | "above" | "below";
  hideNicknames?: boolean;
  bubbleBorderEnabled?: boolean;
  bubbleBorderWidth?: number;
  otherBubbleBorderColor?: string;
  selfBubbleBorderColor?: string;
  avatarBorderEnabled?: boolean;
  avatarBorderWidth?: number;
  avatarBorderColor?: string;

  // MiniMax TTS Settings
  enableMiniMaxTts?: boolean;
  minimaxApiKey?: string;
  minimaxGroupId?: string;
  minimaxModel?: string;
  minimaxSpeed?: number;
  minimaxPitch?: number;
  minimaxVol?: number;
  minimaxProxyUrl?: string;
}

export interface ApiPreset {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string;
  selectedModel: string;
  apiTemperature: number;
  streamCompatible: boolean;
}

export interface StylePreset {
  id: string;
  name: string;
  bubbleCss: string;
  globalCss: string;
  wallpaper: string;
  themeColor: string;
}

export interface HomeScreenItem {
  id: string;
  type: "app" | "widget";
  widgetType?: "album" | "music" | "anniversary" | "todo";
  size: "1x1" | "2x2" | "1x4" | "2x4";
  page: number;
}

export interface MemoryItem {
  id: string;
  characterId: string;
  content: string;
  timestamp: number;
  importance?: number; // 1-10, default 5
  isManual?: boolean;
}

export interface MemoryVaultSettings {
  extractModel: string;
  recallCount: number;
  autoExtract: boolean;
  extractInterval: number;
}

export interface ImmediateSummaryTask {
  characterId: string;
  status: "idle" | "summarizing" | "completed" | "error";
  rounds: number;
  extractedCount: number;
  error?: string;
}

export interface OfflineStory {
  id: string;
  characterId: string;
  characterIds?: string[];
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: "director" | "continue" | "if";
  ifPrompt?: string;
  sourceChatId?: string; // Optional reference source
  sourceChatMsgCount?: number;
  messages: Message[];
  wordLimit?: number;
  partnerPerspective?: string;
  userPerspective?: string;
  stylePresetId?: string;
  stylePromptName?: string;
  stylePromptContent?: string;
  showAvatars?: boolean;
  customCss?: string;
  /** Frozen at the moment an online chat is explicitly imported into this story. */
  importedContext?: {
    messages: Message[];
    memories: string[];
    worldBook: string[];
    importedAt: number;
  };
  archivedAt?: number;
  archivedMemoryIds?: string[];
}

export interface Sticker {
  id: string;
  name: string;
  url: string; // Dynamic ObjectURL or base64/url
}

export interface StickerGroup {
  id: string;
  name: string;
  stickers: Sticker[];
}



