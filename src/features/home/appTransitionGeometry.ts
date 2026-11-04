export interface SurfaceRect { left: number; top: number; width: number; height: number }
/** Icon and page share the same moving window, rather than fading a stationary icon. */
export function iconHandoffFrames(icon: SurfaceRect, surface: SurfaceRect, direction: "open" | "close"): Keyframe[] {
  const collapsedScale = Math.min(1, Math.max(icon.width / surface.width, icon.height / surface.height));
  return [0, .08, .16, .24, .32, .5, .68, .76, .84, .92, 1].map(offset => {
    const progress = direction === "open" ? offset : 1 - offset;
    const scale = collapsedScale + (1 - collapsedScale) * progress;
    const width = scale * (icon.width / collapsedScale + (surface.width - icon.width / collapsedScale) * progress);
    const height = scale * (icon.height / collapsedScale + (surface.height - icon.height / collapsedScale) * progress);
    const zoom = Math.min(4, width / icon.width, height / icon.height);
    const left = icon.left + (surface.left - icon.left) * progress + (width - icon.width * zoom) / 2;
    const top = icon.top + (surface.top - icon.top) * progress + (height - icon.height * zoom) / 2;
    return { offset, transform: `translate(${left - icon.left}px, ${top - icon.top}px) scale(${zoom})`,
      opacity: Math.max(0, Math.min(1, (0.32 - progress) / .24)) };
  });
}
export function iconSurfaceTransform(icon: SurfaceRect | undefined, surface: SurfaceRect): string | null {
  if (!icon || surface.width <= 0 || surface.height <= 0 || icon.width <= 0 || icon.height <= 0) return null;
  if (icon.left + icon.width <= surface.left || icon.top + icon.height <= surface.top || icon.left >= surface.left + surface.width || icon.top >= surface.top + surface.height) return null;
  const scale = Math.min(1, Math.max(icon.width / surface.width, icon.height / surface.height));
  return `translate(${icon.left - surface.left}px, ${icon.top - surface.top}px) scale(${scale})`;
}

/** The live page keeps its aspect ratio; a shrinking mask supplies the icon outline. */
export function iconSurfaceClip(icon: SurfaceRect, surface: SurfaceRect, radii: readonly string[]): string {
  const scale = Math.min(1, Math.max(icon.width / surface.width, icon.height / surface.height));
  const corners = radii.map(value => {
    const parts = value.split(/\s+/);
    const pixel = (part: string, size: number) => part.endsWith("%") ? parseFloat(part) * size / 100 : parseFloat(part) || 0;
    return [Math.min(icon.width / 2, pixel(parts[0], icon.width)) / scale,
      Math.min(icon.height / 2, pixel(parts[1] || parts[0], icon.height)) / scale];
  });
  return `inset(0px ${Math.max(0, surface.width - icon.width / scale)}px ${Math.max(0, surface.height - icon.height / scale)}px 0px round ${corners.map(c => `${c[0]}px`).join(" ")} / ${corners.map(c => `${c[1]}px`).join(" ")})`;
}
