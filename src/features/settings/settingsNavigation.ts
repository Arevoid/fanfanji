export type SettingsTab =
  | "profile"
  | "api"
  | "image_api"
  | "appearance"
  | "beauty"
  | "data"
  | "system_config"
  | "system"
  | "minimax"
  | null;

const SETTINGS_TAB_TITLES: Record<Exclude<SettingsTab, null>, string> = {
  profile: "基础设置",
  api: "API 设置",
  image_api: "图片设置",
  appearance: "外观设置",
  beauty: "美化样式",
  data: "数据管理",
  system_config: "系统设置",
  system: "系统备份",
  minimax: "语音图片",
};

export function getSettingsHeaderTitle(tab: SettingsTab): string {
  return tab === null ? "设置" : SETTINGS_TAB_TITLES[tab];
}

export function getSettingsBackTarget(tab: SettingsTab): SettingsTab | "close" {
  if (tab !== null) return null;
  return "close";
}
