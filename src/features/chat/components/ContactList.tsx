import type { ReactNode } from "react";
import { Users } from "lucide-react";
import type { Character } from "../../../types";

export interface ContactListItem { id: string; character: Character; subtitle?: string; }

interface ContactListProps {
  header: ReactNode;
  contacts: readonly ContactListItem[];
  onSelect: (relationId: string) => void;
}

export function ContactList({ header, contacts, onSelect }: ContactListProps) {
  return (
    <div className="divide-y divide-[var(--divider)] bg-[var(--surface)] text-[var(--text-primary)]">
      {header}
      {contacts.length === 0 ? (
        <div className="text-center py-20 px-4">
          <div className="w-12 h-12 bg-[var(--surface-muted)] rounded-full flex items-center justify-center text-[var(--text-tertiary)] mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-xs font-bold text-[var(--text-primary)]">通讯录空空如也</h4>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1 max-w-xs mx-auto leading-relaxed">
            暂无好友。请点击右上角“+”号直接从档案馆添加已创建的角色，或到桌面打开“档案馆”新建！
          </p>
        </div>
      ) : (
        contacts.map(({ id, character, subtitle }) => (
          <div key={id} onClick={() => onSelect(id)} className="flex items-center p-3 hover:bg-[var(--surface-muted)] cursor-pointer transition-colors">
            <img src={character.avatar} alt={character.name} className="w-11 h-11 rounded-full object-cover mr-3 bg-[var(--surface-muted)] border border-[var(--border)] shrink-0 aspect-square" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">
                {character.remark || character.name}
                {character.remark && <span className="text-[10px] font-normal text-[var(--text-tertiary)] ml-1.5">({character.name})</span>}
                {subtitle && <span className="text-[10px] font-normal text-[var(--text-tertiary)] ml-1.5">{subtitle}</span>}
              </h4>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
