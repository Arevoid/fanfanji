import {useEffect,useRef,useState} from "react";
import type {Character,UserSettings} from "../../../types";
import {pendingMemoryReviews,resolvePendingMemory,undoPendingMemoryAction} from "../services/memoryPendingReviewService";
import {organizationSourceRevision} from "../../../domain/characterKnowledge/knowledgeOrganization";
import {organizeLegacyMemory} from "../services/memoryOrganizationService";
import {createMemorySettingReviewer} from "../services/memorySettingReviewService";
import {withMemoryMigrationBudget} from "../services/memoryMigrationBudgetService";
export function MemoryPendingReview(props:{open:boolean;onClose:()=>void;identityId:string;characterId:string;relationId:string;characters:Character[];settings?:UserSettings;legacyOnly?:boolean}) {
 const dialog=useRef<HTMLDialogElement>(null);const [,refresh]=useState(0);const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
 const [undo,setUndo]=useState<ReturnType<typeof pendingMemoryReviews>[number]>();
 useEffect(()=>{if(props.open)dialog.current?.showModal();else dialog.current?.close();},[props.open]);
 const records=pendingMemoryReviews(props.identityId,props.characterId,props.relationId).filter(c=>!props.legacyOnly||c.legacyCompatible||c.organizationSourceId||c.source.kind==="legacy_memory"||c.source.kind==="import");
 const button="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2";
 const act=async(c:typeof records[number],action:"retain"|"skip"|"retry")=>{
   setBusy(true);setNotice("");
   try {
     if(action==="retry"&&!props.settings?.apiKey){setNotice("请先配置聊天API，再重试整理。");return;}
     const result=resolvePendingMemory({scope:c,id:c.id,expectedRevision:organizationSourceRevision(c),action});
     if(!result.success){setNotice("来源已变化或保存失败，请重新打开后核对。");return;}
     if(action!=="retry"){setUndo(c);setNotice(action==="retain"?"已保留，并标记为你的选择；未改变原来源可信度或时间。":"不再作为长期记忆，原资料仍保留。");}
     else {
       const character=props.characters.find(x=>x.id===c.characterId);
       if(character&&props.settings){const outcome=await organizeLegacyMemory({scope:c,settings:props.settings,visible:true,migrationDrain:true,sourceIds:[c.id],retryFailedMigration:true,
         reviewAuthorizedSettings:createMemorySettingReviewer(character,c,"chat",props.settings,withMemoryMigrationBudget())});
         setNotice(outcome==="completed"?"已重新核对；无法确认的内容继续保留在这里。":"本次未完成，原文保留，可稍后重试。");}
     }
   }finally{setBusy(false);refresh(n=>n+1);}
 };
 return <dialog ref={dialog} onCancel={props.onClose} aria-labelledby="pending-memory-title" className="memory-legacy-dialog memory-review-dialog fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(94vw,560px)] overflow-hidden rounded-2xl bg-white p-0 text-slate-900 backdrop:bg-black/40">
  <div className="flex max-h-[calc(100dvh-2rem)] flex-col"><header className="shrink-0 border-b p-4"><h2 id="pending-memory-title" className="text-lg font-semibold">旧版记忆 · 内容核对（{records.length}）</h2><p className="mt-2 text-sm">这里汇集当前身份下所有角色的待核对旧记忆。旧版兼容资料可继续按原规则调用；保留不会把推断或计划变成已发生事实。</p></header>
  <div className="min-h-0 space-y-4 overflow-y-auto p-4">{!records.length&&<p>当前范围没有待核对内容。</p>}{records.map(c=><article key={c.id} className="rounded-xl border p-3"><p className="font-medium">{props.characters.find(x=>x.id===c.characterId)?.name||"未识别角色"}</p><p className="my-2 whitespace-pre-wrap break-words">{c.statement}</p><p className="text-sm">{c.valueReason||"原资料需要进一步核对"}</p><details className="my-2"><summary className="min-h-11 cursor-pointer py-2">查看原文与来源</summary><p className="whitespace-pre-wrap break-words">{c.source.evidenceQuote||c.statement}</p><p className="mt-2 break-words">时间状态：{c.temporalStatus}；来源：{c.source.app||c.source.kind}；记录时间：{new Date(c.recordedAt).toLocaleString()}</p></details><div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={()=>void act(c,"retain")}>保留为记忆</button><button disabled={busy} className={button} onClick={()=>void act(c,"skip")}>不作为长期记忆</button><button disabled={busy} className={button} onClick={()=>void act(c,"retry")}>重新核对</button></div></article>)}</div>
  <footer className="shrink-0 space-y-2 border-t bg-white p-4"><p role="status" aria-live="polite">{busy?"正在处理，请稍候…":notice}</p><div className="flex gap-2">{undo&&<button className={button} disabled={busy} onClick={()=>{const result=undoPendingMemoryAction(undo,undo.id);setNotice(result.success?"已撤销，恢复待核对状态。":"内容已有后续变化，无法覆盖撤销。");if(result.success)setUndo(undefined);refresh(n=>n+1);}}>撤销上次处理</button>}<button className={button} disabled={busy} onClick={props.onClose}>稍后处理 / 关闭</button></div></footer></div>
 </dialog>;
}
