import type { IdentityRecognitionState } from "./characterRelationship";

/** Detects an explicit user disclosure without treating names or avatars as proof. */
export function hasExplicitIdentityDisclosure(text: string, primaryName?: string): boolean {
  const normalizedText = text.trim();
  const normalizedName = primaryName?.trim();
  if (!normalizedText || !normalizedName) return false;
  const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:我就是|我是|其实是|真的是|你可以叫我)\\s*[“「『]?${escapedName}[”」』]?`, "u").test(normalizedText)
    || new RegExp(`(?:主号|大号|原来的我|同一个人)[：:，, ]*(?:就是)?\\s*[“「『]?${escapedName}[”」』]?`, "u").test(normalizedText);
}

export function isIdentityRecognitionState(value: unknown): value is IdentityRecognitionState {
  return value === "unknown" || value === "suspected" || value === "recognized" || value === "confirmed";
}
