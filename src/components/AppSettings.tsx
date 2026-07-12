import React, { useState, useEffect } from "react";
import { UserSettings, StylePreset, ApiPreset } from "../types";
import { apiFetchModels, apiTestKey } from "../utils/apiHelper";
import {
  ChevronLeft,
  ChevronRight,
  User,
  Key,
  Palette,
  Image,
  Sparkles,
  RefreshCw,
  Sliders,
  Check,
  Save,
  Trash2,
  Lock,
  Plus,
  Eye,
  EyeOff,
  Download,
  Upload
} from "lucide-react";

import { compressImage } from "../utils/pngParser";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function getBubbleBackgroundStyle(hexColor: string, opacityPercent: number): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return hexColor;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacityPercent / 100})`;
}

interface AppSettingsProps {
  settings: UserSettings;
  presets: StylePreset[];
  onSaveSettings: (settings: UserSettings) => void;
  onSavePreset: (preset: StylePreset) => void;
  onDeletePreset: (id: string) => void;
  onClose: () => void;
}



const DEFAULT_PRESETS: StylePreset[] = [
  {
    id: "p-classic",
    name: "温和灰蓝 (Default)",
    bubbleCss: `.chat-bubble-self {
  background: #3b82f6 !important;
  color: #ffffff !important;
  border-radius: 18px 18px 2px 18px !important;
}
.chat-bubble-other {
  background: #e2e8f0 !important;
  color: #1e293b !important;
  border-radius: 18px 18px 18px 2px !important;
}`,
    globalCss: `.phone-screen-container {
  font-family: 'Inter', sans-serif;
}`,
    wallpaper: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
    themeColor: "#3b82f6"
  }
];

export default function AppSettings({
  settings,
  presets,
  onSaveSettings,
  onSavePreset,
  onDeletePreset,
  onClose,
}: AppSettingsProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "api" | "beauty" | "system_config" | "system" | null>(null);

  // PWA states
  const [isPwaInstallable, setIsPwaInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    if ((window as any).deferredPrompt) {
      setIsPwaInstallable(true);
    }

    const handlePromptAvailable = () => {
      setIsPwaInstallable(true);
    };

    window.addEventListener("pwa-install-prompt-available", handlePromptAvailable);
    return () => {
      window.removeEventListener("pwa-install-prompt-available", handlePromptAvailable);
    };
  }, []);

  const handlePwaInstall = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) {
      alert("抱歉，您的浏览器目前尚未触发 PWA 安装。通常这发生在您通过非安全连接访问、使用受限制的浏览器套壳，或者您的设备已经安装了该应用的情况下。\n\n请尝试在 Safari / Chrome / Edge 浏览器中直接打开本页面，或通过浏览器内置的“安装应用”/“添加到主屏幕”菜单选项进行手动安装！");
      return;
    }
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      console.log(`[PWA] Install prompt outcome: ${outcome}`);
      if (outcome === 'accepted') {
        (window as any).deferredPrompt = null;
        setIsPwaInstallable(false);
      }
    } catch (err: any) {
      console.error("[PWA] Install prompt failed:", err);
    }
  };

  // Local Form state
  const [name, setName] = useState(settings.name);
  const [avatar, setAvatar] = useState(settings.avatar);
  const [signature, setSignature] = useState(settings.signature);
  const [bio, setBio] = useState(settings.bio);
  const [wallpaper, setWallpaper] = useState(settings.wallpaper);
  const [bubbleCss, setBubbleCss] = useState(settings.bubbleCss);
  const [globalCss, setGlobalCss] = useState(settings.globalCss);
  const [showHomeButton, setShowHomeButton] = useState(!!settings.showHomeButton);
  const [dockColor, setDockColor] = useState(settings.dockColor || "#ffffff");
  const [dockOpacity, setDockOpacity] = useState(settings.dockOpacity !== undefined ? settings.dockOpacity : 70);
  const [widgetOpacity, setWidgetOpacity] = useState(settings.widgetOpacity !== undefined ? settings.widgetOpacity : 70);
  const [iconBorderRadius, setIconBorderRadius] = useState(settings.iconBorderRadius !== undefined ? settings.iconBorderRadius : 35);
  const [iconBgOpacity, setIconBgOpacity] = useState(settings.iconBgOpacity !== undefined ? settings.iconBgOpacity : 100);
  const [iconBorderWidth, setIconBorderWidth] = useState(settings.iconBorderWidth !== undefined ? settings.iconBorderWidth : 1);
  const [iconBorderOpacity, setIconBorderOpacity] = useState(settings.iconBorderOpacity !== undefined ? settings.iconBorderOpacity : 100);
  const [hideAppNames, setHideAppNames] = useState(!!settings.hideAppNames);

  // Beginner-friendly manual styling states
  const [avatarBorderRadius, setAvatarBorderRadius] = useState(settings.avatarBorderRadius !== undefined ? settings.avatarBorderRadius : 12);
  const [otherBubbleBg, setOtherBubbleBg] = useState(settings.otherBubbleBg || "#f4f4f5");
  const [otherBubbleColor, setOtherBubbleColor] = useState(settings.otherBubbleColor || "#18181b");
  const [otherBubbleRadius, setOtherBubbleRadius] = useState(settings.otherBubbleRadius !== undefined ? settings.otherBubbleRadius : 18);
  const [otherBubbleOpacity, setOtherBubbleOpacity] = useState(settings.otherBubbleOpacity !== undefined ? settings.otherBubbleOpacity : 100);
  const [selfBubbleBg, setSelfBubbleBg] = useState(settings.selfBubbleBg || "#18181b");
  const [selfBubbleColor, setSelfBubbleColor] = useState(settings.selfBubbleColor || "#ffffff");
  const [selfBubbleRadius, setSelfBubbleRadius] = useState(settings.selfBubbleRadius !== undefined ? settings.selfBubbleRadius : 18);
  const [selfBubbleOpacity, setSelfBubbleOpacity] = useState(settings.selfBubbleOpacity !== undefined ? settings.selfBubbleOpacity : 100);
  const [collapseConsecutiveAvatars, setCollapseConsecutiveAvatars] = useState(settings.collapseConsecutiveAvatars !== false);

  // New beauty settings states
  const [dockBorderRadius, setDockBorderRadius] = useState(settings.dockBorderRadius !== undefined ? settings.dockBorderRadius : 26);
  const [widgetBorderRadius, setWidgetBorderRadius] = useState(settings.widgetBorderRadius !== undefined ? settings.widgetBorderRadius : 22);
  const [iconBorderEnabled, setIconBorderEnabled] = useState(settings.iconBorderEnabled !== false);
  const [bubbleTailEnabled, setBubbleTailEnabled] = useState(settings.bubbleTailEnabled !== false);
  const [bubbleTailVertical, setBubbleTailVertical] = useState<"top" | "center" | "bottom">(settings.bubbleTailVertical || "top");
  const [bubblePosition, setBubblePosition] = useState<"side" | "above">(settings.bubblePosition === "above" ? "above" : "side");
  const [beautySubTab, setBeautySubTab] = useState<"desktop" | "chat" | "preset">("desktop");

  // Connection testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Preset Creator State
  const [newPresetName, setNewPresetName] = useState("");

  // New API configuration presets states
  const initialPresets: ApiPreset[] = settings.apiPresets || [
    {
      id: "preset-gemini",
      name: "Default Gemini",
      apiEndpoint: "",
      apiKey: "",
      selectedModel: "gemini-3.5-flash",
      apiTemperature: 0.7,
      streamCompatible: false
    },
    {
      id: "preset-deepseek",
      name: "DeepSeek Official",
      apiEndpoint: "https://api.deepseek.com/v1",
      apiKey: "",
      selectedModel: "deepseek-v4-flash",
      apiTemperature: 0.7,
      streamCompatible: false
    }
  ];
  const initialActiveId = settings.activeApiPresetId || "preset-gemini";
  const initialPreset = initialPresets.find(p => p.id === initialActiveId) || initialPresets[0];

  const [apiPresets, setApiPresets] = useState<ApiPreset[]>(initialPresets);
  const [activeApiPresetId, setActiveApiPresetId] = useState(initialActiveId);
  const [presetName, setPresetName] = useState(initialPreset?.name || "");
  const [apiEndpoint, setApiEndpoint] = useState(initialPreset?.apiEndpoint || "");
  const [apiKey, setApiKey] = useState(initialPreset?.apiKey || "");
  const [selectedModel, setSelectedModel] = useState(initialPreset?.selectedModel || "");
  const [apiTemperature, setApiTemperature] = useState(initialPreset?.apiTemperature !== undefined ? initialPreset.apiTemperature : 0.7);
  const [streamCompatible, setStreamCompatible] = useState(initialPreset?.streamCompatible || false);

  const [showPassword, setShowPassword] = useState(false);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const handleSelectPreset = (presetId: string, currentPresets: ApiPreset[] = apiPresets) => {
    const preset = currentPresets.find(p => p.id === presetId);
    if (preset) {
      setActiveApiPresetId(presetId);
      setPresetName(preset.name);
      setApiEndpoint(preset.apiEndpoint);
      setApiKey(preset.apiKey);
      setSelectedModel(preset.selectedModel);
      setApiTemperature(preset.apiTemperature);
      setStreamCompatible(preset.streamCompatible);
      setTestResult(null);
    }
  };

  const handleAddPreset = () => {
    const newId = "preset-" + Date.now().toString();
    const newPreset: ApiPreset = {
      id: newId,
      name: `新建配置 ${apiPresets.length + 1}`,
      apiEndpoint: "",
      apiKey: "",
      selectedModel: "gemini-3.5-flash",
      apiTemperature: 0.7,
      streamCompatible: false
    };
    const updated = [...apiPresets, newPreset];
    setApiPresets(updated);
    handleSelectPreset(newId, updated);
  };

  const handleDeletePreset = (idToDelete: string) => {
    if (apiPresets.length <= 1) {
      alert("最少需要保留一个 API 配置！");
      return;
    }
    const updated = apiPresets.filter(p => p.id !== idToDelete);
    setApiPresets(updated);
    const fallbackId = updated[0].id;
    handleSelectPreset(fallbackId, updated);
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    try {
      const apiKeyValue = apiKey.trim() || settings.apiKey;
      const endpointValue = apiEndpoint.trim();

      const models = await apiFetchModels({
        apiKey: apiKeyValue,
        apiEndpoint: endpointValue
      });

      if (models && models.length > 0) {
        setModelSuggestions(models);
        if (!models.includes(selectedModel)) {
          setSelectedModel(models[0]);
        }
      }
    } catch (error) {
      console.error("Fetch models error:", error);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSaveApiConfig = () => {
    const updatedPresets = apiPresets.map(p => {
      if (p.id === activeApiPresetId) {
        return {
          id: p.id,
          name: presetName.trim() || p.name,
          apiEndpoint: apiEndpoint.trim(),
          apiKey: apiKey.trim(),
          selectedModel: selectedModel.trim(),
          apiTemperature,
          streamCompatible
        };
      }
      return p;
    });
    
    setApiPresets(updatedPresets);
    
    onSaveSettings({
      ...settings,
      apiPresets: updatedPresets,
      activeApiPresetId,
      apiKey: apiKey.trim(),
      selectedModel: selectedModel.trim(),
      apiEndpoint: apiEndpoint.trim(),
      apiTemperature,
      streamCompatible
    });
    
    alert("API 配置保存成功！");
  };

  const handleSave = (updatedFields: Partial<UserSettings>) => {
    const updatedIdentities = (settings.identities || []).map(idty => {
      if (idty.id === (settings.activeIdentityId || "identity-1")) {
        return {
          ...idty,
          name: updatedFields.name !== undefined ? updatedFields.name : idty.name,
          avatar: updatedFields.avatar !== undefined ? updatedFields.avatar : idty.avatar,
          signature: updatedFields.signature !== undefined ? updatedFields.signature : idty.signature,
          bio: updatedFields.bio !== undefined ? updatedFields.bio : idty.bio,
        };
      }
      return idty;
    });

    const updated = {
      ...settings,
      ...updatedFields,
      identities: updatedIdentities
    };
    onSaveSettings(updated);
  };

  const handleSwitchIdentity = (id: string) => {
    const idty = (settings.identities || []).find(i => i.id === id);
    if (idty) {
      setName(idty.name);
      setAvatar(idty.avatar);
      setSignature(idty.signature);
      setBio(idty.bio);
      
      onSaveSettings({
        ...settings,
        activeIdentityId: id,
        name: idty.name,
        avatar: idty.avatar,
        signature: idty.signature,
        bio: idty.bio
      });
    }
  };

  useEffect(() => {
    setName(settings.name);
    setAvatar(settings.avatar);
    setSignature(settings.signature);
    setBio(settings.bio);
  }, [settings.activeIdentityId, settings.name, settings.avatar, settings.signature, settings.bio]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 400, 400, 0.75);
        setAvatar(compressed);
        handleSave({ avatar: compressed });
      } catch (err) {
        console.error("Avatar compression failed:", err);
      }
    }
  };

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 1000, 1000, 0.7);
        setWallpaper(compressed);
        handleSave({ wallpaper: compressed });
      } catch (err) {
        console.error("Wallpaper compression failed:", err);
      }
    }
  };

  const handleIconUpload = async (appKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 120, 120, 0.8);
        const updatedIcons = { ...settings.customIcons, [appKey]: compressed };
        handleSave({ customIcons: updatedIcons });
      } catch (err) {
        console.error("Icon compression failed:", err);
      }
    }
  };

  const handleRestoreAllIcons = () => {
    handleSave({ customIcons: {} });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const apiKeyValue = apiKey.trim() || settings.apiKey;
      const endpointValue = apiEndpoint.trim();

      const result = await apiTestKey({
        apiKey: apiKeyValue,
        model: selectedModel,
        apiEndpoint: endpointValue
      });

      setTestResult({
        success: result.success,
        msg: result.message
      });
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message || "连接失败" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCurrentAsPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    const newPreset: StylePreset = {
      id: "preset-" + Date.now().toString(),
      name: newPresetName.trim(),
      bubbleCss,
      globalCss,
      wallpaper,
      themeColor: "#3b82f6"
    };

    onSavePreset(newPreset);
    setNewPresetName("");
  };

  const applyPreset = (preset: StylePreset) => {
    setWallpaper(preset.wallpaper);
    setBubbleCss(preset.bubbleCss);
    setGlobalCss(preset.globalCss);
    
    onSaveSettings({
      ...settings,
      wallpaper: preset.wallpaper,
      bubbleCss: preset.bubbleCss,
      globalCss: preset.globalCss,
      activePreset: preset.name
    });
  };

  const activePresetsList = [...DEFAULT_PRESETS, ...presets];

  const appKeys = [
    { key: "chat", label: "聊天" },
    { key: "archives", label: "档案馆" },
    { key: "worldbook", label: "世界书" },
    { key: "music", label: "音乐" },
    { key: "schedule", label: "日程" },
    { key: "forum", label: "论坛" },
    { key: "notes", label: "备忘录" },
    { key: "store", label: "应用商店" },
    { key: "settings", label: "设置" }
  ];

  const getHeaderTitle = () => {
    switch (activeTab) {
      case "profile":
        return "基础设置";
      case "api":
        return "API 设置";
      case "beauty":
        return "美化设置";
      case "system_config":
        return "系统设置";
      case "system":
        return "系统备份";
      default:
        return "设置";
    }
  };

  const handleBack = () => {
    if (activeTab !== null) {
      setActiveTab(null);
    } else {
      onClose();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
        <button
          onClick={handleBack}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
          id="settings_back_btn"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
          {getHeaderTitle()}
        </h1>
        <div className="w-8 h-8" />
      </div>

      {/* Settings Navigation and Body Wrapper */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === null ? (
          /* Settings Main Entrance Menu (QQ Style) */
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {/* QQ Style User Profile Card */}
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col gap-4 relative overflow-hidden">
              {/* Background decorative soft blur gradients */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/40 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-50/30 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-start justify-between relative z-10">
                <div className="flex gap-4">
                  {/* Avatar with modify overlay */}
                  <div className="relative group">
                    <img
                      src={avatar}
                      alt={name}
                      className="w-16 h-16 rounded-full border border-slate-200/80 object-cover shadow-sm bg-slate-50"
                      referrerPolicy="no-referrer"
                    />
                    <label className="absolute -bottom-1 -right-1 bg-neutral-950 text-white rounded-full p-1 border-2 border-white cursor-pointer shadow-sm hover:bg-neutral-900 transition-colors">
                      <Sliders className="w-3 h-3" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="flex flex-col justify-center min-h-[64px]">
                    <span className="text-base font-extrabold text-slate-800 tracking-tight">{name}</span>
                  </div>
                </div>

                {/* Edit button */}
                <button
                  onClick={() => setActiveTab("profile")}
                  className="text-[10.5px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors px-3 py-1.5 rounded-full shadow-sm"
                >
                  编辑资料
                </button>
              </div>

              {/* Signature */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100/60 relative z-10 text-left">
                <div className="text-xs text-slate-700 flex items-start gap-1">
                  <span className="text-slate-400 font-medium shrink-0">签名:</span>
                  <span className="italic text-slate-600 font-medium line-clamp-1">{signature || "暂无签名"}</span>
                </div>
              </div>
            </div>

            {/* Navigation Entry List */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100/60">
              {/* 2. API Settings */}
              <button
                onClick={() => setActiveTab("api")}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/85 transition-all text-left group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-6 h-6 flex items-center justify-center text-slate-800 transition-transform group-hover:scale-105 shrink-0">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800">API 设置</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">配置大模型端点、API Key与模型选择</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
              </button>

              {/* 3. Aesthetics Settings */}
              <button
                onClick={() => setActiveTab("beauty")}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/85 transition-all text-left group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-6 h-6 flex items-center justify-center text-slate-800 transition-transform group-hover:scale-105 shrink-0">
                    <Palette className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800">美化设置</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">更换壁纸、上传自定义系统应用图标、注入CSS</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
              </button>

              {/* 4. System Config */}
              <button
                onClick={() => setActiveTab("system_config")}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/85 transition-all text-left group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-6 h-6 flex items-center justify-center text-slate-800 transition-transform group-hover:scale-105 shrink-0">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800">系统设置</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">控制一键回到桌面悬浮按钮的开启状态</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
              </button>

              {/* 5. System Backup */}
              <button
                onClick={() => setActiveTab("system")}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/85 transition-all text-left group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-6 h-6 flex items-center justify-center text-slate-800 transition-transform group-hover:scale-105 shrink-0">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800">系统备份</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">本地数据打包导出，对话备份及恢复</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
              </button>
            </div>
            
            <div className="text-center pt-8">
              <span className="text-[10px] font-mono text-slate-400">小手机系统版本 v3.5.0 • 星空探索版</span>
            </div>
          </div>
        ) : (
          /* Independent sub-pages */
          <div className="flex-1 overflow-y-auto p-4 pb-24 bg-slate-50/50">
            <div className="max-w-md mx-auto space-y-4">
          
          {/* PROFILE SETTINGS TAB */}
          {activeTab === "profile" && (
            <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">个人资料</h3>
              
              {/* Identity Switcher */}
              <div className="border-b border-slate-50 pb-4">
                <div className="grid grid-cols-3 gap-2">
                  {(settings.identities || []).map((idty, index) => {
                    const isSelected = idty.id === (settings.activeIdentityId || "identity-1");
                    return (
                      <button
                        key={idty.id}
                        type="button"
                        onClick={() => handleSwitchIdentity(idty.id)}
                        className={`flex items-center justify-center py-2 px-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? "border-neutral-950 ring-1 ring-neutral-950 text-neutral-950 font-bold bg-white"
                            : "border-slate-200 text-slate-400 bg-white hover:bg-slate-50 hover:text-slate-600"
                        }`}
                      >
                        <span className="text-[10px] font-bold truncate max-w-full block w-full">
                          {idty.name || `预设 ${index + 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Avatar Selector */}
              <div className="flex flex-col items-center py-2 border-b border-slate-50 pb-4">
                <div className="relative">
                  <img
                    src={avatar}
                    alt="My avatar"
                    className="w-16 h-16 rounded-full object-crop border border-slate-200 shadow-sm bg-slate-100"
                  />
                  <label className="absolute -bottom-1 -right-1 bg-neutral-950 text-white rounded-full p-1 border-2 border-white cursor-pointer shadow-sm hover:bg-neutral-900 transition-colors">
                    <Sliders className="w-3 h-3" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <span className="text-[10px] text-slate-400 mt-2">点击修改机主头像</span>
              </div>

              {/* Username Input */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">机主昵称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    handleSave({ name: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-semibold"
                />
              </div>

              {/* Personal signature */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">个性签名</label>
                <input
                  type="text"
                  value={signature}
                  onChange={(e) => {
                    setSignature(e.target.value);
                    handleSave({ signature: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs"
                />
              </div>

              {/* Personal Bio */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">我的人设介绍</label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value);
                    handleSave({ bio: e.target.value });
                  }}
                  placeholder=""
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* API SETTINGS TAB */}
          {activeTab === "api" && (
            <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                <span>智能体模型设置</span>
              </h3>

              {/* 预设配置 Profile Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">预设配置</label>
                <div className="flex items-center gap-2">
                  <select
                    value={activeApiPresetId}
                    onChange={(e) => handleSelectPreset(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-semibold"
                  >
                    {apiPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  
                  <button
                    onClick={handleAddPreset}
                    type="button"
                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                    title="添加新配置"
                  >
                    <Plus className="w-4 h-4 text-slate-600" />
                  </button>
                  
                  <button
                    onClick={() => handleDeletePreset(activeApiPresetId)}
                    type="button"
                    className="p-2 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
                    title="删除当前配置"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                  </button>
                </div>
              </div>

              {/* 配置名称 Input */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">配置名称 / PRESET NAME</label>
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="请输入配置名称"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-bold"
                />
              </div>

              {/* API 地址 (Endpoint) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">API 地址 / ENDPOINT (选填，留空则为官方Gemini)</label>
                <input
                  type="text"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder="例如 https://api.deepseek.com/v1"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-mono"
                />
              </div>

              {/* API 密钥 (API Key) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">API 密钥 / API KEY</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="请输入 API Key"
                    className="w-full pl-3 pr-10 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* 模型选择 / MODEL */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-slate-500">模型选择 / MODEL</label>
                  <button
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    type="button"
                    className="text-[9px] text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetchingModels ? "animate-spin" : ""}`} />
                    <span>点击拉取列表</span>
                  </button>
                </div>
                
                {modelSuggestions.length > 0 ? (
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-semibold"
                  >
                    {modelSuggestions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    placeholder="先拉取列表或手动输入模型名"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-semibold"
                  />
                )}
              </div>

              {/* API 温度 / TEMPERATURE */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-slate-500">API 温度 / TEMPERATURE</label>
                  <span className="text-xs font-mono font-bold text-slate-700">{apiTemperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.1"
                  value={apiTemperature}
                  onChange={(e) => setApiTemperature(parseFloat(e.target.value))}
                  className="w-full accent-neutral-950"
                />
              </div>

              {/* 流式兼容模式 / STREAM COMPATIBLE */}
              <div className="flex items-center justify-between py-2 border-t border-b border-slate-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-700">流式兼容模式</h4>
                  <p className="text-[9px] text-slate-400 leading-normal">开启后兼容流式数据输出格式</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStreamCompatible(!streamCompatible)}
                  className={`w-9 h-5 rounded-full transition-colors relative focus:outline-none ${
                    streamCompatible ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${
                      streamCompatible ? "translate-x-4" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Bottom Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  {isTesting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>测试连接</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveApiConfig}
                  className="flex-1 py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>保存配置</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold border ${
                    testResult.success
                      ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                      : "bg-rose-50 text-rose-800 border-rose-100"
                  }`}
                >
                  {testResult.msg}
                </div>
              )}
            </div>
          )}

          {/* BEAUTY SETTINGS TAB */}
          {activeTab === "beauty" && (
            <div className="space-y-4 text-left">
              {/* Classification Navigation Bar */}
              <div className="flex items-center p-1 bg-slate-100 rounded-2xl gap-1.5 select-none mb-4">
                <button
                  type="button"
                  onClick={() => setBeautySubTab("desktop")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    beautySubTab === "desktop"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  桌面模块
                </button>
                <button
                  type="button"
                  onClick={() => setBeautySubTab("chat")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    beautySubTab === "chat"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  聊天页面模块
                </button>
                <button
                  type="button"
                  onClick={() => setBeautySubTab("preset")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    beautySubTab === "preset"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  主题预设模块
                </button>
              </div>

              {/* 1. 桌面模块 */}
              {beautySubTab === "desktop" && (
                <div className="space-y-4 animate-fade-in">
                  {/* 手机壁纸设置 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-1 border-b border-slate-50">
                      <span className="text-xs font-bold text-slate-700">手机壁纸设置</span>
                      {wallpaper && !wallpaper.startsWith("linear-gradient") && (
                        <button
                          type="button"
                          onClick={() => {
                            const fallback = "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)";
                            setWallpaper(fallback);
                            handleSave({ wallpaper: fallback });
                          }}
                          className="text-[10px] text-red-500 hover:text-red-600 font-semibold"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                    
                    {wallpaper && !wallpaper.startsWith("linear-gradient") ? (
                      <div className="relative w-full h-32 rounded-[20px] overflow-hidden border border-slate-200 group">
                        <img
                          src={wallpaper}
                          alt="Wallpaper Preview"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <label className="cursor-pointer bg-white/90 hover:bg-white text-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors">
                            更换图片
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleWallpaperUpload}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const fallback = "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)";
                              setWallpaper(fallback);
                              handleSave({ wallpaper: fallback });
                            }}
                            className="bg-red-500/90 hover:bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100/50 p-6 rounded-[20px] text-xs transition-colors group w-full">
                        <span className="text-slate-500 font-medium group-hover:text-slate-700">点击上传手机壁纸图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleWallpaperUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Dock 栏设置 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                    <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-50">Dock 栏设置</div>
                    
                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-xs font-bold text-slate-700 shrink-0">Dock 栏透明度</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={dockOpacity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setDockOpacity(val);
                            handleSave({ dockOpacity: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{dockOpacity}%</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-xs font-bold text-slate-700 shrink-0">Dock 栏圆角</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="40"
                          value={dockBorderRadius}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setDockBorderRadius(val);
                            handleSave({ dockBorderRadius: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{dockBorderRadius}px</span>
                      </div>
                    </div>
                  </div>

                  {/* 小组件卡片设置 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                    <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-50">小组件卡片设置</div>

                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-xs font-bold text-slate-700 shrink-0">小组件透明度</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={widgetOpacity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setWidgetOpacity(val);
                            handleSave({ widgetOpacity: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{widgetOpacity}%</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-xs font-bold text-slate-700 shrink-0">小组件圆角</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="40"
                          value={widgetBorderRadius}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setWidgetBorderRadius(val);
                            handleSave({ widgetBorderRadius: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{widgetBorderRadius}px</span>
                      </div>
                    </div>
                  </div>

                  {/* 全局应用图标参数组 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                    <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-50">全局应用图标参数组</div>

                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-xs font-bold text-slate-700 shrink-0">图标圆角</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={iconBorderRadius}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setIconBorderRadius(val);
                            handleSave({ iconBorderRadius: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{iconBorderRadius}%</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-xs font-bold text-slate-700 shrink-0">图标背景透明度</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={iconBgOpacity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setIconBgOpacity(val);
                            handleSave({ iconBgOpacity: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{iconBgOpacity}%</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-t border-slate-50">
                      <span className="text-xs font-bold text-slate-700">图标描边开关</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !iconBorderEnabled;
                          setIconBorderEnabled(nextVal);
                          handleSave({ iconBorderEnabled: nextVal });
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          iconBorderEnabled ? "bg-neutral-950" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            iconBorderEnabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {iconBorderEnabled && (
                      <>
                        <div className="flex items-center justify-between gap-4 py-2">
                          <span className="text-xs font-bold text-slate-700 shrink-0">描边粗细</span>
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="10"
                              value={iconBorderWidth}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setIconBorderWidth(val);
                                handleSave({ iconBorderWidth: val });
                              }}
                              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                            />
                            <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{iconBorderWidth}px</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 py-2">
                          <span className="text-xs font-bold text-slate-700 shrink-0">描边透明度</span>
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={iconBorderOpacity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setIconBorderOpacity(val);
                                handleSave({ iconBorderOpacity: val });
                              }}
                              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                            />
                            <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{iconBorderOpacity}%</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 隐藏应用名称 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">隐藏桌面应用名称</span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !hideAppNames;
                        setHideAppNames(nextVal);
                        handleSave({ hideAppNames: nextVal });
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        hideAppNames ? "bg-neutral-950" : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          hideAppNames ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* 自定义图标区域 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-50">
                      <span className="text-xs font-bold text-slate-700">自定义应用图标</span>
                      <button
                        onClick={handleRestoreAllIcons}
                        className="text-[10px] text-slate-400 hover:text-neutral-950 font-semibold"
                      >
                        恢复所有默认图标
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2.5">
                      {appKeys.map((item) => {
                        const customImg = settings.customIcons[item.key];
                        return (
                          <div
                            key={item.key}
                            className="flex flex-col items-center bg-slate-50/60 p-2 rounded-[24px] border border-slate-100 hover:bg-slate-50 relative group cursor-pointer"
                          >
                            <label className="cursor-pointer flex flex-col items-center w-full">
                              <div 
                                className="w-10 h-10 bg-white border border-slate-200 flex items-center justify-center shadow-sm overflow-hidden shrink-0 group-hover:border-neutral-950 transition-colors"
                                style={{ borderRadius: "var(--app-icon-radius, 35%)" }}
                              >
                                {customImg ? (
                                  <img src={customImg} alt={item.label} className="w-full h-full object-cover" />
                                ) : (
                                  <Sliders className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-slate-600 mt-1.5 tracking-tight truncate w-full text-center">
                                {item.label}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleIconUpload(item.key, e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. 聊天页面模块 */}
              {beautySubTab === "chat" && (
                <div className="space-y-4 animate-fade-in">
                  {/* 实时预览窗口 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                    <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-50">实时预览效果</div>
                    
                     <div className="bg-slate-50/60 p-4 rounded-[24px] border border-slate-100 space-y-4 relative overflow-hidden">
                      {/* Message 1: Other Speaker (Always has avatar) */}
                      {bubblePosition === "above" ? (
                        /* Stacked layout for above */
                        <div className="w-full flex flex-col items-start">
                          <div className="flex items-center gap-2.5 mb-1 select-none flex-row">
                            <img
                              src="https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg"
                              alt=""
                              className="w-8 h-8 object-cover bg-slate-100 border border-slate-200 shrink-0"
                              style={{ borderRadius: `${avatarBorderRadius}px` }}
                            />
                            <div className="flex flex-col items-start text-[10px] text-slate-500/80">
                              <span className="font-bold text-slate-700/85">聊天对象 (AI)</span>
                            </div>
                          </div>
                          <div className="max-w-[75%] relative">
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200"
                              style={{
                                backgroundColor: getBubbleBackgroundStyle(otherBubbleBg, otherBubbleOpacity),
                                color: otherBubbleColor,
                                borderRadius: `${otherBubbleRadius}px`,
                              }}
                            >
                              这里是对方气泡预览，颜色和圆角都是同步修改的。
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-0 h-0"
                                  style={{
                                    borderColor: `transparent ${getBubbleBackgroundStyle(otherBubbleBg, otherBubbleOpacity)} transparent transparent`,
                                    borderStyle: "solid",
                                    borderWidth: "6px",
                                    left: "-11px",
                                    top: bubbleTailVertical === "top" ? "8px" : bubbleTailVertical === "center" ? "calc(50% - 6px)" : "auto",
                                    bottom: bubbleTailVertical === "bottom" ? "8px" : "auto"
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Side by side layout for side */
                        <div className="w-full flex flex-row items-start gap-2.5">
                          <img
                            src="https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg"
                            alt=""
                            className="w-8 h-8 object-cover bg-slate-100 border border-slate-200 shrink-0"
                            style={{ borderRadius: `${avatarBorderRadius}px` }}
                          />
                          <div className="flex flex-col items-start max-w-[75%]">
                            <span className="text-[9px] font-bold text-slate-400 mb-0.5">聊天对象 (AI)</span>
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200 relative"
                              style={{
                                backgroundColor: getBubbleBackgroundStyle(otherBubbleBg, otherBubbleOpacity),
                                color: otherBubbleColor,
                                borderRadius: `${otherBubbleRadius}px`,
                              }}
                            >
                              这里是对方气泡预览，颜色和圆角都是同步修改的。
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-0 h-0"
                                  style={{
                                    borderColor: `transparent ${getBubbleBackgroundStyle(otherBubbleBg, otherBubbleOpacity)} transparent transparent`,
                                    borderStyle: "solid",
                                    borderWidth: "6px",
                                    left: "-11px",
                                    top: bubbleTailVertical === "top" ? "8px" : bubbleTailVertical === "center" ? "calc(50% - 6px)" : "auto",
                                    bottom: bubbleTailVertical === "bottom" ? "8px" : "auto"
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Message 2: Other Speaker (Consecutive message, avatar collapses based on state) */}
                      {bubblePosition === "above" ? (
                        /* Stacked layout for above */
                        <div className="w-full flex flex-col items-start mt-1.5">
                          {!collapseConsecutiveAvatars && (
                            <div className="flex items-center gap-2.5 mb-1 select-none flex-row">
                              <img
                                src="https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg"
                                alt=""
                                className="w-8 h-8 object-cover bg-slate-100 border border-slate-200 shrink-0"
                                style={{ borderRadius: `${avatarBorderRadius}px` }}
                              />
                              <div className="flex flex-col items-start text-[10px] text-slate-500/80">
                                <span className="font-bold text-slate-700/85">聊天对象 (AI)</span>
                              </div>
                            </div>
                          )}
                          <div className="max-w-[75%] relative">
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200"
                              style={{
                                backgroundColor: getBubbleBackgroundStyle(otherBubbleBg, otherBubbleOpacity),
                                color: otherBubbleColor,
                                borderRadius: `${otherBubbleRadius}px`,
                              }}
                            >
                              启用“合并连续发言头像”后，连续发言的头像会被折叠哦~
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-0 h-0"
                                  style={{
                                    borderColor: `transparent ${getBubbleBackgroundStyle(otherBubbleBg, otherBubbleOpacity)} transparent transparent`,
                                    borderStyle: "solid",
                                    borderWidth: "6px",
                                    left: "-11px",
                                    top: bubbleTailVertical === "top" ? "8px" : bubbleTailVertical === "center" ? "calc(50% - 6px)" : "auto",
                                    bottom: bubbleTailVertical === "bottom" ? "8px" : "auto"
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Side by side layout for side */
                        <div className="w-full flex flex-row items-start gap-2.5 mt-1.5">
                          {!collapseConsecutiveAvatars ? (
                            <img
                              src="https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg"
                              alt=""
                              className="w-8 h-8 object-cover bg-slate-100 border border-slate-200 shrink-0"
                              style={{ borderRadius: `${avatarBorderRadius}px` }}
                            />
                          ) : (
                            /* Spacer to align bubble perfectly */
                            <div className="w-8 h-8 shrink-0" />
                          )}
                          <div className="flex flex-col items-start max-w-[75%]">
                            {!collapseConsecutiveAvatars && (
                              <span className="text-[9px] font-bold text-slate-400 mb-0.5">聊天对象 (AI)</span>
                            )}
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200 relative"
                              style={{
                                backgroundColor: getBubbleBackgroundStyle(otherBubbleBg, otherBubbleOpacity),
                                color: otherBubbleColor,
                                borderRadius: `${otherBubbleRadius}px`,
                              }}
                            >
                              启用“合并连续发言头像”后，连续发言的头像会被折叠哦~
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-0 h-0"
                                  style={{
                                    borderColor: `transparent ${getBubbleBackgroundStyle(otherBubbleBg, otherBubbleOpacity)} transparent transparent`,
                                    borderStyle: "solid",
                                    borderWidth: "6px",
                                    left: "-11px",
                                    top: bubbleTailVertical === "top" ? "8px" : bubbleTailVertical === "center" ? "calc(50% - 6px)" : "auto",
                                    bottom: bubbleTailVertical === "bottom" ? "8px" : "auto"
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Message 3: Self Speaker */}
                      {bubblePosition === "above" ? (
                        /* Stacked layout for above */
                        <div className="w-full flex flex-col items-end">
                          <div className="flex items-center gap-2.5 mb-1 select-none flex-row-reverse">
                            <img
                              src={settings.avatar || "https://free.picui.cn/free/2026/07/08/6a4e12049700d.png"}
                              alt=""
                              className="w-8 h-8 object-cover bg-slate-100 border border-slate-200 shrink-0"
                              style={{ borderRadius: `${avatarBorderRadius}px` }}
                            />
                            <div className="flex flex-col items-end text-[10px] text-slate-500/80">
                              <span className="font-bold text-slate-700/85">{settings.name || "我"}</span>
                            </div>
                          </div>
                          <div className="max-w-[75%] relative">
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200"
                              style={{
                                backgroundColor: getBubbleBackgroundStyle(selfBubbleBg, selfBubbleOpacity),
                                color: selfBubbleColor,
                                borderRadius: `${selfBubbleRadius}px`,
                              }}
                            >
                              我的专属气泡！效果完全同步 ✨
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-0 h-0"
                                  style={{
                                    borderColor: `transparent transparent transparent ${getBubbleBackgroundStyle(selfBubbleBg, selfBubbleOpacity)}`,
                                    borderStyle: "solid",
                                    borderWidth: "6px",
                                    right: "-11px",
                                    top: bubbleTailVertical === "top" ? "8px" : bubbleTailVertical === "center" ? "calc(50% - 6px)" : "auto",
                                    bottom: bubbleTailVertical === "bottom" ? "8px" : "auto"
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Side by side layout for side */
                        <div className="w-full flex flex-row-reverse items-start gap-2.5">
                          <img
                            src={settings.avatar || "https://free.picui.cn/free/2026/07/08/6a4e12049700d.png"}
                            alt=""
                            className="w-8 h-8 object-cover bg-slate-100 border border-slate-200 shrink-0"
                            style={{ borderRadius: `${avatarBorderRadius}px` }}
                          />
                          <div className="flex flex-col items-end max-w-[75%]">
                            <span className="text-[9px] font-bold text-slate-400 mb-0.5">{settings.name || "我"}</span>
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200 relative"
                              style={{
                                backgroundColor: getBubbleBackgroundStyle(selfBubbleBg, selfBubbleOpacity),
                                color: selfBubbleColor,
                                borderRadius: `${selfBubbleRadius}px`,
                              }}
                            >
                              我的专属气泡！效果完全同步 ✨
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-0 h-0"
                                  style={{
                                    borderColor: `transparent transparent transparent ${getBubbleBackgroundStyle(selfBubbleBg, selfBubbleOpacity)}`,
                                    borderStyle: "solid",
                                    borderWidth: "6px",
                                    right: "-11px",
                                    top: bubbleTailVertical === "top" ? "8px" : bubbleTailVertical === "center" ? "calc(50% - 6px)" : "auto",
                                    bottom: bubbleTailVertical === "bottom" ? "8px" : "auto"
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 双方头像圆角 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                    <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-50">头像设置</div>
                    
                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-xs font-bold text-slate-700 shrink-0">头像圆角</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="24"
                          value={avatarBorderRadius}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setAvatarBorderRadius(val);
                            handleSave({ avatarBorderRadius: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{avatarBorderRadius}px</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2.5 border-t border-slate-50">
                      <span className="text-xs font-bold text-slate-700">合并连续发言头像</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !collapseConsecutiveAvatars;
                          setCollapseConsecutiveAvatars(nextVal);
                          handleSave({ collapseConsecutiveAvatars: nextVal });
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          collapseConsecutiveAvatars ? "bg-neutral-950" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            collapseConsecutiveAvatars ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* 聊天气泡高级配置 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                    <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-50">聊天气泡高级配置</div>

                    <div className="flex items-center justify-between gap-4 py-1">
                      <span className="text-xs font-bold text-slate-700 shrink-0">我方气泡圆角</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="28"
                          value={selfBubbleRadius}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setSelfBubbleRadius(val);
                            handleSave({ selfBubbleRadius: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{selfBubbleRadius}px</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-1">
                      <span className="text-xs font-bold text-slate-700 shrink-0">对方气泡圆角</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="28"
                          value={otherBubbleRadius}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setOtherBubbleRadius(val);
                            handleSave({ otherBubbleRadius: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{otherBubbleRadius}px</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2.5 border-t border-slate-50">
                      <span className="text-xs font-bold text-slate-700">启用气泡尖角</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !bubbleTailEnabled;
                          setBubbleTailEnabled(nextVal);
                          handleSave({ bubbleTailEnabled: nextVal });
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          bubbleTailEnabled ? "bg-neutral-950" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            bubbleTailEnabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {bubbleTailEnabled && (
                      <div className="space-y-4 pt-1 border-t border-slate-50">
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-bold text-slate-700">尖角垂直位置</span>
                          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                            {(["top", "center", "bottom"] as const).map((pos) => (
                              <button
                                key={pos}
                                type="button"
                                onClick={() => {
                                  setBubbleTailVertical(pos);
                                  handleSave({ bubbleTailVertical: pos });
                                }}
                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                                  bubbleTailVertical === pos
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                              >
                                {pos === "top" ? "顶部对齐" : pos === "center" ? "居中对齐" : "底部对齐"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                     <div className="flex flex-col gap-2 pt-2 border-t border-slate-50">
                       <span className="text-xs font-bold text-slate-700">气泡相对头像位置</span>
                       <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                         {(["side", "above"] as const).map((pos) => (
                           <button
                             key={pos}
                             type="button"
                             onClick={() => {
                               setBubblePosition(pos);
                               handleSave({ bubblePosition: pos });
                             }}
                             className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                               bubblePosition === pos
                                 ? "bg-white text-slate-900 shadow-sm"
                                 : "text-slate-500 hover:text-slate-700"
                             }`}
                           >
                             {pos === "side" ? "头像两侧" : "头像上方"}
                           </button>
                         ))}
                       </div>
                     </div>
                  </div>

                  {/* 极简视觉调色盘 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                    <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-50">极简视觉调色盘</div>

                    {/* 对方气泡 */}
                    <div className="space-y-3 p-3 bg-slate-50/50 rounded-[24px] border border-slate-100">
                      <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">对方（角色）气泡</div>
                      
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">底色:</span>
                          <input
                            type="color"
                            value={otherBubbleBg}
                            onChange={(e) => {
                              setOtherBubbleBg(e.target.value);
                              handleSave({ otherBubbleBg: e.target.value });
                            }}
                            className="w-6 h-6 rounded cursor-pointer border border-slate-200 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">文字:</span>
                          <input
                            type="color"
                            value={otherBubbleColor}
                            onChange={(e) => {
                              setOtherBubbleColor(e.target.value);
                              handleSave({ otherBubbleColor: e.target.value });
                            }}
                            className="w-6 h-6 rounded cursor-pointer border border-slate-200 p-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 py-1">
                        <span className="text-xs font-bold text-slate-700 shrink-0">气泡透明度</span>
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={otherBubbleOpacity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setOtherBubbleOpacity(val);
                              handleSave({ otherBubbleOpacity: val });
                            }}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                          />
                          <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{otherBubbleOpacity}%</span>
                        </div>
                      </div>
                    </div>

                    {/* 我方气泡 */}
                    <div className="space-y-3 p-3 bg-slate-50/50 rounded-[24px] border border-slate-100">
                      <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">我方（用户）气泡</div>
                      
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">底色:</span>
                          <input
                            type="color"
                            value={selfBubbleBg}
                            onChange={(e) => {
                              setSelfBubbleBg(e.target.value);
                              handleSave({ selfBubbleBg: e.target.value });
                            }}
                            className="w-6 h-6 rounded cursor-pointer border border-slate-200 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">文字:</span>
                          <input
                            type="color"
                            value={selfBubbleColor}
                            onChange={(e) => {
                              setSelfBubbleColor(e.target.value);
                              handleSave({ selfBubbleColor: e.target.value });
                            }}
                            className="w-6 h-6 rounded cursor-pointer border border-slate-200 p-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 py-1">
                        <span className="text-xs font-bold text-slate-700 shrink-0">气泡透明度</span>
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={selfBubbleOpacity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setSelfBubbleOpacity(val);
                              handleSave({ selfBubbleOpacity: val });
                            }}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                          />
                          <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{selfBubbleOpacity}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 自定义 CSS */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
                    <span className="text-xs font-bold text-slate-700">高阶自定义气泡 CSS 样式</span>
                    <textarea
                      rows={3}
                      value={bubbleCss}
                      onChange={(e) => {
                        setBubbleCss(e.target.value);
                        handleSave({ bubbleCss: e.target.value });
                      }}
                      placeholder={`.chat-bubble-self { background: linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%) !important; }`}
                      className="w-full px-4 py-3 rounded-[24px] bg-slate-900 text-emerald-400 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-[10px] font-mono resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* 3. 主题预设模块 */}
              {beautySubTab === "preset" && (
                <div className="space-y-4 animate-fade-in">
                  {/* 保存预设 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                    <span className="text-xs font-bold text-slate-700">保存当前样式为新预设</span>
                    <form onSubmit={handleSaveCurrentAsPreset} className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="请输入预设名称..."
                        className="flex-1 bg-slate-50 rounded-[32px] px-4 py-2 text-xs text-slate-800 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-[32px] text-xs transition-colors flex items-center gap-1 shrink-0 shadow-sm"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>保存</span>
                      </button>
                    </form>
                  </div>

                  {/* 切换视觉预设 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
                    <span className="text-xs font-bold text-slate-700 block">预设模板库</span>
                    <div className="space-y-2">
                      {activePresetsList.map((preset) => {
                        const isActive = settings.activePreset === preset.name || 
                                         (preset.id === "p-classic" && !settings.activePreset);
                        return (
                          <div
                            key={preset.id}
                            className={`flex items-center justify-between p-2.5 rounded-[32px] border transition-all ${
                              isActive
                                ? "bg-stone-100 border-stone-300 text-stone-905"
                                : "bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <button
                              onClick={() => applyPreset(preset)}
                              className="flex-1 text-left font-bold text-xs flex items-center gap-2"
                            >
                              <div className="w-4 h-4 rounded-full border border-slate-200 shadow-sm shrink-0" style={{ background: preset.wallpaper }} />
                              <span className="text-[11px] text-[#52525b]">{preset.name}</span>
                              {isActive && <Check className="w-3.5 h-3.5 text-neutral-950 ml-1" />}
                            </button>

                            {!preset.id.startsWith("p-") && (
                              <button
                                onClick={() => onDeletePreset(preset.id)}
                                className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 全局 CSS 注入 */}
                  <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
                    <span className="text-xs font-bold text-slate-700">全局高阶 CSS 样式注入</span>
                    <textarea
                      rows={3}
                      value={globalCss}
                      onChange={(e) => {
                        setGlobalCss(e.target.value);
                        handleSave({ globalCss: e.target.value });
                      }}
                      placeholder={`/* 全局样式覆盖 */\n.phone-screen-container {\n  filter: contrast(1.05);\n}`}
                      className="w-full px-4 py-3 rounded-[24px] bg-slate-900 text-emerald-400 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-[10px] font-mono resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SYSTEM CONFIG TAB */}
          {activeTab === "system_config" && (
            <div className="space-y-4 text-left">
              {/* Floating Home Button Settings */}
              <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 tracking-wide">一键回到主页悬浮按钮</h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      在屏幕边缘显示一个半透明悬浮按钮，支持自由拖拽移动位置。点击可一键回到桌面主页。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !showHomeButton;
                      setShowHomeButton(nextVal);
                      handleSave({ showHomeButton: nextVal });
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-1 shrink-0 ${
                      showHomeButton ? "bg-neutral-950" : "bg-slate-200"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                        showHomeButton ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* PWA 渐进式独立应用管理器 */}
              <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-xs font-bold text-slate-800 tracking-wide">PWA 独立全屏应用模式</h4>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                    isStandalone 
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                      : "bg-amber-50 text-amber-600 border border-amber-100"
                  }`}>
                    {isStandalone ? "已全屏独立运行" : "普通网页浏览器模式"}
                  </span>
                </div>

                <p className="text-[10px] text-slate-500 leading-relaxed">
                  通过 PWA (Progressive Web App) 技术，您可以将<strong>饭饭机</strong>作为原生 App 安装到您的手机桌面。安装后点开可<strong>隐藏浏览器地址栏、实现沉浸式壁纸穿透状态栏、以及极其流畅的离线启动体验</strong>。
                </p>

                {isStandalone ? (
                  <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100/60 text-[10px] text-emerald-700 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <span>🎉</span> 恭喜！您已成功运行在 PWA 独立全屏环境下。
                    </p>
                    <p className="opacity-90">当前应用已完全隐藏浏览器顶底栏，享受 100% 沉浸式虚拟手机交互体验。</p>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    {/* Native Install Button Trigger */}
                    {isPwaInstallable ? (
                      <button
                        type="button"
                        onClick={handlePwaInstall}
                        className="w-full py-3 bg-neutral-950 hover:bg-neutral-900 text-white font-extrabold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>立即安装「饭饭机」到主屏幕</span>
                      </button>
                    ) : (
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/80 text-[10px] text-slate-600 space-y-1.5">
                        <p className="font-bold text-slate-700 flex items-center gap-1.5">
                          <span>💡</span> 温馨提示：如果上述按钮未出现，您可以手动安装：
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-slate-500 font-medium">
                          <li><strong>iOS 浏览器 (Safari/Edge/Chrome):</strong> 点击底部或顶部的「分享」按钮，向下滚动并选择<strong>「添加到主屏幕」</strong>。</li>
                          <li><strong>Android 浏览器 (Edge/Chrome/Samsung):</strong> 点击右上角「三点」菜单，选择<strong>「安装应用」</strong>或<strong>「添加到主屏幕」</strong>。</li>
                          <li><strong>电脑浏览器:</strong> 点击地址栏右侧的「安装应用」小图标 🖥️。</li>
                        </ul>
                      </div>
                    )}

                    <div className="bg-amber-50/40 p-3 rounded-2xl border border-amber-100/50 text-[10px] text-amber-700 space-y-1">
                      <p className="font-bold flex items-center gap-1">
                        <span>⚠️</span> 极重要注意事项:
                      </p>
                      <p className="leading-relaxed opacity-95">
                        由于浏览器安全策略限制，<strong>必须点击右上角新窗口/新标签页打开本网站</strong>（不可在开发平台的内嵌 iframe 预览框中），方可触发 PWA 安装和 Service Worker 注册！
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SYSTEM SETTINGS & BACKUP TAB */}
          {activeTab === "system" && (
            <div className="space-y-4 text-left">
              {/* Data Backup and Restore */}
              <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">数据备份与还原</h3>
                
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  您可以将本手机内的所有角色人设、对话记录、世界书词条、备忘录以及美化配置打包导出备份。未来可在任何设备上导入此文件进行100%完美还原。
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* Export Button */}
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const backupData: Record<string, string | null> = {};
                        const keysToBackup = [
                          "phone_calendar_events",
                          "phone_characters_v3",
                          "phone_homescreen_items",
                          "phone_installed_apps",
                          "phone_messages_v3",
                          "phone_moments_v3",
                          "phone_music_playlists",
                          "phone_music_tracks",
                          "phone_presets",
                          "phone_settings",
                          "phone_worldbook_entries"
                        ];
                        keysToBackup.forEach(key => {
                          backupData[key] = localStorage.getItem(key);
                        });

                        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
                        link.href = url;
                        link.download = `xiaoshouji_backup_${dateStr}.json`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                      } catch (err: any) {
                        alert("导出备份失败: " + err.message);
                      }
                    }}
                    className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all group"
                  >
                    <Download className="w-5 h-5 text-slate-600 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-slate-700">导出数据备份</span>
                    <span className="text-[8px] text-slate-400 mt-1">下载备份 JSON 文件</span>
                  </button>

                  {/* Import Button */}
                  <label className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all group cursor-pointer">
                    <Upload className="w-5 h-5 text-slate-600 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-slate-700">导入备份还原</span>
                    <span className="text-[8px] text-slate-400 mt-1">上传备份 JSON 文件</span>
                    <input
                      type="file"
                      accept="application/json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        const reader = new FileReader();
                        reader.onload = () => {
                          try {
                            const json = JSON.parse(reader.result as string);
                            if (typeof json !== "object" || json === null) {
                              throw new Error("无效的备份文件格式！");
                            }

                            // Validate key signature
                            const hasValidKey = Object.keys(json).some(k => k.startsWith("phone_"));
                            if (!hasValidKey) {
                              throw new Error("非有效的小手机备份文件！");
                            }

                            if (confirm("确定要导入此备份吗？这将会覆盖当前所有对话、人设、设置 and 世界书数据且不可撤销！")) {
                              Object.entries(json).forEach(([key, val]) => {
                                if (val !== null && typeof val === "string") {
                                  localStorage.setItem(key, val);
                                }
                              });
                              alert("导入成功！应用即将刷新加载新数据。");
                              window.location.reload();
                            }
                          } catch (err: any) {
                            alert("导入备份失败: " + err.message);
                          }
                        };
                        reader.readAsText(file);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Reset Cache and Return to Default */}
              <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-rose-500 uppercase tracking-wider">危险区域</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  清除缓存将删除此设备上的所有自定义角色、历史对话、世界书、日程、备忘录和朋友圈，系统也将恢复为最干净的初始设置。请注意此操作无法撤销。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("⚠️ 确定要清除所有缓存并恢复为默认设置吗？这会清空全部对话和角色数据且无法恢复！")) {
                      localStorage.clear();
                      alert("所有数据和缓存已成功清除，应用将刷新重置为出厂状态。");
                      window.location.reload();
                    }
                  }}
                  className="w-full py-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-600 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>清除缓存并恢复为默认</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
</div>
  );
}
