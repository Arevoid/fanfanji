import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual JSX keyboard handlers, without a provider or user data.
for (const [file, placeholder, callback] of [
  ["AppCinema.tsx", "讨论当前这一段…", "generateReply"],
  ["reading/ReadingReader.tsx", "讨论当前内容…", "sendDiscussionFromButton"],
]) {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler = "";
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node)) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      if (attrs.some(a => a.name.getText(source) === "placeholder" && a.initializer && ts.isStringLiteral(a.initializer) && a.initializer.text === placeholder)) {
        const attr = attrs.find(a => a.name.getText(source) === "onKeyDown");
        if (attr?.initializer && ts.isJsxExpression(attr.initializer)) handler = attr.initializer.expression!.getText(source);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(handler, file);
  let calls = 0;
  const run = new Function(callback, "discussionDraft", `return (${handler});`)(() => { calls++; }, "测试讨论");
  const event = (extra = {}) => ({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: false }, keyCode: 13, repeat: false, preventDefault() {}, ...extra });
  run(event()); assert.equal(calls, 1, `${file}: Enter requests a reply`);
  for (const extra of [{ shiftKey: true }, { nativeEvent: { isComposing: true } }, { keyCode: 229 }, { repeat: true }, { key: "a" }]) run(event(extra));
  assert.equal(calls, 1, `${file}: composition, newline and repeats must not send`);
}
console.log("Discussion keyboard submission passed (no API calls)");
