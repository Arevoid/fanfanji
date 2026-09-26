import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatTextWithLinks } from "../src/features/chat/components/ChatTextWithLinks";

const markup = renderToStaticMarkup(<ChatTextWithLinks text="打开 https://www.zhihu.com/question/2086839765966348416/answer/2086974525695173972。" />);
assert.match(markup, /<a[^>]+href="https:\/\/www\.zhihu\.com\/question\/2086839765966348416\/answer\/2086974525695173972"/);
assert.match(markup, /target="_blank"/);
assert.match(markup, />https:\/\/www\.zhihu\.com\/question\/2086839765966348416\/answer\/2086974525695173972<\/a>/);
assert.match(markup, /。$/);
assert.equal(renderToStaticMarkup(<ChatTextWithLinks text="普通消息" />), "普通消息");
console.log("PASS chat URL rendering, direct navigation attributes, and long-link punctuation handling");

