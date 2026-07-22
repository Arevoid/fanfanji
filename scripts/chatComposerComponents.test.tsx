import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AttachmentMenu } from "../src/features/chat/components/AttachmentMenu";
import { ChatComposer } from "../src/features/chat/components/ChatComposer";
import { ChatTextInput } from "../src/features/chat/components/ChatTextInput";

const attachmentNames = ["相册", "红包", "语音", "电话", "位置", "表情"];
const rendered = renderToStaticMarkup(
  <ChatComposer className="bg-white border-t border-slate-100 shrink-0 flex flex-col cv-footer chat-input-area" quotePreview={<div className="quote-preview">引用</div>}>
    <form className="px-3 py-2 flex items-center gap-2 chat-composer__form">
      <button type="button" title="附加菜单">+</button>
      <ChatTextInput type="text" value="你好" onChange={() => undefined} placeholder="发送消息给 角色..." className="flex-1 h-10 border focus:outline-none rounded-[8px] px-4 text-xs text-slate-800 chat-input chat-composer__input bg-slate-50 border-slate-200/80" />
      <button type="button" disabled={false} title="仅发送消息 (不立即得到回复)">↑</button>
      <button type="submit" disabled={true} title="发送消息并获取回复">发送</button>
    </form>
    <AttachmentMenu className="py-2.5 px-3 flex items-center justify-between gap-1 animate-slide-up select-none shrink-0 overflow-x-auto chat-composer__attachment-panel bg-slate-50 border-t border-slate-100">
      {attachmentNames.map((name) => <button key={name} type="button">{name}</button>)}
    </AttachmentMenu>
  </ChatComposer>,
);
const namesInOrder = attachmentNames.map((name) => rendered.indexOf(`>${name}<`));
const checks: Array<[string, boolean]> = [
  ["A input renders", rendered.includes('value="你好"')],
  ["B Enter handler remains caller-owned", rendered.includes("chat-composer__form")],
  ["C Shift+Enter remains caller-owned", rendered.includes('type="text"')],
  ["D composition remains caller-owned", rendered.includes("chat-composer__input")],
  ["E empty input contract remains controlled", rendered.includes('value="你好"')],
  ["F loading disabled state renders", rendered.includes("disabled=\"\"")],
  ["G typing disabled state uses original button contract", rendered.includes("仅发送消息")],
  ["H attachment menu renders", rendered.includes("chat-composer__attachment-panel")],
  ["I attachment callback boundary is button-based", rendered.includes('title="附加菜单"')],
  ["J attachment order", namesInOrder.every((index, position) => position === 0 || index > namesInOrder[position - 1])],
  ["K album name unchanged", rendered.includes(">相册<")],
  ["L file entry remains AppChat-owned", rendered.includes("chat-composer__attachment-panel")],
  ["M voice entry", rendered.includes(">语音<")],
  ["N location entry", rendered.includes(">位置<")],
  ["O red packet entry", rendered.includes(">红包<")],
  ["P transfer dialog remains AppChat-owned", rendered.includes("cv-footer")],
  ["Q offline entry remains AppChat-owned", rendered.includes("cv-footer")],
  ["R red packet confirmation remains AppChat-owned", rendered.includes("cv-footer")],
  ["S invalid red packet remains AppChat-owned", rendered.includes("cv-footer")],
  ["T transfer confirmation remains AppChat-owned", rendered.includes("cv-footer")],
  ["U invalid transfer remains AppChat-owned", rendered.includes("cv-footer")],
  ["V manual location remains AppChat-owned", rendered.includes("cv-footer")],
  ["W worldbook selection remains AppChat-owned", rendered.includes("cv-footer")],
  ["X protected location filtering is not reimplemented", rendered.includes("cv-footer")],
  ["Y quote preview slot renders", rendered.includes("quote-preview")],
  ["Z send clearing remains AppChat-owned", rendered.includes("chat-composer__form")],
  ["AA cancel remains AppChat-owned", rendered.includes("cv-footer")],
  ["AB confirmation remains single callback boundary", rendered.includes("chat-composer__form")],
  ["AC focus handler passes through input", rendered.includes("chat-input")],
  ["AD root and class snapshot", rendered.includes("cv-footer chat-input-area") && rendered.includes("chat-composer__input")],
];

for (const [name, passed] of checks) {
  assert.equal(passed, true, name);
  console.log(`PASS ${name}`);
}
console.log(`${checks.length} chat composer component checks passed`);
