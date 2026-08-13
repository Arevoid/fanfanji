import assert from "node:assert/strict";
import { parseReadingDocument } from "../src/features/reading/library/readingParser";

const markdownText = `写在前面

# 第一章 雨夜
第一段文字。
第二段文字。

## 第二章 清晨
第三段文字。`;

const parsed = await parseReadingDocument({
  text: markdownText,
  format: "markdown",
  userIdentityId: "identity-a",
  bookId: "book-a",
});
assert.deepEqual(parsed.chapters.map((chapter) => chapter.title), ["正文", "第一章 雨夜", "第二章 清晨"]);
assert.equal(parsed.paragraphAnchors.length, 4);
assert.equal(parsed.chapters[1]?.firstParagraphAnchorId, parsed.paragraphAnchors[1]?.id);
assert.equal(parsed.chapters[1]?.lastParagraphAnchorId, parsed.paragraphAnchors[2]?.id);
for (const anchor of parsed.paragraphAnchors) {
  assert.equal(anchor.userIdentityId, "identity-a");
  assert.equal(anchor.bookId, "book-a");
  assert.ok(markdownText.slice(anchor.characterStart, anchor.characterEnd).trim().length > 0, "anchor offsets resolve into source text");
}

const repeated = await parseReadingDocument({
  text: markdownText,
  format: "markdown",
  userIdentityId: "identity-a",
  bookId: "book-a",
});
assert.deepEqual(repeated, parsed, "same book version produces stable chapter and paragraph anchors");

const otherBook = await parseReadingDocument({
  text: markdownText,
  format: "markdown",
  userIdentityId: "identity-a",
  bookId: "book-b",
});
assert.notEqual(otherBook.chapters[0]?.id, parsed.chapters[0]?.id, "anchors never collide across books");

const txt = await parseReadingDocument({
  text: "第一章 相遇\n她推开门。\n第2章 重逢\n雨停了。",
  format: "txt",
  userIdentityId: "identity-a",
  bookId: "txt-book",
});
assert.deepEqual(txt.chapters.map((chapter) => chapter.title), ["第一章 相遇", "第2章 重逢"]);
assert.equal(txt.paragraphAnchors.length, 2);

const titleThenChapter = await parseReadingDocument({
  text: "# 书名\n第一章 开始\n正文。",
  format: "markdown",
  userIdentityId: "identity-a",
  bookId: "heading-book",
});
assert.deepEqual(titleThenChapter.chapters.map((chapter) => chapter.title), ["第一章 开始"], "consecutive headings never create empty chapters");

console.log("reading chapter parser tests passed");
