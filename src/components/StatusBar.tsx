import React, { useState, useEffect } from "react";
import { Wifi, Battery, Signal } from "lucide-react";
import type { ResolvedTheme } from "../features/theme/theme";

interface StatusBarProps {
  hideStatusBar?: boolean;
  /** App pages use the themed navigation surface; the desktop overlays its wallpaper. */
  mode?: "app" | "desktop";
  wallpaper?: string | null;
  hasUserWallpaper?: boolean;
  fallbackTheme?: ResolvedTheme;
}

export default function StatusBar({
  hideStatusBar = false,
  mode = "app",
  wallpaper,
  hasUserWallpaper = false,
  fallbackTheme = "light",
}: StatusBarProps) {
  const [time, setTime] = useState("");
  const [isDarkWallpaper, setIsDarkWallpaper] = useState(fallbackTheme === "dark");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      let hours = now.getHours().toString().padStart(2, "0");
      let minutes = now.getMinutes().toString().padStart(2, "0");
      setTime(`${hours}:${minutes}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (mode !== "desktop" || !hasUserWallpaper || !wallpaper) {
      setIsDarkWallpaper(fallbackTheme === "dark");
      return;
    }

    // Gradients are used by the built-in wallpapers and can be inspected without
    // loading an image. Averaging all stops avoids choosing a text color from one
    // unusually bright/dark corner of the desktop.
    if (wallpaper.startsWith("linear-gradient")) {
      const hexes = wallpaper.match(/#[0-9a-fA-F]{3,8}/g);
      if (hexes?.length) {
        const luminance = hexes.reduce((total, hex) => {
          let value = hex.slice(1);
          if (value.length === 3) value = value.split("").map((part) => part + part).join("");
          const r = Number.parseInt(value.slice(0, 2), 16);
          const g = Number.parseInt(value.slice(2, 4), 16);
          const b = Number.parseInt(value.slice(4, 6), 16);
          return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
            ? total + r * 0.299 + g * 0.587 + b * 0.114
            : total;
        }, 0) / hexes.length;
        setIsDarkWallpaper(luminance < 140);
        return;
      }
    }

    // User image wallpapers may be cross-origin. Use the sampled pixel when
    // available and fall back to the resolved theme if the browser blocks it.
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = wallpaper;
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        setIsDarkWallpaper(r * 0.299 + g * 0.587 + b * 0.114 < 140);
      } catch {
        setIsDarkWallpaper(fallbackTheme === "dark");
      }
    };
    image.onerror = () => setIsDarkWallpaper(fallbackTheme === "dark");
  }, [fallbackTheme, hasUserWallpaper, mode, wallpaper]);

  if (hideStatusBar) return null;

  return (
    <div 
      className={`absolute top-0 left-0 right-0 z-50 flex justify-between items-center px-6 pb-[7px] text-xs font-semibold select-none transition-all duration-300 border-none shadow-none pointer-events-none ${
        mode === "desktop" && isDarkWallpaper ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" : ""
      }`}
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 11px)",
        backgroundColor: mode === "desktop" ? "transparent" : "var(--nav-bg)",
        color: mode === "desktop"
          ? (isDarkWallpaper ? "#fff" : "var(--desktop-default-text)")
          : "var(--nav-text)",
      }}
    >
      <div className="flex items-center space-x-1.5 pointer-events-auto">
        <span className="font-sans text-sm tracking-tight">{time}</span>
      </div>
      <div className="flex items-center space-x-2 pointer-events-auto">
        <Signal className="w-3.5 h-3.5" strokeWidth={2.5} />
        <span className="text-[10px] tracking-widest font-bold">5G</span>
        <Wifi className="w-3.5 h-3.5" strokeWidth={2.5} />
        <div className="flex items-center space-x-0.5">
          <Battery className="w-5 h-5 -my-1" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
