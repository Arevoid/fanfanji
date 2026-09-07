import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppArchives.tsx", import.meta.url), "utf8");

assert.match(source, /accept="\.png,\.txt,\.docx"/, "档案馆人设导入只开放 PNG、TXT 和 DOCX");
assert.doesNotMatch(source, /const isJson = file\.name\.toLowerCase\(\)\.endsWith\("\.json"\)/, "档案馆不再检测 JSON 人设文件");
assert.doesNotMatch(source, /else if \(isJson\)/, "档案馆不再解析 JSON 人设文件");
assert.match(source, /暂不支持 JSON 人设导入/, "选择 JSON 时给出明确提示");

console.log("PASS archive character import disables standalone JSON support");
