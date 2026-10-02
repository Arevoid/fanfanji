import assert from "node:assert/strict";
import { createFallbackWidget, normalizeCustomWidget, parseCustomWidgetJson } from "../src/domain/home/customWidgetSchema";

const calendar = createFallbackWidget("帮我生成一个 2x2 的日历小组件，显示农历");
assert.equal(calendar.size, "2x2");
assert.equal(calendar.blocks[0]?.type, "calendar");

const parsed = parseCustomWidgetJson("```json\n{" +
  "\"name\":\"测试\",\"size\":\"2x2\",\"blocks\":[{\"type\":\"text\",\"text\":\"你好\"}]" +
  "}\n```");
assert.equal(parsed?.name, "测试");

assert.equal(normalizeCustomWidget({ name: "坏数据", blocks: [{ type: "unknown" }] }), null);
assert.equal(normalizeCustomWidget({ name: "可修复", blocks: [{ type: "text", text: "  保留  " }], size: "99x99" })?.size, "2x2");

console.log("customWidgetSchema.test.ts passed");
