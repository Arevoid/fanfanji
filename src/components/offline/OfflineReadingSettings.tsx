import { Palette, SlidersHorizontal, Type, X } from "lucide-react";

export type OfflineReadingPreferences = {
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  paragraphSpacing: number;
  textColor: string;
  cardBackground: string;
};

type OfflineReadingSettingsProps = {
  value: OfflineReadingPreferences;
  onChange: (value: OfflineReadingPreferences) => void;
  onClose: () => void;
};

type RangeField = "fontSize" | "letterSpacing" | "lineHeight" | "paragraphSpacing";

const RANGE_SETTINGS: Array<{
  field: RangeField;
  title: string;
  icon: typeof Type;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}> = [
  { field: "fontSize", title: "字体大小", icon: Type, min: 13, max: 20, step: 1, format: (value) => `${value}px` },
  { field: "letterSpacing", title: "字间距", icon: SlidersHorizontal, min: -0.02, max: 0.08, step: 0.01, format: (value) => `${value.toFixed(2)}em` },
  { field: "lineHeight", title: "行间距", icon: SlidersHorizontal, min: 1.5, max: 2.4, step: 0.05, format: (value) => value.toFixed(2) },
  { field: "paragraphSpacing", title: "段间距", icon: SlidersHorizontal, min: 8, max: 32, step: 1, format: (value) => `${value}px` },
];

function isColorValue(value: string) {
  return /^#[\da-fA-F]{3,8}$/.test(value.trim()) || /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|0?\.\d+|1))?\s*\)$/.test(value.trim());
}

function ColorControl({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const update = (nextValue: string) => {
    if (isColorValue(nextValue)) onChange(nextValue.trim());
  };

  return (
    <section className="offline-reading-color-section">
      <div className="offline-reading-color-title"><Palette size={16} /><span>{title}</span></div>
      <div className="offline-reading-color-preview" style={{ backgroundColor: value }} aria-label={`${title}当前预览`} />
      <div className="offline-reading-color-inputs">
        <label>
          <span>HEX</span>
          <input
            type="text"
            defaultValue={value.startsWith("#") ? value : ""}
            placeholder="#1D1D1F"
            onChange={(event) => update(event.target.value)}
          />
        </label>
        <label>
          <span>RGB</span>
          <input
            type="text"
            defaultValue={value.startsWith("rgb") ? value : ""}
            placeholder="rgb(29,29,31)"
            onChange={(event) => update(event.target.value)}
          />
        </label>
      </div>
      <p>支持 HEX 或 RGB，输入合法颜色后即时预览。</p>
    </section>
  );
}

export function OfflineReadingSettings({ value, onChange, onClose }: OfflineReadingSettingsProps) {
  const update = <T extends keyof OfflineReadingPreferences>(field: T, nextValue: OfflineReadingPreferences[T]) => {
    onChange({ ...value, [field]: nextValue });
  };

  return (
    <div className="offline-reading-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="offline-reading-panel" role="dialog" aria-modal="true" aria-label="阅读设置" onMouseDown={(event) => event.stopPropagation()}>
        <div className="offline-panel-handle" />
        <header className="offline-panel-header">
          <div>
            <p className="offline-panel-eyebrow">READING</p>
            <h2>阅读设置</h2>
          </div>
          <button type="button" className="offline-icon-button" onClick={onClose} aria-label="关闭阅读设置"><X size={20} /></button>
        </header>

        <div className="offline-reading-panel-content">
          {RANGE_SETTINGS.map(({ field, title, icon: Icon, min, max, step, format }) => (
            <section className="offline-reading-range-row" key={field}>
              <div className="offline-reading-range-heading"><span><Icon size={16} />{title}</span><output>{format(value[field])}</output></div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value[field]}
                onChange={(event) => update(field, Number(event.target.value))}
                aria-label={title}
              />
              <div className="offline-reading-range-endpoints"><span>{format(min)}</span><span>{format(max)}</span></div>
            </section>
          ))}

          <ColorControl title="文字颜色" value={value.textColor} onChange={(nextValue) => update("textColor", nextValue)} />
          <ColorControl title="卡片背景" value={value.cardBackground} onChange={(nextValue) => update("cardBackground", nextValue)} />
        </div>
      </section>
    </div>
  );
}
