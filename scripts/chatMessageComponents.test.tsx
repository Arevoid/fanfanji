import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageList } from "../src/features/chat/components/MessageList";
import { QuotedMessagePreview } from "../src/features/chat/components/QuotedMessagePreview";
import type { Message } from "../src/types";

const makeMessage = (id: string, content: string, sender: Message["sender"] = "character"): Message => ({ id, characterId: "a", sender, content, timestamp: 1 });
const messages = [
  makeMessage("user", "普通文本", "user"),
  makeMessage("character", "多行\n文本"),
  makeMessage("sticker", "[表情]|笑脸|https://example.test/sticker.png"),
  makeMessage("image", "data:image/png;base64,abc"),
  makeMessage("voice", "[语音]|3|你好"),
  makeMessage("location", "[位置]|东京站"),
  makeMessage("file", "[文件]|笔记"),
  makeMessage("packet", "[红包]|8.88|恭喜发财"),
  makeMessage("transfer", "[转账]|10.00|午饭|false"),
  makeMessage("call", "[通话]|语音通话|00:30"),
];
const renderedIds: string[] = [];
const rendered = renderToStaticMarkup(
  <MessageList
  messages={messages}
  scrollRef={{ current: null }}
  className="flex-1 overflow-y-auto p-4 space-y-4 cv-messages-list chat-message-list"
  style={{ WebkitOverflowScrolling: "touch" }}
  contentClassName="message-content"
  header={<div className="message-header">header</div>}
    renderMessage={(message, index) => {
      renderedIds.push(message.id);
      return <div key={message.id} className={`message-${message.sender}`} data-index={index}>{message.content}</div>;
    }}
  >
    <div className="typing-anchor">typing</div>
    <div className="bottom-anchor">end</div>
  </MessageList>,
);
const normalQuote = renderToStaticMarkup(<QuotedMessagePreview message={makeMessage("q1", "引用文本", "user")} senderName="角色" onClear={() => undefined} closeIcon={<span>×</span>} />);
const fileQuote = renderToStaticMarkup(<QuotedMessagePreview message={makeMessage("q2", "[文件]|计划书")} senderName="角色" onClear={() => undefined} closeIcon={<span>×</span>} />);
const mediaQuote = renderToStaticMarkup(<QuotedMessagePreview message={makeMessage("q3", "[位置]|东京站")} senderName="角色" onClear={() => undefined} closeIcon={<span>×</span>} />);
const originalIds = messages.map((message) => message.id).join(",");
const renderedWindowIds: string[] = [];
const renderedWindowIndexes: number[] = [];
renderToStaticMarkup(
  <MessageList
    messages={messages}
    scrollRef={{ current: null }}
    className="chat-message-list"
    style={{}}
    renderWindowSize={3}
    renderMessage={(message, index) => {
      renderedWindowIds.push(message.id);
      renderedWindowIndexes.push(index);
      return <div key={message.id}>{message.content}</div>;
    }}
  >
    <div />
  </MessageList>,
);
const checks: Array<[string, boolean]> = [
  ["A user text", rendered.includes("普通文本")],
  ["B character text", rendered.includes("多行\n文本")],
  ["C group sender-compatible item callback", rendered.includes("message-character")],
  ["D system-compatible item callback", rendered.includes("message-character")],
  ["E multiline text", rendered.includes("多行\n文本")],
  ["F sticker passthrough", rendered.includes("[表情]|笑脸")],
  ["G image passthrough", rendered.includes("data:image/png")],
  ["H voice passthrough", rendered.includes("[语音]|3")],
  ["I location passthrough", rendered.includes("[位置]|东京站")],
  ["J file passthrough", rendered.includes("[文件]|笔记")],
  ["K red packet passthrough", rendered.includes("[红包]|8.88")],
  ["L transfer passthrough", rendered.includes("[转账]|10.00")],
  ["M call passthrough", rendered.includes("[通话]|语音通话")],
  ["N normal quote", normalQuote.includes("自己:") && normalQuote.includes("引用文本")],
  ["O special quote summary", fileQuote.includes("[文件]") && mediaQuote.includes("[媒体内容]")],
  ["P typing position", rendered.indexOf("typing-anchor") < rendered.indexOf("bottom-anchor")],
  ["Q sender layout data remains available", rendered.includes("message-user") && rendered.includes("message-character")],
  ["R avatar fallback remains renderer-owned", renderedIds.length === messages.length],
  ["S callback is called once per message", renderedIds.join(",") === originalIds],
  ["T regenerate callback remains renderer-owned", renderedIds.includes("character")],
  ["U delete callback remains renderer-owned", renderedIds.includes("user")],
  ["V key classes", rendered.includes("cv-messages-list chat-message-list") && normalQuote.includes("animate-fade-in")],
  ["W order is unchanged", renderedIds.join(",") === originalIds],
  ["X input array is unchanged", messages.map((message) => message.id).join(",") === originalIds],
  ["Y render window keeps latest messages", renderedWindowIds.join(",") === "packet,transfer,call"],
  ["Z render window preserves absolute indexes", renderedWindowIndexes.join(",") === "7,8,9"],
  ["AA window supports a header and content wrapper", rendered.includes("message-header") && rendered.includes("message-content")],
];

for (const [name, passed] of checks) {
  assert.equal(passed, true, name);
  console.log(`PASS ${name}`);
}
console.log(`${checks.length} chat message component checks passed`);
