import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MusicTrack, Character, UserSettings } from "../types";
import { 
  Play, 
  Pause, 
  SkipForward, 
  CheckSquare, 
  Square, 
  Calendar, 
  Heart, 
  Image as ImageIcon, 
  Music as MusicIcon, 
  Plus, 
  Check, 
  ChevronRight, 
  Volume2,
  Settings,
  User
} from "lucide-react";

// Pre-seeded high-quality images for the Album Widget to look gorgeous
const ALBUM_IMAGES = [
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=400&h=400&fit=crop", // Moody dark ocean wave
  "https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&h=400&fit=crop", // Magical forest library
  "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=400&h=400&fit=crop", // Soft clouds/sky
  "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=400&h=400&fit=crop", // Sunset reflection
];

// Default Todo Items in Widget
const DEFAULT_TODOS: { id: string; text: string; checked: boolean }[] = [];

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
  size?: "1x1" | "2x2" | "1x4" | "2x4";
}

export function AlbumWidget({ id, isEditing, onRemove, characters = [], widgetBorderRadius }: WidgetProps) {
  const [customPhotos, setCustomPhotos] = useState<string[]>(() => {
    const raw = localStorage.getItem(`album_widget_photos_${id}`);
    return raw ? JSON.parse(raw) : [];
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Resize/compress the image to max 800px dimension so it fits easily within localStorage (approx 30-80KB)
          const canvas = document.createElement("canvas");
          const maxDim = 800;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.75); // high quality compressed JPEG

            const updated = [compressedBase64];
            setCustomPhotos(updated);
            localStorage.setItem(`album_widget_photos_${id}`, JSON.stringify(updated));
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const defaultImage = ALBUM_IMAGES[0];

  return (
    <div className="relative w-full h-full group">
      <div 
        className="desktop-widget-glass-frame w-full h-full rounded-2xl overflow-hidden cursor-pointer select-none"
        style={{
          borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : undefined
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
          src={customPhotos.length > 0 ? customPhotos[0] : defaultImage} 
          alt="Album moment" 
          className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
      </div>

      {isEditing && onRemove && (
        <button
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

export function MusicWidget({ id, isEditing, onRemove, isPlaying, onTogglePlay, onNext, currentTrack, onOpenApp, widgetOpacity, widgetBorderRadius }: WidgetProps) {
  return (
    <div className="relative w-full h-full group">
      <div 
        onClick={() => {
          if (!isEditing && onOpenApp) {
            onOpenApp("music");
          }
        }}
        className={`desktop-widget-glass w-full h-full rounded-2xl p-3 flex flex-col justify-between text-stone-800 text-left relative overflow-hidden select-none ${
          !isEditing ? "cursor-pointer hover:bg-white/50 active:scale-[0.98] transition-all duration-200" : ""
        }`}
        style={{
          "--desktop-widget-glass-alpha": (widgetOpacity !== undefined ? widgetOpacity / 100 : 0.32) as number,
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
  const [targetDate, setTargetDate] = useState(() => {
    const raw = localStorage.getItem(`anniversary_date_${id}`);
    return raw || "2026-03-02"; // Reference date
  });

  const [title, setTitle] = useState(() => {
    const raw = localStorage.getItem(`anniversary_title_${id}`);
    return raw || "与希尔薇相连";
  });

  const [widgetType, setWidgetType] = useState<"anniversary" | "countdown">(() => {
    const raw = localStorage.getItem(`anniversary_type_${id}`);
    return (raw as "anniversary" | "countdown") || "anniversary";
  });

  const [bgImage, setBgImage] = useState<string | undefined>(() => {
    return localStorage.getItem(`anniversary_bg_${id}`) || undefined;
  });

  const [fontColor, setFontColor] = useState<string>(() => {
    return localStorage.getItem(`anniversary_color_${id}`) || "default";
  });

  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draft states for editing inside the modal
  const [draftTargetDate, setDraftTargetDate] = useState(targetDate);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftWidgetType, setDraftWidgetType] = useState(widgetType);
  const [draftBgImage, setDraftBgImage] = useState(bgImage);
  const [draftFontColor, setDraftFontColor] = useState(fontColor);

  // Sync draft states when the modal is opened
  useEffect(() => {
    if (isEditingSettings) {
      setDraftTargetDate(targetDate);
      setDraftTitle(title);
      setDraftWidgetType(widgetType);
      setDraftBgImage(bgImage);
      setDraftFontColor(fontColor);
    }
  }, [isEditingSettings, targetDate, title, widgetType, bgImage, fontColor]);

  // Calculate days difference
  const diffDays = () => {
    const target = new Date(targetDate);
    const today = new Date();
    // Normalize to midnight
    target.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - target.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const days = diffDays();
  const absDays = Math.abs(days);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setTargetDate(draftTargetDate);
    setTitle(draftTitle);
    setWidgetType(draftWidgetType);
    setBgImage(draftBgImage);
    setFontColor(draftFontColor);

    localStorage.setItem(`anniversary_date_${id}`, draftTargetDate);
    localStorage.setItem(`anniversary_title_${id}`, draftTitle);
    localStorage.setItem(`anniversary_type_${id}`, draftWidgetType);
    if (draftBgImage) {
      localStorage.setItem(`anniversary_bg_${id}`, draftBgImage);
    } else {
      localStorage.removeItem(`anniversary_bg_${id}`);
    }
    localStorage.setItem(`anniversary_color_${id}`, draftFontColor);
    setIsEditingSettings(false);
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setDraftBgImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOuterClick = () => {
    if (isEditing) return;
    setIsEditingSettings(true);
  };

  const getResolvedColor = (colorStr: string, hasBg: boolean) => {
    if (colorStr === "default") {
      return hasBg ? "#ffffff" : "#1c1917";
    }
    if (colorStr === "white") return "#ffffff";
    if (colorStr === "dark") return "#1c1917";
    if (colorStr === "rose") return "#e11d48";
    if (colorStr === "amber") return "#d97706";
    if (colorStr === "blue") return "#2563eb";
    return colorStr;
  };

  const getHueFromColor = (colorStr: string): number => {
    if (colorStr.startsWith("hsl")) {
      const match = colorStr.match(/hsl\((\d+)/);
      if (match) return Number(match[1]);
    }
    return 0; // Default hue
  };

  const resolvedColor = getResolvedColor(fontColor, !!bgImage);

  return (
    <div className="relative w-full h-full group">
      <style>{`
        .anniversary-title-${id} {
          color: ${resolvedColor} !important;
        }
        .anniversary-days-${id} {
          color: ${resolvedColor} !important;
        }
      `}</style>
      <div 
        className="desktop-widget-glass w-full h-full rounded-2xl p-3 flex flex-col justify-between text-left relative overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.98]"
        onClick={handleOuterClick}
        style={{
          "--desktop-widget-glass-alpha": (widgetOpacity !== undefined ? widgetOpacity / 100 : 0.32) as number,
          backgroundImage: bgImage ? `url(${bgImage})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : undefined
        }}
      >
        {/* Dark overlay for readability on user background images */}
        <div className="w-full h-full flex flex-col justify-between z-10">
          {/* Top Row: Title on Left */}
          <div className="flex justify-between items-start w-full">
            <div className="min-w-0 pr-6 pt-1">
              <div className={`anniversary-title-${id} truncate max-w-[120px] font-black text-xs`}>
                {title}
              </div>
            </div>
          </div>

          {/* Middle: Giant days count */}
          <div className="flex-1 flex flex-col items-center justify-center py-2">
            <div className={`anniversary-days-${id} flex items-baseline font-black text-4xl tracking-tight leading-none`}>
              <span>{absDays}</span>
              <span className="text-[10px] font-bold ml-0.5 opacity-80">天</span>
            </div>
          </div>

          {/* Gentle upload indicator visible only when no background images set */}
          {!bgImage && (
            <div className="text-center">
              <span className="text-[7.5px] text-stone-400 font-bold tracking-wider block opacity-0 group-hover:opacity-100 transition-opacity">
                💡 点击小组件可自定义内容与背景
              </span>
            </div>
          )}
        </div>
      </div>

      {isEditing && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md z-30 transition-transform active:scale-90"
        >
          ×
        </button>
      )}

      {/* Render the Settings Edit Modal using a Portal */}
      {isEditingSettings && createPortal(
        <div 
          className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm transition-all duration-300"
          onClick={() => setIsEditingSettings(false)}
        >
          <form 
            onSubmit={handleSaveSettings} 
            className="bg-white rounded-[24px] w-full max-w-sm overflow-hidden shadow-2xl p-5 border border-stone-100 flex flex-col gap-4 animate-scale-up text-left text-stone-800" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-stone-100">
              <h4 className="text-sm font-black text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-500 fill-current" />
                <span>设定纪念/倒数日</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsEditingSettings(false)}
                className="text-stone-400 hover:text-stone-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
              {/* Type Select */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-stone-500 tracking-wider">小组件类型</label>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDraftWidgetType("anniversary")}
                    className={`flex-1 py-2 text-xs font-bold rounded-[16px] border transition-all ${
                      draftWidgetType === "anniversary" 
                        ? "bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-100" 
                        : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    纪念日 (正数)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftWidgetType("countdown")}
                    className={`flex-1 py-2 text-xs font-bold rounded-[16px] border transition-all ${
                      draftWidgetType === "countdown" 
                        ? "bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-100" 
                        : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    倒数日 (倒数)
                  </button>
                </div>
              </div>

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-stone-500 tracking-wider">文字内容</label>
                <input 
                  type="text" 
                  value={draftTitle} 
                  onChange={e => setDraftTitle(e.target.value)} 
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-bold bg-stone-50/50"
                  placeholder="如：与希尔薇相连"
                  maxLength={16}
                  required
                />
              </div>

              {/* Date Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-stone-500 tracking-wider">选择日期</label>
                <input 
                  type="date" 
                  value={draftTargetDate} 
                  onChange={e => setDraftTargetDate(e.target.value)} 
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-bold bg-stone-50/50"
                  required
                />
              </div>

              {/* Font Color Select */}
              <div className="space-y-2">
                <style>{`
                  .phone-screen-container input[type="range"].color-slider-hue {
                    -webkit-appearance: none !important;
                    appearance: none !important;
                    background: transparent !important;
                    width: 100% !important;
                    height: 24px !important;
                    display: flex !important;
                    align-items: center !important;
                    cursor: pointer !important;
                  }

                  /* Track style - Webkit */
                  .phone-screen-container input[type="range"].color-slider-hue::-webkit-slider-runnable-track {
                    width: 100% !important;
                    height: 10px !important;
                    background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%) !important;
                    border-radius: 32px !important;
                    border: none !important;
                  }

                  /* Thumb style - Webkit */
                  .phone-screen-container input[type="range"].color-slider-hue::-webkit-slider-thumb {
                    -webkit-appearance: none !important;
                    appearance: none !important;
                    height: 18px !important;
                    width: 18px !important;
                    border-radius: 50% !important;
                    background-color: #ffffff !important;
                    border: 2px solid #ffffff !important;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important;
                    cursor: pointer !important;
                    margin-top: -4px !important;
                    transition: transform 0.1s ease !important;
                  }
                  .phone-screen-container input[type="range"].color-slider-hue::-webkit-slider-thumb:active {
                    transform: scale(1.25) !important;
                  }

                  /* Track style - Firefox */
                  .phone-screen-container input[type="range"].color-slider-hue::-moz-range-track {
                    width: 100% !important;
                    height: 10px !important;
                    background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%) !important;
                    border-radius: 32px !important;
                    border: none !important;
                  }

                  /* Thumb style - Firefox */
                  .phone-screen-container input[type="range"].color-slider-hue::-moz-range-thumb {
                    height: 18px !important;
                    width: 18px !important;
                    border-radius: 50% !important;
                    background-color: #ffffff !important;
                    border: 2px solid #ffffff !important;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important;
                    cursor: pointer !important;
                    transition: transform 0.1s ease !important;
                  }
                  .phone-screen-container input[type="range"].color-slider-hue::-moz-range-thumb:active {
                    transform: scale(1.25) !important;
                  }
                `}</style>
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-extrabold text-stone-500 tracking-wider">
                    文字与天数颜色
                  </label>
                  <div className="flex items-center gap-1.5 bg-stone-50 px-2 py-0.5 rounded-[16px] border border-stone-200">
                    <span className="text-[9px] text-stone-400 font-bold">当前色值:</span>
                    <div 
                      className="w-3.5 h-3.5 rounded-full border border-stone-300 shadow-inner" 
                      style={{ backgroundColor: getResolvedColor(draftFontColor, !!draftBgImage) }}
                    />
                  </div>
                </div>

                {/* Quick selection presets */}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDraftFontColor("default")}
                    className={`flex-1 py-1 text-[10px] font-extrabold rounded-[16px] border transition-all ${
                      draftFontColor === "default"
                        ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                        : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    自动 (黑/白)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftFontColor("#ffffff")}
                    className={`flex-1 py-1 text-[10px] font-extrabold rounded-[16px] border transition-all ${
                      draftFontColor === "#ffffff" || draftFontColor === "white"
                        ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                        : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    纯白色
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftFontColor("#1c1917")}
                    className={`flex-1 py-1 text-[10px] font-extrabold rounded-[16px] border transition-all ${
                      draftFontColor === "#1c1917" || draftFontColor === "dark"
                        ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                        : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    深黑色
                  </button>
                </div>

                {/* Custom Hue Slider */}
                <div className="space-y-1.5 bg-stone-50/50 p-2.5 rounded-[16px] border border-stone-150">
                  <span className="text-[10px] font-bold text-stone-400 block">滑动颜色色条 (自定义彩色)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={getHueFromColor(draftFontColor)}
                      onChange={(e) => {
                        const hue = Number(e.target.value);
                        setDraftFontColor(`hsl(${hue}, 85%, 45%)`);
                      }}
                      className="color-slider-hue w-full h-2.5 rounded-[16px] appearance-none cursor-pointer outline-none transition-all"
                      style={{
                        background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Background Image Upload */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-extrabold text-stone-500 tracking-wider block">专属背景图</label>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleBgUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                <div className="flex items-center gap-3 bg-stone-50/50 p-2 border border-stone-150 rounded-[16px]">
                  {draftBgImage ? (
                    <>
                      <img 
                        src={draftBgImage} 
                        alt="Preview" 
                        className="w-10 h-10 rounded-[16px] object-cover border border-stone-200 shadow-sm"
                      />
                      <div className="flex-1 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-[16px] text-[10px] font-extrabold transition-colors text-stone-700"
                        >
                          更换图片
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftBgImage(undefined)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-[16px] text-[10px] font-extrabold transition-colors text-rose-600"
                        >
                          清除背景
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2.5 bg-white border border-dashed border-stone-300 hover:bg-stone-50 rounded-[16px] text-[11px] font-extrabold transition-colors text-stone-600 flex items-center justify-center gap-1.5"
                      >
                        <ImageIcon className="w-4 h-4 text-stone-400" />
                        <span>选择背景图片</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setIsEditingSettings(false)}
                className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-[16px] text-xs font-black transition-colors"
              >
                取消
              </button>
              <button 
                type="submit" 
                className="flex-1 py-2 bg-stone-900 hover:bg-stone-850 text-white rounded-[16px] text-xs font-black transition-colors shadow-lg shadow-stone-900/10"
              >
                保存设置
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}

/** A full-width desktop date card. Its content always follows the device's local date. */
export function DateWidget({ id, isEditing, onRemove, widgetBorderRadius }: WidgetProps) {
  const backgroundKey = `date_widget_background_${id}`;
  const textColorKey = `date_widget_text_color_${id}`;
  const [now, setNow] = useState(() => new Date());
  const [backgroundImage, setBackgroundImage] = useState<string | undefined>(() => localStorage.getItem(backgroundKey) || undefined);
  const [textColor, setTextColor] = useState(() => localStorage.getItem(textColorKey) || "#ffffff");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftBackgroundImage, setDraftBackgroundImage] = useState<string | undefined>(backgroundImage);
  const [draftTextColor, setDraftTextColor] = useState(textColor);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    const scheduleNextDay = () => {
      const current = new Date();
      const nextDay = new Date(current);
      nextDay.setHours(24, 0, 1, 0);
      timer = window.setTimeout(() => {
        setNow(new Date());
        scheduleNextDay();
      }, nextDay.getTime() - current.getTime());
    };
    scheduleNextDay();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (isSettingsOpen) {
      setDraftBackgroundImage(backgroundImage);
      setDraftTextColor(textColor);
    }
  }, [backgroundImage, isSettingsOpen, textColor]);

  const handleBackgroundUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setDraftBackgroundImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const saveSettings = () => {
    const resolvedTextColor = /^#[0-9a-fA-F]{6}$/.test(draftTextColor) ? draftTextColor : "#ffffff";
    setBackgroundImage(draftBackgroundImage);
    setTextColor(resolvedTextColor);
    if (draftBackgroundImage) localStorage.setItem(backgroundKey, draftBackgroundImage);
    else localStorage.removeItem(backgroundKey);
    localStorage.setItem(textColorKey, resolvedTextColor);
    setIsSettingsOpen(false);
  };

  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now).toUpperCase();
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(now);
  const backgroundStyle = backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined;

  return (
    <div className="relative h-full w-full group">
      <button
        type="button"
        aria-label="设置日期小组件"
        className="desktop-widget-glass relative h-full w-full overflow-hidden text-left transition-transform duration-150 active:scale-[0.985]"
        onClick={() => !isEditing && setIsSettingsOpen(true)}
        style={{
          ...(backgroundStyle || {}),
          "--desktop-widget-glass-alpha": 0.32,
          backgroundPosition: "center",
          backgroundSize: "cover",
          borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : "16px",
        }}
      >
        <span
          className="date-widget-typeface absolute bottom-4 left-5 z-10 flex flex-col"
          style={{ "--date-widget-text-color": textColor } as React.CSSProperties}
        >
          <span className="date-widget-weekday text-[26px] font-semibold leading-tight tracking-wide">{weekday}</span>
          <span className="date-widget-month-day text-[21px] leading-tight">{monthDay}</span>
        </span>
      </button>

      {isEditing && onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="absolute -right-1.5 -top-1.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white shadow-md"
          aria-label="删除小组件"
        >
          ×
        </button>
      )}

      {isSettingsOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)}>
          <section className="w-full max-w-sm rounded-[24px] border border-stone-100 bg-white p-5 text-left text-stone-800 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h4 className="text-sm font-black">日期小组件</h4>
                <p className="mt-0.5 text-[11px] font-medium text-stone-400">日期会按设备本地时间自动更新</p>
              </div>
              <button type="button" onClick={() => setIsSettingsOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-lg text-stone-500" aria-label="关闭">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold text-stone-500">背景图片</label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
                <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-2">
                  <div className="h-12 w-16 shrink-0 rounded-xl bg-slate-200 bg-cover bg-center" style={draftBackgroundImage ? { backgroundImage: `url(${draftBackgroundImage})` } : undefined} />
                  <div className="flex flex-1 gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-[11px] font-bold text-stone-700">上传图片</button>
                    {draftBackgroundImage && <button type="button" onClick={() => setDraftBackgroundImage(undefined)} className="rounded-xl border border-stone-200 px-3 py-2 text-[11px] font-bold text-stone-500">恢复默认</button>}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold text-stone-500">星期、月、日文字颜色</label>
                <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-2">
                  <input type="color" value={draftTextColor} onChange={(event) => setDraftTextColor(event.target.value)} className="h-9 w-11 cursor-pointer rounded-lg border-0 bg-transparent p-0" aria-label="选择日期文字颜色" />
                  <input type="text" value={draftTextColor} onChange={(event) => setDraftTextColor(event.target.value)} maxLength={7} className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold uppercase outline-none focus:border-stone-500" aria-label="星期、月、日文字颜色 HEX" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2 border-t border-stone-100 pt-4">
              <button type="button" onClick={() => setIsSettingsOpen(false)} className="flex-1 rounded-xl bg-stone-100 py-2.5 text-xs font-black text-stone-700">取消</button>
              <button type="button" onClick={saveSettings} className="flex-1 rounded-xl bg-stone-900 py-2.5 text-xs font-black text-white">保存</button>
            </div>
          </section>
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
        className="desktop-widget-glass w-full h-full rounded-2xl p-3 flex flex-col justify-between text-stone-800 text-left relative cursor-pointer overflow-hidden"
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
          "--desktop-widget-glass-alpha": (widgetOpacity !== undefined ? widgetOpacity / 100 : 0.32) as number,
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
  onAdd: (widgetType: "album" | "music" | "anniversary" | "todo" | "date" | "album_1x4" | "album_2x4" | "welcome") => void;
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

        {/* Option 1b: Album 1x4 */}
        <button
          onClick={() => onAdd("album_1x4")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">精美相册 (1×4)</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">扁平长条横幅小相册</p>
          </div>
        </button>

        {/* Option 1c: Album 2x4 */}
        <button
          onClick={() => onAdd("album_2x4")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">精美相册 (2×4)</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">大屏宽画幅焦点壁纸</p>
          </div>
        </button>

        {/* Date 2x4 */}
        <button
          onClick={() => onAdd("date")}
          className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/60 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-95"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-stone-800">日期卡片 (2×4)</h4>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">显示真实日期，可自定义背景与文字颜色</p>
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
