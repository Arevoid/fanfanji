import assert from "node:assert/strict";
import { isPreviewImageUrl, prepareImageFile, saveImageFile } from "../src/utils/imageSave";
const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
const file = await prepareImageFile({ load: async () => png });
assert.ok(file.name.endsWith(".png")); assert.equal(file.size, png.size); assert.equal(file.type, "image/png");
const unknownMime = await prepareImageFile({ load: async () => new Blob([await png.arrayBuffer()]) });
assert.equal(unknownMime.type, "image/png");
assert.ok(isPreviewImageUrl("https://test.invalid/photo.png")); assert.ok(!isPreviewImageUrl("javascript:alert(1)")); assert.ok(!isPreviewImageUrl("data:text/html,bad"));
await assert.rejects(() => prepareImageFile({ load: async () => new Blob(["<html>error</html>"], { type: "text/html" }) }));
await assert.rejects(() => prepareImageFile({ load: async () => null }));
const abort = new AbortController(); abort.abort(); await assert.rejects(() => prepareImageFile({ load: async () => png }, abort.signal), { name: "AbortError" });
let shares = 0, downloads = 0;
assert.equal(await saveImageFile(file, { canShare: () => true, share: async data => { shares++; assert.equal(data.files?.[0], file); }, download: () => downloads++ }), "shared");
assert.equal(downloads, 0);
assert.equal(await saveImageFile(file, { canShare: () => true, share: async () => { throw new DOMException("cancelled", "AbortError"); }, download: () => downloads++ }), "cancelled");
assert.equal(downloads, 0, "cancelling native share must not unexpectedly download");
assert.equal(await saveImageFile(file, { canShare: () => true, share: async () => { throw new DOMException("gesture expired", "NotAllowedError"); }, download: () => downloads++ }), "downloaded");
assert.equal(await saveImageFile(file, { download: () => downloads++ }), "downloaded"); assert.equal(downloads, 2); assert.equal(shares, 1);
const oldFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => { throw new TypeError("CORS"); };
  await assert.rejects(() => prepareImageFile({ src: "https://test.invalid/cors.png" }));
  globalThis.fetch = async () => new Response(png, { status: 200 });
  assert.equal((await prepareImageFile({ src: "https://test.invalid/a" })).size, png.size);
} finally { globalThis.fetch = oldFetch; }
console.log("PASS original image bytes/MIME, invalid content, cancellation, native share, download fallback and cross-origin failure");
