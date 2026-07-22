import { strict as assert } from "node:assert";
import { buildUniqueCharacterOptions } from "../src/domain/worldbook/characterOptions";
import { getWorldBookLocationReferences } from "../src/domain/worldbook/locationReferences";
import type { Character, WorldBookEntry } from "../src/types";

const character = (id: string, name: string, remark?: string): Character => ({ id, name, remark, avatar: "", personality: "", backstory: "" });
const entry = (id: string, characterId: string | undefined, title: string, category: string, content = ""): WorldBookEntry => ({ id, characterId, title, category, content, timestamp: 1 });
const contactInstance = { ...character("contact-a", "同名"), isContactInstance: true };
const group = { ...character("group-a", "群聊"), isGroupChat: true };
const options = buildUniqueCharacterOptions([character("a", "同名"), character("a", "同名"), character("b", "同名"), character("c", "原名", "备注"), contactInstance, group]);
assert.equal(options.length, 3); assert.deepEqual(options.map((item) => item.id), ["a", "b", "c"]); assert.equal(options[0].label.includes("a"), true); assert.equal(options[1].label.includes("b"), true); assert.equal(options[2].label, "备注");
const entries = [entry("a", "a", "东京站", "地点"), entry("b", "b", "错误地点", "地点"), entry("g", "global", "全局公园", "场景", ""), entry("d", "a", "动作", "常规", "位置：站立"), entry("e", "a", "地址", "常规", "地址：东京都千代田区一丁目"), entry("f", "a", "重复", "地点", "")];
const locations = getWorldBookLocationReferences(entries, "a");
assert.equal(locations.includes("东京站"), true); assert.equal(locations.includes("全局公园"), true); assert.equal(locations.includes("错误地点"), false); assert.equal(locations.includes("站立"), false); assert.equal(locations.includes("东京都千代田区一丁目"), true); assert.equal(new Set(locations).size, locations.length); assert.deepEqual(getWorldBookLocationReferences([], "a"), []); assert.equal(getWorldBookLocationReferences(Array.from({ length: 20 }, (_, i) => entry(`${i}`, "a", `地点${i}站`, "地点")), "a").length, 15);
console.log("World Book options: 15 fixed acceptance checks passed");
