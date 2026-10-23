/** Opt-in synthetic UI acceptance. Isolated browser context, mock APIs, no real user data. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(path.resolve("../browser-test-runtime/node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const output = path.resolve("../../outputs/sms-message-actions-20261023"); fs.mkdirSync(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await context.addInitScript("window.__name = x => x"); const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", (e: Error) => { if (e.message !== "WebSocket closed without opened.") errors.push(e.message); }); // Vite HMR closes during harness remount; not an application error.
  let translations = 0, fail = false; const requests: any[] = [];
  await page.route("**/api/translate", async (route: any) => { translations++; await route.fulfill({ json: { text: "晚上好，明天见。" } }); });
  await page.route("**/api/chat", async (route: any) => { requests.push(route.request().postDataJSON()); await route.fulfill(fail ? { status: 503, json: { error: "synthetic failure" } } : { json: { text: "新的第一条回复\n\n新的第二条回复" } }); });
  await page.route("**/sms-actions-acceptance", (route: any) => route.fulfill({ contentType: "text/html", body: '<html><body style="margin:0;height:100dvh;--surface:#fff;--app-bg:#f2f3f5;--text-primary:#111;--text-secondary:#666;--accent:#3478f6;--accent-contrast:#fff;--border:#ddd"><div id="root" style="height:100%"></div><script type="module" src="/@vite/client"></script></body></html>' }));
  const mount = async () => {
    await page.goto("http://127.0.0.3:3103/sms-actions-acceptance");
    await page.evaluate(async () => {
      const refresh = "/@react-refresh", react = "/node_modules/.vite/deps/react.js", dom = "/node_modules/.vite/deps/react-dom_client.js", app = "/src/components/AppSms.tsx", storage = "/src/core/storage/repositories/smsRepository.ts", css = "/src/index.css";
      const runtime = (await import(/* @vite-ignore */ refresh)).default; runtime.injectIntoGlobalHook(window);
      Object.assign(window, { $RefreshReg$: () => {}, $RefreshSig$: () => (type: unknown) => type, __vite_plugin_react_preamble_installed__: true });
      await import(/* @vite-ignore */ css);
      const React = (await import(/* @vite-ignore */ react)).default, { createRoot } = (await import(/* @vite-ignore */ dom)).default;
      const repo = await import(/* @vite-ignore */ storage);
      if (!repo.loadSmsStore().value.timelines.length) {
        const line = { id: "synthetic-line", characterId: "synthetic-char", ownerIdentityId: "synthetic-owner", phoneNumber: "1380000000000", label: "验收短信", mode: "unanchored", kind: "custom", knowsCurrentTimeline: false, createdAt: 1, updatedAt: 3 };
        const row = (id: string, sender: string, content: string, receivedAt: number) => ({ id, timelineId: line.id, characterId: line.characterId, ownerIdentityId: line.ownerIdentityId, phoneNumber: line.phoneNumber, sender, content, receivedAt });
        repo.saveSmsStore({ version: 1, phones: [], timelines: [line], messages: [row("user", "user", "Hello", 1), row("reply-one", "character", "Good evening", 2), row("reply-two", "character", "See you tomorrow", 3)], memories: [] });
      }
      const AppSms = (await import(/* @vite-ignore */ app)).default;
      createRoot(document.getElementById("root")).render(React.createElement(AppSms, { activeIdentity: { id: "synthetic-owner", name: "测试用户", avatar: "", signature: "", bio: "" }, characters: [{ id: "synthetic-char", name: "短信验收角色", avatar: "", personality: "温柔", backstory: "" }], relationships: [], settings: { apiKey: "synthetic-only", selectedModel: "synthetic-model", apiEndpoint: "http://127.0.0.3:3103/v1" }, onClose: () => {} }));
    });
    await page.getByText("短信验收角色", { exact: true }).click();
  };
  await mount();
  const first = page.locator('[data-sms-message-id="reply-one"]');
  await first.click(); assert.equal(await page.getByRole("dialog", { name: "短信操作" }).count(), 0);
  await first.click({ button: "right" }); await page.getByRole("button", { name: "翻译", exact: true }).click();
  await page.getByText("晚上好，明天见。", { exact: true }).waitFor();
  await first.click({ button: "right" }); await page.getByRole("button", { name: "收起翻译", exact: true }).click();
  assert.equal(await page.getByText("晚上好，明天见。", { exact: true }).count(), 0);
  await first.press("Enter"); await page.getByRole("button", { name: "展开翻译", exact: true }).click(); assert.equal(translations, 1);
  await mount(); await page.getByText("晚上好，明天见。", { exact: true }).waitFor();
  fail = true; await first.click({ button: "right" }); await page.getByRole("button", { name: "重新生成回复" }).click();
  try { await page.getByText(/synthetic failure|503/).waitFor(); }
  catch (error) { console.log(JSON.stringify({ requests: requests.length, ui: await page.locator("body").innerText() })); throw error; }
  assert.equal(await page.locator('[data-sms-message-id="reply-two"]').count(), 1);
  fail = false; await first.click({ button: "right" }); await page.getByRole("button", { name: "重新生成回复" }).click();
  await page.getByText("新的第二条回复", { exact: true }).waitFor(); assert.equal(await first.count(), 0);
  assert.equal(requests.at(-1).message, "Hello"); assert.deepEqual(requests.at(-1).history, []);
  assert.ok(!requests.at(-1).systemInstruction.includes("Good evening"));
  const fresh = page.getByRole("button", { name: "短信：新的第一条回复", exact: true });
  const box = await fresh.boundingBox(); await page.mouse.move(box!.x + 10, box!.y + 10); await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  await page.getByRole("dialog", { name: "短信操作" }).waitFor();
  await page.screenshot({ path: path.join(output, "message-menu.png") });
  await page.getByRole("button", { name: "删除短信", exact: true }).click(); await page.getByRole("button", { name: "确认删除" }).click();
  assert.equal(await fresh.count(), 0); await mount(); assert.equal(await fresh.count(), 0);
  await page.getByRole("button", { name: "短信：Hello", exact: true }).click({ button: "right" });
  assert.equal(await page.getByRole("button", { name: "重新生成回复" }).count(), 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "acceptance.json"), JSON.stringify({ passed: true, syntheticOnly: true, realModelCalls: 0, translations, replyRequests: requests.length, coverage: ["right click", "keyboard", "500ms long press", "translation cache and refresh", "failed regeneration retains originals", "legacy multibubble replacement", "delete and refresh", "user messages cannot regenerate"] }, null, 2));
  console.log("PASS SMS message actions UI"); await context.close();
} finally { await browser.close(); }
