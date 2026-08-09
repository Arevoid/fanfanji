import assert from "node:assert/strict";
import { parseStickerImportLine } from "../src/utils/stickerImport";

const cases = [
  ["开心|https://example.com/a.png", "开心"],
  ["开心+https://example.com/a.png", "开心"],
  ["开心 https://example.com/a.png", "开心"],
  ["开心：https://example.com/a.png", "开心"],
  ["开心:https://example.com/a.png", "开心"],
  ["开心https://example.com/a.png", "开心"],
] as const;

for (const [input, expectedName] of cases) {
  assert.deepEqual(parseStickerImportLine(input), {
    name: expectedName,
    url: "https://example.com/a.png",
  });
}

assert.deepEqual(parseStickerImportLine("https://example.com/plain.png"), {
  name: "",
  url: "https://example.com/plain.png",
});
assert.equal(parseStickerImportLine("不是链接"), null);
assert.deepEqual(parseStickerImportLine("名字 | https://example.com/a.png?next=http://b.test/x"), {
  name: "名字",
  url: "https://example.com/a.png?next=http://b.test/x",
});

console.log("sticker import parser tests passed");
