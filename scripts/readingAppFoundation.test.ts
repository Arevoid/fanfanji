import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppReading from "../src/components/AppReading";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../src/components/AppStore.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const readingSource = readFileSync(new URL("../src/components/AppReading.tsx", import.meta.url), "utf8");

assert.match(appSource, /const loadAppReading = \(\) => import\("\.\/components\/AppReading"\)/);
assert.match(appSource, /reading: loadAppReading/);
assert.match(appSource, /const AppReading = React\.lazy\(loadAppReading\)/);
assert.match(appSource, /reading: \(className = "w-6 h-6"\) => <BookOpenText/);
assert.match(appSource, /id: "reading",[\s\S]*?name: "阅读",[\s\S]*?icon: AppIcons\.reading\(\)/);
assert.match(appSource, /activeApp === "reading"[\s\S]*?<AppReading[\s\S]*?userIdentityId=\{activeIdentityId\}/);
assert.match(storeSource, /id: "reading",[\s\S]*?name: "阅读",[\s\S]*?本地阅读与 AI 好友共读/);
assert.match(settingsSource, /\{ key: "reading", label: "阅读" \}/);
assert.match(readingSource, /data-theme-page="reading"/);

const defaultLayoutSection = appSource.slice(
  appSource.indexOf("const DEFAULT_HOME_SCREEN_ITEMS"),
  appSource.indexOf("const DEFAULT_WORLDBOOK_ENTRIES"),
);
assert.doesNotMatch(defaultLayoutSection, /id: "reading"/, "Reading is not silently placed on a fresh desktop");

const installedDefaultsSection = appSource.slice(
  appSource.indexOf("const [installedAppIds"),
  appSource.indexOf("// Global Music Player State"),
);
assert.doesNotMatch(installedDefaultsSection, /"reading"/, "Reading is installed only after an explicit store action");

const uninstallSection = appSource.slice(
  appSource.indexOf("const handleUninstallApp"),
  appSource.indexOf("const handleItemPointerDown"),
);
assert.doesNotMatch(uninstallSection, /phone_reading_store_v1|readingAssetDb|removeStoredValue/, "Uninstall keeps Reading business data");

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: new MemoryStorage() },
});

const markup = renderToStaticMarkup(React.createElement(AppReading, {
  userIdentityId: "identity-a",
  onClose: () => undefined,
}));
assert.match(markup, /把故事放进书架/);
assert.match(markup, /导入本地小说/);
assert.match(markup, /正文仅保存在本地/);
assert.match(markup, /阅读主导航/);
assert.match(markup, /书架/);
assert.match(markup, /共读/);
assert.match(markup, /世界/);

console.log("reading application foundation tests passed");
