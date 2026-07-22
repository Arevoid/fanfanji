import type { ReactNode } from "react";
import { Users } from "lucide-react";
import type { Character } from "../../../types";

interface ContactListProps {
  header: ReactNode;
  contacts: readonly Character[];
  onSelect: (characterId: string) => void;
}

export function ContactList({ header, contacts, onSelect }: ContactListProps) {
  return (
    <div className="divide-y divide-slate-100">
      {header}
      {contacts.length === 0 ? (
        <div className="text-center py-20 px-4">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-xs font-bold text-slate-700">通讯录空空如也</h4>
          <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            暂无好友。请点击右上角“+”号直接从档案馆添加已创建的角色，或到桌面打开“档案馆”新建！
          </p>
        </div>
      ) : (
        contacts.map((character) => (
          <div key={character.id} onClick={() => onSelect(character.id)} className="flex items-center p-3 hover:bg-slate-50 cursor-pointer transition-colors">
            <img src={character.avatar} alt={character.name} className="w-10 h-10 rounded-full object-cover mr-3 bg-slate-100 border border-slate-100 shrink-0 aspect-square" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-800 truncate">
                {character.remark || character.name}
                {character.remark && <span className="text-[10px] font-normal text-slate-400 ml-1.5">({character.name})</span>}
              </h4>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
