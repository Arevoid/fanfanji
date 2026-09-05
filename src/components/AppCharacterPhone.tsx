import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  BookHeart,
  Bookmark,
  Camera,
  Check,
  CheckSquare,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Clock3,
  Compass,
  Delete,
  Disc3,
  Eye,
  Globe2,
  Heart,
  History,
  Home,
  Image,
  ListMusic,
  MapPin,
  Mic,
  MessageCircle,
  MessageSquare,
  Music2,
  MoreHorizontal,
  Newspaper,
  Pause,
  Phone,
  Plus,
  Play,
  RefreshCw,
  Save,
  Search,
  ScanLine,
  Settings,
  SkipBack,
  SkipForward,
  StickyNote,
  Trash2,
  User,
  Users,
  EyeOff,
  X,
} from "lucide-react";
import type { Character, Message, Moment, MomentVisibility, MusicTrack, UserIdentity, UserSettings, WorldBookEntry } from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import {
  CHARACTER_PHONE_DEFAULT_WALLPAPER,
  createCharacterPhone,
  getCharacterPhone,
  normalizeCharacterPhonePasscode,
  saveCharacterPhone,
  clearCharacterPhoneData,
} from "../core/storage/repositories/characterPhoneRepository";
import type {
  CharacterPhoneAppId,
  CharacterPhoneActionRecord,
  CharacterPhoneContact,
  CharacterPhoneGalleryItem,
  CharacterPhoneImageSaveInput,
  CharacterPhoneNote,
  CharacterPhonePost,
  CharacterPhoneRecord,
  CharacterPhoneScheduleItem,
  CharacterPhoneTodo,
} from "../domain/characterPhone/types";
import type { Appointment, ScheduleEntry } from "../domain/schedule/scheduleTypes";
import AppSchedule from "./AppSchedule";
import { createCharacterTextMessage } from "../features/chat/services/messageFactory";
import {
  advanceCharacterPhoneWithResult,
  type CharacterPhoneGenerationNoChangeReason,
} from "../features/characterPhone/characterPhoneProgression";
import { ensureCharacterPhoneContent } from "../features/characterPhone/characterPhoneContent";
import { selectCharacterPhoneWorldBookEntries } from "../features/characterPhone/characterPhoneLifeContext";
import { buildCharacterPhoneAwarenessMessage } from "../features/characterPhone/characterPhoneReaction";
import { discoverCharacterPhoneActions } from "../features/characterPhone/characterPhoneDetection";
import {
  appendCharacterPhoneThreadMessage,
  listCharacterPhoneThreadMessages,
} from "../features/characterPhone/characterPhoneThreadService";
import {
  formatCharacterPhoneDate,
  formatCharacterPhoneTime,
  inferCharacterPhoneLocation,
} from "../features/characterPhone/characterPhoneLocation";
import { TimeWidget } from "./HomeScreenWidgets";
import { resolveDesktopBackground } from "../features/theme/desktopBackground";
import type { ResolvedTheme } from "../features/theme/theme";
import { StoredCharacterPhoneImage } from "../features/characterPhone/components/StoredCharacterPhoneImage";
import { imageAssetDb } from "../utils/imageAssetDb";
import { normalizeCharacterPhoneBrowserHistory } from "../features/characterPhone/characterPhoneContent";
import { buildCharacterPhoneBrowserDetail } from "../features/characterPhone/characterPhoneBrowserDetails";
import { resolveCharacterPhoneContactAvatar } from "../features/characterPhone/characterPhoneContactVisuals";
import { CharacterPhoneCallApp, type CharacterPhoneDialerTab } from "../features/characterPhone/components/CharacterPhoneCallApp";
import { CharacterPhoneCameraApp } from "../features/characterPhone/components/CharacterPhoneCameraApp";
import { resolveCharacterPhoneHiddenGalleryPasscode } from "../features/characterPhone/characterPhoneGallerySecurity";
import {
  createCharacterPhoneTextImageDataUrl,
  getCharacterPhoneGalleryImageDataUrl,
} from "../features/characterPhone/characterPhoneTextImage";
import type { RelationshipNetworkMap, RelationshipNetworkNpc } from "../domain/relationshipNetwork/relationshipNetworkTypes";
import { stickerDb } from "../utils/stickerDb";

interface AppCharacterPhoneProps {
  userIdentityId: string;
  activeIdentity?: UserIdentity;
  characters: Character[];
  relationships: CharacterRelationship[];
  messages?: Message[];
  moments?: Moment[];
  worldBookEntries?: WorldBookEntry[];
  relationshipNetworkNpcs?: RelationshipNetworkNpc[];
  relationshipNetworkMaps?: RelationshipNetworkMap[];
  settings?: UserSettings;
  musicTracks?: MusicTrack[];
  resolvedTheme?: ResolvedTheme;
  onSendMessage?: (message: Message) => void;
  onSaveImageToCharacterPhone?: (input: CharacterPhoneImageSaveInput) => void | Promise<void>;
  /** Mirrors role-phone posts into the owner's main Moments feed. */
  onSyncCharacterPhonePost?: (input: { post: CharacterPhonePost; character: Character; ownerIdentityId: string }) => void;
  onDeleteCharacterPhonePost?: (input: { post: CharacterPhonePost; character: Character; ownerIdentityId: string }) => void;
  onOpenChat?: (characterId: string, relationId: string | null) => void;
  onClose: () => void;
}
type GalleryMode = "main" | "hidden" | "deleted";
type CharacterPhoneSystemAppId = "phone" | "camera";
type CharacterPhoneIconAppId = CharacterPhoneAppId | CharacterPhoneSystemAppId;
type CharacterPhoneView = "home" | CharacterPhoneAppId | CharacterPhoneSystemAppId;
type CharacterPhoneSocialTab = "chats" | "contacts" | "moments" | "me";

const APP_META: Record<
  CharacterPhoneAppId | CharacterPhoneSystemAppId,
  { label: string; icon: React.ReactNode; color: string }
> = {
  chat: {
    label: "聊天",
    icon: <MessageCircle className="h-6 w-6" />,
    color: "bg-blue-500",
  },
  browser: {
    label: "浏览器",
    icon: <Globe2 className="h-6 w-6" />,
    color: "bg-sky-500",
  },
  schedule: {
    label: "日程",
    icon: <CalendarDays className="h-6 w-6" />,
    color: "bg-rose-500",
  },
  gallery: {
    label: "相册",
    icon: <Image className="h-6 w-6" />,
    color: "bg-violet-500",
  },
  diary: {
    label: "日记",
    icon: <BookHeart className="h-6 w-6" />,
    color: "bg-amber-500",
  },
  moments: {
    label: "朋友圈",
    icon: <Newspaper className="h-6 w-6" />,
    color: "bg-emerald-500",
  },
  notes: {
    label: "备忘录",
    icon: <StickyNote className="h-6 w-6" />,
    color: "bg-yellow-400",
  },
  music: {
    label: "音乐",
    icon: <Music2 className="h-6 w-6" />,
    color: "bg-rose-500",
  },
  settings: {
    label: "设置",
    icon: <Settings className="h-6 w-6" />,
    color: "bg-slate-500",
  },
  phone: {
    label: "电话",
    icon: <Phone className="h-6 w-6" />,
    color: "bg-emerald-500",
  },
  camera: {
    label: "相机",
    icon: <Camera className="h-6 w-6" />,
    color: "bg-neutral-700",
  },
};

const PHONE_DESKTOP_APPS: CharacterPhoneAppId[] = [
  "chat",
  "browser",
  "schedule",
  "gallery",
  "diary",
  "notes",
  "music",
  "settings",
];
const PHONE_DOCK_APPS: Array<CharacterPhoneAppId | CharacterPhoneSystemAppId> = ["phone", "chat", "music", "camera"];
const PHONE_ICON_APPS: CharacterPhoneIconAppId[] = [
  ...PHONE_DESKTOP_APPS,
  "moments",
  "phone",
  "camera",
];
const CHARACTER_PHONE_WALLPAPER_PRESETS = [
  { label: "雾白", value: "linear-gradient(145deg, #eeeeec 0%, #fafaf9 48%, #e4e4e2 100%)" },
  { label: "晨雾", value: "linear-gradient(145deg, #d8e5df 0%, #f4eadc 100%)" },
  { label: "蓝灰", value: "linear-gradient(145deg, #dbe8f2 0%, #f4f0ea 100%)" },
  { label: "薰衣草", value: "linear-gradient(145deg, #e5dff0 0%, #f8ebe9 100%)" },
  { label: "夜色", value: "linear-gradient(145deg, #252b35 0%, #667182 100%)" },
] as const;
const CHARACTER_PHONE_UNLOCK_PAD = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["0", "＋"],
] as const;
const PHONE_APP_TILE_CLASSES: Record<CharacterPhoneAppId, string> = {
  chat: "bg-white/95 text-emerald-600",
  browser: "bg-white/95 text-slate-500",
  schedule: "bg-white/95 text-slate-700",
  gallery: "bg-white/95 text-slate-500",
  diary: "bg-white/95 text-slate-600",
  notes: "bg-white/95 text-slate-500",
  music: "bg-white/95 text-slate-600",
  settings: "bg-white/95 text-slate-600",
  moments: "bg-white/95 text-slate-600",
};
const PHONE_SYSTEM_APP_TILE_CLASSES: Record<CharacterPhoneSystemAppId, string> = {
  phone: "bg-white/95 text-slate-600",
  camera: "bg-white/95 text-slate-600",
};
type CharacterPhoneMusicView = "home" | "playlist" | "player";
const PHONE_MUSIC_COVER_GRADIENTS = [
  "from-[#d8e5df] via-[#f4eadc] to-[#ecd1d3]",
  "from-[#dcecf1] via-[#f7f3e7] to-[#e4d9ee]",
  "from-[#d6e1f1] via-[#e9edf4] to-[#c9d8d4]",
  "from-[#f6e7c9] via-[#f7f3e7] to-[#e1e9d4]",
];
type CharacterPhoneDisplayTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  cover: string;
  coverUrl?: string;
};

function CharacterPhoneMusicArtwork({
  cover,
  coverUrl,
  className,
}: {
  cover: string;
  coverUrl?: string;
  className: string;
}) {
  return (
    <div className={`relative isolate overflow-hidden ${coverUrl ? "bg-neutral-100" : `bg-gradient-to-br ${cover}`} ${className}`} aria-hidden="true">
      {coverUrl ? (
        <img src={coverUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <>
          <div className="absolute -right-[16%] -top-[10%] h-[72%] w-[72%] rounded-full bg-white/35 blur-2xl" />
          <div className="absolute inset-[15%] rounded-full bg-[radial-gradient(circle_at_32%_26%,#66707d_0%,#303946_30%,#10141c_69%,#050608_100%)] shadow-[0_14px_24px_rgba(15,23,42,0.24)]">
            <div className="absolute inset-[17%] rounded-full border border-white/10" />
            <div className="absolute inset-[30%] rounded-full border border-white/10" />
            <div className="absolute inset-[43%] flex items-center justify-center rounded-full bg-[#f6f2e9] text-[#26303b] shadow-inner">
              <Music2 className="h-1/2 w-1/2" strokeWidth={1.7} />
            </div>
          </div>
          <div className="absolute bottom-[13%] left-[13%] h-1.5 w-1.5 rounded-full bg-white/80" />
          <div className="absolute bottom-[17%] left-[18%] h-1 w-1 rounded-full bg-white/65" />
        </>
      )}
    </div>
  );
}

function formatCharacterPhoneMusicElapsed(duration: string, progress: number): string {
  const [minutes, seconds] = duration.split(":").map(Number);
  const totalSeconds = Math.max(0, minutes * 60 + seconds);
  const elapsedSeconds = Math.min(totalSeconds, Math.round(totalSeconds * progress));
  return `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
}
const LEGACY_CHARACTER_PHONE_WALLPAPERS = new Set([
  "linear-gradient(145deg, #d8e5df 0%, #f4eadc 100%)",
  "linear-gradient(145deg, #bcd9f2 0%, #edf2f8 42%, #f3c5cf 78%, #f8ddd7 100%)",
]);

// Keep the interactive phone recoverable if a provider accepts a request but
// never completes its response body. The low-level API helper has its own
// deadline; this UI boundary protects the generate button from any remaining
// adapter or browser-fetch edge case.
const CHARACTER_PHONE_GENERATION_TIMEOUT_MS = 120_000;
function characterPhoneGenerationNoChangeNotice(
  reason?: CharacterPhoneGenerationNoChangeReason,
): string {
  switch (reason) {
    case "missing_api_config":
      return "请先在设置中配置文本 API 和模型，再生成角色手机内容";
    case "provider_error":
      return "模型请求失败，请检查 API 地址、Key 和模型后重试";
    case "invalid_response":
      return "模型返回格式无法识别，请重试或更换模型";
    case "missing_evidence":
      return "暂时没有可引用的聊天或世界书证据，请先补充最近对话后重试";
    case "context_synced":
      return "已同步现有聊天和联系人，暂未生成新的生活痕迹";
    case "duplicate_content":
      return "已有相同记录，本次没有新增生活痕迹";
    default:
      return "本次没有生成新的生活痕迹，请补充最近聊天后重试";
  }
}
function openCharacterPhone(
  ownerIdentityId: string,
  character: Character,
  context?: {
    activeIdentity?: UserIdentity;
    characters: Character[];
    relationships: CharacterRelationship[];
    messages: Message[];
    moments: Moment[];
    worldBookEntries: WorldBookEntry[];
    relationshipNetworkNpcs: RelationshipNetworkNpc[];
    relationshipNetworkMaps: RelationshipNetworkMap[];
    musicTracks: MusicTrack[];
  },
): CharacterPhoneRecord {
  const existing = getCharacterPhone(ownerIdentityId, character.id);
  const basePhone = existing || createCharacterPhone(ownerIdentityId, character);
  const normalizedPasscode = normalizeCharacterPhonePasscode(basePhone.passcode);
  const isLocked = Boolean(basePhone.lockedUntil && basePhone.lockedUntil > Date.now());
  const isExpiredLock = Boolean(basePhone.lockedUntil && basePhone.lockedUntil <= Date.now());
  const reopened = basePhone.passcode === normalizedPasscode && !isExpiredLock
    ? basePhone
    : {
        ...basePhone,
        passcode: normalizedPasscode,
        failedAttempts: isLocked ? basePhone.failedAttempts : 0,
        lockedUntil: isLocked ? basePhone.lockedUntil : undefined,
        updatedAt: Date.now(),
      };
  const contextualPhone = context
    ? ensureCharacterPhoneContent({
        phone: reopened,
        character,
        characters: context.characters,
        activeIdentity: context.activeIdentity,
        relationships: context.relationships,
        messages: context.messages,
        moments: context.moments,
        worldBookEntries: context.worldBookEntries,
        relationshipNetworkNpcs: context.relationshipNetworkNpcs,
        relationshipNetworkMaps: context.relationshipNetworkMaps,
        musicTracks: context.musicTracks,
      })
    : reopened;
  if (contextualPhone !== existing || reopened !== basePhone) saveCharacterPhone(contextualPhone);
  return contextualPhone;
}
function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CharacterPhoneStickerPayload {
  name: string;
  stickerId: string;
  fallbackUrl: string;
}

function parseCharacterPhoneStickerContent(content: string): CharacterPhoneStickerPayload | null {
  if (!content.startsWith("[表情]|")) return null;
  const parts = content.split("|");
  const name = parts[1]?.trim() || "未命名表情";
  const rawUrl = parts[2]?.trim() || "";
  const stickerId = rawUrl.startsWith("sticker://") ? rawUrl.slice("sticker://".length) : "";
  const fallbackUrl = rawUrl && !rawUrl.startsWith("sticker://") ? rawUrl : "";
  return { name, stickerId, fallbackUrl };
}

function getCharacterPhoneMessagePreview(content: string): string {
  const sticker = parseCharacterPhoneStickerContent(content);
  return sticker ? `[表情] ${sticker.name}` : content;
}

/** Render the same sticker protocol used by the main chat instead of exposing
 * the internal sticker:// reference as message text on the role phone. */
function CharacterPhoneStickerMessage({ content }: { content: string }) {
  const payload = parseCharacterPhoneStickerContent(content);
  const [displayUrl, setDisplayUrl] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!payload) {
      setDisplayUrl("");
      setImageFailed(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setDisplayUrl(payload.fallbackUrl);
    setImageFailed(false);

    const resolveSticker = async () => {
      if (!payload.stickerId) return;
      try {
        const blob = await stickerDb.getStickerImage(payload.stickerId);
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
        } else {
          const groups = await stickerDb.getGroups();
          const sticker = groups
            .flatMap((group) => group.stickers)
            .find((candidate) => candidate.id === payload.stickerId || candidate.name === payload.name);
          if (sticker?.url) objectUrl = sticker.url;
        }
      } catch {
        // A missing local asset is rendered as a readable name-only fallback.
      }
      if (cancelled) {
        if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
        return;
      }
      if (objectUrl) setDisplayUrl(objectUrl);
    };
    void resolveSticker();

    return () => {
      cancelled = true;
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [payload?.fallbackUrl, payload?.name, payload?.stickerId]);

  if (!payload) return null;
  if (displayUrl && !imageFailed) {
    return (
      <div className="character-phone-sticker-message max-w-[130px] overflow-hidden rounded-xl bg-white/60">
        <img
          src={displayUrl}
          alt={payload.name}
          className="block h-auto max-h-[130px] w-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
        <span className="sr-only">[表情：{payload.name}]</span>
      </div>
    );
  }
  return (
    <div className="character-phone-sticker-fallback rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <span className="mr-1.5 text-[10px] text-slate-400">表情</span>
      {payload.name}
    </div>
  );
}

function CharacterPhoneEvidenceEmpty({
  title,
  detail,
  compact = false,
}: {
  title: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "my-2 px-3 py-3" : "mx-1 my-4 px-4 py-5"} rounded-2xl border border-dashed border-neutral-200 bg-white/60 text-center`}>
      <p className="text-xs font-semibold text-neutral-500">{title}</p>
      <p className="mt-1 text-[10px] leading-5 text-neutral-400">{detail}</p>
    </div>
  );
}

function withPhoneAction(
  phone: CharacterPhoneRecord,
  action: Omit<CharacterPhoneActionRecord, "id" | "timestamp" | "actor">,
  now = Date.now(),
): CharacterPhoneRecord {
  return {
    ...phone,
    actionLog: [
      ...(phone.actionLog ?? []),
      { ...action, id: `phone-action-${now}-${phone.actionLog?.length ?? 0}`, timestamp: now, actor: "user" as const, phoneOpenCountAtAction: phone.phoneOpenCount ?? 0 },
    ].slice(-300),
    updatedAt: now,
  };
}

type CharacterPhoneMutationPolicy = Pick<CharacterPhoneActionRecord, "detectability" | "discoveryAfterMs" | "discoveryAfterOpens">;

function getCharacterPhoneMutationPolicy(
  app: CharacterPhoneActionRecord["app"],
  character: Character,
): CharacterPhoneMutationPolicy {
  const defaults: Record<string, CharacterPhoneMutationPolicy> = {
    browser: { detectability: "possible", discoveryAfterMs: 6 * 60 * 60 * 1000, discoveryAfterOpens: 3 },
    schedule: { detectability: "possible", discoveryAfterMs: 3 * 60 * 60 * 1000, discoveryAfterOpens: 2 },
    gallery: { detectability: "possible", discoveryAfterMs: 24 * 60 * 60 * 1000, discoveryAfterOpens: 3 },
    diary: { detectability: "possible", discoveryAfterMs: 48 * 60 * 60 * 1000, discoveryAfterOpens: 3 },
    notes: { detectability: "possible", discoveryAfterMs: 24 * 60 * 60 * 1000, discoveryAfterOpens: 2 },
    moments: { detectability: "possible", discoveryAfterMs: 8 * 60 * 60 * 1000, discoveryAfterOpens: 2 },
    music: { detectability: "possible", discoveryAfterMs: 72 * 60 * 60 * 1000, discoveryAfterOpens: 4 },
    settings: { detectability: "likely", discoveryAfterMs: 30 * 60 * 1000, discoveryAfterOpens: 1 },
    camera: { detectability: "possible", discoveryAfterMs: 24 * 60 * 60 * 1000, discoveryAfterOpens: 3 },
    phone: { detectability: "possible", discoveryAfterMs: 6 * 60 * 60 * 1000, discoveryAfterOpens: 3 },
  };
  const base = defaults[app] || { detectability: "none" as const, discoveryAfterMs: Number.POSITIVE_INFINITY, discoveryAfterOpens: 99 };
  const personality = `${character.personality || ""} ${character.backstory || ""}`;
  const attentive = /(敏感|细心|警觉|多疑|观察|谨慎|控制欲|在意细节|记性好)/u.test(personality);
  const distracted = /(粗心|迟钝|健忘|随和|忙碌|忙|不在意|大大咧咧)/u.test(personality);
  if (attentive) {
    return {
      ...base,
      discoveryAfterMs: Math.round((base.discoveryAfterMs || 0) * 0.45),
      discoveryAfterOpens: Math.max(1, (base.discoveryAfterOpens || 1) - 1),
    };
  }
  if (distracted) {
    return {
      ...base,
      discoveryAfterMs: Number.isFinite(base.discoveryAfterMs) ? base.discoveryAfterMs * 2.5 : base.discoveryAfterMs,
      discoveryAfterOpens: (base.discoveryAfterOpens || 1) + 2,
    };
  }
  return base;
}

function characterPhoneGalleryDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

function characterPhoneGalleryDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatCharacterPhoneGalleryGroupLabel(
  timestamp: number,
  now = Date.now(),
): string {
  const dayDifference = Math.floor(
    (characterPhoneGalleryDayStart(now) - characterPhoneGalleryDayStart(timestamp)) /
      (24 * 60 * 60 * 1000),
  );
  if (dayDifference === 0) return "今天";
  if (dayDifference === 1) return "昨天";
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatCharacterPhoneDiaryGroupLabel(
  timestamp: number,
  now = Date.now(),
): { label: string; date: string } {
  const dayDifference = Math.floor(
    (characterPhoneGalleryDayStart(now) - characterPhoneGalleryDayStart(timestamp)) /
      (24 * 60 * 60 * 1000),
  );
  const date = new Date(timestamp);
  const dateLabel = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
  return {
    label: dayDifference === 0
      ? "Today"
      : dayDifference === 1
        ? "Yesterday"
        : date.toLocaleDateString("en-US", { weekday: "long" }),
    date: dateLabel,
  };
}

export default function AppCharacterPhone({
  userIdentityId,
  activeIdentity,
  characters,
  relationships,
  messages = [],
  moments = [],
  worldBookEntries = [],
  relationshipNetworkNpcs = [],
  relationshipNetworkMaps = [],
  settings,
  musicTracks = [],
  resolvedTheme = "light",
  onSendMessage,
  onSaveImageToCharacterPhone,
  onSyncCharacterPhonePost,
  onDeleteCharacterPhonePost,
  onOpenChat,
  onClose,
}: AppCharacterPhoneProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(
    characters[0]?.id || "",
  );
  const selectedCharacter = characters.find(
    (character) => character.id === selectedCharacterId,
  );
  const phoneContext = {
    activeIdentity,
    characters,
    relationships,
    messages,
    moments,
    worldBookEntries,
    relationshipNetworkNpcs,
    relationshipNetworkMaps,
    musicTracks,
  };
  const [phone, setPhone] = useState<CharacterPhoneRecord | null>(() =>
    selectedCharacter
      ? openCharacterPhone(userIdentityId, selectedCharacter, phoneContext)
      : null,
  );
  const previousIdentityIdRef = useRef(userIdentityId);
  useEffect(() => {
    if (!selectedCharacterId && characters[0]) {
      setSelectedCharacterId(characters[0].id);
      setPhone(openCharacterPhone(userIdentityId, characters[0], phoneContext));
    }
  }, [characters, selectedCharacterId, userIdentityId]);
  useEffect(() => {
    const handleGalleryUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerIdentityId?: string; characterId?: string }>).detail;
      if (detail?.ownerIdentityId !== userIdentityId || detail.characterId !== selectedCharacterId) return;
      const latest = getCharacterPhone(userIdentityId, selectedCharacterId);
      if (latest) setPhone(latest);
    };
    window.addEventListener("character-phone-gallery-updated", handleGalleryUpdated);
    return () => window.removeEventListener("character-phone-gallery-updated", handleGalleryUpdated);
  }, [selectedCharacterId, userIdentityId]);
  const [unlocked, setUnlocked] = useState(false);
  const [activeApp, setActiveApp] = useState<CharacterPhoneView>("home");
  const [desktopPage, setDesktopPage] = useState<0 | 1>(0);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [galleryMode, setGalleryMode] = useState<GalleryMode>("main");
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(
    null,
  );
  const [hiddenGalleryUnlocked, setHiddenGalleryUnlocked] = useState(false);
  const [hiddenGalleryInput, setHiddenGalleryInput] = useState("");
  const [hiddenGalleryNotice, setHiddenGalleryNotice] = useState("");
  const [browserAddress, setBrowserAddress] = useState("");
  const [selectedBrowserEntryId, setSelectedBrowserEntryId] = useState<string | null>(null);
  const [phoneDialerTab, setPhoneDialerTab] = useState<CharacterPhoneDialerTab>("all");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [scheduleTodaySignal, setScheduleTodaySignal] = useState(0);
  const [phoneChatMode, setPhoneChatMode] = useState<"inbox" | "conversation">("inbox");
  const [phoneSocialTab, setPhoneSocialTab] = useState<CharacterPhoneSocialTab>("chats");
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [contactRemarkEditing, setContactRemarkEditing] = useState(false);
  const [contactRemarkDraft, setContactRemarkDraft] = useState("");
  const [musicView, setMusicView] = useState<CharacterPhoneMusicView>("home");
  const [musicTrackIndex, setMusicTrackIndex] = useState(0);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);
  const [musicProgress, setMusicProgress] = useState(0.42);
  const [input, setInput] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [draft, setDraft] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [postVisibility, setPostVisibility] = useState<MomentVisibility>("public");
  const [postVisibilityTargetIds, setPostVisibilityTargetIds] = useState<string[]>([]);
  const [phoneMomentComposerOpen, setPhoneMomentComposerOpen] = useState(false);
  const [selectedDiaryId, setSelectedDiaryId] = useState<string | null>(null);
  const [diaryEditing, setDiaryEditing] = useState(false);
  const [diaryDraft, setDiaryDraft] = useState({ title: "", body: "" });
  const [showHiddenDiary, setShowHiddenDiary] = useState(false);
  const [showAllDiary, setShowAllDiary] = useState(false);
  const [hidingTapCount, setHidingTapCount] = useState(0);
  const hidingTapCountRef = useRef(0);
  const hidingTapTimeoutRef = useRef<number | null>(null);
  const diaryScrollTopRef = useRef(0);
  const gallerySwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const desktopSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isDiaryFabVisible, setIsDiaryFabVisible] = useState(true);
  const [characterNotesTab, setCharacterNotesTab] = useState<"notes" | "todo">("notes");
  const [characterNoteQuery, setCharacterNoteQuery] = useState("");
  const [characterNoteEditing, setCharacterNoteEditing] = useState(false);
  const [selectedCharacterNoteId, setSelectedCharacterNoteId] = useState<string | null>(null);
  const [characterNoteDraft, setCharacterNoteDraft] = useState({ title: "", content: "" });
  const [characterTodoText, setCharacterTodoText] = useState("");
  const [isAddingCharacterTodo, setIsAddingCharacterTodo] = useState(false);
  const [postCommentDrafts, setPostCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [phoneNotice, setPhoneNotice] = useState("");
  const [phoneDataNotice, setPhoneDataNotice] = useState("");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const generationRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const phoneScopeRef = useRef({ ownerIdentityId: userIdentityId, characterId: selectedCharacterId });
  const syncedPhonePostsRef = useRef<Record<string, string>>({});
  phoneScopeRef.current = { ownerIdentityId: userIdentityId, characterId: selectedCharacterId };
  useEffect(() => {
    // React StrictMode mounts effects twice in development. Reset this flag
    // in the setup phase so the first probe cleanup cannot permanently mark a
    // live phone screen as unmounted.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRequestRef.current += 1;
    };
  }, []);
  useEffect(() => () => {
    if (hidingTapTimeoutRef.current !== null) {
      window.clearTimeout(hidingTapTimeoutRef.current);
    }
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (previousIdentityIdRef.current === userIdentityId) return;
    generationRequestRef.current += 1;
    setIsAdvancing(false);
    previousIdentityIdRef.current = userIdentityId;
    const nextCharacter = characters[0];
    setSelectedCharacterId(nextCharacter?.id || "");
    setPhone(nextCharacter ? openCharacterPhone(userIdentityId, nextCharacter, phoneContext) : null);
    setUnlocked(false);
    setHiddenGalleryUnlocked(false);
    setHiddenGalleryInput("");
    setHiddenGalleryNotice("");
    setActiveApp("home");
    setDesktopPage(0);
    setPhoneDialerTab("all");
    setPhoneNumber("");
    setScheduleTodaySignal(0);
    setPhoneChatMode("inbox");
    setPhoneSocialTab("chats");
    setSelectedBrowserEntryId(null);
    setMusicView("home");
    setMusicIsPlaying(false);
    setInput("");
    setShowHiddenDiary(false);
    setShowAllDiary(false);
    setHidingTapCount(0);
    setIsDiaryFabVisible(true);
    setCharacterNotesTab("notes");
    setCharacterNoteQuery("");
    setCharacterNoteEditing(false);
    setSelectedCharacterNoteId(null);
    setIsAddingCharacterTodo(false);
    setCharacterTodoText("");
    setNotice("");
    setPhoneNotice("");
    setPhoneDataNotice("");
  }, [characters, userIdentityId]);
  const currentPhone = useMemo(
    () =>
      selectedCharacter
        ? phone || createCharacterPhone(userIdentityId, selectedCharacter)
        : null,
    [phone, selectedCharacter, userIdentityId],
  );
  const discoverAndForwardPhoneActions = (
    candidatePhone: CharacterPhoneRecord,
    baselinePhone: CharacterPhoneRecord,
    now: number,
  ): CharacterPhoneRecord => {
    if (!selectedCharacter) return candidatePhone;
    const discoveredPhone = discoverCharacterPhoneActions(candidatePhone, selectedCharacter, now);
    const awarenessMessages = discoveredPhone.messages.filter(
      (message) => (message.id.startsWith("phone-awareness-") || message.id.startsWith("phone-discovery-"))
        && !baselinePhone.messages.some((existing) => existing.id === message.id),
    );
    const relation = relationships.find(
      (item) => item.userIdentityId === userIdentityId && item.characterId === selectedCharacter.id,
    );
    if (relation && onSendMessage) {
      awarenessMessages
        .filter((message) => !messages.some((item) => item.id === `phone-proactive-${message.id}`))
        .forEach((message) => onSendMessage(createCharacterTextMessage({
          id: `phone-proactive-${message.id}`,
          characterId: selectedCharacter.id,
          relationId: relation.id,
          conversationId: relation.conversationId,
          content: message.body,
          timestamp: message.timestamp,
        })));
    }
    return discoveredPhone;
  };
  const syncCharacterPhonePost = (post: CharacterPhonePost) => {
    if (!selectedCharacter || !onSyncCharacterPhonePost || post.source !== "generated" || post.authorId !== selectedCharacter.id) return;
    const marker = JSON.stringify({
      content: post.content,
      timestamp: post.timestamp,
      likes: post.likes,
      comments: post.comments,
      visibility: post.visibility || "public",
      visibilityTargetIds: post.visibilityTargetIds,
      sourceMomentId: post.sourceMomentId,
    });
    if (syncedPhonePostsRef.current[post.id] === marker) return;
    syncedPhonePostsRef.current[post.id] = marker;
    onSyncCharacterPhonePost({ post, character: selectedCharacter, ownerIdentityId: userIdentityId });
  };
  useEffect(() => {
    if (!currentPhone || !selectedCharacter) return;
    const missingPosts = currentPhone.posts
      .filter((post) => post.source === "generated" && post.authorId === selectedCharacter.id)
      .filter((post) => !moments.some((moment) => moment.sourceCharacterPhonePostId === post.id));
    // A legacy phone may contain many generated posts. Bring over only the
    // newest one on open so the main feed is not suddenly flooded.
    missingPosts.sort((left, right) => right.timestamp - left.timestamp).slice(0, 1).forEach(syncCharacterPhonePost);
  }, [currentPhone, selectedCharacter, moments, onSyncCharacterPhonePost, userIdentityId]);
  const currentUserAvatar = activeIdentity?.avatar || settings?.avatar;
  const phoneCharacterLocation = useMemo(
    () => {
      const characterId = selectedCharacter?.id || "";
      const relationIds = relationships
        .filter((relation) => relation.userIdentityId === userIdentityId && relation.characterId === characterId)
        .map((relation) => relation.id);
      const scopedEntries = selectCharacterPhoneWorldBookEntries({
        entries: worldBookEntries,
        characterId,
        ownerIdentityId: userIdentityId,
        relationIds,
      });
      return inferCharacterPhoneLocation([
        selectedCharacter?.personality,
        selectedCharacter?.backstory,
        ...scopedEntries.map((entry) => entry.content),
      ], "角色所在地区");
    },
    [relationships, selectedCharacter?.backstory, selectedCharacter?.id, selectedCharacter?.personality, userIdentityId, worldBookEntries],
  );
  const phoneUserLocation = useMemo(
    () => inferCharacterPhoneLocation([
      activeIdentity?.bio,
      activeIdentity?.signature,
      settings?.bio,
      settings?.signature,
    ], "我的位置"),
    [activeIdentity?.bio, activeIdentity?.signature, settings?.bio, settings?.signature],
  );
  const roleMusicTracks = useMemo<CharacterPhoneDisplayTrack[]>(() => {
    const storedTracks = currentPhone?.musicTracks ?? [];
    return storedTracks.map((track, index) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      cover: "cover" in track ? track.cover : PHONE_MUSIC_COVER_GRADIENTS[index % PHONE_MUSIC_COVER_GRADIENTS.length],
      coverUrl: "coverUrl" in track ? track.coverUrl : undefined,
    }));
  }, [currentPhone?.musicTracks]);
  const musicListeningHistory = (currentPhone?.listeningHistory ?? []).slice().sort((left, right) => right.startedAt - left.startedAt);
  const musicTodaySeconds = musicListeningHistory
    .filter((record) => record.startedAt >= characterPhoneGalleryDayStart(Date.now()))
    .reduce((total, record) => total + record.durationSeconds, 0);
  const musicTodayMinutes = Math.round(musicTodaySeconds / 60);
  const listeningHourCounts = musicListeningHistory.reduce<Record<number, number>>((counts, record) => {
    const hour = new Date(record.startedAt).getHours();
    counts[hour] = (counts[hour] || 0) + record.durationSeconds;
    return counts;
  }, {});
  const commonListeningHour = Object.entries(listeningHourCounts)
    .sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0];
  const commonListeningPeriod = commonListeningHour === undefined
    ? "暂无记录"
    : `${String(Number(commonListeningHour)).padStart(2, "0")}:00—${String((Number(commonListeningHour) + 2) % 24).padStart(2, "0")}:00`;
  const recentMusicTracks = musicListeningHistory
    .map((record) => roleMusicTracks.find((track) => track.id === record.trackId))
    .filter((track): track is CharacterPhoneDisplayTrack => Boolean(track))
    .filter((track, index, list) => list.findIndex((candidate) => candidate.id === track.id) === index)
    .slice(0, 3);
  const musicTrack = roleMusicTracks[musicTrackIndex] || roleMusicTracks[0] || {
    id: "empty",
    title: "暂无音乐",
    artist: "",
    duration: "0:00",
    cover: PHONE_MUSIC_COVER_GRADIENTS[0],
  };
  const recordMusicListening = (trackId: string) => {
    if (!currentPhone || trackId === "empty") return;
    const now = Date.now();
    const history = currentPhone.listeningHistory ?? [];
    if (history.some((record) => record.trackId === trackId && now - record.startedAt < 30 * 1000)) return;
    const track = roleMusicTracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    updatePhone({
      listeningHistory: [
        { id: `phone-listening-${now}`, trackId, startedAt: now, durationSeconds: 30, source: "user-library" as const },
        ...history,
      ],
    }, {
      kind: "data_changed",
      app: "music",
      detail: `播放《${track.title}》`,
    });
  };
  const toggleMusicPlayback = () => {
    const nextPlaying = !musicIsPlaying;
    setMusicIsPlaying(nextPlaying);
    if (nextPlaying) recordMusicListening(musicTrack.id);
  };
  const changeMusicTrack = (direction: 1 | -1) => {
    if (roleMusicTracks.length === 0) return;
    const nextIndex = (musicTrackIndex + direction + roleMusicTracks.length) % roleMusicTracks.length;
    const nextTrack = roleMusicTracks[nextIndex];
    setMusicTrackIndex(nextIndex);
    setMusicProgress(0.08);
    setMusicIsPlaying(true);
    recordMusicListening(nextTrack.id);
  };
  const placePhoneCall = (simLabel: string) => {
    if (!phoneNumber) return;
    setPhoneNotice(`正在通过${simLabel}拨打 ${phoneNumber}`);
  };
  const unreadCount =
    currentPhone?.messages.filter((message) => message.unread).length ?? 0;
  const visiblePhoneContacts = (currentPhone?.contacts ?? []).filter((contact) => !contact.removedAt);
  const selectedContact =
    visiblePhoneContacts.find(
      (contact) => contact.id === selectedContactId,
    ) || visiblePhoneContacts[0];
  const persistPhone = (next: CharacterPhoneRecord) => {
    const result = saveCharacterPhone(next);
    if (!result.success) {
      setPhoneNotice(result.error === "quota"
        ? "角色手机存储空间不足，请先清理旧图片或文字图；本次修改未保存"
        : "角色手机数据保存失败，原数据已保留");
      return false;
    }
    setPhone(next);
    if (selectedCharacter && onSyncCharacterPhonePost) {
      const previousPosts = currentPhone?.posts ?? [];
      const changedPosts = next.posts.filter((post) => {
        const previous = previousPosts.find((candidate) => candidate.id === post.id);
        return !previous || JSON.stringify(previous) !== JSON.stringify(post);
      });
      changedPosts
        .filter((post) => post.source === "generated" && post.authorId === selectedCharacter.id)
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 1)
        .forEach((post) => syncCharacterPhonePost(post));
    }
    return true;
  };
  const clearCurrentCharacterPhoneData = async () => {
    if (!currentPhone || !selectedCharacter) return;
    const confirmed = window.confirm(
      `确定清空${selectedCharacter.name}的角色手机数据吗？\n聊天、联系人、朋友圈、浏览记录、日记、备忘录、日程、照片、音乐、生活轨迹和操作记录都会删除；密码、壁纸和应用设置会保留。`,
    );
    if (!confirmed) return;
    const imageAssetIds: string[] = [...new Set<string>(
      (currentPhone.galleryItems ?? [])
        .map((item) => item.imageAssetId)
        .filter((id): id is string => Boolean(id)),
    )];
    if (selectedCharacter && onDeleteCharacterPhonePost) {
      currentPhone.posts
        .filter((post) => post.source === "generated" && post.authorId === selectedCharacter.id)
        .forEach((post) => onDeleteCharacterPhonePost({ post, character: selectedCharacter, ownerIdentityId: userIdentityId }));
    }
    const clearedPhone = clearCharacterPhoneData(currentPhone);
    if (!persistPhone(clearedPhone)) return;
    setSelectedGalleryId(null);
    setGalleryMode("main");
    setHiddenGalleryUnlocked(false);
    setHiddenGalleryInput("");
    setHiddenGalleryNotice("");
    setSelectedBrowserEntryId(null);
    setPhoneChatMode("inbox");
    setSelectedContactId("");
    setContactMenuOpen(false);
    setContactRemarkEditing(false);
    setContactRemarkDraft("");
    setInput("");
    setDraft("");
    setPostDraft("");
    setPostVisibility("public");
    setPostVisibilityTargetIds([]);
    setSelectedDiaryId(null);
    setDiaryEditing(false);
    setShowHiddenDiary(false);
    setShowAllDiary(false);
    setCharacterNoteEditing(false);
    setSelectedCharacterNoteId(null);
    setCharacterNoteDraft({ title: "", content: "" });
    setCharacterTodoText("");
    setIsAddingCharacterTodo(false);
    setMusicView("home");
    setMusicTrackIndex(0);
    setMusicIsPlaying(false);
    setMusicProgress(0.42);
    setDesktopPage(0);
    if (imageAssetIds.length > 0) {
      const results = await Promise.allSettled(imageAssetIds.map((id) => imageAssetDb.deleteImage(id)));
      if (results.some((result) => result.status === "rejected")) {
        setPhoneDataNotice("已清空角色手机记录，但部分图片缓存未能删除，请稍后重试");
        return;
      }
    }
    setPhoneDataNotice("已清空当前角色手机的全部记录和生成内容");
  };
  const closeCharacterPhone = () => {
    generationRequestRef.current += 1;
    setIsAdvancing(false);
    setHiddenGalleryUnlocked(false);
    setHiddenGalleryInput("");
    setHiddenGalleryNotice("");
    onClose();
  };
  const openPhoneContact = (contact: CharacterPhoneContact) => {
    setSelectedContactId(contact.id);
    setPhoneChatMode("conversation");
    setContactMenuOpen(false);
    setContactRemarkEditing(false);
    if (!currentPhone) return;
    persistPhone(withPhoneAction(currentPhone, {
      kind: "chat_read",
      app: "chat",
      targetId: contact.id,
      detail: `查看与${contact.remark || contact.name}的聊天记录`,
      detectability: "none",
    }));
  };
  const saveContactRemark = () => {
    if (!currentPhone || !selectedContact || !contactRemarkDraft.trim()) return;
    const now = Date.now();
    const next = withPhoneAction({
      ...currentPhone,
      contacts: currentPhone.contacts.map((contact) => contact.id === selectedContact.id
        ? { ...contact, remark: contactRemarkDraft.trim().slice(0, 40) }
        : contact),
    }, {
      kind: "contact_remark_changed",
      app: "chat",
      targetId: selectedContact.id,
      detail: `修改${selectedContact.name}的备注名`,
      detectability: "possible",
    }, now);
    persistPhone(next);
    setContactRemarkEditing(false);
    setContactRemarkDraft("");
  };
  const removePhoneContact = () => {
    if (!currentPhone || !selectedContact) return;
    const now = Date.now();
    const next = withPhoneAction({
      ...currentPhone,
      contacts: currentPhone.contacts.map((contact) => contact.id === selectedContact.id
        ? { ...contact, removedAt: now }
        : contact),
    }, {
      kind: "contact_removed",
      app: "chat",
      targetId: selectedContact.id,
      detail: `删除联系人${selectedContact.remark || selectedContact.name}（保留聊天记录）`,
      detectability: "likely",
    }, now);
    persistPhone(next);
    setSelectedContactId("");
    setPhoneChatMode("inbox");
    setContactMenuOpen(false);
    setContactRemarkEditing(false);
  };
  const sendAsCharacter = () => {
    if (
      !currentPhone ||
      !selectedContact ||
      !draft.trim() ||
      !selectedCharacter
    )
      return;
    const now = Date.now();
    const relation = relationships.find(
      (item) => item.userIdentityId === userIdentityId && item.characterId === selectedCharacter.id,
    );
    const sourceMessageId = selectedContact.kind === "user" && relation && onSendMessage
      ? `phone-user-thread-${now}`
      : undefined;
    const next = appendCharacterPhoneThreadMessage({
      phone: currentPhone,
      contactId: selectedContact.id,
      content: draft,
      operatedByUser: true,
      character: selectedCharacter,
      now,
      sourceMessageId,
    });
    const loggedNext = withPhoneAction(next, {
      kind: "chat_sent_as_character",
      app: "chat",
      targetId: selectedContact.id,
      detail: `向${selectedContact.remark || selectedContact.name}发送消息`,
      detectability: "likely",
      discoveryAfterMs: 0,
      discoveryAfterOpens: 0,
    }, now);
    persistPhone(loggedNext);
    if (sourceMessageId && relation && onSendMessage) {
      onSendMessage(createCharacterTextMessage({
        id: sourceMessageId,
        characterId: selectedCharacter.id,
        relationId: relation.id,
        conversationId: relation.conversationId,
        content: draft.trim().slice(0, 1000),
        timestamp: now,
        sentFromCharacterPhone: true,
      }));
    } else {
      setPhoneNotice(selectedContact.kind === "group" ? "消息已发到群聊，群成员会在下一次生活生成中回应" : "消息已发出，联系人会在下一次生活生成中回应");
    }
    const discoveredNext = discoverAndForwardPhoneActions(loggedNext, currentPhone, now);
    if (discoveredNext !== loggedNext) {
      persistPhone(discoveredNext);
      setPhone(discoveredNext);
    }
    setDraft("");
  };
  const publishPost = () => {
    if (!currentPhone || !selectedCharacter || !postDraft.trim()) return;
    const now = Date.now();
    const next = withPhoneAction({
      ...currentPhone,
      posts: [
        ...(currentPhone.posts ?? []),
        {
          id: `phone-post-user-${now}`,
          author: selectedCharacter.name,
          authorId: selectedCharacter.id,
          authorAvatar: selectedCharacter.avatar,
          content: postDraft.trim().slice(0, 500),
          timestamp: now,
          likes: 0,
          comments: [],
          source: "generated" as const,
          visibility: postVisibility,
          ...(postVisibility === "specific" ? { visibilityTargetIds: postVisibilityTargetIds } : {}),
        },
      ],
      activities: [
        ...currentPhone.activities,
        {
          id: `phone-post-activity-${now}`,
          type: "user_edit" as const,
          label: "以角色身份发布朋友圈",
          timestamp: now,
          relatedToUser: true,
        },
      ],
      updatedAt: now,
    }, {
      kind: "data_changed",
      app: "moments",
      detail: "以角色身份发布朋友圈",
      ...getCharacterPhoneMutationPolicy("moments", selectedCharacter),
    }, now);
    saveCharacterPhone(next);
    setPhone(next);
    syncCharacterPhonePost(next.posts[next.posts.length - 1]);
    setPostDraft("");
    setPostVisibility("public");
    setPostVisibilityTargetIds([]);
  };

  const selectCharacter = (characterId: string) => {
    const character = characters.find((item) => item.id === characterId);
    if (!character) return;
    generationRequestRef.current += 1;
    setIsAdvancing(false);
    setSelectedCharacterId(characterId);
    setPhone(openCharacterPhone(userIdentityId, character, phoneContext));
    setUnlocked(false);
    setHiddenGalleryUnlocked(false);
    setHiddenGalleryInput("");
    setHiddenGalleryNotice("");
    setActiveApp("home");
    setDesktopPage(0);
    setPhoneDialerTab("all");
    setPhoneNumber("");
    setScheduleTodaySignal(0);
    setPhoneChatMode("inbox");
    setPhoneSocialTab("chats");
    setMusicView("home");
    setMusicIsPlaying(false);
    setPostVisibility("public");
    setPostVisibilityTargetIds([]);
    setInput("");
    setShowHiddenDiary(false);
    setShowAllDiary(false);
    setHidingTapCount(0);
    setIsDiaryFabVisible(true);
    setCharacterNotesTab("notes");
    setCharacterNoteQuery("");
    setCharacterNoteEditing(false);
    setSelectedCharacterNoteId(null);
    setIsAddingCharacterTodo(false);
    setCharacterTodoText("");
    setNotice("");
    setPhoneNotice("");
    setPhoneDataNotice("");
  };

  const generateCharacterPhoneContent = async () => {
    if (!unlocked || !currentPhone || !selectedCharacter || isAdvancing) return;
    const basePhone = currentPhone;
    const now = Date.now();
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    const requestScope = {
      ownerIdentityId: userIdentityId,
      characterId: selectedCharacter.id,
      phoneId: basePhone.id,
    };
    setPhoneNotice("");
    setIsAdvancing(true);
    let generationTimeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        generationTimeout = setTimeout(() => {
          timedOut = true;
          reject(new Error("角色手机内容生成超时"));
        }, CHARACTER_PHONE_GENERATION_TIMEOUT_MS);
      });
      const advancedResult = await Promise.race([
        advanceCharacterPhoneWithResult({
          phone: basePhone,
          character: selectedCharacter,
          characters,
          activeIdentity,
          relationships,
          messages,
          moments,
          worldBookEntries,
          relationshipNetworkNpcs,
          relationshipNetworkMaps,
          musicTracks,
          settings,
        }),
        timeoutPromise,
      ]);
      if (!mountedRef.current
        || generationRequestRef.current !== requestId
        || phoneScopeRef.current.ownerIdentityId !== requestScope.ownerIdentityId
        || phoneScopeRef.current.characterId !== requestScope.characterId
        || advancedResult.phone.id !== requestScope.phoneId) return;
      const advancedPhone = advancedResult.phone;
      const discoveredPhone = discoverAndForwardPhoneActions(advancedPhone, basePhone, now);
      const saved = saveCharacterPhone(discoveredPhone);
      if (!saved.success) {
        setPhoneNotice(saved.error === "quota"
          ? "角色手机存储空间不足，请先在设置中清理旧图片或文字图后重试；原有数据未改动"
          : "生成内容保存失败，原数据已保留");
        return;
      }
      setPhone(discoveredPhone);
      const newGeneratedPosts = discoveredPhone.posts.filter(
        (post) => post.source === "generated"
          && post.authorId === selectedCharacter.id
          && !basePhone.posts.some((existing) => existing.id === post.id),
      );
      // Keep one generation from flooding the main phone's feed. The newest
      // generated post is enough to establish the shared social trace.
      newGeneratedPosts.sort((left, right) => right.timestamp - left.timestamp).slice(0, 1).forEach(syncCharacterPhonePost);
      setPhoneNotice(advancedResult.status === "generated"
        ? "角色手机已生成新的生活痕迹"
        : characterPhoneGenerationNoChangeNotice(advancedResult.reason));
    } catch (error) {
      if (timedOut && mountedRef.current && generationRequestRef.current === requestId) {
        // Invalidate a late provider response so it cannot overwrite a retry.
        generationRequestRef.current += 1;
        setPhoneNotice("角色手机生成超时，请检查模型状态后重试");
      } else if (!timedOut) {
        throw error;
      }
    } finally {
      if (generationTimeout) clearTimeout(generationTimeout);
      // The phone screen has no concurrent generation controls; once this
      // invocation settles, always release the button for the mounted screen.
      // Request-id guards above still prevent stale data from being saved.
      if (mountedRef.current) setIsAdvancing(false);
    }
  };

  const verifyPasscode = async (passcode = input) => {
    if (!currentPhone || !selectedCharacter) return;
    const now = Date.now();
    if (currentPhone.lockedUntil && currentPhone.lockedUntil > now) {
      setNotice(
        `手机暂时锁定，请等待 ${Math.ceil((currentPhone.lockedUntil - now) / 1000)} 秒`,
      );
      return;
    }
    if (passcode === normalizeCharacterPhonePasscode(currentPhone.passcode)) {
      const openedPhone = discoverAndForwardPhoneActions(withPhoneAction({
        ...currentPhone,
        failedAttempts: 0,
        lockedUntil: undefined,
        phoneOpenCount: (currentPhone.phoneOpenCount ?? 0) + 1,
        lastOpenedAt: now,
        scheduleItems: currentPhone.scheduleItems ?? [],
        galleryItems: currentPhone.galleryItems ?? [],
        contacts: currentPhone.contacts ?? [],
        threadMessages: currentPhone.threadMessages ?? [],
        posts: currentPhone.posts ?? [],
        updatedAt: now,
      }, {
        kind: "phone_opened",
        app: "phone",
        detail: `进入${selectedCharacter.name}的角色手机`,
        detectability: "none",
      }, now), currentPhone, now);
      setPhone(openedPhone);
      saveCharacterPhone(openedPhone);
      setUnlocked(true);
      setInput("");
      setNotice("");
      return;
    }
    const failedAttempts = currentPhone.failedAttempts + 1;
    const awarenessLevel =
      failedAttempts >= 5
        ? 2
        : failedAttempts >= 3
          ? 1
          : (currentPhone.awarenessLevel ?? 0);
    const awarenessMessage =
      awarenessLevel > (currentPhone.awarenessLevel ?? 0)
        ? {
            id: `phone-awareness-${now}`,
            sender: selectedCharacter.name,
            body: buildCharacterPhoneAwarenessMessage(
              selectedCharacter,
              awarenessLevel,
              { attemptCount: failedAttempts },
            ),
            timestamp: now,
            unread: true,
          }
        : null;
    const relation = relationships.find(
      (item) =>
        item.userIdentityId === userIdentityId &&
        item.characterId === selectedCharacter.id,
    );
    if (awarenessMessage && relation && onSendMessage)
      onSendMessage(
        createCharacterTextMessage({
          id: awarenessMessage.id,
          characterId: selectedCharacter.id,
          relationId: relation.id,
          conversationId: relation.conversationId,
          content: awarenessMessage.body,
          timestamp: now,
        }),
      );
    const next = {
      ...currentPhone,
      failedAttempts,
      lockedUntil: failedAttempts >= 5 ? now + 5 * 60 * 1000 : undefined,
      awarenessLevel,
      awarenessUpdatedAt: awarenessMessage
        ? now
        : currentPhone.awarenessUpdatedAt,
      updatedAt: now,
      messages: awarenessMessage
        ? [...currentPhone.messages, awarenessMessage]
        : currentPhone.messages,
      activities: [
        ...currentPhone.activities,
        {
          id: `${now}`,
          type: "unlock_failed" as const,
          label: `密码输入错误（第 ${failedAttempts} 次）`,
          timestamp: now,
          relatedToUser: true,
        },
      ],
    };
    saveCharacterPhone(next);
    setPhone(next);
    setInput("");
    setNotice(
      failedAttempts >= 5
        ? "手机已锁定，角色已经知道有人尝试进入。"
        : failedAttempts >= 3
          ? "角色似乎察觉到了什么。"
          : "密码不正确",
    );
  };

  const appendUnlockDigit = (digit: string) => {
    setInput((value) => {
      if (value.length >= 4) return value;
      const next = `${value}${digit}`;
      if (next.length === 4) void verifyPasscode(next);
      return next;
    });
    setNotice("");
  };

  const removeUnlockDigit = () => {
    setInput((value) => value.slice(0, -1));
    setNotice("");
  };

  const openForgotPasswordChat = () => {
    if (!selectedCharacter) return;
    const relation = relationships.find(
      (item) => item.userIdentityId === userIdentityId && item.characterId === selectedCharacter.id,
    );
    if (onOpenChat && relation) {
      onOpenChat(selectedCharacter.id, relation.id);
      return;
    }
    setNotice("暂时找不到这个角色的聊天入口");
  };

  const lockHiddenGallery = () => {
    setHiddenGalleryUnlocked(false);
    setHiddenGalleryInput("");
    setHiddenGalleryNotice("");
  };

  const requestHiddenGallery = () => {
    setGalleryMode("hidden");
    setSelectedGalleryId(null);
    lockHiddenGallery();
  };

  const submitHiddenGalleryPasscode = (passcode = hiddenGalleryInput) => {
    if (!currentPhone || !selectedCharacter) return;
    const normalized = passcode.replace(/\D/g, "").slice(0, 4);
    if (normalized === resolveCharacterPhoneHiddenGalleryPasscode(selectedCharacter, currentPhone)) {
      setHiddenGalleryUnlocked(true);
      setHiddenGalleryInput("");
      setHiddenGalleryNotice("");
      return;
    }
    setHiddenGalleryInput("");
    setHiddenGalleryNotice("密码不正确，请重新输入");
  };

  const openApp = (appId: CharacterPhoneAppId | CharacterPhoneSystemAppId) => {
    if (!currentPhone) return;
    const now = Date.now();
    const next = withPhoneAction({
      ...currentPhone,
      activities: [
        ...currentPhone.activities,
        {
          id: `${now}-${appId}`,
          type: "app_opened" as const,
          label: `打开${APP_META[appId].label}`,
          timestamp: now,
          relatedToUser: true,
        },
      ],
      messages:
        appId === "chat"
          ? currentPhone.messages.map((message) => ({
              ...message,
              unread: false,
            }))
          : currentPhone.messages,
      updatedAt: now,
    }, {
      kind: "app_opened",
      app: appId,
      detail: `打开${APP_META[appId].label}`,
      detectability: "none",
    }, now);
    saveCharacterPhone(next);
    setPhone(next);
    if (appId === "browser") setSelectedBrowserEntryId(null);
    setActiveApp(appId);
  };
  const updatePhone = (
    patch: Partial<CharacterPhoneRecord>,
    actionPatch?: Partial<Pick<CharacterPhoneActionRecord, "kind" | "app" | "detail" | "detectability" | "discoveryAfterMs" | "discoveryAfterOpens">>,
  ) => {
    if (!currentPhone) return;
    const now = Date.now();
    const logicalApp = activeApp === "chat" && phoneSocialTab === "moments"
      ? "moments"
      : activeApp === "home"
        ? "system"
        : activeApp;
    const policy = getCharacterPhoneMutationPolicy(logicalApp, selectedCharacter!);
    const next = withPhoneAction({ ...currentPhone, ...patch, updatedAt: now }, {
      kind: actionPatch?.kind || "data_changed",
      app: actionPatch?.app || logicalApp,
      detail: actionPatch?.detail || `更新${activeApp === "home" ? "手机数据" : APP_META[activeApp].label}`,
      ...policy,
      ...actionPatch,
    }, now);
    persistPhone(next);
  };
  const handleCharacterPhoneTextImageCreate = (description: string): boolean => {
    if (!currentPhone || !selectedCharacter) return false;
    const caption = description.trim().replace(/\s+/g, " ").slice(0, 160);
    if (!caption) return false;
    const duplicate = currentPhone.galleryItems.some((item) =>
      !item.deletedAt && item.source === "user" && item.caption.trim() === caption,
    );
    if (duplicate) return false;
    const now = Date.now();
    const title = `${selectedCharacter.name || "角色"}的文字图`;
    const item: CharacterPhoneGalleryItem = {
      id: `camera-text-${now}`,
      title,
      caption,
      timestamp: now,
      source: "user",
      textImageForId: `camera-text-${now}`,
      dataUrl: createCharacterPhoneTextImageDataUrl(caption, title),
    };
    updatePhone({ galleryItems: [item, ...currentPhone.galleryItems] }, {
      kind: "gallery_text_image_created",
      app: "gallery",
      detail: item.title,
    });
    return true;
  };
  const readCharacterPhoneImage = (
    event: React.ChangeEvent<HTMLInputElement>,
    onLoaded: (dataUrl: string) => void,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onLoaded(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const handleCharacterPhoneWallpaperUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    readCharacterPhoneImage(event, (wallpaper) => updatePhone({ wallpaper }));
  };
  const handleCharacterPhoneAppIconUpload = (
    appId: CharacterPhoneIconAppId,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    readCharacterPhoneImage(event, (icon) => {
      if (!currentPhone) return;
      updatePhone({
        appIcons: {
          ...(currentPhone.appIcons ?? {}),
          [appId]: icon,
        },
      });
    });
  };
  const handleResetCharacterPhoneAppIcon = (appId: CharacterPhoneIconAppId) => {
    if (!currentPhone?.appIcons?.[appId]) return;
    const appIcons = { ...(currentPhone.appIcons ?? {}) };
    delete appIcons[appId];
    updatePhone({ appIcons });
  };
  const renderCharacterPhoneIcon = (
    appId: CharacterPhoneIconAppId,
    defaultClassName: string,
    customClassName = "h-full w-full",
  ) => {
    const customIcon = currentPhone?.appIcons?.[appId];
    if (customIcon) {
      // Uploaded icons are artwork for the whole tile, not a glyph inside it.
      // The fixed tile owns the crop, so source image dimensions cannot change
      // the rendered icon size or make one app look smaller than another.
      return <img src={customIcon} alt="" className={`${customClassName} block object-cover`} />;
    }
    return React.cloneElement(APP_META[appId].icon as React.ReactElement, { className: defaultClassName });
  };

  const characterNotes = currentPhone?.notes ?? [];
  const characterTodos = currentPhone?.todos ?? [];
  const selectedCharacterNote = characterNotes.find(
    (note) => note.id === selectedCharacterNoteId,
  ) || null;
  const filteredCharacterNotes = characterNotes.filter((note) =>
    `${note.title} ${note.content}`
      .toLowerCase()
      .includes(characterNoteQuery.toLowerCase()),
  );
  const completedCharacterTodos = characterTodos.filter((todo) => todo.checked).length;
  const characterTodoProgress = characterTodos.length > 0
    ? Math.round((completedCharacterTodos / characterTodos.length) * 100)
    : 0;
  const handleOpenCharacterNote = (note?: CharacterPhoneNote) => {
    setSelectedCharacterNoteId(note?.id || null);
    setCharacterNoteDraft({
      title: note?.title || "",
      content: note?.content || "",
    });
    setCharacterNoteEditing(true);
  };
  const handleSaveCharacterNote = () => {
    if (!currentPhone || (!characterNoteDraft.title.trim() && !characterNoteDraft.content.trim())) return;
    const now = Date.now();
    const nextNote: CharacterPhoneNote = {
      id: selectedCharacterNote?.id || `character-phone-note-${now}`,
      title: characterNoteDraft.title.trim() || "无标题笔记",
      content: characterNoteDraft.content.trim(),
      timestamp: now,
    };
    updatePhone({
      notes: [
        nextNote,
        ...characterNotes.filter((note) => note.id !== nextNote.id),
      ],
    });
    setCharacterNoteEditing(false);
    setSelectedCharacterNoteId(null);
    setCharacterNoteDraft({ title: "", content: "" });
  };
  const handleDeleteCharacterNote = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    updatePhone({ notes: characterNotes.filter((note) => note.id !== id) });
  };
  const handleAddCharacterTodo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = characterTodoText.trim();
    if (!text) return;
    updatePhone({
      todos: [
        { id: `character-phone-todo-${Date.now()}`, text, checked: false },
        ...characterTodos,
      ],
    });
    setCharacterTodoText("");
    setIsAddingCharacterTodo(false);
  };
  const handleToggleCharacterTodo = (id: string) => {
    updatePhone({
      todos: characterTodos.map((todo) =>
        todo.id === id ? { ...todo, checked: !todo.checked } : todo,
      ),
    });
  };
  const handleDeleteCharacterTodo = (id: string) => {
    updatePhone({ todos: characterTodos.filter((todo) => todo.id !== id) });
  };
  const handleClearCompletedCharacterTodos = () => {
    updatePhone({ todos: characterTodos.filter((todo) => !todo.checked) });
  };

  const updatePhonePost = (
    momentId: string,
    updater: (
      post: CharacterPhoneRecord["posts"][number],
    ) => CharacterPhoneRecord["posts"][number],
  ) => {
    if (!currentPhone) return;
    updatePhone({
      posts: currentPhone.posts.map((post) =>
        post.id === momentId ? updater(post) : post,
      ),
    });
  };
  const togglePhonePostLike = (postId: string) => {
    if (!currentPhone || !selectedCharacter) return;
    const liked = likedPostIds.includes(postId);
    updatePhonePost(postId, (post) => ({
      ...post,
      likes: Math.max(0, post.likes + (liked ? -1 : 1)),
    }));
    setLikedPostIds((ids) =>
      liked ? ids.filter((id) => id !== postId) : [...ids, postId],
    );
  };
  const addPhonePostComment = (postId: string) => {
    const content = (postCommentDrafts[postId] || "").trim();
    if (!content) return;
    updatePhonePost(postId, (post) => ({
      ...post,
      comments: [...post.comments, content],
    }));
    setPostCommentDrafts((drafts) => ({ ...drafts, [postId]: "" }));
  };
  const deletePhonePost = (postId: string) => {
    if (!currentPhone) return;
    const removed = currentPhone.posts.find((post) => post.id === postId);
    if (removed && removed.source === "generated" && removed.authorId === selectedCharacter?.id && selectedCharacter && onDeleteCharacterPhonePost) {
      onDeleteCharacterPhonePost({ post: removed, character: selectedCharacter, ownerIdentityId: userIdentityId });
    }
    updatePhone({
      posts: currentPhone.posts.filter((post) => post.id !== postId),
    });
  };
  const deletePhonePostComment = (postId: string, index: number) => {
    updatePhonePost(postId, (post) => ({
      ...post,
      comments: post.comments.filter(
        (_, commentIndex) => commentIndex !== index,
      ),
    }));
  };
  const runPhoneBrowserSearch = () => {
    const query = browserAddress.trim();
    if (!query || !currentPhone) return;
    const now = Date.now();
    const entryBase = {
      id: `phone-search-user-${now}`,
      query,
      title: `关于“${query}”的搜索结果`,
      timestamp: now,
    };
    const detail = buildCharacterPhoneBrowserDetail(entryBase, selectedCharacter?.name);
    persistPhone(withPhoneAction({
      ...currentPhone,
      browserHistory: [
        {
          ...entryBase,
          ...detail,
        },
        ...currentPhone.browserHistory,
      ],
    }, {
      kind: "browser_searched",
      app: "browser",
      detail: `搜索：${query}`,
      ...getCharacterPhoneMutationPolicy("browser", selectedCharacter!),
    }, now));
    setBrowserAddress("");
  };

  if (!selectedCharacter || !currentPhone)
    return (
      <div className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h1 className="text-base font-bold">角色手机</h1>
          <button type="button" onClick={closeCharacterPhone} aria-label="关闭角色手机">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-[var(--text-muted)]">
          请先创建至少一个角色，才能查看角色手机。
        </div>
      </div>
    );

  const visibleGallery = currentPhone.galleryItems.filter((item) =>
    galleryMode === "hidden"
      ? item.hidden && !item.deletedAt
      : galleryMode === "deleted"
        ? Boolean(item.deletedAt)
        : !item.hidden && !item.deletedAt,
  );
  const galleryGroups = visibleGallery
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .reduce<Array<{ key: string; label: string; items: typeof visibleGallery }>>(
      (groups, item) => {
        const key = characterPhoneGalleryDayKey(item.timestamp);
        const existingGroup = groups.find((group) => group.key === key);
        if (existingGroup) {
          existingGroup.items.push(item);
        } else {
          groups.push({
            key,
            label: formatCharacterPhoneGalleryGroupLabel(item.timestamp),
            items: [item],
          });
        }
        return groups;
      },
      [],
    );
  const selectedDiary =
    currentPhone.diaryEntries.find((entry) => entry.id === selectedDiaryId) ||
    null;
  const diaryTodayStart = characterPhoneGalleryDayStart(Date.now());
  const diaryTodayCount = currentPhone.diaryEntries.filter(
    (entry) => !entry.hidden && entry.timestamp >= diaryTodayStart,
  ).length;
  const diaryAllCount = currentPhone.diaryEntries.filter((entry) => !entry.hidden).length;
  const diaryHiddenCount = currentPhone.diaryEntries.filter((entry) => entry.hidden).length;
  const visibleDiaryEntries = currentPhone.diaryEntries
    .filter((entry) => {
      if (showHiddenDiary) return entry.hidden;
      if (entry.hidden) return false;
      return showAllDiary || characterPhoneGalleryDayKey(entry.timestamp) === characterPhoneGalleryDayKey(Date.now());
    })
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp);
  const diaryGroups = visibleDiaryEntries.reduce<Array<{
    key: string;
    timestamp: number;
    items: typeof visibleDiaryEntries;
  }>>((groups, entry) => {
    const key = characterPhoneGalleryDayKey(entry.timestamp);
    const existingGroup = groups.find((group) => group.key === key);
    if (existingGroup) {
      existingGroup.items.push(entry);
    } else {
      groups.push({ key, timestamp: entry.timestamp, items: [entry] });
    }
    return groups;
  }, []);
  const handleHidingMetricClick = () => {
    if (hidingTapTimeoutRef.current !== null) {
      window.clearTimeout(hidingTapTimeoutRef.current);
    }
    hidingTapCountRef.current += 1;
    const nextCount = hidingTapCountRef.current;
    if (nextCount >= 5) {
      hidingTapCountRef.current = 0;
      setHidingTapCount(0);
      setShowHiddenDiary((visible) => !visible);
      hidingTapTimeoutRef.current = null;
      return;
    }
    setHidingTapCount(nextCount);
    hidingTapTimeoutRef.current = window.setTimeout(() => {
      hidingTapCountRef.current = 0;
      setHidingTapCount(0);
      hidingTapTimeoutRef.current = null;
    }, 5000);
  };
  const handleDiaryScroll = (event: React.UIEvent<HTMLElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    const previousScrollTop = diaryScrollTopRef.current;
    if (scrollTop <= 4 || scrollTop < previousScrollTop - 2) {
      setIsDiaryFabVisible(true);
    } else if (scrollTop > previousScrollTop + 2) {
      setIsDiaryFabVisible(false);
    }
    diaryScrollTopRef.current = scrollTop;
  };
  const currentThreadMessages = selectedContact
    ? listCharacterPhoneThreadMessages(currentPhone, selectedContact.id).slice(-48)
    : [];
  const selectedGallery =
    currentPhone.galleryItems.find((item) => item.id === selectedGalleryId) ||
    null;
  const gallerySequence = visibleGallery
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp);
  const selectedGalleryIndex = selectedGallery
    ? gallerySequence.findIndex((item) => item.id === selectedGallery.id)
    : -1;
  const moveGallerySelection = (direction: -1 | 1) => {
    if (selectedGalleryIndex < 0) return;
    const next = gallerySequence[selectedGalleryIndex + direction];
    if (next) setSelectedGalleryId(next.id);
  };
  const handleGalleryPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gallerySwipeStartRef.current = { x: event.clientX, y: event.clientY };
  };
  const handleGalleryPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = gallerySwipeStartRef.current;
    gallerySwipeStartRef.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    moveGallerySelection(deltaX < 0 ? 1 : -1);
  };
  const selectedBrowserEntry = selectedBrowserEntryId
    ? currentPhone.browserHistory.find((entry) => entry.id === selectedBrowserEntryId) || null
    : null;
  const selectedBrowserDetail = selectedBrowserEntry
    ? buildCharacterPhoneBrowserDetail(selectedBrowserEntry, selectedCharacter.name)
    : null;
  const phoneScheduleEntries = useMemo<ScheduleEntry[]>(
    () =>
      currentPhone.scheduleItems.map((item) => {
        const date = new Date(item.timestamp);
        return {
          id: item.id,
          schemaVersion: 1,
          relationId: `phone:${currentPhone.id}`,
          characterId: selectedCharacter.id,
          userIdentityId,
          category: "appointment",
          appointmentId: `${item.id}-appointment`,
          title: item.title,
          status: item.timestamp >= Date.now() ? "confirmed" : "completed",
          dateKey: characterPhoneGalleryDayKey(date.getTime()),
          startAt: item.timestamp,
          timePrecision: "exact",
          activity: item.detail,
          traveler: "undetermined",
          createdAt: item.timestamp,
          updatedAt: item.timestamp,
        };
      }),
    [currentPhone.scheduleItems, currentPhone.id, selectedCharacter.id, userIdentityId],
  );
  const phoneAppointments = useMemo<Appointment[]>(
    () =>
      phoneScheduleEntries.map((entry) => ({
        id: entry.appointmentId,
        schemaVersion: 1,
        relationId: entry.relationId,
        characterId: entry.characterId,
        userIdentityId,
        title: entry.title,
        initiator: "character",
        mode: "scheduled",
        status: entry.status === "completed" ? "completed" : "confirmed",
        proposals: [{ id: `${entry.id}-proposal`, proposedBy: "character", proposedAt: entry.createdAt, startAt: entry.startAt, timePrecision: "exact", activity: entry.activity, traveler: "undetermined", status: "active", sourceMessageIds: [] }],
        currentProposalId: `${entry.id}-proposal`,
        sourceMessageIds: [],
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    [phoneScheduleEntries, userIdentityId],
  );
  const addCharacterPhoneSchedule = (entry: ScheduleEntry) => {
    if (!currentPhone) return;
    const timestamp = entry.startAt ?? new Date(`${entry.dateKey}T12:00:00`).getTime();
    const scheduleItem: CharacterPhoneScheduleItem = {
      id: entry.id,
      title: entry.title,
      detail: entry.activity || "",
      timestamp,
    };
    updatePhone({
      scheduleItems: [
        scheduleItem,
        ...currentPhone.scheduleItems.filter((item) => item.id !== scheduleItem.id),
      ],
    });
  };
  const phoneSocialNav = (
    <div className="chat-tab-nav z-10 box-border flex h-14 min-h-14 max-h-14 shrink-0 items-center justify-around border-t border-slate-200/60 bg-slate-50 py-2 text-[10px] font-bold text-slate-400" aria-label="聊天应用导航">
      {[
        { id: "chats" as const, label: "聊天", icon: MessageSquare },
        { id: "contacts" as const, label: "通讯录", icon: Users },
        { id: "moments" as const, label: "朋友圈", icon: Compass },
        { id: "me" as const, label: "我", icon: User },
      ].map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setPhoneSocialTab(id);
            setPhoneChatMode("inbox");
            setContactMenuOpen(false);
          }}
          className={`chat-tab-nav-item flex flex-col items-center space-y-1 ${phoneSocialTab === id ? "chat-tab-nav-item--active text-neutral-950" : "chat-tab-nav-item--inactive text-neutral-400 hover:text-neutral-650"}`}
          aria-label={label}
          aria-current={phoneSocialTab === id ? "page" : undefined}
        >
          <div className="relative">
            <Icon className="h-5 w-5" />
            {id === "chats" && unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-white bg-red-500 px-0.5 text-[8px] text-white">{unreadCount}</span>}
          </div>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
  const roleAudienceContacts = visiblePhoneContacts.filter((contact) => Boolean(contact.linkedCharacterId));
  const postVisibilitySelectValue = postVisibility === "specific"
    ? `character:${postVisibilityTargetIds[0] || ""}`
    : postVisibility;
  const renderPostVisibilitySelect = () => (
    <label className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
      <span>谁可以看</span>
      <select
        value={postVisibilitySelectValue}
        onChange={(event) => {
          const value = event.target.value;
          if (value.startsWith("character:")) {
            setPostVisibility("specific");
            setPostVisibilityTargetIds([value.slice("character:".length)]);
          } else {
            setPostVisibility(value as MomentVisibility);
            setPostVisibilityTargetIds(value === "user" ? ["user"] : []);
          }
        }}
        className="rounded-lg bg-[var(--surface-muted)] px-2 py-1 text-[11px] outline-none"
      >
        <option value="public">所有人可见</option>
        <option value="user">只给{activeIdentity?.name || "我"}看</option>
        {roleAudienceContacts.map((contact) => (
          <option key={contact.id} value={`character:${contact.linkedCharacterId}`}>只给{contact.remark || contact.name}看</option>
        ))}
        <option value="private">仅我可见</option>
      </select>
    </label>
  );
  const phoneMomentsView = (
    <div data-theme-page="moments" className="flex min-h-0 flex-1 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="relative h-64 shrink-0 bg-slate-200">
        {selectedCharacter.momentsCover ? (
          <img src={selectedCharacter.momentsCover} alt="朋友圈背景" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-700 via-slate-500 to-stone-300" aria-label="朋友圈默认背景" />
        )}
        <button type="button" onClick={() => { setActiveApp("home"); setPhoneSocialTab("chats"); }} className="app-nav-icon-button absolute left-4 top-3 z-20 flex h-8 w-8 items-center justify-center text-white" aria-label="返回桌面">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="absolute right-4 top-3 z-20 flex gap-2.5">
          <span className="app-nav-icon-button flex h-8 w-8 items-center justify-center text-white" aria-hidden="true"><Camera className="h-5 w-5" /></span>
          <button type="button" onClick={() => setPhoneMomentComposerOpen((open) => !open)} className="app-nav-icon-button flex h-8 w-8 items-center justify-center text-white" aria-label="发布新动态">
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="absolute bottom-[-24px] right-4 z-20 flex items-end gap-3">
          <span className="pb-8 text-sm font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{selectedCharacter.remark || selectedCharacter.name}</span>
          <img src={selectedCharacter.avatar} alt="" className="h-16 w-16 rounded-xl border-2 border-white bg-white object-cover shadow-md" referrerPolicy="no-referrer" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)] pb-4 pt-2">
        {phoneMomentComposerOpen && (
          <div className="mx-4 my-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
            <div className="flex items-center justify-between"><span className="text-xs font-bold">分享新鲜事…</span><button type="button" onClick={() => setPhoneMomentComposerOpen(false)} className="text-xs text-[var(--text-tertiary)]">收起</button></div>
            <textarea value={postDraft} onChange={(event) => setPostDraft(event.target.value)} placeholder="写下角色会发布的内容…" className="mt-2 min-h-20 w-full resize-none rounded-xl bg-[var(--surface-muted)] p-2 text-xs outline-none" />
            {renderPostVisibilitySelect()}
            <button type="button" onClick={() => { publishPost(); setPhoneMomentComposerOpen(false); }} className="mt-2 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-bold text-white">发布动态</button>
          </div>
        )}
        <div className="max-w-md mx-auto px-4 divide-y divide-slate-100">
        {(currentPhone.posts ?? []).slice().sort((a, b) => b.timestamp - a.timestamp).map((post) => (
            <article key={post.id} className="flex gap-3 py-5 first:pt-2">
              <img src={(post.source === "user" ? currentUserAvatar : undefined) || post.authorAvatar || selectedCharacter.avatar} alt="" className="h-10 w-10 shrink-0 rounded-md border border-slate-100 bg-slate-50 object-cover" referrerPolicy="no-referrer" />
              <div className="min-w-0 flex-1">
              <h4 className="truncate text-xs font-bold text-[#576b95]">{post.author || selectedCharacter.name}</h4>
              <p className="mt-1 whitespace-pre-wrap rounded p-1 text-xs leading-relaxed text-[var(--text-primary)]">{post.content}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-400">{new Date(post.timestamp).toLocaleDateString([], { month: "2-digit", day: "2-digit" })} {new Date(post.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => togglePhonePostLike(post.id)} className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${likedPostIds.includes(post.id) ? "text-rose-500" : "text-slate-400"}`}><Heart className={`h-3.5 w-3.5 ${likedPostIds.includes(post.id) ? "fill-rose-500 text-rose-500" : ""}`} /><span>{post.likes || "赞"}</span></button>
                  <button type="button" onClick={() => setPostCommentDrafts((drafts) => ({ ...drafts, [post.id]: drafts[post.id] ?? "" }))} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><MessageCircle className="h-3.5 w-3.5" /><span>{post.comments.length || "评论"}</span></button>
                </div>
              </div>
              {(post.likes > 0 || post.comments.length > 0) && (
                <div className="mt-2 space-y-2 rounded bg-[#f7f7f7] p-2 text-[11px]">
                  {post.likes > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/70 pb-1 font-bold text-[#576b95]">
                      <Heart className="h-3 w-3 shrink-0 fill-current text-rose-500" />
                      <span>{post.likes}</span>
                    </div>
                  )}
                  {post.comments.length > 0 && (
                    <div className="space-y-1 py-0.5">
                      {post.comments.map((comment, index) => <div key={`${post.id}-${index}`} className="py-1.5 leading-relaxed text-slate-800">{comment}</div>)}
                    </div>
                  )}
                </div>
              )}
              {Object.prototype.hasOwnProperty.call(postCommentDrafts, post.id) && (
                <div className="mt-2 flex gap-2"><input value={postCommentDrafts[post.id] || ""} onChange={(event) => setPostCommentDrafts((drafts) => ({ ...drafts, [post.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addPhonePostComment(post.id); }} placeholder="发表评论…" className="min-w-0 flex-1 rounded-lg bg-[var(--surface-muted)] px-2.5 py-2 text-[11px] outline-none" /><button type="button" onClick={() => addPhonePostComment(post.id)} className="rounded-lg bg-neutral-100 px-2.5 py-2 text-[11px]">发送</button></div>
              )}
            </div>
          </article>
        ))}
        {(currentPhone.posts ?? []).length === 0 && <p className="px-4 py-16 text-center text-xs text-[var(--text-tertiary)]">暂无动态，点击右上角相机发布第一条朋友圈吧！</p>}
        </div>
      </div>
      {phoneSocialNav}
    </div>
  );
  const phoneMeView = (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50 text-[var(--text-primary)]">
      <div className="relative box-border flex h-16 min-h-16 max-h-16 shrink-0 items-center justify-between border-b border-[var(--divider)] bg-[var(--surface)]/95 px-4 py-1.5 backdrop-blur-md">
        <button type="button" onClick={() => { setActiveApp("home"); setPhoneSocialTab("chats"); }} className="app-nav-icon-button z-10 flex h-8 w-8 items-center justify-center" aria-label="返回桌面"><ChevronLeft className="h-4 w-4 text-slate-700" /></button>
        <h2 className="absolute left-1/2 -translate-x-1/2 text-sm font-bold">我</h2>
        <span className="h-8 w-8" aria-hidden="true" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="rounded-3xl border border-slate-100 bg-white p-5 text-center shadow-sm">
          <img src={selectedCharacter.avatar} alt={selectedCharacter.name} className="mx-auto h-20 w-20 rounded-full border border-slate-100 object-cover" referrerPolicy="no-referrer" />
          <h3 className="mt-3 text-base font-bold">{selectedCharacter.remark || selectedCharacter.name}</h3>
        </section>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          {[
            { label: "朋友圈", detail: `${(currentPhone.posts ?? []).length} 条动态`, icon: Newspaper, action: () => setPhoneSocialTab("moments") },
            { label: "相册", detail: `${currentPhone.galleryItems.length} 张照片`, icon: Image, action: () => setActiveApp("gallery") },
            { label: "日记", detail: `${currentPhone.diaryEntries.length} 篇记录`, icon: BookHeart, action: () => setActiveApp("diary") },
          ].map(({ label, detail, icon: Icon, action }) => (
            <button key={label} type="button" onClick={action} className="flex w-full items-center gap-3 border-b border-slate-100/80 p-4 text-left last:border-b-0 hover:bg-slate-50">
              <Icon className="h-5 w-5 shrink-0 text-slate-700" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-0.5 block text-[10px] text-slate-400">{detail}</span></span><ChevronRight className="h-4 w-4 text-slate-300" />
            </button>
          ))}
        </div>
      </div>
      {phoneSocialNav}
    </div>
  );
  const phoneChatView = phoneChatMode === "conversation" && selectedContact ? (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f7]" style={{ "--app-bg": "#f7f7f7" } as React.CSSProperties}>
      <div className="relative box-border flex h-16 min-h-16 max-h-16 shrink-0 items-center justify-between border-b border-[var(--divider)] bg-[var(--surface)]/95 px-4 py-1.5 text-[var(--text-primary)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => { setPhoneChatMode("inbox"); setContactMenuOpen(false); }}
          className="app-nav-icon-button z-10 flex h-8 w-8 shrink-0 items-center justify-center transition-colors"
          aria-label="返回联系人列表"
        >
          <ChevronLeft className="h-4 w-4 text-slate-700" />
        </button>
        <div className="absolute left-1/2 max-w-[68%] -translate-x-1/2 text-center">
          <h2 className="truncate text-sm font-bold">{selectedContact.remark || selectedContact.name}</h2>
          {selectedContact.kind === "group" && <p className="truncate text-[9px] text-neutral-400">{selectedContact.memberNames?.join("、") || "群聊"}</p>}
        </div>
        <button
          type="button"
          onClick={() => { setContactMenuOpen((open) => !open); setContactRemarkEditing(false); setContactRemarkDraft(selectedContact.remark || ""); }}
          className="app-nav-icon-button z-10 flex h-8 w-8 shrink-0 items-center justify-center text-slate-700 transition-colors"
          aria-label="联系人菜单"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
      {contactMenuOpen && (
        <div className="absolute inset-x-4 top-14 z-30 rounded-2xl border border-black/5 bg-white p-4 shadow-xl" role="dialog" aria-label="联系人设置">
          <div className="flex items-center gap-3">
            <img src={resolveCharacterPhoneContactAvatar(selectedContact)} alt="" className="h-11 w-11 rounded-full object-cover" referrerPolicy="no-referrer" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{selectedContact.name}</p>
              <p className="text-[10px] text-neutral-400">{selectedContact.relation}</p>
              {selectedContact.kind === "group" && selectedContact.memberNames?.length ? <p className="mt-1 text-[10px] text-neutral-400">成员：{selectedContact.memberNames.join("、")}</p> : null}
            </div>
          </div>
          {contactRemarkEditing ? (
            <div className="mt-3 flex gap-2">
              <input
                value={contactRemarkDraft}
                onChange={(event) => setContactRemarkDraft(event.target.value)}
                placeholder="输入备注名"
                aria-label="联系人备注名"
                className="min-w-0 flex-1 rounded-xl bg-neutral-100 px-3 py-2 text-xs outline-none"
              />
              <button type="button" onClick={saveContactRemark} className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-bold text-white">保存</button>
            </div>
          ) : (
            <button type="button" onClick={() => setContactRemarkEditing(true)} className="mt-3 w-full rounded-xl bg-neutral-100 px-3 py-2 text-left text-xs">更改备注名</button>
          )}
          <button type="button" onClick={removePhoneContact} className="mt-2 w-full rounded-xl bg-rose-50 px-3 py-2 text-left text-xs font-bold text-rose-600">删除好友（保留聊天记录）</button>
        </div>
      )}
      <div className="character-phone-chat-messages min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain touch-pan-y px-3 py-4">
        {currentThreadMessages.map((message) => (
          <div key={message.id} className={`flex ${message.sender === "character" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${message.sender === "character" ? "rounded-tr-sm bg-[#95ec69] text-[#191919]" : "rounded-tl-sm border border-slate-100 bg-white text-slate-800"}`}>
                {parseCharacterPhoneStickerContent(message.content) ? (
                  <CharacterPhoneStickerMessage content={message.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              {message.attachment && <div className="mt-2 rounded-xl bg-black/10 p-2 text-[10px]">▣ {message.attachment.label}<br />{message.attachment.content}</div>}
            </div>
          </div>
        ))}
        {currentThreadMessages.length === 0 && <p className="py-12 text-center text-xs text-neutral-400">{selectedContact.kind === "group" ? "这个群聊还没有聊天记录" : "还没有和这个人的聊天记录"}</p>}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-black/5 bg-white/70 p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") sendAsCharacter(); }}
          placeholder={`以${selectedCharacter.name}的身份发送`}
          aria-label="角色手机聊天输入框"
          className="min-w-0 flex-1 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs outline-none"
        />
        <button type="button" onClick={sendAsCharacter} className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white">发送</button>
      </div>
    </div>
  ) : phoneSocialTab === "moments" ? phoneMomentsView : phoneSocialTab === "me" ? phoneMeView : (
    <div className="flex h-full min-h-0 flex-col bg-white text-[var(--text-primary)]">
      <div className="relative box-border flex h-16 min-h-16 max-h-16 shrink-0 items-center justify-between border-b border-[var(--divider)] bg-[var(--surface)]/95 px-4 py-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveApp("home")}
          className="app-nav-icon-button z-10 flex h-8 w-8 shrink-0 items-center justify-center transition-colors"
          aria-label="返回桌面"
        >
          <ChevronLeft className="h-4 w-4 text-slate-700" />
        </button>
        <h2 className="absolute left-1/2 -translate-x-1/2 text-sm font-bold">{phoneSocialTab === "contacts" ? `通讯录 (${visiblePhoneContacts.length})` : `聊天 (${visiblePhoneContacts.length})`}</h2>
        <button
          type="button"
          onClick={() => { setPhoneChatMode("inbox"); setContactMenuOpen(false); }}
          className="app-nav-icon-button z-10 flex h-8 w-8 shrink-0 items-center justify-center text-slate-700 transition-colors"
          aria-label="新建聊天"
          title="新建聊天"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[var(--divider)] bg-[var(--surface)]">
        {visiblePhoneContacts.map((contact) => {
          const latest = listCharacterPhoneThreadMessages(currentPhone, contact.id).at(-1);
          return (
            <button key={contact.id} type="button" onClick={() => openPhoneContact(contact)} className="relative flex w-full items-center gap-3 bg-[var(--surface)] p-3 text-left transition-colors hover:bg-[var(--surface-muted)]" aria-label={`打开与${contact.remark || contact.name}的聊天`}>
              <div className="relative shrink-0">
                <img src={resolveCharacterPhoneContactAvatar(contact)} alt="" className="h-11 w-11 rounded-full object-cover" referrerPolicy="no-referrer" />
                {contact.kind === "group" ? (
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-sky-100 px-1 text-[8px] text-sky-700">群聊</span>
                ) : contact.source === "generated" ? (
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-amber-100 px-1 text-[8px] text-amber-700">NPC</span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--text-primary)]">{contact.remark || contact.name}</p><p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{latest ? getCharacterPhoneMessagePreview(latest.content) : "暂无聊天记录"}</p></div>
            </button>
          );
        })}
        {visiblePhoneContacts.length === 0 && <p className="px-5 py-14 text-center text-xs text-[var(--text-tertiary)]">没有可显示的联系人</p>}
      </div>
      {phoneSocialNav}
    </div>
  );
  const updateGalleryItem = (
    id: string,
    patch: Partial<CharacterPhoneRecord["galleryItems"][number]>,
    action?: Omit<CharacterPhoneActionRecord, "id" | "timestamp" | "actor">,
  ) => {
    const nextPhone = {
      ...currentPhone,
      galleryItems: currentPhone.galleryItems.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    };
    const policy = getCharacterPhoneMutationPolicy(action?.app || "gallery", selectedCharacter!);
    persistPhone(withPhoneAction(nextPhone, {
      kind: action?.kind || "data_changed",
      app: action?.app || "gallery",
      detail: action?.detail || `更新${selectedCharacter?.name || "角色"}的相册`,
      ...policy,
      ...action,
    }));
  };
  const openGalleryItem = (item: CharacterPhoneRecord["galleryItems"][number]) => {
    setSelectedGalleryId(item.id);
    persistPhone(withPhoneAction(currentPhone, {
      kind: "gallery_viewed",
      app: "gallery",
      targetId: item.id,
      detail: item.title,
      detectability: "none",
    }));
  };
  const appContent =
    activeApp === "chat" ? phoneChatView : activeApp === "chat" && false ? (
      <>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">聊天</h2>
          <button
            type="button"
            onClick={() => openApp("moments")}
            className="rounded-full bg-white/70 px-3 py-1 text-xs"
          >
            朋友圈
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(currentPhone.contacts ?? []).map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => setSelectedContactId(contact.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-[10px] ${selectedContact?.id === contact.id ? "bg-neutral-900 text-white" : "bg-white/60"}`}
            >
              {contact.name}
              {contact.isLongTerm ? "" : " · 临时"}
            </button>
          ))}
        </div>
        {selectedContact ? (
          <>
            {currentThreadMessages.length === 0 &&
              currentPhone.messages.map((message) => (
                <div
                  key={message.id}
                  className="mt-4 max-w-[82%] rounded-2xl bg-white/80 px-3 py-2 text-sm"
                >
                  <p className="mb-1 text-[10px] text-neutral-500">
                    {message.sender}
                  </p>
                  {message.body}
                </div>
              ))}
            {currentThreadMessages.map((message) => (
              <div
                key={message.id}
                className={`mt-4 max-w-[82%] rounded-2xl px-3 py-2 text-sm ${message.sender === "character" ? "ml-auto bg-neutral-900 text-white" : "bg-white/80"}`}
              >
                <p className="mb-1 text-[10px] opacity-60">
                  {message.sender === "character"
                    ? selectedCharacter.name
                    : selectedContact.name}
                  {message.operatedByUser ? " · 用户代发" : ""}
                </p>
                {parseCharacterPhoneStickerContent(message.content) ? (
                  <CharacterPhoneStickerMessage content={message.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
                {message.attachment && (
                  <div className="mt-2 rounded-xl bg-black/10 p-2 text-[10px]">
                    ▣ {message.attachment.label}
                    <br />
                    {message.attachment.content}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-5 flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendAsCharacter();
                }}
                placeholder={`发消息给 ${selectedContact.name}`}
                className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs outline-none"
              />
              <button
                type="button"
                onClick={sendAsCharacter}
                className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-bold text-white"
              >
                发送
              </button>
            </div>
          </>
        ) : (
          <p className="mt-8 text-center text-xs text-neutral-500">
            暂时没有独立联系人。
          </p>
        )}
      </>
    ) : activeApp === "browser" ? (
      selectedBrowserEntry && selectedBrowserDetail ? (
        <div className="-mx-3 min-h-full bg-[#f7f8fa] text-[#202124]">
          <div className="box-border flex h-16 min-h-16 max-h-16 items-center border-b border-[#e8eaed] bg-white">
            <div className="flex h-full w-full items-center gap-2 px-3">
              <button
                type="button"
                onClick={() => setSelectedBrowserEntryId(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100"
                aria-label="返回历史搜索"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe1e5] bg-white px-3 py-2 shadow-[0_1px_3px_rgba(60,64,67,0.12)]">
                <Search className="h-4 w-4 shrink-0 text-[#5f6368]" />
                <span className="min-w-0 flex-1 truncate text-xs text-[#3c4043]">{selectedBrowserEntry.query}</span>
                <Camera className="h-4 w-4 shrink-0 text-[#5f6368]" />
              </div>
            </div>
          </div>

          <div className="space-y-2 px-3 pb-6 pt-3">
            {selectedBrowserDetail.results.map((result, index) => (
              <article key={`${result.platform}-${result.title}-${index}`} className="rounded-[18px] bg-white px-3 py-3 shadow-[0_1px_3px_rgba(60,64,67,0.16)]">
                <div className="flex items-start gap-2">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? "bg-[#f1f3f4] text-[#5f6368]" : index === 1 ? "bg-[#fff1e6] text-[#e05a2a]" : "bg-[#e8f0fe] text-[#1967d2]"}`}>
                    {result.platform.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-[#3c4043]">{result.platform}</p>
                    <p className="truncate text-[9px] text-[#70757a]">AI 整理 · 相关结果</p>
                  </div>
                  <MoreHorizontal className="h-4 w-4 shrink-0 text-[#70757a]" />
                </div>
                <h2 className="mt-2 text-[15px] font-semibold leading-5 text-[#1a73e8]">{result.title}</h2>
                <p className="mt-1 text-[11px] leading-5 text-[#4d5156]">{result.snippet}</p>
              </article>
            ))}

            <section aria-label="角色心声" className="rounded-[18px] border border-[#ffd9df] bg-[#fff1f3] px-3 py-3 shadow-[0_1px_3px_rgba(60,64,67,0.12)]">
              <div className="flex items-start gap-2.5">
                <img src={selectedCharacter.avatar} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-white/80 bg-white object-cover shadow-sm" referrerPolicy="no-referrer" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[11px] font-semibold text-[#3c4043]">{selectedCharacter.name}</p>
                    <span className="rounded-full bg-[#ff6f83] px-1.5 py-0.5 text-[9px] font-bold text-white">心声</span>
                  </div>
                  <p className="mt-1 rounded-2xl rounded-tl-md bg-white/85 px-3 py-2 text-[12px] leading-5 text-[#4f3c43]">“{selectedBrowserDetail.reflection}”</p>
                </div>
              </div>
              <p className="mt-2 pl-[53px] text-[10px] leading-4 text-[#a05e69]">角色刚刚留下的私人备注</p>
            </section>
          </div>
        </div>
      ) : (
      <>
        <div className="-mx-5 min-h-full bg-white px-3 pb-4 pt-1 text-[#202124]">
          <div className="flex justify-center pb-4 pt-1" aria-label="Google">
            <div className="select-none text-[2.55rem] font-medium leading-none tracking-[-0.12em]" aria-hidden="true">
              <span className="text-[#4285f4]">G</span>
              <span className="text-[#ea4335]">o</span>
              <span className="text-[#fbbc05]">o</span>
              <span className="text-[#4285f4]">g</span>
              <span className="text-[#34a853]">l</span>
              <span className="text-[#ea4335]">e</span>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              runPhoneBrowserSearch();
            }}
            className="flex items-center gap-2 rounded-full border border-[#dfe1e5] bg-white px-3 py-2 shadow-[0_1px_3px_rgba(60,64,67,0.18)]"
          >
            <Search className="h-4 w-4 shrink-0 text-[#5f6368]" />
            <input
              value={browserAddress}
              onChange={(event) => setBrowserAddress(event.target.value)}
              placeholder="搜索或输入网址"
              className="min-w-0 flex-1 appearance-none rounded-none border-0 !bg-transparent p-0 text-xs outline-none shadow-none ring-0 placeholder:text-[#70757a] focus:!bg-transparent focus:outline-none focus:ring-0"
            />
            <button type="button" aria-label="语音搜索" className="shrink-0 rounded-full p-1 text-[#5f6368]">
              <Mic className="h-4 w-4" />
            </button>
            <button type="button" aria-label="以图搜图" className="shrink-0 rounded-full p-1 text-[#5f6368]">
              <ScanLine className="h-4 w-4" />
            </button>
          </form>
          <section className="mt-4" aria-label="搜索记录">
            <div className="flex items-center justify-between px-1 pb-1">
              <h2 className="text-[11px] font-medium text-[#5f6368]">搜索记录</h2>
              <button type="button" className="text-[10px] font-medium text-[#1a73e8]">管理记录</button>
            </div>
            <div className="overflow-hidden rounded-xl bg-white">
            {normalizeCharacterPhoneBrowserHistory(currentPhone.browserHistory).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedBrowserEntryId(item.id)}
                className="flex w-full items-center gap-3 border-t border-[#ebe5ef] px-1.5 py-2 text-left transition-colors hover:bg-slate-50"
                aria-label={`查看${item.title || item.query}的搜索详情`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f1f3f4]">
                  <History className="h-3.5 w-3.5 text-[#70757a]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-[#3c4043]">{item.title || item.query}</span>
                </span>
                <ArrowUpLeft className="h-4 w-4 shrink-0 text-[#70757a]" />
              </button>
            ))}
            {normalizeCharacterPhoneBrowserHistory(currentPhone.browserHistory).length === 0 && (
              <CharacterPhoneEvidenceEmpty
                title="暂无浏览记录"
                detail="只有角色资料、聊天或生活事件中出现明确的搜索意图时，才会生成浏览记录。"
              />
            )}
            </div>
          </section>
        </div>
      </>
      )
    ) : activeApp === "schedule" ? (
      <div className="-mx-5 min-h-0 flex-1 bg-[var(--app-bg)]">
        <AppSchedule
        entries={phoneScheduleEntries}
        appointments={phoneAppointments}
        characters={[selectedCharacter]}
        onOpenChat={() => setActiveApp("chat")}
        onClose={() => setActiveApp("home")}
        hideHeader
        variant="characterPhone"
        todaySignal={scheduleTodaySignal}
        onCharacterPhoneScheduleAdd={addCharacterPhoneSchedule}
      />
      </div>
    ) : activeApp === "moments" ? (
      <>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">朋友圈</h2>
          <button
            type="button"
            onClick={() => openApp("chat")}
            className="rounded-full bg-white/70 px-3 py-1 text-xs"
          >
            返回聊天
          </button>
        </div>
        {(currentPhone.posts ?? [])
          .slice()
          .sort((a, b) => b.timestamp - a.timestamp)
          .map((post) => (
            <article key={post.id} className="mt-4 rounded-2xl bg-white/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{post.author}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-neutral-500">
                    {formatTime(post.timestamp)}
                  </p>
                  <button
                    type="button"
                    onClick={() => deletePhonePost(post.id)}
                    className="text-[10px] text-rose-500"
                  >
                    删除
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6">{post.content}</p>
              <div className="mt-3 flex items-center gap-4 text-[10px] text-neutral-500">
                <button
                  type="button"
                  onClick={() => togglePhonePostLike(post.id)}
                  className={
                    likedPostIds.includes(post.id)
                      ? "font-bold text-rose-500"
                      : ""
                  }
                >
                  ♥ {post.likes || "赞"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPostCommentDrafts((drafts) => ({
                      ...drafts,
                      [post.id]: drafts[post.id] ?? "",
                    }))
                  }
                >
                  评论 {post.comments.length || ""}
                </button>
              </div>
              {post.comments.map((comment, index) => (
                <div
                  key={comment}
                  className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs"
                >
                  <span>{comment}</span>
                  <button
                    type="button"
                    onClick={() => deletePhonePostComment(post.id, index)}
                    className="text-[10px] text-rose-500"
                  >
                    删除
                  </button>
                </div>
              ))}
              <div className="mt-3 flex gap-2">
                <input
                  value={postCommentDrafts[post.id] || ""}
                  onChange={(event) =>
                    setPostCommentDrafts((drafts) => ({
                      ...drafts,
                      [post.id]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addPhonePostComment(post.id);
                  }}
                  placeholder="发表评论…"
                  className="min-w-0 flex-1 rounded-xl bg-black/5 px-3 py-2 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => addPhonePostComment(post.id)}
                  className="rounded-xl bg-black/10 px-3 py-2 text-xs"
                >
                  发送
                </button>
              </div>
            </article>
          ))}
        <div className="mt-5 rounded-2xl bg-white/70 p-3">
          <p className="text-xs font-bold">以角色身份发布</p>
          <textarea
            value={postDraft}
            onChange={(event) => setPostDraft(event.target.value)}
            placeholder="写下角色会发布的内容…"
            className="mt-2 min-h-20 w-full rounded-xl bg-black/5 p-2 text-xs outline-none"
          />
          {renderPostVisibilitySelect()}
          <button
            type="button"
            onClick={publishPost}
            className="mt-2 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-bold text-white"
          >
            发布朋友圈
          </button>
        </div>
      </>
    ) : activeApp === "gallery" ? (
      <>
        {selectedGallery ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden overscroll-none bg-black text-white">
            <div className="box-border flex h-16 min-h-16 max-h-16 shrink-0 items-center justify-between px-4 py-2">
              <button
                type="button"
                onClick={() => setSelectedGalleryId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10"
                aria-label="返回相册"
                title="返回相册"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-xs">
                {new Date(selectedGallery.timestamp).toLocaleDateString(
                  "zh-CN",
                )}
              </span>
              <span className="h-5 w-5" aria-hidden="true" />
            </div>
            <div
              className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-5 touch-none select-none"
              role="group"
              aria-label={`查看图片 ${selectedGalleryIndex + 1} / ${gallerySequence.length}`}
              onPointerDown={handleGalleryPointerDown}
              onPointerUp={handleGalleryPointerUp}
              onPointerCancel={() => { gallerySwipeStartRef.current = null; }}
            >
              {getCharacterPhoneGalleryImageDataUrl(selectedGallery) ? (
                <img src={getCharacterPhoneGalleryImageDataUrl(selectedGallery)} alt={selectedGallery.title} draggable={false} className="max-h-[58vh] w-full rounded-2xl object-contain" />
              ) : selectedGallery.imageAssetId ? (
                <StoredCharacterPhoneImage
                  assetId={selectedGallery.imageAssetId}
                  alt={selectedGallery.title}
                  className="max-h-[58vh] w-full rounded-2xl object-contain"
                  placeholderClassName="flex h-72 w-full items-center justify-center rounded-2xl bg-neutral-800 text-3xl text-white/50"
                />
              ) : (
                <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-slate-300 via-rose-100 to-amber-100 text-7xl">
                  ✦
                </div>
              )}
              <h2 className="mt-5 w-full text-left text-base font-bold">
                {selectedGallery.title}
              </h2>
              <p className="mt-2 w-full text-left text-xs leading-5 text-white/70">
                {selectedGallery.caption}
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-center gap-9 border-t border-white/15 py-4 text-white/80">
              <button
                type="button"
                onClick={() =>
                  updateGalleryItem(selectedGallery.id, {
                    hidden: !selectedGallery.hidden,
                  })
                }
                aria-label={
                  selectedGallery.hidden ? "移出隐藏相册" : "隐藏照片"
                }
                aria-pressed={Boolean(selectedGallery.hidden)}
                title={selectedGallery.hidden ? "移出隐藏相册" : "隐藏照片"}
                className={`rounded-full p-1 transition-colors ${selectedGallery.hidden ? "bg-white/20 text-emerald-200" : "text-white/80"}`}
              >
                {selectedGallery.hidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedGallery.deletedAt) {
                    updateGalleryItem(selectedGallery.id, { deletedAt: undefined }, {
                      kind: "gallery_restored",
                      app: "gallery",
                      targetId: selectedGallery.id,
                      detail: selectedGallery.title,
                      detectability: "none",
                    });
                    return;
                  }
                  updateGalleryItem(selectedGallery.id, { deletedAt: Date.now() }, {
                    kind: "gallery_deleted",
                    app: "gallery",
                    targetId: selectedGallery.id,
                    detail: selectedGallery.title,
                    detectability: "possible",
                  });
                  setSelectedGalleryId(null);
                }}
                aria-label={selectedGallery.deletedAt ? "恢复照片" : "删除照片"}
              >
                {selectedGallery.deletedAt ? <RefreshCw className="h-5 w-5 text-emerald-200" /> : <Trash2 className="h-5 w-5 text-rose-300" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="-mx-5 flex min-h-0 flex-1 flex-col bg-[#fcfbfb] text-[#1f2937]">
            <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  setGalleryMode("main");
                  lockHiddenGallery();
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 ${galleryMode === "main" ? "bg-black text-white" : "bg-white"}`}
              >
                最近项目
              </button>
              <button
                type="button"
                onClick={requestHiddenGallery}
                className={`shrink-0 rounded-full px-3 py-1.5 ${galleryMode === "hidden" ? "bg-black text-white" : "bg-white"}`}
              >
                隐藏
              </button>
              <button
                type="button"
                onClick={() => {
                  setGalleryMode("deleted");
                  lockHiddenGallery();
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 ${galleryMode === "deleted" ? "bg-black text-white" : "bg-white"}`}
              >
                最近删除
              </button>
            </div>
            {galleryMode === "hidden" && !hiddenGalleryUnlocked ? (
              <form
                className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-10 text-center"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitHiddenGalleryPasscode();
                }}
              >
                <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-neutral-500 shadow-sm" aria-hidden="true">
                  <EyeOff className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-lg font-bold text-neutral-900">隐藏相册已锁定</h2>
                <p className="mt-2 text-xs leading-5 text-neutral-500">输入密码后查看角色保存的私密照片</p>
                <label className="sr-only" htmlFor="character-phone-hidden-gallery-passcode">隐藏相册密码</label>
                <input
                  id="character-phone-hidden-gallery-passcode"
                  aria-label="隐藏相册密码"
                  value={hiddenGalleryInput}
                  onChange={(event) => {
                    setHiddenGalleryInput(event.target.value.replace(/\D/g, "").slice(0, 4));
                    setHiddenGalleryNotice("");
                  }}
                  inputMode="numeric"
                  type="password"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="输入 4 位密码"
                  className="mt-5 w-full max-w-[220px] rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-center text-sm tracking-[0.4em] outline-none focus:border-neutral-500"
                />
                <button type="submit" className="mt-3 w-full max-w-[220px] rounded-2xl bg-neutral-900 px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-neutral-700">
                  解锁隐藏相册
                </button>
                {hiddenGalleryNotice && <p role="status" className="mt-3 text-xs text-rose-500">{hiddenGalleryNotice}</p>}
                <p className="mt-5 text-[10px] text-neutral-400">当前测试密码：3737</p>
              </form>
            ) : (
            <>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-7 px-4 pt-3 pb-5">
              {galleryGroups.map((group) => (
                <section key={group.key} aria-labelledby={`gallery-group-${group.key}`}>
                  <h2
                    id={`gallery-group-${group.key}`}
                    className="mb-3 text-xl font-bold tracking-tight text-neutral-950"
                  >
                    {group.label}
                  </h2>
                  <div className="grid grid-cols-3 gap-1">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openGalleryItem(item)}
                        className="group relative aspect-square overflow-hidden rounded-[2px] bg-neutral-200 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1 active:scale-[0.98]"
                        aria-label={`打开相册${item.title}`}
                      >
                        {getCharacterPhoneGalleryImageDataUrl(item) ? (
                          <img src={getCharacterPhoneGalleryImageDataUrl(item)} alt={item.title} className="h-full w-full object-cover" />
                        ) : item.imageAssetId ? (
                          <StoredCharacterPhoneImage
                            assetId={item.imageAssetId}
                            alt={item.title}
                            className="h-full w-full object-cover"
                            placeholderClassName="h-full w-full bg-gradient-to-br from-slate-300 via-stone-100 to-white"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-300 via-stone-100 to-white text-3xl text-white/80">
                            ✦
                          </span>
                        )}
                        <span className="sr-only">{item.title}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {visibleGallery.length === 0 && (
              <CharacterPhoneEvidenceEmpty
                title="这个相册还没有照片"
                detail="相册只展示真实导入、接收或有文字图描述的内容；没有图片或文字图证据时不会自动编造。"
              />
            )}
            </>
            )}
          </div>
        )}
      </>
    ) : activeApp === "diary" ? (
      <div className="relative -mx-5 -mt-4 flex min-h-0 flex-1 flex-col bg-[#fcfbfb] text-[#1f1f1f]">
        {diaryEditing ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">编辑日记</h2>
              <button
                type="button"
                onClick={() => setDiaryEditing(false)}
                className="text-xs text-neutral-500"
              >
                取消
              </button>
            </div>
            <input
              value={diaryDraft.title}
              onChange={(event) =>
                setDiaryDraft({ ...diaryDraft, title: event.target.value })
              }
              placeholder="标题"
              className="mt-5 w-full rounded-xl bg-white px-3 py-2 text-sm outline-none"
            />
            <textarea
              value={diaryDraft.body}
              onChange={(event) =>
                setDiaryDraft({ ...diaryDraft, body: event.target.value })
              }
              placeholder="写下这一刻…"
              className="mt-3 min-h-56 w-full resize-none rounded-xl bg-white p-3 text-sm leading-6 outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!currentPhone || !diaryDraft.body.trim()) return;
                const now = Date.now();
                const nextEntry = {
                  id: selectedDiary?.id || `phone-diary-user-${now}`,
                  title: diaryDraft.title.trim() || "无标题日记",
                  body: diaryDraft.body.trim(),
                  timestamp: selectedDiary?.timestamp || now,
                  hidden: selectedDiary?.hidden,
                };
                updatePhone({
                  diaryEntries: [
                    nextEntry,
                    ...currentPhone.diaryEntries.filter(
                      (entry) => entry.id !== nextEntry.id,
                    ),
                  ],
                });
                setSelectedDiaryId(nextEntry.id);
                setDiaryEditing(false);
              }}
              className="mt-3 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
            >
              保存日记
            </button>
          </div>
        ) : selectedDiary ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">{selectedDiary.title}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                {selectedDiary.body}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[10px] text-neutral-500">
                  {new Date(selectedDiary.timestamp).toLocaleString("zh-CN")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDiaryDraft({
                      title: selectedDiary.title,
                      body: selectedDiary.body,
                    });
                    setDiaryEditing(true);
                  }}
                  className="rounded-full px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                  aria-label="编辑日记"
                >
                  编辑
                </button>
              </div>
            </article>
            <button
              type="button"
              onClick={() => {
                if (!currentPhone) return;
                updatePhone({
                  diaryEntries: currentPhone.diaryEntries.filter(
                    (entry) => entry.id !== selectedDiary.id,
                  ),
                });
                setSelectedDiaryId(null);
              }}
              className="mt-4 w-full rounded-xl border border-rose-200 py-2 text-xs text-rose-500"
            >
              删除日记
            </button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-4" onScroll={handleDiaryScroll}>
            <section
              className="rounded-[1.65rem] px-5 pb-5 pt-4 text-white shadow-[0_10px_22px_rgba(0,0,0,0.14)]"
              style={{
                background: "linear-gradient(135deg, #373839 0%, #1e1f20 55%, #090a0a 100%)",
                borderRadius: "1.65rem",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="!text-white text-[clamp(1.35rem,6vw,1.65rem)] font-bold leading-tight tracking-tight">
                  {new Date().toLocaleDateString("en-US", { month: "long" })}<br />Insights
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAllDiary(true)}
                  className="pt-1 text-[10px] text-white/60 transition-colors hover:text-white"
                >
                  See All
                </button>
              </div>
              <div className="mt-9 grid grid-cols-3 divide-x divide-white/35">
                <div className="flex min-w-0 flex-col items-center gap-0.5">
                  <span className="text-[10px] text-white/65">Today</span>
                  <strong className="text-xs font-semibold text-white">{diaryTodayCount}</strong>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-0.5">
                  <span className="text-[10px] text-white/65">All</span>
                  <strong className="text-xs font-semibold text-white">{diaryAllCount}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleHidingMetricClick}
                  aria-label="连续点击五次进入隐藏日记"
                  title="连续点击五次进入隐藏日记"
                  className="flex min-w-0 flex-col items-center gap-0.5 text-white outline-none"
                >
                  <span className="text-[10px] text-white/65">Hiding</span>
                  <strong className="text-xs font-semibold text-white">{diaryHiddenCount}</strong>
                </button>
              </div>
            </section>

            <section className="mt-5 space-y-5">
              {diaryGroups.map((group) => {
                const heading = formatCharacterPhoneDiaryGroupLabel(group.timestamp);
                return (
                  <section key={group.key}>
                    <div className="flex items-center px-1">
                      <h3 className="text-lg font-bold">
                        {heading.label}, <span className="font-medium text-neutral-400">{heading.date}</span>
                      </h3>
                    </div>
                    <div className="mt-2 space-y-2">
                      {group.items.map((entry, index) => {
                        const isReflection = index % 2 === 1;
                        const moodEmoji = ["😊", "😌", "🥰", "🤔"][index % 4];
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              setSelectedDiaryId(entry.id);
                              if (currentPhone) persistPhone(withPhoneAction(currentPhone, {
                                kind: "diary_read",
                                app: "diary",
                                targetId: entry.id,
                                detail: entry.title,
                                detectability: "none",
                              }));
                            }}
                            className="w-full rounded-2xl border border-black/[0.04] bg-white p-3 text-left shadow-[0_2px_8px_rgba(44,48,52,0.05)] transition-transform active:scale-[0.99]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-2">
                                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center text-[17px] leading-none">
                                  {moodEmoji}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[9px] font-semibold tracking-[0.22em] text-neutral-400">
                                    {isReflection ? "REFLECTION" : "JOURNAL"}
                                  </p>
                                  <h4 className="truncate text-xs font-bold text-neutral-900">
                                    {entry.title || (isReflection ? "Reflection" : "Moment of Gratitude")}
                                  </h4>
                                </div>
                              </div>
                              <time className="shrink-0 pt-0.5 text-[9px] font-medium text-neutral-500">
                                {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              </time>
                            </div>
                            <p className="mt-2 line-clamp-5 whitespace-pre-line text-[11px] leading-[1.55] text-neutral-500">
                              {entry.body}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {diaryGroups.length === 0 && (
                <div className="rounded-2xl bg-white p-8 text-center text-xs text-neutral-500 shadow-sm">
                  <BookHeart className="mx-auto mb-3 opacity-40" size={38} />
                  还没有日记，写下今天的第一句话吧。
                </div>
              )}
            </section>

          </div>
        )}
        {!diaryEditing && !selectedDiary && (
          <button
            type="button"
            onClick={() => {
              setDiaryDraft({ title: "", body: "" });
              setDiaryEditing(true);
            }}
            className={`absolute bottom-5 right-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-neutral-900 text-white shadow-[0_6px_16px_rgba(15,23,42,0.2)] transition-[opacity,transform] duration-300 ease-out active:scale-95 ${isDiaryFabVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
            aria-label="新建日记"
            title="新建日记"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>
    ) : activeApp === "phone" ? (
      <CharacterPhoneCallApp
        phone={currentPhone}
        tab={phoneDialerTab}
        phoneNumber={phoneNumber}
        notice={phoneNotice}
        onTabChange={setPhoneDialerTab}
        onPhoneNumberChange={(value) => { setPhoneNumber(value); setPhoneNotice(""); }}
        onPlaceCall={placePhoneCall}
        onOpenContact={openPhoneContact}
      />
    ) : activeApp === "music" ? (
      <div className={`flex flex-col gap-[clamp(0.75rem,2.5vh,1rem)] px-1 pb-6 text-[#1d2730] ${musicView === "player" ? "h-full min-h-0 overflow-hidden pt-[clamp(0.75rem,4vh,1.25rem)]" : "min-h-full"}`}>
        {musicView === "player" ? (
          <>
            <CharacterPhoneMusicArtwork
              cover={musicTrack.cover}
              coverUrl={musicTrack.coverUrl}
              className="mx-auto aspect-square w-[clamp(150px,62vw,250px)] max-w-full rounded-[clamp(22px,7vw,28px)]"
            />
            <div className="mt-1 min-w-0 text-center">
              <h2 className="truncate text-[clamp(1.5rem,7vw,2rem)] font-semibold tracking-tight text-neutral-900">
                {musicTrack.title}
              </h2>
              <p className="mt-1 truncate text-sm text-neutral-500">{musicTrack.artist}</p>
            </div>
            <div className="mt-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={musicProgress}
                onChange={(event) => setMusicProgress(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#77adbf]"
                aria-label="播放进度"
              />
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-neutral-400">
                <span>{formatCharacterPhoneMusicElapsed(musicTrack.duration, musicProgress)}</span>
                <span>{musicTrack.duration}</span>
              </div>
            </div>
            <div className="mx-auto flex w-full max-w-[320px] items-center justify-between px-[clamp(0.75rem,4vw,1.25rem)] pt-1">
              <button
                type="button"
                onClick={() => changeMusicTrack(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-white"
                aria-label="上一首"
              >
                <SkipBack className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={toggleMusicPlayback}
                className="flex h-[clamp(3rem,12vw,3.5rem)] w-[clamp(3rem,12vw,3.5rem)] items-center justify-center rounded-full bg-[#75b4ce] text-white shadow-[0_8px_18px_rgba(86,151,177,0.25)] transition-transform active:scale-95"
                aria-label={musicIsPlaying ? "暂停播放" : "播放"}
              >
                {musicIsPlaying ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-1 h-6 w-6" fill="currentColor" />}
              </button>
              <button
                type="button"
                onClick={() => changeMusicTrack(1)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-white"
                aria-label="下一首"
              >
                <SkipForward className="h-5 w-5" />
              </button>
            </div>
          </>
        ) : musicView === "playlist" ? (
          <>
            <div className="flex items-end justify-between px-1">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-neutral-400">Your collection</p>
                <h2 className="mt-1 text-[clamp(1.7rem,8vw,2.2rem)] font-semibold tracking-tight text-neutral-950">播放列表</h2>
              </div>
              <span className="pb-1 text-xs text-neutral-400">{roleMusicTracks.length} 首歌曲</span>
            </div>
            {roleMusicTracks.length === 0 ? (
              <CharacterPhoneEvidenceEmpty
                title="暂无角色音乐"
                detail="只有角色资料或本地音乐库提供明确曲目时，音乐应用才会显示播放列表。"
              />
            ) : (
              <>
            <section className="flex items-center justify-between gap-3 rounded-[26px] bg-[#dcecf1] p-4 shadow-[0_5px_16px_rgba(48,62,72,0.05)]">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6793a0]">Mood offers</p>
                <h3 className="mt-2 text-lg font-semibold text-neutral-900">角色的日常歌单</h3>
                <p className="mt-1 text-xs text-neutral-500">适合放空和慢慢走路的时候</p>
              </div>
              <CharacterPhoneMusicArtwork cover={musicTrack.cover} coverUrl={musicTrack.coverUrl} className="h-20 w-20 shrink-0 rounded-[20px]" />
            </section>
            <div className="space-y-2">
              {roleMusicTracks.map((track, index) => {
                const isCurrentTrack = index === musicTrackIndex;
                return (
                  <div
                    key={track.id}
                    className={`flex items-center gap-3 rounded-[22px] p-2.5 ${isCurrentTrack ? "bg-[#dcecf1]" : "bg-white/75"}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMusicTrackIndex(index);
                        setMusicProgress(0.08);
                        setMusicView("player");
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <CharacterPhoneMusicArtwork cover={track.cover} coverUrl={track.coverUrl} className="h-12 w-12 shrink-0 rounded-[15px]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-neutral-800">{track.title}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-neutral-500">Original songs · {track.artist}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMusicTrackIndex(index);
                        setMusicProgress(isCurrentTrack ? musicProgress : 0.08);
                        if (isCurrentTrack) {
                          toggleMusicPlayback();
                        } else {
                          setMusicIsPlaying(true);
                          recordMusicListening(track.id);
                        }
                      }}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isCurrentTrack ? "bg-[#72b0c8] text-white" : "bg-white text-neutral-500 shadow-sm"}`}
                      aria-label={isCurrentTrack && musicIsPlaying ? `暂停${track.title}` : `播放${track.title}`}
                    >
                      {isCurrentTrack && musicIsPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
                    </button>
                  </div>
                );
              })}
            </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-end justify-between px-1">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-neutral-400">Music diary</p>
                <h2 className="mt-1 text-[clamp(1.7rem,8vw,2.2rem)] font-semibold tracking-tight text-neutral-950">音乐</h2>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 items-start gap-[clamp(0.6rem,2.5vw,0.75rem)]">
              <div className="flex w-full min-w-0 flex-col gap-[clamp(0.6rem,2.5vw,0.75rem)]">
                <section className="aspect-square w-full rounded-[clamp(20px,6vw,24px)] bg-[#e1eef2] p-[clamp(0.7rem,3vw,0.85rem)] shadow-[0_5px_16px_rgba(48,62,72,0.05)]">
                  <div className="text-[#547a88]"><h3 className="text-xs font-semibold">今日收听</h3></div>
                  <div className="mt-6 flex items-baseline gap-1 text-neutral-900">
                    <span className="text-[clamp(2.1rem,10vw,2.8rem)] font-light leading-none">{musicTodayMinutes}</span>
                    <span className="text-xs text-neutral-500">分钟</span>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/60"><span className="block h-full w-[68%] rounded-full bg-[#79afbf]" /></div>
                  <p className="mt-2 text-[10px] text-neutral-500">根据最近收听记录统计</p>
                </section>

                <section className="min-h-[clamp(12rem,50vw,13rem)] w-full rounded-[clamp(20px,6vw,24px)] bg-[#f2e3e1] p-[clamp(0.7rem,3vw,0.85rem)] shadow-[0_5px_16px_rgba(48,62,72,0.05)]" style={{ aspectRatio: "0.9 / 1" }}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-neutral-800">常听时段</h3>
                    <span className="text-[10px] text-neutral-500">一周统计</span>
                  </div>
                  <p className="mt-5 text-sm font-semibold text-neutral-900">
                    {commonListeningHour === undefined ? "暂无收听时段" : `常在 ${commonListeningPeriod}`}
                  </p>
                  <p className="mt-1 text-[10px] text-neutral-500">{commonListeningHour === undefined ? "有收听记录后会显示习惯" : "根据实际播放时长统计"}</p>
                  <div className="mt-4 flex h-14 items-end justify-between gap-1.5">
                    {[35, 48, 42, 68, 86, 72, 54].map((height, index) => (
                      <span key={index} className="flex h-full flex-1 items-end rounded-full bg-white/45"><span className="block w-full rounded-full bg-[#d48f86]" style={{ height: `${height}%` }} /></span>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[8px] text-neutral-400"><span>一</span><span>三</span><span>五</span><span>日</span></div>
                </section>
              </div>

              <div className="flex w-full min-w-0 flex-col gap-[clamp(0.6rem,2.5vw,0.75rem)]">
                <section className="min-h-[clamp(12rem,50vw,13rem)] w-full rounded-[clamp(20px,6vw,24px)] bg-[#f5ead7] p-[clamp(0.7rem,3vw,0.85rem)] shadow-[0_5px_16px_rgba(48,62,72,0.05)]" style={{ aspectRatio: "0.9 / 1" }}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-neutral-800">最近收听</h3>
                    <Clock3 className="h-4 w-4 text-[#ae9270]" />
                  </div>
                  <div className="mt-3 space-y-2">
                    {(recentMusicTracks.length > 0 ? recentMusicTracks : roleMusicTracks.slice(0, 3)).map((track, index) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => {
                          setMusicTrackIndex(Math.max(0, roleMusicTracks.findIndex((candidate) => candidate.id === track.id)));
                          setMusicProgress(0.08);
                          setMusicIsPlaying(true);
                          recordMusicListening(track.id);
                          setMusicView("player");
                        }}
                        className="flex w-full min-w-0 items-center gap-2 text-left"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-[9px] text-neutral-500">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-700">{track.title}</span>
                        <span className="text-[9px] tabular-nums text-neutral-400">{track.duration}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="flex aspect-square w-full flex-col rounded-[clamp(20px,6vw,24px)] bg-[#e8e4f1] p-[clamp(0.7rem,3vw,0.85rem)] text-center shadow-[0_5px_16px_rgba(48,62,72,0.06)]">
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
                    <button type="button" onClick={() => setMusicView("player")} className="rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[#75b4ce] focus-visible:ring-offset-2 active:scale-95" aria-label={`打开${musicTrack.title}播放页`}>
                      <CharacterPhoneMusicArtwork cover={musicTrack.cover} coverUrl={musicTrack.coverUrl} className="h-16 w-16 rounded-[18px]" />
                    </button>
                    <h3 className="mt-2 max-w-full truncate text-sm font-semibold text-neutral-900">{musicTrack.title}</h3>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-neutral-200/70 pt-2">
                    <button type="button" onClick={() => changeMusicTrack(-1)} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5" aria-label="上一首"><SkipBack className="h-4 w-4" /></button>
                    <button type="button" onClick={toggleMusicPlayback} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#75b4ce] text-white" aria-label={musicIsPlaying ? "暂停播放" : "播放"}>
                      {musicIsPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
                    </button>
                    <button type="button" onClick={() => changeMusicTrack(1)} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5" aria-label="下一首"><SkipForward className="h-4 w-4" /></button>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    ) : activeApp === "notes" ? (
      <div className="-mx-5 -mt-4 flex min-h-0 flex-1 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
        {characterNoteEditing ? (
          <div className="flex min-h-0 flex-1 flex-col bg-white p-5">
            <input
              type="text"
              placeholder="请输入标题..."
              value={characterNoteDraft.title}
              onChange={(event) => setCharacterNoteDraft({ ...characterNoteDraft, title: event.target.value })}
              className="w-full border-0 bg-transparent px-1 py-1 text-base font-extrabold text-slate-800 outline-none placeholder:text-slate-300"
            />
            <textarea
              autoFocus
              placeholder="开始输入你的笔记内容..."
              value={characterNoteDraft.content}
              onChange={(event) => setCharacterNoteDraft({ ...characterNoteDraft, content: event.target.value })}
              className="mt-3 min-h-0 flex-1 resize-none border-0 bg-transparent px-1 py-3 text-sm leading-7 text-slate-600 outline-none placeholder:text-slate-300"
            />
          </div>
        ) : (
          <>
            <div className="flex shrink-0 gap-2 border-b border-slate-100 bg-white px-4 py-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCharacterNotesTab("notes")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 transition-all ${characterNotesTab === "notes" ? "bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm" : "text-[var(--tab-inactive-text)]"}`}
              >
                <StickyNote className="h-4 w-4" />
                <span>笔记 ({characterNotes.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setCharacterNotesTab("todo")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 transition-all ${characterNotesTab === "todo" ? "bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm" : "text-[var(--tab-inactive-text)]"}`}
              >
                <ClipboardList className="h-4 w-4" />
                <span>待办 ({characterTodos.length})</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {characterNotesTab === "notes" ? (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索你的笔记..."
                      value={characterNoteQuery}
                      onChange={(event) => setCharacterNoteQuery(event.target.value)}
                      className="w-full rounded-[8px] border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs shadow-sm outline-none focus:ring-1 focus:ring-neutral-950"
                    />
                  </div>
                  <div className="space-y-2.5">
                    {filteredCharacterNotes.map((note) => (
                      <div
                        key={note.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenCharacterNote(note)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") handleOpenCharacterNote(note);
                        }}
                        className="group relative cursor-pointer rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="pr-8">
                          <h3 className="truncate text-xs font-extrabold leading-snug text-slate-800">{note.title}</h3>
                          <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-400">{note.content || "无内容"}</p>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 border-t border-slate-50 pt-2.5 text-[9px] font-bold text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(note.timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => handleDeleteCharacterNote(note.id, event)}
                          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                          title="删除笔记"
                          aria-label={`删除${note.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {filteredCharacterNotes.length === 0 && (
                      <div className="py-12 text-center text-slate-400">
                        <StickyNote className="mx-auto mb-2 h-10 w-10 opacity-30" />
                        <p className="text-xs font-semibold">{characterNoteQuery ? "未找到符合的笔记" : "还没有任何笔记，点击右上角加号创建"}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <section className="relative flex items-center justify-between overflow-hidden rounded-[10px] bg-[var(--surface)] p-4 text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    <div className="z-10 space-y-1">
                      <span className="rounded bg-[var(--badge-bg)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--badge-text)]">自律待办管家</span>
                      <h3 className="mt-1 text-sm font-extrabold">今日完成进度 {characterTodoProgress}%</h3>
                      <p className="text-[10px] text-[var(--text-secondary)]">共 {characterTodos.length} 项，已完成 {completedCharacterTodos} 项</p>
                    </div>
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
                        <circle cx="24" cy="24" r="18" stroke="var(--progress-track)" strokeWidth="3.5" fill="transparent" />
                        <circle cx="24" cy="24" r="18" stroke="var(--progress-value)" strokeWidth="3.5" fill="transparent" strokeDasharray={2 * Math.PI * 18} strokeDashoffset={2 * Math.PI * 18 * (1 - characterTodoProgress / 100)} />
                      </svg>
                      <span className="absolute text-[10px] font-black">{characterTodoProgress}%</span>
                    </div>
                  </section>
                  <div className="flex items-center justify-end">
                    {completedCharacterTodos > 0 && (
                      <button type="button" onClick={handleClearCompletedCharacterTodos} className="text-[11px] font-bold text-slate-400 transition-colors hover:text-rose-500">清除已完成</button>
                    )}
                  </div>
                  {isAddingCharacterTodo && (
                    <form onSubmit={handleAddCharacterTodo} className="space-y-2.5 rounded-[10px] bg-[var(--surface)] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">新增待办内容</span>
                        <button type="button" onClick={() => setIsAddingCharacterTodo(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="取消新增待办"><X className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="flex gap-2">
                        <input autoFocus required maxLength={30} placeholder="输入要准备的事务…" value={characterTodoText} onChange={(event) => setCharacterTodoText(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-neutral-950" />
                        <button type="submit" className="h-9 shrink-0 rounded-lg bg-neutral-950 px-3 text-[11px] font-bold text-white shadow-sm">添加</button>
                      </div>
                    </form>
                  )}
                  <div className="space-y-2">
                    {characterTodos.map((todo) => (
                      <div key={todo.id} role="button" tabIndex={0} onClick={() => handleToggleCharacterTodo(todo.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleToggleCharacterTodo(todo.id); }} className="group flex cursor-pointer items-center justify-between rounded-[10px] bg-[var(--surface)] px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-colors hover:bg-[var(--surface-muted)]">
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {todo.checked ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-[var(--success)] bg-[var(--success)] text-white"><Check className="h-3 w-3 stroke-[3px]" /></span> : <span className="h-4 w-4 shrink-0 rounded-md border-2 border-[var(--border-strong)] bg-[var(--surface)]" />}
                          <span className="min-w-0">
                            <span className={`block truncate text-base font-semibold leading-none ${todo.checked ? "text-[var(--text-secondary)] line-through" : "text-[var(--text-primary)]"}`}>{todo.text}</span>
                          </span>
                        </div>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleDeleteCharacterTodo(todo.id); }} className="shrink-0 rounded-lg p-1 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500" title="删除待办" aria-label={`删除${todo.text}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    {characterTodos.length === 0 && (
                      <div className="py-10 text-center text-slate-400"><CheckSquare className="mx-auto mb-2 h-10 w-10 opacity-30" /><p className="text-xs font-semibold">今天还没有任何待办哦，生活就要劳逸结合 🍵</p></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    ) : activeApp === "settings" ? (
      <div className="-mx-5 -mt-4 space-y-4 bg-[#fcfbfb] px-5 pb-8 pt-4">
        <section className="rounded-3xl border border-black/5 bg-white/85 p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Appearance</p>
              <h2 className="mt-1 text-base font-bold text-neutral-900">壁纸</h2>
            </div>
            <span className="text-[10px] text-neutral-400">当前角色手机</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {CHARACTER_PHONE_WALLPAPER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => updatePhone({ wallpaper: preset.value })}
                style={{ background: preset.value }}
                className={`relative h-20 overflow-hidden rounded-2xl border text-left shadow-sm transition-transform active:scale-95 ${currentPhone.wallpaper === preset.value ? "border-neutral-900 ring-2 ring-neutral-900/10" : "border-black/5"}`}
                aria-label={`使用${preset.label}壁纸`}
              >
                <span className="absolute inset-x-2 bottom-2 rounded-full bg-black/25 px-2 py-1 text-center text-[10px] font-bold text-white backdrop-blur-sm">{preset.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-3 py-2.5 text-[11px] font-bold text-neutral-600 transition-colors hover:bg-neutral-50">
              <Image className="h-4 w-4" />
              <span>上传壁纸</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleCharacterPhoneWallpaperUpload} />
            </label>
            <button
              type="button"
              onClick={() => updatePhone({ wallpaper: CHARACTER_PHONE_DEFAULT_WALLPAPER })}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[11px] font-bold text-neutral-600 transition-colors hover:bg-neutral-50"
            >
              恢复默认
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-black/5 bg-white/85 p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">App Icons</p>
            <h2 className="mt-1 text-base font-bold text-neutral-900">应用图标</h2>
            <p className="mt-1 text-[11px] leading-5 text-neutral-400">为这个角色手机上传专属图标，桌面和 Dock 会同步更新。</p>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2.5">
            {PHONE_ICON_APPS.map((appId) => {
              const customIcon = currentPhone.appIcons?.[appId];
              const tileClass = appId === "phone" || appId === "camera"
                ? PHONE_SYSTEM_APP_TILE_CLASSES[appId]
                : PHONE_APP_TILE_CLASSES[appId];
              return (
                <div key={appId} className="group flex min-w-0 flex-col items-center rounded-2xl border border-neutral-100 bg-neutral-50/70 px-1.5 py-2">
                  <label className="flex w-full cursor-pointer flex-col items-center rounded-xl transition-colors hover:bg-white/80">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-black/5 shadow-sm ${tileClass}`}>
                      {renderCharacterPhoneIcon(appId, "h-7 w-7")}
                    </span>
                    <span className="mt-1.5 w-full truncate text-center text-[10px] font-bold text-neutral-800">{APP_META[appId].label}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleCharacterPhoneAppIconUpload(appId, event)} />
                  </label>
                  <div className="mt-1 flex items-center justify-center gap-0.5">
                    <label className="cursor-pointer rounded-md px-1 py-0.5 text-[9px] font-bold text-neutral-500 transition-colors hover:bg-white hover:text-neutral-900">
                      {customIcon ? "更换" : "上传"}
                      <input type="file" accept="image/*" className="hidden" onChange={(event) => handleCharacterPhoneAppIconUpload(appId, event)} />
                    </label>
                    {customIcon && (
                      <button
                        type="button"
                        onClick={() => handleResetCharacterPhoneAppIcon(appId)}
                        className="rounded-md px-1 py-0.5 text-[9px] font-bold text-neutral-400 transition-colors hover:bg-white hover:text-rose-500"
                      >
                        默认
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-label="数据管理" className="rounded-3xl border border-rose-100 bg-white/85 p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">Data Management</p>
            <h2 className="mt-1 text-base font-bold text-neutral-900">数据管理</h2>
            <p className="mt-1 text-[11px] leading-5 text-neutral-400">清空当前角色手机里的全部记录和生成内容，不会影响密码、壁纸、应用图标与排序。</p>
          </div>
          <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50/55 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-neutral-800">{selectedCharacter?.name || "当前角色"}</p>
                <p className="mt-1 text-[10px] leading-4 text-neutral-400">聊天、朋友圈、浏览、日记、照片、音乐和生活轨迹</p>
              </div>
              <button
                type="button"
                onClick={() => void clearCurrentCharacterPhoneData()}
                disabled={!currentPhone}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="清空当前角色手机数据"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空数据
              </button>
            </div>
            {phoneDataNotice && <p role="status" className="mt-2 rounded-xl bg-white/80 px-2.5 py-2 text-[10px] leading-4 text-rose-600">{phoneDataNotice}</p>}
          </div>
        </section>
      </div>
    ) : activeApp === "camera" ? (
      <CharacterPhoneCameraApp
        phone={currentPhone}
        character={selectedCharacter}
        onSaveImage={onSaveImageToCharacterPhone}
        onCreateTextImage={handleCharacterPhoneTextImageCreate}
        onOpenGallery={() => openApp("gallery")}
      />
    ) : null;
  const desktopBackground = resolveDesktopBackground({
    resolvedTheme,
    wallpaper: settings?.wallpaper,
    wallpaperSource: settings?.wallpaperSource,
  });
  const storedPhoneWallpaper = currentPhone.wallpaper?.trim();
  const phoneWallpaper = storedPhoneWallpaper && !LEGACY_CHARACTER_PHONE_WALLPAPERS.has(storedPhoneWallpaper)
    ? storedPhoneWallpaper
    : CHARACTER_PHONE_DEFAULT_WALLPAPER;
  const phoneBackground = phoneWallpaper.startsWith("linear-gradient")
    ? phoneWallpaper
    : `url(${phoneWallpaper}) center/cover no-repeat`;
  const isBrowserDetail = activeApp === "browser" && Boolean(selectedBrowserEntry && selectedBrowserDetail);
  const isBrowserHome = activeApp === "browser" && !isBrowserDetail;
  const isGalleryDetail = activeApp === "gallery" && Boolean(selectedGallery);
  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden text-neutral-900"
      style={{ background: phoneBackground }}
    >
        {!unlocked ? (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-7 pt-5 text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(126,135,166,0.38),transparent_40%),linear-gradient(160deg,rgba(3,22,48,0.88),rgba(17,18,39,0.94)_52%,rgba(2,18,40,0.96))]" aria-hidden="true" />
            <label className="relative mt-1 flex cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white/95 shadow-lg backdrop-blur-md">
              <Users className="h-4 w-4" />
              <span>选择人物</span>
              <span className="max-w-[92px] truncate text-white/65">{selectedCharacter.name}</span>
              <select
                aria-label="选择人物"
                value={selectedCharacter.id}
                onChange={(event) => selectCharacter(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </select>
            </label>

            <div className="relative mt-10 flex w-full flex-col items-center">
              <p className="text-[2.15rem] font-light tracking-[0.08em] text-white/95">输入密码</p>
              <div className="mt-5 flex items-center gap-5" aria-label={`已输入 ${input.length} 位密码`}>
                {[0, 1, 2, 3].map((index) => (
                  <span key={index} className={`h-4 w-4 rounded-full border-2 ${index < input.length ? "border-white bg-white" : "border-white/90 bg-transparent"}`} />
                ))}
              </div>
              <input
                aria-label="角色手机密码"
                value={input}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, "").slice(0, 4);
                  setInput(next);
                  setNotice("");
                  if (next.length === 4) void verifyPasscode(next);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void verifyPasscode();
                }}
                inputMode="numeric"
                type="password"
                className="pointer-events-none absolute h-px w-px opacity-0"
              />
            </div>

            <div className="relative mt-10 grid w-full max-w-[280px] grid-cols-3 gap-x-7 gap-y-4">
              {CHARACTER_PHONE_UNLOCK_PAD.map(([digit, letters]) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => appendUnlockDigit(digit)}
                  aria-label={`输入${digit}`}
                  className={`flex aspect-square w-full flex-col items-center justify-center rounded-full bg-white/15 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] transition-colors hover:bg-white/25 active:bg-white/30 ${digit === "0" ? "col-start-2" : ""}`}
                >
                  <span className="text-[2.75rem] font-light leading-none">{digit}</span>
                  {letters && <span className="mt-1 text-[9px] font-semibold tracking-[0.18em] text-white/90">{letters}</span>}
                </button>
              ))}
              <button
                type="button"
                onClick={removeUnlockDigit}
                aria-label="删除密码"
                className="absolute -bottom-1 -right-2 flex h-10 w-10 items-center justify-center rounded-full text-xs text-white/80 hover:bg-white/10"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>

            <div className="relative mt-auto flex w-full items-center justify-between px-1 pt-8 text-[1.05rem] text-white/95">
              <button type="button" onClick={openForgotPasswordChat} className="rounded-lg px-2 py-1 hover:bg-white/10" aria-label="忘记密码，打开对应角色聊天">
                忘记密码
              </button>
              <button type="button" onClick={closeCharacterPhone} className="rounded-lg px-2 py-1 hover:bg-white/10" aria-label="取消并返回桌面">
                取消
              </button>
            </div>
            {notice && (
              <p role="status" className="relative mt-2 text-center text-xs text-rose-200">{notice}</p>
            )}
          </div>
        ) : activeApp === "home" ? (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-4">
            <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-1 text-neutral-700">
              <button
                type="button"
                onClick={closeCharacterPhone}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5"
                aria-label="关闭角色手机"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void generateCharacterPhoneContent()}
                disabled={isAdvancing}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 disabled:cursor-wait disabled:opacity-70"
                aria-label="生成角色手机内容"
                title="生成角色手机内容"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isAdvancing ? "animate-spin" : ""}`} />
              </button>
            </div>

            {phoneNotice && (
              <p role="status" className="mx-1 mb-1 rounded-xl bg-white/80 px-3 py-2 text-center text-xs text-neutral-600 shadow-sm">
                {phoneNotice}
              </p>
            )}

            <main
              className={`min-h-0 flex-1 px-1 pb-3 pt-2 touch-pan-y ${desktopPage === 1 ? "overflow-hidden" : "overflow-y-auto"}`}
              onPointerDown={(event) => {
                desktopSwipeStartRef.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={(event) => {
                const start = desktopSwipeStartRef.current;
                desktopSwipeStartRef.current = null;
                if (!start) return;
                const deltaX = event.clientX - start.x;
                const deltaY = event.clientY - start.y;
                if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
                setDesktopPage(deltaX < 0 ? 1 : 0);
              }}
              onPointerCancel={() => { desktopSwipeStartRef.current = null; }}
            >
              {desktopPage === 0 ? (
                <>
                  <section
                    aria-label="双时间小组件"
                    className="rounded-[26px] border border-black/5 bg-white/88 px-4 py-5 shadow-[0_4px_14px_rgba(15,23,42,0.06)] backdrop-blur-xl"
                  >
                    <div className="grid grid-cols-2 divide-x divide-neutral-400/45">
                      {[phoneCharacterLocation, phoneUserLocation].map((location, index) => (
                        <div key={`${location.label}-${location.timeZone}`} className={`${index === 0 ? "pr-3" : "pl-3"}`}>
                          <p className="text-center text-[2.15rem] font-light leading-none tracking-[-0.08em] text-neutral-950">
                            {formatCharacterPhoneTime(clockNow, location.timeZone)}
                          </p>
                          <p className="mt-2 text-center text-xs font-bold text-neutral-800">
                            {formatCharacterPhoneDate(clockNow, location.timeZone)}
                          </p>
                          <p className="mt-2 flex items-center justify-center gap-1 truncate text-[11px] text-neutral-700">
                            {index === 0 ? <MapPin className="h-3.5 w-3.5 shrink-0" /> : <Home className="h-3.5 w-3.5 shrink-0" />}
                            <span className="truncate">{location.label}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="mt-8 grid grid-cols-4 gap-x-2 gap-y-7">
                    {PHONE_DESKTOP_APPS.map((appId) => (
                      <button
                        key={appId}
                        type="button"
                        onClick={() => openApp(appId)}
                        className="group flex min-w-0 flex-col items-center gap-1.5 text-neutral-700"
                        aria-label={`打开${APP_META[appId].label}`}
                      >
                        <span className={`relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] border border-black/5 shadow-[0_4px_10px_rgba(15,23,42,0.08)] transition-transform group-active:scale-90 ${PHONE_APP_TILE_CLASSES[appId]}`}>
                          {renderCharacterPhoneIcon(appId, "h-9 w-9")}
                          {appId === "chat" && unreadCount > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                              {unreadCount}
                            </span>
                          )}
                        </span>
                        <span className="max-w-[76px] truncate text-[11px] font-medium">{APP_META[appId].label}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <section
                  aria-label="最近生活轨迹"
                  className="flex h-full min-h-0 flex-col rounded-[26px] border border-black/5 bg-white/78 px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] backdrop-blur-xl"
                >
                  <div className="flex shrink-0 items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">Life trace</p>
                      <h2 className="mt-1 text-sm font-bold text-neutral-900">最近生活轨迹</h2>
                    </div>
                    <span className="text-[10px] text-neutral-400">{currentPhone.lifeEvents?.length ?? 0} 个事件</span>
                  </div>
                  {(currentPhone.lifeEvents ?? []).length > 0 ? (
                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                      <div className="space-y-2">
                        {(currentPhone.lifeEvents ?? []).slice().sort((left, right) => right.generatedAt - left.generatedAt).map((event) => (
                          <div key={event.id} className="rounded-2xl bg-neutral-50 px-3 py-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 flex-1 text-xs font-semibold leading-5 text-neutral-800">{event.summary}</p>
                              <span className="shrink-0 text-[10px] text-neutral-400">{formatTime(event.generatedAt)}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {event.artifactRefs.map((artifact) => (
                                <button key={`${event.id}-${artifact.app}-${artifact.id}`} type="button" onClick={() => openApp(artifact.app === "phone" || artifact.app === "camera" ? artifact.app : artifact.app)} className="rounded-full bg-white px-2 py-1 text-[9px] font-semibold text-neutral-500 shadow-sm hover:text-neutral-900">
                                  {APP_META[artifact.app].label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex min-h-0 flex-1 items-center justify-center">
                      <p className="w-full rounded-2xl border border-dashed border-neutral-200 px-3 py-3 text-center text-[11px] leading-5 text-neutral-400">生成后，这里会把同一件生活事件在聊天、浏览器、日记等应用里的痕迹串起来。</p>
                    </div>
                  )}
                </section>
              )}
            </main>

            <div className="flex shrink-0 items-center justify-center gap-2 pb-2 pt-1" aria-label="桌面页码">
              {[0, 1].map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setDesktopPage(page as 0 | 1)}
                  className={`h-1.5 w-1.5 rounded-full shadow-sm transition-colors ${desktopPage === page ? "bg-white" : "bg-white/45"}`}
                  aria-label={`第${page + 1}页桌面`}
                  aria-current={desktopPage === page ? "page" : undefined}
                />
              ))}
            </div>

            <nav className="grid shrink-0 grid-cols-4 items-center justify-items-center gap-3 rounded-[26px] border border-black/5 bg-white/65 px-3 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.06)] backdrop-blur-xl" aria-label="Dock">
              {PHONE_DOCK_APPS.map((appId) => {
                const isSystemApp = appId === "phone" || appId === "camera";
                const tileClass = isSystemApp ? PHONE_SYSTEM_APP_TILE_CLASSES[appId] : PHONE_APP_TILE_CLASSES[appId];
                return (
                  <button
                    key={appId}
                    type="button"
                    onClick={() => openApp(appId)}
                    className="group relative flex h-16 w-16 items-center justify-center transition-transform group-active:scale-90"
                    aria-label={`打开${APP_META[appId].label}`}
                  >
                    <span className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] border border-black/5 shadow-[0_3px_8px_rgba(15,23,42,0.07)] ${tileClass}`}>
                      {renderCharacterPhoneIcon(appId, "h-9 w-9")}
                    </span>
                    {appId === "chat" && unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        ) : activeApp === "chat" ? (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fcfbfb]">
            {appContent}
          </div>
        ) : (
          <div className={`relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden ${activeApp === "phone" || activeApp === "browser" || activeApp === "schedule" ? "bg-white" : activeApp === "chat" || activeApp === "gallery" ? "bg-[#fcfbfb]" : "bg-white/70 backdrop-blur-xl"}`}>
            {!isBrowserDetail && !isGalleryDetail && <div className={isBrowserHome
              ? "relative z-20 box-border flex h-16 min-h-16 max-h-16 shrink-0 items-center justify-between border-b-0 bg-transparent px-4 py-1.5 text-neutral-900"
              : `relative box-border flex h-16 min-h-16 max-h-16 shrink-0 items-center justify-between px-4 py-1.5 text-neutral-900 ${activeApp === "schedule" ? "bg-white border-b-0" : activeApp === "phone" || activeApp === "browser" || activeApp === "chat" || activeApp === "gallery" ? "bg-transparent border-b-0" : "border-b border-black/5"}`}
            >
              <button
                type="button"
                onClick={() => {
                  if (activeApp === "notes" && characterNoteEditing) {
                    setCharacterNoteEditing(false);
                    setSelectedCharacterNoteId(null);
                    return;
                  }
                  if (activeApp === "diary" && selectedDiary) {
                    setSelectedDiaryId(null);
                    return;
                  }
                  if (activeApp === "gallery") lockHiddenGallery();
                  setActiveApp("home");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-black/5"
                aria-label={activeApp === "diary" && selectedDiary ? "返回日记页" : "返回桌面"}
                title={activeApp === "diary" && selectedDiary ? "返回日记页" : "返回桌面"}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className={isBrowserHome ? "sr-only" : "absolute left-1/2 -translate-x-1/2 text-sm font-bold"}>
                {activeApp === "phone"
                  ? "拨号"
                  : activeApp === "notes" && characterNoteEditing
                    ? selectedCharacterNoteId ? "编辑笔记" : "新建笔记"
                    : APP_META[activeApp].label}
              </h1>
              {activeApp === "schedule" ? (
                <button
                  type="button"
                  onClick={() => setScheduleTodaySignal((signal) => signal + 1)}
                  className="h-8 min-w-8 px-1 text-xs font-medium normal-case tracking-[0.08em] text-neutral-400"
                >
                  Today
                </button>
              ) : activeApp === "notes" ? (
                <button
                  type="button"
                  onClick={characterNoteEditing
                    ? handleSaveCharacterNote
                    : characterNotesTab === "notes"
                      ? () => handleOpenCharacterNote()
                      : () => setIsAddingCharacterTodo(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:bg-black/5"
                  aria-label={characterNoteEditing ? "保存笔记" : characterNotesTab === "notes" ? "新建笔记" : "新建待办"}
                >
                  {characterNoteEditing ? <Save className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
                </button>
              ) : (
                <span className="h-8 w-8" aria-hidden="true" />
              )}
            </div>}
            <main className={`min-h-0 flex-1 ${isGalleryDetail ? "px-0" : "px-5"} ${activeApp === "schedule" ? "character-phone-schedule-main" : ""} ${activeApp === "diary" || activeApp === "notes" || activeApp === "camera" ? "pb-0" : "pb-6"} text-neutral-900 ${isBrowserDetail ? "character-phone-browser-detail-main overflow-y-auto pt-0" : activeApp === "schedule" || activeApp === "phone" || activeApp === "chat" || activeApp === "gallery" || activeApp === "camera" ? "flex flex-col overflow-hidden pt-0" : activeApp === "diary" || activeApp === "notes" ? "relative flex min-h-0 flex-col overflow-hidden pt-0" : activeApp === "music" && musicView === "player" ? "flex min-h-0 flex-col overflow-hidden pt-4" : "overflow-y-auto pt-4"}`}>
              {appContent}
            </main>
            {activeApp === "music" && (
              <nav className="relative z-20 mx-5 mb-3 box-border grid h-16 min-h-16 max-h-16 shrink-0 grid-cols-3 gap-1 rounded-[clamp(20px,6vw,24px)] border border-white/90 bg-white/90 p-1.5 shadow-[0_8px_22px_rgba(48,62,72,0.12)] backdrop-blur-xl" aria-label="音乐应用导航">
                {([
                  { id: "home" as const, label: "首页", icon: Home },
                  { id: "playlist" as const, label: "播放列表", icon: ListMusic },
                  { id: "player" as const, label: "播放页", icon: Music2 },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMusicView(id)}
                    className={`flex h-12 min-h-0 w-full shrink-0 flex-col items-center justify-center gap-0.5 rounded-[clamp(15px,4vw,18px)] text-[clamp(0.58rem,2.5vw,0.65rem)] font-medium leading-none transition-colors ${musicView === id ? "bg-[#dcecf1] text-[#4f8ca1]" : "text-neutral-400 hover:bg-black/5"}`}
                    aria-current={musicView === id ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="leading-[14px]">{label}</span>
                  </button>
                ))}
              </nav>
            )}
          </div>
        )}
    </div>
  );
}
