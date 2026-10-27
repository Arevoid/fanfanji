import {useEffect,useRef,useState} from "react";
import type {Character} from "../../../types";
export function MemoryCharacterPicker(props:{open:boolean;characters:readonly Character[];selectedId:string;onSelect:(id:string)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [query,setQuery]=useState("");
 useEffect(()=>{if(props.open){setQuery("");dialog.current?.showModal();}else dialog.current?.close();},[props.open]);
 return <dialog ref={dialog} onCancel={props.onClose} aria-labelledby="memory-character-title" className="fixed inset-0 m-auto h-fit max-h-[80dvh] w-[calc(100%_-_2rem)] max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text-primary)] shadow-xl backdrop:bg-black/40">
  <div className="flex max-h-[80dvh] flex-col overflow-hidden"><header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2"><h2 id="memory-character-title" className="font-semibold">选择人物</h2><button type="button" aria-label="关闭人物选择" className="min-h-11 min-w-11 rounded-lg focus-visible:ring-2" onClick={props.onClose}>关闭</button></header>
  <div className="shrink-0 p-4"><input autoFocus aria-label="搜索人物" placeholder="搜索人物" value={query} onChange={event=>setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus-visible:ring-2" /></div>
  <div className="min-h-0 overflow-y-auto px-3 pb-4" role="list" aria-label="人物列表">{props.characters.filter(character=>`${character.remark||""} ${character.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(character=><button type="button" key={character.id} aria-pressed={props.selectedId===character.id} onClick={()=>props.onSelect(character.id)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-black/5 focus-visible:ring-2">
   <img src={character.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover"/><span className="min-w-0 flex-1 truncate text-sm">{character.remark||character.name}</span>{props.selectedId===character.id&&<span aria-label="当前人物">✓</span>}
  </button>)}{!props.characters.length&&<p className="p-4 text-sm">还没有可选择的角色。</p>}{props.characters.length>0&&!props.characters.some(character=>`${character.remark||""} ${character.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))&&<p className="p-4 text-sm">没有匹配的人物。</p>}</div></div>
 </dialog>;
}
