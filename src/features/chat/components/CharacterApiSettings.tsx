import {useState} from "react";
import {Eye,EyeOff,RefreshCw} from "lucide-react";
import type {ApiPreset,CharacterApiConfig,UserSettings,UserSettingsUpdate} from "../../../types";
import {createId} from "../../../core/id/createId";
import {apiFetchModels} from "../../../utils/apiHelper";
import {ChatSettingsSwitch} from "./ChatSettingsSwitch";

export function CharacterApiSettings({global,value,onChange,onSave,onSaveGlobal}:{global:UserSettings;value?:CharacterApiConfig;onChange:(value:CharacterApiConfig)=>void;onSave:()=>unknown;onSaveGlobal?:(update:UserSettingsUpdate)=>boolean|void}){
 const [showKey,setShowKey]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[models,setModels]=useState<string[]>([]);
 const config=value??{enabled:false};
 const inherited={name:global.apiPresets?.find(p=>p.id===global.activeApiPresetId)?.name||"独立配置",apiEndpoint:global.apiEndpoint||"",apiKey:global.apiKey||"",selectedModel:global.selectedModel||"",apiTemperature:global.apiTemperature??.7,streamCompatible:Boolean(global.streamCompatible)};
 const selected=config.presetId?global.apiPresets?.find(p=>p.id===config.presetId):config.custom;
 const fields=config.enabled?selected??inherited:inherited;
 const edit=(patch:Partial<Omit<ApiPreset,"id">>)=>{onChange({enabled:true,custom:{...fields,...patch}});setNotice("");};
 const input="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-60";
 const row="space-y-1.5 px-4 py-3 text-[12px] font-medium text-[var(--text-secondary)]";
 const card="settings-card overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_2px_12px_rgba(0,0,0,0.06)] divide-y divide-[var(--divider)]";
 return <section aria-label="角色API设置" className="space-y-3 text-left text-sm text-[var(--text-primary)]">
  <div className={`${card} flex items-center justify-between p-4`}><span>使用角色独立 API</span><ChatSettingsSwitch label="使用角色独立API" checked={config.enabled} onChange={enabled=>onChange({...config,enabled,...(enabled&&!config.custom&&!config.presetId?(global.apiPresets?.some(p=>p.id===global.activeApiPresetId)?{presetId:global.activeApiPresetId}:{custom:inherited}): {})})}/></div>
  <fieldset disabled={!config.enabled||busy} className="space-y-3 disabled:opacity-60">
   <div className="space-y-3"><div className="px-1 text-[14px] leading-5 text-[#999]">当前模型配置</div><div className={`${card} p-4`}><select aria-label="角色API预设" className={input} value={config.enabled?config.presetId||"custom":global.activeApiPresetId||"custom"} onChange={e=>{const id=e.target.value;onChange(id==="custom"?{enabled:true,custom:{...fields}}:{enabled:true,presetId:id});setNotice("");setModels([]);}}><option value="custom">角色独立配置</option>{global.apiPresets?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}{config.presetId&&!selected&&<option value={config.presetId}>预设已删除，请重新选择</option>}</select></div></div>
   <div className="px-1 pt-1 text-[14px] leading-5 text-[#999]">基本信息</div><div className={card}>
    <label className={`block ${row}`}><span className="block">配置名称</span><input aria-label="角色API配置名称" className={input} value={fields.name} onChange={e=>edit({name:e.target.value})}/></label>
    <label className={`block ${row}`}><span className="block">API 地址（Endpoint）</span><input aria-label="角色API地址" autoComplete="off" placeholder="留空使用 Gemini 原生接口" className={`${input} font-mono`} value={fields.apiEndpoint} onChange={e=>edit({apiEndpoint:e.target.value})}/></label>
    <div className={row}><label htmlFor="character-api-key">API 密钥（Key）</label><div className="relative"><input id="character-api-key" aria-label="角色API密钥" autoComplete="off" type={showKey?"text":"password"} className={`${input} pr-10 font-mono`} value={fields.apiKey} onChange={e=>edit({apiKey:e.target.value})}/><button type="button" aria-label={showKey?"隐藏角色API密钥":"显示角色API密钥"} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center" onClick={()=>setShowKey(!showKey)}>{showKey?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div></div>
    <div className={row}><div className="flex items-center justify-between"><label htmlFor="character-api-model">模型选择（Model）</label><button type="button" disabled={busy} className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)]" onClick={async()=>{setBusy(true);setNotice("");try{if(!fields.apiKey.trim())throw new Error("请先填写密钥");const list=await apiFetchModels({apiKey:fields.apiKey,apiEndpoint:fields.apiEndpoint});setModels(list);setNotice(list.length?`已获取 ${list.length} 个模型`:"接口未返回模型，请手动填写。");}catch{setNotice("拉取失败，请检查当前配置，也可手动填写模型名。");}finally{setBusy(false);}}}><RefreshCw className={`h-3 w-3 ${busy?"animate-spin":""}`}/>拉取模型列表</button></div><input id="character-api-model" aria-label="角色API模型" list="character-api-models" className={input} value={fields.selectedModel} onChange={e=>edit({selectedModel:e.target.value})}/><datalist id="character-api-models">{models.map(m=><option key={m} value={m}/>)}</datalist></div>
   </div>
   <div className="px-1 pt-1 text-[14px] leading-5 text-[#999]">高级设置</div>
   <div className={card}>
    <div className={row}><div className="mb-2 flex items-center justify-between"><label htmlFor="character-api-temperature">API 温度（Temperature）</label><span className="text-sm font-semibold text-[var(--text-primary)]">{fields.apiTemperature.toFixed(1)}</span></div><input id="character-api-temperature" aria-label="角色API温度" type="range" min="0" max="2" step="0.1" className="w-full accent-[var(--text-primary)]" value={fields.apiTemperature} onChange={e=>edit({apiTemperature:Number(e.target.value)})}/></div>
    <div className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3"><div><h4 className="text-sm font-medium">流式兼容模式</h4><p className="mt-0.5 text-xs text-[var(--text-tertiary)]">开启后兼容流式数据输出格式</p></div><ChatSettingsSwitch label="角色API流式兼容" checked={fields.streamCompatible} onChange={streamCompatible=>edit({streamCompatible})}/></div>
   </div>
  </fieldset>
  {config.enabled&&!config.presetId&&onSaveGlobal&&<button type="button" className="min-h-11 w-full rounded-xl border border-[var(--border)] px-3" onClick={()=>{if(!fields.apiKey.trim()||!fields.selectedModel.trim()){setNotice("请先填写密钥和模型。");return;}const preset={...fields,id:createId("api-preset"),name:fields.name.trim()||"角色配置"};const saved=onSaveGlobal(previous=>({...previous,apiPresets:[...(previous.apiPresets||[]),preset]}));if(saved===false){setNotice("共享预设未保存，请重试。");return;}onChange({enabled:true,presetId:preset.id});setNotice("已存入共享预设，全局当前使用的 API 未改变。");}}>存为共享预设</button>}
  {notice&&<p role="status" className="text-xs leading-5 text-[var(--text-secondary)]">{notice}</p>}
  <button type="button" disabled={busy} onClick={()=>void onSave()} className="min-h-11 w-full rounded-xl bg-[var(--button-primary-bg)] px-4 py-3 text-sm font-medium text-[var(--button-primary-text)]">保存角色API</button>
 </section>;
}
