import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Film, ImagePlus, MessageCircle, Play, Plus, Save, Subtitles, Trash2, Upload, Users, X } from "lucide-react";
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
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [mediaTitleDraft, setMediaTitleDraft] = useState("");
  const [autoReactionEnabled, setAutoReactionEnabled] = useState(true);
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
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("video/")) {
      setNotice("请选择浏览器支持的视频文件");
      return;
    }
    const mediaId = createId("cinema-media");
    const assetId = createId("cinema-video");
    try {
      await cinemaAssetDb.save({ assetId, kind: "video", blob: file });
      const media: CinemaMedia = {
        id: mediaId,
        ownerIdentityId: userIdentityId,
        title: file.name.replace(/\.[^.]+$/, "") || "未命名影视",
        mimeType: file.type || "video/mp4",
        durationMs: 0,
        video: { assetId, kind: "video", mimeType: file.type || "video/mp4", byteLength: file.size },
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
      setNotice(error instanceof Error ? error.message : "视频导入失败");
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
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedMedia) return;
    const format = /\.vtt$/i.test(file.name) ? "vtt" : /\.srt$/i.test(file.name) ? "srt" : null;
    if (!format) {
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
    }
  };

  const createRoom = (relation: CharacterRelationship) => {
    if (!selectedMedia) return;
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
    };
    if (persistStore(mergeStore(storeRef.current, { rooms: [room, ...storeRef.current.rooms] }))) {
      setSelectedRoomId(room.id);
      setAutoReactionEnabled(true);
      setRoomPickerOpen(false);
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

  const generateReply = async (userText: string, automatic = false) => {
    if (!selectedRoom || !selectedMedia || !selectedCharacter || !settings?.apiKey) {
      if (!settings?.apiKey) setNotice("请先在设置中配置 API Key");
      return;
    }
    setReplyLoading(true);
    try {
      const effectiveFrameDataUrl = frameDataUrl || captureFrame();
      const prompt = `你正在和用户一起观看影视《${selectedMedia.title}》。你扮演${selectedCharacter.name}，只能知道用户已经看到的内容。\n当前播放时间：${formatSubtitleTime(positionMs)}。\n当前字幕：${currentSubtitle || "暂无字幕"}\n${effectiveFrameDataUrl ? "当前视频画面已附加，请优先识别画面中的主体、动作、场景和可见文字，只讨论当前画面，不要凭空猜测后续剧情。" : "当前没有画面截图，请只根据用户文字回答。"}\n${automatic ? "这是一次低频观影反应，请只用一句自然、符合角色性格的短回应，不要抢夺用户注意力。" : `用户说：${userText.trim()}`}\n请直接以角色口吻回复，不要解释你是 AI。`;
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
      const discussion: CinemaDiscussion = {
        id: createId("cinema-discussion"),
        roomId: selectedRoom.id,
        mediaId: selectedMedia.id,
        userIdentityId,
        relationId: selectedRoom.relationId,
        characterId: selectedRoom.characterId,
        conversationId: selectedRoom.conversationId,
        positionMs,
        userText: automatic ? "（角色主动反应）" : userText.trim(),
        characterText: response.text.trim(),
        subtitleContext: currentSubtitle || undefined,
        createdAt: Date.now(),
      };
      persistStore(mergeStore(storeRef.current, { discussions: [...storeRef.current.discussions, discussion] }));
      setDiscussionDraft("");
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

  const saveDiscussionToMemory = (discussion: CinemaDiscussion) => {
    const relation = scopedRelations.find((item) => item.id === discussion.relationId);
    if (!relation || !onSaveMemories) return;
    const statement = `与用户一起观看《${selectedMedia?.title || "影视"}》时，在 ${formatSubtitleTime(discussion.positionMs)} 讨论：${discussion.userText}；角色回应：${discussion.characterText || ""}`.slice(0, 1000);
    const claim = createManualKnowledgeClaim({
      id: createId("claim-cinema"),
      scope: { relationId: relation.id, characterId: relation.characterId, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId },
      statement,
      sourceRecordId: discussion.id,
      recordedAt: Date.now(),
    });
    if (!claim || !appendKnowledgeClaims([claim]).success) {
      setNotice("观影记忆保存失败");
      return;
    }
    const memory: MemoryItem = {
      id: createId("memory-cinema"),
      characterId: relation.characterId,
      relationId: relation.id,
      content: statement,
      timestamp: Date.now(),
      importance: 4,
      isManual: true,
      sourceKnowledgeClaimIds: [claim.id],
    };
    onSaveMemories([memory, ...memories]);
    persistStore(mergeStore(storeRef.current, { discussions: storeRef.current.discussions.map((item) => item.id === discussion.id ? { ...item, savedToMemory: true } : item) }));
    setNotice("已保存为当前关系的观影记忆");
  };

  const removeMedia = async (media: CinemaMedia) => {
    const relatedRooms = storeRef.current.rooms.filter((room) => room.mediaId === media.id);
    const relatedDiscussions = storeRef.current.discussions.filter((discussion) => discussion.mediaId === media.id);
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
    if (relatedRooms.length) setNotice("影视、观影房间和讨论记录已删除");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface-raised)] px-3 text-xs font-bold" aria-label="返回">
          <ArrowLeft className="h-4 w-4" />
          <span>返回</span>
        </button>
        <h1 className="flex items-center gap-2 text-sm font-black"><Film className="h-4 w-4" />影视</h1>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" aria-label="上传影视">
          <Plus className="h-4 w-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
        <input ref={subtitleInputRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden" onChange={handleSubtitleUpload} />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {!selectedMedia ? (
          <section className="mx-auto max-w-md">
            <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
              <Film className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
              <h2 className="mt-3 text-sm font-black">建立你的影视库</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">上传本地视频，记忆播放进度，之后可以邀请角色一起讨论当前片段。</p>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-[var(--button-primary-bg)] px-5 text-xs font-bold text-[var(--button-primary-text)]"><Upload className="h-4 w-4" />上传视频</button>
            </div>
            {scopedMedia.length > 0 && <div className="mt-5 space-y-2">{scopedMedia.map((media) => <button key={media.id} type="button" onClick={() => { setSelectedMediaId(media.id); setMediaTitleDraft(media.title); }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left"><Film className="h-5 w-5 shrink-0 text-[var(--text-muted)]" /><span className="min-w-0 flex-1 truncate text-sm font-bold">{media.title}</span><span className="text-[10px] text-[var(--text-muted)]">{media.lastPositionMs > 0 ? formatSubtitleTime(media.lastPositionMs) : "未播放"}</span></button>)}</div>}
          </section>
        ) : (
          <section className="mx-auto max-w-2xl space-y-4">
            <div className="flex items-center gap-3"><div className="min-w-0"><input value={mediaTitleDraft} onChange={(event) => setMediaTitleDraft(event.target.value)} onBlur={() => { if (mediaTitleDraft.trim() && selectedMedia) persistStore(mergeStore(storeRef.current, { media: storeRef.current.media.map((item) => item.id === selectedMedia.id ? { ...item, title: mediaTitleDraft.trim(), updatedAt: Date.now() } : item) })); }} className="w-full truncate bg-transparent text-lg font-black outline-none" /><p className="mt-1 text-[10px] text-[var(--text-muted)]">{selectedRoom ? `与${selectedCharacter?.name || "角色"}一起看` : "还没有观影房间"}</p></div></div>
            <div className="aspect-video overflow-hidden rounded-3xl bg-black shadow-xl">
              {videoUrl ? <div className="relative h-full w-full"><video ref={videoRef} src={videoUrl} controls className="h-full w-full object-contain" onLoadedMetadata={handleLoadedMetadata} onTimeUpdate={() => { const current = Math.round((videoRef.current?.currentTime || 0) * 1000); setPositionMs(current); }} onPause={() => persistPosition(positionMs)} onEnded={() => persistPosition(positionMs)} /><div className="pointer-events-none absolute inset-x-3 bottom-14 text-center text-sm font-semibold text-white drop-shadow-lg">{currentSubtitle.split("\n").slice(-1)[0] || ""}</div></div> : <div className="flex h-full items-center justify-center text-xs text-white/70">正在加载视频…</div>}
            </div>
            <canvas ref={frameRef} className="hidden" />
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => subtitleInputRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-[10px] font-bold"><Subtitles className="h-4 w-4" />{selectedMedia.subtitle ? "更换字幕" : "导入 SRT/VTT"}</button><button type="button" onClick={() => { if (selectedRoom) setAutoReactionEnabled((value) => { const next = !value; persistStore(mergeStore(storeRef.current, { rooms: storeRef.current.rooms.map((room) => room.id === selectedRoom.id ? { ...room, autoReactionEnabled: next, updatedAt: Date.now() } : room) })); return next; }); }} disabled={!selectedRoom} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold ${autoReactionEnabled ? "border-emerald-300 text-emerald-600" : "border-[var(--border)] text-[var(--text-muted)]"}`}><MessageCircle className="h-4 w-4" />自动低频反应：{autoReactionEnabled ? "开" : "关"}</button>{!selectedRoom && <button type="button" onClick={() => setRoomPickerOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--button-primary-bg)] px-3 text-[10px] font-bold text-[var(--button-primary-text)]"><Users className="h-4 w-4" />邀请角色一起看</button>}</div>
            {selectedRoom && <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black">观影讨论 · {selectedCharacter?.name || "角色"}</p><span className="text-[10px] text-[var(--text-muted)]">{formatSubtitleTime(positionMs)}</span></div>{selectedDiscussions.length === 0 ? <p className="text-[11px] text-[var(--text-muted)]">播放到想讨论的地方，输入一句话开始。角色只会看到你已经看过的内容。</p> : <div className="max-h-52 space-y-2 overflow-y-auto">{selectedDiscussions.map((discussion) => <div key={discussion.id} className="rounded-xl bg-[var(--surface-raised)] p-2.5 text-xs"><p className="text-[10px] text-[var(--text-muted)]">{formatSubtitleTime(discussion.positionMs)} · {discussion.userText}</p><p className="mt-1 leading-5">{discussion.characterText}</p><button type="button" disabled={discussion.savedToMemory} onClick={() => saveDiscussionToMemory(discussion)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--text-secondary)] disabled:opacity-50"><Save className="h-3 w-3" />{discussion.savedToMemory ? "已保存观影记忆" : "保存为观影记忆"}</button></div>)}</div>}<div className="mt-3 flex gap-2"><button type="button" onClick={() => captureFrame()} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${frameDataUrl ? "border-sky-400 text-sky-500" : "border-[var(--border)]"}`} aria-label="附加当前画面" title="附加当前画面：把当前视频帧发送给支持视觉输入的模型"><ImagePlus className="h-4 w-4" /></button><input value={discussionDraft} onChange={(event) => setDiscussionDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void generateReply(discussionDraft); } }} placeholder="讨论当前这一段…" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-xs outline-none" /><button type="button" disabled={!discussionDraft.trim() || replyLoading} onClick={() => void generateReply(discussionDraft)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] disabled:opacity-40"><Play className="h-4 w-4" /></button></div></div>}
            {!selectedRoom && <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-secondary)]">邀请一个角色后，才能开始关系隔离的观影讨论。</div>}
            <button type="button" onClick={() => { if (window.confirm(`确定删除《${selectedMedia.title}》及其本地视频、字幕和讨论记录吗？`)) void removeMedia(selectedMedia); }} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-rose-500"><Trash2 className="h-3.5 w-3.5" />删除这部影视</button>
          </section>
        )}
      </main>
      {notice && <button type="button" onClick={() => setNotice(null)} className="absolute bottom-5 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-3 text-center text-xs font-bold leading-5 text-white shadow-xl">{notice}</button>}
      {roomPickerOpen && selectedMedia && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setRoomPickerOpen(false)}><div className="flex max-h-[min(80vh,560px)] w-full max-w-md flex-col rounded-3xl bg-[var(--surface)] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex shrink-0 items-center justify-between"><h2 className="text-sm font-black">邀请角色一起看《{selectedMedia.title}》</h2><button type="button" onClick={() => setRoomPickerOpen(false)}><X className="h-4 w-4" /></button></div><div className="mt-4 min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1">{scopedRelations.map((relation) => { const character = characters.find((item) => item.id === relation.characterId); return <button key={relation.id} type="button" onClick={() => createRoom(relation)} className="flex w-full shrink-0 items-center gap-3 rounded-2xl border border-[var(--border)] p-3 text-left"><div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-raised)]">{character?.avatar ? <img src={character.avatar} alt="" className="h-full w-full object-cover" /> : <Users className="h-4 w-4" />}</div><div><p className="text-xs font-bold">{character?.name || "未知角色"}</p><p className="text-[10px] text-[var(--text-muted)]">关系：{relation.relationship}</p></div></button>; })}</div>{scopedRelations.length === 0 && <p className="mt-4 text-xs text-[var(--text-muted)]">当前身份还没有可用的角色关系。</p>}</div></div>}
    </div>
  );
}
