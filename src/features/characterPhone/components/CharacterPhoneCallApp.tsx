import { ChevronRight, Delete, Grid3X3, PhoneCall, Star, Users } from "lucide-react";
import type { CharacterPhoneContact, CharacterPhoneRecord } from "../../../domain/characterPhone/types";

export type CharacterPhoneDialerTab = "all" | "missed";

const DIAL_PAD = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""],
] as const;

export function CharacterPhoneCallApp({
  phone,
  tab,
  phoneNumber,
  notice,
  onTabChange,
  onPhoneNumberChange,
  onPlaceCall,
  onOpenContact,
}: {
  phone: CharacterPhoneRecord;
  tab: CharacterPhoneDialerTab;
  phoneNumber: string;
  notice: string;
  onTabChange: (tab: CharacterPhoneDialerTab) => void;
  onPhoneNumberChange: (value: string) => void;
  onPlaceCall: (simLabel: string) => void;
  onOpenContact: (contact: CharacterPhoneContact) => void;
}) {
  const records = (phone.phoneCalls ?? []).map((record) => {
    const contact = phone.contacts.find((candidate) => candidate.id === record.contactId);
    return {
      ...record,
      displayName: contact?.remark || contact?.name || record.contactName,
      relation: contact?.relation || "通话记录",
      missed: record.direction === "missed",
    };
  });
  const visibleRecords = tab === "missed" ? records.filter((record) => record.missed) : records;
  const appendDigit = (digit: string) => onPhoneNumberChange(`${phoneNumber}${digit}`.slice(0, 18));
  const deleteDigit = () => onPhoneNumberChange(phoneNumber.slice(0, -1));

  return (
    <div className="relative -mx-5 flex h-full min-h-0 flex-col bg-[#fcfcfb] text-[#242424]">
      <div className="flex shrink-0 justify-center px-6 py-2">
        <div className="grid w-56 max-w-[70%] grid-cols-2 rounded-[18px] bg-neutral-100 p-0.5 text-lg font-semibold">
          {(["all", "missed"] as const).map((nextTab) => (
            <button key={nextTab} type="button" onClick={() => onTabChange(nextTab)} className={`rounded-[16px] py-2 transition-colors ${tab === nextTab ? "bg-[#def4e5] text-emerald-600" : "text-neutral-400"}`}>
              {nextTab === "all" ? "全部" : "未接"}
            </button>
          ))}
        </div>
      </div>
      <section className="min-h-0 flex-1 overflow-y-auto px-6" aria-label="通话记录">
        {visibleRecords.map((record) => (
          <button key={record.id} type="button" onClick={() => {
            if (record.number) return onPhoneNumberChange(record.number.replace(/\s/g, ""));
            const contact = phone.contacts.find((candidate) => candidate.id === record.contactId);
            if (contact) onOpenContact(contact);
          }} className="flex w-full items-center gap-3 border-b border-neutral-200/80 py-5 text-left">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[clamp(1.35rem,6vw,1.65rem)] font-medium tracking-tight text-neutral-900">{record.displayName}</span>
              <span className="mt-2 flex items-center gap-2 truncate text-sm text-neutral-400">
                <span className="flex h-5 min-w-5 items-center justify-center rounded bg-neutral-300 px-1 text-xs text-white">1</span>
                <span className={record.missed ? "text-rose-400" : "text-neutral-500"}>{record.direction === "missed" ? "未接来电" : record.direction === "incoming" ? "呼入" : "呼出"}</span>
                <span>· {record.relation}</span>
                {record.durationSeconds !== undefined && <span>· {Math.max(1, Math.round(record.durationSeconds / 60))} 分钟</span>}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3 text-lg text-neutral-300">
              <span>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(record.timestamp)}</span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700"><ChevronRight className="h-6 w-6" strokeWidth={2.8} /></span>
            </span>
          </button>
        ))}
        {visibleRecords.length === 0 && (
          <div className="mx-1 my-8 rounded-2xl border border-dashed border-neutral-200 bg-white/70 px-4 py-5 text-center">
            <p className="text-sm font-semibold text-neutral-500">{tab === "missed" ? "暂无未接来电" : "还没有属于这个角色的通话记录"}</p>
            <p className="mt-1 text-[10px] leading-5 text-neutral-400">通话记录只来自角色资料、已有关系或明确生活事件；没有依据时不会自动编造。</p>
          </div>
        )}
      </section>
      <section className="shrink-0 border-t border-neutral-200/80 px-5 pb-1 pt-1" aria-label="拨号键盘">
        <p className="h-6 truncate text-center text-lg font-medium tracking-[0.08em] text-neutral-700" aria-live="polite">{phoneNumber || " "}</p>
        <div className="grid grid-cols-3 gap-y-0.5">
          {DIAL_PAD.map(([digit, letters]) => <button key={digit} type="button" onClick={() => appendDigit(digit)} className="flex h-[clamp(42px,7vh,62px)] flex-col items-center justify-center rounded-2xl active:bg-neutral-100" aria-label={`输入${digit}`}><span className="text-[clamp(1.75rem,5vw,2.45rem)] font-medium leading-none tracking-tight">{digit}</span><span className="mt-0.5 h-4 text-sm font-medium tracking-wide text-[#8eac94]">{letters}</span></button>)}
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <button type="button" aria-label="更多拨号方式" className="flex h-12 w-12 items-center justify-center rounded-full text-neutral-800"><Grid3X3 className="h-7 w-7" /></button>
          <div className="grid flex-1 grid-cols-2 overflow-hidden rounded-full bg-[#2fbd59] text-white">
            {(["移动", "电信"] as const).map((simLabel, index) => <button key={simLabel} type="button" onClick={() => onPlaceCall(simLabel)} disabled={!phoneNumber} className={`flex h-[clamp(42px,6vh,52px)] items-center justify-center gap-2 text-[clamp(0.85rem,3.8vw,1.125rem)] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-45 ${index === 1 ? "border-l-2 border-white/90" : ""}`}><PhoneCall className="h-5 w-5" />{index + 1} {simLabel}</button>)}
          </div>
          <button type="button" onClick={deleteDigit} aria-label="删除号码" className="flex h-12 w-12 items-center justify-center rounded-full text-[#b7a878]"><Delete className="h-7 w-7" /></button>
        </div>
      </section>
      {notice && <p role="status" className="absolute bottom-[112px] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">{notice}</p>}
      <nav className="grid shrink-0 grid-cols-3 border-t border-neutral-200/80 px-8 pb-3 pt-2 text-sm" aria-label="电话底部导航">
        <button type="button" className="flex flex-col items-center gap-1 font-semibold text-[#2fbd59]"><PhoneCall className="h-8 w-8" />拨号</button>
        <button type="button" className="flex flex-col items-center gap-1 text-neutral-400"><Users className="h-8 w-8" />联系人</button>
        <button type="button" className="flex flex-col items-center gap-1 text-neutral-400"><Star className="h-8 w-8" />收藏</button>
      </nav>
    </div>
  );
}
