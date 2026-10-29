export interface FloatingCallPoint { left: number; top: number }
/** Clamp to the app viewport, including narrow screens and viewport resize. */
export function clampFloatingCallPosition(point: FloatingCallPoint, bounds: { width: number; height: number }, size = { width: 104, height: 148 }): FloatingCallPoint {
  const clamp = (value: number, limit: number, extent: number) => {
    const max = Math.max(0, limit - extent - 8);
    return Math.max(Math.min(8, max), Math.min(max, Number.isFinite(value) ? value : 8));
  };
  return { left: clamp(point.left, bounds.width, size.width), top: clamp(point.top, bounds.height, size.height) };
}
