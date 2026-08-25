import React, { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  ChevronLeft,
  Disc3,
  Download,
  Heart,
  History,
  Library,
  ListMusic,
  Loader2,
  LogIn,
  LogOut,
  Music2,
  Play,
  Pause,
  Search,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { MusicPlaybackHistoryItem, MusicTrack } from "../../types";
import {
  checkNeteaseQrSession,
  createNeteaseQrSession,
  getNeteaseAccount,
  getNeteaseDailyRecommendations,
  getNeteasePlaylistTracks,
  getNeteasePlaylists,
  logoutNetease,
  searchNeteaseTracks,
} from "../../features/music/services/neteaseMusicApi";
import { createNeteaseMusicTrack } from "../../features/music/services/musicTrackModel";
import type { NeteaseAccount, NeteasePlaylist, NeteaseQrSession, NeteaseTrack } from "../../features/music/neteaseTypes";
import { loadMusicRemoteLibrary, toggleMusicRemoteLibraryItem } from "../../core/storage/repositories/musicRemoteLibraryRepository";
import type { MusicRemoteLibraryItem } from "../../types";

type MusicLibraryTab = "home" | "home-reference" | "local" | "netease" | "search";

interface MusicLibraryPanelProps {
  tracks: MusicTrack[];
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: MusicTrack) => void;
  onOpenPlayer: () => void;
  onOpenImport: () => void;
  onClose: () => void;
  playbackHistory: MusicPlaybackHistoryItem[];
  activeIdentityId: string;
}

const formatCount = (count: number) => `${count} 首`;

export default function MusicLibraryPanel({
  tracks,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onOpenPlayer,
  onOpenImport,
  onClose,
  playbackHistory,
  activeIdentityId,
}: MusicLibraryPanelProps) {
  const [tab, setTab] = useState<MusicLibraryTab>("home-reference");
  const [query, setQuery] = useState("");
  const [searchSource, setSearchSource] = useState<"local" | "netease">("local");
  const [remoteResults, setRemoteResults] = useState<NeteaseTrack[]>([]);
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [account, setAccount] = useState<NeteaseAccount | null>(null);
  const [playlists, setPlaylists] = useState<NeteasePlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<NeteasePlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<NeteaseTrack[]>([]);
  const [dailyRemoteTracks, setDailyRemoteTracks] = useState<NeteaseTrack[]>([]);
  const [qrSession, setQrSession] = useState<NeteaseQrSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRemoteTracks, setSavedRemoteTracks] = useState<MusicRemoteLibraryItem[]>([]);

  const localTracks = useMemo(() => tracks.filter((track) => track.source === "local" || track.isLocal), [tracks]);
  const filteredLocalTracks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return localTracks;
    return localTracks.filter((track) => `${track.title} ${track.artist}`.toLowerCase().includes(needle));
  }, [localTracks, query]);

  const loadAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextAccount, nextLibrary] = await Promise.all([getNeteaseAccount(), getNeteasePlaylists()]);
      setAccount(nextAccount);
      setPlaylists(nextLibrary.playlists);
      try {
        setDailyRemoteTracks(await getNeteaseDailyRecommendations());
      } catch {
        setDailyRemoteTracks([]);
      }
    } catch (nextError) {
      setAccount(null);
      setPlaylists([]);
      setDailyRemoteTracks([]);
      const message = nextError instanceof Error ? nextError.message : "网易云账号尚未连接。";
      if (!message.includes("请先连接")) setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccount();
  }, []);

  useEffect(() => {
    setSavedRemoteTracks(loadMusicRemoteLibrary(activeIdentityId, account?.userId));
  }, [activeIdentityId, account?.userId]);

  useEffect(() => {
    if (!qrSession || qrSession.status === "authorized" || qrSession.status === "expired") return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void checkNeteaseQrSession(qrSession.key).then((next) => {
        if (cancelled) return;
        setQrSession({ ...next, qrUrl: next.qrUrl || qrSession.qrUrl, qrImage: next.qrImage || qrSession.qrImage });
        if (next.status === "authorized") void loadAccount();
      }).catch((nextError) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "二维码状态查询失败。");
      });
    }, 2200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [qrSession?.key, qrSession?.status]);

  const handleStartLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      setQrSession(await createNeteaseQrSession());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "网易云二维码创建失败。");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logoutNetease();
      setAccount(null);
      setPlaylists([]);
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
      setQrSession(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "网易云退出失败。");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlaylist = async (playlist: NeteasePlaylist) => {
    setSelectedPlaylist(playlist);
    setTab("netease");
    setLoading(true);
    setError(null);
    try {
      setPlaylistTracks(await getNeteasePlaylistTracks(playlist.id));
    } catch (nextError) {
      setPlaylistTracks([]);
      setError(nextError instanceof Error ? nextError.message : "歌单歌曲读取失败。");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setSearchSubmitted(Boolean(query.trim()));
    if (searchSource !== "netease" || !query.trim() || !account) return;
    setLoading(true);
    setError(null);
    try {
      setRemoteResults(await searchNeteaseTracks(query.trim()));
    } catch (nextError) {
      setRemoteResults([]);
      setError(nextError instanceof Error ? nextError.message : "网易云搜索失败。");
    } finally {
      setLoading(false);
    }
  };

  const renderTrack = (track: MusicTrack, index: number, allowSave = false) => (
    <button
      key={track.id}
      type="button"
      onClick={() => onPlayTrack(track)}
      className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
        currentTrack?.id === track.id ? "border-[var(--accent)] bg-[var(--surface-selected)]" : "border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-muted)]"
      }`}
    >
      <span className="w-5 text-center text-[10px] text-[var(--text-tertiary)]">{String(index + 1).padStart(2, "0")}</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--text-secondary)]">
        {currentTrack?.id === track.id && isPlaying ? <Music2 className="h-4 w-4 animate-pulse" /> : <Play className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-[var(--text-primary)]">{track.title}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[var(--text-secondary)]">{track.artist}</span>
      </span>
      <span className="text-[9px] text-[var(--text-tertiary)]">{track.source === "netease" ? "网易云" : "本地"}</span>
      {allowSave && account?.userId && track.providerTrackId && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); setSavedRemoteTracks(toggleMusicRemoteLibraryItem(track, activeIdentityId, account.userId)); }} className={`rounded-lg px-2 py-1 text-[9px] font-bold ${savedRemoteTracks.some((item) => item.providerTrackId === track.providerTrackId) ? "bg-red-100 text-red-500" : "bg-[var(--surface-muted)] text-[var(--text-secondary)]"}`}>{savedRemoteTracks.some((item) => item.providerTrackId === track.providerTrackId) ? "已保存" : "保存"}</span>}
    </button>
  );

  const renderNetease = () => {
    if (!account) {
      return (
        <div className="space-y-4">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-500"><Cloud className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-extrabold text-[var(--text-primary)]">连接网易云音乐</h2>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">扫码后可以查看收藏歌单和歌曲。账号会话只保存在当前应用的安全 Cookie 中。</p>
              </div>
            </div>
            <button type="button" onClick={() => void handleStartLogin()} disabled={loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} 扫码连接
            </button>
          </div>
          {qrSession && (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 text-center">
              {qrSession.qrImage ? <img src={qrSession.qrImage} alt="网易云扫码登录二维码" className="mx-auto h-48 w-48 rounded-xl bg-white p-2" /> : <div className="flex h-48 items-center justify-center text-xs text-[var(--text-secondary)]">二维码地址已生成，请使用网易云 App 扫码</div>}
              <p className="mt-3 text-xs font-bold text-[var(--text-primary)]">{qrSession.status === "scanned" ? "已扫码，请在手机上确认" : qrSession.status === "authorized" ? "登录成功" : qrSession.status === "expired" ? "二维码已过期，请重新生成" : "等待扫码"}</p>
              {qrSession.status === "expired" && <button type="button" onClick={() => void handleStartLogin()} className="mt-3 text-xs font-bold text-red-500">重新生成二维码</button>}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {!selectedPlaylist && <div className="flex items-center gap-3 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-red-500/10 text-red-500">{account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{account.nickname || "网易云用户"}</p><p className="mt-1 text-[10px] text-[var(--text-secondary)]">网易云音乐已连接</p></div>
          <button type="button" onClick={() => void handleLogout()} className="rounded-xl p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] hover:text-red-500" title="退出网易云"><LogOut className="h-4 w-4" /></button>
        </div>}
        {selectedPlaylist ? (
          <div className="space-y-3"><h2 className="text-base font-extrabold text-[var(--text-primary)]">{selectedPlaylist.name}</h2>{loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : playlistTracks.length ? playlistTracks.map((track, index) => renderTrack(createNeteaseMusicTrack({ accountUserId: account.userId, track }), index, true)) : <p className="py-10 text-center text-xs text-[var(--text-secondary)]">这个歌单暂时没有可读取的歌曲。</p>}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">{playlists.map((playlist) => <button type="button" key={playlist.id} onClick={() => void handleSelectPlaylist(playlist)} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] text-left hover:bg-[var(--surface-muted)]"><div className="flex aspect-square items-center justify-center bg-[var(--surface-muted)] text-red-400">{playlist.coverUrl ? <img src={playlist.coverUrl} alt="" className="h-full w-full object-cover" /> : <ListMusic className="h-8 w-8" />}</div><div className="p-3"><p className="truncate text-xs font-bold text-[var(--text-primary)]">{playlist.name}</p><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{formatCount(playlist.trackCount || 0)}</p></div></button>)}</div>
        )}
      </div>
    );
  };

  const renderHomeSearch = () => (
    <div className="mb-4 space-y-2">
      <form onSubmit={handleSearch} className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5">
        <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
        <input value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value.trim()) setSearchSubmitted(false); }} placeholder={searchSource === "local" ? "搜索本地音乐" : "搜索网易云音乐"} className="min-w-0 flex-1 !bg-transparent text-xs text-[var(--text-primary)] outline-none" style={{ backgroundColor: "transparent" }} />
        <button type="submit" className="rounded-xl bg-[var(--text-primary)] px-3 py-1.5 text-[10px] font-bold text-[var(--surface)]">搜索</button>
      </form>
      {searchSubmitted && (searchSource === "local" ? (filteredLocalTracks.length ? <div className="space-y-2">{filteredLocalTracks.map(renderTrack)}</div> : <p className="py-3 text-center text-xs text-[var(--text-secondary)]">暂无匹配的本地歌曲。</p>) : (loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : remoteResults.length ? <div className="space-y-2">{remoteResults.map((track, index) => renderTrack(createNeteaseMusicTrack({ accountUserId: account?.userId || "unknown", track }), index, true))}</div> : <p className="py-3 text-center text-xs text-[var(--text-secondary)]">暂无网易云搜索结果。</p>))}
    </div>
  );

  const renderReferenceHome = () => {
    const albumPlaylists = playlists.slice(0, 6);
    const dailyTracks = account && dailyRemoteTracks.length ? dailyRemoteTracks.map((track) => createNeteaseMusicTrack({ accountUserId: account.userId, track })) : (localTracks.length ? localTracks.slice(0, 3) : tracks.slice(0, 3));
    return (
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-extrabold text-[var(--text-primary)]">推荐专辑</h2><button type="button" onClick={() => setTab("netease")} className="text-[10px] font-bold text-[var(--text-secondary)]">更多</button></div>
          {albumPlaylists.length ? <div className="flex gap-3 overflow-x-auto pb-1">{albumPlaylists.map((playlist) => <button key={playlist.id} type="button" onClick={() => void handleSelectPlaylist(playlist)} className="w-[112px] shrink-0 text-left"><div className="aspect-square overflow-hidden rounded-xl bg-[var(--surface-muted)]">{playlist.coverUrl ? <img src={playlist.coverUrl} alt="" className="h-full w-full object-cover" /> : <Disc3 className="m-auto h-10 w-10 translate-y-9 text-[var(--text-tertiary)]" />}</div><p className="mt-2 truncate text-[11px] font-bold text-[var(--text-primary)]">{playlist.name}</p></button>)}</div> : <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-[11px] text-[var(--text-secondary)]">连接网易云后显示推荐歌单</div>}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-extrabold text-[var(--text-primary)]">每日推荐</h2><button type="button" className="text-[10px] text-[var(--text-secondary)]">更多</button></div>
          {dailyTracks.length ? <div>{dailyTracks.map((track) => <div key={track.id} className="flex items-center gap-3 py-2.5"><button type="button" onClick={() => onPlayTrack(track)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-muted)]">{track.coverUrl ? <img src={track.coverUrl} alt="" className="h-full w-full object-cover" /> : <Music2 className="h-5 w-5 text-[var(--text-secondary)]" />}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--text-primary)]">{track.title}</span><span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">{track.artist || "未知艺术家"}</span></span></button><button type="button" aria-label={`更多操作：${track.title}`} className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"><span className="block h-1 w-1 rounded-full bg-current shadow-[0_-4px_0_currentColor,0_4px_0_currentColor]" /></button></div>)}</div> : <p className="py-5 text-center text-[11px] text-[var(--text-secondary)]">上传音乐后，这里会显示每日推荐。</p>}
        </section>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pb-3 pt-2">
        <div className="relative flex h-9 items-center justify-between"><button type="button" onClick={() => selectedPlaylist ? setSelectedPlaylist(null) : onClose()} className="app-nav-icon-button flex h-8 w-8 items-center justify-center" title={selectedPlaylist ? "返回歌单" : "返回主页"} aria-label={selectedPlaylist ? "返回歌单" : "返回主页"}><ChevronLeft className="h-4 w-4" /></button><h1 className="absolute left-1/2 -translate-x-1/2 text-base font-bold text-[var(--text-primary)]">音乐库</h1><span className="h-8 w-8" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        {error && <div className={`mb-3 flex items-start gap-2 rounded-2xl border px-3 py-2 text-[11px] ${error.includes("NETEASE_API_BASE_URL") ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-600"}`}><span className="flex-1">{error}</span><button type="button" onClick={() => setError(null)} aria-label="关闭提示"><X className="h-3.5 w-3.5" /></button></div>}
        {tab === "home-reference" && renderHomeSearch()}
        {tab === "home-reference" && renderReferenceHome()}
        {tab === "home" && <div className="space-y-4"><button type="button" onClick={onOpenPlayer} className="w-full rounded-3xl bg-gradient-to-br from-neutral-950 to-stone-700 p-5 text-left text-white shadow-lg"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Now playing</span><Play className="h-4 w-4" /></div><p className="mt-8 truncate text-lg font-black">{currentTrack?.title || "还没有开始播放"}</p><p className="mt-1 truncate text-xs text-white/65">{currentTrack?.artist || "从本地音乐或网易云歌单开始"}</p><div className="mt-5 h-1 rounded-full bg-white/20"><div className="h-full w-1/3 rounded-full bg-white/80" /></div></button><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setTab("local")} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-left"><Upload className="h-5 w-5 text-[var(--text-secondary)]" /><p className="mt-5 text-xs font-extrabold text-[var(--text-primary)]">本地音乐</p><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{formatCount(localTracks.length)}</p></button><button type="button" onClick={() => setTab("netease")} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-left"><Heart className="h-5 w-5 text-red-400" /><p className="mt-5 text-xs font-extrabold text-[var(--text-primary)]">网易云收藏</p><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{account ? `${playlists.length} 个歌单` : "未连接"}</p></button></div>{playbackHistory.length > 0 && <div><div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-[var(--text-primary)]"><ListMusic className="h-3.5 w-3.5" />最近播放</div><div className="space-y-1.5">{playbackHistory.slice(0, 5).map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface-raised)] px-3 py-2"><span className="min-w-0 flex-1 truncate text-[11px] font-bold text-[var(--text-primary)]">{item.title}<span className="ml-1 font-normal text-[var(--text-secondary)]">· {item.artist}</span></span><span className="text-[9px] text-[var(--text-tertiary)]">{item.source === "netease" ? "网易云" : "本地"}</span></div>)}</div></div>}</div>}
        {tab === "local" && <div className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="text-base font-extrabold text-[var(--text-primary)]">本地音乐</h2><p className="mt-1 text-[10px] text-[var(--text-secondary)]">音频文件继续保存在本机 IndexedDB</p></div><button type="button" onClick={onOpenImport} className="flex items-center gap-1 rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-[10px] font-bold text-[var(--text-primary)]"><Upload className="h-3.5 w-3.5" />上传</button></div>{filteredLocalTracks.length ? filteredLocalTracks.map(renderTrack) : <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center"><Download className="mx-auto h-7 w-7 text-[var(--text-tertiary)]" /><p className="mt-3 text-xs font-bold text-[var(--text-primary)]">还没有本地音乐</p><button type="button" onClick={onOpenImport} className="mt-3 text-xs font-bold text-[var(--text-secondary)]">上传第一首歌</button></div>}</div>}
        {tab === "netease" && renderNetease()}
        {tab === "search" && <div className="space-y-3"><div className="flex gap-1 rounded-2xl bg-[var(--surface-muted)] p-1"><button type="button" onClick={() => setSearchSource("local")} className={`flex-1 rounded-xl py-2 text-[10px] font-bold ${searchSource === "local" ? "bg-[var(--surface)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>本地音乐</button><button type="button" onClick={() => setSearchSource("netease")} className={`flex-1 rounded-xl py-2 text-[10px] font-bold ${searchSource === "netease" ? "bg-[var(--surface)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>网易云</button></div><form onSubmit={handleSearch} className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5"><Search className="h-4 w-4 text-[var(--text-tertiary)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchSource === "local" ? "搜索本地歌曲" : "搜索网易云歌曲"} className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none" /><button type="submit" className="rounded-xl bg-[var(--text-primary)] px-3 py-1.5 text-[10px] font-bold text-[var(--surface)]">搜索</button></form>{searchSource === "local" ? (filteredLocalTracks.length ? filteredLocalTracks.map(renderTrack) : <p className="py-10 text-center text-xs text-[var(--text-secondary)]">暂无匹配的本地歌曲。</p>) : (loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : remoteResults.length ? remoteResults.map((track, index) => renderTrack(createNeteaseMusicTrack({ accountUserId: account?.userId || "unknown", track }), index, true)) : <p className="py-10 text-center text-xs text-[var(--text-secondary)]">输入关键词搜索网易云歌曲。</p>)}</div>}
      </div>
      {currentTrack && <button type="button" onClick={onOpenPlayer} className="flex shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left shadow-[0_-6px_20px_rgba(0,0,0,0.06)]"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-muted)] text-[var(--text-secondary)]">{currentTrack.coverUrl ? <img src={currentTrack.coverUrl} alt="" className="h-full w-full object-cover" /> : <Music2 className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-[var(--text-primary)]">{currentTrack.title}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--text-secondary)]">{currentTrack.artist}</span></span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onPlayTrack(currentTrack); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface)]">{isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}</span></button>}
      <nav aria-label="音乐主导航" className="grid shrink-0 grid-cols-3 border-t border-[var(--border)] bg-[var(--surface)]/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        {([ ["home-reference", "首页", Library], ["local", "本地", Disc3], ["netease", "网易云", Cloud] ] as const).map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-bold ${tab === id ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}><Icon className="h-5 w-5" strokeWidth={tab === id ? 2.2 : 1.6} />{label}</button>)}
      </nav>
    </div>
  );
}
