import React, { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { ReadingStoryGenerationPreferences } from "../../domain/reading/storyTypes";
import { normalizeReadingStoryGenerationPreferences } from "../../domain/reading/storyGenerationPreferences";

const styles = ["沉浸细腻", "影视镜头", "文学抒情", "悬疑紧张", "轻松日常", "简洁明快"];

export default function ReadingStoryGenerationSettingsDialog({ value, onSave, onClose }: {
  value?: Partial<ReadingStoryGenerationPreferences>;
  onSave: (value: ReadingStoryGenerationPreferences) => void;
  onClose: () => void;
}) {
  const initial = normalizeReadingStoryGenerationPreferences(value);
  const [draft, setDraft] = useState(initial);
  const submit = () => onSave(normalizeReadingStoryGenerationPreferences(draft));

  return (
    <div className="absolute inset-0 z-[80] flex items-end bg-black/65 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="剧情生成设置" onClick={onClose}>
      <section className="max-h-[88%] w-full overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#1b1816] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[#eee8df] shadow-2xl sm:max-w-md sm:rounded-[2rem] sm:border" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/10 text-amber-300"><SlidersHorizontal className="h-5 w-5" /></span>
            <div><h2 className="text-base font-black">剧情生成设置</h2><p className="mt-1 text-[10px] text-white/40">仅影响这个故事后续生成的节点</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭剧情生成设置" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 space-y-4">
          <fieldset>
            <legend className="text-xs font-bold">每次剧情生成字数</legend>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input type="number" min={200} max={5000} step={100} value={draft.minCharacters} onChange={(event) => setDraft((current) => ({ ...current, minCharacters: Number(event.target.value) }))} aria-label="最少生成字数" className="h-11 min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-300/50" />
              <span className="text-white/35">—</span>
              <input type="number" min={200} max={5000} step={100} value={draft.maxCharacters} onChange={(event) => setDraft((current) => ({ ...current, maxCharacters: Number(event.target.value) }))} aria-label="最多生成字数" className="h-11 min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-300/50" />
            </div>
            <p className="mt-1.5 text-[10px] text-white/35">允许范围 200—5000 字，实际长度会受模型能力影响。</p>
          </fieldset>

          <label className="block text-xs font-bold">叙事风格
            <select value={draft.narrativeStyle} onChange={(event) => setDraft((current) => ({ ...current, narrativeStyle: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#26221f] px-3 text-sm outline-none">
              {styles.map((style) => <option key={style} value={style}>{style}</option>)}
            </select>
          </label>

          <label className="block text-xs font-bold">叙事视角
            <select value={draft.perspective} onChange={(event) => setDraft((current) => ({ ...current, perspective: event.target.value as ReadingStoryGenerationPreferences["perspective"] }))} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#26221f] px-3 text-sm outline-none">
              <option value="first_person">第一人称（我）</option>
              <option value="second_person">第二人称（你）</option>
              <option value="third_person">第三人称（角色名/TA）</option>
            </select>
          </label>

          <label className="block text-xs font-bold">补充内容 · 场外指导
            <textarea value={draft.guidance || ""} onChange={(event) => setDraft((current) => ({ ...current, guidance: event.target.value }))} rows={5} maxLength={4000} placeholder="例如：后续加强悬疑感；让两人逐渐建立信任；不要提前揭露幕后人物；整体走向偏圆满……" className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm leading-6 outline-none placeholder:text-white/25 focus:border-amber-300/50" />
            <span className="mt-1 block text-right text-[9px] text-white/30">{(draft.guidance || "").length}/4000</span>
          </label>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-white/10 text-xs font-bold">取消</button>
          <button type="button" onClick={submit} className="h-11 rounded-xl bg-amber-600 text-xs font-bold text-amber-50">保存设置</button>
        </div>
      </section>
    </div>
  );
}
