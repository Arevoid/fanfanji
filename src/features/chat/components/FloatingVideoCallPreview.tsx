import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import { clampFloatingCallPosition, type FloatingCallPoint } from "../services/floatingCallPosition";

interface Props {
  name: string;
  avatar: string;
  selfAvatar?: string;
  cameraStream: MediaStream | null;
  status: "ringing" | "connected" | "ended";
  duration: number;
  onRestore: () => void;
}

/** Presentation only: moving/restoring never starts or ends a call or request. */
export function FloatingVideoCallPreview({ name, avatar, selfAvatar, cameraStream, status, duration, onRestore }: Props) {
  const root = useRef<HTMLButtonElement>(null);
  const camera = useRef<HTMLVideoElement>(null);
  const [position, setPosition] = useState<FloatingCallPoint | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; start: FloatingCallPoint; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const bounds = () => root.current?.parentElement?.getBoundingClientRect();
  const clamped = (point: FloatingCallPoint) => {
    const rect = bounds();
    return rect ? clampFloatingCallPosition(point, rect) : point;
  };
  useEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent) return;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      setPosition(previous => clampFloatingCallPosition(previous || { left: rect.width - 112, top: rect.height * 0.55 }, rect));
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(parent);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); };
  }, []);
  useEffect(() => {
    const video = camera.current;
    if (!video || !cameraStream) return;
    video.srcObject = cameraStream;
    void video.play().catch(() => undefined);
    return () => { video.srcObject = null; }; // The full call owns and stops tracks.
  }, [cameraStream]);
  return <button
    ref={root}
    type="button"
    aria-label={`返回与${name}的视频通话`}
    title="点击返回通话，拖动移动小窗；方向键移动"
    data-floating-video-call
    className="pointer-events-auto absolute z-10 h-[148px] w-[104px] touch-none select-none overflow-hidden rounded-xl border-0 bg-slate-900 text-white shadow-lg shadow-black/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
    style={{ left: position?.left ?? 8, top: position?.top ?? 8, border: 0 }}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const area = bounds();
      if (!area) return;
      suppressClick.current = false;
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: { left: rect.left - area.left, top: rect.top - area.top }, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const pending = drag.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      const dx = event.clientX - pending.x, dy = event.clientY - pending.y;
      if (Math.hypot(dx, dy) > 6) pending.moved = true;
      if (pending.moved) {
        suppressClick.current = true;
        setPosition(clamped({ left: pending.start.left + dx, top: pending.start.top + dy }));
      }
    }}
    onPointerUp={event => {
      if (drag.current?.pointerId !== event.pointerId) return;
      suppressClick.current = drag.current.moved;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
    onLostPointerCapture={() => { drag.current = null; }}
    onClick={() => { if (!suppressClick.current) onRestore(); suppressClick.current = false; }}
    onKeyDown={event => {
      const direction = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
      if (direction) { event.preventDefault(); setPosition(previous => clamped({ left: (previous?.left || 0) + direction[0], top: (previous?.top || 0) + direction[1] })); }
      else if (event.key === "Enter" || event.key === " ") suppressClick.current = false;
    }}
  >
    {avatar ? <img src={avatar} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" /> : <Video className="absolute left-9 top-12 h-8 w-8 text-white/60" />}
    <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/15" />
    <span className="absolute right-1 top-1 h-11 w-8 overflow-hidden rounded-md border-0 bg-slate-800">
      {cameraStream ? <video ref={camera} autoPlay muted playsInline className="h-full w-full object-cover" aria-label="我的摄像头小窗" /> : selfAvatar ? <img src={selfAvatar} alt="" draggable={false} className="h-full w-full object-cover" /> : <Video className="m-auto mt-3 h-4 w-4 text-white/60" />}
    </span>
    <span className="absolute inset-x-1 bottom-2 text-center"><span className="block truncate text-[10px]">{name}</span><span className="block text-[11px] tabular-nums">{status === "connected" ? `${Math.floor(duration / 60).toString().padStart(2, "0")}:${(duration % 60).toString().padStart(2, "0")}` : "呼叫中…"}</span></span>
  </button>;
}
