import assert from "node:assert/strict";
import { getWorldBookLocationReferences } from "../src/domain/worldbook/locationReferences";
import type { WorldBookEntry } from "../src/types";

const base = (id: string, overrides: Partial<WorldBookEntry> = {}): WorldBookEntry => ({
  id,
  title: id,
  category: "地点",
  content: `地点：${id}`,
  timestamp: 1,
  triggerType: "constant",
  ...overrides,
});

const entries = [
  base("active", { title: "中央公园" }),
  base("inactive", { title: "废弃车站", isActive: false }),
  base("other-character", { title: "别人的医院", characterId: "character-b" }),
  base("identity-a", { title: "身份A住所", scope: { kind: "identity", userIdentityId: "identity-a" } }),
  base("identity-b", { title: "身份B住所", scope: { kind: "identity", userIdentityId: "identity-b" } }),
  base("relation-a", {
    title: "关系A办公室",
    scope: { kind: "relationship", relationId: "relation-a", characterId: "character-a", userIdentityId: "identity-a" },
  }),
];

assert.deepEqual(
  getWorldBookLocationReferences(entries, "character-a", 15, {
    scenario: "chat",
    characterId: "character-a",
    userIdentityId: "identity-a",
    relationId: "relation-a",
  }),
  ["中央公园", "active", "身份A住所", "identity-a", "关系A办公室", "relation-a"],
);

assert.deepEqual(
  getWorldBookLocationReferences(entries, "character-a", 15, {
    scenario: "chat",
    characterId: "character-a",
    userIdentityId: "identity-b",
    relationId: "relation-b",
  }),
  ["中央公园", "active", "身份B住所", "identity-b"],
);

console.log("PASS WorldBook auxiliary location references honor active, character, identity, and relationship visibility");
