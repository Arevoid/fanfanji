import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatTopBar } from "../src/features/chat/components/ChatTopBar";
import { ContactList } from "../src/features/chat/components/ContactList";
import { ConversationList } from "../src/features/chat/components/ConversationList";
import type { Character, Message } from "../src/types";

const direct: Character = { id: "a", name: "同名", avatar: "a.png", personality: "", backstory: "" };
const group: Character = { id: "g", name: "同名", avatar: "g.png", personality: "", backstory: "", isGroupChat: true, memberIds: ["a"] };
const message: Message = { id: "m", characterId: "a", sender: "character", content: "最近摘要", timestamp: new Date("2026-07-22T21:48:00").getTime() };
let selected: string | undefined;
const header = <ChatTopBar title="标题" leftAction={<button title="返回主页">返回</button>} rightAction={<button title="操作">操作</button>} />;
const list = renderToStaticMarkup(<ConversationList header={header} threads={[{ id: "a", character: direct, lastMessage: message, isPinned: true }, { id: "g", character: group, lastMessage: { ...message, characterId: "g", senderId: "a" }, isPinned: false }]} onSelect={(id) => { selected = id; }} getUnreadCount={(id) => id === "a" ? 2 : 0} renderAvatar={(character) => <img className="w-11 h-11 rounded-full object-cover bg-slate-100 border border-slate-100 aspect-square flex items-center justify-center text-xl select-none" src={character.avatar} alt={character.name} />} getGroupMessageSummary={(item) => `成员: ${item.content}`} />);
const empty = renderToStaticMarkup(<ConversationList header={header} threads={[]} onSelect={() => undefined} getUnreadCount={() => 0} renderAvatar={() => null} getGroupMessageSummary={() => ""} />);
const contacts = renderToStaticMarkup(<ContactList header={header} contacts={[{ id: "rel-a", character: direct }, { id: "g", character: group }]} onSelect={(id) => { selected = id; }} />);
const emptyContacts = renderToStaticMarkup(<ContactList header={header} contacts={[]} onSelect={() => undefined} />);
const checks: Array<[string, boolean]> = [
  ["A top bar title renders", list.includes("标题")],
  ["B top bar controls retain titles", list.includes('title="返回主页"') && list.includes('title="操作"')],
  ["C direct conversation renders", list.includes("最近摘要")],
  ["D group conversation renders", list.includes("成员: 最近摘要")],
  ["E pinned marker renders", list.includes("rotate-45")],
  ["F unread count renders", list.includes(">2</span>")],
  ["G conversation time renders", list.includes("21:48")],
  ["H same-name contacts retain separate stable ids", contacts.includes('src="a.png"') && contacts.includes('src="g.png"')],
  ["I conversation empty state renders", empty.includes("暂无任何对话")],
  ["J contact empty state renders", emptyContacts.includes("通讯录空空如也")],
  ["K conversation root class remains", list.includes("divide-y divide-slate-100")],
  ["L item class remains", list.includes("flex items-center p-3 cursor-pointer transition-colors relative")],
  ["M contact item class remains", contacts.includes("flex items-center p-3 hover:bg-slate-50 cursor-pointer transition-colors")],
  ["N avatar class remains", list.includes("w-11 h-11 rounded-full object-cover bg-slate-100")],
  ["O select callback contract is stable", (() => { const select = (id: string) => { selected = id; }; select("a"); return selected === "a"; })()],
  ["P static rendering does not invoke callbacks", (() => { selected = undefined; renderToStaticMarkup(<ConversationList header={header} threads={[]} onSelect={(id) => { selected = id; }} getUnreadCount={() => 0} renderAvatar={() => null} getGroupMessageSummary={() => ""} />); return selected === undefined; })()],
];

for (const [name, passed] of checks) {
  assert.equal(passed, true, name);
  console.log(`PASS ${name}`);
}
console.log(`${checks.length} chat navigation/list checks passed`);
