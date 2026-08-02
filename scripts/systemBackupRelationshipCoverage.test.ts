import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
for (const key of [
  "phone_character_events",
  "phone_inner_voice_records",
  "phone_diary_translations",
  "phone_moment_generation_tasks",
  "phone_last_read_timestamps",
  "phone_initiated_chat_ids",
  "phone_identity_wallet_balances",
  "wechat_redpacket_statuses",
]) {
  assert.match(settings, new RegExp(`"${key}"`), `${key} must participate in system backup`);
}

console.log("system backup relationship coverage tests passed");
