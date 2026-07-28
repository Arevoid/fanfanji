import assert from "node:assert/strict";
import type { Moment } from "../src/types";
import {
  getMomentComments,
  renderMomentContent,
  sanitizeMomentPublishText,
} from "../src/features/moments/services/momentContent";

const sticker = "[表情]|嫌弃|blob:https://fanfanji.example/7d8e4f2b";
const legacySticker = "|嫌弃|blob:https://fanfanji.example/7d8e4f2b";

assert.equal(
  sanitizeMomentPublishText(`训练完回来了\n${sticker}\n突然好想你啊`),
  "训练完回来了\n突然好想你啊",
  "new sticker payloads must not be publishable as Moment text",
);
assert.equal(
  renderMomentContent(`训练完回来了\n${legacySticker}\n突然好想你啊`),
  "训练完回来了\n突然好想你啊",
  "legacy payload fragments must not be rendered in historical Moments",
);
assert.equal(
  sanitizeMomentPublishText("今天😀训练结束，心情很好"),
  "今天😀训练结束，心情很好",
  "ordinary Unicode emoji remain normal text",
);

const moment = {
  id: "moment-1",
  authorName: "杨木槿",
  authorAvatar: "avatar",
  content: "正常动态",
  timestamp: 1,
  likes: [],
  comments: [
    { id: "sticker-comment", authorName: "饭饭", authorAvatar: "avatar", content: sticker, timestamp: 2 },
    { id: "text-comment", authorName: "饭饭", authorAvatar: "avatar", content: "辛苦啦😀", timestamp: 3 },
  ],
} as Moment;

assert.deepEqual(
  getMomentComments(moment).map((comment) => comment.content),
  ["辛苦啦😀"],
  "existing sticker comments must be hidden without deleting normal comments",
);

console.log("moment sticker sanitization tests passed");
