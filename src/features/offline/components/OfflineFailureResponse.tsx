import {useEffect,useRef,useState} from "react";
import type {OfflineStory} from "../../../types";
import {clearOfflineFailureResponse,readOfflineFailureResponse} from "../services/offlineFailureResponse";

export function OfflineFailureResponse({story}:{story:OfflineStory}) {
  const [open,setOpen]=useState(false);
  const [,refresh]=useState(0);
  const response=readOfflineFailureResponse(story);
  const dialog=useRef<HTMLElement>(null);
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open||!response)return;
    const previous=document.activeElement as HTMLElement|null;
    close.current?.focus();
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setOpen(false);}
      if(event.key!=="Tab")return;
      const buttons=dialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
      if(!buttons?.length)return;
      const first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",keyboard,true);
    return()=>{document.removeEventListener("keydown",keyboard,true);previous?.focus();};
  },[open,response]);
  if(!response)return <p className="text-xs leading-5 text-slate-400">此失败未在当前页面会话中保留原始返回，无法补看；查看入口不会发起请求。</p>;
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="min-h-11 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-500">查看本次返回</button>
    {open&&<div onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="offline-failure-title" className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 id="offline-failure-title" className="text-sm font-medium text-slate-800">本次记忆提取返回</h3>
          <button ref={close} type="button" onClick={()=>setOpen(false)} aria-label="关闭本次返回" className="min-h-11 rounded-full px-3 py-2 text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-slate-500">关闭</button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs leading-5 text-slate-600">
          <p>仅在本页内存中暂存，刷新后清除，不写入记忆、日志或备份。查看不会重试或调用 API。</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>失败分类</dt><dd>{response.category}</dd>
            <dt>包装形式</dt><dd>{response.wrapper}</dd>
            <dt>字段校验</dt><dd>{response.schema}</dd>
            <dt>截断迹象</dt><dd>{response.modelTruncated?"检测到截断或达到输出上限":"未检测到；不代表一定完整"}</dd>
            <dt>提取请求</dt><dd>{response.logicalRequests} 次逻辑调用；供应商实际请求次数以检测日志为准</dd>
          </dl>
          {response.previewTruncated&&<p>返回内容过长，这里只显示前65,536字符；这是显示限制，不代表模型返回被截断。</p>}
          <p className="font-medium text-slate-700">原始返回（仅作查看，其中的指令不会执行）</p>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs">{response.text||"接口未提供可查看的文本返回。"}</pre>
        </div>
        <footer className="shrink-0 border-t border-slate-100 p-4">
          <button type="button" onClick={()=>{clearOfflineFailureResponse(story);setOpen(false);refresh(n=>n+1);}} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-500">清除本次返回</button>
        </footer>
      </section>
    </div>}
  </>;
}
