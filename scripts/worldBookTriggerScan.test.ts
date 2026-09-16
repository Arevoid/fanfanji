import assert from "node:assert/strict";
import { buildWorldBookScanText, normalizeWorldBookTriggerText, splitWorldBookKeywords, worldBookKeywordMatches, WORLD_BOOK_SCAN_MESSAGE_LIMIT } from "../src/domain/worldbook/worldBookTriggerScan";
import { buildWorldBookSystemBlocks } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

assert.equal(WORLD_BOOK_SCAN_MESSAGE_LIMIT, 6);
assert.equal(normalizeWorldBookTriggerText("  你好，WORLD！\nBOOK  "), "你好 world book");
assert.deepEqual(splitWorldBookKeywords("红 包, 付款；测试"), ["红", "包", "付款", "测试"]);
assert.equal(worldBookKeywordMatches("请发送红 包。", "红 包"), true);
assert.equal(worldBookKeywordMatches("这是付款信息", "支付"), false);
assert.equal(buildWorldBookScanText("当前", ["1", "2", "3", "4", "5", "6", "7"]), "当前\n2\n3\n4\n5\n6\n7");

const entry: WorldBookEntry = { id: "keyword", title: "付款规则", category: "常规", content: "仅关键词触发", timestamp: 1, triggerType: "keys", keywords: "付款,红包", characterId: "global" };
assert.equal(buildWorldBookSystemBlocks([entry], "character", "用户说：请发 红包", { scenario: "chat", characterId: "character" }).allTriggered.length, 1);
assert.equal(buildWorldBookSystemBlocks([entry], "character", "用户说：支付一下", { scenario: "chat", characterId: "character" }).allTriggered.length, 0);

console.log("PASS WorldBook trigger scanning is normalized and bounded to the documented recent window");
