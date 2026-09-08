import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageList } from "../src/features/chat/components/MessageList";
import type { Message } from "../src/types";

const messages: Message[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: `offline-${index}`,
  characterId: "character-1",
  sender: index % 2 === 0 ? "user" : "character",
  content: `剧情记录 ${index}`,
  timestamp: index,
}));

let renderedCount = 0;
let firstRenderedId = "";
let lastRenderedId = "";
let firstRenderedIndex = -1;
let lastRenderedIndex = -1;
const markup = renderToStaticMarkup(
  <MessageList
    messages={messages}
    scrollRef={{ current: null }}
    className="offline-story-scroll"
    style={{}}
    contentClassName="offline-story-list"
    renderWindowSize={120}
    renderMessage={(message, index) => {
      renderedCount += 1;
      if (renderedCount === 1) {
        firstRenderedId = message.id;
        firstRenderedIndex = index;
      }
      lastRenderedId = message.id;
      lastRenderedIndex = index;
      return <article data-message-id={message.id}>{message.content}</article>;
    }}
  >
    <div data-testid="offline-story-end" />
  </MessageList>,
);

const offlineSource = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.equal(renderedCount, 120, "10,000-message offline story mounts only the bounded render window");
assert.equal(firstRenderedId, "offline-9880");
assert.equal(lastRenderedId, "offline-9999");
assert.equal(firstRenderedIndex, 9880);
assert.equal(lastRenderedIndex, 9999);
assert.match(markup, /offline-story-list/);
assert.match(offlineSource, /<MessageList/);
assert.match(offlineSource, /messages=\{visibleStoryMessages\}/);
console.log("PASS offline story window keeps 10,000-message data source while mounting 120 rows");
