export function appTransitionFrames(options: { direction: "open" | "close"; iconTransform: string | null; iconClip?: string; reduced: boolean; fromTransform?: string; fromClip?: string }): { frames: Keyframe[]; duration: number } {
  const { direction, iconTransform, reduced, fromTransform = "none" } = options;
  const spatial = !!iconTransform && !reduced;
  const expanded: Keyframe = { transform: "none", opacity: 1, borderRadius: "0px", clipPath: "inset(0px 0px 0px 0px round 0px)", transformOrigin: "0 0" };
  // Exchange content only near icon size; the large page remains opaque.
  const collapsed: Keyframe = { ...expanded, transform: spatial ? iconTransform : "none", opacity: 0, clipPath: spatial ? options.iconClip || expanded.clipPath : expanded.clipPath };
  return direction === "open"
    ? { frames: [{...collapsed,offset:0}, ...(spatial ? [{opacity:1,offset:.32}] : []), {...expanded,offset:1}], duration: spatial ? 380 : 180 }
    : { frames: [{ ...expanded, offset:0, transform: fromTransform, clipPath: options.fromClip || expanded.clipPath }, ...(spatial ? [{opacity:1,offset:.68}] : []), {...collapsed,offset:1}], duration: spatial ? 340 : 180 };
}
