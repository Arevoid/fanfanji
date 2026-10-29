import { useState } from "react";
import { ChevronRight, Plus, Search, UsersRound } from "lucide-react";
import type { Character, UserIdentity } from "../../../types";
import type { RelationshipNetworkMap, RelationshipNetworkNpc, RelationshipNetworkNode, RelationshipNetworkEdge } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { relationshipNeighbors } from "../../../domain/relationshipNetwork/relationshipPeople";

export function PersonAvatar({ avatar, name, large = false }: { avatar?: string; name: string; large?: boolean }) {
  const css = `${large ? "h-20 w-20 text-3xl" : "h-12 w-12 text-xl"} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#eeebe4]`;
  return <span className={css}>{avatar && /^(https?:|data:|blob:|\/)/i.test(avatar)
    ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : avatar || name.slice(0, 1)}</span>;
}

export function RelationshipPeopleView(props: {
  key?: string;
  character?: Character; map: RelationshipNetworkMap; characters: Character[]; npcs: RelationshipNetworkNpc[];
  identity: UserIdentity; onAdd: () => void;
  onOpen: (node: RelationshipNetworkNode, edges: RelationshipNetworkEdge[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const people = props.character ? relationshipNeighbors(props.map, props.character.id) : [];
  const categories = [...new Set(people.flatMap(item => item.edges.map(edge => edge.category).filter(Boolean)))];
  const rows = people.map(item => {
    const person = item.node.entityType === "character" ? props.characters.find(c => c.id === item.node.entityId)
      : item.node.entityType === "npc" ? props.npcs.find(n => n.id === item.node.entityId) : props.identity;
    return { ...item, person };
  }).filter(item => item.person && (filter === "all" || filter === item.node.entityType || item.edges.some(edge => `category:${edge.category}` === filter))
    && `${item.person.name} ${item.labels.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4" aria-label="关联人物列表">
    {props.character ? <section className="flex min-w-0 items-center gap-4 rounded-2xl border border-[#e7e2d9] bg-[#fffdfa] p-4">
      <PersonAvatar avatar={props.character.avatar} name={props.character.name} large />
      <div className="min-w-0"><h2 className="break-words text-base font-bold">{props.character.name}</h2>
        <p className="mt-1 text-xs text-[#857b6e]">{[props.character.gender, props.character.age !== "" && props.character.age != null ? `${props.character.age} 岁` : ""].filter(Boolean).join(" · ") || "基本资料未填写"}</p>
        <p className="mt-2 text-xs text-[#857b6e]">已关联 {people.length} 位人物</p></div>
    </section> : <p className="rounded-2xl bg-white p-5 text-center text-sm text-[#857b6e]">请先选择一个角色</p>}
    <div className="mt-5 flex items-center gap-2">
      <label className="min-w-0 flex-1"><span className="sr-only">筛选关联人物</span><select value={filter} onChange={event => setFilter(event.target.value)} className="max-w-full rounded-xl border border-[#e7e2d9] bg-[#fffdfa] px-3 py-2.5 text-sm">
        <option value="all">全部</option><option value="npc">NPC</option><option value="character">已有角色</option><option value="identity">我的身份</option>
        {categories.map(category => <option key={category} value={`category:${category}`}>{category}</option>)}
      </select></label>
      <button type="button" aria-label="添加关联人物" disabled={!props.character} onClick={props.onAdd} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#e7e2d9] bg-[#fffdfa] disabled:opacity-40"><Plus className="h-4 w-4" /></button>
    </div>
    <label className="relative mt-3 block"><Search className="absolute left-3 top-3 h-4 w-4 text-[#9b9287]" /><input aria-label="搜索关联人物" placeholder="搜索名字或关系" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-xl border border-[#e7e2d9] bg-[#fffdfa] py-2.5 pl-9 pr-3 text-sm" /></label>
    <div className="mt-3 space-y-3">{rows.map(({ node, edges, labels, person }) => {
      const info = person as Character | RelationshipNetworkNpc;
      return <button type="button" key={node.id} onClick={() => props.onOpen(node, edges)} className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-[#e7e2d9] bg-[#fffdfa] p-3.5 text-left shadow-sm">
        <PersonAvatar avatar={info.avatar} name={info.name} /><span className="min-w-0 flex-1"><strong className="block break-words text-sm">{info.name}</strong><small className="mt-1 block text-xs text-[#92877b]">{[info.gender, info.age !== "" && info.age != null ? `${info.age} 岁` : ""].filter(Boolean).join(" · ") || (node.entityType === "npc" ? "NPC" : node.entityType === "identity" ? "我的身份" : "角色")}</small></span>
        <span title={labels.join(" / ") || "关系未明确"} className="min-w-0 max-w-[35%] shrink-0 truncate whitespace-nowrap text-right text-xs text-[#857b6e]">{labels.join(" / ") || "关系未明确"}</span><ChevronRight className="h-4 w-4 shrink-0 text-[#9b9287]" />
      </button>;
    })}</div>
    {rows.length === 0 && <div className="mt-5 rounded-2xl border border-dashed border-[#e0d9cd] p-6 text-center text-xs leading-6 text-[#92877b]"><UsersRound className="mx-auto mb-2 h-6 w-6" />{people.length ? "没有符合筛选条件的人物" : "还没有关联人物，点击＋添加"}</div>}
  </main>;
}
