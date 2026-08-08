import type { CharacterRoutine } from "./domain/characterLife/characterRoutine/characterRoutineTypes";

export interface CharacterReference {
  id: string;
  title: string;
  content: string;
}

export const CHAT_ICON_KEYS = ["image", "voice", "sticker", "redPacket", "transfer", "file", "location", "call", "plus", "send"] as const;
export type ChatIconKey = typeof CHAT_ICON_KEYS[number];
export type ChatIconOverrides = Partial<Record<ChatIconKey, string>>;

/** Keeps persisted/imported icon configuration safe for direct image rendering. */
export function sanitizeChatIcons(value: unknown): ChatIconOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return CHAT_ICON_KEYS.reduce<ChatIconOverrides>((icons, key) => {
    const icon = source[key];
    if (typeof icon === "string" && icon.trim()) icons[key] = icon.trim();
    return icons;
  }, {});
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
  /** Optional character-level routine configuration; it is a prompt hint only. */
  routine?: CharacterRoutine;
  enableProactiveChat?: boolean;
  /** Whether this contact may occasionally start an incoming voice call. */
  enableProactiveCall?: boolean;
  proactiveChatInterval?: number;
  proactiveStartTime?: string;
  proactiveEndTime?: string;
  lastActiveTime?: number;
  scheduledProactiveTime?: number;
  /** CSS scoped to this character's active chat conversation. */
  customChatCSS?: string;
  /** Per-character overrides for chat function icon resources. */
  customChatIcons?: ChatIconOverrides;
  /** @deprecated Use customChatCSS for chat-only styling. */
  customCss?: string;
  chatStylePreset?: "default" | "floating-cute" | "liquid-glass";
  greeting?: string;
  /** First-chat setup used as hidden guidance instead of a visible greeting bubble. */
  initialChatContext?: string;
  initialChatMode?: "greeting" | "context";
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
  /** Identity that owns this contact or group. Unset records belong to the legacy primary identity. */
  ownerIdentityId?: string;
  /** Contact copies are hidden from the archive and keep a link to their source profile. */
  isContactInstance?: boolean;
  profileSourceId?: string;
  minimaxVoiceId?: string;
  minimaxSpeed?: number;
  voiceFrequency?: "low" | "medium" | "high" | "none";
  /** Canonical appearance data only. It is intentionally never relation-scoped. */
  enableImageGeneration?: boolean;
  imageAppearancePrompt?: string;
  imageNegativePrompt?: string;
  /** A single reference image blob is stored in IndexedDB; this is metadata only. */
  imageReferenceAssetId?: string;
  imageReferenceMimeType?: string;
  imageReferenceUpdatedAt?: number;
}

export interface Message {
  id: string;
  characterId: string;
  /** Direct-chat relationship. Undefined keeps legacy and group records compatible. */
  relationId?: string;
  /** Stable direct-chat thread ID. Group records retain their existing container ID semantics. */
  conversationId?: string;
  sender: "user" | "character";
  senderId?: string;
  content: string;
  timestamp: number;
  isBookmarked?: boolean;
  isOffline?: boolean;
  /** Snapshot-only online context. It informs a story but is never rendered as story text. */
  isImportedContext?: boolean;
  isNarration?: boolean;
  translation?: string;
  audioUrl?: string;
  audioDuration?: number;
  isVoiceMessage?: boolean;
  /** Image data lives in IndexedDB. Legacy uploaded images remain in content as data URLs. */
  imageAssetId?: string;
  imageMimeType?: string;
  imageSource?: "uploaded" | "generated";
  /** Resolves a frozen, public-only forum snapshot from the ForumShare repository. */
  forumShareId?: string;
  /** Resolves a frozen diary snapshot shared explicitly with this direct relation. */
  diaryShareId?: string;
}

export type DiaryAuthorType = "user" | "character";
export type DiarySource = "manual" | "ai-auto" | "ai-manual";

/** A private local diary entry. Character entries are scoped to one relation. */
export interface DiaryEntry {
  id: string;
  ownerIdentityId: string;
  authorType: DiaryAuthorType;
  characterId?: string;
  relationId?: string;
  conversationId?: string;
  authorNameSnapshot: string;
  authorAvatarSnapshot?: string;
  title?: string;
  body: string;
  emotionalState?: string;
  weather?: string;
  location?: string;
  tags: string[];
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  source: DiarySource;
  isFavorite: boolean;
}

/** A frozen, explicit diary disclosure for exactly one direct conversation. */
export interface DiaryShareSnapshot {
  authorType: DiaryAuthorType;
  authorName: string;
  title?: string;
  body: string;
  emotionalState?: string;
  occurredAt: number;
}

export interface DiaryShare {
  id: string;
  diaryEntryId: string;
  ownerIdentityId: string;
  targetRelationId: string;
  conversationId: string;
  messageId: string;
  snapshot: DiaryShareSnapshot;
  createdAt: number;
}

export interface DiaryGenerationTask {
  id: string;
  ownerIdentityId: string;
  relationId: string;
  taskKey: string;
  trigger: "lazy" | "manual";
  status: "running" | "completed" | "failed";
  startedAt: number;
  updatedAt: number;
}

export interface DiaryTranslation {
  id: string;
  ownerIdentityId: string;
  diaryEntryId: string;
  sourceContentHash: string;
  targetLanguage: string;
  translatedTitle?: string;
  translatedBody: string;
  translatedEmotionalState?: string;
  createdAt: number;
  lastAccessedAt: number;
}

export interface DiaryDraft {
  id: string;
  ownerIdentityId: string;
  entryId?: string;
  title?: string;
  body: string;
  emotionalState?: string;
  weather?: string;
  location?: string;
  tags: string[];
  occurredAt: number;
  updatedAt: number;
}

export type ImageApiProtocol = "openai-images" | "gemini-native-image" | "imagen-text";
export type GeminiImageAuthMode = "x-goog-api-key" | "bearer";

export interface ImageApiPreset {
  id: string;
  name: string;
  /** Missing on old records means OpenAI Images compatible. */
  protocol?: ImageApiProtocol;
  apiEndpoint: string;
  apiKey: string;
  selectedModel: string;
  /** Gemini middleboxes differ; user selects the authentication header they support. */
  geminiAuthMode?: GeminiImageAuthMode;
  /** Must be enabled only when the selected Gemini middlebox/model explicitly accepts image input. */
  referenceImageSupported?: boolean;
}

export interface ImageGenerationRecord {
  id: string;
  messageId: string;
  /** Always the canonical Character ID, including a group sender. */
  characterId: string;
  /** Direct chats require this relation boundary. */
  relationId?: string;
  /** Direct and group conversations both retain their own container ID. */
  conversationId: string;
  /** Group records retain group semantics instead of using a direct relation. */
  groupId?: string;
  imageAssetId: string;
  trigger: "manual" | "explicit-user-text";
  createdAt: number;
}

/** A private, generated reflection for one character message. This is never part of chat or memory data. */
export interface InnerVoiceRecord {
  id: string;
  /** Always the archive/canonical Character ID, never a contact instance ID. */
  characterId: string;
  /** Direct-chat boundary. Present for every direct-chat Inner Voice record. */
  relationId?: string;
  /** Group-chat boundary. Present for every group-chat Inner Voice record. */
  groupId?: string;
  messageId: string;
  conversationId: string;
  triggerMessageSummary: string;
  /** A complete, character-specific emotional sentence for the current moment. */
  emotionalState?: string;
  /** @deprecated Legacy one-word state, retained only for rendering existing records. */
  state: string;
  content: string;
  /** Translation is kept alongside the reflection instead of modifying Message. */
  translation?: string;
  createdAt: number;
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
  /** Direct-chat relationship that owns an automatically generated character Moment. */
  relationId?: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: number;
  likes: string[]; // List of names
  comments: MomentComment[];
  /** Legacy comments parsed from older post content that the user has removed. */
  deletedCommentIds?: string[];
  image?: string; // base64 or URL
  /** A placeholder image rendered from text until image generation is available. */
  imageType?: "photo" | "text";
  imageDescription?: string;
  /** The user identity whose social circle this post belongs to. */
  ownerIdentityId?: string;
}

export interface ForumPublicAuthor {
  displayName: string;
  avatar?: string;
  kind: "user" | "anonymous-user" | "ai-character" | "anonymous-ai" | "virtual";
  isAnonymous: boolean;
}

export interface ForumVirtualProfile {
  id: string;
  displayName: string;
  avatarSeed: string;
  publicStyle: string;
}

/**
 * A user-created, forum-only community identity.  It is intentionally not a
 * Character and must never be linked to chat, relationships, or Memory.
 */
export interface ForumCommunityNpc {
  id: string;
  ownerIdentityId: string;
  displayName: string;
  avatar?: string;
  personaSummary: string;
  publicStyle: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Internal forum actor identity. Never copy this into a public forum DTO. */
export type ForumActorRef =
  | { kind: "relationship"; relationId: string; characterId: string }
  | { kind: "virtual"; virtualProfileId: string };

export interface ForumActorState {
  ownerIdentityId: string;
  threadId: string;
  actorKey: string;
  actor: ForumActorRef;
  lastReplyAt?: number;
  recentReplyIds: string[];
  recentTopicFingerprints: string[];
  hourlyReplyTimestamps: number[];
  cooldownUntil?: number;
  updatedAt: number;
}

export interface ForumThread {
  id: string;
  ownerIdentityId: string;
  /** Stable link to the current local Forum profile for non-anonymous user posts. */
  authorUserId?: string;
  publicAuthor: ForumPublicAuthor;
  /** Private author mapping is never copied into a public snapshot or Message. */
  privateAuthorRelationId?: string;
  privateAuthorCharacterId?: string;
  title: string;
  body: string;
  source: "user" | "user-anonymous" | "ai-character" | "ai-character-anonymous" | "ai-virtual" | "virtual";
  occurredAt: number;
  baseLikeCount: number;
  likedByIdentityIds: string[];
  replyCount: number;
  createdAt: number;
  updatedAt: number;
  /** Public thread activity time. Likes and views must not advance this value. */
  lastActivityAt?: number;
  /** Public-only continuity metadata for eligible AI/NPC story threads. */
  storyArc?: import("./domain/forum/forumStoryArc").ForumStoryArc;
}

export interface ForumReply {
  id: string;
  threadId: string;
  ownerIdentityId: string;
  /** Stable link to the current local Forum profile for non-anonymous user replies. */
  authorUserId?: string;
  /** Main post is floor 1. Reply floors are allocated once and never renumbered. */
  floor: number;
  /** Missing on phase-one records means a normal reply. */
  kind?: "reply" | "author-update";
  publicAuthor: ForumPublicAuthor;
  body: string;
  replyToReplyId?: string;
  replyToFloor?: number;
  replyToAuthorName?: string;
  quotedText?: string;
  source: "user" | "user-anonymous" | "ai-character" | "ai-character-anonymous" | "ai-virtual";
  occurredAt: number;
  baseLikeCount: number;
  likedByIdentityIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Deleted replies remain as tombstones so floors and quote targets stay stable. */
  isDeleted?: boolean;
  deletedAt?: number;
  /** Local scheduling metadata. It is intentionally omitted from shares and backups. */
  privateActor?: ForumActorRef;
}

export interface ForumActivityActorSlot {
  slotId: string;
  publicAuthor: ForumPublicAuthor;
  actor: ForumActorRef;
  safePublicStyle: string;
}

export interface ForumPendingActivityEvent {
  id: string;
  ownerIdentityId: string;
  threadId: string;
  batchId: string;
  localId: string;
  actorSlotSnapshot: ForumActivityActorSlot;
  privateActor?: ForumActorRef;
  kind: "reply" | "author-update";
  body: string;
  replyTarget: { type: "thread" } | { type: "floor"; floor: number } | { type: "batch"; localId: string };
  scheduledAt: number;
  status: "pending" | "released" | "skipped";
  resolvedReplyId?: string;
  resolvedFloor?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ForumActivityTask {
  id: string;
  ownerIdentityId: string;
  threadId: string;
  trigger: "automatic" | "manual-thread-refresh" | "initial-replies" | "like-engagement" | "user-interaction";
  status: "running" | "succeeded" | "failed" | "blocked";
  startedAt: number;
  completedAt?: number;
  retryAfter?: number;
  pendingEvents: ForumPendingActivityEvent[];
  createdAt: number;
  updatedAt: number;
}

export interface ForumMutationEvent {
  type: "reply-created" | "thread-updated";
  ownerIdentityId: string;
  threadId: string;
  replyId?: string;
  publicAuthor?: ForumPublicAuthor;
  occurredAt: number;
}

export type ForumRootTab = "home" | "mine";

export interface ForumUserProfile {
  ownerIdentityId: string;
  displayName: string;
  avatar?: string;
  avatarAssetId?: string;
  bio?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ForumVisitHistory {
  id: string;
  ownerIdentityId: string;
  threadId: string;
  lastVisitedAt: number;
  visitCount: number;
  publicSnapshot: ForumThreadPublicSnapshot;
}

export interface ForumReplyPublicSnapshot {
  id: string;
  floor: number;
  body: string;
  publicAuthor: ForumPublicAuthor;
  occurredAt: number;
  isDeleted?: boolean;
}

export interface ForumLikeHistoryRecord {
  id: string;
  ownerIdentityId: string;
  targetType: "thread" | "reply";
  threadId: string;
  replyId?: string;
  likedAt: number;
  publicSnapshot: {
    thread: ForumThreadPublicSnapshot;
    reply?: ForumReplyPublicSnapshot;
  };
}

export interface ForumNotification {
  id: string;
  eventKey: string;
  ownerIdentityId: string;
  type: "thread-reply" | "reply-reply" | "direct-message";
  actorPublicSnapshot: ForumPublicAuthor;
  threadId: string;
  replyId: string;
  targetReplyId?: string;
  preview: string;
  occurredAt: number;
  readAt?: number;
  conversationId?: string;
}

export interface ForumDmConversation {
  id: string;
  ownerIdentityId: string;
  participant: ForumActorRef;
  participantPublicSnapshot: ForumPublicAuthor;
  originThreadId?: string;
  originReplyId?: string;
  lastMessageAt: number;
  unreadCount: number;
  createdAt: number;
  updatedAt: number;
  /** Changes whenever the conversation is recreated, preventing late replies from reviving it. */
  revision?: number;
}

export interface ForumDmMessage {
  id: string;
  conversationId: string;
  ownerIdentityId: string;
  sender: "user" | "participant";
  body: string;
  occurredAt: number;
  createdAt: number;
}

export interface ForumDmTask {
  id: string;
  taskKey: string;
  ownerIdentityId: string;
  conversationId: string;
  status: "running" | "succeeded" | "failed" | "stale";
  startedAt: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
  conversationRevision?: number;
}

export type ForumGenerationTrigger =
  | "refresh"
  | "initial-replies"
  | "lazy"
  | "like-engagement"
  | "manual-thread-refresh";
export type ForumGenerationTaskStatus = "running" | "succeeded" | "failed" | "stale";

export interface ForumGenerationTask {
  id: string;
  taskKey: string;
  ownerIdentityId: string;
  relationId?: string;
  characterId?: string;
  threadId?: string;
  trigger: ForumGenerationTrigger;
  status: ForumGenerationTaskStatus;
  startedAt: number;
  completedAt?: number;
  retryAfter?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ForumThreadPublicSnapshot {
  threadId: string;
  title: string;
  body: string;
  publicAuthor: ForumPublicAuthor;
  occurredAt: number;
  replyCount: number;
  replies: Array<{
    id: string;
    floor: number;
    kind?: "reply" | "author-update";
    body: string;
    publicAuthor: ForumPublicAuthor;
    replyToFloor?: number;
    replyToAuthorName?: string;
    quotedText?: string;
    occurredAt: number;
  }>;
}

export interface ForumShare {
  id: string;
  ownerIdentityId: string;
  threadId: string;
  targetRelationId: string;
  conversationId: string;
  sourceMessageId: string;
  publicSnapshot: ForumThreadPublicSnapshot;
  createdAt: number;
}

/**
 * A disposable, public-text-only translation cache entry. Forum source text is
 * never replaced by this value.
 */
export interface ForumTranslation {
  id: string;
  ownerIdentityId: string;
  contentType: "thread" | "reply";
  contentId: string;
  sourceContentHash: string;
  targetLanguage: string;
  translatedTitle?: string;
  translatedBody: string;
  createdAt: number;
  lastAccessedAt: number;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  /** Runtime ObjectURL for a local file, or the persisted URL for a network track. */
  url: string;
  isLocal: boolean;
  duration?: string;
  /** Local audio blobs live in MusicAppDB. Old tracks use id as the asset key. */
  audioAssetId?: string;
  audioMimeType?: string;
  /** Local cover blobs live in MusicAppDB; remote covers may use coverUrl. */
  coverAssetId?: string;
  coverMimeType?: string;
  coverUrl?: string;
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

export type WorldBookScope =
  | { kind: "global" }
  | { kind: "character"; characterId: string }
  | { kind: "identity"; userIdentityId: string }
  | { kind: "relationship"; relationId: string; characterId: string; userIdentityId: string };

export type WorldBookVisibility = "public" | "private";
export type WorldBookPurpose = "world_canon" | "persona_rule" | "relationship_context" | "generation_rule";

export interface WorldBookEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  timestamp: number;
  characterId?: string; // "global" or a specific character's ID
  /** New explicit scope; missing scope keeps legacy character/global reads compatible. */
  scope?: WorldBookScope;
  /** Public entries must opt in explicitly; missing visibility is legacy/private. */
  visibility?: WorldBookVisibility;
  purpose?: WorldBookPurpose;
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
  /** Distinguishes an explicit user/preset wallpaper from legacy placeholder defaults. */
  wallpaperSource?: "user" | "preset" | "legacy-default";
  customIcons: Record<string, string>; // appKey -> image base64/URL or empty
  bubbleCss: string; // Custom bubble CSS
  globalCss: string; // Custom global CSS
  /** CSS scoped to active chat conversation screens only. */
  chatGlobalCSS?: string;
  /** Globally configured chat function icon resources. */
  chatIcons?: ChatIconOverrides;
  globalChatStylePreset?: "default" | "floating-cute" | "liquid-glass";
  activePreset: string; // Preset name
  momentsCover?: string; // Moments cover image URL or base64
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
  apiPresets?: ApiPreset[];
  activeApiPresetId?: string;
  showHomeButton?: boolean;
  /** Hide the simulated phone status bar when enabled. */
  hideStatusBar?: boolean;
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
  /** Color used for desktop application names. */
  desktopAppTextColor?: string;
  /** Built-in icon treatment; light keeps default glyphs legible on dark wallpapers. */
  desktopIconMode?: "light" | "dark";
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

  // OpenAI Images compatible settings. Disabled by default so no image request
  // can occur until both this and the canonical Character setting are enabled.
  enableImageGeneration?: boolean;
  imageApiPresets?: ImageApiPreset[];
  activeImageApiPresetId?: string;
}

export type UserSettingsUpdate = UserSettings | ((previous: UserSettings) => UserSettings);

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
  widgetType?: "album" | "calendar-album" | "music" | "dual-music" | "anniversary" | "todo";
  size: "1x1" | "2x2" | "1x4" | "2x3" | "2x4";
  /** Legacy mirror kept during migration. position.page is authoritative. */
  page: number;
  position?: HomeScreenPosition;
}

export interface HomeScreenPosition {
  page: number;
  row: number;
  column: number;
}

export interface DualMusicWidgetConfig {
  widgetId: string;
  ownerIdentityId: string;
  relationId?: string;
  /** Canonical profile reference only; relationId remains the ownership boundary. */
  characterId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface IdentityMusicState {
  ownerIdentityId: string;
  currentTrackId?: string;
  recentTrackIds: string[];
  updatedAt: number;
}

export interface RelationshipMusicState {
  relationId: string;
  conversationId: string;
  /** Canonical profile reference only. */
  characterId: string;
  currentTrackId?: string;
  recentTrackIds: string[];
  selectedAt?: number;
  nextRefreshAt?: number;
  selectionReason?: string;
  selectionSource?: "ai" | "local";
  updatedAt: number;
}

export interface MemoryItem {
  id: string;
  characterId: string;
  /** The direct relationship that owns this remembered interaction. */
  relationId?: string;
  /** The Moment that created this automatic memory, when applicable. */
  sourceMomentId?: string;
  /** Authoritative Truth Layer records represented by this compatibility view. */
  sourceKnowledgeClaimIds?: string[];
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
  relationId?: string;
  conversationId?: string;
  status: "idle" | "summarizing" | "completed" | "error";
  rounds: number;
  extractedCount: number;
  error?: string;
}

export interface OfflineStory {
  id: string;
  characterId: string;
  /** Direct relationship that owns this story. Group stories intentionally leave this unset. */
  relationId?: string;
  conversationId?: string;
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
  /** Continue-mode stories inherit this from the source chat; other modes choose it at creation. */
  enableTimeAwareness?: boolean;
  /** Frozen at the moment an online chat is explicitly imported into this story. */
  importedContext?: {
    messages: Message[];
    memories: string[];
    worldBook: string[];
    importedAt: number;
  };
  archivedAt?: number;
  archivedMemoryIds?: string[];
  /** Number of story messages already condensed into online memory. */
  lastSyncedMessageCount?: number;
  memorySyncStatus?: "pending" | "synced" | "failed";
  lastMemorySyncAt?: number;
  syncedSourceMessageIds?: string[];
  /** Durable one-shot bridge from a completed offline story back to this relationship's online chat. */
  onlineHandoff?: {
    status: "pending" | "acknowledged";
    createdAt: number;
    startedAt: number;
    endedAt: number;
    sourceMessageIds: string[];
    /** Successful online replies that received this hidden bridge. */
    deliveredReplyCount?: number;
    acknowledgedAt?: number;
  };
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



