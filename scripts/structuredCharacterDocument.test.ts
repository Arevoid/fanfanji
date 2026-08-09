import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStructuredCharacterDocument } from "../src/domain/import/structuredCharacterDocument";

const source = `作者：测试
↓人设部分。
<character_design_complex>
# 核心信息 (Core Information)
name: 步随影
age: 22
gender: Male
# 人物背景 (Background)
在缺爱的环境中长大。
# 性格与行为 (Personality & Behavior)
- 线上是热情话痨的小狗。
# 生活方式 (Lifestyle)
- 在大学读书，喜欢打游戏。
# 沟通特征 (Communication)
- 会主动分享生活，绝不冷战。
</character_design_complex>
↓世界书部分。
<world_view>
# 基础信息
世界名称: "却津市"
核心设定: "科技与市井烟火共生"
# 地理环境
- 第三食堂: "便宜量大"
<rule_setting_simple>
rule_name: 软件规范
rule_key: 软件功能,模型切换,系统报错
# 软件基础架构
- 文字聊天: 支持长短期记忆。
</rule_setting_simple>
# NSFW 设定
- 仅在相关语境触发。
`;

const parsed = parseStructuredCharacterDocument(source, "错误文件名.docx");
assert.equal(parsed.detectedSections, true);
assert.equal(parsed.name, "步随影");
assert.equal(parsed.age, 22);
assert.equal(parsed.gender, "Male");
assert.match(parsed.description, /人物背景/);
assert.match(parsed.description, /生活方式/);
assert.doesNotMatch(parsed.description, /热情话痨/);
assert.match(parsed.personality, /热情话痨/);
assert.match(parsed.personality, /主动分享生活/);
assert.doesNotMatch(parsed.personality, /第三食堂|NSFW/);
assert.ok(parsed.worldBookEntries.length >= 4);
assert.equal(parsed.worldBookEntries.some((entry) => entry.constant && /基础信息/.test(entry.comment)), true);
assert.equal(parsed.worldBookEntries.some((entry) => entry.keys.includes("第三食堂")), true);
assert.equal(parsed.worldBookEntries.some((entry) => entry.keys.includes("模型切换")), true);
assert.equal(parsed.worldBookEntries.some((entry) => /NSFW/i.test(entry.comment) && entry.position === "after_char"), true);

const plain = parseStructuredCharacterDocument("安静但温柔。", "普通角色.txt");
assert.equal(plain.detectedSections, false);
assert.equal(plain.name, "普通角色");
assert.equal(plain.personality, "安静但温柔。");
assert.equal(plain.worldBookEntries.length, 0);

const archivesSource = readFileSync(new URL("../src/components/AppArchives.tsx", import.meta.url), "utf8");
const worldBookSource = readFileSync(new URL("../src/components/AppWorldBook.tsx", import.meta.url), "utf8");
assert.match(archivesSource, /parseStructuredCharacterDocument\(text, file\.name\)/);
assert.match(archivesSource, /backstory: parsed\.description/);
assert.match(archivesSource, /characterBook = \{ entries: parsed\.worldBookEntries \}/);
assert.match(worldBookSource, /parsed\.worldBookEntries/);

console.log("PASS structured character document separates identity, description, personality, and World Book entries");
