import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Eye,
  ListFilter,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Settings2,
  Sparkles,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import type { Character, Message, OfflineStory, UserIdentity, UserSettings, WorldBookEntry } from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../domain/character/characterIdentity";
import { createId } from "../core/id/createId";
import { apiChat } from "../utils/apiHelper";
import { API_REQUEST_TIMEOUTS } from "../utils/fetchWithTimeout";
import {
  loadNowObservationThreads,
  saveNowObservationThreads,
  subscribeNowObservationState,
} from "../features/now/nowObservationService";
import { enforceNowContinuity, getNowActionLabel, normalizeSingleMomentContent } from "../domain/now/nowContinuity";
import type { NowActionType, NowContinuityMode, NowObservationThread, NowScene } from "../domain/now/nowTypes";
import { AppHeader } from "./ui/AppHeader";
import { IconButton } from "./ui/IconButton";
import "./now.css";

interface AppNowProps {
  activeIdentity: UserIdentity;
  characters: Character[];
  relationships: CharacterRelationship[];
  messages: Message[];
  offlineStories?: OfflineStory[];
  worldBookEntries?: WorldBookEntry[];
  settings: UserSettings;
  visible?: boolean;
  onClose: () => void;
}

type LengthPreset = "standard" | "immersive";
type TimelineFilter = "all" | "today" | "yesterday";
type AutoIntervalSeconds = 30 | 60 | 600;

const MAX_SCENES_PER_THREAD = 60;
const DEFAULT_DURATION_MINUTES = 35;
const AUTO_SCENE_ADVANCE_MINUTES: Record<AutoIntervalSeconds, number> = {
  30: 5,
  60: 10,
  600: 30,
};

const formatAutoInterval = (seconds: AutoIntervalSeconds): string => (
  seconds === 600 ? "10 分钟" : `${seconds} 秒`
);

const cleanText = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text || fallback;
};

const stripCodeFence = (value: string): string => value
  .replace(/^```(?:json|text)?\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim();

const formatSceneDate = (timestamp: number): string => new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
}).format(timestamp);

const formatClock = (timestamp: number): string => new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
}).format(timestamp);

const formatCameraTimestamp = (timestamp: number): string => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(timestamp).replace(/\//g, "-");

const isSameDay = (left: number, right: number): boolean => {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const isYesterday = (timestamp: number, now = Date.now()): boolean => {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(timestamp, yesterday.getTime());
};

const parseActionType = (value: unknown, fallback: NowActionType): NowActionType => (
  value === "moving" || value === "still" || value === "transition" || value === "out-of-view" ? value : fallback
);

const parseContinuityMode = (value: unknown, fallback: NowContinuityMode): NowContinuityMode => (
  value === "continue" || value === "no-change" || value === "transition" ? value : fallback
);

const parseVisibleChanges = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5)
  : [];

const formatDuration = (minutes: number): string => minutes < 60
  ? `${Math.max(1, Math.round(minutes))} 分钟`
  : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ""}`;

const avatarIsImage = (avatar: string): boolean => /^(https?:|data:image|blob:|\/)/i.test(avatar);

const fallbackScene = (character: Character, previous?: NowScene): {
  content: string;
  location: string;
  environment: string;
  durationMinutes: number;
  actionType: NowActionType;
  continuityMode: NowContinuityMode;
  actionSummary: string;
  cameraLabel: string;
  visibleChanges: string[];
  transitionReason?: string;
} => {
  const name = character.remark || character.name;
  if (!previous) {
    return {
      content: `${name}停留在室内靠近桌边的位置。手机被放在手边，屏幕亮起过几次，又被一只手慢慢按灭。\n\n他低头整理桌上的物品，把一支笔和一本册子并排放好，随后停在原地，手指在桌面边缘轻轻敲了一下。\n\n镜头里的动作很少，室内的光线保持稳定，人物没有离开画面。`,
      location: "室内某处",
      environment: "灯光偏暗 · 周围安静",
      durationMinutes: DEFAULT_DURATION_MINUTES,
      actionType: "moving",
      continuityMode: "continue",
      actionSummary: "在桌边整理物品",
      cameraLabel: "室内固定机位",
      visibleChanges: ["手机屏幕亮起后熄灭", "桌面物品被重新摆放"],
    };
  }
  return {
    content: `${name}仍在${previous.location}。他保持上一段记录里的姿势，没有离开镜头范围。\n\n桌面上的物品位置没有明显改变，手机屏幕处于熄灭状态。窗外的光线缓慢移动，短暂照亮桌沿和他的手背。\n\n除此之外，画面里没有新的明显动作。`,
    location: previous.location,
    environment: previous.environment,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    actionType: previous.actionType || "still",
    continuityMode: "no-change",
    actionSummary: previous.actionSummary || "保持当前动作",
    cameraLabel: previous.cameraLabel || "固定机位",
    visibleChanges: ["人物位置未变化", "光线出现轻微变化"],
  };
};

const parseGeneratedScene = (raw: string, character: Character, previous?: NowScene) => {
  const fallback = fallbackScene(character, previous);
  const text = stripCodeFence(raw);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.content === "string" && parsed.content.trim()) {
      const duration = typeof parsed.durationMinutes === "number" && Number.isFinite(parsed.durationMinutes)
        ? Math.min(180, Math.max(10, Math.round(parsed.durationMinutes)))
        : DEFAULT_DURATION_MINUTES;
      const candidate = enforceNowContinuity(previous, {
        actionType: parseActionType(parsed.actionType, previous?.actionType || "moving"),
        continuityMode: parseContinuityMode(parsed.continuityMode, previous ? "continue" : "transition"),
        actionSummary: cleanText(parsed.actionSummary, previous?.actionSummary || "有人活动"),
        visibleChanges: parseVisibleChanges(parsed.visibleChanges),
        transitionReason: cleanText(parsed.transitionReason, ""),
      });
      if (previous && candidate.continuityMode === "no-change" && parsed.continuityMode === "transition" && !candidate.transitionReason) {
        return fallback;
      }
      return {
        content: normalizeSingleMomentContent(parsed.content),
        location: cleanText(parsed.location, previous?.location || "室内某处"),
        environment: cleanText(parsed.environment, previous?.environment || "周围安静"),
        durationMinutes: duration,
        actionType: candidate.actionType,
        continuityMode: candidate.continuityMode,
        actionSummary: candidate.actionSummary,
        cameraLabel: cleanText(parsed.cameraLabel, previous?.cameraLabel || "固定机位"),
        visibleChanges: candidate.visibleChanges,
        transitionReason: candidate.transitionReason,
      };
    }
  } catch {
    // Providers occasionally return prose despite the structured-output request.
  }
  return fallback;
};

const getRelevantWorldBook = (
  entries: readonly WorldBookEntry[],
  characterId: string,
): string => entries
  .filter((entry) => entry.isActive !== false)
  .filter((entry) => !entry.characterId || entry.characterId === "global" || entry.characterId === characterId || entry.characterIds?.includes(characterId))
  .slice(-12)
  .map((entry) => `${entry.title}: ${entry.content}`)
  .join("\n");

export default function AppNow({
  activeIdentity,
  characters,
  relationships,
  messages,
  offlineStories = [],
  worldBookEntries = [],
  settings,
  visible = true,
  onClose,
}: AppNowProps) {
  const [threads, setThreads] = useState<NowObservationThread[]>(() => loadNowObservationThreads().value);
  const threadsRef = useRef(threads);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoObserve, setAutoObserve] = useState(false);
  const [autoIntervalSeconds, setAutoIntervalSeconds] = useState<AutoIntervalSeconds>(30);
  const [lengthPreset, setLengthPreset] = useState<LengthPreset>("standard");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [showSettings, setShowSettings] = useState(false);
  const [showNewSceneHint, setShowNewSceneHint] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoTimerRef = useRef<number | null>(null);
  const autoCharacterIdRef = useRef<string | null>(null);
  const backgroundAutoRunsRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const hasScrolledDownRef = useRef(false);

  useEffect(() => {
    threadsRef.current = threads;
    saveNowObservationThreads(threads);
  }, [threads]);

  useEffect(() => subscribeNowObservationState(() => {
    const loaded = loadNowObservationThreads().value;
    setThreads((current) => {
      if (JSON.stringify(current) === JSON.stringify(loaded)) return current;
      threadsRef.current = loaded;
      return loaded;
    });
  }), []);

  useEffect(() => () => {
    if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
  }, []);

  const availableCharacters = useMemo(() => characters
    .filter((character) => !character.isGroupChat && !character.isContactInstance)
    .filter((character) => !character.ownerIdentityId || character.ownerIdentityId === activeIdentity.id)
    .sort((left, right) => Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned))), [characters, activeIdentity.id]);

  const selectedCharacter = selectedCharacterId
    ? availableCharacters.find((character) => character.id === selectedCharacterId) || characters.find((character) => character.id === selectedCharacterId)
    : undefined;
  const selectedThread = selectedCharacter
    ? threads.find((thread) => thread.ownerIdentityId === activeIdentity.id && thread.characterId === selectedCharacter.id)
    : undefined;
  const selectedScenes = selectedThread?.scenes || [];
  const latestScene = selectedScenes[selectedScenes.length - 1];
  const getOfflineStoryForCharacter = (characterId?: string): OfflineStory | undefined => offlineStories
    .filter((story) => !story.ownerIdentityId || story.ownerIdentityId === activeIdentity.id)
    .filter((story) => story.characterId === characterId || story.characterIds?.includes(characterId || ""))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];

  const filteredScenes = selectedScenes.filter((scene) => {
    if (timelineFilter === "today") return isSameDay(scene.storyAt, Date.now());
    if (timelineFilter === "yesterday") return isYesterday(scene.storyAt);
    return true;
  });

  const getLatestChatMessage = (characterId: string): Message | undefined => {
    const canonicalId = resolveCanonicalCharacterId(characterId, characters);
    return messages
      .filter((message) => resolveCanonicalCharacterId(message.characterId, characters) === canonicalId)
      .sort((left, right) => right.timestamp - left.timestamp)[0];
  };

  const ensureThread = (characterId: string): NowObservationThread => {
    const existing = threadsRef.current.find((thread) => thread.ownerIdentityId === activeIdentity.id && thread.characterId === characterId);
    if (existing) return existing;
    const latestChatAt = getLatestChatMessage(characterId)?.timestamp || 0;
    const latestOfflineAt = offlineStories
      .filter((story) => (!story.ownerIdentityId || story.ownerIdentityId === activeIdentity.id) && (story.characterId === characterId || story.characterIds?.includes(characterId)))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.updatedAt || 0;
    const timestamp = Math.max(latestChatAt, latestOfflineAt) || Date.now();
    return {
      id: createId("now-thread"),
      ownerIdentityId: activeIdentity.id,
      characterId,
      storyAt: timestamp,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scenes: [],
    };
  };

  const persistThreads = (next: NowObservationThread[]) => {
    threadsRef.current = next;
    setThreads(next);
  };

  const isNearBottom = () => {
    const viewport = scrollRef.current;
    if (!viewport) return true;
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 72;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    setShowNewSceneHint(false);
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleReaderScroll = () => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const scrollTop = Math.max(0, viewport.scrollTop);
    const delta = scrollTop - lastScrollTopRef.current;

    if (scrollTop <= 4) {
      hasScrolledDownRef.current = false;
      setShowBackToTop(false);
    } else {
      if (delta > 1) hasScrolledDownRef.current = true;
      if (hasScrolledDownRef.current && delta < -1) setShowBackToTop(true);
    }

    lastScrollTopRef.current = scrollTop;
    if (isNearBottom()) setShowNewSceneHint(false);
  };

  const generateScene = async (
    character: Character,
    suppliedThread?: NowObservationThread,
    options: { storyAdvanceMinutes?: number; background?: boolean } = {},
  ) => {
    if (isGenerating) return;
    const currentThread = suppliedThread || threadsRef.current.find((thread) => thread.ownerIdentityId === activeIdentity.id && thread.characterId === character.id) || ensureThread(character.id);
    const previous = currentThread.scenes[currentThread.scenes.length - 1];
    const latestChat = getLatestChatMessage(character.id);
    const relation = relationships.find((candidate) => candidate.userIdentityId === activeIdentity.id && resolveCanonicalCharacterId(candidate.characterId, characters) === resolveCanonicalCharacterId(character.id, characters));
    const shouldStick = isNearBottom();
    setIsGenerating(true);
    setError(null);
    try {
      let generated = fallbackScene(character, previous);
      let source: NowScene["source"] = "local-fallback";
      if (settings.apiKey?.trim()) {
        const recentScenes = currentThread.scenes.slice(-4).map((scene) => `观察片段（${formatSceneDate(scene.storyAt)}，${getNowActionLabel(scene)}）：${scene.content}`).join("\n\n");
        const recentChat = messages
          .filter((message) => resolveCanonicalCharacterId(message.characterId, characters) === resolveCanonicalCharacterId(character.id, characters))
          .sort((left, right) => left.timestamp - right.timestamp)
          .slice(-8)
          .map((message) => `${message.sender === "user" ? activeIdentity.name : character.name}：${message.content}`)
          .join("\n");
        const worldBook = getRelevantWorldBook(worldBookEntries, character.id);
        const offlineStory = getOfflineStoryForCharacter(character.id);
        const offlineContext = offlineStory
          ? `当前线下剧情：${offlineStory.title}\n最近线下记录：${offlineStory.messages.slice(-3).map((message) => message.content).join("\n")}`
          : "";
        const response = await apiChat({
          message: [
            `角色人设：\n${character.personality || "未提供"}\n${character.backstory || ""}`,
            relation ? `当前关系标签：${relation.relationship}` : "当前关系：未知",
            worldBook ? `世界书参考：\n${worldBook}` : "",
            offlineContext,
            recentChat ? `最近聊天（只作为生活锚点，不要复述聊天记录）：\n${recentChat}` : "",
            recentScenes ? `此前观察片段（不要重复，不要预测未来）：\n${recentScenes}` : "",
            previous ? `上一个观察时刻：${formatSceneDate(previous.storyAt)}，地点：${previous.location}，动作：${previous.actionSummary || "未标注"}。除非有明确可见证据，不要改变这个动作。` : "这是第一次观察。",
            `请生成一段${lengthPreset === "immersive" ? "1800-2600" : "800-1500"}字的监控式生活观察记录。本次只记录一个固定观察时刻，正文只能发生在“当前观察时刻”，不能写成时间轴、回放或连续剧。严禁在正文中出现两个或更多时钟时间、时间范围、日期跳转，也不要写“过了几分钟/几小时”“随后到了……”等时间推进；不要用多个带时间标题的段落。你是有限视角的固定机位观察者，不是全知叙述者。只描写这一刻镜头中看得见的动作、姿势、物品互动、空间关系和光线状态，不写心理活动、内心独白、作者解释或下一步预测。若上一条记录没有自然结束，必须保持原动作；如果画面没有明显变化，就明确写“画面无明显变化”，不要为了生成新记录而让角色换地点或开始新活动。内容要详细、有空间感，但所有细节必须属于同一时刻。durationMinutes 只表示这一画面预计可以保持到下一次观察，不要把这段时长写进正文。请只返回 JSON，不要 Markdown：{"content":"只描述当前单一时刻可见动作的详细正文，不要写时间标题","actionType":"moving|still|transition|out-of-view","continuityMode":"continue|no-change|transition","actionSummary":"一句话动作标签","visibleChanges":["可见变化"],"transitionReason":"只有自然转场时填写","location":"当下地点","cameraLabel":"虚构机位名称","environment":"可观察的环境氛围","durationMinutes":8}`,
          ].filter(Boolean).join("\n\n"),
          history: [],
          systemInstruction: "只输出合规 JSON。正文只能是固定机位能观察到的动作和画面变化，不得出现心理活动、未来预测、行动计划、下一步提示或作者解释。自动观察不等于推动角色行动；没有可见变化时必须保持原状态。",
          apiKey: settings.apiKey,
          model: settings.selectedModel,
          apiEndpoint: settings.apiEndpoint,
          // Detailed observation JSON can legitimately take longer than a short chat reply.
          // Keep this aligned with the shared provider timeout so a valid configured model
          // is not mistaken for an unavailable API after 12 seconds.
          timeoutMs: API_REQUEST_TIMEOUTS.textGeneration,
          apiTemperature: settings.apiTemperature ?? 0.86,
          streamCompatible: settings.streamCompatible,
          maxOutputTokens: lengthPreset === "immersive" ? 3000 : 1800,
          purpose: "character_now_generate",
          scenario: "character-now",
          characterId: character.id,
          relationId: relation?.id,
          conversationId: relation?.conversationId,
          contextItems: ["角色人设", "世界书", "聊天结束锚点", "线下剧情状态", "此前观察片段"],
        });
        generated = parseGeneratedScene(response.text, character, previous);
        source = "ai";
      }
      const now = Date.now();
      const advanceMinutes = options.storyAdvanceMinutes ?? generated.durationMinutes;
      const scene: NowScene = {
        id: createId("now-scene"),
        threadId: currentThread.id,
        ownerIdentityId: activeIdentity.id,
        characterId: character.id,
        storyAt: (currentThread.storyAt || latestChat?.timestamp || now) + (previous ? advanceMinutes : 0) * 60 * 1000,
        durationMinutes: advanceMinutes,
        location: generated.location,
        environment: generated.environment,
        content: generated.content,
        source,
        createdAt: now,
        actionType: generated.actionType,
        continuityMode: generated.continuityMode,
        actionSummary: generated.actionSummary,
        cameraLabel: generated.cameraLabel,
        visibleChanges: generated.visibleChanges,
        ...(generated.transitionReason ? { transitionReason: generated.transitionReason } : {}),
        ...(previous ? { previousSceneId: previous.id } : {}),
      };
      const nextThread: NowObservationThread = {
        ...currentThread,
        storyAt: scene.storyAt,
        updatedAt: now,
        scenes: [...currentThread.scenes, scene].slice(-MAX_SCENES_PER_THREAD),
      };
      const nextThreads = [...threadsRef.current.filter((thread) => thread.id !== nextThread.id), nextThread];
      persistThreads(nextThreads);
      if (shouldStick) window.setTimeout(() => scrollToBottom(), 40);
      else setShowNewSceneHint(true);
    } catch (generationError) {
      console.warn("此刻生成失败，已保留本地观察片段。", generationError);
      const generated = fallbackScene(character, previous);
      const now = Date.now();
      const advanceMinutes = options.storyAdvanceMinutes ?? generated.durationMinutes;
      const scene: NowScene = {
        id: createId("now-scene"),
        threadId: currentThread.id,
        ownerIdentityId: activeIdentity.id,
        characterId: character.id,
        storyAt: (currentThread.storyAt || now) + (previous ? advanceMinutes : 0) * 60 * 1000,
        durationMinutes: advanceMinutes,
        location: generated.location,
        environment: generated.environment,
        content: generated.content,
        source: "local-fallback",
        createdAt: now,
        actionType: generated.actionType,
        continuityMode: generated.continuityMode,
        actionSummary: generated.actionSummary,
        cameraLabel: generated.cameraLabel,
        visibleChanges: generated.visibleChanges,
        ...(previous ? { previousSceneId: previous.id } : {}),
      };
      const nextThread = { ...currentThread, storyAt: scene.storyAt, updatedAt: now, scenes: [...currentThread.scenes, scene].slice(-MAX_SCENES_PER_THREAD) };
      persistThreads([...threadsRef.current.filter((thread) => thread.id !== nextThread.id), nextThread]);
      setError("暂时无法连接生成服务，已显示一段本地观察片段。你可以稍后继续观察。 ");
      if (shouldStick) window.setTimeout(() => scrollToBottom(), 40);
      else setShowNewSceneHint(true);
    } finally {
      setIsGenerating(false);
      if (options.background && autoCharacterIdRef.current === character.id) {
        backgroundAutoRunsRef.current += 1;
        if (backgroundAutoRunsRef.current >= 3) {
          backgroundAutoRunsRef.current = 0;
          autoCharacterIdRef.current = null;
          setAutoObserve((current) => current ? false : current);
        }
      }
    }
  };

  const openCharacter = (character: Character) => {
    const existing = threadsRef.current.find((thread) => thread.ownerIdentityId === activeIdentity.id && thread.characterId === character.id);
    const thread = existing || ensureThread(character.id);
    if (!existing) persistThreads([...threadsRef.current, thread]);
    if (!autoObserve) {
      autoCharacterIdRef.current = character.id;
      backgroundAutoRunsRef.current = 0;
    }
    lastScrollTopRef.current = 0;
    hasScrolledDownRef.current = false;
    setShowBackToTop(false);
    setSelectedCharacterId(character.id);
    setError(null);
    if (thread.scenes.length === 0) void generateScene(character, thread);
  };

  const closeDetail = () => {
    setSelectedCharacterId(null);
    setError(null);
    setShowSettings(false);
    setShowNewSceneHint(false);
    setShowBackToTop(false);
    lastScrollTopRef.current = 0;
    hasScrolledDownRef.current = false;
  };

  const deleteSelectedThread = () => {
    if (!selectedThread) return;
    if (autoCharacterIdRef.current === selectedThread.characterId) {
      autoCharacterIdRef.current = null;
      backgroundAutoRunsRef.current = 0;
      setAutoObserve(false);
    }
    persistThreads(threadsRef.current.filter((thread) => thread.id !== selectedThread.id));
    closeDetail();
  };

  const toggleAutoObserve = () => {
    setAutoObserve((current) => {
      const next = !current;
      if (next) {
        const targetId = selectedCharacter?.id || autoCharacterIdRef.current;
        if (!targetId) return current;
        autoCharacterIdRef.current = targetId;
        backgroundAutoRunsRef.current = 0;
      } else {
        autoCharacterIdRef.current = null;
        backgroundAutoRunsRef.current = 0;
      }
      return next;
    });
  };

  useEffect(() => {
    if (visible && selectedCharacterId && selectedCharacterId === autoCharacterIdRef.current) {
      backgroundAutoRunsRef.current = 0;
    }
  }, [selectedCharacterId, visible]);

  useEffect(() => {
    if (!autoObserve || isGenerating || !autoCharacterIdRef.current) return;
    const target = characters.find((character) => character.id === autoCharacterIdRef.current);
    if (!target) return;
    const isBackground = !visible || selectedCharacterId !== autoCharacterIdRef.current;
    autoTimerRef.current = window.setTimeout(() => void generateScene(target, undefined, {
      storyAdvanceMinutes: AUTO_SCENE_ADVANCE_MINUTES[autoIntervalSeconds],
      background: isBackground,
    }), autoIntervalSeconds * 1000);
    return () => {
      if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
    };
  }, [autoObserve, autoIntervalSeconds, characters, isGenerating, selectedCharacterId, threads, visible]);

  const renderAvatar = (character: Character, className: string) => avatarIsImage(character.avatar)
    ? <img src={character.avatar} alt="" className={`${className} object-cover`} />
    : <span className={`${className} grid place-items-center bg-[color-mix(in_srgb,var(--now-accent)_18%,var(--surface))] text-[var(--now-accent)] text-xl`}>{character.avatar || character.name.slice(0, 1)}</span>;

  if (selectedCharacter) {
    return (
      <div className="now-app" data-theme-page="now">
        <AppHeader
          className="now-header"
          title={selectedCharacter.remark || selectedCharacter.name}
          subtitle="此刻 · 观察中"
          left={<IconButton aria-label="返回此刻角色列表" icon={<ArrowLeft size={20} />} onClick={closeDetail} />}
          right={<IconButton aria-label="打开此刻设置" icon={<MoreHorizontal size={20} />} onClick={() => setShowSettings(true)} />}
        />
        <main ref={scrollRef} className="now-reader" onScroll={handleReaderScroll}>
          <section className="now-monitor-panel" aria-label="观察监控画面">
            <div className="now-monitor-viewport">
              <div className="now-monitor-noise" aria-hidden="true" />
              <div className="now-monitor-topline">
                <span className={`now-live-pill ${autoObserve ? "is-live" : ""}`}><Radio size={12} aria-hidden="true" />{autoObserve ? "观察中" : "回放"}</span>
                <span className="now-monitor-top-context">
                  <time dateTime={latestScene ? new Date(latestScene.storyAt).toISOString() : undefined}>
                    {latestScene ? formatCameraTimestamp(latestScene.storyAt) : "----/--/-- --:--:--"}
                  </time>
                  <span>{latestScene?.location || "地点未明"}</span>
                </span>
              </div>
              <div className="now-monitor-caption">
                <span>{latestScene ? getNowActionLabel(latestScene) : "等待信号"}</span>
                <strong>{latestScene?.actionSummary || (latestScene ? getNowActionLabel(latestScene) : "尚未开始观察")}</strong>
                <p>{latestScene?.content.replace(/\s+/g, " ").slice(0, 118) || "选择下方的继续观察，查看角色此刻正在发生的动作。"}{latestScene && latestScene.content.length > 118 ? "……" : ""}</p>
              </div>
              <div className="now-monitor-controls">
                <button type="button" disabled={isGenerating} aria-label="刷新画面" onClick={() => void generateScene(selectedCharacter)}>
                  <RefreshCw size={15} className={isGenerating ? "animate-spin" : ""} />刷新画面
                </button>
                <button type="button" aria-label="实时观察" aria-pressed={autoObserve} onClick={toggleAutoObserve}>
                  {autoObserve ? <Pause size={15} /> : <Play size={15} />}实时观察
                </button>
                <button type="button" aria-label="跳转最新" onClick={() => scrollToBottom("auto")}><ArrowDownToLine size={15} />跳转最新</button>
              </div>
            </div>
          </section>
          <div className="now-filter-row" aria-label="观察记录筛选">
            <button type="button" className={timelineFilter === "today" ? "is-selected" : ""} onClick={() => setTimelineFilter("today")}><CalendarDays size={14} />今天</button>
            <button type="button" className={timelineFilter === "yesterday" ? "is-selected" : ""} onClick={() => setTimelineFilter("yesterday")}><ChevronDown size={14} />昨天</button>
            <button type="button" className={timelineFilter === "all" ? "is-selected" : ""} onClick={() => setTimelineFilter("all")}><ListFilter size={14} />全部记录</button>
          </div>
          {selectedScenes.length === 0 && !isGenerating && (
            <div className="now-empty-detail">
              {renderAvatar(selectedCharacter, "now-empty-avatar")}
              <h2>还没有被看见的片段</h2>
              <p>从聊天结束之后开始。你看到的只会是这一刻偶然露出的部分。</p>
              <button type="button" className="now-primary-action" onClick={() => void generateScene(selectedCharacter)}><Sparkles size={17} />开始观察</button>
            </div>
          )}
          <section className="now-timeline" aria-label="观察时间线">
            <div className="now-timeline-heading"><div><span className="now-eyebrow">TIMELINE</span><h2>画面记录</h2></div><span>{filteredScenes.length} 条记录</span></div>
            <div className="now-timeline-list">
            {filteredScenes.map((scene, index) => (
              <article className="now-scene" key={scene.id} data-state={scene.continuityMode || "continue"}>
                <div className="now-scene-rail"><span className="now-scene-marker"><CircleDot size={13} /></span><span className="now-scene-line" aria-hidden="true" /></div>
                <div className="now-scene-body">
                  <div className="now-scene-kicker"><span>{index === 0 && timelineFilter === "all" ? "第一次看见" : formatClock(scene.storyAt)}</span><span className="now-scene-duration">持续 {formatDuration(scene.durationMinutes)}</span></div>
                  <div className="now-scene-label"><strong>{scene.actionSummary || getNowActionLabel(scene)}</strong><span>{getNowActionLabel(scene)}</span></div>
                  <p>{scene.content}</p>
                  {scene.visibleChanges && scene.visibleChanges.length > 0 && <div className="now-visible-changes"><span>画面变化</span>{scene.visibleChanges.map((change) => <em key={change}>{change}</em>)}</div>}
                </div>
              </article>
            ))}
            {isGenerating && (
              <div className="now-generating" role="status" aria-live="polite"><span className="now-pulse-dot" />正在观察这一刻……</div>
            )}
            {error && <p className="now-error" role="status">{error}</p>}
            <div ref={bottomRef} className="h-2" />
            </div>
          </section>
        </main>
        <button
          type="button"
          className={`now-back-to-top ${showBackToTop ? "is-visible" : ""}`}
          aria-label="回到顶部"
          aria-hidden={!showBackToTop}
          tabIndex={showBackToTop ? 0 : -1}
          onClick={scrollToTop}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
        {showNewSceneHint && <button type="button" className="now-new-scene-hint" onClick={() => scrollToBottom()}>新的观察片段 <ChevronRight size={15} /></button>}
        {showSettings && (
          <div className="now-sheet-backdrop" role="presentation" onClick={() => setShowSettings(false)}>
            <section className="now-settings-sheet" role="dialog" aria-modal="true" aria-label="此刻设置" onClick={(event) => event.stopPropagation()}>
              <div className="now-sheet-heading"><div><span className="now-eyebrow">OBSERVATION</span><h2>观察设置</h2></div><IconButton aria-label="关闭设置" icon={<X size={18} />} onClick={() => setShowSettings(false)} /></div>
              <div className="now-setting-row"><div><strong>生成长度</strong><span>影响每次观察片段的篇幅</span></div><label className="now-select-wrap"><select aria-label="生成长度" value={lengthPreset} onChange={(event) => setLengthPreset(event.target.value as LengthPreset)}><option value="standard">标准（800–1500字）</option><option value="immersive">沉浸（1800–2600字）</option></select><ChevronDown size={15} aria-hidden="true" /></label></div>
              <div className="now-setting-row"><div><strong>自动观察间隔</strong><span>只刷新观察记录，不强制改变角色行为</span></div><label className="now-select-wrap"><select aria-label="自动观察间隔" value={autoIntervalSeconds} onChange={(event) => setAutoIntervalSeconds(Number(event.target.value) as AutoIntervalSeconds)}><option value={30}>30 秒（角色推进 5 分钟）</option><option value={60}>60 秒（角色推进 10 分钟）</option><option value={600}>10 分钟（角色推进 30 分钟）</option></select><ChevronDown size={15} aria-hidden="true" /></label></div>
              <div className="now-setting-note"><TimerReset size={15} /><span>当前状态：{autoObserve ? `观察中 · 每 ${formatAutoInterval(autoIntervalSeconds)} 检查，角色推进约 ${AUTO_SCENE_ADVANCE_MINUTES[autoIntervalSeconds]} 分钟` : "已暂停 · 不会后台生成"}</span></div>
              <button type="button" className="now-danger-row" onClick={deleteSelectedThread}><Trash2 size={17} /><span>删除这个角色的观察记录</span><ChevronRight size={16} /></button>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="now-app" data-theme-page="now">
      <AppHeader
        className="now-header"
        title="此刻"
        subtitle="偶然看见角色生活的一小段"
        left={<IconButton aria-label="返回桌面" icon={<ArrowLeft size={20} />} onClick={onClose} />}
        right={<IconButton aria-label="此刻应用设置" icon={<Settings2 size={19} />} onClick={() => setShowSettings(true)} />}
      />
      <main className="now-home-scroll">
        <section className="now-home-intro">
          <span className="now-eyebrow">A QUIET WINDOW</span>
          <h1>你想看见谁的此刻？</h1>
          <p>聊天结束以后，生活并不会停在那里。选择一个角色，偶尔看见他正在经历的片段。</p>
        </section>
        {availableCharacters.length === 0 ? (
          <div className="now-empty-home"><Eye size={30} /><h2>还没有可观察的角色</h2><p>先在档案馆创建一个角色，再回来打开这扇窗口。</p></div>
        ) : (
          <section className="now-character-list" aria-label="选择角色">
            {availableCharacters.map((character) => {
              const thread = threads.find((item) => item.ownerIdentityId === activeIdentity.id && item.characterId === character.id);
              const scene = thread?.scenes[thread.scenes.length - 1];
              return (
                <button type="button" className="now-character-card" key={character.id} onClick={() => openCharacter(character)}>
                  {renderAvatar(character, "now-character-avatar")}
                  <span className="now-character-copy"><strong>{character.remark || character.name}</strong><span>{scene ? `${formatClock(scene.storyAt)} · ${scene.location}` : "还没有开始观察"}</span>{scene && <em>{scene.content.replace(/\s+/g, " ").slice(0, 42)}{scene.content.length > 42 ? "……" : ""}</em>}</span>
                  <ChevronRight size={18} className="now-card-chevron" />
                </button>
              );
            })}
          </section>
        )}
      </main>
      {showSettings && (
        <div className="now-sheet-backdrop" role="presentation" onClick={() => setShowSettings(false)}>
          <section className="now-settings-sheet" role="dialog" aria-modal="true" aria-label="此刻应用设置" onClick={(event) => event.stopPropagation()}>
            <div className="now-sheet-heading"><div><span className="now-eyebrow">OBSERVATION</span><h2>此刻设置</h2></div><IconButton aria-label="关闭设置" icon={<X size={18} />} onClick={() => setShowSettings(false)} /></div>
            <p className="now-settings-note">观察记录按当前人设和角色独立保存，不会自动写入聊天记忆。</p>
            <button type="button" className="now-setting-row now-about-row" onClick={() => setShowSettings(false)}><div><strong>观察方式</strong><span>有限视角 · 保留未知 · 不预测未来</span></div><ChevronRight size={17} /></button>
          </section>
        </div>
      )}
    </div>
  );
}
