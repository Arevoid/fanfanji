import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  MusicTrack,
  Character,
  UserSettings,
  type DualMusicWidgetConfig,
  type IdentityMusicState,
  type RelationshipMusicState,
  type UserIdentity,
} from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import { formatTimeWidgetDate } from "../features/home/timeWidgetDate";
import { audioDb } from "../utils/audioDb";
import {
  compressImagePreservingTransparency,
  isTransparencyPreservedImage,
} from "../utils/pngParser";
import { 
  Play, 
  Pause, 
  SkipForward, 
  CheckSquare, 
  Calendar, 
  Heart, 
  Image as ImageIcon, 
  Music as MusicIcon, 
  Plus, 
  Check, 
  Volume2,
  User,
  Clock,
} from "lucide-react";

// Pre-seeded high-quality images for the Album Widget to look gorgeous
const ALBUM_IMAGES = [
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=400&h=400&fit=crop", // Moody dark ocean wave
  "https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&h=400&fit=crop", // Magical forest library
  "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=400&h=400&fit=crop", // Soft clouds/sky
  "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=400&h=400&fit=crop", // Sunset reflection
];

const DEFAULT_WIDGET_TEXT_COLOR = "#ffffff";

const normalizeWidgetTextColor = (value: string | null | undefined, fallback = DEFAULT_WIDGET_TEXT_COLOR): string => {
  if (!value || value === "default") return fallback;
  const legacyColors: Record<string, string> = {
    white: "#ffffff", dark: "#1c1917", rose: "#e11d48", amber: "#d97706", blue: "#2563eb",
  };
  const normalized = legacyColors[value] || value;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
};

const compressWidgetBackground = (file: File, onComplete: (dataUrl: string) => void) => {
  const reader = new FileReader();
  reader.onload = (event) => {
    const image = new Image();
    image.onload = () => {
      const maxDimension = 1200;
      let { width, height } = image;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
      onComplete(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);
};

interface WidgetProps {
  id: string;
  isEditing?: boolean;
  onRemove?: () => void;
  // Music states for MusicWidget
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onNext?: () => void;
  currentTrack?: MusicTrack | null;
  // Characters for AlbumWidget
  characters?: Character[];
  onOpenApp?: (appId: string) => void;
  installedAppIds?: string[];
  widgetOpacity?: number;
  widgetBorderRadius?: number;
  size?: "1x1" | "2x2" | "1x4" | "2x3" | "2x4";
  tracks?: MusicTrack[];
  activeIdentity?: UserIdentity;
  dualMusicConfig?: DualMusicWidgetConfig;
  identityMusicState?: IdentityMusicState;
  relationshipMusicState?: RelationshipMusicState;
  availableMusicRelationships?: Array<{ relationship: CharacterRelationship; character: Character }>;
  playbackOrigin?: string | null;
  onToggleTrack?: (trackId: string, origin: string) => void;
  onBindMusicRelationship?: (widgetId: string, relationId: string) => void;
  onRefreshRelationshipMusic?: (relationId: string) => void;
  musicRecommendationLoading?: boolean;
  musicError?: string | null;
}

export function AlbumWidget({ id, isEditing, onRemove, characters = [], widgetBorderRadius }: WidgetProps) {
  const [customPhotos, setCustomPhotos] = useState<string[]>(() => {
    const raw = localStorage.getItem(`album_widget_photos_${id}`);
    return raw ? JSON.parse(raw) : [];
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImagePreservingTransparency(file, 800, 800, 0.75);
      const updated = [compressed];
      setCustomPhotos(updated);
      localStorage.setItem(`album_widget_photos_${id}`, JSON.stringify(updated));
    }
  };

  const defaultImage = ALBUM_IMAGES[0];
  const currentImage = customPhotos.length > 0 ? customPhotos[0] : defaultImage;
  const isTransparentPhoto = isTransparencyPreservedImage(currentImage);

  return (
    <div className="relative w-full h-full group">
      <div 
        className={`w-full h-full overflow-hidden cursor-pointer select-none ${
          isTransparentPhoto
            ? "bg-transparent border-0 shadow-none"
            : "rounded-2xl shadow-md border border-white/20 bg-stone-900/10"
        }`}
        style={{
          borderRadius: isTransparentPhoto
            ? 0
            : widgetBorderRadius !== undefined
              ? `${widgetBorderRadius}px`
              : undefined,
          backgroundColor: isTransparentPhoto ? "transparent" : undefined,
          border: isTransparentPhoto ? "none" : undefined,
          boxShadow: isTransparentPhoto ? "none" : undefined,
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!isEditing) {
            document.getElementById(`upload-photo-${id}`)?.click();
          }
        }}
      >
        <input
          type="file"
          id={`upload-photo-${id}`}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <img 
          src={currentImage}
          alt="Album moment" 
          className={`w-full h-full transform hover:scale-105 transition-transform duration-500 ${
            isTransparentPhoto ? "object-contain" : "object-cover"
          }`}
          referrerPolicy="no-referrer"
        />
      </div>

      {isEditing && onRemove && (
        <button
          data-home-delete
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md z-30 transition-transform active:scale-90"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** A wide, date-led photo widget. Its image is intentionally unmasked so the
 * user controls contrast solely with the single date-text colour setting. */
export function CalendarAlbumWidget({ id, isEditing, onRemove, widgetBorderRadius }: WidgetProps) {
  const [backgroundImage, setBackgroundImage] = useState(() => localStorage.getItem(`calendar_album_image_${id}`) || ALBUM_IMAGES[2]);
  const [fontColor, setFontColor] = useState(() => normalizeWidgetTextColor(localStorage.getItem(`calendar_album_font_color_${id}`)));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftBackgroundImage, setDraftBackgroundImage] = useState(backgroundImage);
  const [draftFontColor, setDraftFontColor] = useState(fontColor);
  const uploadRef = useRef<HTMLInputElement>(null);
  const dateTextRefs = useRef<Array<HTMLSpanElement | null>>([]);

  const today = new Date();
  const weekday = today.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthAndDay = today.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  // The application theme uses global !important text rules. Set these styles
  // as inline !important declarations so the saved widget colour and bundled
  // font cannot be overridden by a theme or user-provided global CSS.
  useEffect(() => {
    dateTextRefs.current.forEach((element) => {
      if (!element) return;
      element.style.setProperty("color", fontColor, "important");
      element.style.setProperty("font-family", '"Athena Unicode", serif', "important");
      element.style.setProperty("font-weight", "700", "important");
    });
  }, [fontColor]);

  const handleBackgroundUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    compressWidgetBackground(file, setDraftBackgroundImage);
  };

  const saveSettings = () => {
    const nextColor = normalizeWidgetTextColor(draftFontColor, fontColor);
    setBackgroundImage(draftBackgroundImage);
    setFontColor(nextColor);
    localStorage.setItem(`calendar_album_image_${id}`, draftBackgroundImage);
    localStorage.setItem(`calendar_album_font_color_${id}`, nextColor);
    setIsSettingsOpen(false);
  };

  const cancelSettings = () => {
    setDraftBackgroundImage(backgroundImage);
    setDraftFontColor(fontColor);
    setFontColor(fontColor);
    setIsSettingsOpen(false);
  };

  return (
    <div className="calendar-album-widget relative w-full h-full group" style={{ "--calendar-album-date-color": fontColor } as React.CSSProperties}>
      <button
        type="button"
        className="relative w-full h-full overflow-hidden text-left shadow-md border border-white/20 cursor-pointer select-none"
        style={{
          borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : undefined,
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (!isEditing) {
            setDraftBackgroundImage(backgroundImage);
            setDraftFontColor(fontColor);
            setIsSettingsOpen(true);
          }
        }}
        aria-label="编辑日历相册小组件"
      >
        <div
          className="absolute left-4 bottom-3 flex flex-col leading-[0.9]"
        >
          <span ref={(element) => { dateTextRefs.current[0] = element; }} className="calendar-album-date text-[24px] font-semibold tracking-[-0.03em]">{weekday}</span>
          <span ref={(element) => { dateTextRefs.current[1] = element; }} className="calendar-album-date mt-1 text-[25px] font-semibold tracking-[-0.04em]">{monthAndDay}</span>
        </div>
      </button>

      {isEditing && onRemove && (
        <button
          data-home-delete
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md z-30 transition-transform active:scale-90"
          aria-label="删除小组件"
        >
          ×
        </button>
      )}

      {isSettingsOpen && createPortal(
        <div className="theme-widget-sheet fixed inset-0 z-[100] bg-[var(--overlay)] flex items-end justify-center p-4" onClick={cancelSettings}>
          <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-[28px] bg-[var(--surface)] text-[var(--text-primary)] shadow-[var(--shadow-modal)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--divider)] px-5 py-4">
              <div>
                <h3 className="text-sm font-black text-[var(--text-primary)]">日历相册</h3>
                <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">背景图与日期文字颜色</p>
              </div>
              <button type="button" onClick={cancelSettings} className="rounded-full p-1 text-lg font-bold text-[var(--text-tertiary)]" aria-label="关闭">×</button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
            <div className="relative h-28 overflow-hidden rounded-2xl border border-stone-100" style={{ backgroundImage: `url(${draftBackgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }}>
              <div className="calendar-album-preview-date absolute bottom-3 left-3 flex flex-col leading-[0.9]" style={{ "--calendar-album-date-color": normalizeWidgetTextColor(draftFontColor, fontColor) } as React.CSSProperties}>
                <span className="text-base font-semibold">{weekday}</span>
                <span className="mt-1 text-lg font-semibold">{monthAndDay}</span>
              </div>
            </div>
            <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
            <button type="button" onClick={() => uploadRef.current?.click()} className="w-full rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]">上传背景图片</button>
            <label className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
              日期文字颜色
              <span className="flex items-center gap-2">
                <input value={draftFontColor.toUpperCase()} onChange={(event) => { const value = event.target.value; setDraftFontColor(value); if (/^#[0-9a-f]{6}$/i.test(value)) setFontColor(value); }} className="w-[76px] rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 font-mono text-[10px] font-medium text-stone-600 outline-none" aria-label="颜色 HEX 值" />
                <input type="color" value={normalizeWidgetTextColor(draftFontColor)} onChange={(event) => { setDraftFontColor(event.target.value); setFontColor(event.target.value); }} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
              </span>
            </label>
            </div>
            <div className="flex gap-2 border-t border-[var(--divider)] p-4">
              <button type="button" onClick={cancelSettings} className="flex-1 rounded-xl bg-[var(--surface-muted)] py-2.5 text-xs font-bold text-[var(--text-secondary)]">取消</button>
              <button type="button" onClick={saveSettings} className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-xs font-bold text-[var(--accent-contrast)]">保存</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Frameless 2×4 clock matching the compact date-over-time reference layout. */
export function TimeWidget({ id, isEditing, onRemove }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());
  const [fontColor, setFontColor] = useState(() => normalizeWidgetTextColor(localStorage.getItem(`time_widget_font_color_${id}`), "#1c1917"));
  const [draftFontColor, setDraftFontColor] = useState(fontColor);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const textRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const previewTextRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const display = formatTimeWidgetDate(now);

  useEffect(() => {
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 60 * 1000);
    }, 60 * 1000 - (Date.now() % (60 * 1000)) + 30);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    textRefs.current.forEach((element) => {
      if (!element) return;
      element.style.setProperty("color", fontColor, "important");
      element.style.setProperty("font-family", '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif', "important");
    });
  }, [fontColor, isSettingsOpen]);

  useEffect(() => {
    const previewColor = normalizeWidgetTextColor(draftFontColor, fontColor);
    previewTextRefs.current.forEach((element) => {
      if (!element) return;
      element.style.setProperty("color", previewColor, "important");
      element.style.setProperty("font-family", '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif', "important");
    });
  }, [draftFontColor, fontColor, isSettingsOpen]);

  const cancelSettings = () => {
    setDraftFontColor(fontColor);
    setIsSettingsOpen(false);
  };

  const saveSettings = () => {
    const nextColor = normalizeWidgetTextColor(draftFontColor, fontColor);
    setFontColor(nextColor);
    setDraftFontColor(nextColor);
    localStorage.setItem(`time_widget_font_color_${id}`, nextColor);
    setIsSettingsOpen(false);
  };

  return (
    <div className="time-widget relative h-full w-full select-none group">
      <button
        type="button"
        className="flex h-full w-full flex-col items-center justify-center overflow-hidden bg-transparent px-2 text-center"
        onClick={(event) => {
          event.stopPropagation();
          if (!isEditing) {
            setDraftFontColor(fontColor);
            setIsSettingsOpen(true);
          }
        }}
        aria-label="编辑时间小组件"
      >
        <span
          ref={(element) => { textRefs.current[0] = element; }}
          className="w-full whitespace-nowrap text-center text-[17px] font-bold leading-none tracking-[-0.02em]"
        >
          {display.heading}
        </span>
        <span
          ref={(element) => { textRefs.current[1] = element; }}
          className="mt-4 whitespace-nowrap text-[clamp(92px,28vw,118px)] font-normal leading-[0.74] tracking-[-0.045em]"
        >
          {display.time}
        </span>
      </button>

      {isEditing && onRemove && (
        <button
          type="button"
          data-home-delete
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onRemove(); }}
          className="absolute -right-1.5 -top-1.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white shadow-md transition-transform active:scale-90"
          aria-label="删除小组件"
        >
          ×
        </button>
      )}

      {isSettingsOpen && createPortal(
        <div className="theme-widget-sheet fixed inset-0 z-[100] flex items-end justify-center bg-[var(--overlay)] p-4" onClick={cancelSettings}>
          <div className="w-full max-w-sm overflow-hidden rounded-[28px] bg-[var(--surface)] text-[var(--text-primary)] shadow-[var(--shadow-modal)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--divider)] px-5 py-4">
              <div>
                <h3 className="text-sm font-black">时间小组件</h3>
                <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">设置时间、日期与农历的字体颜色</p>
              </div>
              <button type="button" onClick={cancelSettings} className="rounded-full p-1 text-lg font-bold text-[var(--text-tertiary)]" aria-label="关闭">×</button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="flex h-28 flex-col items-center justify-center rounded-2xl bg-slate-500 px-2 text-center text-white">
                <span ref={(element) => { previewTextRefs.current[0] = element; }} className="w-full whitespace-nowrap text-center text-[15px] font-bold leading-none">{display.heading}</span>
                <span ref={(element) => { previewTextRefs.current[1] = element; }} className="mt-4 whitespace-nowrap text-[80px] font-normal leading-[0.74] tracking-[-0.045em]">{display.time}</span>
              </div>
              <label className="flex items-center justify-between text-xs font-bold">
                字体颜色
                <span className="flex items-center gap-2">
                  <input
                    value={draftFontColor.toUpperCase()}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraftFontColor(value);
                    }}
                    className="w-[76px] rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 font-mono text-[10px] font-medium outline-none"
                    aria-label="字体颜色 HEX 值"
                  />
                  <input
                    type="color"
                    value={normalizeWidgetTextColor(draftFontColor, fontColor)}
                    onChange={(event) => setDraftFontColor(event.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                    aria-label="选择字体颜色"
                  />
                </span>
              </label>
            </div>
            <div className="flex gap-2 border-t border-[var(--divider)] p-4">
              <button type="button" onClick={cancelSettings} className="flex-1 rounded-xl bg-[var(--surface-muted)] py-2.5 text-xs font-bold text-[var(--text-secondary)]">取消</button>
              <button type="button" onClick={saveSettings} className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-xs font-bold text-[var(--accent-contrast)]">保存</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function MusicWidget({ id, isEditing, onRemove, isPlaying, onTogglePlay, onNext, currentTrack, onOpenApp, widgetOpacity, widgetBorderRadius }: WidgetProps) {
  return (
    <div className="relative w-full h-full group">
      <div 
        onClick={() => {
          if (!isEditing && onOpenApp) {
            onOpenApp("music");
          }
        }}
        className={`w-full h-full rounded-2xl p-3 flex flex-col justify-between backdrop-blur-md border border-white/30 shadow-md text-stone-800 text-left relative overflow-hidden select-none ${
          !isEditing ? "cursor-pointer hover:bg-white/50 active:scale-[0.98] transition-all duration-200" : ""
        }`}
        style={{
          backgroundColor: widgetOpacity !== undefined ? `rgba(255, 255, 255, ${widgetOpacity / 100})` : "rgba(255, 255, 255, 0.4)",
          borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : undefined
        }}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 pr-1">
            <span className="text-[9px] font-black tracking-widest text-stone-400 uppercase flex items-center gap-1 mb-1">
              <MusicIcon className="w-2.5 h-2.5 text-purple-600" />
              <span>正在播放</span>
            </span>
            <h4 className="text-xs font-extrabold text-stone-900 truncate">
              {currentTrack ? currentTrack.title : "未播放曲目"}
            </h4>
            <p className="text-[9px] text-stone-500 font-bold truncate mt-0.5">
              {currentTrack ? currentTrack.artist : "小手机音乐"}
            </p>
          </div>

          {/* Mini spinning vinyl disc */}
          <div className="shrink-0 relative w-10 h-10 rounded-full border border-stone-300 bg-stone-900 flex items-center justify-center overflow-hidden shadow-inner">
            <div className={`w-8 h-8 rounded-full bg-stone-850 border border-stone-800 flex items-center justify-center ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }}>
              <div className="w-2.5 h-2.5 rounded-full bg-purple-200 border border-purple-400"></div>
            </div>
            {/* Waveform indicator */}
            {isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center gap-[1.5px] opacity-40">
                <span className="w-0.5 h-3 bg-white rounded-full animate-pulse"></span>
                <span className="w-0.5 h-5 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.15s' }}></span>
                <span className="w-0.5 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></span>
              </div>
            )}
          </div>
        </div>

        {/* Control row */}
        <div className="flex items-center justify-between gap-1 mt-2 bg-white/50 py-1.5 px-2.5 rounded-xl border border-white/40">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onTogglePlay) onTogglePlay();
            }}
            className="p-1 rounded-lg hover:bg-stone-200/50 text-stone-700 transition-colors flex items-center justify-center"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-stone-700" /> : <Play className="w-4 h-4 fill-stone-700" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onNext) onNext();
            }}
            className="p-1 rounded-lg hover:bg-stone-200/50 text-stone-700 transition-colors flex items-center justify-center"
          >
            <SkipForward className="w-4 h-4 fill-stone-700" />
          </button>
          <div className="flex-1 flex justify-end">
            <span className="text-[8px] text-stone-400 font-black tracking-widest uppercase flex items-center gap-0.5">
              <Volume2 className="w-3 h-3" />
              <span>MUSIC</span>
            </span>
          </div>
        </div>
      </div>

      {isEditing && onRemove && (
        <button
          data-home-delete
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md z-30 transition-transform active:scale-90"
        >
          ×
        </button>
      )}
    </div>
  );
}


export function AnniversaryWidget({ id, isEditing, onRemove, widgetOpacity, widgetBorderRadius }: WidgetProps) {
  const [targetDate, setTargetDate] = useState(() => localStorage.getItem(`anniversary_date_${id}`) || "2026-03-02");
  const [title, setTitle] = useState(() => localStorage.getItem(`anniversary_title_${id}`) || "纪念日");
  const [widgetType, setWidgetType] = useState<"anniversary" | "countdown">(() => (localStorage.getItem(`anniversary_type_${id}`) as "anniversary" | "countdown") || "anniversary");
  const [backgroundImage, setBackgroundImage] = useState(() => localStorage.getItem(`anniversary_bg_${id}`) || "");
  const [fontColor, setFontColor] = useState(() => normalizeWidgetTextColor(
    localStorage.getItem(`anniversary_color_${id}`),
    localStorage.getItem(`anniversary_bg_${id}`) ? "#ffffff" : "#1c1917",
  ));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftTargetDate, setDraftTargetDate] = useState(targetDate);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftWidgetType, setDraftWidgetType] = useState(widgetType);
  const [draftBackgroundImage, setDraftBackgroundImage] = useState(backgroundImage);
  const [draftFontColor, setDraftFontColor] = useState(fontColor);
  const uploadRef = useRef<HTMLInputElement>(null);

  const openSettings = () => {
    if (isEditing) return;
    setDraftTargetDate(targetDate);
    setDraftTitle(title);
    setDraftWidgetType(widgetType);
    setDraftBackgroundImage(backgroundImage);
    setDraftFontColor(fontColor);
    setIsSettingsOpen(true);
  };
  const cancelSettings = () => {
    setDraftTargetDate(targetDate);
    setDraftTitle(title);
    setDraftWidgetType(widgetType);
    setDraftBackgroundImage(backgroundImage);
    setDraftFontColor(fontColor);
    setFontColor(fontColor);
    setIsSettingsOpen(false);
  };
  const saveSettings = () => {
    const nextColor = normalizeWidgetTextColor(draftFontColor, fontColor);
    setTargetDate(draftTargetDate);
    setTitle(draftTitle);
    setWidgetType(draftWidgetType);
    setBackgroundImage(draftBackgroundImage);
    setFontColor(nextColor);
    localStorage.setItem(`anniversary_date_${id}`, draftTargetDate);
    localStorage.setItem(`anniversary_title_${id}`, draftTitle);
    localStorage.setItem(`anniversary_type_${id}`, draftWidgetType);
    localStorage.setItem(`anniversary_color_${id}`, nextColor);
    if (draftBackgroundImage) localStorage.setItem(`anniversary_bg_${id}`, draftBackgroundImage);
    else localStorage.removeItem(`anniversary_bg_${id}`);
    setIsSettingsOpen(false);
  };

  const today = new Date();
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const rawDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000);
  const days = widgetType === "countdown" ? Math.max(0, -rawDays) : Math.max(0, rawDays);

  return (
    <div className="relative h-full w-full group">
      <button type="button" className="relative h-full w-full overflow-hidden border border-white/20 p-3 text-left shadow-md" onClick={openSettings}
        style={{ borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : undefined, backgroundColor: backgroundImage ? undefined : (widgetOpacity !== undefined ? `rgba(255, 255, 255, ${widgetOpacity / 100})` : "rgba(255, 255, 255, 0.4)"), backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex h-full flex-col justify-between" style={{ color: fontColor }}>
          <span className="max-w-[120px] truncate pt-1 text-xs font-black" style={{ color: fontColor }}>{title}</span>
          <span className="flex items-baseline justify-center text-4xl font-black tracking-tight leading-none" style={{ color: fontColor }}>
            {days}<span className="ml-0.5 text-[10px] font-bold opacity-80">天</span>
          </span>
          <span className="h-3" />
        </div>
      </button>
      {isEditing && onRemove && <button type="button" data-home-delete onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(); }} className="absolute -right-1.5 -top-1.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white shadow-md" aria-label="删除小组件">×</button>}
      {isSettingsOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/35 p-4" onClick={cancelSettings}>
          <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <div><h3 className="text-sm font-black text-stone-900">纪念日 / 倒数日</h3><p className="mt-0.5 text-[11px] text-stone-400">内容、背景图与文字颜色</p></div>
              <button type="button" onClick={cancelSettings} className="rounded-full p-1 text-lg font-bold text-stone-400">×</button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setDraftWidgetType("anniversary")} className={`flex-1 rounded-xl py-2 text-xs font-bold ${draftWidgetType === "anniversary" ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600"}`}>纪念日</button>
                <button type="button" onClick={() => setDraftWidgetType("countdown")} className={`flex-1 rounded-xl py-2 text-xs font-bold ${draftWidgetType === "countdown" ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600"}`}>倒数日</button>
              </div>
              <label className="block text-xs font-bold text-stone-700">文字内容<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={16} className="mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs outline-none" /></label>
              <label className="block text-xs font-bold text-stone-700">选择日期<input type="date" value={draftTargetDate} onChange={(event) => setDraftTargetDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs outline-none" /></label>
              <div className="relative h-28 overflow-hidden rounded-2xl border border-stone-100" style={{ backgroundImage: draftBackgroundImage ? `url(${draftBackgroundImage})` : undefined, backgroundColor: draftBackgroundImage ? undefined : "#f5f5f4", backgroundSize: "cover", backgroundPosition: "center" }}>
                <span className="absolute left-3 top-3 text-xs font-black" style={{ color: normalizeWidgetTextColor(draftFontColor, "#1c1917") }}>{draftTitle || "纪念日"}</span>
              </div>
              <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) compressWidgetBackground(file, setDraftBackgroundImage); }} />
              <button type="button" onClick={() => uploadRef.current?.click()} className="w-full rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-700">上传背景图片</button>
              <label className="flex items-center justify-between text-xs font-bold text-stone-700">文字颜色<span className="flex items-center gap-2"><input value={draftFontColor.toUpperCase()} onChange={(event) => { setDraftFontColor(event.target.value); if (/^#[0-9a-f]{6}$/i.test(event.target.value)) setFontColor(event.target.value); }} className="w-[76px] rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 font-mono text-[10px] font-medium text-stone-600 outline-none" /><input type="color" value={normalizeWidgetTextColor(draftFontColor, "#1c1917")} onChange={(event) => { setDraftFontColor(event.target.value); setFontColor(event.target.value); }} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" /></span></label>
            </div>
            <div className="flex gap-2 border-t border-stone-100 p-4"><button type="button" onClick={cancelSettings} className="flex-1 rounded-xl bg-stone-100 py-2.5 text-xs font-bold text-stone-600">取消</button><button type="button" onClick={saveSettings} className="flex-1 rounded-xl bg-stone-950 py-2.5 text-xs font-bold text-white">保存</button></div>
          </div>
        </div>, document.body,
      )}
    </div>
  );
}

function DualMusicCover({ track, fallback, alt }: { track?: MusicTrack; fallback: string; alt: string }) {
  const [localCoverUrl, setLocalCoverUrl] = useState("");
  useEffect(() => {
    let objectUrl = "";
    if (!track?.coverAssetId) {
      setLocalCoverUrl("");
      return;
    }
    audioDb.getTrackCover(track.coverAssetId).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setLocalCoverUrl(objectUrl);
    }).catch(() => setLocalCoverUrl(""));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [track?.coverAssetId]);
  return (
    <img
      src={localCoverUrl || track?.coverUrl || fallback}
      alt={alt}
      className="h-full w-full rounded-[14px] object-cover"
    />
  );
}

export function DualMusicWidget({
  id,
  isEditing,
  onRemove,
  tracks = [],
  currentTrack,
  isPlaying,
  activeIdentity,
  dualMusicConfig,
  identityMusicState,
  relationshipMusicState,
  availableMusicRelationships = [],
  playbackOrigin,
  onToggleTrack,
  onBindMusicRelationship,
  onRefreshRelationshipMusic,
  musicRecommendationLoading,
  musicError,
  widgetOpacity,
  widgetBorderRadius,
}: WidgetProps) {
  const [showBindingSheet, setShowBindingSheet] = useState(false);
  const bound = availableMusicRelationships.find((item) => item.relationship.id === dualMusicConfig?.relationId);
  const leftTrack = tracks.find((track) => track.id === identityMusicState?.currentTrackId);
  const rightTrack = tracks.find((track) => track.id === relationshipMusicState?.currentTrackId);
  const leftOrigin = `dual:${id}:left`;
  const rightOrigin = `dual:${id}:right`;
  const fallbackUserAvatar = activeIdentity?.avatar || "";
  const fallbackFriendAvatar = bound?.character.avatar || fallbackUserAvatar;

  const renderCard = (input: {
    side: "left" | "right";
    track?: MusicTrack;
    avatar: string;
    name: string;
    emptyText: string;
    origin: string;
  }) => {
    const playing = Boolean(input.track && isPlaying && currentTrack?.id === input.track.id && playbackOrigin === input.origin);
    return (
      <div
        className="flex min-w-0 flex-1 flex-col rounded-[18px] p-1.5 shadow-sm"
        style={{ backgroundColor: `rgba(255, 255, 255, ${(widgetOpacity ?? 70) / 100})` }}
      >
        <div className="relative aspect-square min-h-0 w-full">
          <DualMusicCover track={input.track} fallback={input.avatar} alt={input.track?.title || input.name} />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (input.side === "right" && !isEditing) setShowBindingSheet(true);
            }}
            className={`absolute top-1.5 ${input.side === "left" ? "left-1.5" : "right-1.5"} h-7 w-7 overflow-hidden rounded-full bg-white shadow`}
            aria-label={input.side === "right" ? "绑定或更换角色" : input.name}
          >
            <img src={input.avatar} alt="" className="h-full w-full object-cover" />
          </button>
        </div>
        <div className="flex min-h-0 items-center gap-1 px-1 pb-0.5 pt-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-black leading-tight text-stone-900">
              {input.track?.title || input.emptyText}
            </p>
            <p className="mt-0.5 truncate text-[8px] font-semibold leading-tight text-stone-400">
              {input.track?.artist || input.name}
            </p>
          </div>
          <button
            type="button"
            disabled={!input.track}
            onClick={(event) => {
              event.stopPropagation();
              if (input.track) onToggleTrack?.(input.track.id, input.origin);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white disabled:bg-stone-200 disabled:text-stone-400"
            aria-label={playing ? `暂停${input.track?.title}` : `播放${input.track?.title || ""}`}
          >
            {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-full w-full group">
      <div
        className="flex h-full w-full gap-1.5 overflow-hidden p-1"
        style={{ borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : undefined }}
      >
        {renderCard({
          side: "left",
          track: leftTrack,
          avatar: fallbackUserAvatar,
          name: activeIdentity?.name || "我",
          emptyText: "去音乐库播放一首歌",
          origin: leftOrigin,
        })}
        {renderCard({
          side: "right",
          track: rightTrack,
          avatar: fallbackFriendAvatar,
          name: bound ? (bound.character.remark || bound.character.name) : "绑定角色",
          emptyText: tracks.length ? (bound ? "点击换一首" : "点击头像绑定角色") : "请先在音乐库添加歌曲",
          origin: rightOrigin,
        })}
      </div>
      {isEditing && onRemove && (
        <button type="button" data-home-delete onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(); }} className="absolute -right-1.5 -top-1.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white shadow-md">×</button>
      )}
      {showBindingSheet && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-end bg-black/40" onClick={() => setShowBindingSheet(false)}>
          <div className="max-h-[72vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-stone-900">双人音乐</h3>
                <p className="mt-0.5 text-[10px] text-stone-400">绑定当前身份下的单聊好友</p>
              </div>
              <button type="button" onClick={() => setShowBindingSheet(false)} className="h-7 w-7 rounded-full bg-stone-100 text-stone-500">×</button>
            </div>
            <div className="space-y-2">
              {availableMusicRelationships.length ? availableMusicRelationships.map(({ relationship, character }) => (
                <button
                  type="button"
                  key={relationship.id}
                  onClick={() => {
                    onBindMusicRelationship?.(id, relationship.id);
                    setShowBindingSheet(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${dualMusicConfig?.relationId === relationship.id ? "border-stone-900 bg-stone-50" : "border-stone-100"}`}
                >
                  <img src={character.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-stone-800">{character.remark || character.name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-stone-400">{relationship.relationship}</p>
                  </div>
                  {dualMusicConfig?.relationId === relationship.id && <Check className="h-4 w-4" />}
                </button>
              )) : <p className="py-8 text-center text-xs text-stone-400">当前身份还没有可绑定的单聊好友</p>}
            </div>
            {bound && (
              <button
                type="button"
                disabled={musicRecommendationLoading || tracks.length === 0}
                onClick={() => onRefreshRelationshipMusic?.(bound.relationship.id)}
                className="mt-4 w-full rounded-full bg-stone-950 py-3 text-xs font-black text-white disabled:bg-stone-200"
              >
                {musicRecommendationLoading ? "正在选歌…" : "换一首"}
              </button>
            )}
            {musicError && <p className="mt-3 text-center text-[10px] text-rose-500">{musicError}</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function TodoWidget({ id, isEditing, onRemove, onOpenApp, installedAppIds, widgetOpacity, widgetBorderRadius }: WidgetProps) {
  const [todos, setTodos] = useState<{ id: string; text: string; checked: boolean }[]>([]);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    if (showInstallPrompt) {
      const timer = setTimeout(() => setShowInstallPrompt(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showInstallPrompt]);

  useEffect(() => {
    const loadTodos = () => {
      const raw = localStorage.getItem("phone_memo_todos");
      if (raw) {
        setTodos(JSON.parse(raw));
      } else {
        // Fallback default todos
        const defaultTodos: { id: string; text: string; checked: boolean }[] = [];
        setTodos(defaultTodos);
        localStorage.setItem("phone_memo_todos", JSON.stringify(defaultTodos));
      }
    };
    loadTodos();
    window.addEventListener("storage", loadTodos);
    return () => {
      window.removeEventListener("storage", loadTodos);
    };
  }, []);

  const toggleTodo = (todoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = todos.map(t => t.id === todoId ? { ...t, checked: !t.checked } : t);
    setTodos(updated);
    localStorage.setItem("phone_memo_todos", JSON.stringify(updated));
  };

  const completedCount = todos.filter(t => t.checked).length;
  const progressPercent = todos.length > 0 ? Math.round((completedCount / todos.length) * 100) : 0;

  return (
    <div className="relative w-full h-full group">
      <div 
        className="w-full h-full rounded-2xl p-3 flex flex-col justify-between backdrop-blur-md border border-white/30 shadow-md text-stone-800 text-left relative cursor-pointer overflow-hidden"
        onClick={() => {
          if (!isEditing && onOpenApp) {
            const isInstalled = installedAppIds 
              ? installedAppIds.includes("notes") 
              : (() => {
                  const raw = localStorage.getItem("phone_installed_apps");
                  if (raw) {
                    try {
                      const parsed = JSON.parse(raw);
                      return Array.isArray(parsed) && parsed.includes("notes");
                    } catch (e) {}
                  }
                  return false;
                })();

            if (!isInstalled) {
              setShowInstallPrompt(true);
              return;
            }

            localStorage.setItem("memo_active_tab", "todo");
            localStorage.setItem("memo_open_todo_edit", "true");
            onOpenApp("notes");
          }
        }}
        style={{
          backgroundColor: widgetOpacity !== undefined ? `rgba(255, 255, 255, ${widgetOpacity / 100})` : "rgba(255, 255, 255, 0.4)",
          borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : undefined
        }}
      >
        {showInstallPrompt && (
          <div className="absolute inset-0 bg-stone-900/95 text-white p-3 rounded-2xl flex flex-col items-center justify-center text-center z-30 animate-fade-in" onClick={(e) => { e.stopPropagation(); setShowInstallPrompt(false); }}>
            <CheckSquare className="w-6 h-6 text-emerald-400 mb-1.5" />
            <p className="text-xs font-bold px-1 leading-snug">请先前往「应用商店」安装备忘录应用！</p>
            <span className="text-[9px] text-stone-400 mt-2 bg-white/10 px-2 py-0.5 rounded-full">点击任意处关闭</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-[9px] font-black tracking-widest text-emerald-600 uppercase flex items-center gap-1">
            <CheckSquare className="w-2.5 h-2.5" />
            <span>待办进度 {progressPercent}%</span>
          </span>
          <span className="text-[8px] text-stone-400 font-extrabold font-mono">
            {completedCount}/{todos.length}
          </span>
        </div>

        {/* List items */}
        <div className="space-y-1 my-1.5 overflow-hidden flex-1 flex flex-col justify-center">
          {todos.length > 0 ? (
            todos.slice(0, 4).map(todo => (
              <div 
                key={todo.id} 
                onClick={(e) => toggleTodo(todo.id, e)}
                className="flex items-center gap-1.5 py-0.5 group/item cursor-pointer"
              >
                {todo.checked ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3px] shrink-0" />
                ) : (
                  <div className="w-3 h-3 rounded-[3px] border border-stone-400 shrink-0 group-hover/item:border-emerald-600"></div>
                )}
                <span className={`text-[10px] truncate leading-none ${todo.checked ? 'text-stone-400 line-through' : 'text-stone-700 font-medium'}`}>
                  {todo.text}
                </span>
              </div>
            ))
          ) : (
            <div className="text-[9px] text-stone-400 font-semibold py-2 text-center">
              暂无待办日程，点击此处添加
            </div>
          )}
        </div>

        {todos.length < 4 && (
          <div className="text-[8px] text-stone-400/80 font-bold flex items-center gap-0.5 justify-center mt-1 border-t border-stone-200/40 pt-1">
            <Plus className="w-2 h-2" />
            <span>点击跳转备忘录编辑</span>
          </div>
        )}
      </div>

      {isEditing && onRemove && (
        <button
          data-home-delete
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md z-30 transition-transform active:scale-90"
        >
          ×
        </button>
      )}
    </div>
  );
}

// Bottom sheet selector for preset widgets
interface AddWidgetSheetProps {
  onAdd: (widgetType: "album" | "music" | "dual_music" | "anniversary" | "todo" | "calendar_album" | "time" | "welcome") => void;
  onClose: () => void;
  settings?: UserSettings;
}

export function AddWidgetSheet({ onAdd, onClose, settings }: AddWidgetSheetProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-50 bg-white/95 backdrop-blur-md rounded-t-[32px] shadow-2xl border-t border-stone-200/50 p-6 text-left animate-slide-up select-none max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-black text-stone-900 tracking-tight">添加桌面小组件</h3>
          <p className="text-[11px] text-stone-400 font-medium mt-0.5">选择你喜欢的小组件并丰富桌面排版 (支持 2×2, 1×4, 2×4 多种尺寸)</p>
        </div>
        <button 
          onClick={onClose}
          className="w-7 h-7 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Option 1: Album 2x2 */}
        <button
          onClick={() => onAdd("album")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-600 shrink-0">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">精美相册 (2×2)</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">经典方形氛围美图循环</p>
          </div>
        </button>

        {/* Option 1b: Calendar album 2x4 */}
        <button
          onClick={() => onAdd("calendar_album")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">日历相册 (2×4)</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">无蒙版背景与实时时间日期</p>
          </div>
        </button>

        <button
          onClick={() => onAdd("time")}
          className="flex items-center gap-3 rounded-2xl border border-stone-200/60 bg-stone-50 p-3 text-left transition-all hover:scale-[1.02] hover:bg-stone-100 active:scale-95"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">时间 (2×4)</h4>
            <p className="mt-0.5 text-[10px] font-medium text-stone-400">透明背景、日期星期与农历</p>
          </div>
        </button>

        {/* Option 2: Music */}
        <button
          onClick={() => onAdd("music")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
            <MusicIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">音乐播放</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">常驻迷你留声机</p>
          </div>
        </button>

        <button
          onClick={() => onAdd("dual_music")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <MusicIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black text-stone-800">双人音乐 (2×3)</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">我与好友各自正在听</p>
          </div>
        </button>

        {/* Option 3: Anniversary */}
        <button
          onClick={() => onAdd("anniversary")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <Heart className="w-5 h-5 fill-rose-600" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">专属纪念日</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">仪式感爱心倒计时</p>
          </div>
        </button>

        {/* Option 4: Todo */}
        <button
          onClick={() => onAdd("todo")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">待办事项</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">每日轻便手账清单</p>
          </div>
        </button>

        {/* Option 5: Welcome Card */}
        {settings?.hideHomeWelcomeWidget && (
          <button
            onClick={() => onAdd("welcome")}
            className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95 col-span-2"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-stone-800">置顶欢迎卡 (1×4)</h4>
              <p className="text-[10px] text-stone-400 font-medium mt-0.5">恢复桌面1置顶的 1×4 机主名片</p>
            </div>
          </button>
        )}
      </div>

      <div className="mt-5 text-center">
        <span className="text-[10px] text-stone-400 font-bold">长按桌面任意应用可进入排版编辑模式，拖拽调整位置或删除组件。</span>
      </div>
    </div>
  );
}
