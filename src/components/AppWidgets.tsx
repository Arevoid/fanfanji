import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Download, Grid2X2, ImagePlus, Send, Trash2, Upload, WandSparkles, X } from "lucide-react";
import { apiChat } from "../utils/apiHelper";
import { createId } from "../core/id/createId";
import { createFallbackWidget, normalizeCustomWidget, parseCustomWidgetJson } from "../domain/home/customWidgetSchema";
import type { CustomWidgetDefinition, CustomWidgetSize } from "../domain/home/customWidgetTypes";
import { deleteCustomWidget, loadCustomWidgets, saveCustomWidget } from "../features/widgets/customWidgetService";
import { CustomWidgetView } from "./CustomWidgetRenderer";
import type { UserSettings } from "../types";

interface AppWidgetsProps {
  settings: UserSettings;
  onClose: () => void;
  onPlaceWidget: (widget: CustomWidgetDefinition) => void;
}

type ChatEntry = { id: string; role: "assistant" | "user"; text: string; imageDataUrl?: string };
type BuiltinType = "welcome" | "album" | "calendar" | "time" | "music" | "dual-music" | "anniversary" | "todo" | "reading" | "stats";
type BuiltinPreset = { id: string; name: string; size: CustomWidgetSize; type: BuiltinType; description: string };

const BUILTIN_PRESETS: BuiltinPreset[] = [
  { id: "system-welcome", name: "欢迎卡片", size: "1x4", type: "welcome", description: "个人签名与头像" },
  { id: "system-album", name: "精选相册", size: "2x2", type: "album", description: "桌面照片轮播" },
  { id: "system-music", name: "音乐播放", size: "2x2", type: "music", description: "当前歌曲与播放控制" },
  { id: "system-calendar", name: "日期相册", size: "2x4", type: "calendar", description: "日期、星期与背景图" },
  { id: "system-time", name: "时间", size: "2x4", type: "time", description: "时间与日期" },
  { id: "system-dual-music", name: "双人音乐", size: "2x3", type: "dual-music", description: "两个人的播放状态" },
  { id: "system-anniversary", name: "纪念日", size: "2x2", type: "anniversary", description: "专属日期倒计时" },
  { id: "system-todo", name: "待办清单", size: "2x2", type: "todo", description: "今天要完成的事" },
  { id: "system-reading", name: "阅读摘录", size: "2x4", type: "reading", description: "最近读到的句子" },
  { id: "system-stats", name: "聊天统计", size: "2x2", type: "stats", description: "聊天活跃度" },
];

const SIZE_CLASSES: Record<CustomWidgetSize, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x2": "col-span-2 row-span-2",
  "1x4": "col-span-1 row-span-4",
  "2x3": "col-span-2 row-span-3",
  "2x4": "col-span-2 row-span-4",
};

const sizeText = (size: CustomWidgetSize) => size.replace("x", " × ");

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^\w\u4e00-\u9fff-]+/g, "-") || "fanfanji-widget"}.ffwidget.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportWidgets(widgets: CustomWidgetDefinition[]) {
  if (widgets.length === 0) return false;
  downloadJson("fanfanji-widgets", {
    format: "fanfanji-widgets",
    version: 1,
    exportedAt: Date.now(),
    widgets,
  });
  return true;
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function parseSize(text: string): CustomWidgetSize | undefined {
  const match = text.replaceAll("×", "x").match(/\b(1x1|2x2|1x4|2x3|2x4)\b/i);
  return match?.[1].toLowerCase() as CustomWidgetSize | undefined;
}

function parseCreator(text: string): string | undefined {
  const match = text.match(/(?:制作人|作者|署名|制作者)\s*(?:(?:是|为|改成|：|:)\s*)?([^，。,\.。！!\n]{1,32})/i);
  return match?.[1]?.trim();
}

function parseName(text: string): string | undefined {
  const match = text.match(/(?:标题|名字|名称)\s*(?:(?:改成|改为|为|是|：|:)\s*)?([^，。,\.。！!\n]{1,40})/i);
  return match?.[1]?.trim();
}

function applyLocalEdit(base: CustomWidgetDefinition, text: string): CustomWidgetDefinition {
  const size = parseSize(text);
  const creator = parseCreator(text);
  const requestedName = parseName(text);
  const next = createFallbackWidget(text, base.id);
  const isEditInstruction = /改|换|调整|增加|删除|颜色|标题|显示|布局|风格|制作人|作者|署名/i.test(text);
  if (!isEditInstruction) return { ...next, creator: creator || base.creator, size: size || next.size, name: requestedName || next.name };
  return {
    ...base,
    name: requestedName || base.name,
    size: size || base.size,
    creator: creator || base.creator,
    theme: /深色|黑色|夜间|暗色/i.test(text) ? "midnight" : /日出|暖色|粉色|橙色/i.test(text) ? "sunrise" : base.theme,
    accentColor: /蓝色|蓝白/i.test(text) ? "#4f86d9" : /绿色/i.test(text) ? "#36a269" : /红色|粉色/i.test(text) ? "#e45d73" : base.accentColor,
    blocks: /日历|日期|星期/i.test(text) ? [{ type: "calendar", showWeek: true, showLunar: /农历|阴历/i.test(text) }, ...base.blocks.filter((block) => block.type !== "calendar").slice(0, 3)] : base.blocks,
    updatedAt: Date.now(),
  };
}

function BuiltinWidgetPreview({ type }: { type: BuiltinType }) {
  if (type === "welcome") return <div className="flex h-full flex-col justify-center gap-2 bg-gradient-to-br from-sky-100 to-indigo-100 p-3 text-slate-800"><div className="flex items-center gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg">☻</div><div><p className="text-xs font-black">欢迎回来</p><p className="text-[9px] opacity-60">今天也要有好心情</p></div></div><p className="text-[10px] font-semibold opacity-70">记录生活，也记录和角色的每一次相遇。</p></div>;
  if (type === "album") return <div className="grid h-full grid-cols-2 grid-rows-2 gap-1 bg-stone-100 p-1"><div className="rounded-xl bg-gradient-to-br from-amber-200 to-rose-300" /><div className="rounded-xl bg-gradient-to-br from-sky-200 to-indigo-300" /><div className="rounded-xl bg-gradient-to-br from-emerald-200 to-cyan-300" /><div className="rounded-xl bg-gradient-to-br from-violet-200 to-fuchsia-300" /></div>;
  if (type === "calendar") return <div className="flex h-full flex-col justify-between bg-gradient-to-br from-slate-800 via-sky-700 to-indigo-500 p-3 text-white"><div className="text-[10px] font-bold opacity-80">SATURDAY · SEPTEMBER</div><div><p className="text-4xl font-black leading-none">19</p><p className="mt-1 text-xs font-bold">丙午年八月初九</p></div><div className="flex justify-between text-[9px] opacity-85"><span>农历日期</span><span>星期六</span></div></div>;
  if (type === "time") return <div className="flex h-full flex-col justify-center bg-slate-900 p-2 text-center text-white"><p className="text-xl font-black tabular-nums">16:15</p><p className="mt-1 text-[9px] opacity-70">9月19日 · 星期六</p></div>;
  if (type === "music") return <div className="flex h-full items-center gap-2 bg-gradient-to-br from-violet-200 to-indigo-300 p-2 text-indigo-950"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/75 text-xl">♫</div><div className="min-w-0"><p className="truncate text-[10px] font-black">等待播放</p><p className="truncate text-[9px] opacity-65">从音乐库挑一首歌</p><div className="mt-2 h-1 rounded-full bg-white/70" /></div></div>;
  if (type === "dual-music") return <div className="grid h-full grid-cols-2 gap-1 bg-indigo-50 p-1"><div className="flex flex-col justify-between rounded-xl bg-white p-2"><span className="text-[8px] text-slate-400">角色</span><span className="text-lg">♫</span><span className="truncate text-[8px] font-bold">未绑定</span></div><div className="flex flex-col justify-between rounded-xl bg-white p-2"><span className="text-[8px] text-slate-400">我</span><span className="text-lg">♬</span><span className="truncate text-[8px] font-bold">我的歌单</span></div></div>;
  if (type === "anniversary") return <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-rose-100 to-amber-100 p-2 text-rose-900"><span className="text-2xl">♥</span><p className="mt-1 text-[9px] font-black">我们的纪念日</p><p className="text-2xl font-black">128</p><p className="text-[8px] opacity-60">天</p></div>;
  if (type === "todo") return <div className="h-full bg-white p-3 text-stone-800"><p className="text-xs font-black">今天要做的事</p><div className="mt-3 space-y-2 text-[9px] font-semibold"><p>● 完成一个小目标</p><p>● 给重要的人发消息</p><p className="opacity-45">○ 留一点时间给自己</p></div></div>;
  if (type === "reading") return <div className="flex h-full flex-col justify-between bg-amber-50 p-3 text-stone-800"><p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Reading note</p><p className="line-clamp-4 text-xs font-bold leading-5">“真正重要的事，值得慢慢读，也值得反复记住。”</p><p className="text-[9px] opacity-50">最近阅读 · 热吻缺陷</p></div>;
  return <div className="h-full bg-sky-50 p-2 text-slate-800"><p className="text-[10px] font-black">聊天活跃度</p><div className="mt-3 grid grid-cols-8 gap-1">{Array.from({ length: 40 }, (_, index) => <span key={index} className={`aspect-square rounded-[3px] ${index % 7 === 0 ? "bg-sky-500" : index % 3 === 0 ? "bg-sky-300" : "bg-sky-100"}`} />)}</div><p className="mt-2 text-[8px] opacity-55">连续聊天 · 3 天</p></div>;
}

function WidgetTile({ size, label, meta, children, onClick }: { size: CustomWidgetSize; label: string; meta?: string; children: React.ReactNode; onClick?: () => void; key?: React.Key }) {
  return <div className={`group relative min-h-0 ${SIZE_CLASSES[size]}`}><div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(event) => { if (onClick && (event.key === "Enter" || event.key === " ")) onClick(); }} className="relative h-full w-full overflow-hidden rounded-[22px] text-left shadow-sm ring-1 ring-black/5 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">{children}<span className="pointer-events-none absolute inset-x-2 bottom-2 truncate rounded-full bg-black/45 px-2 py-1 text-[8px] font-bold text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">{label}{meta ? ` · ${meta}` : ""}</span></div></div>;
}

export default function AppWidgets({ settings, onClose, onPlaceWidget }: AppWidgetsProps) {
  const [widgets, setWidgets] = useState<CustomWidgetDefinition[]>([]);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<CustomWidgetDefinition | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([{ id: "welcome", role: "assistant", text: "告诉我你想做什么小组件。你也可以直接说尺寸、颜色、布局、制作人，或者上传一张参考图。" }]);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAllBuiltins, setShowAllBuiltins] = useState(false);

  const refresh = async () => setWidgets(await loadCustomWidgets());
  useEffect(() => { void refresh(); }, []);
  const hasApi = Boolean(settings.apiKey?.trim() && settings.selectedModel?.trim());
  const sortedWidgets = useMemo(() => [...widgets].sort((a, b) => b.updatedAt - a.updatedAt), [widgets]);
  const selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId) || null;
  const previewWidget = draft || selectedWidget;
  const visibleBuiltins = showAllBuiltins ? BUILTIN_PRESETS : BUILTIN_PRESETS.slice(0, 6);

  const handlePromptChange = (value: string) => {
    setPrompt(value);
    if (!value.trim()) return;
    setDraft((current) => applyLocalEdit(current || createFallbackWidget(value), value));
  };

  const sendMessage = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    const userEntry: ChatEntry = { id: `user-${Date.now()}`, role: "user", text, imageDataUrl: referenceImage || undefined };
    const creator = parseCreator(text);
    const localDraft = applyLocalEdit(draft || createFallbackWidget(text), text);
    const nextHistory = [...messages, userEntry];
    setMessages(nextHistory);
    setPrompt("");
    setReferenceImage(null);
    setBusy(true);
    setMessage(null);
    try {
      let nextWidget = { ...localDraft, creator: creator || localDraft.creator, updatedAt: Date.now() };
      if (hasApi) {
        const result = await apiChat({
          message: text,
          history: nextHistory.slice(-12).map((entry) => ({ role: entry.role === "assistant" ? "model" : "user", text: entry.text })),
          apiKey: settings.apiKey,
          model: settings.selectedModel,
          apiEndpoint: settings.apiEndpoint,
          apiTemperature: settings.apiTemperature ?? 0.6,
          streamCompatible: settings.streamCompatible,
          maxOutputTokens: 900,
          imageDataUrl: userEntry.imageDataUrl,
          systemInstruction: "你是桌面小组件设计师。根据用户的多轮对话返回一个 JSON 小组件，不要 Markdown。字段必须有 name、size、theme、accentColor、blocks、creator；size 只能是 1x1、2x2、1x4、2x3、2x4；theme 只能是 paper、glass、midnight、sunrise；blocks 只能使用 text、calendar、list、quote。禁止返回代码、HTML、脚本或外部请求。保留之前已经确定的设计，只修改用户这次明确要求的部分。",
        });
        const parsed = parseCustomWidgetJson(result.text, { source: "ai", id: localDraft.id });
        if (parsed) nextWidget = { ...parsed, creator: creator || parsed.creator || localDraft.creator, id: localDraft.id, updatedAt: Date.now() };
      }
      setDraft(nextWidget);
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", text: hasApi ? "我已按这轮要求更新顶部预览，你可以继续告诉我哪里要改。" : "我已先生成本地预览，你可以继续描述尺寸、颜色、标题或制作人。" }]);
    } catch (error) {
      setDraft(localDraft);
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", text: `AI 暂时不可用，已保留本地预览。${error instanceof Error ? error.message : ""}` }]);
    } finally {
      setBusy(false);
    }
  };

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setReferenceImage(await readImageAsDataUrl(file));
      setMessage("参考图已附加到下一条消息");
    } catch {
      setMessage("参考图读取失败，请重试");
    }
  };

  const saveCurrent = async (place: boolean) => {
    if (!previewWidget) return;
    const normalized = normalizeCustomWidget({ ...previewWidget, updatedAt: Date.now() }, { id: previewWidget.id, source: previewWidget.source });
    if (!normalized) return setMessage("预览内容校验失败，请继续描述后重试");
    await saveCustomWidget(normalized);
    await refresh();
    setSelectedWidgetId(normalized.id);
    setDraft(null);
    if (place) onPlaceWidget(normalized);
    setMessage(place ? "已保存并添加到桌面" : "已保存，可从下方网格添加到桌面");
  };

  const importWidget = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const raw = await file.text();
    let imported = parseCustomWidgetJson(raw, { source: "import", id: createId("custom-widget-import") });
    let importedMany: CustomWidgetDefinition[] = [];
    if (!imported) {
      try {
        const envelope = JSON.parse(raw) as { widget?: unknown; widgets?: unknown[] };
        importedMany = Array.isArray(envelope.widgets)
          ? envelope.widgets
            .map((widget) => normalizeCustomWidget(widget, { source: "import", id: createId("custom-widget-import") }))
            .filter((widget): widget is CustomWidgetDefinition => Boolean(widget))
          : [];
        imported = normalizeCustomWidget(envelope.widget, { source: "import", id: createId("custom-widget-import") });
      } catch {
        imported = null;
      }
    }
    if (!imported && importedMany.length === 0) return setMessage("导入失败：文件不是有效的小组件配置");
    if (importedMany.length > 0) {
      await Promise.all(importedMany.map((widget) => saveCustomWidget(widget)));
      await refresh();
      setSelectedWidgetId(importedMany[0].id);
      return setMessage(`已导入 ${importedMany.length} 个小组件`);
    }
    if (!imported) return setMessage("导入失败：文件不是有效的小组件配置");
    const saved = await saveCustomWidget({ ...imported, source: "import", id: createId("custom-widget-import") });
    await refresh();
    setSelectedWidgetId(saved.id);
    setMessage(`已导入“${saved.name}”`);
  };

  const remove = async (widget: CustomWidgetDefinition) => {
    if (!window.confirm(`确定删除“${widget.name}”吗？桌面上的挂载位置也会失效。`)) return;
    await deleteCustomWidget(widget.id);
    if (selectedWidgetId === widget.id) setSelectedWidgetId(null);
    await refresh();
  };

  return (
    <div data-theme-page="widgets" className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <button type="button" onClick={onClose} className="app-nav-icon-button flex h-8 w-8 items-center justify-center" aria-label="返回"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-base font-black">小组件</h1>
        <div className="flex items-center gap-1.5">
          <label className="app-nav-icon-button flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[10px] font-bold" aria-label="导入小组件"><Upload className="h-4 w-4" /><span>导入</span><input type="file" accept=".json,.ffwidget,application/json" className="hidden" onChange={(event) => void importWidget(event)} /></label>
          <button type="button" onClick={() => { if (!exportWidgets(sortedWidgets)) setMessage("还没有可以导出的组件"); }} className="app-nav-icon-button flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-bold" aria-label="导出小组件"><Download className="h-4 w-4" /><span>导出</span></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-16">
        <section className="mx-3 mt-3 rounded-[26px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Live preview</p><h2 className="text-sm font-black">实时预览</h2></div>{previewWidget && <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[9px] font-bold text-[var(--text-secondary)]">{sizeText(previewWidget.size)}</span>}</div>
          <div className="mx-auto grid max-w-md grid-cols-4 auto-rows-[38px] gap-2 rounded-[24px] bg-[var(--surface-muted)] p-3 shadow-inner">
            {previewWidget ? <div className={`${SIZE_CLASSES[previewWidget.size]} min-h-0`}><CustomWidgetView widget={previewWidget} className="!rounded-[20px]" /></div> : <div className="col-span-4 row-span-4 flex items-center justify-center rounded-[20px] border border-dashed border-[var(--border)] px-8 text-center text-xs font-semibold text-[var(--text-secondary)]"><WandSparkles className="mr-2 h-4 w-4 shrink-0" />在下方聊天里描述一个小组件，顶部会立即出现预览</div>}
          </div>
          <div className="mt-2 flex justify-center gap-1.5" aria-label="预览页指示器"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /><span className="h-1.5 w-1.5 rounded-full bg-[var(--border)]" /><span className="h-1.5 w-1.5 rounded-full bg-[var(--border)]" /><span className="h-1.5 w-1.5 rounded-full bg-[var(--border)]" /></div>
          {previewWidget && <div className="mt-2 flex gap-2"><button type="button" onClick={() => void saveCurrent(false)} className="flex-1 rounded-xl bg-[var(--button-primary-bg)] py-2 text-xs font-black text-[var(--button-primary-text)]">保存小组件</button><button type="button" onClick={() => void saveCurrent(true)} className="flex-1 rounded-xl border border-[var(--border)] py-2 text-xs font-black">保存并添加到桌面</button></div>}
        </section>

        <section className="mx-3 mt-3 rounded-[26px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="mx-auto max-w-md space-y-3">
            {messages.map((entry) => <div key={entry.id} className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-5 ${entry.role === "user" ? "rounded-br-md bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "rounded-bl-md bg-[var(--surface-muted)] text-[var(--text-primary)]"}`}>{entry.imageDataUrl && <div className="mb-2 flex items-center gap-1 text-[9px] opacity-70"><ImagePlus className="h-3 w-3" />已附加参考图</div>}{entry.text}</div></div>)}
            {busy && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"><WandSparkles className="h-3.5 w-3.5 animate-pulse" />正在为你生成小组件…</div></div>}
            {referenceImage && <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[10px] text-[var(--text-secondary)]"><img src={referenceImage} alt="参考图预览" className="h-10 w-10 rounded-lg object-cover" /><span className="flex-1">参考图将随下一条消息发送</span><button type="button" onClick={() => setReferenceImage(null)} aria-label="移除参考图"><X className="h-4 w-4" /></button></div>}
            <div className="border-t border-[var(--border)] pt-3"><div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-2 shadow-sm"><label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface)]" aria-label="上传参考图片"><ImagePlus className="h-5 w-5" /><input type="file" accept="image/*" className="hidden" onChange={(event) => void handleImage(event)} /></label><textarea value={prompt} onChange={(event) => handlePromptChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={2} placeholder="描述组件，或继续告诉我哪里要改…" className="min-h-[42px] min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-xs outline-none" /><button type="button" onClick={() => void sendMessage()} disabled={!prompt.trim() || busy} aria-label="发送" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] shadow-sm disabled:opacity-40"><Send className="h-4 w-4" /></button></div>{message && <p className="mt-1 text-center text-[10px] font-semibold text-[var(--text-secondary)]">{message}</p>}</div>
          </div>
        </section>

        <section className="px-4 pb-6 pt-5">
          <div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Saved widgets</p><h2 className="text-base font-black">我的组件</h2></div><button type="button" onClick={() => setMessage(sortedWidgets.length > 0 ? `共 ${sortedWidgets.length} 个已保存组件` : "还没有已保存组件")} className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">全部 <span aria-hidden>›</span></button></div>
          {sortedWidgets.length === 0 ? <div className="py-7 text-center text-xs text-[var(--text-secondary)]"><Grid2X2 className="mx-auto mb-2 h-6 w-6 opacity-50" />还没有自制小组件</div> : <div className="grid grid-cols-4 auto-rows-[46px] gap-3">{sortedWidgets.map((widget) => <WidgetTile key={widget.id} size={widget.size} label={widget.name} meta={widget.creator} onClick={() => { setSelectedWidgetId(widget.id); setDraft(null); }}><CustomWidgetView widget={widget} className="!rounded-[22px]" /><span className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"><button type="button" onClick={(event) => { event.stopPropagation(); void remove(widget); }} aria-label={`删除${widget.name}`} className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"><Trash2 className="h-3 w-3" /></button><button type="button" onClick={(event) => { event.stopPropagation(); downloadJson(widget.name, { format: "fanfanji-widget", version: 1, widgetId: widget.id, widgetName: widget.name, creator: widget.creator, exportedAt: Date.now(), widget }); }} aria-label={`导出${widget.name}`} className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"><Download className="h-3 w-3" /></button></span></WidgetTile>)}</div>}
        </section>

        <section className="border-t border-[var(--border)] px-4 pb-8 pt-4">
          <div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Built-in</p><h2 className="text-sm font-black">系统内置小组件</h2></div><button type="button" onClick={() => setShowAllBuiltins((value) => !value)} className="text-[10px] font-bold text-[var(--accent)]">{showAllBuiltins ? "收起" : "查看全部"}</button></div>
          <div className="grid grid-cols-4 auto-rows-[46px] gap-3">{visibleBuiltins.map((preset) => <WidgetTile key={preset.id} size={preset.size} label={preset.name} meta={sizeText(preset.size)}><BuiltinWidgetPreview type={preset.type} /></WidgetTile>)}</div>
        </section>
      </div>
    </div>
  );
}
