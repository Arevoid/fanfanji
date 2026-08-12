import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(source, /const shouldOpenUpward = spaceBelow < Math\.min\(360, viewportHeight \* 0\.55\) && spaceAbove > spaceBelow/);
assert.match(source, /top: shouldOpenUpward \? undefined/);
assert.match(source, /bottom: shouldOpenUpward \? Math\.max/);
assert.match(source, /maxHeight: Math\.max\(160, viewportHeight - 20\)/);
assert.match(source, /chat-bubble-context-menu overflow-y-auto/);

const deleteIndex = source.indexOf("<span>删除</span>");
const multiDeleteIndex = source.indexOf("<span>多选删除</span>");
assert.ok(deleteIndex >= 0 && multiDeleteIndex > deleteIndex, "multi-select delete must appear immediately after ordinary delete");

assert.match(source, /const \[isMultiSelectDeleteMode, setIsMultiSelectDeleteMode\]/);
assert.match(source, /const \[selectedMessageIds, setSelectedMessageIds\]/);
assert.match(source, /wrapSelectableMessage\(messageElement/);
assert.match(source, /toggleMultiSelectedMessage\(msg\.id\)/);
assert.match(source, /chat-message-selection-toggle/);
assert.match(source, /chat-multi-select-toolbar/);
assert.match(source, /已选 \{selectedMessageIds\.size\} 条/);
assert.match(source, /currentChatMessages\.filter\(\(message\) => selectedMessageIds\.has\(message\.id\)\)/);
assert.match(source, /selectedMessages\.forEach\(\(message\) => deleteMessageAndLinkedImage\(message\.id\)\)/);
assert.match(source, /确定删除选中的 \$\{selectedMessages\.length\} 条消息吗/);

console.log("PASS chat bubble menu adaptive placement and multi-select deletion UI");
