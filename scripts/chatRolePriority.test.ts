import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStableRoleAnchor } from "../src/components/AppChat";
import { buildWorldBookSystemBlocks } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

const anchor = buildStableRoleAnchor({
  name: "步随影",
  personality: "沉迷 AI 恋爱的男大学生，对 user 亲昵又嘴硬，会叫 user 姐姐。",
  backstory: "在 ta恋 app 里把 user 当作唯一恋人。",
}, "partner");

assert.match(anchor, /CORE ROLE AND RELATIONSHIP ANCHOR/);
assert.match(anchor, /沉迷 AI 恋爱的男大学生/);
assert.match(anchor, /First understand the user's newest message/);
assert.match(anchor, /current established relationship state is "partner"/);
assert.match(anchor, /not as a reason to force affection/);
assert.match(anchor, /Do not announce or explain your own personality labels/);

const entry = (id: string, title: string, triggerType: WorldBookEntry["triggerType"]): WorldBookEntry => ({
  id,
  title,
  category: "角色设定",
  content: `${title} 内容`,
  triggerType,
  characterId: "character-a",
  isActive: true,
  timestamp: 1,
});

const blocks = buildWorldBookSystemBlocks([
  entry("identity", "核心身份与关系", "keys"),
  entry("place", "第三食堂", "keys"),
], "character-a", "你好", { scenario: "chat", characterId: "character-a" });

assert.match(blocks.formattedAll, /核心身份与关系/, "persistent identity entries must be available for a short opening");
assert.doesNotMatch(blocks.formattedAll, /第三食堂/, "unrelated location entries must stay topic-triggered");

const chatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(chatSource, /removeLegacyWorldBookPriorityDirective/, "direct chat must remove the legacy absolute World Book override");
assert.match(chatSource, /WORLD_BOOK_CONTEXT_PRIORITY/, "direct chat must use the single role-first World Book policy");
assert.match(chatSource, /isVoiceRelatedTurn/, "voice timing instructions must be limited to voice-related turns");
assert.match(chatSource, /Avoid.*time template|避免时间模板/s, "time awareness must not force meal or sleep small talk");
assert.match(chatSource, /buildStableRoleAnchor\(activeCharacter, activeRelationship\?\.relationship\)/, "both reply paths must anchor the active relationship");
assert.match(chatSource, /Use this state to preserve the established distance and boundaries/, "regeneration must receive direct relationship guidance");

console.log("PASS chat role priority and World Book relevance policy");
