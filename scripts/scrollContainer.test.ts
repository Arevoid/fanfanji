import assert from "node:assert/strict";
import { scrollContainerToBottom } from "../src/features/viewport/scrollContainer.ts";

const immediate = { scrollHeight: 900, clientHeight: 300, scrollTop: 125 };
scrollContainerToBottom(immediate);
assert.equal(immediate.scrollTop, 600);

let scrollOptions: ScrollToOptions | undefined;
const smooth = {
  scrollHeight: 700,
  clientHeight: 250,
  scrollTop: 0,
  scrollTo: (options: ScrollToOptions) => {
    scrollOptions = options;
  },
};
scrollContainerToBottom(smooth, "smooth");
assert.deepEqual(scrollOptions, { top: 450, behavior: "smooth" });
assert.equal(smooth.scrollTop, 0);

const short = { scrollHeight: 100, clientHeight: 300, scrollTop: 20 };
scrollContainerToBottom(short);
assert.equal(short.scrollTop, 0);

console.log("PASS chat bottom scrolling is confined to the overflow container");
