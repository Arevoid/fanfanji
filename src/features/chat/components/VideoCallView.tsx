import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Camera, Clock3, Image as ImageIcon, LockKeyhole, Maximize2, Mic, Phone, Send, UserRound, Video, X } from "lucide-react";
import type { Character } from "../../../types";
import type { CallTranscriptItem } from "../services/messageParser";
import type { VideoCallInputMode } from "../hooks/useChatAttachmentState";
import { getVideoCallDisplayText, parseVideoCallResponse, type VideoCallSceneEntry } from "../services/videoCallProtocol";

interface VideoCallViewProps {
  character: Character;
  userName: string;
  userAvatar?: string;
  status: "ringing" | "connected" | "ended";
  duration: number;
  isIncoming: boolean;
  isTyping: boolean;
  inputText: string;
  inputMode: VideoCallInputMode;
  transcript: readonly CallTranscriptItem[];
  scene: string;
  selfScene: string;
  sceneHistory: readonly VideoCallSceneEntry[];
  onInputTextChange: (value: string) => void;
  onInputModeChange: (mode: VideoCallInputMode) => void;
  onSend: () => void;
  onEnd: () => void;
}

const formatDuration = (duration: number) => `${Math.floor(duration / 60).toString().padStart(2, "0")}:${(duration % 60).toString().padStart(2, "0")}`;

export function VideoCallView({
  character,
  userName,
  userAvatar,
  status,
  duration,
  isIncoming,
  isTyping,
  inputText,
  inputMode,
  transcript,
  scene,
  selfScene,
  sceneHistory,
  onInputTextChange,
  onInputModeChange,
  onSend,
  onEnd,
}: VideoCallViewProps) {
  const [showSceneHistory, setShowSceneHistory] = useState(false);
  const [showSelfSceneTicker, setShowSelfSceneTicker] = useState(false);
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null);
  const stickTranscriptToBottomRef = useRef(true);
  const characterName = character.remark || character.name;
  const avatar = character.avatar || "";
  const sceneText = scene.includes("[台词]") || scene.includes("【台词】") || scene.includes("[对话]") || scene.includes("【对话】")
    ? (parseVideoCallResponse(scene).scene || scene)
    : scene;

  useEffect(() => {
    const viewport = transcriptViewportRef.current;
    if (!viewport || !stickTranscriptToBottomRef.current) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [transcript.length, isTyping]);

  // Show each user camera description in the single name strip once, then
  // return to the user's name. A later description starts a fresh cycle.
  useEffect(() => {
    if (!selfScene.trim()) {
      setShowSelfSceneTicker(false);
      return;
    }
    setShowSelfSceneTicker(true);
    const timer = window.setTimeout(() => setShowSelfSceneTicker(false), 8000);
    return () => window.clearTimeout(timer);
  }, [selfScene]);

  const handleTranscriptScroll = () => {
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;
    stickTranscriptToBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 28;
  };

  return (
    <div className="absolute inset-0 z-50 flex transform-gpu flex-col overflow-hidden bg-[#080910] text-white animate-fade-in" data-video-call-view>
      <div className="absolute -inset-5 scale-105 bg-cover bg-center blur-[6px]" style={{ backgroundImage: avatar ? `url(${avatar})` : undefined }} />
      <div className="absolute inset-0 bg-[#080910]/25" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/0 to-black/78" />

      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+10px)] text-white/85">
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20" aria-label="展开视频画面"><Maximize2 className="h-4 w-4" /></button>
        <div className="text-center"><p className="text-[13px] font-bold tracking-wide">{characterName}</p><p className="mt-0.5 text-[10px] text-white/65">{status === "connected" ? formatDuration(duration) : isIncoming ? "邀请你视频通话" : "正在接通..."}</p></div>
        <div className="flex items-center gap-3"><button type="button" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/20" aria-label="锁定视频通话"><LockKeyhole className="h-4 w-4" /></button><button type="button" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/20" aria-label="视频通话设置"><UserRound className="h-4 w-4" /></button></div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-1">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-video-call-scene>
          <div className="absolute right-1 top-1 z-20 w-[92px] overflow-hidden rounded-2xl border border-white/35 bg-black/35 shadow-xl backdrop-blur-sm" data-video-call-self-preview>
            <div className="aspect-[3/4] w-full bg-white/10">{userAvatar ? <img src={userAvatar} alt={userName} className="h-full w-full object-cover" /> : <ImageIcon className="mx-auto mt-8 h-6 w-6 text-white/60" />}</div>
            <div className="overflow-hidden px-2 py-1 text-center text-[9px] text-white/75">
              {showSelfSceneTicker && selfScene ? (
                <div key={selfScene} className="video-call-self-scene-strip" aria-label={`我的画面：${selfScene}`}>
                  <div className="video-call-self-scene-marquee inline-block whitespace-nowrap">画面：{selfScene}</div>
                </div>
              ) : <p className="truncate">{userName || "我"}</p>}
            </div>
          </div>

          <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 text-center text-[12px] leading-relaxed text-white/90 drop-shadow-lg">
            <p>{status === "connected" ? (sceneText || "等待对方画面...") : "视频通话准备中"}</p>
          </div>

          {status === "connected" && (transcript.length > 0 || isTyping) && <div ref={transcriptViewportRef} onScroll={handleTranscriptScroll} className="absolute bottom-3 left-1 flex max-h-[34%] w-[86%] flex-col gap-1 overflow-y-auto overscroll-contain pr-1 text-[12px] leading-relaxed [scrollbar-width:thin]" data-video-call-subtitles>
            {transcript.filter((item) => {
              if (item.sender !== "user") return true;
              const content = item.content.trim();
              // Hide both the current wire format and legacy scene subtitles
              // that may already exist in a persisted call transcript.
              const legacyFreeText = content.replace(/^\[(?:视频画面|视频说话)\]\|/u, "").trim();
              return !content.startsWith("[视频画面]|")
                && !legacyFreeText.startsWith("画面：")
                && !legacyFreeText.startsWith("画面:");
            }).map((item) => {
              const isUserMessage = item.sender === "user";
              return <div key={item.id} className={`max-w-[92%] rounded-lg bg-black/40 px-3 py-1.5 text-white/90 shadow-lg backdrop-blur-sm ${isUserMessage ? "self-end text-right" : "self-start"}`}><span className="mr-1 text-[10px] text-white/55">{isUserMessage ? "我：" : `${characterName}：`}</span>{getVideoCallDisplayText(item.content)}</div>;
            })}
            {isTyping && <div className="flex w-fit items-center gap-1 rounded-lg bg-black/40 px-3 py-2 text-white/80 shadow-lg backdrop-blur-sm" aria-live="polite" aria-label="对方正在说话"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" style={{ animationDelay: "0ms" }} /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" style={{ animationDelay: "140ms" }} /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" style={{ animationDelay: "280ms" }} /></div>}
          </div>}
        </div>

        {status === "ringing" ? <div className="flex shrink-0 justify-center py-5 text-xs text-white/60">{isIncoming ? "等待你接听视频通话" : "等待对方接受视频通话..."}</div> : <div className="relative z-20 mt-1 flex shrink-0 items-end gap-2 rounded-lg border border-white/25 bg-black/35 p-1.5 backdrop-blur-md">
          <div className="min-w-0 flex-1"><div className="mb-0.5 flex items-center gap-1 px-1 text-[9px] text-white/60">{inputMode === "scene" ? <Video className="h-3 w-3" /> : <Mic className="h-3 w-3" />}<span>{inputMode === "scene" ? "描述我的画面" : "对话"}</span></div><input type="text" value={inputText} onChange={(event) => onInputTextChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSend(); }} disabled={isTyping} placeholder={inputMode === "scene" ? "例如：我把镜头转向窗外..." : "说点什么..."} className="h-9 w-full rounded-md border border-white/20 bg-white/10 px-2.5 text-xs text-white outline-none placeholder:text-white/40 focus:border-white/45" aria-label={inputMode === "scene" ? "输入我的画面描述" : "输入视频通话内容"} /></div>
          <button type="button" onClick={() => onInputModeChange(inputMode === "speech" ? "scene" : "speech")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white/85" title="切换输入内容类型" aria-label="切换说话和画面描述">{inputMode === "scene" ? <Video className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}</button>
          <button type="button" onClick={onSend} disabled={!inputText.trim() || isTyping} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/85 text-slate-950 disabled:opacity-35" aria-label="发送视频通话内容"><Send className="h-4 w-4" /></button>
        </div>}
      </main>

      <footer className="relative z-10 flex shrink-0 items-center justify-between px-8 pb-[calc(env(safe-area-inset-bottom,0px)+14px)] pt-3">
          <button type="button" onClick={() => setShowSceneHistory(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/85" aria-label="查看对方历史画面"><Clock3 className="h-5 w-5" /></button>
        <button type="button" onClick={onEnd} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-xl shadow-red-950/40 active:scale-95" aria-label="挂断视频通话"><Phone className="h-7 w-7 rotate-[135deg] fill-current" /></button>
        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/85" aria-label="切换摄像头"><Camera className="h-5 w-5" /></button>
      </footer>

      {showSceneHistory && <div className="absolute inset-0 z-40 flex items-end bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-label="对方历史画面">
        <div className="max-h-[62%] w-full overflow-hidden rounded-2xl border border-white/20 bg-[#11131c]/95 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div><p className="text-sm font-semibold text-white">对方历史画面</p><p className="mt-0.5 text-[10px] text-white/50">本次通话已生成 {sceneHistory.length} 条</p></div>
            <button type="button" onClick={() => setShowSceneHistory(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/75" aria-label="关闭历史画面"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-[calc(62vh-72px)] space-y-2 overflow-y-auto p-3 [scrollbar-width:thin]">
            {sceneHistory.length === 0 ? <p className="py-8 text-center text-xs text-white/50">暂时还没有画面记录</p> : sceneHistory.slice().reverse().map((entry) => <div key={entry.id} className="rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed text-white/85"><p>{entry.content}</p><p className="mt-1 text-[10px] text-white/40">{new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div>)}
          </div>
        </div>
      </div>}
    </div>
  );
}
