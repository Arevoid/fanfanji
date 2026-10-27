import {useEffect,useRef,useState} from "react";
import {configureMemoryMigrationBudget,readMemoryMigrationBudget} from "../services/memoryMigrationBudgetService";
export function MemoryMigrationBudget(props:{open:boolean;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);const [limit,setLimit]=useState(200);const [notice,setNotice]=useState("");const [,refresh]=useState(0);
 useEffect(()=>{if(props.open){setLimit(readMemoryMigrationBudget().value.limit);dialog.current?.showModal();}else dialog.current?.close();},[props.open]);
 const state=readMemoryMigrationBudget();const button="min-h-11 rounded-xl border border-slate-300 px-3 py-2 focus-visible:outline focus-visible:outline-2";
 const save=(paused:boolean)=>{const result=configureMemoryMigrationBudget(limit,paused);setNotice(result.success?paused?"后台迁移已暂停，已完成的内容保留。":"预算已保存，可继续迁移。":"请输入1到10000的整数；保存失败时原设置不变。");refresh(n=>n+1);if(result.success)document.dispatchEvent(new Event("fanfanji:memory-evidence-updated"));};
 return <dialog ref={dialog} onCancel={props.onClose} aria-labelledby="migration-budget-title" className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(90vw,440px)] overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 backdrop:bg-black/40">
 <h2 id="migration-budget-title" className="text-lg font-semibold">后台迁移用量</h2><p className="my-3">今天已预留 {state.value.used}/{state.value.limit} 次请求；{state.value.paused?"已暂停":"可继续处理"}。达到预算后保留进度，次日可续跑。</p>
 <p className="mb-3 text-sm">包含整理、核验、重试和直连回退。超时或代理未到达也保守计数；这不是供应商账单。此设置不限制私聊记忆条数或记忆内容长度。</p>
 <label htmlFor="migration-daily-limit">每日最多请求次数</label><input id="migration-daily-limit" type="number" min="1" max="10000" step="1" value={limit} onChange={e=>setLimit(Number(e.target.value))} className="my-2 min-h-11 w-full rounded-lg border p-3" />
 <p role="status" className="my-2">{notice}</p><div className="flex flex-wrap gap-2"><button className={button} onClick={()=>save(false)}>保存并允许继续</button><button className={button} onClick={()=>save(true)}>暂停后台迁移</button><button className={button} onClick={props.onClose}>关闭</button></div></dialog>;
}
