import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QuotedMessagePreview } from "../src/features/chat/components/QuotedMessagePreview";
import { RedPacketCard } from "../src/features/chat/components/SpecialMessage/RedPacketCard";
import { TransferCard } from "../src/features/chat/components/SpecialMessage/TransferCard";
import type { Message } from "../src/types";

const message = (content: string): Message => ({ id: "m", characterId: "a", sender: "character", content, timestamp: 1 });
const quote = (content: string) => renderToStaticMarkup(<QuotedMessagePreview message={message(content)} senderName="沈安" onClear={() => undefined} closeIcon={<span>×</span>} />);
const packet = (status: "unclaimed" | "claimed" | "expired" | "refunded") => renderToStaticMarkup(<RedPacketCard amount="168.00" greeting="恭喜发财，大吉大利！" status={status} isSelf={false} onClick={() => undefined} />);
const transfer = (status: "pending" | "confirmed" | "refunded") => renderToStaticMarkup(<TransferCard amount="88.00" memo="晚餐" status={status} onClick={() => undefined} />);
const css = readFileSync("src/features/chat/components/SpecialMessage/specialMessage.css", "utf8");
const checks: Array<[string, boolean]> = [
  ["quote text", quote("明天晚上一起吃饭吗？").includes("明天晚上一起吃饭吗？")],
  ["quote image", quote("data:image/png;base64,x").includes("[图片]")],
  ["quote file", quote("[文件]|计划").includes("[文件]")],
  ["quote voice", quote("[语音]|3|你好").includes("[语音]")],
  ["quote packet", quote("[红包]|8.88|恭喜").includes("[红包]")],
  ["quote transfer", quote("[转账]|10|午饭|false").includes("[转账]")],
  ["quote empty fallback", quote(" ").includes("[消息]")],
  ["quote classes", quote("文本").includes("message-quote") && quote("文本").includes("composer-quote-preview")],
  ["packet pending", packet("unclaimed").includes("点击拆红包") && packet("unclaimed").includes('data-status="unclaimed"')],
  ["packet claimed", packet("claimed").includes("已领取")],
  ["packet refunded", packet("refunded").includes("已退回")],
  ["packet amount", packet("unclaimed").includes("¥168.00")],
  ["packet greeting", packet("unclaimed").includes("恭喜发财，大吉大利！")],
  ["packet payment class", packet("unclaimed").includes("redpacket-card")],
  ["transfer pending", transfer("pending").includes("待确认")],
  ["transfer confirmed", transfer("confirmed").includes("已收款")],
  ["transfer refunded", transfer("refunded").includes("已退回")],
  ["transfer amount", transfer("pending").includes("¥88.00")],
  ["transfer memo", transfer("pending").includes("晚餐")],
  ["transfer payment class", transfer("pending").includes("transfer-card")],
  ["quote CSS variables", ["--quote-bg", "--quote-border", "--quote-author", "--quote-content"].every((name) => css.includes(name))],
  ["packet CSS variables", ["--redpacket-bg", "--redpacket-title-color", "--redpacket-money-color", "--redpacket-status-color", "--redpacket-note-color"].every((name) => css.includes(name))],
  ["transfer CSS variables", ["--transfer-bg", "--transfer-title-color", "--transfer-money-color", "--transfer-status-color", "--transfer-note-color"].every((name) => css.includes(name))],
  ["no important rules", !css.includes("!important")],
];

for (const [name, passed] of checks) {
  assert.equal(passed, true, name);
  console.log(`PASS ${name}`);
}
console.log(`${checks.length} special message component checks passed`);
