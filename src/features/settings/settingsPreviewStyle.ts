import type { CSSProperties } from "react";

export function getSettingsPreviewBubbleBackground(hexColor: string, opacityPercent: number): string {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hexColor.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  if (!result) return hexColor;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
}

export function getSettingsPreviewBubbleStyle(input: {
  background: string;
  color: string;
  radius: number;
  borderEnabled: boolean;
  borderWidth: number;
  borderColor: string;
  liquidGlass: boolean;
}): CSSProperties {
  return {
    background: input.background,
    color: input.color,
    borderRadius: `${input.radius}px`,
    border: input.borderEnabled
      ? `${input.borderWidth}px solid ${input.borderColor}`
      : input.liquidGlass
        ? "1.5px solid rgba(255, 255, 255, 0.55)"
        : "none",
    ...(input.liquidGlass ? {
      backdropFilter: "blur(20px) saturate(190%)",
      WebkitBackdropFilter: "blur(20px) saturate(190%)",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.04)",
    } : {}),
  };
}
