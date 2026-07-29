import React, { useState } from "react";
import { CalendarEvent } from "../types";
import { Plus, Trash2, Check, X, ChevronLeft, ChevronRight } from "lucide-react";

interface AppScheduleProps {
  events: CalendarEvent[];
  onAddEvent: (event: CalendarEvent) => void;
  onToggleEventDone: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  onClose: () => void;
}

export default function AppSchedule({
  events,
  onAddEvent,
  onToggleEventDone,
  onDeleteEvent,
  onClose,
}: AppScheduleProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(
    new Date().toISOString().split("T")[0]
  );
  
  // Stays vs Experiences tab
  const [activeTab, setActiveTab] = useState<"stays" | "experiences">("stays");

  // Filter Mode: "exact" | "1day" | "2days"
  const [filterRange, setFilterRange] = useState<"exact" | "1day" | "2days">("exact");

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get days in month
  const firstDayIndex = new Date(year, month, 1).getDay();
  // Adjust so Monday is 0 (since mockup has M T W T F S S)
  const adjustedFirstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const selectDay = (day: number) => {
    const d = new Date(year, month, day);
    const yearStr = d.getFullYear();
    const monthStr = (d.getMonth() + 1).toString().padStart(2, "0");
    const dayStr = d.getDate().toString().padStart(2, "0");
    setSelectedDateStr(`${yearStr}-${monthStr}-${dayStr}`);
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newEv: CalendarEvent = {
      id: Date.now().toString(),
      date: selectedDateStr,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      isDone: false,
    };

    onAddEvent(newEv);
    setNewTitle("");
    setNewDesc("");
    setIsAdding(false);
  };

  const blanks = Array(adjustedFirstDayIndex).fill(null);
  const daysInMonth = Array.from({ length: totalDays }, (_, i) => i + 1);
  const calendarCells = [...blanks, ...daysInMonth];

  const monthNamesEng = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Logic to filter events based on exact, 1day, 2days range
  const getFilteredEvents = () => {
    return events.filter((ev) => {
      if (filterRange === "exact") {
        return ev.date === selectedDateStr;
      } else if (filterRange === "1day") {
        // Events within selectedDate +- 1 day
        const selTime = new Date(selectedDateStr).getTime();
        const evTime = new Date(ev.date).getTime();
        const diffDays = Math.abs(evTime - selTime) / (1000 * 3600 * 24);
        return diffDays <= 1;
      } else {
        // All events
        return true;
      }
    });
  };

  const filteredEvents = getFilteredEvents();

  return (
    <div data-theme-page="schedule" className="flex flex-col h-full bg-[var(--app-bg)] text-[var(--text-primary)] font-sans relative">
      
      {/* 1. Header with Close Button and Stays/Experiences Tab Switches */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 relative border-b border-stone-100">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full border border-stone-200/60 flex items-center justify-center hover:bg-stone-50 transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4 text-neutral-700" />
        </button>

        {/* Double labels tab bar */}
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setActiveTab("stays")}
            className="relative py-1.5 text-sm font-bold transition-all"
          >
            <span className={activeTab === "stays" ? "text-neutral-950" : "text-stone-400"}>
              Stays
            </span>
            {activeTab === "stays" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-950 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("experiences")}
            className="relative py-1.5 text-sm font-bold transition-all"
          >
            <span className={activeTab === "experiences" ? "text-neutral-950" : "text-stone-400"}>
              Experiences
            </span>
            {activeTab === "experiences" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-950 rounded-full" />
            )}
          </button>
        </div>

        <div className="w-8" /> {/* Balance spacer */}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 pb-24">
        
        {/* 2. Top Rounded Card "Where / I'm flexible" */}
        <div className="w-full bg-white border border-stone-200/60 rounded-[32px] p-4 flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
          <span className="text-sm font-semibold text-neutral-900">Where</span>
          <span className="text-sm font-bold text-stone-500">I'm flexible</span>
        </div>

        {/* 3. When's your trip? Section Card */}
        <div className="bg-white border border-stone-200/60 rounded-[32px] p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] space-y-4">
          <h2 className="text-lg font-extrabold text-neutral-950 tracking-tight">
            When's your trip?
          </h2>

          {/* Segment switch: "Choose dates" vs "I'm flexible" */}
          <div className="bg-stone-100 rounded-[32px] p-1 flex border border-stone-200/60">
            <button className="flex-1 py-2 rounded-[32px] bg-white text-xs font-bold text-neutral-950 shadow-sm transition-all">
              Choose dates
            </button>
            <button className="flex-1 py-2 rounded-[32px] text-xs font-bold text-stone-400 hover:text-stone-600 transition-all">
              I'm flexible
            </button>
          </div>

          {/* Calendar month change header */}
          <div className="flex items-center justify-between pt-2">
            <h3 className="font-extrabold text-neutral-950 text-xs">
              {monthNamesEng[month]} {year}
            </h3>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={handlePrevMonth}
                className="w-7 h-7 flex items-center justify-center border border-stone-200/60 rounded-full hover:bg-stone-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-stone-600" />
              </button>
              <button
                onClick={handleNextMonth}
                className="w-7 h-7 flex items-center justify-center border border-stone-200/60 rounded-full hover:bg-stone-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-stone-600" />
              </button>
            </div>
          </div>

          {/* Days abbreviations M T W T F S S */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-stone-400">
            <span>M</span>
            <span>T</span>
            <span>W</span>
            <span>T</span>
            <span>F</span>
            <span>S</span>
            <span>S</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, index) => {
              if (cell === null) {
                return <div key={`blank-${index}`} className="aspect-square" />;
              }

              const cellDateStr = `${year}-${(month + 1).toString().padStart(2, "0")}-${cell.toString().padStart(2, "0")}`;
              const isSelected = cellDateStr === selectedDateStr;
              const hasEvents = events.some((ev) => ev.date === cellDateStr);

              return (
                <button
                  key={`day-${cell}`}
                  onClick={() => selectDay(cell)}
                  className={`aspect-square rounded-full flex flex-col items-center justify-center relative text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-neutral-950 text-white"
                      : "hover:bg-stone-100 text-stone-800"
                  }`}
                >
                  <span>{cell}</span>
                  {hasEvents && (
                    <span
                      className={`absolute bottom-1 w-1 h-1 rounded-full ${
                        isSelected ? "bg-white" : "bg-neutral-950"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Filter Options Pills row */}
        <div className="flex items-center space-x-2 py-1 overflow-x-auto select-none no-scrollbar shrink-0">
          <button
            onClick={() => setFilterRange("exact")}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
              filterRange === "exact"
                ? "border-neutral-950 bg-neutral-950 text-white"
                : "border-stone-200/60 text-stone-700 hover:bg-stone-50"
            }`}
          >
            Exact dates
          </button>
          <button
            onClick={() => setFilterRange("1day")}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
              filterRange === "1day"
                ? "border-neutral-950 bg-neutral-950 text-white"
                : "border-stone-200/60 text-stone-700 hover:bg-stone-50"
            }`}
          >
            ± 1 day
          </button>
          <button
            onClick={() => setFilterRange("2days")}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
              filterRange === "2days"
                ? "border-neutral-950 bg-neutral-950 text-white"
                : "border-stone-200/60 text-stone-700 hover:bg-stone-50"
            }`}
          >
            ± 2 days
          </button>
        </div>

        {/* 5. Today's Tasks/Todo list Section */}
        <div className="bg-white border border-stone-200/60 rounded-[32px] p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <div>
              <h3 className="font-extrabold text-neutral-950 text-xs">
                {activeTab === "stays" ? "Stays (日程计划)" : "Experiences (任务备忘)"}
              </h3>
              <p className="text-[10px] text-stone-400 mt-0.5 font-medium">
                {selectedDateStr} {filterRange === "exact" ? "" : `(${filterRange === "1day" ? "周边三天" : "全部"})`}
              </p>
            </div>
            <button
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 bg-neutral-950 text-white hover:bg-neutral-900 rounded-full text-xs font-extrabold transition-colors flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加</span>
            </button>
          </div>

          {/* Add task Inline Form */}
          {isAdding && (
            <form onSubmit={handleCreateEvent} className="p-4 bg-stone-50 border border-stone-200/60 rounded-[32px] space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-stone-500 mb-1">标题 *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="去做什么？"
                  className="w-full px-4 py-2 rounded-[8px] bg-white border border-stone-200/60 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-stone-500 mb-1">备注 (可选)</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="添加说明"
                  className="w-full px-4 py-2 rounded-[8px] bg-white border border-stone-200/60 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-medium"
                />
              </div>
              <div className="flex justify-end gap-2 text-xs font-bold pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-stone-500 hover:bg-stone-100 rounded-full"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-neutral-950 text-white hover:bg-neutral-900 rounded-full shadow-sm"
                >
                  保存
                </button>
              </div>
            </form>
          )}

          {/* Tasks list */}
          {filteredEvents.length === 0 ? (
            <div className="text-center py-6 text-stone-400 text-xs">
              无日程规划。
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map((ev) => (
                <div
                  key={ev.id}
                  className={`flex items-start justify-between p-3 rounded-[32px] border transition-all ${
                    ev.isDone
                      ? "bg-stone-50/50 border-stone-100 text-stone-400"
                      : "bg-white border-stone-100 hover:border-stone-200 text-neutral-800"
                  }`}
                >
                  <div className="flex items-start gap-2.5 flex-1 min-w-0 pl-1">
                    <button
                      onClick={() => onToggleEventDone(ev.id)}
                      className={`p-0.5 rounded-full border mt-0.5 transition-colors ${
                        ev.isDone
                          ? "bg-neutral-950 border-neutral-950 text-white"
                          : "border-stone-300 hover:border-neutral-950 text-transparent"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </button>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold leading-normal truncate ${ev.isDone ? "line-through text-stone-400" : ""}`}>
                        {ev.title}
                      </p>
                      {ev.description && (
                        <p className="text-[10px] text-stone-400 mt-0.5 truncate leading-relaxed">
                          {ev.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => onDeleteEvent(ev.id)}
                    className="p-1 text-stone-300 hover:text-red-500 transition-colors pr-2"
                    title="删除日程"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 6. Absolute Footer aligned with Figma Standard */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-stone-100 px-6 py-4 flex items-center justify-between z-30">
        <button
          onClick={() => {
            // Optional clear fields or clear state
            setFilterRange("exact");
            setSelectedDateStr(new Date().toISOString().split("T")[0]);
          }}
          className="text-stone-400 font-bold hover:text-neutral-950 transition-colors text-xs underline underline-offset-4"
        >
          Clear
        </button>
        <button
          onClick={() => {
            setIsAdding(true);
          }}
          className="bg-neutral-950 text-white text-xs font-bold px-6 py-3 rounded-full hover:bg-neutral-900 transition-all flex items-center space-x-1"
        >
          <span>Next</span>
        </button>
      </div>

    </div>
  );
}
