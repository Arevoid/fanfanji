/** Controlled component benchmark against the checked-in pre-fix MessageList.
 * Neither edits the checkout nor uses a user profile. Timings are indicative;
 * DOM counts, scope and dataset are the reproducible acceptance conditions. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";
import assert from "node:assert/strict";
const baselineSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const baseline = execFileSync("git", ["show", `${baselineSha}:src/features/chat/components/MessageList.tsx`], { encoding: "utf8" });
const compiled = await transform(baseline.replace('import { useEffect, useRef, useState } from "react";', 'import React from "/node_modules/.vite/deps/react.js"; const { useEffect, useRef, useState } = React;')
  .replace('from "./MessageItem"', 'from "/src/features/chat/components/MessageItem.tsx"'), { loader: "tsx", jsx: "transform", format: "esm" });
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.resolve("../browser-test-runtime/node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const results: unknown[] = [];
try {
  for (const count of [1000, 5000, 10000]) for (const mode of ["baseline", "current"]) {
    const context = await browser.newContext({ viewport: { width: 430, height: 850 } }); await context.addInitScript("window.__name = x => x"); const page = await context.newPage();
    await page.route("**/__chatBaseline.js", (r: any) => r.fulfill({ contentType: "text/javascript", body: compiled.code }));
    await page.route("**/__chatBenchmark", (r: any) => r.fulfill({ contentType: "text/html", body: '<html><body style="margin:0"><div id="root"></div></body></html>' }));
    await page.goto("http://127.0.0.3:3103/__chatBenchmark");
    const initialMs = await page.evaluate(async ({ count, mode }: { count: number; mode: string }) => {
      const refreshPath = "/@react-refresh", reactPath = "/node_modules/.vite/deps/react.js", domPath = "/node_modules/.vite/deps/react-dom_client.js";
      const RefreshRuntime = (await import(/* @vite-ignore */ refreshPath)).default; RefreshRuntime.injectIntoGlobalHook(window);
      Object.assign(window, { $RefreshReg$: () => {}, $RefreshSig$: () => (type: unknown) => type, __vite_plugin_react_preamble_installed__: true });
      const React = (await import(/* @vite-ignore */ reactPath)).default, { createRoot } = (await import(/* @vite-ignore */ domPath)).default;
      const listPath = mode === "baseline" ? "/__chatBaseline.js" : "/src/features/chat/components/MessageList.tsx";
      const { MessageList } = await import(/* @vite-ignore */ listPath);
      const messages = Array.from({ length: count }, (_, i) => ({ id: `m-${i}`, characterId: "synthetic", timestamp: i, sender: i % 2 ? "user" : "character", content: "合成聊天内容 ".repeat(i % 5 + 1) }));
      function Harness() { const ref = React.useRef(null); return React.createElement(MessageList, { messages, scrollRef: ref, style: { height: "800px", overflow: "auto" }, className: "scroller", renderMessage: (row: any) => React.createElement("article", { "data-benchmark-row": row.id, style: { padding: "10px" } }, row.content) }, null); }
      const start = performance.now(); createRoot(document.getElementById("root")).render(React.createElement(Harness));
      await new Promise<void>(resolve => { const wait = () => document.querySelector("article") ? requestAnimationFrame(() => requestAnimationFrame(() => resolve())) : requestAnimationFrame(wait); wait(); });
      return performance.now() - start;
    }, { count, mode });
    const initialRows = await page.locator("article").count();
    for (let i = 0; i < 9; i++) {
      if (mode === "current") { await page.locator(".scroller").evaluate((e: HTMLElement) => { e.scrollTop = 0; }); const button = page.getByRole("button", { name: /查看更早/ }); if (await button.count()) await button.click(); }
      else { await page.locator(".scroller").evaluate((e: HTMLElement) => { e.scrollTop = e.scrollHeight; }); await page.waitForTimeout(20); await page.locator(".scroller").evaluate((e: HTMLElement) => { e.scrollTop = 0; }); }
      await page.waitForTimeout(40);
    }
    const afterNineBatchesRows = await page.locator("article").count();
    if (mode === "current") { assert.equal(initialRows, 50); assert.ok(afterNineBatchesRows <= 150); }
    results.push({ count, mode, initialRows, afterNineBatchesRows, initialRenderTwoFramesMs: Math.round(initialMs * 10) / 10 });
    await context.close();
  }
} finally { await browser.close(); }
const report = { baselineSha, syntheticOnly: true, note: "Same machine and renderer; component work only, excludes network/storage/model latency. Single runs are not statistical latency guarantees.", results };
const output = path.resolve("../../outputs/chat-performance-20261023"); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "baseline-comparison.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
