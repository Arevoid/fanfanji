import { useEffect, useState } from "react";
import type { UserSettings } from "../../../types";
import {
  CLASSIC_BUBBLE_OPACITY,
  CLASSIC_OTHER_BUBBLE_BACKGROUND,
  CLASSIC_OTHER_BUBBLE_TEXT,
  CLASSIC_SELF_BUBBLE_BACKGROUND,
  CLASSIC_SELF_BUBBLE_TEXT,
} from "../../chat/styles/chatBubbleDefaults";
import {
  LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
  LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
  LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS,
  LIQUID_GLASS_DEFAULT_TEXT_COLOR,
} from "../../chat/styles/liquidGlassDefaults";

type BubbleStylePreset = "default" | "floating-cute" | "liquid-glass";

export function useSettingsAppearanceDraftState(settings: UserSettings, effectiveBubbleStylePreset: BubbleStylePreset) {
  const [dockOpacity, setDockOpacity] = useState(settings.dockOpacity !== undefined ? settings.dockOpacity : 70);
  const [widgetOpacity, setWidgetOpacity] = useState(settings.widgetOpacity !== undefined ? settings.widgetOpacity : 70);
  const [iconBorderRadius, setIconBorderRadius] = useState(settings.iconBorderRadius !== undefined ? settings.iconBorderRadius : 35);
  const [iconBgOpacity, setIconBgOpacity] = useState(settings.iconBgOpacity !== undefined ? settings.iconBgOpacity : 100);
  const [iconBorderWidth, setIconBorderWidth] = useState(settings.iconBorderWidth !== undefined ? settings.iconBorderWidth : 1);
  const [iconBorderOpacity, setIconBorderOpacity] = useState(settings.iconBorderOpacity !== undefined ? settings.iconBorderOpacity : 100);
  const [hideAppNames, setHideAppNames] = useState(!!settings.hideAppNames);
  const [desktopAppTextColor, setDesktopAppTextColor] = useState(settings.desktopAppTextColor || "#000000");
  const [desktopIconMode, setDesktopIconMode] = useState<"light" | "dark">(settings.desktopIconMode || "dark");
  const [avatarBorderRadius, setAvatarBorderRadius] = useState(settings.avatarBorderRadius !== undefined ? settings.avatarBorderRadius : 12);
  const isLiquidGlassChatStyle = effectiveBubbleStylePreset === "liquid-glass";
  const [otherBubbleBg, setOtherBubbleBg] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassOtherBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR
    : settings.otherBubbleBg || CLASSIC_OTHER_BUBBLE_BACKGROUND);
  const [otherBubbleColor, setOtherBubbleColor] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR
    : settings.otherBubbleColor || CLASSIC_OTHER_BUBBLE_TEXT);
  const [otherBubbleRadius, setOtherBubbleRadius] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassOtherBubbleRadius ?? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS
    : settings.otherBubbleRadius ?? 6);
  const [otherBubbleOpacity, setOtherBubbleOpacity] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassOtherBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY
    : settings.otherBubbleOpacity ?? CLASSIC_BUBBLE_OPACITY);
  const [selfBubbleBg, setSelfBubbleBg] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassSelfBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR
    : settings.selfBubbleBg || CLASSIC_SELF_BUBBLE_BACKGROUND);
  const [selfBubbleColor, setSelfBubbleColor] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR
    : settings.selfBubbleColor || CLASSIC_SELF_BUBBLE_TEXT);
  const [selfBubbleRadius, setSelfBubbleRadius] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassSelfBubbleRadius ?? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS
    : settings.selfBubbleRadius ?? 6);
  const [selfBubbleOpacity, setSelfBubbleOpacity] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassSelfBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY
    : settings.selfBubbleOpacity ?? CLASSIC_BUBBLE_OPACITY);
  const [collapseConsecutiveAvatars, setCollapseConsecutiveAvatars] = useState(settings.collapseConsecutiveAvatars !== false);
  const [hideNicknames, setHideNicknames] = useState(!!settings.hideNicknames);
  const [dockBorderRadius, setDockBorderRadius] = useState(settings.dockBorderRadius !== undefined ? settings.dockBorderRadius : 26);
  const [widgetBorderRadius, setWidgetBorderRadius] = useState(settings.widgetBorderRadius !== undefined ? settings.widgetBorderRadius : 22);
  const [iconBorderEnabled, setIconBorderEnabled] = useState(settings.iconBorderEnabled !== false);
  const [bubbleTailEnabled, setBubbleTailEnabled] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassBubbleTailEnabled === true
    : settings.bubbleTailEnabled === true);
  const [bubbleTailVertical, setBubbleTailVertical] = useState<"top" | "center" | "bottom">(isLiquidGlassChatStyle
    ? settings.liquidGlassBubbleTailVertical || "top"
    : settings.bubbleTailVertical || "top");
  const [bubblePosition, setBubblePosition] = useState<"side" | "above">(((isLiquidGlassChatStyle
    ? settings.liquidGlassBubblePosition
    : settings.bubblePosition) === "above") ? "above" : "side");
  const [bubbleSpacing, setBubbleSpacing] = useState(settings.bubbleSpacing ?? 32);
  const [bubbleBorderEnabled, setBubbleBorderEnabled] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassBubbleBorderEnabled === true
    : !!settings.bubbleBorderEnabled);
  const [bubbleBorderWidth, setBubbleBorderWidth] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassBubbleBorderWidth ?? 1
    : settings.bubbleBorderWidth ?? 1);
  const [otherBubbleBorderColor, setOtherBubbleBorderColor] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassOtherBubbleBorderColor || "#ffffff"
    : settings.otherBubbleBorderColor || "#e4e4e7");
  const [selfBubbleBorderColor, setSelfBubbleBorderColor] = useState(isLiquidGlassChatStyle
    ? settings.liquidGlassSelfBubbleBorderColor || "#ffffff"
    : settings.selfBubbleBorderColor || "#27272a");
  const [avatarBorderEnabled, setAvatarBorderEnabled] = useState(!!settings.avatarBorderEnabled);
  const [avatarBorderWidth, setAvatarBorderWidth] = useState(settings.avatarBorderWidth !== undefined ? settings.avatarBorderWidth : 1);
  const [avatarBorderColor, setAvatarBorderColor] = useState(settings.avatarBorderColor || "#e4e4e7");
  const [beautySubTab, setBeautySubTab] = useState<"desktop" | "chat" | "preset">("chat");

  useEffect(() => {
    setOtherBubbleBg(isLiquidGlassChatStyle ? settings.liquidGlassOtherBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR : settings.otherBubbleBg || CLASSIC_OTHER_BUBBLE_BACKGROUND);
    setOtherBubbleColor(isLiquidGlassChatStyle ? settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR : settings.otherBubbleColor || CLASSIC_OTHER_BUBBLE_TEXT);
    setOtherBubbleOpacity(isLiquidGlassChatStyle ? settings.liquidGlassOtherBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY : settings.otherBubbleOpacity ?? CLASSIC_BUBBLE_OPACITY);
    setSelfBubbleBg(isLiquidGlassChatStyle ? settings.liquidGlassSelfBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR : settings.selfBubbleBg || CLASSIC_SELF_BUBBLE_BACKGROUND);
    setSelfBubbleColor(isLiquidGlassChatStyle ? settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR : settings.selfBubbleColor || CLASSIC_SELF_BUBBLE_TEXT);
    setSelfBubbleOpacity(isLiquidGlassChatStyle ? settings.liquidGlassSelfBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY : settings.selfBubbleOpacity ?? CLASSIC_BUBBLE_OPACITY);
    setOtherBubbleRadius(isLiquidGlassChatStyle ? settings.liquidGlassOtherBubbleRadius ?? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS : settings.otherBubbleRadius ?? 6);
    setSelfBubbleRadius(isLiquidGlassChatStyle ? settings.liquidGlassSelfBubbleRadius ?? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS : settings.selfBubbleRadius ?? 6);
    setBubbleTailEnabled(isLiquidGlassChatStyle ? settings.liquidGlassBubbleTailEnabled === true : settings.bubbleTailEnabled === true);
    setBubbleTailVertical(isLiquidGlassChatStyle ? settings.liquidGlassBubbleTailVertical || "top" : settings.bubbleTailVertical || "top");
    setBubblePosition(((isLiquidGlassChatStyle ? settings.liquidGlassBubblePosition : settings.bubblePosition) === "above") ? "above" : "side");
    setBubbleSpacing(settings.bubbleSpacing ?? 32);
    setBubbleBorderEnabled(isLiquidGlassChatStyle ? settings.liquidGlassBubbleBorderEnabled === true : settings.bubbleBorderEnabled === true);
    setBubbleBorderWidth(isLiquidGlassChatStyle ? settings.liquidGlassBubbleBorderWidth ?? 1 : settings.bubbleBorderWidth ?? 1);
    setOtherBubbleBorderColor(isLiquidGlassChatStyle ? settings.liquidGlassOtherBubbleBorderColor || "#ffffff" : settings.otherBubbleBorderColor || "#e4e4e7");
    setSelfBubbleBorderColor(isLiquidGlassChatStyle ? settings.liquidGlassSelfBubbleBorderColor || "#ffffff" : settings.selfBubbleBorderColor || "#27272a");
  }, [
    effectiveBubbleStylePreset, isLiquidGlassChatStyle,
    settings.liquidGlassOtherBubbleBg, settings.liquidGlassOtherBubbleColor, settings.liquidGlassOtherBubbleOpacity, settings.liquidGlassOtherBubbleRadius,
    settings.liquidGlassSelfBubbleBg, settings.liquidGlassSelfBubbleColor, settings.liquidGlassSelfBubbleOpacity, settings.liquidGlassSelfBubbleRadius,
    settings.liquidGlassBubbleTailEnabled, settings.liquidGlassBubbleTailVertical, settings.liquidGlassBubblePosition,
    settings.liquidGlassBubbleBorderEnabled, settings.liquidGlassBubbleBorderWidth, settings.liquidGlassOtherBubbleBorderColor, settings.liquidGlassSelfBubbleBorderColor,
    settings.otherBubbleBg, settings.otherBubbleColor, settings.otherBubbleOpacity, settings.otherBubbleRadius,
    settings.selfBubbleBg, settings.selfBubbleColor, settings.selfBubbleOpacity, settings.selfBubbleRadius,
    settings.bubbleTailEnabled, settings.bubbleTailVertical, settings.bubblePosition, settings.bubbleBorderEnabled,
    settings.bubbleBorderWidth, settings.otherBubbleBorderColor, settings.selfBubbleBorderColor, settings.bubbleSpacing,
  ]);

  return {
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
  };
}
