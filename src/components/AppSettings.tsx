import React, { useEffect } from "react";
import { UserSettings, StylePreset, type ChatIconKey, type ChatIconOverrides, type OfflineStory, type UserSettingsUpdate } from "../types";
import {
  ChevronLeft,
  ChevronRight,
  Key,
  Palette,
  Sparkles,
  RefreshCw,
  Sliders,
  Check,
  Save,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Download,
  Upload,
  Volume2,
  Monitor,
  Moon,
  Sun,
  Type as TypeIcon,
  Link
} from "lucide-react";

import { isTransparencyPreservedImage } from "../utils/pngParser";
import { useTheme } from "../features/theme/ThemeProvider";
import { type ThemeMode } from "../features/theme/theme";
import { hasUserDesktopWallpaper } from "../features/theme/desktopBackground";
import {
  DEFAULT_GLOBAL_FONT_SIZE,
  MAX_GLOBAL_FONT_SIZE,
  MIN_GLOBAL_FONT_SIZE,
  sanitizeGlobalFontSize,
} from "../features/theme/globalTypography";
import {
  getSettingsBackTarget,
  getSettingsHeaderTitle,
  type SettingsTab,
} from "../features/settings/settingsNavigation";
import { SystemBackupPanel } from "../features/settings/components/SystemBackupPanel";
import {
  CLASSIC_BUBBLE_PRESET_ID,
  CLASSIC_BUBBLE_PRESET_NAME,
  CLASSIC_BUBBLE_STRUCTURED_STYLE,
} from "../features/chat/styles/classicBubblePreset";
import { SYSTEM_BACKUP_VERSION } from "../features/settings/systemBackup";
import { sanitizeSystemBackupValue } from "../features/settings/systemBackupSanitizer";
import { storageKeys } from "../core/storage/storageKeys";
import { StorageDiagnosticsCard } from "../features/settings/components/StorageDiagnosticsCard";
import { APP_VERSION } from "../core/release/releaseInfo";
import { useStorageHealthActions } from "../features/settings/hooks/useStorageHealthActions";
import { useStorageCleanupActions } from "../features/settings/hooks/useStorageCleanupActions";
import { usePwaInstall } from "../features/settings/hooks/usePwaInstall";
import { useSettingsApiPresetState } from "../features/settings/hooks/useSettingsApiPresetState";
import { useSettingsAppearanceDraftState } from "../features/settings/hooks/useSettingsAppearanceDraftState";
import { useSettingsVoiceConfigState } from "../features/settings/hooks/useSettingsVoiceConfigState";
import { useSettingsNavigationState } from "../features/settings/hooks/useSettingsNavigationState";
import { useSettingsProfileDraftState } from "../features/settings/hooks/useSettingsProfileDraftState";
import { useSettingsStyleDraftState } from "../features/settings/hooks/useSettingsStyleDraftState";
import { useSettingsTransientUiState } from "../features/settings/hooks/useSettingsTransientUiState";
import { useSettingsChatIconState } from "../features/settings/hooks/useSettingsChatIconState";
import { useSettingsBackupUiState } from "../features/settings/hooks/useSettingsBackupUiState";
import { useSystemBackupActions } from "../features/settings/hooks/useSystemBackupActions";
import { useSettingsTransferActions } from "../features/settings/hooks/useSettingsTransferActions";
import { useSettingsImageApiActions } from "../features/settings/hooks/useSettingsImageApiActions";
import { useSettingsTextApiActions } from "../features/settings/hooks/useSettingsTextApiActions";
import { useSettingsVoiceActions } from "../features/settings/hooks/useSettingsVoiceActions";
import { useSettingsApiConnectionActions } from "../features/settings/hooks/useSettingsApiConnectionActions";
import { useSettingsAssetActions } from "../features/settings/hooks/useSettingsAssetActions";
import { useSettingsPresetActions } from "../features/settings/hooks/useSettingsPresetActions";
import { useSettingsApplyPresetAction } from "../features/settings/hooks/useSettingsApplyPresetAction";
import { useSettingsIdentityActions } from "../features/settings/hooks/useSettingsIdentityActions";
import { useSettingsClearDataActions } from "../features/settings/hooks/useSettingsClearDataActions";
import { useSettingsGlobalFontActions } from "../features/settings/hooks/useSettingsGlobalFontActions";
import { useSettingsScopedSave } from "../features/settings/hooks/useSettingsScopedSave";
import { useSettingsChatIconActions } from "../features/settings/hooks/useSettingsChatIconActions";
import { useSettingsCssTemplateCopy } from "../features/settings/hooks/useSettingsCssTemplateCopy";
import { getSettingsPreviewBubbleBackground, getSettingsPreviewBubbleStyle } from "../features/settings/settingsPreviewStyle";

interface AppSettingsProps {
  settings: UserSettings;
  /** The style actually used by the last/current chat, including character overrides. */
  bubbleStylePreset?: "default" | "floating-cute" | "liquid-glass";
  presets: StylePreset[];
  onSaveSettings: (update: UserSettingsUpdate) => boolean;
  onSavePreset: (preset: StylePreset) => void;
  onDeletePreset: (id: string) => void;
  onSwitchIdentity?: (id: string) => void;
  onClose: () => void;
}



const DEFAULT_PRESETS: StylePreset[] = [
  {
    id: CLASSIC_BUBBLE_PRESET_ID,
    name: CLASSIC_BUBBLE_PRESET_NAME,
    bubbleCss: "",
    globalCss: `.phone-screen-container {
  font-family: 'Inter', sans-serif;
}`,
    wallpaper: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
    themeColor: "#3b82f6"
  }
];

const CHAT_ICON_FIELDS: Array<{ key: ChatIconKey; label: string }> = [
  { key: "image", label: "图片" }, { key: "textImage", label: "文字图" }, { key: "voice", label: "语音" },
  { key: "sticker", label: "表情" }, { key: "redPacket", label: "红包" }, { key: "transfer", label: "转账" },
  { key: "location", label: "位置" }, { key: "call", label: "通话" }, { key: "plus", label: "加号" },
  { key: "sendOnly", label: "发送1（仅发送）" }, { key: "sendReply", label: "发送2（发送并回复）" }, { key: "stop", label: "停止" },
];

const GLOBAL_CHAT_CSS_EXAMPLE_TEMPLATE = `/* 仅作用于聊天页面；设置页和其他应用不会应用本样式。 */
#conv-screen {
  --chat-page-bg: var(--app-bg);
  --chat-header-bg: var(--surface);
  --chat-message-list-bg: var(--app-bg);
  --chat-user-bg: var(--button-primary-bg);
  --chat-user-text: var(--button-primary-text);
  --chat-ai-bg: var(--surface-raised);
  --chat-ai-text: var(--text-primary);
  --chat-bubble-border: var(--border);
  --chat-composer-bg: var(--surface);
  --chat-composer-border: var(--border);
  --chat-composer-border-width: 1px;
  --chat-composer-radius: 0px;
  --chat-composer-shadow: none;
  --chat-input-bg: var(--input-bg);
  --chat-send-bg: var(--button-primary-bg);
  --chat-send-text: var(--button-primary-text);
  --chat-send-border: var(--button-primary-bg);
  --chat-stop-bg: var(--button-primary-bg);
  --chat-stop-text: var(--button-primary-text);
  --chat-stop-border: var(--button-primary-bg);
  --chat-stop-icon: none;
  /* 底部展开功能栏的外框大小；只影响圆形/方形按钮框。 */
  --chat-attachment-icon-size: 2.5rem;
  /* 底部展开功能栏内部图片/默认图形大小；不改变按钮框。 */
  --chat-attachment-glyph-size: 1rem;
  --chat-attachment-panel-display: flex;
  --chat-attachment-label-display: block;
}

.chat-page {
  background: var(--chat-page-bg);
  background-size: cover;
  background-position: center;
}
.cv-header { background: var(--chat-header-bg); }
.cv-messages-list { background: var(--chat-message-list-bg); }
.chat-bubble-self { background: var(--chat-user-bg); color: var(--chat-user-text); border: 1px solid var(--chat-bubble-border); border-radius: 14px; }
.chat-bubble-other { background: var(--chat-ai-bg); color: var(--chat-ai-text); border: 1px solid var(--chat-bubble-border); border-radius: 14px; }
.chat-message--voice-wave,
.chat-message--voice-duration,
.chat-message--call-icon,
.chat-message--call-duration { color: currentColor; }
.chat-composer--default,
.chat-composer--floating,
.chat-composer--liquid {
  background: var(--chat-composer-bg);
  border: var(--chat-composer-border-width) solid var(--chat-composer-border);
  border-radius: var(--chat-composer-radius);
  box-shadow: var(--chat-composer-shadow);
}
.chat-input { background: var(--chat-input-bg); }
.send-button { background: var(--chat-send-bg); color: var(--chat-send-text); }
.chat-composer__stop-reply-button { background: var(--chat-stop-bg, var(--chat-send-bg)); color: var(--chat-stop-text, var(--chat-send-text)); border-color: var(--chat-stop-border, var(--chat-send-border)); }
.chat-composer__stop-reply-button .cv-send-reply-icon svg { display: none; }
.cv-stop-icon { background: var(--chat-stop-icon, none) center / contain no-repeat; }
.chat-attachment-icon { width: var(--chat-attachment-icon-size, 2.5rem); height: var(--chat-attachment-icon-size, 2.5rem); }
.chat-attachment-icon > svg,
.chat-attachment-icon > img { width: var(--chat-attachment-glyph-size, 1rem); height: var(--chat-attachment-glyph-size, 1rem); }
.chat-composer__attachment-panel { display: var(--chat-attachment-panel-display, flex); }
.chat-attachment-label { display: var(--chat-attachment-label-display, block); }
`;

const BACKUP_KEYS = [
  "phone_schedule_v1",
  "phone_characters",
  "phone_characters_v3",
  "phone_homescreen_items",
  "phone_installed_apps",
  "phone_memory_vault_items",
  "phone_memory_vault_settings",
  "phone_image_generation_records",
  "phone_messages",
  "phone_messages_v3",
  "phone_moments_v3",
  "phone_forum_threads",
  "phone_forum_replies",
  "phone_forum_shares",
  "phone_forum_generation_tasks",
  "phone_forum_actor_states",
  "phone_forum_activity_tasks",
  "phone_forum_profiles",
  "phone_forum_community_npcs",
  "phone_forum_translations",
  "phone_forum_stories",
  "phone_forum_story_characters",
  "phone_forum_story_users",
  "phone_forum_story_threads",
  "phone_forum_story_replies",
  "phone_forum_story_events",
  "phone_forum_story_updates",
  "phone_forum_story_execution_logs",
  "phone_forum_visit_history",
  "phone_forum_like_history",
  "phone_forum_notifications",
  "phone_diary_entries",
  "phone_diary_shares",
  "phone_diary_generation_tasks",
  "phone_diary_translations",
  "phone_diary_drafts",
  "phone_inner_voice_records",
  "phone_character_events",
  "phone_character_knowledge_claims",
  "phone_conversation_summaries",
  "phone_behavior_corrections",
  "phone_character_knowledge_migration_state",
  "phone_moment_topic_history",
  "phone_proactive_topic_history",
  "phone_moment_generation_tasks",
  "phone_character_relationships",
  "phone_music_playlists",
  "phone_music_tracks",
  "phone_dual_music_widget_configs",
  "phone_identity_music_states",
  "phone_relationship_music_states",
  "phone_offline_stories",
  "phone_reading_store_v1",
  "phone_reading_co_reading_store_v1",
  "phone_reading_analysis_store_v1",
  "phone_reading_story_store_v1",
  "phone_reading_co_story_store_v1",
  "phone_cinema_store_v1",
  "phone_relationship_network_maps_v1",
  "phone_relationship_network_npcs_v1",
  "phone_presets",
  "phone_settings",
  "phone_appearance_settings",
  "phone_worldbook_entries",
  "phone_last_read_timestamps",
  "phone_initiated_chat_ids",
  "phone_identity_wallet_balances",
  "wechat_wallet_balance",
  "wechat_redpacket_statuses",
] as const;

const BACKUP_KEY_SET = new Set<string>(BACKUP_KEYS);

const LIGHT_BACKUP_KEYS = [
  "phone_characters",
  "phone_characters_v3",
  "phone_messages",
  "phone_messages_v3",
  "phone_moments_v3",
  "phone_conversation_summaries",
  "phone_worldbook_entries",
  "phone_memory_vault_items",
  "phone_memory_vault_settings",
  "phone_character_events",
  "phone_character_knowledge_claims",
  "phone_character_relationships",
  "phone_diary_entries",
  "phone_diary_shares",
  "phone_diary_generation_tasks",
  "phone_diary_translations",
  "phone_diary_drafts",
  "phone_forum_threads",
  "phone_forum_replies",
  "phone_forum_shares",
  "phone_forum_profiles",
  "phone_forum_community_npcs",
  "phone_forum_translations",
  "phone_offline_stories",
  "phone_reading_store_v1",
  "phone_reading_co_reading_store_v1",
  "phone_reading_analysis_store_v1",
  "phone_reading_story_store_v1",
  "phone_reading_co_story_store_v1",
  "phone_cinema_store_v1",
  "phone_relationship_network_maps_v1",
  "phone_relationship_network_npcs_v1",
] as const;

export default function AppSettings({
  settings,
  bubbleStylePreset,
  presets,
  onSaveSettings,
  onSavePreset,
  onDeletePreset,
  onSwitchIdentity,
  onClose,
}: AppSettingsProps) {
  const { activeTab, setActiveTab } = useSettingsNavigationState();
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const effectiveBubbleStylePreset = bubbleStylePreset || settings.globalChatStylePreset || "default";

  const { isPwaInstallable, isStandalone, handlePwaInstall } = usePwaInstall();

  // Local Form state
  const { name, setName, avatar, setAvatar, signature, setSignature, bio, setBio } = useSettingsProfileDraftState(settings);
  const apiPresetState = useSettingsApiPresetState(settings);
  const voiceConfigState = useSettingsVoiceConfigState(settings);
  const styleDraftState = useSettingsStyleDraftState(settings);
  const {
    wallpaper, setWallpaper, bubbleCss, setBubbleCss, globalCss, setGlobalCss,
    chatGlobalCSS, setChatGlobalCSS, globalChatCssTemplateCopied, setGlobalChatCssTemplateCopied,
    showHomeButton, setShowHomeButton, hideStatusBar, setHideStatusBar,
    globalFontSize, setGlobalFontSize, globalFontUrlDraft, setGlobalFontUrlDraft,
    fontOperationPending, setFontOperationPending, fontOperationMessage, setFontOperationMessage,
  } = styleDraftState;
  const { chatIcons, setChatIcons } = useSettingsChatIconState(settings);
  const appearanceDraftState = useSettingsAppearanceDraftState(settings, effectiveBubbleStylePreset);
  const {
    showBackupExportOptions, setShowBackupExportOptions, lastBackupAt, setLastBackupAt,
    isClearingApplicationData, setIsClearingApplicationData,
  } = useSettingsBackupUiState();
  const { handleExportFull, handleExportLight, handleSystemBackupImport, handleSystemBackupInspect } = useSystemBackupActions({
    backupKeys: BACKUP_KEY_SET,
    fullBackupKeys: BACKUP_KEYS,
    lightBackupKeys: LIGHT_BACKUP_KEYS,
    sanitizeValue: sanitizeSystemBackupValue,
    onBackupCompleted: setLastBackupAt,
  });
  const {
    storageDiagnostics,
    storagePreflight,
    isContentStorageMigrationRunning,
    refreshStorageDiagnostics,
    downloadStorageDiagnosticReport,
    runStorageMigrationPreflight,
    runContentStorageMigration,
    requestStoragePersistence,
  } = useStorageHealthActions({ downloadLightBackup: handleExportLight });
  const { cleanOrphanedResources, cleanMigratedCopies } = useStorageCleanupActions({ refreshStorageDiagnostics });
  const {
    dockOpacity, setDockOpacity, widgetOpacity, setWidgetOpacity, iconBorderRadius, setIconBorderRadius,
    iconBgOpacity, setIconBgOpacity, iconBorderWidth, setIconBorderWidth, iconBorderOpacity, setIconBorderOpacity,
    hideAppNames, setHideAppNames, desktopAppTextColor, setDesktopAppTextColor, desktopIconMode, setDesktopIconMode,
    avatarBorderRadius, setAvatarBorderRadius, otherBubbleBg, setOtherBubbleBg, otherBubbleColor, setOtherBubbleColor,
    otherBubbleRadius, setOtherBubbleRadius, otherBubbleOpacity, setOtherBubbleOpacity, selfBubbleBg, setSelfBubbleBg,
    selfBubbleColor, setSelfBubbleColor, selfBubbleRadius, setSelfBubbleRadius, selfBubbleOpacity, setSelfBubbleOpacity,
    collapseConsecutiveAvatars, setCollapseConsecutiveAvatars, hideNicknames, setHideNicknames,
    dockBorderRadius, setDockBorderRadius, widgetBorderRadius, setWidgetBorderRadius, iconBorderEnabled, setIconBorderEnabled,
    bubbleTailEnabled, setBubbleTailEnabled, bubbleTailVertical, setBubbleTailVertical, bubblePosition, setBubblePosition,
    bubbleSpacing, setBubbleSpacing,
    bubbleBorderEnabled, setBubbleBorderEnabled, bubbleBorderWidth, setBubbleBorderWidth, otherBubbleBorderColor, setOtherBubbleBorderColor,
    selfBubbleBorderColor, setSelfBubbleBorderColor, avatarBorderEnabled, setAvatarBorderEnabled, avatarBorderWidth, setAvatarBorderWidth,
    avatarBorderColor, setAvatarBorderColor, beautySubTab, setBeautySubTab, isLiquidGlassChatStyle,
  } = appearanceDraftState;

  const getPreviewBubbleVisualStyle = (sender: "self" | "other"): React.CSSProperties => {
    const isSelf = sender === "self";
    const background = getSettingsPreviewBubbleBackground(
      isSelf ? selfBubbleBg : otherBubbleBg,
      isSelf ? selfBubbleOpacity : otherBubbleOpacity,
    );
    return getSettingsPreviewBubbleStyle({
      background,
      color: isSelf ? selfBubbleColor : otherBubbleColor,
      radius: isSelf ? selfBubbleRadius : otherBubbleRadius,
      borderEnabled: bubbleBorderEnabled,
      borderWidth: bubbleBorderWidth,
      borderColor: isSelf ? selfBubbleBorderColor : otherBubbleBorderColor,
      liquidGlass: isLiquidGlassChatStyle,
    });
  };

  const { isTesting, setIsTesting, testResult, setTestResult, newPresetName, setNewPresetName } = useSettingsTransientUiState();

  const {
    apiPresets, activeApiPresetId, presetName, setPresetName,
    apiEndpoint, setApiEndpoint, apiKey, setApiKey, selectedModel, setSelectedModel,
    apiTemperature, setApiTemperature, streamCompatible, setStreamCompatible, showPassword, setShowPassword,
    modelSuggestions, isFetchingModels,
    enableImageGeneration, setEnableImageGeneration, imageApiPresets, setImageApiPresets,
    activeImageApiPresetId, setActiveImageApiPresetId, imagePresetName, setImagePresetName,
    imageApiEndpoint, setImageApiEndpoint, imageApiKey, setImageApiKey, imageSelectedModel, setImageSelectedModel,
    showImagePassword, setShowImagePassword, imageModelSuggestions, setImageModelSuggestions,
    isFetchingImageModels, setIsFetchingImageModels, isTestingImageApi, setIsTestingImageApi,
    imageTestResult, setImageTestResult,
  } = apiPresetState;

  const {
    selectImagePreset, addImagePreset, deleteImagePreset, persistImagePresetDraft,
    updateCurrentImageModel, fetchImageModels, testImageApi, updateImageGenerationEnabled, saveImageApiConfig,
  } = useSettingsImageApiActions({
    settings,
    onSaveSettings,
    enableImageGeneration,
    setEnableImageGeneration,
    apiState: apiPresetState,
  });
  const {
    handleSelectPreset, handleAddPreset, handleDeletePreset, handleFetchModels, handleSaveApiConfig,
  } = useSettingsTextApiActions({ settings, onSaveSettings, apiState: apiPresetState, setTestResult });
  const { handleTestConnection } = useSettingsApiConnectionActions({
    settings, apiKey, apiEndpoint, selectedModel, setIsTesting, setTestResult,
  });

  // Voice synthesis configuration. MiniMax fields remain intact for legacy users.
  const {
    enableMiniMaxTts, setEnableMiniMaxTts, ttsProvider, setTtsProvider,
    minimaxApiKey, setMinimaxApiKey, minimaxGroupId, setMinimaxGroupId, minimaxModel, setMinimaxModel,
    minimaxSpeed, setMinimaxSpeed, minimaxPitch, setMinimaxPitch, minimaxVol, setMinimaxVol, minimaxProxyUrl,
    mosslandApiEndpoint, setMosslandApiEndpoint, mosslandApiKey, setMosslandApiKey, mosslandModel, setMosslandModel,
    showMosslandPassword, setShowMosslandPassword,
  } = voiceConfigState;
  const { handleSaveVoiceSettings } = useSettingsVoiceActions({
    onSaveSettings,
    voiceState: voiceConfigState,
  });

  const { handleSave } = useSettingsScopedSave({ onSaveSettings });

  const {
    handleExportChatTheme,
    handleImportChatTheme,
    downloadDesktopModuleBackup,
    importDesktopModuleBackup,
  } = useSettingsTransferActions({
    settings,
    chatGlobalCSS,
    chatIcons,
    setChatGlobalCSS,
    setChatIcons,
    handleSave,
  });

  const { handleGlobalFontFile, handleApplyGlobalFontUrl, handleResetGlobalFont } = useSettingsGlobalFontActions({
    globalFontUrlDraft,
    setGlobalFontUrlDraft,
    setFontOperationPending,
    setFontOperationMessage,
    handleSave,
  });

  const { updateChatIcon } = useSettingsChatIconActions({ chatIcons, setChatIcons, handleSave });

  const { copyGlobalChatCssTemplate } = useSettingsCssTemplateCopy({
    template: GLOBAL_CHAT_CSS_EXAMPLE_TEMPLATE,
    setCopied: setGlobalChatCssTemplateCopied,
  });

  const { handleClearApplicationData } = useSettingsClearDataActions({
    isClearingApplicationData,
    setIsClearingApplicationData,
  });

  const { handleSwitchIdentity } = useSettingsIdentityActions({
    settings,
    onSwitchIdentity,
    onSaveSettings,
    setName,
    setAvatar,
    setSignature,
    setBio,
  });

  useEffect(() => {
    setName(settings.name);
    setAvatar(settings.avatar);
    setSignature(settings.signature);
    setBio(settings.bio);
  }, [settings.activeIdentityId, settings.name, settings.avatar, settings.signature, settings.bio]);

  const { handleAvatarUpload, handleWallpaperUpload, handleIconUpload, handleRestoreAllIcons } = useSettingsAssetActions({
    settings,
    handleSave,
    setAvatar,
    setWallpaper,
  });

  const { handleSaveCurrentAsPreset } = useSettingsPresetActions({
    newPresetName,
    setNewPresetName,
    bubbleCss,
    globalCss,
    wallpaper,
    onSavePreset,
  });
  const { applyPreset } = useSettingsApplyPresetAction({
    onSaveSettings,
    appearanceState: appearanceDraftState,
    styleState: styleDraftState,
  });

  const activePresetsList = [...DEFAULT_PRESETS, ...presets];

  const appKeys = [
    { key: "diary", label: "日记" },
    { key: "chat", label: "聊天" },
    { key: "archives", label: "档案馆" },
    { key: "worldbook", label: "世界书" },
    { key: "music", label: "音乐" },
    { key: "schedule", label: "日程" },
    { key: "reading", label: "阅读" },
    { key: "cinema", label: "影视" },
    { key: "relationship-network", label: "关系网" },
    { key: "forum", label: "论坛" },
    { key: "notes", label: "备忘录" },
    { key: "memory", label: "记忆书" },
    { key: "offline", label: "线下" },
    { key: "store", label: "应用商店" },
    { key: "settings", label: "设置" }
  ];

  const dockAppOptions = [
    { key: "chat", label: "聊天" },
    { key: "archives", label: "档案馆" },
    { key: "worldbook", label: "世界书" },
    { key: "music", label: "音乐" },
    { key: "forum", label: "论坛" },
    { key: "store", label: "应用商店" },
    { key: "notes", label: "备忘录" },
    { key: "diary", label: "日记" },
    { key: "memory", label: "记忆书" },
    { key: "offline", label: "线下" },
    { key: "schedule", label: "日程" },
    { key: "reading", label: "阅读" },
    { key: "cinema", label: "影视" },
    { key: "relationship-network", label: "关系网" },
    { key: "settings", label: "设置" },
  ];

  const handleBack = () => {
    const target = getSettingsBackTarget(activeTab);
    if (target === "close") onClose();
    else setActiveTab(target);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--app-bg)] text-[var(--text-primary)] font-sans" data-settings-shell data-theme-page="settings">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
        <button
          onClick={handleBack}
          className="app-nav-icon-button w-8 h-8 flex items-center justify-center transition-colors z-10 shrink-0"
          id="settings_back_btn"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
          {getSettingsHeaderTitle(activeTab)}
        </h1>
        <div className="w-8 h-8" />
      </div>

      {/* Settings Navigation and Body Wrapper */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === null ? (
          /* Settings Main Entrance Menu (QQ Style) */
          <div className="flex-1 overflow-y-auto p-4 pb-[34px] space-y-3 bg-[#F7F7F9]">
            {/* QQ Style User Profile Card */}
            <div className="bg-white rounded-[16px] p-4 border border-[#F0F0F0] shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex flex-col gap-3 relative overflow-hidden">
              <div className="flex items-start justify-between relative z-10">
                <div className="flex gap-4">
                  {/* Avatar with modify overlay */}
                  <div className="relative group">
                    <img
                      src={avatar}
                      alt={name}
                      className="w-12 h-12 rounded-full border border-slate-200/80 object-cover shadow-sm bg-slate-50"
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

                  <div className="flex flex-col justify-center min-h-[48px]">
                    <span className="text-base font-medium text-slate-800 tracking-tight">{name}</span>
                  </div>
                </div>

                {/* Edit button */}
                <button
                  onClick={() => setActiveTab("profile")}
                  className="text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors px-3 py-1.5 rounded-[8px]"
                >
                  编辑资料
                </button>
              </div>

              {/* Signature */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 relative z-10 text-left">
                <div className="text-xs text-slate-700 flex items-start gap-1">
                  <span className="text-slate-400 font-medium shrink-0">签名:</span>
                  <span className="italic text-slate-600 font-medium line-clamp-1">{signature || "暂无签名"}</span>
                </div>
              </div>
            </div>

            <div className="px-1 text-[14px] leading-5 text-[#999]">更多设置</div>

            {/* Navigation Entry List */}
            <div className="bg-white rounded-[16px] border border-[#F0F0F0] shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden divide-y divide-[#F0F0F0]">
              {/* API Settings */}
              <button
                onClick={() => setActiveTab("api")}
                className="w-full h-[52px] flex items-center justify-between px-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-slate-800 shrink-0">
                    <Key className="w-5 h-5" />
                  </div>
                  <span className="text-base font-medium text-slate-800">API 设置</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#C7C7CC] shrink-0" />
              </button>

              {/* Voice and image settings */}
              <button
                onClick={() => setActiveTab("minimax")}
                className="w-full h-[52px] flex items-center justify-between px-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-slate-800 shrink-0">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <span className="text-base font-medium text-slate-800">语音图片</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#C7C7CC] shrink-0" />
              </button>

              {/* Aesthetics Settings */}
              <button
                onClick={() => setActiveTab("beauty")}
                className="w-full h-[52px] flex items-center justify-between px-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-slate-800 shrink-0">
                    <Palette className="w-5 h-5" />
                  </div>
                  <span className="text-base font-medium text-slate-800">美化样式</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#C7C7CC] shrink-0" />
              </button>

              {/* 4. System Config */}
              <button
                onClick={() => setActiveTab("system_config")}
                className="w-full h-[52px] flex items-center justify-between px-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-slate-800 shrink-0">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <span className="text-base font-medium text-slate-800">系统设置</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#C7C7CC] shrink-0" />
              </button>

              {/* System Backup */}
              <button
                onClick={() => setActiveTab("system")}
                className="w-full h-[52px] flex items-center justify-between px-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center text-slate-800 shrink-0">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <span className="text-base font-medium text-slate-800">系统备份</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#C7C7CC] shrink-0" />
              </button>
            </div>
            
            <div className="text-center pt-3">
              <span className="text-[10px] font-mono text-slate-400">交流群：1060472750</span>
            </div>
          </div>
        ) : (
          /* Independent sub-pages */
          <div className="flex-1 overflow-y-auto p-4 pb-[34px] bg-[var(--app-bg)]">
            <div className="max-w-md mx-auto space-y-3">
          
          {/* PROFILE SETTINGS TAB */}
          {activeTab === "appearance" && (
            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4">
              <div className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-800">应用显示外观</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">切换后会立即保存并应用到整个应用，不会随身份切换而改变。</p>
                <div className="mt-5 space-y-3">
                  {([
                    { mode: "light", title: "浅色", description: "始终使用浅色外观", icon: <Sun className="h-5 w-5" /> },
                    { mode: "dark", title: "深色", description: "始终使用深色外观", icon: <Moon className="h-5 w-5" /> },
                    { mode: "system", title: `跟随系统（当前${resolvedTheme === "dark" ? "深色" : "浅色"}）`, description: "根据设备的显示偏好自动切换", icon: <Monitor className="h-5 w-5" /> },
                  ] as Array<{ mode: ThemeMode; title: string; description: string; icon: React.ReactNode }>).map((option) => {
                    const selected = themeMode === option.mode;
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setThemeMode(option.mode)}
                        className={`flex w-full items-center gap-3 rounded-[18px] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${selected ? "border-[var(--accent)] bg-[var(--surface-selected)]" : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"}`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${selected ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--surface-muted)] text-[var(--text-secondary)]"}`}>{option.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[var(--text-primary)]">{option.title}</span>
                          <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{option.description}</span>
                        </span>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border-strong)]"}`} aria-hidden="true">
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">个人资料</h3>
              
              {/* Identity Switcher */}
              <div className="border-b border-slate-50 pb-4">
                <div className="grid grid-cols-3 gap-2">
                  {(settings.identities || []).filter((idty) => idty.kind !== "alias").map((idty, index) => {
                    const isSelected = idty.id === (settings.activeIdentityId || "identity-1");
                    return (
                      <button
                        key={idty.id}
                        type="button"
                        onClick={() => handleSwitchIdentity(idty.id)}
                        className={`flex items-center justify-center py-2 px-3 rounded-[16px] border text-center transition-all ${
                          isSelected
                            ? "border-[var(--segmented-border)] bg-[var(--segmented-active-bg)] text-[var(--segmented-active-text)] font-bold shadow-sm hover:bg-[var(--segmented-active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                            : "border-[var(--segmented-border)] bg-[var(--segmented-inactive-bg)] text-[var(--segmented-inactive-text)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-semibold"
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
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs"
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
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* API SETTINGS TAB */}
          {activeTab === "api" && (
            <div className="space-y-3 text-left">
              <div className="px-1 text-[14px] leading-5 text-[#999]">当前模型配置</div>
              <section className="settings-card bg-[var(--surface)] rounded-[16px] border border-[var(--border)] shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-4">
                <div className="flex items-center gap-2">
                  <select
                    aria-label="当前模型配置"
                    value={activeApiPresetId}
                    onChange={(e) => handleSelectPreset(e.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  >
                    {apiPresets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button onClick={handleAddPreset} type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-raised)]" title="添加新配置" aria-label="添加新配置">
                    <Plus className="h-5 w-5" />
                  </button>
                  <button onClick={() => handleDeletePreset(activeApiPresetId)} type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-rose-100 bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100" title="删除当前配置" aria-label="删除当前配置">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </section>

              <div className="px-1 pt-1 text-[14px] leading-5 text-[#999]">基本信息</div>
              <section className="settings-card overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_2px_12px_rgba(0,0,0,0.06)] divide-y divide-[var(--divider)]">
                <label className="block px-4 py-3">
                  <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">配置名称</span>
                  <input type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="请输入配置名称" className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
                </label>
                <label className="block px-4 py-3">
                  <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">API 地址（Endpoint）</span>
                  <input type="text" value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} placeholder="例如 https://api.deepseek.com/v1" className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-mono text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
                </label>
                <label className="block px-4 py-3">
                  <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">API 密钥（Key）</span>
                  <span className="relative block">
                    <input type={showPassword ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="请输入 API Key" className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 pr-10 text-sm font-mono text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label={showPassword ? "隐藏 API 密钥" : "显示 API 密钥"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </label>
                <div className="px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-[var(--text-secondary)]">模型选择（Model）</span>
                    <button onClick={handleFetchModels} disabled={isFetchingModels} type="button" className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60">
                      <RefreshCw className={`h-3.5 w-3.5 ${isFetchingModels ? "animate-spin" : ""}`} />
                      <span>{isFetchingModels ? "拉取中…" : "拉取模型列表"}</span>
                    </button>
                  </div>
                  {modelSuggestions.length > 0 ? (
                    <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]">
                      {modelSuggestions.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} placeholder="先拉取列表或手动输入模型名" className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
                  )}
                </div>
              </section>

              <div className="px-1 pt-1 text-[14px] leading-5 text-[#999]">高级设置</div>
              <section className="settings-card overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_2px_12px_rgba(0,0,0,0.06)] divide-y divide-[var(--divider)]">
                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor="api-temperature" className="text-[12px] font-medium text-[var(--text-secondary)]">API 温度（Temperature）</label>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{apiTemperature.toFixed(1)}</span>
                  </div>
                  <input id="api-temperature" type="range" min="0.0" max="2.0" step="0.1" value={apiTemperature} onChange={(e) => setApiTemperature(parseFloat(e.target.value))} className="w-full accent-[var(--text-primary)]" />
                </div>
                <div className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">流式兼容模式</h4>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">开启后兼容流式数据输出格式</p>
                  </div>
                  <button type="button" role="switch" aria-checked={streamCompatible} onClick={() => setStreamCompatible(!streamCompatible)} className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border p-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${streamCompatible ? "border-[var(--text-primary)] bg-[var(--text-primary)]" : "border-[var(--border)] bg-[var(--surface-muted)]"}`}>
                    <span className={`absolute left-0.5 h-5 w-5 rounded-full bg-[var(--surface)] shadow-sm transition-transform ${streamCompatible ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </div>
              </section>

              <div className="settings-wide-action-group pt-1">
                <button type="button" onClick={handleTestConnection} disabled={isTesting} className="settings-wide-action settings-wide-action-primary disabled:opacity-60">
                  {isTesting ? "测试中…" : "测试连接"}
                </button>
                <button type="button" onClick={handleSaveApiConfig} className="settings-wide-action settings-wide-action-secondary">
                  保存配置
                </button>
              </div>

              {testResult && <div className={`rounded-[12px] border p-3 text-xs font-medium ${testResult.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{testResult.msg}</div>}
            </div>
          )}

          {activeTab === "image_api" && (
            <div className="space-y-3 text-left">
              <div className="settings-section-header">图片设置</div>
              <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center justify-between"><div><span className="text-sm font-bold text-slate-800 block">图片生成总开关</span><span className="text-[10px] text-slate-400">关闭时任何角色都不能生成图片</span></div><button type="button" role="switch" aria-checked={enableImageGeneration} aria-label="图片生成总开关" onClick={() => updateImageGenerationEnabled(!enableImageGeneration)} className={`settings-compact-toggle relative flex shrink-0 items-center border-0 p-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${enableImageGeneration ? "bg-[var(--button-primary-bg)]" : "bg-[var(--surface-muted)]"}`}><span className={`absolute left-0.5 bg-[var(--surface)] shadow-sm transition-transform duration-200 ${enableImageGeneration ? "translate-x-[18px]" : "translate-x-0"}`} /></button></div>
              <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4"><div className="flex items-center justify-between"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">图片 API 配置</h3></div>
                <div className="flex gap-2"><select value={activeImageApiPresetId} onChange={(event) => selectImagePreset(event.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">{imageApiPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button type="button" onClick={addImagePreset} className="p-2 rounded-xl bg-slate-100"><Plus className="w-4 h-4" /></button><button type="button" onClick={deleteImagePreset} className="p-2 rounded-xl bg-rose-50 text-rose-600"><Trash2 className="w-4 h-4" /></button></div>
                <input value={imagePresetName} onChange={(event) => { setImagePresetName(event.target.value); persistImagePresetDraft({ name: event.target.value }); }} placeholder="预设名称" className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs" />
                <input value={imageApiEndpoint} onChange={(event) => { setImageApiEndpoint(event.target.value); persistImagePresetDraft({ apiEndpoint: event.target.value }); }} placeholder="由中转服务商提供的 API 地址" className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono" />
                <div className="relative"><input type={showImagePassword ? "text" : "password"} value={imageApiKey} onChange={(event) => { setImageApiKey(event.target.value); persistImagePresetDraft({ apiKey: event.target.value }); }} placeholder="API Key" className="w-full pl-3 pr-10 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono" /><button type="button" onClick={() => setShowImagePassword(!showImagePassword)} className="absolute right-3 top-2 text-slate-400">{showImagePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
                <div><div className="mb-1 flex justify-between"><span className="text-[10px] font-bold text-slate-500">图片模型</span><button type="button" disabled={isFetchingImageModels} onClick={fetchImageModels} className="text-[10px] font-bold text-blue-600">{isFetchingImageModels ? "拉取中…" : "拉取模型列表"}</button></div>{imageModelSuggestions.length ? <select value={imageSelectedModel} onChange={(event) => updateCurrentImageModel(event.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">{imageModelSuggestions.map((model) => <option key={model}>{model}</option>)}</select> : <input value={imageSelectedModel} onChange={(event) => updateCurrentImageModel(event.target.value)} placeholder="手动输入图片模型" className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs" />}</div>
                <p className="text-[10px] leading-relaxed text-slate-400">测试连接只检查配置与模型列表，不会生成图片。</p>
                {imageTestResult && <p className={`text-[10px] ${imageTestResult.success ? "text-emerald-600" : "text-rose-600"}`}>{imageTestResult.message}</p>}
                <div className="settings-wide-action-group pt-1"><button type="button" onClick={testImageApi} disabled={isTestingImageApi} className="settings-wide-action settings-wide-action-primary disabled:opacity-60">{isTestingImageApi ? "测试中…" : "测试连接"}</button><button type="button" onClick={saveImageApiConfig} className="settings-wide-action settings-wide-action-secondary">保存配置</button></div>
              </div>
            </div>
          )}

          {/* BEAUTY SETTINGS TAB */}
          {activeTab === "beauty" && (
            <div className="space-y-4 text-left" data-settings-beauty={beautySubTab}>
              {/* Classification Navigation Bar */}
              <div className="flex items-center p-1 bg-[var(--surface-muted)] border border-[var(--segmented-border)] rounded-[16px] gap-1.5 select-none mb-4">
                <button
                  type="button"
                  onClick={() => setBeautySubTab("desktop")}
                  className={`beauty-segment-control flex-1 font-bold rounded-[16px] transition-all ${
                    beautySubTab === "desktop"
                      ? "bg-[var(--segmented-active-bg)] text-[var(--segmented-active-text)] shadow-sm"
                      : "bg-[var(--segmented-inactive-bg)] text-[var(--segmented-inactive-text)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  桌面布局
                </button>
                <button
                  type="button"
                  onClick={() => setBeautySubTab("chat")}
                  className={`beauty-segment-control flex-1 font-bold rounded-[16px] transition-all ${
                    beautySubTab === "chat"
                      ? "bg-[var(--segmented-active-bg)] text-[var(--segmented-active-text)] shadow-sm"
                      : "bg-[var(--segmented-inactive-bg)] text-[var(--segmented-inactive-text)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  聊天页面
                </button>
                <button
                  type="button"
                  onClick={() => setBeautySubTab("preset")}
                  className={`beauty-segment-control flex-1 font-bold rounded-[16px] transition-all ${
                    beautySubTab === "preset"
                      ? "bg-[var(--segmented-active-bg)] text-[var(--segmented-active-text)] shadow-sm"
                      : "bg-[var(--segmented-inactive-bg)] text-[var(--segmented-inactive-text)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  主题预设
                </button>
              </div>

              {/* 1. 桌面模块 */}
              {beautySubTab === "desktop" && (
                <div className="space-y-4 animate-fade-in">
                  {/* 手机壁纸设置 */}
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-1 border-b border-slate-50">
                      <span className="text-xs font-bold text-slate-700">手机壁纸设置</span>
                      {hasUserDesktopWallpaper({ wallpaper, wallpaperSource: settings.wallpaperSource }) && (
                        <button
                          type="button"
                          onClick={() => {
                            setWallpaper("");
                            handleSave({ wallpaper: "", wallpaperSource: undefined });
                          }}
                          className="text-[10px] text-red-500 hover:text-red-600 font-semibold"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                    
                    {wallpaper && !wallpaper.startsWith("linear-gradient") ? (
                      <div className="relative w-full h-32 rounded-[16px] overflow-hidden border border-slate-200 group">
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
                              setWallpaper("");
                              handleSave({ wallpaper: "", wallpaperSource: undefined });
                            }}
                            className="bg-red-500/90 hover:bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100/50 p-6 rounded-[16px] text-xs transition-colors group w-full">
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
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-2">
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
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-2">
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
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-2">
                    <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-50">全局应用图标参数组</div>

                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-xs font-bold text-slate-700 shrink-0">桌面应用文字颜色</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={desktopAppTextColor}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDesktopAppTextColor(value);
                            if (/^#[0-9a-f]{6}$/i.test(value)) handleSave({ desktopAppTextColor: value });
                          }}
                          className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-mono uppercase"
                          aria-label="桌面应用文字颜色"
                        />
                        <input
                          type="color"
                          value={/^#[0-9a-f]{6}$/i.test(desktopAppTextColor) ? desktopAppTextColor : "#000000"}
                          onChange={(event) => {
                            const value = event.target.value.toUpperCase();
                            setDesktopAppTextColor(value);
                            handleSave({ desktopAppTextColor: value });
                          }}
                          className="h-8 w-8 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                          aria-label="选择桌面应用文字颜色"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-2 border-t border-slate-50">
                      <div><span className="text-xs font-bold text-slate-700 block">图标模式</span><span className="text-[10px] text-slate-400">浅色图标默认更适合深色壁纸</span></div>
                      <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="图标模式">
                        <button type="button" onClick={() => { setDesktopIconMode("light"); handleSave({ desktopIconMode: "light" }); }} className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold transition-colors ${desktopIconMode === "light" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>浅色</button>
                        <button type="button" onClick={() => { setDesktopIconMode("dark"); handleSave({ desktopIconMode: "dark" }); }} className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold transition-colors ${desktopIconMode === "dark" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>深色</button>
                      </div>
                    </div>

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
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center justify-between">
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
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
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
                        const isTransparentIcon = isTransparencyPreservedImage(customImg);
                        return (
                          <div
                            key={item.key}
                            className="flex flex-col items-center bg-slate-50/60 p-2 rounded-[24px] border border-slate-100 hover:bg-slate-50 relative group cursor-pointer"
                          >
                            <label className="cursor-pointer flex flex-col items-center w-full">
                              <div 
                                className={`w-10 h-10 flex items-center justify-center overflow-hidden shrink-0 transition-colors ${
                                  isTransparentIcon
                                    ? "bg-transparent border-0 shadow-none"
                                    : "bg-white border border-slate-200 shadow-sm group-hover:border-neutral-950"
                                }`}
                                style={{ borderRadius: isTransparentIcon ? 0 : "var(--app-icon-radius, 35%)" }}
                              >
                                {customImg ? (
                                  <img
                                    src={customImg}
                                    alt={item.label}
                                    className={`w-full h-full ${isTransparentIcon ? "object-contain" : "object-cover"}`}
                                  />
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

                  {/* Dock 栏应用槽位 */}
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                    <div className="pb-1 border-b border-slate-50">
                      <div>
                        <span className="text-xs font-bold text-slate-700">Dock 栏应用</span>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">四个常驻位置可以替换为任意应用，例如把音乐替换为线下；应用图标会自动跟随所选应用。</p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {Array.from({ length: 4 }, (_, index) => {
                        const dockApps = settings.dockApps?.length === 4
                          ? settings.dockApps
                          : ["chat", "music", "archives", "settings"];
                        const selectedKey = dockApps[index] || "chat";
                        return (
                          <div
                            key={index}
                            className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                          >
                            <span className="w-12 shrink-0 text-[10px] font-bold text-slate-500">位置 {index + 1}</span>
                            <select
                              value={selectedKey}
                              onChange={(event) => {
                                const next = [...(settings.dockApps?.length === 4 ? settings.dockApps : ["chat", "music", "archives", "settings"] )];
                                next[index] = event.target.value;
                                handleSave({ dockApps: next });
                              }}
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-neutral-950"
                              aria-label={`Dock 位置 ${index + 1}`}
                            >
                              {dockAppOptions.map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                              ))}
                            </select>
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
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-50">
                      <span className="text-xs font-bold text-slate-700">实时预览效果</span>
                      {isLiquidGlassChatStyle && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">液态玻璃</span>
                      )}
                    </div>
                    
                     <div
                       className="bg-slate-50/60 p-4 rounded-[24px] border border-slate-100 flex flex-col relative overflow-hidden"
                       style={{
                         rowGap: `${Math.max(8, Math.min(56, bubbleSpacing))}px`,
                         ...(isLiquidGlassChatStyle ? {
                           background: "linear-gradient(135deg, #dbeafe 0%, #fdf2f8 48%, #ecfeff 100%)",
                         } : {}),
                       }}
                     >
                      {/* Message 1: Other Speaker (Always has avatar) */}
                      {bubblePosition === "above" ? (
                        /* Stacked layout for above */
                        <div className="w-full flex flex-col items-start">
                          <div className="flex items-center gap-2.5 mb-1 select-none flex-row">
                            <img
                              src="https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg"
                              alt=""
                              className="w-8 h-8 object-cover bg-slate-100 shrink-0"
                              style={{ 
                                borderRadius: `${avatarBorderRadius}px`,
                                border: avatarBorderEnabled ? `${avatarBorderWidth}px solid ${avatarBorderColor}` : 'none'
                              }}
                            />
                            {!hideNicknames && (<div className="flex flex-col items-start text-[10px] text-slate-500/80">
                              <span className="font-bold text-slate-700/85">聊天对象 (AI)</span>
                            </div>)}
                          </div>
                          <div className="max-w-[75%] relative">
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200"
                              style={getPreviewBubbleVisualStyle("other")}
                            >
                              这里是对方气泡预览，颜色和圆角都是同步修改的。
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-[13px] h-[13px] z-0"
                                  style={{
                                    backgroundColor: getSettingsPreviewBubbleBackground(otherBubbleBg, otherBubbleOpacity),
                                    borderRadius: "0 0 0 4px",
                                    transform: "rotate(45deg)",
                                    left: "-5px",
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
                            className="w-8 h-8 object-cover bg-slate-100 shrink-0"
                            style={{ 
                              borderRadius: `${avatarBorderRadius}px`,
                              border: avatarBorderEnabled ? `${avatarBorderWidth}px solid ${avatarBorderColor}` : 'none'
                            }}
                          />
                          <div className="flex flex-col items-start max-w-[75%]">
                            {!hideNicknames && (<span className="text-[9px] font-bold text-slate-400 mb-0.5">聊天对象 (AI)</span>)}
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200 relative"
                              style={getPreviewBubbleVisualStyle("other")}
                            >
                              这里是对方气泡预览，颜色和圆角都是同步修改的。
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-[13px] h-[13px] z-0"
                                  style={{
                                    backgroundColor: getSettingsPreviewBubbleBackground(otherBubbleBg, otherBubbleOpacity),
                                    borderRadius: "0 0 0 4px",
                                    transform: "rotate(45deg)",
                                    left: "-5px",
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
                        <div className="w-full flex flex-col items-start">
                          {!collapseConsecutiveAvatars && (
                            <div className="flex items-center gap-2.5 mb-1 select-none flex-row">
                              <img
                                src="https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg"
                                alt=""
                                className="w-8 h-8 object-cover bg-slate-100 shrink-0"
                                style={{ 
                                  borderRadius: `${avatarBorderRadius}px`,
                                  border: avatarBorderEnabled ? `${avatarBorderWidth}px solid ${avatarBorderColor}` : 'none'
                                }}
                              />
                              {!hideNicknames && (<div className="flex flex-col items-start text-[10px] text-slate-500/80">
                                <span className="font-bold text-slate-700/85">聊天对象 (AI)</span>
                              </div>)}
                            </div>
                          )}
                          <div className="max-w-[75%] relative">
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200"
                              style={getPreviewBubbleVisualStyle("other")}
                            >
                              启用“合并连续发言头像”后，连续发言的头像会被折叠哦~
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-[13px] h-[13px] z-0"
                                  style={{
                                    backgroundColor: getSettingsPreviewBubbleBackground(otherBubbleBg, otherBubbleOpacity),
                                    borderRadius: "0 0 0 4px",
                                    transform: "rotate(45deg)",
                                    left: "-5px",
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
                          {!collapseConsecutiveAvatars ? (
                            <img
                              src="https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg"
                              alt=""
                              className="w-8 h-8 object-cover bg-slate-100 shrink-0"
                              style={{ 
                                borderRadius: `${avatarBorderRadius}px`,
                                border: avatarBorderEnabled ? `${avatarBorderWidth}px solid ${avatarBorderColor}` : 'none'
                              }}
                            />
                          ) : (
                            /* Spacer to align bubble perfectly */
                            <div className="w-8 h-8 shrink-0" />
                          )}
                          <div className="flex flex-col items-start max-w-[75%]">
                            {!collapseConsecutiveAvatars && !hideNicknames && (
                              <span className="text-[9px] font-bold text-slate-400 mb-0.5">聊天对象 (AI)</span>
                            )}
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200 relative"
                              style={getPreviewBubbleVisualStyle("other")}
                            >
                              启用“合并连续发言头像”后，连续发言的头像会被折叠哦~
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-[13px] h-[13px] z-0"
                                  style={{
                                    backgroundColor: getSettingsPreviewBubbleBackground(otherBubbleBg, otherBubbleOpacity),
                                    borderRadius: "0 0 0 4px",
                                    transform: "rotate(45deg)",
                                    left: "-5px",
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
                              className="w-8 h-8 object-cover bg-slate-100 shrink-0"
                              style={{ 
                                borderRadius: `${avatarBorderRadius}px`,
                                border: avatarBorderEnabled ? `${avatarBorderWidth}px solid ${avatarBorderColor}` : 'none'
                              }}
                            />
                            {!hideNicknames && (<div className="flex flex-col items-end text-[10px] text-slate-500/80">
                              <span className="font-bold text-slate-700/85">{settings.name || "我"}</span>
                            </div>)}
                          </div>
                          <div className="max-w-[75%] relative">
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200"
                              style={getPreviewBubbleVisualStyle("self")}
                            >
                              我的专属气泡！效果完全同步 ✨
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-[13px] h-[13px] z-0"
                                  style={{
                                    backgroundColor: getSettingsPreviewBubbleBackground(selfBubbleBg, selfBubbleOpacity),
                                    borderRadius: "0 0 4px 0",
                                    transform: "rotate(45deg)",
                                    right: "-5px",
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
                            className="w-8 h-8 object-cover bg-slate-100 shrink-0"
                            style={{ 
                              borderRadius: `${avatarBorderRadius}px`,
                              border: avatarBorderEnabled ? `${avatarBorderWidth}px solid ${avatarBorderColor}` : 'none'
                            }}
                          />
                          <div className="flex flex-col items-end max-w-[75%]">
                            {!hideNicknames && (<span className="text-[9px] font-bold text-slate-400 mb-0.5">{settings.name || "我"}</span>)}
                            <div
                              className="px-3 py-1.5 text-xs font-medium shadow-sm transition-all text-left duration-200 relative"
                              style={getPreviewBubbleVisualStyle("self")}
                            >
                              我的专属气泡！效果完全同步 ✨
                              {bubbleTailEnabled && (
                                <div
                                  className="absolute w-[13px] h-[13px] z-0"
                                  style={{
                                    backgroundColor: getSettingsPreviewBubbleBackground(selfBubbleBg, selfBubbleOpacity),
                                    borderRadius: "0 0 4px 0",
                                    transform: "rotate(45deg)",
                                    right: "-5px",
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
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-2">
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

                    <div className="flex items-center justify-between py-2.5 border-t border-slate-50">
                      <span className="text-xs font-bold text-slate-700">隐藏昵称</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !hideNicknames;
                          setHideNicknames(nextVal);
                          handleSave({ hideNicknames: nextVal });
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          hideNicknames ? "bg-neutral-950" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            hideNicknames ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* 头像边框 */}
                    <div className="flex items-center justify-between py-2.5 border-t border-slate-50">
                      <span className="text-xs font-bold text-slate-700">启用头像边框</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !avatarBorderEnabled;
                          setAvatarBorderEnabled(nextVal);
                          handleSave({ avatarBorderEnabled: nextVal });
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          avatarBorderEnabled ? "bg-neutral-950" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            avatarBorderEnabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {avatarBorderEnabled && (
                      <div className="space-y-3 pt-2.5 border-t border-slate-50">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs font-bold text-slate-700 shrink-0">边框粗细</span>
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="range"
                              min="1"
                              max="8"
                              value={avatarBorderWidth}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setAvatarBorderWidth(val);
                                  handleSave({ avatarBorderWidth: val });
                              }}
                              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                            />
                            <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{avatarBorderWidth}px</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">边框颜色</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={avatarBorderColor}
                              onChange={(e) => {
                                setAvatarBorderColor(e.target.value);
                                handleSave({ avatarBorderColor: e.target.value });
                              }}
                              className="w-8 h-8 rounded-[8px] cursor-pointer border border-slate-200 p-0"
                            />
                            <span className="text-[10px] text-slate-400 font-mono uppercase">{avatarBorderColor}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 聊天气泡高级配置 */}
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
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
                            handleSave(isLiquidGlassChatStyle
                              ? { liquidGlassSelfBubbleRadius: val }
                              : { selfBubbleRadius: val });
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
                            handleSave(isLiquidGlassChatStyle
                              ? { liquidGlassOtherBubbleRadius: val }
                              : { otherBubbleRadius: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{otherBubbleRadius}px</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-1">
                      <span className="text-xs font-bold text-slate-700 shrink-0">气泡上下间距</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="8"
                          max="56"
                          step="1"
                          value={bubbleSpacing}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setBubbleSpacing(val);
                            handleSave({ bubbleSpacing: val });
                          }}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                          aria-label="气泡上下间距"
                        />
                        <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{bubbleSpacing}px</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2.5 border-t border-slate-50">
                      <span className="text-xs font-bold text-slate-700">启用气泡尖角</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !bubbleTailEnabled;
                          setBubbleTailEnabled(nextVal);
                          handleSave(isLiquidGlassChatStyle
                            ? { liquidGlassBubbleTailEnabled: nextVal }
                            : { bubbleTailEnabled: nextVal });
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
                          <div className="flex bg-slate-100 p-1 rounded-[16px] gap-1">
                            {(["top", "center", "bottom"] as const).map((pos) => (
                              <button
                                key={pos}
                                type="button"
                                onClick={() => {
                                  setBubbleTailVertical(pos);
                                  handleSave(isLiquidGlassChatStyle
                                    ? { liquidGlassBubbleTailVertical: pos }
                                    : { bubbleTailVertical: pos });
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
                       <div className="flex bg-slate-100 p-1 rounded-[16px] gap-1">
                         {(["side", "above"] as const).map((pos) => (
                           <button
                             key={pos}
                             type="button"
                             onClick={() => {
                               setBubblePosition(pos);
                               handleSave(isLiquidGlassChatStyle
                                 ? { liquidGlassBubblePosition: pos }
                                 : { bubblePosition: pos });
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

                     {/* 气泡边框设置 */}
                     <div className="flex items-center justify-between py-2.5 border-t border-slate-50">
                       <span className="text-xs font-bold text-slate-700">启用气泡边框</span>
                       <button
                         type="button"
                         onClick={() => {
                           const nextVal = !bubbleBorderEnabled;
                           setBubbleBorderEnabled(nextVal);
                           handleSave(isLiquidGlassChatStyle
                             ? { liquidGlassBubbleBorderEnabled: nextVal }
                             : { bubbleBorderEnabled: nextVal });
                         }}
                         className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                           bubbleBorderEnabled ? "bg-neutral-950" : "bg-slate-200"
                         }`}
                       >
                         <span
                           className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                             bubbleBorderEnabled ? "translate-x-4" : "translate-x-0"
                           }`}
                         />
                       </button>
                     </div>

                     {bubbleBorderEnabled && (
                       <div className="space-y-3 pt-2.5 border-t border-slate-50">
                         <div className="flex items-center justify-between gap-4">
                           <span className="text-xs font-bold text-slate-700 shrink-0">边框粗细</span>
                           <div className="flex-1 flex items-center gap-2">
                             <input
                               type="range"
                               min="1"
                               max="8"
                               value={bubbleBorderWidth}
                               onChange={(e) => {
                                 const val = parseInt(e.target.value, 10);
                                 setBubbleBorderWidth(val);
                                 handleSave(isLiquidGlassChatStyle
                                   ? { liquidGlassBubbleBorderWidth: val }
                                   : { bubbleBorderWidth: val });
                               }}
                               className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                             />
                             <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{bubbleBorderWidth}px</span>
                           </div>
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                           <div className="flex items-center justify-between p-2 bg-slate-50 rounded-[16px] border border-slate-100">
                             <span className="text-[10px] font-bold text-slate-500">对方气泡边框</span>
                             <div className="flex items-center gap-1.5">
                               <input
                                 type="color"
                                 value={otherBubbleBorderColor}
                                 onChange={(e) => {
                                   setOtherBubbleBorderColor(e.target.value);
                                   handleSave(isLiquidGlassChatStyle
                                     ? { liquidGlassOtherBubbleBorderColor: e.target.value }
                                     : { otherBubbleBorderColor: e.target.value });
                                 }}
                                 className="w-6 h-6 rounded-[8px] cursor-pointer border border-slate-200 p-0"
                               />
                             </div>
                           </div>

                           <div className="flex items-center justify-between p-2 bg-slate-50 rounded-[16px] border border-slate-100">
                             <span className="text-[10px] font-bold text-slate-500">我方气泡边框</span>
                             <div className="flex items-center gap-1.5">
                               <input
                                 type="color"
                                 value={selfBubbleBorderColor}
                                 onChange={(e) => {
                                   setSelfBubbleBorderColor(e.target.value);
                                   handleSave(isLiquidGlassChatStyle
                                     ? { liquidGlassSelfBubbleBorderColor: e.target.value }
                                     : { selfBubbleBorderColor: e.target.value });
                                 }}
                                 className="w-6 h-6 rounded-[8px] cursor-pointer border border-slate-200 p-0"
                               />
                             </div>
                           </div>
                         </div>
                       </div>
                     )}
                  </div>

                  {/* 极简视觉调色盘 */}
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                    <div className="pb-1 border-b border-slate-50">
                      <div className="text-xs font-bold text-slate-700">
                        {isLiquidGlassChatStyle ? "液态玻璃气泡设置" : "极简视觉调色盘"}
                      </div>
                      {isLiquidGlassChatStyle && (
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">底色、文字和透明度会同时用于聊天页与上方实时预览。</p>
                      )}
                    </div>

                    {/* 对方气泡 */}
                    <div className="space-y-3 p-3 bg-slate-50/50 rounded-[24px] border border-slate-100">
                      <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">对方（角色）气泡</div>
                      
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">底色:</span>
                          <input
                            type="color"
                            value={otherBubbleBg}
                            onChange={(e) => {
                              setOtherBubbleBg(e.target.value);
                              handleSave(isLiquidGlassChatStyle
                                ? { liquidGlassOtherBubbleBg: e.target.value }
                                : { otherBubbleBg: e.target.value });
                            }}
                            className="w-6 h-6 rounded-[8px] cursor-pointer border border-slate-200 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">文字:</span>
                          <input
                            type="color"
                            value={otherBubbleColor}
                            onChange={(e) => {
                              setOtherBubbleColor(e.target.value);
                              handleSave(isLiquidGlassChatStyle
                                ? { liquidGlassOtherBubbleColor: e.target.value }
                                : { otherBubbleColor: e.target.value });
                            }}
                            className="w-6 h-6 rounded-[8px] cursor-pointer border border-slate-200 p-0"
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
                              handleSave(isLiquidGlassChatStyle
                                ? { liquidGlassOtherBubbleOpacity: val }
                                : { otherBubbleOpacity: val });
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
                              handleSave(isLiquidGlassChatStyle
                                ? { liquidGlassSelfBubbleBg: e.target.value }
                                : { selfBubbleBg: e.target.value });
                            }}
                            className="w-6 h-6 rounded-[8px] cursor-pointer border border-slate-200 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">文字:</span>
                          <input
                            type="color"
                            value={selfBubbleColor}
                            onChange={(e) => {
                              setSelfBubbleColor(e.target.value);
                              handleSave(isLiquidGlassChatStyle
                                ? { liquidGlassSelfBubbleColor: e.target.value }
                                : { selfBubbleColor: e.target.value });
                            }}
                            className="w-6 h-6 rounded-[8px] cursor-pointer border border-slate-200 p-0"
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
                              handleSave(isLiquidGlassChatStyle
                                ? { liquidGlassSelfBubbleOpacity: val }
                                : { selfBubbleOpacity: val });
                            }}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                          />
                          <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0 w-8 text-right">{selfBubbleOpacity}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-700">全局聊天样式 CSS</span>
                      <button type="button" onClick={copyGlobalChatCssTemplate} className="shrink-0 rounded-[8px] bg-slate-100 px-2 py-1 text-[9px] font-medium text-slate-500 transition-colors hover:bg-slate-200">
                        {globalChatCssTemplateCopied ? "已复制" : "复制模板"}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">用于修改所有聊天页面视觉效果，包括背景、导航、气泡、消息、输入区域等。</p>
                    <textarea rows={5} value={chatGlobalCSS} onChange={(e) => { setChatGlobalCSS(e.target.value); handleSave({ chatGlobalCSS: e.target.value }); }} placeholder={GLOBAL_CHAT_CSS_EXAMPLE_TEMPLATE} className="w-full px-4 py-3 rounded-[8px] bg-slate-900 text-emerald-400 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-[10px] font-mono resize-none leading-relaxed" />
                  </div>

                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-3">
                    <div><span className="text-xs font-bold text-slate-700">聊天功能图标</span><p className="text-[10px] text-slate-400 leading-relaxed mt-1">填写图片 URL 后替换默认图标；角色覆盖优先于这里的全局配置。底部工具栏可在 CSS 中分别调整外框大小（--chat-attachment-icon-size）和内部图片大小（--chat-attachment-glyph-size）。</p></div>
                    <div className="grid grid-cols-2 gap-2">
                      {CHAT_ICON_FIELDS.map(({ key, label }) => <label key={key} className="space-y-1"><span className="text-[10px] font-semibold text-slate-500">{label}图标</span><input value={chatIcons[key] || ""} onChange={(e) => updateChatIcon(key, e.target.value)} placeholder="图片 URL（留空用默认）" className="w-full px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[10px] focus:outline-none focus:ring-1 focus:ring-neutral-950" /></label>)}
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-3">
                    <div><span className="text-xs font-bold text-slate-700">导入 / 导出聊天主题</span><p className="text-[10px] text-slate-400 leading-relaxed mt-1">主题文件仅包含全局聊天 CSS 与全局聊天图标配置。</p></div>
                    <div className="flex gap-2"><button type="button" onClick={handleExportChatTheme} className="flex-1 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-bold">导出 JSON</button><label className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold text-center cursor-pointer">导入 JSON<input type="file" accept="application/json,.json" onChange={handleImportChatTheme} className="hidden" /></label></div>
                  </div>
                </div>
              )}

              {/* 3. 主题预设模块 */}
              {beautySubTab === "preset" && (
                <div className="space-y-4 animate-fade-in">
                  <div className="bg-[var(--surface)] p-5 rounded-[24px] border border-[var(--border)] shadow-sm space-y-3">
                    <div>
                      <span className="text-xs font-bold text-[var(--text-primary)]">显示主题</span>
                      <p className="mt-1 text-[10px] text-[var(--text-secondary)]">主题为全局设置，不会覆盖壁纸、Dock、图标或聊天气泡的自定义颜色。</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["light", "dark", "system"] as ThemeMode[]).map((mode) => {
                        const selected = themeMode === mode;
                        const label = mode === "light" ? "浅色" : mode === "dark" ? "深色" : "跟随系统";
                        const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
                        return <button key={mode} type="button" aria-pressed={selected} onClick={() => setThemeMode(mode)} className={`min-w-0 rounded-[16px] border px-2 py-3 text-center transition-colors ${selected ? "border-[var(--accent)] bg-[var(--surface-selected)] text-[var(--text-primary)]" : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"}`}>
                          <Icon className="mx-auto h-4 w-4" />
                          <span className="mt-1 block truncate text-[10px] font-bold">{label}</span>
                          {mode === "system" && <span className="mt-0.5 block truncate text-[9px]">当前{resolvedTheme === "dark" ? "深色" : "浅色"}</span>}
                        </button>;
                      })}
                    </div>
                  </div>
                  {/* 保存预设 */}
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                    <span className="text-xs font-bold text-slate-700">保存当前样式为新预设</span>
                    <form onSubmit={handleSaveCurrentAsPreset} className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="请输入预设名称..."
                        className="flex-1 bg-slate-50 rounded-[8px] px-4 py-2 text-xs text-slate-800 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-[24px] text-xs transition-colors flex items-center gap-1 shrink-0 shadow-sm"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>保存</span>
                      </button>
                    </form>
                  </div>

                  {/* 切换视觉预设 */}
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-3">
                    <span className="text-xs font-bold text-slate-700 block">预设模板库</span>
                    <div className="space-y-2">
                      {activePresetsList.map((preset) => {
                        const isActive = settings.activePreset === preset.name || 
                                         (preset.id === "p-classic" && !settings.activePreset);
                        return (
                          <div
                            key={preset.id}
                            className={`flex items-center justify-between p-2.5 rounded-[24px] border transition-all ${
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
                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-3">
                    <span className="text-xs font-bold text-slate-700">全局高阶 CSS 样式注入</span>
                    <textarea
                      rows={3}
                      value={globalCss}
                      onChange={(e) => {
                        setGlobalCss(e.target.value);
                        handleSave({ globalCss: e.target.value });
                      }}
                      placeholder={`/* 全局样式覆盖 */\n.phone-screen-container {\n  filter: contrast(1.05);\n}`}
                      className="w-full px-4 py-3 rounded-[8px] bg-slate-900 text-emerald-400 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-[10px] font-mono resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SYSTEM CONFIG TAB */}
          {activeTab === "system_config" && (
            <div className="space-y-4 text-left" data-system-settings>
              <div className="settings-section-header">系统偏好</div>
              <div className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm space-y-5" data-global-typography-settings>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-slate-100 text-slate-700">
                    <TypeIcon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold tracking-wide text-slate-800">全局字体</h4>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">上传字体文件或粘贴字体直链，保存后会立即应用到整个应用。</p>
                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-600">
                      当前：{settings.globalFontSource === "upload" || settings.globalFontSource === "url"
                        ? settings.globalFontName || "自定义字体"
                        : "系统默认字体"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-100 ${fontOperationPending ? "pointer-events-none opacity-50" : ""}`}>
                    <Upload className="h-3.5 w-3.5" />
                    上传字体文件
                    <input
                      type="file"
                      accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/font-woff,application/font-sfnt"
                      className="hidden"
                      disabled={fontOperationPending}
                      onChange={handleGlobalFontFile}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={fontOperationPending || (!settings.globalFontAssetId && !settings.globalFontUrl)}
                    onClick={() => void handleResetGlobalFont()}
                    className="min-h-10 rounded-[14px] border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    恢复默认字体
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Link className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="url"
                        value={globalFontUrlDraft}
                        onChange={(event) => setGlobalFontUrlDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") void handleApplyGlobalFontUrl(); }}
                        placeholder="粘贴 TTF / OTF / WOFF / WOFF2 字体直链"
                        className="h-10 w-full rounded-[14px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-[10px] text-slate-700 outline-none transition-colors focus:border-slate-400"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={fontOperationPending || !globalFontUrlDraft.trim()}
                      onClick={() => void handleApplyGlobalFontUrl()}
                      className="h-10 shrink-0 rounded-[14px] bg-neutral-950 px-4 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      应用
                    </button>
                  </div>
                  <p className="text-[9px] leading-relaxed text-slate-400">支持 TTF、OTF、WOFF、WOFF2，上传文件最大 25MB。网络字体服务器需要允许跨域访问。</p>
                  {fontOperationMessage && <p className="rounded-[10px] bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-600" role="status">{fontOperationMessage}</p>}
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold tracking-wide text-slate-800">全局字体大小</h4>
                      <p className="mt-1 text-[10px] text-slate-400">页面会按同一比例重新排版和适应。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setGlobalFontSize(DEFAULT_GLOBAL_FONT_SIZE);
                        handleSave({ globalFontSize: DEFAULT_GLOBAL_FONT_SIZE });
                      }}
                      className="shrink-0 rounded-[10px] bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600"
                    >
                      默认
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-400">小</span>
                    <input
                      type="range"
                      min={MIN_GLOBAL_FONT_SIZE}
                      max={MAX_GLOBAL_FONT_SIZE}
                      step={1}
                      value={globalFontSize}
                      aria-label="全局字体大小"
                      onChange={(event) => {
                        const next = sanitizeGlobalFontSize(event.target.value);
                        setGlobalFontSize(next);
                        handleSave({ globalFontSize: next });
                      }}
                      className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-neutral-950"
                    />
                    <span className="text-[10px] font-bold text-slate-400">大</span>
                    <span className="w-9 shrink-0 text-right font-mono text-[10px] font-bold text-slate-700">{globalFontSize}px</span>
                  </div>
                  <div className="rounded-[14px] border border-slate-100 bg-slate-50 px-4 py-3 text-center text-sm text-slate-700" style={{ fontFamily: "var(--app-font-family)" }}>
                    米饭机 Aa 123 · 字体预览
                  </div>
                </div>
              </div>
              {/* Floating Home Button Settings */}
              <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 tracking-wide">悬浮按钮</h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      点击可一键回到桌面主页
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showHomeButton}
                    onClick={() => {
                      const nextVal = !showHomeButton;
                      setShowHomeButton(nextVal);
                      handleSave({ showHomeButton: nextVal });
                    }}
                    className={`settings-compact-toggle relative flex shrink-0 items-center border-0 p-0 transition-colors ${
                      showHomeButton ? "bg-neutral-950" : "bg-slate-200"
                    }`}
                  >
                    <span className={`absolute left-0.5 bg-white shadow-sm transition-transform ${showHomeButton ? "translate-x-[18px]" : "translate-x-0"}`} />
                  </button>
                </div>
              </div>

              <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 tracking-wide">隐藏状态栏</h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">开启后隐藏手机顶部的时间、信号和电量状态栏</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hideStatusBar}
                    onClick={() => {
                      const nextVal = !hideStatusBar;
                      setHideStatusBar(nextVal);
                      handleSave({ hideStatusBar: nextVal });
                    }}
                    className={`settings-compact-toggle relative flex shrink-0 items-center border-0 p-0 transition-colors ${hideStatusBar ? "bg-neutral-950" : "bg-slate-200"}`}
                  >
                    <span className={`absolute left-0.5 bg-white shadow-sm transition-transform ${hideStatusBar ? "translate-x-[18px]" : "translate-x-0"}`} />
                  </button>
                </div>
              </div>

              {false && (
                <>
              {/* PWA 渐进式独立应用管理器 */}
              <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
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
                  通过 PWA (Progressive Web App) 技术，您可以将<strong>米饭机</strong>作为原生 App 安装到您的手机桌面。安装后点开可<strong>隐藏浏览器地址栏、实现沉浸式壁纸穿透状态栏、以及极其流畅的离线启动体验</strong>。
                </p>

                {isStandalone ? (
                  <div className="bg-emerald-50/50 p-3 rounded-[16px] border border-emerald-100/60 text-[10px] text-emerald-700 space-y-1">
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
                        className="w-full py-3 bg-neutral-950 hover:bg-neutral-900 text-white font-extrabold rounded-[16px] text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>立即安装「米饭机」到主屏幕</span>
                      </button>
                    ) : (
                      <div className="bg-slate-50 p-3 rounded-[16px] border border-slate-100/80 text-[10px] text-slate-600 space-y-1.5">
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

                    <div className="bg-amber-50/40 p-3 rounded-[16px] border border-amber-100/50 text-[10px] text-amber-700 space-y-1">
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
                </>
              )}
            </div>
          )}

          {/* SYSTEM SETTINGS & BACKUP TAB */}
          {activeTab === "system" && (
            <div className="space-y-4 text-left">
              <SystemBackupPanel
                showExportOptions={showBackupExportOptions}
                onOpenExportOptions={() => setShowBackupExportOptions(true)}
                onCloseExportOptions={() => setShowBackupExportOptions(false)}
                onExportFull={async () => {
                  try {
                    await handleExportFull();
                    setShowBackupExportOptions(false);
                  } catch (error: any) {
                    alert("导出备份失败: " + error.message);
                  }
                }}
                onExportLight={async () => {
                  try {
                    await handleExportLight();
                    setShowBackupExportOptions(false);
                  } catch (error: any) {
                    alert("导出备份失败: " + error.message);
                  }
                }}
                onImport={handleSystemBackupImport}
                onInspect={handleSystemBackupInspect}
              />

              <StorageDiagnosticsCard
                diagnostics={storageDiagnostics}
                preflight={storagePreflight}
                appVersion={APP_VERSION}
                backupVersion={SYSTEM_BACKUP_VERSION}
                lastBackupAt={lastBackupAt}
                onRefresh={() => void refreshStorageDiagnostics()}
                onRunPreflight={() => void runStorageMigrationPreflight()}
                onRunContentMigration={() => void runContentStorageMigration()}
                onResumeInterruptedMigration={() => void runContentStorageMigration(true)}
                contentMigrationRunning={isContentStorageMigrationRunning}
                onRequestPersistence={() => void requestStoragePersistence()}
                onDownloadDiagnosticReport={downloadStorageDiagnosticReport}
                onCleanOrphanedResources={cleanOrphanedResources}
                onCleanMigratedCopies={cleanMigratedCopies}
              />

              <div className="settings-section-header">桌面模块</div>
              <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">桌面模块备份</h3>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-400">单独备份和恢复所有桌面美化，如壁纸、桌面布局、小组件设置与自定义应用图标等。</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={downloadDesktopModuleBackup} className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-[16px] transition-all group">
                    <Download className="w-5 h-5 text-slate-600 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-slate-700">导出桌面模块</span>
                    <span className="text-[8px] text-slate-400 mt-1">下载桌面 JSON</span>
                  </button>
                  <label className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-[16px] transition-all group cursor-pointer">
                    <Upload className="w-5 h-5 text-slate-600 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-slate-700">导入桌面模块</span>
                    <span className="text-[8px] text-slate-400 mt-1">恢复桌面 JSON</span>
                    <input type="file" accept="application/json" onChange={importDesktopModuleBackup} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="settings-section-header">危险操作</div>
              {/* Reset Cache and Return to Default */}
              <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-rose-500 uppercase tracking-wider">危险区域</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  清除缓存将删除此设备上的所有自定义角色、历史对话、世界书、日程、备忘录和朋友圈，系统也将恢复为最干净的初始设置。请注意此操作无法撤销。
                </p>
                <button
                  type="button"
                  onClick={handleClearApplicationData}
                  disabled={isClearingApplicationData}
                  className="w-full py-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-600 rounded-[16px] font-bold text-xs transition-all flex items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isClearingApplicationData ? "animate-spin" : ""}`} />
                  <span>{isClearingApplicationData ? "正在清除…" : "清除缓存并恢复为默认"}</span>
                </button>
              </div>
            </div>
          )}

          {/* VOICE SYNTHESIS SETTINGS TAB */}
          {activeTab === "minimax" && (
            <div className="space-y-3 text-left pb-[34px] w-full max-w-md mx-auto">
              <div className="settings-section-header">语音设置</div>
              <section className="settings-card overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              {/* General Toggle Switch */}
              <div className="flex items-center justify-between gap-3 border-b border-[var(--divider)] px-4 py-3">
                <div>
                  <span className="text-sm font-bold text-slate-800 block">语音合成总开关</span>
                  <span className="text-[10px] text-slate-400">开启后，角色发言会根据人设和音色自动合成语音</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableMiniMaxTts}
                    onChange={(e) => setEnableMiniMaxTts(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`settings-compact-toggle rounded-[12px] transition-colors duration-200 relative ${
                    enableMiniMaxTts ? "bg-[var(--button-primary-bg)]" : "bg-[var(--surface-muted)]"
                  }`}>
                    <div className={`absolute top-[2px] left-[2px] bg-white border border-slate-300 rounded-full h-5 w-5 transition-transform duration-200 ${
                      enableMiniMaxTts ? "translate-x-5 border-white" : "translate-x-0"
                    }`} />
                  </div>
                </label>
              </div>

              <div className="space-y-2 px-4 py-4">
                <label className="block text-xs font-bold text-slate-700">语音平台</label>
                <select
                  value={ttsProvider}
                  onChange={(event) => setTtsProvider(event.target.value as "minimax" | "mossland")}
                  className="w-full px-3 py-2 rounded-[8px] bg-[var(--input-bg)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] text-xs font-bold"
                >
                  <option value="mossland">Mossland</option>
                  <option value="minimax">MiniMax</option>
                </select>
                <p className="text-[10px] leading-relaxed text-slate-400">切换平台不会删除另一平台已经保存的密钥、模型或角色音色 ID。</p>
              </div>

              {ttsProvider === "minimax" && <>
              {/* API Credentials */}
              <div className="space-y-4 px-4 py-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">MiniMax 开发者密钥</h3>
                
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      API KEY
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={minimaxApiKey}
                        onChange={(e) => setMinimaxApiKey(e.target.value)}
                        placeholder="请输入 MiniMax API Key"
                        className="w-full pl-3 pr-10 py-2 rounded-[8px] bg-[var(--input-bg)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] text-xs font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Group ID (企业或个人 ID)
                    </label>
                    <input
                      type="text"
                      value={minimaxGroupId}
                      onChange={(e) => setMinimaxGroupId(e.target.value)}
                      placeholder="请输入 MiniMax Group ID"
                      className="w-full px-3 py-2 rounded-[8px] bg-[var(--input-bg)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      合成模型 (TTS Model)
                    </label>
                    <select
                      value={minimaxModel}
                      onChange={(e) => setMinimaxModel(e.target.value)}
                      className="w-full px-3 py-2 rounded-[8px] bg-[var(--input-bg)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] text-xs font-bold"
                    >
                      <option value="speech-2.8-hd">speech-2.8-hd (超高解析度精品推荐)</option>
                      <option value="speech-2">speech-2 (高性价比第二代)</option>
                      <option value="speech-01-24h">speech-01-24h (24小时稳定流式)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* TTS Tuning Sliders */}
              <div className="space-y-4 border-t border-[var(--divider)] px-4 py-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">声线与朗读微调</h3>
                
                <div className="space-y-4">
                  {/* Speed */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                      <span>语速 (Speed)</span>
                      <span className="text-[var(--text-primary)] font-bold">{minimaxSpeed}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={minimaxSpeed}
                      onChange={(e) => setMinimaxSpeed(Number(e.target.value))}
                      className="w-full accent-[var(--text-primary)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400">
                      <span>极慢 (0.5)</span>
                      <span>正常 (1.0)</span>
                      <span>极快 (2.0)</span>
                    </div>
                  </div>

                  {/* Pitch */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                      <span>音调 (Pitch)</span>
                      <span className="text-[var(--text-primary)] font-bold">{minimaxPitch > 0 ? `+${minimaxPitch}` : minimaxPitch}</span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={minimaxPitch}
                      onChange={(e) => setMinimaxPitch(Number(e.target.value))}
                      className="w-full accent-[var(--text-primary)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400">
                      <span>浑厚低沉 (-12)</span>
                      <span>正常 (0)</span>
                      <span>高亢清脆 (12)</span>
                    </div>
                  </div>

                  {/* Volume */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                      <span>音量 (Volume)</span>
                      <span className="text-[var(--text-primary)] font-bold">{minimaxVol}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={minimaxVol}
                      onChange={(e) => setMinimaxVol(Number(e.target.value))}
                      className="w-full accent-[var(--text-primary)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400">
                      <span>极轻 (0.1)</span>
                      <span>正常 (1.0)</span>
                      <span>极响 (2.0)</span>
                    </div>
                  </div>
                </div>
              </div>
              </>}

              {ttsProvider === "mossland" && (
                <div className="space-y-4 px-4 py-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mossland 接口配置</h3>
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">接口地址</label>
                      <input
                        type="url"
                        value={mosslandApiEndpoint}
                        onChange={(event) => setMosslandApiEndpoint(event.target.value)}
                        placeholder="https://api.mosi.cn/v1/audio/speech"
                        className="w-full px-3 py-2 rounded-[8px] bg-[var(--input-bg)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">API KEY</label>
                      <div className="relative">
                        <input
                          type={showMosslandPassword ? "text" : "password"}
                          value={mosslandApiKey}
                          onChange={(event) => setMosslandApiKey(event.target.value)}
                          placeholder="请输入 Mossland API Key"
                          className="w-full pl-3 pr-10 py-2 rounded-[8px] bg-[var(--input-bg)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] text-xs font-semibold"
                        />
                        <button type="button" onClick={() => setShowMosslandPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showMosslandPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">合成模型 (TTS Model)</label>
                      <select value={mosslandModel} onChange={(event) => setMosslandModel(event.target.value)} className="w-full px-3 py-2 rounded-[8px] bg-[var(--input-bg)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] text-xs font-bold">
                        <option value="moss-tts">moss-tts</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
              </section>

              {/* Action Save Button */}
              <button
                type="button"
                onClick={handleSaveVoiceSettings}
                className="settings-wide-action settings-wide-action-primary"
              >
                保存设置
              </button>

              <div className="settings-section-header pt-1">图片生成设置</div>
              <section className="settings-card overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--divider)] px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">图片生成总开关</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">关闭时任何角色都不能生成图片</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableImageGeneration}
                    aria-label="图片生成总开关"
                    onClick={() => updateImageGenerationEnabled(!enableImageGeneration)}
                    className={`settings-compact-toggle relative flex shrink-0 items-center border-0 p-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${enableImageGeneration ? "bg-[var(--button-primary-bg)]" : "bg-[var(--surface-muted)]"}`}
                  >
                    <span className={`absolute left-0.5 bg-[var(--surface)] shadow-sm transition-transform duration-200 ${enableImageGeneration ? "translate-x-[18px]" : "translate-x-0"}`} />
                  </button>
                </div>

                <div className="space-y-3 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">图片 API 配置</h3>
                    <span className="text-[10px] text-[var(--text-tertiary)]">预设</span>
                  </div>
                  <div className="flex gap-2">
                    <select value={activeImageApiPresetId} onChange={(event) => selectImagePreset(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-xs text-[var(--text-primary)]">
                      {imageApiPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                    </select>
                    <button type="button" onClick={addImagePreset} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)]" aria-label="添加图片 API 配置"><Plus className="h-4 w-4" /></button>
                    <button type="button" onClick={deleteImagePreset} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-rose-100 bg-rose-50 text-rose-600" aria-label="删除图片 API 配置"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <input value={imagePresetName} onChange={(event) => { setImagePresetName(event.target.value); persistImagePresetDraft({ name: event.target.value }); }} placeholder="预设名称" className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)]" />
                  <input value={imageApiEndpoint} onChange={(event) => { setImageApiEndpoint(event.target.value); persistImagePresetDraft({ apiEndpoint: event.target.value }); }} placeholder="由中转服务商提供的 API 地址" className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-mono text-[var(--text-primary)]" />
                  <div className="relative">
                    <input type={showImagePassword ? "text" : "password"} value={imageApiKey} onChange={(event) => { setImageApiKey(event.target.value); persistImagePresetDraft({ apiKey: event.target.value }); }} placeholder="API Key" className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 pr-10 text-sm font-mono text-[var(--text-primary)]" />
                    <button type="button" onClick={() => setShowImagePassword(!showImagePassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" aria-label={showImagePassword ? "隐藏图片 API 密钥" : "显示图片 API 密钥"}>{showImagePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">图片模型</span>
                      <button type="button" disabled={isFetchingImageModels} onClick={fetchImageModels} className="text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60">{isFetchingImageModels ? "拉取中…" : "拉取模型列表"}</button>
                    </div>
                    {imageModelSuggestions.length ? <select value={imageSelectedModel} onChange={(event) => updateCurrentImageModel(event.target.value)} className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)]">{imageModelSuggestions.map((model) => <option key={model}>{model}</option>)}</select> : <input value={imageSelectedModel} onChange={(event) => updateCurrentImageModel(event.target.value)} placeholder="手动输入图片模型" className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)]" />}
                  </div>
                  <p className="text-xs leading-5 text-[var(--text-tertiary)]">测试连接只检查配置与模型列表，不会生成图片。</p>
                  {imageTestResult && <p className={`text-xs ${imageTestResult.success ? "text-emerald-600" : "text-rose-600"}`}>{imageTestResult.message}</p>}
                  <div className="settings-wide-action-group pt-1">
                    <button type="button" onClick={testImageApi} disabled={isTestingImageApi} className="settings-wide-action settings-wide-action-primary disabled:opacity-60">{isTestingImageApi ? "测试中…" : "测试连接"}</button>
                    <button type="button" onClick={saveImageApiConfig} className="settings-wide-action settings-wide-action-secondary">保存配置</button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
</div>
  );
}
