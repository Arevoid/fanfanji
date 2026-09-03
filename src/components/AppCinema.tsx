import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, Film, Save, Send, Settings as SettingsIcon, Trash2, Upload, Users, X } from "lucide-react";
import { createId } from "../core/id/createId";
import { cinemaAssetDb } from "../core/storage/cinemaAssetDb";
import { initializeCinemaStore, loadCinemaStore, saveCinemaStore } from "../core/storage/repositories/cinemaRepository";
import { apiChat } from "../utils/apiHelper";
import { getConversationId, type CharacterRelationship } from "../domain/relationship/characterRelationship";
import type { CinemaCue, CinemaDiscussion, CinemaMedia, CinemaStore, CinemaWatchRoom } from "../domain/cinema/types";
import type { Character, MemoryItem, UserSettings } from "../types";
import { getSubtitleContext, parseSubtitleText, formatSubtitleTime } from "../features/cinema/subtitleParser";
import { createManualKnowledgeClaim } from "../features/characterKnowledge/services/manualKnowledgeService";
import { appendMany as appendKnowledgeClaims } from "../core/storage/repositories/characterKnowledgeRepository";
import type { KnowledgeClaim } from "../domain/characterKnowledge/characterKnowledgeTypes";
import { commitMemoryWriteBundle } from "../domain/memory/memoryWriteCoordinator";

interface AppCinemaProps {
  userIdentityId: string;
  settings?: UserSettings;
  characters?: Character[];
  relationships?: CharacterRelationship[];
  memories?: MemoryItem[];
  onSaveMemories?: (memories: MemoryItem[]) => void;
  onClose: () => void;
}

const AUTO_REACTION_INTERVAL_MS = 15 * 60_000;
const LONG_VIDEO_PLOT_SUMMARY_INTERVAL_MS = 30 * 60_000;

function getVideoPlaybackError(video: HTMLVideoElement): string {
  switch (video.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "视频读取被中断，请重新选择文件";
    case MediaError.MEDIA_ERR_NETWORK:
      return "视频读取失败，请检查文件是否完整";
    case MediaError.MEDIA_ERR_DECODE:
      return "视频编码无法播放，请转换为 H.264 MP4 后重试";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "视频格式或编码不受当前浏览器支持，请转换为 H.264 MP4 后重试";
    default:
      return "视频无法播放，请确认文件完整且编码受浏览器支持";
  }
}

function validateVideoPlayback(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      callback();
    };
    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("视频读取超时，请确认文件完整后重试")));
    }, 15_000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        finish(() => reject(new Error("视频没有可识别的播放时长，请转换为兼容格式后重试")));
        return;
      }
      finish(() => resolve(Math.round(video.duration * 1000)));
    };
    video.onerror = () => {
      finish(() => reject(new Error(getVideoPlaybackError(video))));
    };
    video.src = objectUrl;
    video.load();
  });
}

function cleanCharacterReply(text: string): string {
  return text
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[【\[][^】\]]*[】\]]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function relationCharacter(relations: CharacterRelationship[], characters: Character[], relationId: string): Character | undefined {
  const relation = relations.find((item) => item.id === relationId);
  return relation ? characters.find((character) => character.id === relation.characterId) : undefined;
}

function mergeStore(current: CinemaStore, update: Partial<CinemaStore>): CinemaStore {
  return { ...current, ...update, schemaVersion: 1 };
}

export default function AppCinema({
  userIdentityId,
  settings,
  characters = [],
  relationships = [],
  memories = [],
  onSaveMemories,
  onClose,
}: AppCinemaProps) {
  const [store, setStore] = useState<CinemaStore>(() => initializeCinemaStore());
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<CinemaCue[]>([]);
  const [positionMs, setPositionMs] = useState(0);
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [mediaSettingsOpen, setMediaSettingsOpen] = useState(false);
  const [mediaTitleDraft, setMediaTitleDraft] = useState("");
  const [mediaSynopsisDraft, setMediaSynopsisDraft] = useState("");
  const [mediaAuxiliaryInfoDraft, setMediaAuxiliaryInfoDraft] = useState("");
  const [autoReactionEnabled, setAutoReactionEnabled] = useState(true);
  const [plotContinuityEnabled, setPlotContinuityEnabled] = useState(false);
  const [plotSummaryLoading, setPlotSummaryLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const lastAutoReactionPositionRef = useRef(0);
  const generateReplyRef = useRef<(userText: string, automatic?: boolean) => Promise<void>>();
  const storeRef = useRef(store);
  storeRef.current = store;

  const scopedMedia = useMemo(
    () => store.media.filter((media) => media.ownerIdentityId === userIdentityId),
    [store.media, userIdentityId],
  );
  const scopedRooms = useMemo(
    () => store.rooms.filter((room) => room.userIdentityId === userIdentityId),
    [store.rooms, userIdentityId],
  );
  const selectedMedia = scopedMedia.find((media) => media.id === selectedMediaId);
  const selectedRoom = scopedRooms.find((room) => room.id === selectedRoomId);
  const selectedCharacter = selectedRoom ? relationCharacter(relationships, characters, selectedRoom.relationId) : undefined;
  const selectedDiscussions = selectedRoom
    ? store.discussions.filter((discussion) => discussion.roomId === selectedRoom.id).sort((a, b) => a.createdAt - b.createdAt)
    : [];
  const scopedRelations = relationships.filter((relation) => relation.userIdentityId === userIdentityId);
  const currentSubtitle = getSubtitleContext(subtitleCues, positionMs, 1);
  const watchedSubtitleContext = subtitleCues
    .filter((cue) => cue.endMs <= positionMs)
    .slice(-30)
    .map((cue) => cue.text)
    .join("\n");

  useEffect(() => {
    setAutoReactionEnabled(selectedRoom?.autoReactionEnabled ?? true);
    setPlotContinuityEnabled(selectedRoom?.plotContinuityEnabled ?? false);
  }, [selectedRoom?.id, selectedRoom?.autoReactionEnabled, selectedRoom?.plotContinuityEnabled]);

  useEffect(() => {
    if (!notice || videoProcessing) return;
    const timer = window.setTimeout(() => setNotice(null), 2_000);
    return () => window.clearTimeout(timer);
  }, [notice, videoProcessing]);

  useEffect(() => {
    setMediaTitleDraft(selectedMedia?.title || "");
    setMediaSynopsisDraft(selectedMedia?.synopsis || "");
    setMediaAuxiliaryInfoDraft(selectedMedia?.auxiliaryInfo || "");
  }, [selectedMedia?.id, selectedMedia?.title, selectedMedia?.synopsis, selectedMedia?.auxiliaryInfo]);

  useEffect(() => {
    const loaded = loadCinemaStore();
    setStore(loaded);
  }, []);

  useEffect(() => {
    if (!selectedMedia?.video.assetId) {
      setVideoUrl(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    cinemaAssetDb.load(selectedMedia.video.assetId).then((asset) => {
      if (!active || !asset) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setVideoUrl(objectUrl);
      setPositionMs(selectedRoom?.positionMs || selectedMedia.lastPositionMs || 0);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "视频无法打开"));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setVideoUrl(null);
      setSubtitleCues([]);
    };
  }, [selectedMedia?.id, selectedMedia?.video.assetId, selectedRoom?.id]);

  useEffect(() => {
    if (!selectedMedia?.subtitle?.assetId) {
      setSubtitleCues([]);
      return;
    }
    let active = true;
    cinemaAssetDb.load(selectedMedia.subtitle.assetId).then(async (asset) => {
      if (!active || !asset) return;
      const text = await asset.blob.text();
      setSubtitleCues(parseSubtitleText(text, selectedMedia.subtitleFormat || "srt"));
    }).catch(() => setSubtitleCues([]));
    return () => { active = false; };
  }, [selectedMedia?.id, selectedMedia?.subtitle?.assetId, selectedMedia?.subtitleFormat]);

  const persistStore = (next: CinemaStore) => {
    if (!saveCinemaStore(next)) {
      setNotice("影视数据保存失败，原有数据未覆盖");
      return false;
    }
    storeRef.current = next;
    setStore(next);
    return true;
  };

  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    const extension = file?.name.match(/\.([^.]+)$/)?.[1].toLowerCase();
    const extensionMimeTypes: Record<string, string> = {
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      m4v: "video/mp4",
      ogv: "video/ogg",
    };
    const mimeType = file?.type.startsWith("video/") ? file.type : (extension ? extensionMimeTypes[extension] : undefined);
    if (!file || !mimeType) {
      input.value = "";
      setNotice("无法识别该视频格式，请选择 MP4、WebM、MOV、M4V 或 OGV 文件");
      return;
    }
    const mediaId = createId("cinema-media");
    const assetId = createId("cinema-video");
    setVideoProcessing(true);
    setNotice("正在处理视频，请稍候…");
    try {
      const durationMs = await validateVideoPlayback(file);
      await cinemaAssetDb.save({ assetId, kind: "video", blob: file });
      const media: CinemaMedia = {
        id: mediaId,
        ownerIdentityId: userIdentityId,
        title: file.name.replace(/\.[^.]+$/, "") || "未命名影视",
        mimeType: mimeType || "video/mp4",
        durationMs,
        video: { assetId, kind: "video", mimeType: mimeType || "video/mp4", byteLength: file.size },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastPositionMs: 0,
        watchedUntilMs: 0,
      };
      const next = mergeStore(storeRef.current, { media: [media, ...storeRef.current.media] });
      if (persistStore(next)) {
        setSelectedMediaId(media.id);
        setMediaTitleDraft(media.title);
        setNotice("视频已加入影视库");
      }
    } catch (error) {
      await cinemaAssetDb.delete(assetId).catch(() => undefined);
      setNotice(error instanceof Error ? error.message : "视频导入失败，请稍后重试");
    } finally {
      setVideoProcessing(false);
      // Android browsers may revoke the File reference if the input is cleared
      // before the asynchronous IndexedDB read has finished.
      input.value = "";
    }
  };

  const handleLoadedMetadata = () => {
    if (!selectedMedia || !videoRef.current || selectedMedia.durationMs > 0) return;
    const durationMs = Math.round(videoRef.current.duration * 1000);
    const nextMedia = { ...selectedMedia, durationMs, updatedAt: Date.now() };
    persistStore(mergeStore(storeRef.current, { media: storeRef.current.media.map((media) => media.id === nextMedia.id ? nextMedia : media) }));
  };

  const persistPosition = (nextPositionMs: number) => {
    if (!selectedMedia) return;
    const watchedUntilMs = Math.max(selectedMedia.watchedUntilMs, nextPositionMs);
    const media = { ...selectedMedia, lastPositionMs: nextPositionMs, watchedUntilMs, updatedAt: Date.now() };
    const rooms = selectedRoom
      ? storeRef.current.rooms.map((room) => room.id === selectedRoom.id ? { ...room, positionMs: nextPositionMs, watchedUntilMs, updatedAt: Date.now() } : room)
      : storeRef.current.rooms;
    persistStore(mergeStore(storeRef.current, {
      media: storeRef.current.media.map((item) => item.id === media.id ? media : item),
      rooms,
    }));
  };

  const handleSubtitleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file || !selectedMedia) {
      input.value = "";
      return;
    }
    const format = /\.vtt$/i.test(file.name) ? "vtt" : /\.srt$/i.test(file.name) ? "srt" : null;
    if (!format) {
      input.value = "";
      setNotice("字幕仅支持 .srt 或 .vtt 文件");
      return;
    }
    const assetId = createId("cinema-subtitle");
    try {
      await cinemaAssetDb.save({ assetId, kind: "subtitle", blob: file });
      const subtitle = { assetId, kind: "subtitle" as const, mimeType: file.type || "text/plain", byteLength: file.size };
      const nextMedia = { ...selectedMedia, subtitle, subtitleFormat: format, updatedAt: Date.now() };
      if (persistStore(mergeStore(storeRef.current, { media: storeRef.current.media.map((media) => media.id === nextMedia.id ? nextMedia : media) }))) {
        setNotice("字幕已导入");
      }
    } catch (error) {
      await cinemaAssetDb.delete(assetId).catch(() => undefined);
      setNotice(error instanceof Error ? error.message : "字幕导入失败");
    } finally {
      input.value = "";
    }
  };

  const createRoom = (relation: CharacterRelationship) => {
    if (!selectedMedia) return;
    const existingRoom = scopedRooms.find((room) => room.mediaId === selectedMedia.id && room.relationId === relation.id);
    if (existingRoom) {
      setSelectedRoomId(existingRoom.id);
      setAutoReactionEnabled(existingRoom.autoReactionEnabled);
      setPlotContinuityEnabled(existingRoom.plotContinuityEnabled ?? false);
      setRoomPickerOpen(false);
      return;
    }
    const room: CinemaWatchRoom = {
      id: createId("cinema-room"),
      userIdentityId,
      relationId: relation.id,
      characterId: relation.characterId,
      conversationId: relation.conversationId || getConversationId(relation.id),
      mediaId: selectedMedia.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      positionMs: selectedMedia.lastPositionMs,
      watchedUntilMs: selectedMedia.watchedUntilMs,
      autoReactionEnabled: true,
      plotContinuityEnabled: false,
    };
    if (persistStore(mergeStore(storeRef.current, { rooms: [room, ...storeRef.current.rooms] }))) {
      setSelectedRoomId(room.id);
      setAutoReactionEnabled(true);
      setRoomPickerOpen(false);
    }
  };

  const saveMediaSettings = () => {
    if (!selectedMedia) return;
    const title = mediaTitleDraft.trim() || selectedMedia.title || "未命名影视";
    const nextMedia = {
      ...selectedMedia,
      title,
      synopsis: mediaSynopsisDraft.trim() || undefined,
      auxiliaryInfo: mediaAuxiliaryInfoDraft.trim() || undefined,
      updatedAt: Date.now(),
    };
    if (persistStore(mergeStore(storeRef.current, { media: storeRef.current.media.map((media) => media.id === nextMedia.id ? nextMedia : media) }))) {
      setMediaSettingsOpen(false);
      setNotice("影视辅助信息已保存");
    }
  };

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    const canvas = frameRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    setFrameDataUrl(dataUrl);
    return dataUrl;
  };

  const generatePlotSummary = async () => {
    if (!selectedRoom || !selectedMedia || !selectedCharacter || !settings?.apiKey || plotSummaryLoading) return;
    setPlotSummaryLoading(true);
    try {
      const frame = currentSubtitle ? undefined : captureFrame();
      const response = await apiChat({
        message: `请只根据用户已经播放到的内容，更新一份不超过120字的剧情摘要。不要猜测未播放内容，不要写角色动作括号。\n影视：${selectedMedia.title}\n片名辅助信息：${selectedMedia.synopsis || "无"}\n其他辅助信息：${selectedMedia.auxiliaryInfo || "无"}\n播放到：${formatSubtitleTime(positionMs)}\n已有摘要：${selectedRoom.plotSummary || "无"}\n最近字幕：${watchedSubtitleContext || "无字幕"}\n最近讨论：${selectedDiscussions.slice(-4).map((item) => `${item.userText} / ${item.characterText || ""}`).join("\n") || "无"}`,
        history: [],
        systemInstruction: "你是观影进度摘要器，只整理已播放内容，输出简短纯文本摘要。",
        apiKey: settings.apiKey,
        model: settings.selectedModel,
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: 0.2,
        imageDataUrl: frame || undefined,
      });
      const nextSummary = cleanCharacterReply(response.text);
      persistStore(mergeStore(storeRef.current, { rooms: storeRef.current.rooms.map((room) => room.id === selectedRoom.id ? { ...room, plotSummary: nextSummary, lastPlotSummaryAt: positionMs, updatedAt: Date.now() } : room) }));
    } catch (error) {
      setNotice(error instanceof Error ? `剧情摘要失败：${error.message}` : "剧情摘要失败");
    } finally {
      setPlotSummaryLoading(false);
    }
  };

  const generateReply = async (userText: string, automatic = false, requestReply = true) => {
    if (!selectedRoom || !selectedMedia || !selectedCharacter || (requestReply && !settings?.apiKey)) {
      if (!settings?.apiKey) setNotice("请先在设置中配置 API Key");
      return;
    }
    const trimmedUserText = userText.trim();
    if (!automatic && !trimmedUserText) return;
    const discussionId = createId("cinema-discussion");
    const initialDiscussion: CinemaDiscussion = {
      id: discussionId,
      roomId: selectedRoom.id,
      mediaId: selectedMedia.id,
      userIdentityId,
      relationId: selectedRoom.relationId,
      characterId: selectedRoom.characterId,
      conversationId: selectedRoom.conversationId,
      positionMs,
      userText: automatic ? "（角色主动反应）" : trimmedUserText,
      subtitleContext: currentSubtitle || undefined,
      createdAt: Date.now(),
    };
    if (!persistStore(mergeStore(storeRef.current, { discussions: [...storeRef.current.discussions, initialDiscussion] }))) return;
    setDiscussionDraft("");
    if (automatic) lastAutoReactionPositionRef.current = positionMs;
    if (!requestReply) return;
    setReplyLoading(true);
    try {
      const effectiveFrameDataUrl = frameDataUrl || (!currentSubtitle ? captureFrame() : undefined);
      const prompt = `你正在和用户一起观看影视《${selectedMedia.title}》。你扮演${selectedCharacter.name}，只能知道用户已经看到的内容。\n片名辅助信息：${selectedMedia.synopsis || "无"}\n其他辅助信息：${selectedMedia.auxiliaryInfo || "无"}\n当前播放时间：${formatSubtitleTime(positionMs)}。\n当前字幕：${currentSubtitle || "暂无字幕"}\n已播放剧情摘要：${selectedRoom.plotSummary || "未开启剧情摘要"}\n${effectiveFrameDataUrl ? "当前视频画面已附加，请优先识别画面中的主体、动作、场景和可见文字，只讨论当前画面，不要凭空猜测后续剧情。" : "当前使用字幕和观影摘要，不发送视频画面。"}\n${automatic ? "这是一次低频观影反应，请只用一句自然、符合角色性格的短回应，不要抢夺用户注意力。" : `用户说：${userText.trim()}`}\n只输出角色实际说的话，不要括号动作、舞台说明或旁白。`;
      const response = await apiChat({
        message: prompt,
        history: selectedDiscussions.slice(-8).flatMap((discussion) => [
          { role: "user", text: discussion.userText },
          ...(discussion.characterText ? [{ role: "model", text: discussion.characterText }] : []),
        ]),
        systemInstruction: "这是关系隔离的影视观影讨论。影视内容不是现实关系事实，除非用户明确保存，否则不要写入长期记忆。保持角色卡、人设和关系边界优先。",
        apiKey: settings.apiKey,
        model: settings.selectedModel,
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
        streamCompatible: settings.streamCompatible,
        imageDataUrl: effectiveFrameDataUrl || undefined,
      });
      const characterText = cleanCharacterReply(response.text);
      persistStore(mergeStore(storeRef.current, { discussions: storeRef.current.discussions.map((discussion) => discussion.id === discussionId ? { ...discussion, characterText } : discussion) }));
      setFrameDataUrl(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "观影讨论生成失败";
      setNotice(/image_url|视觉|vision|messages\[\d+\]/i.test(message)
        ? "当前 API 或模型不支持画面识别，请切换到支持视觉输入的模型或接口。"
        : `观影讨论失败：${message}`);
    } finally {
      setReplyLoading(false);
    }
  };

  const sendDiscussionOnly = () => {
    if (!discussionDraft.trim() || replyLoading) return;
    void generateReply(discussionDraft, false, false);
  };

  generateReplyRef.current = generateReply;

  useEffect(() => {
    if (!selectedRoom || !autoReactionEnabled || !selectedMedia || !videoRef.current) return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || replyLoading || !selectedRoom) return;
      const current = Math.round(video.currentTime * 1000);
      if (current < AUTO_REACTION_INTERVAL_MS || current - lastAutoReactionPositionRef.current < AUTO_REACTION_INTERVAL_MS) return;
      lastAutoReactionPositionRef.current = current;
      void generateReplyRef.current?.("", true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [selectedRoom?.id, selectedMedia?.id, autoReactionEnabled]);

  useEffect(() => {
    if (!selectedRoom || !selectedMedia || !plotContinuityEnabled || !videoRef.current) return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || plotSummaryLoading || !selectedRoom || !Number.isFinite(video.duration)) return;
      const current = Math.round(video.currentTime * 1000);
      const duration = Math.round(video.duration * 1000);
      const lastSummaryAt = selectedRoom.lastPlotSummaryAt || 0;
      const nextCheckpoint = duration <= LONG_VIDEO_PLOT_SUMMARY_INTERVAL_MS
        ? [duration / 3, duration * 2 / 3, duration * 0.9].find((checkpoint) => checkpoint > lastSummaryAt)
        : Math.max(LONG_VIDEO_PLOT_SUMMARY_INTERVAL_MS, (Math.floor(lastSummaryAt / LONG_VIDEO_PLOT_SUMMARY_INTERVAL_MS) + 1) * LONG_VIDEO_PLOT_SUMMARY_INTERVAL_MS);
      if (nextCheckpoint !== undefined && nextCheckpoint < duration && current >= nextCheckpoint) void generatePlotSummary();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [selectedRoom?.id, selectedMedia?.id, plotContinuityEnabled, selectedRoom?.lastPlotSummaryAt, plotSummaryLoading]);

  const saveDiscussionToMemory = async (discussion: CinemaDiscussion) => {
    const relation = scopedRelations.find((item) => item.id === discussion.relationId);
    if (!relation || !onSaveMemories) return;
    const statement = `与用户一起观看《${selectedMedia?.title || "影视"}》时，在 ${formatSubtitleTime(discussion.positionMs)} 讨论：${discussion.userText}；角色回应：${discussion.characterText || ""}`.slice(0, 1000);
    const claim = createManualKnowledgeClaim({
      id: createId("claim-cinema"),
      scope: { relationId: relation.id, characterId: relation.characterId, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId },
      sourceApp: "cinema",
      statement,
      sourceRecordId: discussion.id,
      recordedAt: Date.now(),
    });
    if (!claim) {
      setNotice("观影记忆保存失败");
      return;
    }
    const memory: MemoryItem = {
      id: createId("memory-cinema"),
      characterId: relation.characterId,
      relationId: relation.id,
      userIdentityId: relation.userIdentityId,
      conversationId: relation.conversationId,
      sourceCinemaId: selectedMedia?.id,
      content: statement,
      timestamp: Date.now(),
      importance: 4,
      isManual: true,
      sourceKnowledgeClaimIds: [claim.id],
    };
    const write = await commitMemoryWriteBundle({
      claims: [claim],
      memories: [memory, ...memories],
      appendClaims: appendKnowledgeClaims,
      saveMemories: (nextMemories) => {
        onSaveMemories([...nextMemories]);
        return true;
      },
    });
    if (!write.complete) {
      setNotice("观影记忆保存失败，已保护当前关系认知");
      return;
    }
    persistStore(mergeStore(storeRef.current, { discussions: storeRef.current.discussions.map((item) => item.id === discussion.id ? { ...item, savedToMemory: true } : item) }));
    setNotice("已保存为当前关系的观影记忆");
  };

  const archiveDiscussionsBeforeDelete = async (media: CinemaMedia, rooms: CinemaWatchRoom[], discussions: CinemaDiscussion[]) => {
    if (!onSaveMemories || !discussions.length) return true;
    const claims: KnowledgeClaim[] = [];
    const newMemories: MemoryItem[] = [];
    for (const room of rooms) {
      const relation = scopedRelations.find((item) => item.id === room.relationId);
      const roomDiscussions = discussions.filter((discussion) => discussion.roomId === room.id);
      if (!relation || !roomDiscussions.length) continue;
      const discussionSummary = roomDiscussions
        .slice(-12)
        .map((discussion) => `用户：${discussion.userText}${discussion.characterText ? `；角色：${discussion.characterText}` : ""}`)
        .join("\n")
        .slice(0, 1600);
      const statement = `与用户一起观看《${media.title}》的观影归档：${room.plotSummary ? `剧情摘要：${room.plotSummary}；` : ""}讨论记录：${discussionSummary}`.slice(0, 2000);
      const claim = createManualKnowledgeClaim({
        id: createId("claim-cinema-archive"),
        scope: { relationId: relation.id, characterId: relation.characterId, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId },
        sourceApp: "cinema",
        statement,
        sourceRecordId: room.id,
        recordedAt: Date.now(),
      });
      if (!claim) continue;
      claims.push(claim);
      newMemories.push({
        id: createId("memory-cinema-archive"),
        characterId: relation.characterId,
        relationId: relation.id,
        userIdentityId: relation.userIdentityId,
        conversationId: relation.conversationId,
        sourceCinemaId: media.id,
        content: statement,
        timestamp: Date.now(),
        importance: 4,
        isManual: true,
        sourceKnowledgeClaimIds: [claim.id],
      });
    }
    if (!claims.length) return true;
    const write = await commitMemoryWriteBundle({
      claims,
      memories: [...newMemories, ...memories],
      appendClaims: appendKnowledgeClaims,
      saveMemories: (nextMemories) => {
        onSaveMemories([...nextMemories]);
        return true;
      },
    });
    if (!write.complete) {
      setNotice("观影讨论归档失败，已取消删除以保护数据");
      return false;
    }
    return true;
  };

  const removeMedia = async (media: CinemaMedia) => {
    const relatedRooms = storeRef.current.rooms.filter((room) => room.mediaId === media.id);
    const relatedDiscussions = storeRef.current.discussions.filter((discussion) => discussion.mediaId === media.id);
    if (!window.confirm(`确定删除《${media.title}》及其本地视频、字幕和讨论记录吗？`)) return;
    const shouldArchive = relatedDiscussions.length > 0 && window.confirm("是否先将讨论内容归档总结进当前关系记忆？\n确定：归档后删除；取消：直接删除，不归档。");
    if (shouldArchive && !(await archiveDiscussionsBeforeDelete(media, relatedRooms, relatedDiscussions))) return;
    await Promise.all([
      cinemaAssetDb.delete(media.video.assetId),
      media.subtitle ? cinemaAssetDb.delete(media.subtitle.assetId) : Promise.resolve(),
      ...relatedDiscussions.map((discussion) => discussion.frameAsset ? cinemaAssetDb.delete(discussion.frameAsset.assetId) : Promise.resolve()),
    ]).catch(() => undefined);
    const next = mergeStore(storeRef.current, {
      media: storeRef.current.media.filter((item) => item.id !== media.id),
      rooms: storeRef.current.rooms.filter((room) => room.mediaId !== media.id),
      discussions: storeRef.current.discussions.filter((discussion) => discussion.mediaId !== media.id),
    });
    persistStore(next);
    if (selectedMediaId === media.id) {
      setSelectedMediaId(null);
      setSelectedRoomId(null);
    }
    if (relatedRooms.length) setNotice(shouldArchive ? "讨论已归档，影视、观影房间和讨论记录已删除" : "影视、观影房间和讨论记录已删除");
  };

  const openMedia = (media: CinemaMedia) => {
    setSelectedMediaId(media.id);
    setMediaTitleDraft(media.title);
    const existingRoom = scopedRooms.find((room) => room.mediaId === media.id);
    setSelectedRoomId(existingRoom?.id || null);
  };

  const handleBack = () => {
    if (selectedMediaId) {
      setSelectedMediaId(null);
      setSelectedRoomId(null);
      setMediaSettingsOpen(false);
      return;
    }
    onClose();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="grid shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center border-b-0 bg-transparent px-4 py-2">
        <button type="button" onClick={handleBack} className="app-nav-icon-button flex h-9 w-9 items-center justify-center rounded-none border-0 bg-transparent shadow-none" aria-label="返回">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="min-w-0 truncate text-center text-sm font-black" title={selectedMedia?.title || "影视"}>{selectedMedia?.title || "影视"}</h1>
        <button type="button" onClick={() => setMediaSettingsOpen(true)} disabled={!selectedMedia} className="app-nav-icon-button flex h-9 w-9 items-center justify-center rounded-none border-0 bg-transparent shadow-none disabled:opacity-40" aria-label="影视设置" title="影视设置">
          <SettingsIcon className="h-4 w-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="video/*,.mp4,.webm,.mov,.m4v,.ogv" className="hidden" onChange={handleVideoUpload} />
        <input ref={subtitleInputRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden" onChange={handleSubtitleUpload} />
      </header>

      <main className={`min-h-0 flex-1 p-4 ${selectedMedia ? "overflow-hidden" : "overflow-y-auto"}`}>
        {!selectedMedia ? (
          <section className="mx-auto max-w-md">
            <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
              <Film className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
              <h2 className="mt-3 text-sm font-black">建立你的影视库</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">上传本地视频，记忆播放进度，之后可以邀请角色一起讨论当前片段。</p>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-[var(--button-primary-bg)] px-5 text-xs font-bold text-[var(--button-primary-text)]"><Upload className="h-4 w-4" />上传视频</button>
            </div>
            {scopedMedia.length > 0 && <div className="mt-5 space-y-2">{scopedMedia.map((media) => <button key={media.id} type="button" onClick={() => openMedia(media)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left"><Film className="h-5 w-5 shrink-0 text-[var(--text-muted)]" /><span className="min-w-0 flex-1 truncate text-sm font-bold">{media.title}</span><span className="text-[10px] text-[var(--text-muted)]">{media.lastPositionMs > 0 ? formatSubtitleTime(media.lastPositionMs) : "未播放"}</span></button>)}</div>}
          </section>
        ) : (
          <section className="mx-auto flex h-full min-h-0 max-w-2xl flex-col gap-4">
            <div className="aspect-video overflow-hidden rounded-3xl bg-black shadow-xl">
              {videoUrl ? <div className="relative h-full w-full"><video ref={videoRef} src={videoUrl} controls className="h-full w-full object-contain" onLoadedMetadata={handleLoadedMetadata} onError={() => setNotice(getVideoPlaybackError(videoRef.current || document.createElement("video")))} onTimeUpdate={() => { const current = Math.round((videoRef.current?.currentTime || 0) * 1000); setPositionMs(current); }} onPause={() => persistPosition(positionMs)} onEnded={() => persistPosition(positionMs)} /><div className="pointer-events-none absolute inset-x-3 bottom-14 text-center text-sm font-semibold text-white drop-shadow-lg">{currentSubtitle.split("\n").slice(-1)[0] || ""}</div></div> : <div className="flex h-full items-center justify-center text-xs text-white/70">正在加载视频…</div>}
            </div>
            <canvas ref={frameRef} className="hidden" />
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-1"><button type="button" onClick={() => subtitleInputRef.current?.click()} className="inline-flex h-9 shrink-0 items-center rounded-full border border-[var(--border)] px-3 text-[10px] font-bold" title={selectedMedia.subtitle ? "更换字幕" : "导入字幕"}>字幕</button><button type="button" onClick={() => { if (selectedRoom) setAutoReactionEnabled((value) => { const next = !value; persistStore(mergeStore(storeRef.current, { rooms: storeRef.current.rooms.map((room) => room.id === selectedRoom.id ? { ...room, autoReactionEnabled: next, updatedAt: Date.now() } : room) })); return next; }); }} disabled={!selectedRoom} className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[10px] font-bold ${autoReactionEnabled ? "border-emerald-300 text-emerald-600" : "border-[var(--border)] text-[var(--text-muted)]"}`}>主动发言：{autoReactionEnabled ? "开" : "关"}</button><button type="button" onClick={() => { if (selectedRoom) setPlotContinuityEnabled((value) => { const next = !value; persistStore(mergeStore(storeRef.current, { rooms: storeRef.current.rooms.map((room) => room.id === selectedRoom.id ? { ...room, plotContinuityEnabled: next, updatedAt: Date.now() } : room) })); return next; }); }} disabled={!selectedRoom} className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[10px] font-bold ${plotContinuityEnabled ? "border-sky-300 text-sky-600" : "border-[var(--border)] text-[var(--text-muted)]"}`}>理解剧情：{plotContinuityEnabled ? "开" : "关"}</button><button type="button" onClick={() => setRoomPickerOpen(true)} className="inline-flex h-9 shrink-0 items-center rounded-full bg-[var(--button-primary-bg)] px-3 text-[10px] font-bold text-[var(--button-primary-text)]">邀请</button><button type="button" onClick={() => void removeMedia(selectedMedia)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-[var(--surface)] text-rose-500" aria-label="删除这部影视" title="删除这部影视"><Trash2 className="h-4 w-4" /></button></div>
            {selectedRoom && <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 overscroll-contain"><div className="mb-2 flex shrink-0 items-center justify-between"><p className="text-xs font-black">观影讨论 · {selectedCharacter?.name || "角色"}</p><span className="text-[10px] text-[var(--text-muted)]">{formatSubtitleTime(positionMs)}</span></div>{selectedDiscussions.length === 0 ? <p className="text-[11px] text-[var(--text-secondary)]">播放到想讨论的地方，输入一句话开始。角色只会看到你已经看过的内容。</p> : <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">{selectedDiscussions.map((discussion) => <div key={discussion.id} className="space-y-1.5"><p className="text-center text-[9px] text-[var(--text-muted)]">{formatSubtitleTime(discussion.positionMs)}</p>{discussion.userText && discussion.userText !== "（角色主动反应）" && <div className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-md bg-[var(--button-primary-bg)] px-3 py-2 text-xs leading-5 text-[var(--button-primary-text)]">{discussion.userText}</div></div>}{discussion.characterText && <div className="flex justify-start"><div className="max-w-[86%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[#f0f0ef] px-3 py-2 text-xs leading-5 text-[var(--text-primary)]">{cleanCharacterReply(discussion.characterText)}</div></div>}{discussion.characterText && <button type="button" disabled={discussion.savedToMemory} onClick={() => saveDiscussionToMemory(discussion)} className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--text-secondary)] disabled:opacity-50"><Save className="h-3 w-3" />{discussion.savedToMemory ? "已保存观影记忆" : "保存为观影记忆"}</button>}</div>)}{replyLoading && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md border border-[var(--border)] bg-[#f0f0ef] px-3 py-2 text-sm tracking-[0.25em] text-[var(--text-secondary)]"><span className="animate-pulse">•••</span></div></div>}</div>}<div className="mt-auto flex shrink-0 gap-2 bg-[var(--surface)] pt-2 pb-[env(safe-area-inset-bottom)]"><input value={discussionDraft} onChange={(event) => setDiscussionDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendDiscussionOnly(); } }} placeholder="讨论当前这一段…" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-xs outline-none" /><button type="button" onClick={sendDiscussionOnly} disabled={!discussionDraft.trim() || replyLoading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-40" aria-label="仅发送"><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => void generateReply(discussionDraft)} disabled={!discussionDraft.trim() || replyLoading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] disabled:opacity-40" aria-label="发送并获取回复"><Send className="h-4 w-4" /></button></div></div>}
            {!selectedRoom && <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-secondary)]">邀请一个角色后，才能开始关系隔离的观影讨论。</div>}
          </section>
        )}
      </main>
      {mediaSettingsOpen && selectedMedia && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setMediaSettingsOpen(false)}><div className="max-h-[min(80vh,560px)] w-full max-w-md overflow-y-auto rounded-3xl bg-[var(--surface)] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-sm font-black">影视设置</h2><button type="button" onClick={() => setMediaSettingsOpen(false)} aria-label="关闭设置"><X className="h-4 w-4" /></button></div><label className="mt-5 block text-xs font-bold">片名<input value={mediaTitleDraft} onChange={(event) => setMediaTitleDraft(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm outline-none" /></label><label className="mt-4 block text-xs font-bold">剧情简介<textarea value={mediaSynopsisDraft} onChange={(event) => setMediaSynopsisDraft(event.target.value)} placeholder="可填写电影、剧集或视频的基本剧情" className="mt-2 min-h-24 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none" /></label><label className="mt-4 block text-xs font-bold">其他辅助信息<textarea value={mediaAuxiliaryInfoDraft} onChange={(event) => setMediaAuxiliaryInfoDraft(event.target.value)} placeholder="例如时代背景、人物关系、观看版本等" className="mt-2 min-h-20 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none" /></label><button type="button" onClick={saveMediaSettings} className="mt-5 h-10 w-full rounded-full bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)]">保存设置</button></div></div>}
      {notice && <button type="button" onClick={() => setNotice(null)} role="status" className="pointer-events-auto absolute left-4 right-4 top-3 z-50 mx-auto flex max-w-md items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center text-[11px] font-bold leading-4 text-[var(--text-secondary)] shadow-lg">{notice}</button>}
      {roomPickerOpen && selectedMedia && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setRoomPickerOpen(false)}><div className="flex max-h-[min(80vh,560px)] w-full max-w-md flex-col rounded-3xl bg-[var(--surface)] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex shrink-0 items-center justify-between"><h2 className="text-sm font-black">邀请角色一起看《{selectedMedia.title}》</h2><button type="button" onClick={() => setRoomPickerOpen(false)}><X className="h-4 w-4" /></button></div><div className="mt-4 min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1">{scopedRelations.map((relation) => { const character = characters.find((item) => item.id === relation.characterId); return <button key={relation.id} type="button" onClick={() => createRoom(relation)} className="flex w-full shrink-0 items-center gap-3 rounded-2xl border border-[var(--border)] p-3 text-left"><div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-raised)]">{character?.avatar ? <img src={character.avatar} alt="" className="h-full w-full object-cover" /> : <Users className="h-4 w-4" />}</div><div><p className="text-xs font-bold">{character?.name || "未知角色"}</p><p className="text-[10px] text-[var(--text-muted)]">关系：{relation.relationship}</p></div></button>; })}</div>{scopedRelations.length === 0 && <p className="mt-4 text-xs text-[var(--text-muted)]">当前身份还没有可用的角色关系。</p>}</div></div>}
    </div>
  );
}
