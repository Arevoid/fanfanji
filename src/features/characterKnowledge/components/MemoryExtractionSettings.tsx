import {useEffect,useRef,useState} from "react";
import type {MemoryVaultSettings} from "../../../types";
export function MemoryExtractionSettings(props:{settings:MemoryVaultSettings;chatModel?:string;onSave:(value:MemoryVaultSettings)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[custom,setCustom]=useState(props.settings.extractModel!=="default-chat-model"),[model,setModel]=useState(props.settings.extractModel==="default-chat-model"?"":props.settings.extractModel);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 return <dialog ref={dialog} aria-labelledby="memory-extraction-title" onCancel={props.onClose} className="fixed inset-0 m-auto h-fit max-h-[85dvh] w-[min(90vw,420px)] rounded-2xl p-5 backdrop:bg-black/40"><form onSubmit={event=>{event.preventDefault();if(custom&&!model.trim())return;props.onSave({...props.settings,extractModel:custom?model.trim():"default-chat-model",extractModelConfigured:true});props.onClose();}}>
 <h2 id="memory-extraction-title" className="font-semibold">记忆整理模型</h2><p className="my-3 text-sm">使用当前聊天 API。向量配置是可选增强，不负责总结和迁移。</p>
 <label className="block text-sm">模型模式<select className="my-2 min-h-11 w-full rounded-xl border p-2" value={custom?"custom":"follow"} onChange={event=>setCustom(event.target.value==="custom")}><option value="follow">跟随聊天模型</option><option value="custom">指定专用模型</option></select></label>
 {custom?<label className="block text-sm">专用模型名<input required aria-label="记忆整理模型名" maxLength={160} className="my-2 min-h-11 w-full rounded-xl border p-2" value={model} onChange={event=>setModel(event.target.value)}/></label>:<p className="my-3 break-words text-sm">实际调用：{props.chatModel||"尚未选择聊天模型"}</p>}
 {props.settings.legacyExtractModel&&!props.settings.extractModelConfigured&&<p className="my-3 text-xs">已兼容旧版默认模型设置，当前跟随聊天模型。原配置 {props.settings.legacyExtractModel} 已保留，可重新指定。</p>}
 <div className="mt-4 flex gap-3"><button type="submit" className="min-h-11 rounded-xl bg-black px-4 text-white">保存设置</button><button type="button" className="min-h-11 rounded-xl border px-4" onClick={props.onClose}>取消</button></div></form></dialog>;
}
