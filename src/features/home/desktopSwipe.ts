export function desktopSwipeOffset(raw: number, page: number, count: number, width: number): number {
  if ((page === 0 && raw > 0) || (page >= count - 1 && raw < 0)) {
    return Math.sign(raw) * Math.min(width * .22, Math.pow(Math.abs(raw), .82));
  }
  return Math.max(-width, Math.min(width, raw));
}

export function desktopSwipePage(input: { page: number; count: number; width: number; dx: number; dy: number; velocity: number }): number {
  const {page,count,width,dx,dy,velocity} = input;
  if (Math.abs(dy) > Math.abs(dx) || width <= 0) return page;
  const threshold = Math.min(90, Math.max(50, width * .18));
  const flick = Math.abs(dx) >= 14 && Math.abs(velocity) >= .45 && Math.sign(velocity) === Math.sign(dx);
  const reversed = Math.abs(velocity) >= .45 && Math.sign(velocity) !== Math.sign(dx);
  if ((!flick && Math.abs(dx) < threshold) || reversed) return page;
  return Math.max(0, Math.min(count - 1, page + (dx < 0 ? 1 : -1)));
}

/** Coalesce high-frequency input without putting pointer positions into React state. */
export function createSwipeFrameWriter(write: (offset:number) => void, request:(work:()=>void)=>number, cancel:(id:number)=>void) {
  let frame: number | undefined;
  let latest = 0;
  return {
    move(offset:number) { latest=offset; if(frame===undefined) frame=request(()=>{frame=undefined;write(latest);}); },
    cancel() { if(frame!==undefined) cancel(frame);frame=undefined; },
  };
}
