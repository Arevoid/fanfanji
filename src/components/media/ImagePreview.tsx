import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { downloadImageFile, isPreviewImageUrl, prepareImageFile, saveImageFile, type PreviewImageSource } from "../../utils/imageSave";

/** Also used by an existing gallery detail view without replacing its edit controls. */
export function ImageSaveButton({ source }: { source: PreviewImageSource; key?: string }) {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const requestRef = useRef<AbortController>();
  useEffect(() => () => requestRef.current?.abort(), []);
  const save = async () => {
    if (busy) return;
    const request = new AbortController(); requestRef.current = request; setBusy(true); setStatus("");
    const timer = setTimeout(() => request.abort(), 30_000);
    try {
      const file = await prepareImageFile(source, request.signal);
      if (request.signal.aborted) return;
      const result = await saveImageFile(file, { canShare: navigator.canShare?.bind(navigator), share: navigator.share?.bind(navigator), download: downloadImageFile });
      setStatus(result === "downloaded" ? "已发起下载，请查看下载记录。" : result === "shared" ? "请确认系统分享中的保存位置。" : "");
    } catch { if (!request.signal.aborted) setStatus("保存失败，请重试或打开原图。"); }
    finally { clearTimeout(timer); setBusy(false); }
  };
  return <div className="relative text-center"><button type="button" disabled={busy} className="min-h-11 px-2 text-xs disabled:opacity-40" onClick={() => void save()}>{busy ? "正在保存…" : "保存图片"}</button>{status && <div role="status" className="absolute bottom-full left-1/2 w-64 -translate-x-1/2 rounded-lg bg-black/90 p-2 text-xs text-white">{status}{source.src && isPreviewImageUrl(source.src) && <a href={source.src} target="_blank" rel="noopener noreferrer" className="ml-2 underline">打开原图</a>}</div>}</div>;
}

export function ImagePreview({ images, initialIndex = 0, onClose }: { images: readonly PreviewImageSource[]; initialIndex?: number; onClose: () => void }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)));
  const item = images[index];
  const [url, setUrl] = useState(""), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const points = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number }>();
  const swipe = useRef<{ x: number; y: number }>();
  const controller = useRef<AbortController>();
  const closeButton = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDivElement>(null);
  const change = (next: number) => { if (!busy && next >= 0 && next < images.length) setIndex(next); };
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; closeButton.current?.focus();
    return () => { document.body.style.overflow = overflow; previousFocus?.focus({ preventScroll: true }); controller.current?.abort(); };
  }, []);
  useEffect(() => {
    let active = true, objectUrl: string | undefined;
    setUrl(""); setFailed(false); setStatus(""); setView({ scale: 1, x: 0, y: 0 }); points.current.clear(); gesture.current = undefined;
    if (item?.src && isPreviewImageUrl(item.src)) setUrl(item.src);
    else if (item?.load) void item.load().then(blob => { if (!active) return; if (!blob) { setFailed(true); return; } objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => { if (active) setFailed(true); });
    else setFailed(true);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [index, retry]);
  const save = async () => {
    if (busy || !item) return;
    setBusy(true); setStatus(""); const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 30_000);
    try {
      const file = await prepareImageFile(item, request.signal);
      if (request.signal.aborted) return;
      const result = await saveImageFile(file, { canShare: navigator.canShare?.bind(navigator), share: navigator.share?.bind(navigator), download: downloadImageFile });
      setStatus(result === "downloaded" ? "已发起下载，请查看浏览器下载记录。" : result === "shared" ? "已完成系统分享操作，请确认保存位置。" : "");
    } catch (error) { if (!request.signal.aborted) setStatus(error instanceof Error ? error.message : "保存失败，请重试或打开原图。"); else setStatus("读取图片已停止，可重试或打开原图。"); }
    finally { clearTimeout(timeout); setBusy(false); }
  };
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="图片预览" className="fixed inset-0 z-[2147483000] flex flex-col bg-black/95 text-white" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape") onClose();
    if (event.key === "ArrowLeft") change(index - 1); if (event.key === "ArrowRight") change(index + 1);
    if (event.key === "Tab") { const buttons = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []) as HTMLElement[]; const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}>
    <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
      <button ref={closeButton} type="button" className="min-h-11 px-3 text-sm" onClick={onClose} aria-label="关闭图片预览">关闭</button>
      <span className="text-sm">{index + 1} / {images.length}</span>
      <button type="button" disabled={busy || failed || !url} className="min-h-11 rounded-full bg-white/15 px-4 text-sm disabled:opacity-40" onClick={() => void save()}>{busy ? "正在保存…" : "保存图片"}</button>
    </header>
    <div className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden" onDoubleClick={() => setView(current => current.scale === 1 ? { scale: 2, x: 0, y: 0 } : { scale: 1, x: 0, y: 0 })}
      onWheel={event => setView(current => ({ ...current, scale: Math.max(1, Math.min(5, current.scale - event.deltaY * 0.005)) }))}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); points.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (points.current.size === 1) swipe.current = { x: event.clientX, y: event.clientY }; if (points.current.size === 2) { const [a, b] = [...points.current.values()]; gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale }; swipe.current = undefined; } }}
      onPointerMove={event => { const old = points.current.get(event.pointerId); if (!old) return; points.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (points.current.size === 2 && gesture.current) { const [a, b] = [...points.current.values()], g = gesture.current; setView(current => ({ ...current, scale: Math.max(1, Math.min(5, g.scale * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, g.distance))) })); } else if (view.scale > 1) setView(current => ({ ...current, x: current.x + event.clientX - old.x, y: current.y + event.clientY - old.y })); }}
      onPointerUp={event => { points.current.delete(event.pointerId); gesture.current = undefined; const start = swipe.current; if (view.scale === 1 && start && Math.abs(event.clientX - start.x) > 60 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y) * 1.2) change(index + (event.clientX < start.x ? 1 : -1)); swipe.current = undefined; }}
      onPointerCancel={() => { points.current.clear(); gesture.current = undefined; swipe.current = undefined; }}>
      {!failed && url ? <img key={`${index}-${retry}`} src={url} alt={item?.alt || "图片原图"} draggable={false} onError={() => setFailed(true)} className="max-h-full max-w-full select-none object-contain" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} /> : <p className="px-6 text-center text-sm">{failed ? "图片加载失败" : "正在加载图片…"}</p>}
    </div>
    <footer className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2 text-center text-xs">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {images.length > 1 && <button type="button" disabled={busy || index === 0} className="min-h-11 px-2 disabled:opacity-30" onClick={() => change(index - 1)}>上一张</button>}
        <button type="button" className="min-h-11 px-2" onClick={() => setView({ scale: 1, x: 0, y: 0 })}>还原大小</button>
        {failed && <button type="button" className="min-h-11 px-2" onClick={() => setRetry(value => value + 1)}>重试加载</button>}
        {url && <a className="inline-flex min-h-11 items-center px-2" href={url} target="_blank" rel="noopener noreferrer">打开原图</a>}
        {images.length > 1 && <button type="button" disabled={busy || index === images.length - 1} className="min-h-11 px-2 disabled:opacity-30" onClick={() => change(index + 1)}>下一张</button>}
      </div>
      <p aria-live="polite" className="text-white/75">{status || "双指缩放、双击放大；可通过系统分享存储图像。"}</p>
    </footer>
  </div>, document.body);
}

export function PreviewableImage({ previewImages, previewIndex = 0, ...props }: ImgHTMLAttributes<HTMLImageElement> & { previewImages?: readonly PreviewImageSource[]; previewIndex?: number }) {
  const [open, setOpen] = useState(false);
  const images = previewImages || [{ src: typeof props.src === "string" ? props.src : undefined, alt: props.alt }];
  const show = () => { if (images.length) setOpen(true); };
  return <><img {...props} role="button" tabIndex={0} aria-label={`查看大图：${props.alt || "图片"}`} className={`${props.className || ""} cursor-zoom-in`} onClick={event => { props.onClick?.(event); if (!event.defaultPrevented) { event.stopPropagation(); show(); } }} onKeyDown={event => { props.onKeyDown?.(event); if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); show(); } }} />{open && <ImagePreview images={images} initialIndex={previewIndex} onClose={() => setOpen(false)} />}</>;
}
