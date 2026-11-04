import { useLayoutEffect, useRef, type RefObject } from "react";
import { createSwipeFrameWriter, desktopSwipeOffset, desktopSwipePage } from "./desktopSwipe";

export function useDesktopSwipeMotion(page:number,count:number,viewport:RefObject<HTMLDivElement | null>,commit:(page:number)=>void) {
  const trackRef=useRef<HTMLDivElement>(null);
  const current=useRef({page,count,commit}); current.current={page,count,commit};
  const gesture=useRef<{width:number;initial:number;axis:"pending"|"horizontal"|"vertical";lastX:number;lastAt:number;velocity:number} | null>(null);
  const writer=useRef<ReturnType<typeof createSwipeFrameWriter> | null>(null);
  if(!writer.current) writer.current=createSwipeFrameWriter(offset=>{
    const node=trackRef.current;const state=gesture.current;
    if(node&&state)node.style.transform=`translate3d(${-current.current.page*state.width+offset}px,0,0)`;
  },work=>requestAnimationFrame(work),id=>cancelAnimationFrame(id));
  const settle=(next:number,offset:number)=>{
    writer.current!.cancel();
    const node=trackRef.current;
    const width=gesture.current?.width || viewport.current?.clientWidth || 1;
    if(node){
      node.style.transition=`transform ${Math.min(300,Math.max(180,160+Math.abs((current.current.page-next)*width+offset)*.35))}ms cubic-bezier(.2,.7,.2,1)`;
      node.style.transform=`translate3d(${-next*width}px,0,0)`;
      delete node.dataset.swiping;
    }
    gesture.current=null;
    if(next!==current.current.page)current.current.commit(next);
  };
  useLayoutEffect(()=>{
    if(!gesture.current&&trackRef.current)trackRef.current.style.transform=`translate3d(${-page*100}%,0,0)`;
  },[page,count]);
  useLayoutEffect(()=>()=>writer.current?.cancel(),[]);
  return {
    trackRef,
    begin(){
      writer.current!.cancel();
      const node=trackRef.current;const width=viewport.current?.clientWidth || 1;
      let initial=0;
      if(node){
        const matrix=getComputedStyle(node).transform;
        if(matrix!=="none")initial=new DOMMatrixReadOnly(matrix).m41+current.current.page*width;
      }
      gesture.current={width,initial,axis:"pending",lastX:0,lastAt:performance.now(),velocity:0};
      if(node){node.style.transition="none";node.style.transform=`translate3d(${-current.current.page*width+initial}px,0,0)`;}
    },
    move(dx:number,dy:number){
      const state=gesture.current;if(!state)return false;
      if(state.axis==="pending"&&Math.max(Math.abs(dx),Math.abs(dy))>8)state.axis=Math.abs(dx)>Math.abs(dy)*1.15?"horizontal":"vertical";
      if(state.axis!=="horizontal")return false;
      const now=performance.now();const elapsed=now-state.lastAt;
      if(elapsed>0){state.velocity=(dx-state.lastX)/elapsed;state.lastAt=now;state.lastX=dx;}
      if(trackRef.current)trackRef.current.dataset.swiping="true";
      writer.current!.move(desktopSwipeOffset(state.initial+dx,current.current.page,current.current.count,state.width));
      return true;
    },
    end(dx:number,dy:number,cancelled=false){
      const state=gesture.current;if(!state)return;
      const offset=state.initial+dx;
      const velocity=performance.now()-state.lastAt>100?0:state.velocity;
      const next=cancelled||state.axis!=="horizontal"?current.current.page:desktopSwipePage({...current.current,width:state.width,dx:offset,dy,velocity});
      settle(next,offset);
    },
    cancel(){if(gesture.current)settle(current.current.page,0);},
  };
}
