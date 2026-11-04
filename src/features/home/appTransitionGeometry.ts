export interface SurfaceRect { left: number; top: number; width: number; height: number }
export function iconSurfaceTransform(icon: SurfaceRect | undefined, surface: SurfaceRect): string | null {
  if (!icon || surface.width <= 0 || surface.height <= 0 || icon.width <= 0 || icon.height <= 0) return null;
  if (icon.left + icon.width <= surface.left || icon.top + icon.height <= surface.top || icon.left >= surface.left + surface.width || icon.top >= surface.top + surface.height) return null;
  return `translate(${icon.left - surface.left}px, ${icon.top - surface.top}px) scale(${Math.min(1, icon.width / surface.width)}, ${Math.min(1, icon.height / surface.height)})`;
}
