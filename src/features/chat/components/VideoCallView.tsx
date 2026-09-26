import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeftRight, Camera, Clock3, Image as ImageIcon, Maximize2, Mic, Phone, Send, UserRound, Video, X } from "lucide-react";
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
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onCameraFrame: (imageDataUrl: string) => void;
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
  onAccept,
  onReject,
  onEnd,
  onCameraFrame,
}: VideoCallViewProps) {
  const [showSceneHistory, setShowSceneHistory] = useState(false);
  const [showSelfSceneTicker, setShowSelfSceneTicker] = useState(false);
  const [selfPreviewPosition, setSelfPreviewPosition] = useState<{ left: number; top: number } | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const callViewRef = useRef<HTMLDivElement | null>(null);
  const selfPreviewRef = useRef<HTMLDivElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const previewMovedRef = useRef(false);
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

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video || !cameraStream) return;
    video.srcObject = cameraStream;
    void video.play().catch(() => undefined);
    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraStream]);

  useEffect(() => () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);

  const captureCameraFrame = () => {
    const video = cameraVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setCameraError("摄像头画面还在准备中，请稍后再试");
      return;
    }
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("无法读取摄像头画面");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCameraError("");
    onCameraFrame(canvas.toDataURL("image/jpeg", 0.78));
  };

  const handleCameraClick = async () => {
    if (cameraStarting) return;
    if (cameraStream) {
      captureCameraFrame();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("当前浏览器不支持摄像头调用");
      return;
    }
    setCameraStarting(true);
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacingMode } }, audio: false });
      setCameraStream(stream);
    } catch (error) {
      setCameraError(error instanceof DOMException && error.name === "NotAllowedError" ? "摄像头权限被拒绝" : "无法打开摄像头");
    } finally {
      setCameraStarting(false);
    }
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  };

  const switchCamera = async () => {
    if (!cameraStream || cameraStarting || !navigator.mediaDevices?.getUserMedia) return;
    const nextFacingMode = cameraFacingMode === "user" ? "environment" : "user";
    setCameraStarting(true);
    setCameraError("");
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacingMode } }, audio: false });
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(nextStream);
      setCameraFacingMode(nextFacingMode);
    } catch (error) {
      setCameraError(error instanceof DOMException && error.name === "NotAllowedError" ? "切换摄像头需要浏览器权限" : "暂时无法切换摄像头");
    } finally {
      setCameraStarting(false);
    }
  };

  const handleCallEnd = () => {
    stopCamera();
    onEnd();
  };

  const handleSelfPreviewPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const root = callViewRef.current;
    const preview = selfPreviewRef.current;
    if (!root || !preview) return;
    const rootRect = root.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    setSelfPreviewPosition({ left: previewRect.left - rootRect.left, top: previewRect.top - rootRect.top });
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - previewRect.left,
      offsetY: event.clientY - previewRect.top,
    };
    previewMovedRef.current = false;
    preview.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleSelfPreviewPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const root = callViewRef.current;
    const preview = selfPreviewRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !root || !preview) return;
    previewMovedRef.current = true;
    const rootRect = root.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const left = Math.max(0, Math.min(rootRect.width - previewRect.width, event.clientX - rootRect.left - drag.offsetX));
    const top = Math.max(0, Math.min(rootRect.height - previewRect.height, event.clientY - rootRect.top - drag.offsetY));
    setSelfPreviewPosition({ left, top });
  };

  const handleSelfPreviewPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      selfPreviewRef.current?.releasePointerCapture(event.pointerId);
      if (!previewMovedRef.current && cameraStream) void switchCamera();
    }
  };

  const handleTranscriptScroll = () => {
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;
    stickTranscriptToBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 28;
  };

  return (
    <div ref={callViewRef} className="absolute inset-0 z-50 flex transform-gpu flex-col overflow-hidden bg-[#080910] text-white animate-fade-in" data-video-call-view>
      <div className="absolute -inset-5 scale-105 bg-cover bg-center blur-[6px]" style={{ backgroundImage: avatar ? `url(${avatar})` : undefined }} />
      <div className="absolute inset-0 bg-[#080910]/25" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/0 to-black/78" />

      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+10px)] text-white/85">
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20" aria-label="展开视频画面"><Maximize2 className="h-4 w-4" /></button>
        <div className="text-center"><p className="text-[13px] font-bold tracking-wide">{characterName}</p><p className="mt-0.5 text-[10px] text-white/65">{status === "connected" ? formatDuration(duration) : isIncoming ? "邀请你视频通话" : "正在呼叫..."}</p></div>
        <div className="flex items-center gap-3"><button type="button" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/20" aria-label="视频通话设置"><UserRound className="h-4 w-4" /></button></div>
      </header>

      <div
        ref={selfPreviewRef}
        className={`absolute z-[70] w-[92px] touch-none select-none overflow-hidden rounded-2xl border border-white/35 bg-black/35 shadow-xl backdrop-blur-sm ${selfPreviewPosition ? "" : "right-1 top-[calc(env(safe-area-inset-top,0px)+58px)]"}`}
        style={selfPreviewPosition ? { left: selfPreviewPosition.left, top: selfPreviewPosition.top } : undefined}
        onPointerDown={handleSelfPreviewPointerDown}
        onPointerMove={handleSelfPreviewPointerMove}
        onPointerUp={handleSelfPreviewPointerUp}
        onPointerCancel={handleSelfPreviewPointerUp}
        data-video-call-self-preview
        aria-label="拖动我的视频窗口"
      >
        <div className="aspect-[3/4] w-full bg-white/10">
          {cameraStream ? <video ref={cameraVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" aria-label="我的摄像头画面" /> : userAvatar ? <img src={userAvatar} alt={userName} className="h-full w-full object-cover" /> : <ImageIcon className="mx-auto mt-8 h-6 w-6 text-white/60" />}
        </div>
        <div className="overflow-hidden px-2 py-1 text-center text-[9px] text-white/75">
          {showSelfSceneTicker && selfScene ? <div key={selfScene} className="video-call-self-scene-strip" aria-label={`我的画面：${selfScene}`}><div className="video-call-self-scene-marquee inline-block whitespace-nowrap">画面：{selfScene}</div></div> : <p className="truncate">{userName || "我"}</p>}
        </div>
        {cameraError && <p className="border-t border-red-300/20 bg-red-950/70 px-1 py-1 text-center text-[8px] leading-tight text-red-100">{cameraError}</p>}
      </div>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-1">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-video-call-scene>

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
        {status === "ringing" && isIncoming ? <>
          <button type="button" onClick={() => { stopCamera(); onReject(); }} className="flex flex-col items-center gap-1.5" aria-label="拒绝视频通话">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-xl shadow-red-950/40 active:scale-95"><Phone className="h-7 w-7 rotate-[135deg] fill-current" /></span>
            <span className="text-[11px] text-white/70">拒绝</span>
          </button>
          <button type="button" onClick={onAccept} className="flex flex-col items-center gap-1.5" aria-label="接听视频通话">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-950/40 active:scale-95"><Phone className="h-7 w-7 fill-current" /></span>
            <span className="text-[11px] text-white/70">接听</span>
          </button>
        </> : status === "ringing" ? <button type="button" onClick={handleCallEnd} className="mx-auto flex flex-col items-center gap-1.5" aria-label="取消视频通话">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-xl shadow-red-950/40 active:scale-95"><Phone className="h-7 w-7 rotate-[135deg] fill-current" /></span>
          <span className="text-[11px] text-white/70">取消</span>
        </button> : <>
          <button type="button" onClick={() => setShowSceneHistory(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/85" aria-label="查看对方历史画面"><Clock3 className="h-5 w-5" /></button>
          <button type="button" onClick={handleCallEnd} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-xl shadow-red-950/40 active:scale-95" aria-label="挂断视频通话"><Phone className="h-7 w-7 rotate-[135deg] fill-current" /></button>
          <button type="button" onClick={() => void handleCameraClick()} disabled={cameraStarting} className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/85 ${cameraStream ? "ring-2 ring-red-300/80" : ""}`} aria-label={cameraStream ? "拍摄并发送我的摄像头画面" : "打开我的摄像头"} title={cameraStream ? "拍摄并发送画面" : "打开摄像头"}><Camera className="h-5 w-5" /></button>
        </>}
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
