import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatTextWithLinks } from "../src/features/chat/components/ChatTextWithLinks";

const markup = renderToStaticMarkup(<ChatTextWithLinks text="打开 https://www.zhihu.com/question/2086839765966348416/answer/2086974525695173972。" />);
assert.match(markup, /<a[^>]+href="https:\/\/www\.zhihu\.com\/question\/2086839765966348416\/answer\/2086974525695173972"/);
assert.match(markup, /target="_blank"/);
assert.match(markup, />https:\/\/www\.zhihu\.com\/question\/2086839765966348416\/answer\/2086974525695173972<\/a>/);
assert.match(markup, /。$/);
assert.equal(renderToStaticMarkup(<ChatTextWithLinks text="普通消息" />), "普通消息");
const cloudflareMarkup = renderToStaticMarkup(<ChatTextWithLinks text={'<!doctype html><html><div id="cf-error-details">You have been blocked by Cloudflare</div><script>window.x=1</script></html>'} />);
assert.doesNotMatch(cloudflareMarkup, /cf-error-details|<html|<script|Cloudflare/iu);
assert.match(cloudflareMarkup, /\u7f51\u9875\u8bbf\u95ee\u53d7\u9650/iu);
const gatewayMarkup = renderToStaticMarkup(<ChatTextWithLinks text={'<html><body>502 Bad Gateway</body></html>'} />);
assert.doesNotMatch(gatewayMarkup, /<html|<body/iu);
assert.match(gatewayMarkup, /\u7f51\u9875\u8fd4\u56de\u4e86\u5f02\u5e38\u5185\u5bb9/iu);
console.log("PASS chat URL rendering, direct navigation attributes, and long-link punctuation handling");

