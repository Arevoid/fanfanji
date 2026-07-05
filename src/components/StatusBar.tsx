import React, { useState, useEffect } from "react";
import { Wifi, Battery, Signal } from "lucide-react";

export default function StatusBar() {
  const [time, setTime] = useState("");

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

  return (
    <div className="flex justify-between items-center px-6 py-2.5 text-xs font-semibold text-gray-800 select-none z-50 bg-white/40 backdrop-blur-md border-b border-gray-100/30">
      <div className="flex items-center space-x-1.5">
        <span className="font-sans text-sm tracking-tight">{time}</span>
      </div>
      <div className="flex items-center space-x-2">
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
