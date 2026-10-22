/** Opt-in: fresh synthetic browser contexts only. Never uses a browser profile,
 * user backup, provider credentials or a model API. Requires dev server :3103.
 * PLAYWRIGHT_MODULE may point to an existing local Playwright installation. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const runtime = process.env.PLAYWRIGHT_MODULE || path.resolve("../browser-test-runtime/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-gpu"] });
const output = path.resolve("../../outputs/chat-history-ui-compact-20261023"); fs.mkdirSync(output, { recursive: true });
const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), syntheticOnly: true, modelRequests: 0, cases: [] };
try {
  // Isolated component test provides deterministic incoming/edit/delete controls
  // without adding any production developer globals or messaging side effects.
  const context = await browser.newContext({ viewport: { width: 430, height: 850 } });
  await context.addInitScript("window.__name = (value) => value;");
  const page = await context.newPage();
  await page.route("**/chat-window-acceptance", (route: any) => route.fulfill({ contentType: "text/html", body: '<html><body style="margin:0"><div id="root"></div><script type="module" src="/@vite/client"></script></body></html>' }));
  await page.goto("http://127.0.0.3:3103/chat-window-acceptance");
  await page.evaluate(async () => {
    const refreshPath = "/@react-refresh", reactPath = "/node_modules/.vite/deps/react.js", domPath = "/node_modules/.vite/deps/react-dom_client.js", listPath = "/src/features/chat/components/MessageList.tsx";
    const RefreshRuntime = (await import(/* @vite-ignore */ refreshPath)).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    Object.assign(window, { $RefreshReg$: () => {}, $RefreshSig$: () => (type: unknown) => type, __vite_plugin_react_preamble_installed__: true });
    const React = (await import(/* @vite-ignore */ reactPath)).default;
    const { createRoot } = (await import(/* @vite-ignore */ domPath)).default;
    const { MessageList } = await import(/* @vite-ignore */ listPath);
    const rows = Array.from({ length: 10000 }, (_, i) => ({ id: `row-${i}`, characterId: "fixture", sender: i % 2 ? "character" : "user", content: `消息 ${i} ` + "可变高度内容 ".repeat(i % 6), timestamp: i }));
    function Harness() {
      const [messages, setMessages] = React.useState(rows), [jump, setJump] = React.useState(undefined), [mounted, setMounted] = React.useState(true), ref = React.useRef(null);
      (window as any).__chatWindow = { setMessages, setJump, setMounted, rows };
      return mounted ? React.createElement(MessageList, { key: "fixture", conversationKey: "fixture", messages, scrollRef: ref, style: { height: "800px", overflow: "auto" }, className: "chat-scroller", jumpToMessage: jump, onJumpHandled: () => setJump(undefined), renderMessage: (row: any) => React.createElement("article", { style: { padding: "10px", minHeight: row.timestamp % 7 * 15 + "px" } }, row.content) }, React.createElement("div", null, "末尾")) : null;
    }
    createRoot(document.getElementById("root")).render(React.createElement(Harness));
  });
  await page.waitForSelector('[data-chat-message-id="row-9999"]');
  await page.waitForTimeout(150);
  assert.equal(await page.locator("[data-chat-message-id]").count(), 50);
  const firstVisible = () => page.evaluate(() => { const c = document.querySelector(".chat-scroller")!, top = c.getBoundingClientRect().top; const row = [...c.querySelectorAll<HTMLElement>("[data-chat-message-id]")].find(r => r.getBoundingClientRect().bottom > top + 1)!; return { id: row.dataset.chatMessageId, offset: row.getBoundingClientRect().top - top }; });
  await page.locator(".chat-scroller").evaluate((e: HTMLElement) => { e.scrollTop = 0; }); await page.waitForTimeout(80);
  const before = await firstVisible();
  await page.getByRole("button", { name: /查看更早/ }).click(); await page.waitForTimeout(150);
  const after = await firstVisible();
  const preserved = await page.locator(`[data-chat-message-id="${before.id}"]`).boundingBox();
  assert.ok(preserved && Math.abs(preserved.y - before.offset) < 4, `prepend anchor drift ${JSON.stringify({ before, after, preserved })}`);
  for (let i = 0; i < 8; i++) { await page.locator(".chat-scroller").evaluate((e: HTMLElement) => { e.scrollTop = 0; }); await page.getByRole("button", { name: /查看更早/ }).click(); await page.waitForTimeout(50); assert.ok(await page.locator("[data-chat-message-id]").count() <= 150); }
  await page.evaluate(() => (window as any).__chatWindow.setJump({ id: "row-13", requestId: 1 }));
  await page.waitForTimeout(150);
  const jump = await page.locator('[data-chat-message-id="row-13"]').boundingBox(); assert.ok(jump && jump.y > 0 && jump.y < 700);
  const reading = await firstVisible();
  await page.evaluate(() => { const h = (window as any).__chatWindow; h.setMessages([...h.rows, { ...h.rows[9999], id: "incoming", content: "新消息", timestamp: 10000 }]); });
  await page.getByRole("button", { name: /有 1 条新消息/ }).waitFor();
  assert.equal((await firstVisible()).id, reading.id);
  await page.evaluate(() => (window as any).__chatWindow.setMounted(false)); await page.waitForTimeout(20);
  await page.evaluate(() => (window as any).__chatWindow.setMounted(true)); await page.waitForTimeout(150);
  assert.equal((await firstVisible()).id, reading.id);
  await page.evaluate(() => { const h = (window as any).__chatWindow; h.setMessages((current: unknown[]) => [...current, { ...h.rows[9999], id: "own", sender: "user", content: "自己发送", timestamp: 10001 }]); });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-chat-message-id="own"]').count(), 1);
  assert.ok(await page.locator(".chat-scroller").evaluate((e: HTMLElement) => e.scrollHeight - e.scrollTop - e.clientHeight < 5));
  await page.screenshot({ path: path.join(output, "bounded-window.png") });
  (report.cases as unknown[]).push({ test: "variable-height 10000, explicit prepend anchor, 9 expansions <=150 DOM, old-message jump, incoming does not drag, remount restore, own send returns end", passed: true });
  await context.close();
  for (const count of [1000, 5000, 10000]) {
    const full = await browser.newContext({ viewport: { width: 430, height: 900 } }); const app = await full.newPage();
    await full.addInitScript("window.__name = (value) => value;");
    const failures: string[] = []; app.on("pageerror", (e: Error) => failures.push(e.message));
    let paid = 0; await app.route(/\/(?:chat\/completions|embeddings|generateContent)(?:\?|$)/, (route: any) => { paid++; return route.abort(); });
    const start = Date.now();
    await app.goto(`http://127.0.0.3:3103/?chatPerformanceFixture=1&count=${count}`);
    await app.getByText("聊天", { exact: true }).click();
    await app.getByRole("heading", { name: "性能验收角色· 主号" }).click();
    await app.locator("[data-chat-message-id]").first().waitFor();
    const openMs = Date.now() - start;
    assert.equal(await app.locator("[data-chat-message-id]").count(), 50);
    const earlierSize = await app.getByRole("button", { name: /查看更早的消息/ }).evaluate((element: HTMLElement) => ({ font: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height }));
    assert.equal(earlierSize.font, 11.5); assert.ok(earlierSize.height <= 25);
    await app.locator(".chat-header__more-button").click(); await app.getByRole("button", { name: "打开查找聊天记录" }).click();
    const search = app.getByRole("searchbox", { name: "搜索聊天记录" }); const searchStart = Date.now();
    await search.fill("生日");
    const old = app.getByRole("button", { name: /性能验收角色.*很久以前约好了生日一起看海/s }); await old.waitFor(); const searchMs = Date.now() - searchStart; await old.click();
    await app.getByText("很久以前约好了生日一起看海", { exact: true }).waitFor();
    const rect = await app.getByText("很久以前约好了生日一起看海", { exact: true }).boundingBox(); assert.ok(rect && rect.y > 0 && rect.y < 800);
    assert.ok(await app.locator("[data-chat-message-id]").count() <= 150);
    const latestSize = await app.getByRole("button", { name: "回到最新消息", exact: true }).boundingBox(); assert.ok(latestSize && latestSize.height <= 24);
    await app.getByRole("button", { name: "回到最新消息", exact: true }).click();
    await app.waitForTimeout(100);
    const latestMessage = await app.locator(`[data-chat-message-id="chat-perf-20261023-message-${count - 1}"]`).boundingBox();
    assert.ok(latestMessage && latestMessage.y > 0 && latestMessage.y < 850);
    await app.locator(".chat-header__more-button").click(); await app.getByRole("button", { name: "打开查找聊天记录" }).click();
    assert.equal(await search.inputValue(), "生日");
    await search.fill("");
    const region = app.getByRole("region", { name: "查找聊天记录", exact: true });
    await region.getByRole("button", { name: "文字", exact: true }).click();
    await app.waitForTimeout(300); assert.equal(await region.locator("[data-chat-history-result]").count(), 50);
    const resultArea = await region.getByRole("status").evaluate((element: HTMLElement) => {
      const box = element.parentElement!.getBoundingClientRect();
      return { bottom: box.bottom, height: box.height, viewportHeight: window.innerHeight, scrollable: element.parentElement!.scrollHeight > element.parentElement!.clientHeight };
    });
    assert.ok(resultArea.bottom >= resultArea.viewportHeight - 90 && resultArea.scrollable, `results must fill the available page: ${JSON.stringify(resultArea)}`);
    const firstResult = await region.locator("[data-chat-history-result]").first().getAttribute("data-chat-history-result");
    await region.getByRole("button", { name: "查看更多结果" }).click(); await region.getByRole("status").filter({ hasText: "第 2 页" }).waitFor();
    assert.equal(await region.locator("[data-chat-history-result]").count(), 50);
    assert.notEqual(await region.locator("[data-chat-history-result]").first().getAttribute("data-chat-history-result"), firstResult);
    await region.getByRole("button", { name: "上一页" }).click(); await region.getByRole("status").filter({ hasText: "第 1 页" }).waitFor();
    assert.equal(await region.locator("[data-chat-history-result]").first().getAttribute("data-chat-history-result"), firstResult);
    assert.equal(await app.getByRole("combobox", { name: "每批显示消息" }).count(), 0);
    assert.equal(await app.getByRole("textbox", { name: "聊天记录日期" }).count(), 0);
    assert.equal(await app.getByRole("button", { name: "清除筛选" }).count(), 0);
    for (const width of [320, 430]) {
      await app.setViewportSize({ width, height: 900 });
      const boxes = await region.getByRole("group", { name: "聊天记录分类" }).getByRole("button").evaluateAll((elements: Element[]) => elements.map(element => { const rect = element.getBoundingClientRect(); return { top: rect.top, right: rect.right, height: rect.height }; }));
      assert.equal(boxes.length, 6); assert.ok(boxes.every((box: any) => Math.abs(box.top - boxes[0].top) < 1 && box.height <= 34 && box.right <= width));
    }
    for (const [category, text] of [["通话", "电话里约好了去书店"], ["表情", "验收小猫"], ["图片", "图片"], ["线下", "山顶日出约定"]]) {
      await region.getByRole("button", { name: category, exact: true }).click();
      await search.fill(category === "线下" ? "山顶日出" : "");
      await region.getByRole("button").filter({ hasText: text }).first().waitFor();
    }
    await search.fill("山顶日出");
    await region.getByRole("button").filter({ hasText: "山顶日出约定" }).click();
    await app.getByText("山顶日出约定", { exact: true }).waitFor();
    const offlineRect = await app.getByText("山顶日出约定", { exact: true }).boundingBox(); assert.ok(offlineRect && offlineRect.y > 0 && offlineRect.y < 800);
    assert.equal(paid, 0); assert.deepEqual(failures, []);
    await app.screenshot({ path: path.join(output, `full-app-${count}.png`) });
    await app.reload(); await app.getByText("聊天", { exact: true }).click(); await app.getByRole("heading", { name: "性能验收角色· 主号" }).click();
    await app.locator("[data-chat-message-id]").first().waitFor(); assert.equal(await app.locator("[data-chat-message-id]").count(), 50);
    await app.getByRole("button", { name: new RegExp(`查看更早的消息（还有 ${count - 50} 条）`) }).waitFor();
    (report.cases as unknown[]).push({ count, fixtureCreationAndColdOpenMs: openMs, oldHistorySearchIncludingDebounceMs: searchMs, initialDomRows: 50, maxDomRows: 150, compactSingleRowCategories: [320, 430], removedDisplayAndDateControls: true, resultPaging: true, onlineAndOfflineJump: true, modelRequests: paid, passed: true });
    await full.close();
  }
  report.passed = true;
} finally { await browser.close(); fs.writeFileSync(path.join(output, "ui-acceptance.json"), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
