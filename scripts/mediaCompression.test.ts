import assert from "node:assert/strict";
import {
  compressImageBlob,
  compressImageAssets,
  formatMediaCompressionResult,
} from "../src/core/storage/mediaCompression";

const source = new Blob(["not-a-raster-image"], { type: "image/png" });
const unchanged = await compressImageBlob(source);
assert.equal(unchanged, source, "non-browser environments must keep the original Blob");

const result = await compressImageAssets([]);
assert.equal(result.processed, 0);
assert.equal(result.compressed, 0);
assert.match(formatMediaCompressionResult(result), /未发现可进一步压缩/);

console.log("media compression safety tests passed");
