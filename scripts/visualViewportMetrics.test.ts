import assert from "node:assert/strict";
import { getVisualViewportMetrics } from "../src/features/viewport/visualViewport.ts";

const closed = getVisualViewportMetrics({
  innerHeight: 800,
  clientHeight: 800,
  visualViewport: { height: 800, offsetTop: 0 },
});
assert.deepEqual(closed, { appViewportHeight: 800, appViewportOffsetTop: 0, keyboardInset: 0 });

const keyboardOpen = getVisualViewportMetrics({
  innerHeight: 800,
  clientHeight: 800,
  visualViewport: { height: 480, offsetTop: 0 },
});
assert.deepEqual(keyboardOpen, { appViewportHeight: 480, appViewportOffsetTop: 0, keyboardInset: 320 });

const keyboardOpenWithOffset = getVisualViewportMetrics({
  innerHeight: 800,
  clientHeight: 800,
  visualViewport: { height: 450, offsetTop: 30 },
});
assert.deepEqual(keyboardOpenWithOffset, {
  appViewportHeight: 450,
  appViewportOffsetTop: 30,
  keyboardInset: 320,
});

const browserChromeOnly = getVisualViewportMetrics({
  innerHeight: 800,
  clientHeight: 800,
  visualViewport: { height: 748, offsetTop: 0 },
});
assert.equal(browserChromeOnly.appViewportHeight, 748);
assert.equal(browserChromeOnly.keyboardInset, 0);

const fallback = getVisualViewportMetrics({ innerHeight: 760, clientHeight: 740 });
assert.deepEqual(fallback, { appViewportHeight: 760, appViewportOffsetTop: 0, keyboardInset: 0 });

console.log("PASS VisualViewport metrics handle keyboard offsets, avoid toolbar false positives, and fall back to innerHeight");
