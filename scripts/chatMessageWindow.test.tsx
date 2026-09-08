import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageList } from "../src/features/chat/components/MessageList";
import type { Message } from "../src/types";

const createMessages = (count: number): Message[] => Array.from({ length: count }, (_, index) => ({
  id: `chat-${index}`,
  characterId: "character-1",
  sender: index % 2 === 0 ? "user" : "character",
  content: `聊天记录 ${index}`,
  timestamp: index,
}));

const assertWindowedRender = (count: number) => {
  const messages = createMessages(count);
  let renderedCount = 0;
  let firstRenderedId = "";
  let lastRenderedIndex = -1;
  const markup = renderToStaticMarkup(
    <MessageList
      messages={messages}
      scrollRef={{ current: null }}
      className="chat-message-list"
      style={{}}
      renderWindowSize={120}
      renderMessage={(message, index) => {
        renderedCount += 1;
        if (renderedCount === 1) firstRenderedId = message.id;
        lastRenderedIndex = index;
        return <article data-message-id={message.id}>{message.content}</article>;
      }}
    >
      <div data-testid="chat-end" />
    </MessageList>,
  );
  assert.equal(renderedCount, 120, `${count.toLocaleString()}-message chat mounts only the bounded render window`);
  assert.equal(firstRenderedId, `chat-${count - 120}`);
  assert.equal(lastRenderedIndex, count - 1);
  assert.match(markup, /chat-end/);
};

assertWindowedRender(1_000);
assertWindowedRender(5_000);
assertWindowedRender(10_000);

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appChat, /<MessageList[\s\S]*renderWindowSize=\{120\}/);
assert.match(appChat, /messages=\{visibleChatMessages\}/);

console.log("PASS 1,000/5,000/10,000-message chat windows keep the complete data source while mounting 120 rows");
