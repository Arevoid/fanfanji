import React, { useState, useEffect } from "react";
import { MusicTrack, MusicPlaylist, MusicPlaybackHistoryItem } from "../types";
import { audioDb } from "../utils/audioDb";
import MusicLibraryPanel from "./music/MusicLibraryPanel";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Plus,
  Trash2,
  ChevronLeft,
  Disc3,
  Music,
  ListMusic,
  FileAudio,
  X,
  Upload,
  Link,
  Repeat,
  Repeat1,
  Shuffle,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react";
import { getNeteaseLyrics } from "../features/music/services/neteaseMusicApi";
import { isNeteaseMusicTrack } from "../features/music/services/musicTrackModel";
import type { NeteaseLyrics } from "../features/music/neteaseTypes";
import type { NeteaseMusicQuality } from "../features/music/neteaseTypes";

interface AppMusicProps {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
  onAddTrack: (track: MusicTrack) => void;
  onDeleteTrack: (id: string) => void;
  onAddPlaylist: (playlist: MusicPlaylist) => void;
  onDeletePlaylist: (id: string) => void;
  onClose: () => void;
  currentTrack: MusicTrack | null;
  queueTracks?: MusicTrack[];
  playbackHistory?: MusicPlaybackHistoryItem[];
  activeIdentityId: string;
  neteaseQuality: NeteaseMusicQuality;
  setNeteaseQuality: (quality: NeteaseMusicQuality) => void;
  setCurrentTrack: (track: MusicTrack | null) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  playMode: "single" | "list" | "random";
  setPlayMode: React.Dispatch<React.SetStateAction<"single" | "list" | "random">>;
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  onPlayTrack: (track: MusicTrack) => void;
}

const PRESEED_TRACKS: MusicTrack[] = [];

const WAVE_BARS = [
  4, 4, 6, 8, 10, 14, 12, 8, 6, 8, 12, 18, 24, 28, 20, 14, 16, 22, 30, 34,
  24, 18, 14, 16, 22, 32, 42, 48, 36, 24, 18, 16, 20, 28, 38, 44, 32, 20,
  14, 12, 10, 14, 18, 24, 22, 16, 12, 10, 8, 8, 6, 6, 4, 4, 4, 4, 4, 4, 4, 4
];

export default function AppMusic({
  tracks,
  onAddTrack,
  onDeleteTrack,
  onClose,
  currentTrack,
  queueTracks = [],
  playbackHistory = [],
  activeIdentityId,
  neteaseQuality,
  setNeteaseQuality,
  setCurrentTrack,
  isPlaying,
  audioRef,
  playMode,
  setPlayMode,
  volume,
  onPlayTrack,
}: AppMusicProps) {
  // New track form state
  const [newTitle, setNewTitle] = useState("");
  const [newArtist, setNewArtist] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCoverUrl, setNewCoverUrl] = useState("");
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [importMethod, setImportMethod] = useState<"upload" | "link">("upload");
  const [isShowingImportModal, setIsShowingImportModal] = useState(false);

  // Audio elements references
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showLibrary, setShowLibrary] = useState(true);
  const [lyrics, setLyrics] = useState<NeteaseLyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);

  const allTracks = [...PRESEED_TRACKS, ...tracks, ...queueTracks.filter((track) => !tracks.some((item) => item.id === track.id))];

  useEffect(() => {
    if (allTracks.length > 0 && !currentTrack) {
      setCurrentTrack(allTracks[0]);
    }
  }, [tracks]);

  // Synchronize dynamic events directly on the persistent Audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Set initial volume & sync time
    audio.volume = volume;
    setCurrentTime(audio.currentTime);
    if (!isNaN(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [audioRef, currentTrack]);

  // Keep volume in sync when slider changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    setLyrics(null);
    setLyricsError(null);
  }, [currentTrack?.id]);

  const handleLoadLyrics = async () => {
    if (!currentTrack || !isNeteaseMusicTrack(currentTrack) || !currentTrack.providerTrackId) return;
    setLyricsLoading(true);
    setLyricsError(null);
    try {
      setLyrics(await getNeteaseLyrics(currentTrack.providerTrackId));
    } catch (error) {
      setLyricsError(error instanceof Error ? error.message : "歌词读取失败。");
    } finally {
      setLyricsLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (currentTrack) onPlayTrack(currentTrack);
  };

  const handleNext = () => {
    if (allTracks.length === 0) return;
    if (playMode === "random") {
      const randomIndex = Math.floor(Math.random() * allTracks.length);
      onPlayTrack(allTracks[randomIndex]);
    } else {
      const currentIndex = allTracks.findIndex((t) => t.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % allTracks.length;
      onPlayTrack(allTracks[nextIndex]);
    }
  };

  const handlePrev = () => {
    if (allTracks.length === 0) return;
    if (playMode === "random") {
      const randomIndex = Math.floor(Math.random() * allTracks.length);
      onPlayTrack(allTracks[randomIndex]);
    } else {
      const currentIndex = allTracks.findIndex((t) => t.id === currentTrack?.id);
      const prevIndex = currentIndex <= 0 ? allTracks.length - 1 : currentIndex - 1;
      onPlayTrack(allTracks[prevIndex]);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const formatTime = (timeInSecs: number) => {
    if (isNaN(timeInSecs)) return "00:00";
    const mins = Math.floor(timeInSecs / 60);
    const secs = Math.floor(timeInSecs % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const trackId = `local-track-${Date.now()}`;
      try {
        await audioDb.saveTrackFile(trackId, file);
        const coverAssetId = pendingCoverFile ? `track-cover-${trackId}` : undefined;
        if (coverAssetId && pendingCoverFile) await audioDb.saveTrackCover(coverAssetId, pendingCoverFile);
        const fileUrl = URL.createObjectURL(file);
        const newTrack: MusicTrack = {
          id: trackId,
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: "本地上传",
          url: fileUrl,
          isLocal: true,
          source: "local",
          audioAssetId: trackId,
          audioMimeType: file.type || undefined,
          coverAssetId,
          coverMimeType: pendingCoverFile?.type,
        };
        onAddTrack(newTrack);
        onPlayTrack(newTrack);
        setPendingCoverFile(null);
        setIsShowingImportModal(false);
      } catch (err) {
        console.error("Failed to save local track to IndexedDB:", err);
        alert("本地音频保存失败，未加入音乐库。请检查浏览器存储空间后重试。");
      }
    }
  };

  const handleAddTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) return;

    const newTrack: MusicTrack = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      artist: newArtist.trim() || "网络直链",
      url: newUrl.trim(),
      isLocal: false,
      source: "network-link",
      coverUrl: newCoverUrl.trim() || undefined,
    };
    onAddTrack(newTrack);
    setNewTitle("");
    setNewArtist("");
    setNewUrl("");
    setNewCoverUrl("");
    onPlayTrack(newTrack);
    setIsShowingImportModal(false);
  };



  const progressPercent = duration > 0 ? currentTime / duration : 0;
  const useReferencePlayerLayout = true;

  return (
    <div data-theme-page="music" className="flex flex-col h-full bg-[var(--app-bg)] text-[var(--text-primary)] font-sans overflow-hidden relative">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-1.5 z-10 shrink-0 relative ${showLibrary ? "bg-transparent" : "bg-sky-50/70"}`}>
        <button
          onClick={() => showLibrary ? onClose() : setShowLibrary(true)}
          className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200/70 transition-colors z-10 shrink-0 ${showLibrary ? "bg-slate-100" : "bg-transparent"}`}
          title={showLibrary ? "返回桌面" : "返回音乐首页"}
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
          <span>音乐电台</span>
        </h1>

        <div className="w-8 h-8 flex items-center justify-end z-10">
          {!showLibrary && <button
            onClick={() => setIsShowingImportModal(true)}
            className="w-8 h-8 rounded-full bg-neutral-950 hover:bg-neutral-900 text-white transition-all flex items-center justify-center shadow-sm"
            title="导入音乐"
          >
            <Plus className="w-4.5 h-4.5" />
          </button>}
        </div>
      </div>

      {showLibrary && (
        <div className="absolute inset-0 z-40 bg-[var(--app-bg)]">
          <MusicLibraryPanel
            tracks={allTracks}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlayTrack={onPlayTrack}
            onOpenPlayer={() => setShowLibrary(false)}
            onOpenImport={() => setIsShowingImportModal(true)}
            onClose={onClose}
            playbackHistory={playbackHistory}
            activeIdentityId={activeIdentityId}
          />
        </div>
      )}

      {useReferencePlayerLayout && <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-sky-50/70 px-7 pb-5 pt-4">
        {currentTrack ? <>
          <div className="mx-auto aspect-square w-full max-w-[304px] overflow-hidden rounded-[24px] bg-[var(--surface-muted)] shadow-sm">
            {currentTrack.coverUrl ? <img src={currentTrack.coverUrl} alt={`${currentTrack.title} 专辑封面`} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-secondary)]"><Disc3 className="h-20 w-20" /><span className="text-xs">暂无专辑封面</span></div>}
          </div>
          <div className="mt-5 text-center"><h2 className="truncate text-xl font-extrabold text-slate-800">{currentTrack.title}</h2><p className="mt-1 truncate text-sm text-slate-600">{currentTrack.artist || "未知艺术家"}</p></div>
          <div className="mt-14 flex min-h-[76px] flex-1 items-center justify-center text-center">
            {lyrics ? <div className="max-h-28 w-full overflow-y-auto whitespace-pre-wrap text-[12px] leading-6 text-slate-600">{lyrics.lyric || lyrics.translatedLyric}</div> : <div><p className="text-xs text-slate-500">找不到歌词</p>{isNeteaseMusicTrack(currentTrack) && <button type="button" onClick={() => void handleLoadLyrics()} className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm">{lyricsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} 加载歌词</button>}</div>}
          </div>
          {lyricsError && <p className="mt-2 text-center text-[10px] text-red-500">{lyricsError}</p>}
          <div className="mt-5"><input type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek} className="h-1.5 w-full cursor-pointer accent-sky-700" /><div className="mt-2 flex justify-between text-[10px] font-medium text-slate-500"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>
          <div className="mt-5 flex items-center justify-between px-1 pb-1 text-slate-600">
            <button type="button" onClick={() => setPlayMode((prev) => prev === "list" ? "single" : prev === "single" ? "random" : "list")} className="p-2" title="播放模式">{playMode === "single" ? <Repeat1 className="h-5 w-5" /> : playMode === "random" ? <Shuffle className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}</button>
            <button type="button" onClick={handlePrev} className="p-2" title="上一首"><SkipBack className="h-5 w-5 fill-current" /></button>
            <button type="button" onClick={handlePlayPause} className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-md" title={isPlaying ? "暂停" : "播放"}>{isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="ml-0.5 h-6 w-6 fill-current" />}</button>
            <button type="button" onClick={handleNext} className="p-2" title="下一首"><SkipForward className="h-5 w-5 fill-current" /></button>
            <button type="button" onClick={() => setShowPlaylist(!showPlaylist)} className={`p-2 ${showPlaylist ? "text-slate-900" : ""}`} title="播放列表"><ListMusic className="h-5 w-5" /></button>
          </div>
        </> : <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-slate-500"><Music className="h-10 w-10" /><span className="text-xs">当前播放队列为空，请导入音乐</span></div>}
      </main>}

      {/* Legacy visualizer kept as a fallback for older layouts. */}
      {!useReferencePlayerLayout && <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 overflow-y-auto pb-10 relative bg-gradient-to-b from-stone-100/50 to-transparent">
        {currentTrack ? (
          <>
            {/* Wave Equalizer Animation (Absolute top and responsive) */}
            <div className="absolute top-4 flex items-end justify-center space-x-1 h-5 opacity-40">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((bar) => {
                const animDur = ["0.6s", "0.9s", "0.7s", "1.1s", "0.8s", "1.2s", "0.5s", "1s", "0.75s", "0.95s"][bar - 1];
                return (
                  <div
                    key={bar}
                    className="w-0.75 bg-neutral-950 rounded-full"
                    style={{
                      height: isPlaying ? "100%" : "20%",
                      animation: isPlaying ? `bounce ${animDur} ease-in-out infinite alternate` : "none",
                    }}
                  />
                );
              })}
            </div>

            <style>{`
              @keyframes bounce {
                from { height: 10%; }
                to { height: 100%; }
              }
            `}</style>

            {/* Vinyl Disk Card (Modern glowing frame) */}
            <div className="relative w-56 h-56 flex items-center justify-center mt-6 mb-4 group">
              {/* Ambient Shadow glow */}
              <div className={`absolute inset-0 rounded-full bg-neutral-950/5 blur-2xl transition-all duration-1000 ${
                isPlaying ? "scale-110 opacity-75 animate-pulse" : "scale-95 opacity-20"
              }`} />

              {/* Rotating Vinyl */}
              <div
                className={`absolute w-52 h-52 rounded-full bg-neutral-950 border-[8px] border-neutral-900 shadow-2xl flex items-center justify-center overflow-hidden transition-transform duration-1000 ${
                  isPlaying ? "animate-spin" : ""
                }`}
                style={{ animationDuration: "10s" }}
              >
                <div className="w-48 h-48 rounded-full border border-neutral-800/60 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-800 via-neutral-950 to-neutral-900 relative">
                  {/* Grooves */}
                  <div className="absolute inset-3 rounded-full border border-neutral-800/30" />
                  <div className="absolute inset-7 rounded-full border border-neutral-800/30" />
                  <div className="absolute inset-11 rounded-full border border-neutral-800/30" />
                  <div className="absolute inset-16 rounded-full border border-neutral-800/30" />
                  
                  {/* Center Core Label */}
                  <div className="w-16 h-16 rounded-full bg-white flex flex-col items-center justify-center border-4 border-neutral-950 z-10 shadow-lg relative">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-neutral-950/10 to-transparent animate-pulse" />
                    <Music className="w-6 h-6 text-neutral-950" />
                  </div>
                </div>
              </div>
            </div>

            {/* Song Metadata */}
            <div className="text-center w-full max-w-xs mt-2">
              <h2 className="font-extrabold text-xl text-stone-900 truncate px-3 tracking-wide">{currentTrack.title}</h2>
              <p className="text-[11px] text-stone-500 mt-1 font-semibold truncate flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3 text-neutral-950" />
                <span>{currentTrack.artist}</span>
              </p>
              {isNeteaseMusicTrack(currentTrack) && (
                <div className="mt-3 flex items-center justify-center gap-2"><button type="button" onClick={() => void handleLoadLyrics()} className="flex items-center gap-1 rounded-full bg-stone-200 px-3 py-1.5 text-[10px] font-bold text-stone-700 hover:bg-stone-300">
                  {lyricsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} {lyrics ? "刷新歌词" : "查看歌词"}
                </button><select value={neteaseQuality} onChange={(event) => setNeteaseQuality(event.target.value as NeteaseMusicQuality)} className="rounded-full bg-stone-200 px-2 py-1.5 text-[10px] font-bold text-stone-700 outline-none"><option value="standard">标准</option><option value="higher">较高</option><option value="exhigh">极高</option></select></div>
              )}
              {lyricsError && <p className="mt-2 text-[10px] text-red-500">{lyricsError}</p>}
            </div>

            {lyrics && (
              <div className="mt-4 max-h-32 w-full max-w-xs overflow-y-auto rounded-2xl border border-stone-200 bg-white/70 px-4 py-3 text-center text-[11px] leading-6 text-stone-600">
                <p className="whitespace-pre-wrap">{lyrics.lyric || lyrics.translatedLyric}</p>
                {lyrics.lyric && lyrics.translatedLyric && <p className="mt-3 border-t border-stone-200 pt-3 whitespace-pre-wrap text-stone-400">{lyrics.translatedLyric}</p>}
              </div>
            )}

            {/* Waveform-based Scrubbing Slider */}
            <div className="w-full max-w-xs mt-8 relative select-none">
              <div className="h-10 flex items-center justify-between w-full relative">
                {/* Visual Waveform bars */}
                <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
                  {WAVE_BARS.map((barHeight, idx) => {
                    const barProgress = idx / WAVE_BARS.length;
                    const isPlayed = barProgress <= progressPercent;
                    return (
                      <div
                        key={idx}
                        style={{ height: `${barHeight}px` }}
                        className={`w-[2.5px] rounded-full transition-colors duration-150 ${
                          isPlayed ? "bg-stone-900" : "bg-stone-200"
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Invisible input range on top for interactions */}
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
              </div>

              {/* Timestamps below the waveform */}
              <div className="flex justify-between text-[11px] text-stone-500 font-mono mt-1 px-0.5">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-stone-400 text-xs py-12 flex flex-col items-center gap-2">
            <Music className="w-8 h-8 text-stone-350 animate-pulse" />
            <span>当前播放队列为空，请导入音乐</span>
          </div>
        )}
      </div>}

      {/* 置顶悬浮播放列表面板 */}
      {/* 宽度：页面宽度左右保留约 16px 边距 (left-4 right-4)，高度：约为屏幕高度的 35%–45% (h-[40vh]) */}
      <div
        className={`absolute left-4 right-4 z-40 h-[40vh] bg-[var(--surface)] text-[var(--text-primary)] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] border border-[var(--border)] flex flex-col overflow-hidden transition-all duration-300 ease-out origin-bottom-right ${
          showPlaylist
            ? "bottom-[88px] opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "bottom-[50px] opacity-0 translate-y-4 scale-95 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 bg-[var(--surface-muted)] backdrop-blur-sm shrink-0">
          <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 uppercase tracking-wider">
            <ListMusic className="w-3.5 h-3.5" />
            <span>当前播放列表 ({(allTracks || []).length}首)</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsShowingImportModal(true)}
              className="text-[10px] text-[var(--button-secondary-text)] hover:bg-[var(--surface-raised)] font-bold flex items-center gap-1 bg-[var(--button-secondary-bg)] border border-[var(--button-secondary-border)] px-2 py-1 rounded-lg transition-colors disabled:bg-[var(--button-disabled-bg)] disabled:text-[var(--button-disabled-text)]"
            >
              <Plus className="w-3 h-3" />
              <span>添加歌曲</span>
            </button>
            <button
              onClick={() => setShowPlaylist(false)}
              className="p-1 rounded-full hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-[var(--surface)]">
          {(allTracks || []).length === 0 ? (
            <div className="text-center py-12 text-[var(--text-tertiary)] text-xs">
              播放队列中暂无音乐。点击右上角“添加歌曲”导入音乐。
            </div>
          ) : (
            <div className="space-y-1.5">
              {(allTracks || []).map((track, idx) => {
                const isActive = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                      isActive
                        ? "bg-[var(--surface-selected)] border-[var(--accent)] text-[var(--text-primary)] shadow"
                        : "bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    <div
                      className="flex-1 min-w-0 cursor-pointer flex items-center gap-2.5"
                      onClick={() => {
                        onPlayTrack(track);
                      }}
                    >
                      <span className="text-[10px] font-mono opacity-50 w-4">{(idx + 1).toString().padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate leading-snug">{track.title}</p>
                        <p className="text-[10px] truncate mt-0.5 text-[var(--text-secondary)]">
                          {track.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {isActive && isPlaying && (
                        <span className="flex gap-0.5 items-end h-3 px-1 mr-1">
                          <span className="w-0.5 bg-current rounded-full h-2 animate-bounce" style={{ animationDelay: "0.1s" }} />
                          <span className="w-0.5 bg-current rounded-full h-3 animate-bounce" style={{ animationDelay: "0.3s" }} />
                          <span className="w-0.5 bg-current rounded-full h-1.5 animate-bounce" style={{ animationDelay: "0.2s" }} />
                        </span>
                      )}
                      
                      {!track.id.startsWith("pre-") && (
                        <button
                          onClick={() => onDeleteTrack(track.id)}
                          className={`p-1.5 transition-colors rounded-lg ${
                            isActive ? "text-[var(--text-secondary)] hover:text-[var(--danger)]" : "text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                          }`}
                          title="从列表删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Legacy fixed controls are only used by the fallback player layout. */}
      {!useReferencePlayerLayout && <div className="shrink-0 h-20 bg-white border-t border-stone-200 flex items-center justify-center px-6 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between w-full max-w-xs">
          {/* Play Mode Button */}
          <button
            onClick={() => {
              setPlayMode((prev) => {
                if (prev === "list") return "single";
                if (prev === "single") return "random";
                return "list";
              });
            }}
            className="p-2 text-stone-500 hover:text-stone-950 transition-all"
            title={
              playMode === "single"
                ? "单曲循环"
                : playMode === "random"
                ? "随机播放"
                : "列表循环"
            }
          >
            {playMode === "single" && <Repeat1 className="w-5 h-5 text-neutral-950" />}
            {playMode === "list" && <Repeat className="w-5 h-5 text-stone-600" />}
            {playMode === "random" && <Shuffle className="w-5 h-5 text-stone-600" />}
          </button>

          {/* Prev Button */}
          <button onClick={handlePrev} className="p-2 text-stone-500 hover:text-stone-800 transition-all active:scale-90">
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={handlePlayPause}
            className="p-3 bg-neutral-950 hover:bg-neutral-900 text-white rounded-full transition-all transform hover:scale-105 active:scale-95 shadow-md flex items-center justify-center"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
          </button>

          {/* Next Button */}
          <button onClick={handleNext} className="p-2 text-stone-500 hover:text-stone-800 transition-all active:scale-90">
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          {/* Playlist Button */}
          <button
            onClick={() => setShowPlaylist(!showPlaylist)}
            className={`p-2 transition-all ${
              showPlaylist ? "text-neutral-950 font-bold" : "text-stone-500 hover:text-stone-950"
            }`}
            title="播放列表"
          >
            <ListMusic className="w-5 h-5" />
          </button>
        </div>
      </div>}

      {/* Import / Add Music Overlay Modal */}
      {isShowingImportModal && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white rounded-t-3xl p-5 shadow-2xl w-full max-w-md border-t border-stone-200 flex flex-col max-h-[85%] animate-slide-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-extrabold text-sm text-stone-900 flex items-center gap-1.5 tracking-wider uppercase">
                <Plus className="w-4 h-4 text-neutral-950" />
                <span>导入外部音乐</span>
              </h3>
              <button
                onClick={() => setIsShowingImportModal(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Methods Tabs selector */}
            <div className="flex bg-stone-100 p-1 rounded-xl my-4 text-xs font-bold">
              <button
                onClick={() => setImportMethod("upload")}
                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 ${
                    importMethod === "upload" ? "bg-[var(--tab-active-bg)] text-[var(--tab-active-text)]" : "text-[var(--tab-inactive-text)]"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>上传本地文件</span>
              </button>
              <button
                onClick={() => setImportMethod("link")}
                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 ${
                    importMethod === "link" ? "bg-[var(--tab-active-bg)] text-[var(--tab-active-text)]" : "text-[var(--tab-inactive-text)]"
                }`}
              >
                <Link className="w-3.5 h-3.5" />
                <span>输入网络直链</span>
              </button>
            </div>

            {/* Modal Scroll Content */}
            <div className="flex-1 overflow-y-auto pb-4 pr-1">
              {importMethod === "upload" ? (
                <div className="space-y-4 text-center">
                  <label className="block cursor-pointer rounded-2xl border border-stone-200 bg-stone-50 p-3 text-left">
                    <span className="block text-[10px] font-bold text-stone-500">歌曲封面（可选）</span>
                    <span className="mt-1 block truncate text-xs text-stone-700">{pendingCoverFile?.name || "选择本地图片"}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => setPendingCoverFile(event.target.files?.[0] || null)} />
                  </label>
                  <label className="cursor-pointer block border-2 border-dashed border-stone-300 hover:border-neutral-950 bg-stone-50 p-6 rounded-2xl transition-all">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-neutral-950 text-white rounded-full flex items-center justify-center mb-2 border border-stone-200">
                        <FileAudio className="w-6 h-6" />
                      </div>
                      <h4 className="text-xs font-bold text-stone-850">选择音频或拖拽文件到这里</h4>
                      <p className="text-[10px] text-stone-500 mt-1 max-w-xs leading-relaxed">
                        支持 MP3, WAV, OGG 等主流音乐格式，本地上传后将使用浏览器沙盒读取并直接进入乐库播放。
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleLocalUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <form onSubmit={handleAddTrackSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-stone-500 mb-1 font-bold">歌曲名称</label>
                    <input
                      type="text"
                      required
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="如: 绝美旋律"
                      className="w-full bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 rounded-[8px] px-3 py-2 text-xs text-stone-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-stone-500 mb-1 font-bold">艺术家 / 歌手</label>
                    <input
                      type="text"
                      value={newArtist}
                      onChange={(e) => setNewArtist(e.target.value)}
                      placeholder="如: 纯音幻境"
                      className="w-full bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 rounded-[8px] px-3 py-2 text-xs text-stone-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-stone-500 mb-1 font-bold">直链网址 (MP3 Direct URL)</label>
                    <input
                      type="url"
                      required
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://example.com/audio.mp3"
                      className="w-full bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 rounded-[8px] px-3 py-2 text-xs text-stone-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-stone-500 mb-1 font-bold">封面图片网址（可选）</label>
                    <input
                      type="url"
                      value={newCoverUrl}
                      onChange={(event) => setNewCoverUrl(event.target.value)}
                      placeholder="https://example.com/cover.jpg"
                      className="w-full bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 rounded-[8px] px-3 py-2 text-xs text-stone-800"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-2 py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-xl text-xs transition-colors shadow-md"
                  >
                    导入并播放
                  </button>
                </form>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-stone-200">
              <button
                onClick={() => setIsShowingImportModal(false)}
                className="w-full py-2 bg-stone-100 hover:bg-stone-250 text-stone-600 rounded-xl text-xs font-bold transition-all"
              >
                取消返回
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
