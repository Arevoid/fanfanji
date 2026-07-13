import React, { useState, useEffect } from "react";
import { Wifi, Battery, Signal } from "lucide-react";

interface StatusBarProps {
  wallpaper?: string;
}

export default function StatusBar({ wallpaper }: StatusBarProps) {
  const [time, setTime] = useState("");
  const [isDark, setIsDark] = useState(false);

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
    if (!wallpaper) {
      setIsDark(false);
      return;
    }

    // 1. Check for linear-gradient backgrounds
    if (wallpaper.startsWith("linear-gradient")) {
      const hexes = wallpaper.match(/#[0-9a-fA-F]{3,8}/g);
      if (hexes && hexes.length > 0) {
        let totalLuminance = 0;
        hexes.forEach(hex => {
          let h = hex.substring(1);
          if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
          const r = parseInt(h.substring(0, 2), 16);
          const g = parseInt(h.substring(2, 4), 16);
          const b = parseInt(h.substring(4, 6), 16);
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            totalLuminance += (r * 0.299 + g * 0.587 + b * 0.114);
          }
        });
        setIsDark((totalLuminance / hexes.length) < 140);
        return;
      }
    }

    // 2. Check for image URLs
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = wallpaper;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, 1, 1);
          const data = ctx.getImageData(0, 0, 1, 1).data;
          const r = data[0];
          const g = data[1];
          const b = data[2];
          const brightness = r * 0.299 + g * 0.587 + b * 0.114;
          // If average brightness is below 140, treat as a dark background
          setIsDark(brightness < 140);
        }
      } catch (e) {
        // Fallback for canvas error
        const lower = wallpaper.toLowerCase();
        setIsDark(lower.includes("dark") || lower.includes("night") || lower.includes("black") || lower.includes("charcoal"));
      }
    };
    img.onerror = () => {
      // Fallback for image load/CORS error
      const lower = wallpaper.toLowerCase();
      setIsDark(lower.includes("dark") || lower.includes("night") || lower.includes("black") || lower.includes("charcoal"));
    };
  }, [wallpaper]);

  return (
    <div 
      className={`absolute top-0 left-0 right-0 z-50 flex justify-between items-center px-6 pb-[7px] text-xs font-semibold select-none transition-all duration-300 bg-transparent border-none shadow-none pointer-events-none ${
        isDark ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" : "text-gray-800"
      }`}
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 11px)"
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
