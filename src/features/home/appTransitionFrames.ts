export function appTransitionFrames(options: { direction: "open" | "close"; iconTransform: string | null; iconClip?: string; reduced: boolean; fromTransform?: string; fromClip?: string }): { frames: Keyframe[]; duration: number } {
  const { direction, iconTransform, reduced, fromTransform = "none" } = options;
  const spatial = !!iconTransform && !reduced;
  const expanded: Keyframe = { transform: "none", opacity: 1, borderRadius: "0px", clipPath: "inset(0px 0px 0px 0px round 0px)", transformOrigin: "0 0" };
  // The spatial surface stays solid throughout the flight. Fading its entire
  // contents over the desktop makes it look like a white flash/double exposure.
  const collapsed: Keyframe = { ...expanded, transform: spatial ? iconTransform : "none", opacity: spatial ? 1 : 0, clipPath: spatial ? options.iconClip || expanded.clipPath : expanded.clipPath };
  return direction === "open"
    ? { frames: [collapsed, expanded], duration: spatial ? 340 : 180 }
    : { frames: [{ ...expanded, transform: fromTransform, clipPath: options.fromClip || expanded.clipPath }, collapsed], duration: spatial ? 280 : 180 };
}
