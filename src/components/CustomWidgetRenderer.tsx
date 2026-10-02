import React, { useEffect, useState } from "react";
import { loadCustomWidgets, CUSTOM_WIDGETS_CHANGED_EVENT } from "../features/widgets/customWidgetService";
import type { CustomWidgetBlock, CustomWidgetDefinition } from "../domain/home/customWidgetTypes";

const THEME_CLASSES: Record<CustomWidgetDefinition["theme"], string> = {
  paper: "bg-white text-stone-800 border-stone-200/70",
  glass: "bg-white/45 text-stone-800 border-white/65 backdrop-blur-xl",
  midnight: "bg-slate-900 text-white border-slate-700/60",
  sunrise: "bg-gradient-to-br from-amber-50 to-rose-100 text-rose-950 border-rose-200/70",
};

function Block({ block, accentColor }: { block: CustomWidgetBlock; accentColor: string }) {
  if (block.type === "calendar") {
    const date = new Date();
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-current/10 bg-white/20 p-2">
        <span className="text-3xl font-black leading-none" style={{ color: accentColor }}>{date.getDate()}</span>
        <div className="min-w-0 text-[10px] font-bold leading-4 opacity-75">
          {date.toLocaleDateString("zh-CN", { year: "numeric", month: "long" })}
          {block.showWeek && <div>{date.toLocaleDateString("zh-CN", { weekday: "long" })}</div>}
          {block.showLunar && <div>农历日期</div>}
        </div>
      </div>
    );
  }
  if (block.type === "list") {
    return (
      <div className="min-w-0 space-y-1">
        {block.title && <div className="truncate text-[11px] font-black" style={{ color: accentColor }}>{block.title}</div>}
        {block.items.slice(0, 4).map((item, index) => <div key={`${item}-${index}`} className="truncate text-[10px] font-semibold opacity-80">• {item}</div>)}
      </div>
    );
  }
  if (block.type === "quote") {
    return <div className="line-clamp-4 text-[11px] font-semibold leading-4 opacity-85">“{block.text}”{block.author && <span className="ml-1 text-[9px] opacity-60">— {block.author}</span>}</div>;
  }
  return <div className={`${block.emphasis === "title" ? "text-sm font-black" : block.emphasis === "muted" ? "text-[10px] opacity-65" : "text-[11px] font-semibold"} line-clamp-4 leading-4`}>{block.text}</div>;
}

export function CustomWidgetView({ widget, isEditing, onRemove, widgetBorderRadius, className = "" }: {
  widget: CustomWidgetDefinition;
  isEditing?: boolean;
  onRemove?: () => void;
  widgetBorderRadius?: number;
  className?: string;
}) {
  return (
    <div
      className={`home-widget-card relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-[22px] border p-3 text-left shadow-sm ${THEME_CLASSES[widget.theme]} ${className}`}
      style={{ borderRadius: widgetBorderRadius !== undefined ? `${widgetBorderRadius}px` : undefined }}
      data-custom-widget-id={widget.id}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-black" style={{ color: widget.accentColor }}>{widget.name}</span>
        {widget.creator && widget.creator !== "未署名" && <span className="truncate text-[8px] opacity-55">by {widget.creator}</span>}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
        {widget.blocks.map((block, index) => <React.Fragment key={`${widget.id}-${index}`}><Block block={block} accentColor={widget.accentColor} /></React.Fragment>)}
      </div>
      {isEditing && onRemove && <button type="button" data-home-delete onClick={(event) => { event.stopPropagation(); onRemove(); }} className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-stone-900/80 text-xs font-black text-white">×</button>}
    </div>
  );
}

export default function CustomWidgetRenderer({ widgetId, isEditing, onRemove, widgetBorderRadius }: {
  widgetId: string;
  isEditing?: boolean;
  onRemove?: () => void;
  widgetBorderRadius?: number;
}) {
  const [widget, setWidget] = useState<CustomWidgetDefinition | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const widgets = await loadCustomWidgets().catch(() => []);
      const match = widgets.find((item) => item.id === widgetId);
      // A home-screen placement can outlive an imported/deleted definition.
      // Keep the orphan useful by showing the most recently updated definition
      // while retaining its own placement id; a later save/placement can repair it.
      const fallback = !match && widgets.length > 0
        ? { ...[...widgets].sort((a, b) => b.updatedAt - a.updatedAt)[0], id: widgetId }
        : null;
      if (active) setWidget(match || fallback);
    };
    void load();
    const onChanged = () => { void load(); };
    window.addEventListener(CUSTOM_WIDGETS_CHANGED_EVENT, onChanged);
    return () => { active = false; window.removeEventListener(CUSTOM_WIDGETS_CHANGED_EVENT, onChanged); };
  }, [widgetId]);

  if (!widget) {
    return <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-dashed border-stone-300 bg-white/50 p-3 text-center text-[10px] font-bold text-stone-500">小组件数据不可用</div>;
  }

  return <CustomWidgetView widget={widget} isEditing={isEditing} onRemove={onRemove} widgetBorderRadius={widgetBorderRadius} />;
}
