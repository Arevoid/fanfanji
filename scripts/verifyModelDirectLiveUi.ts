/** Opt-in, ephemeral synthetic browser context; real provider, no user backup. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const privatePath = process.argv[2]; if (!privatePath) throw Error("Provide private provider config path");
const config = JSON.parse(fs.readFileSync(privatePath, "utf8"));
const { chromium } = await import(pathToFileURL(path.resolve("../browser-test-runtime/node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const output = path.resolve("../../outputs/model-direct-identity-20261023"); fs.mkdirSync(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } }); await context.addInitScript("window.__name = x => x");
  const page = await context.newPage();
  page.on("response", async (response: any) => { if (response.url().endsWith("/api/chat")) { const body = await response.json().catch(() => ({})); console.log(JSON.stringify({ chatStatus: response.status(), reply: body.text, error: body.error ? "chat_request_failed" : undefined })); } });
  await page.goto("http://127.0.0.3:3103/?chatPerformanceFixture=1&count=1000&modelDirectFixture=1");
  await page.getByText("聊天", { exact: true }).waitFor();
  await page.evaluate(async (provider: { apiKey: string; baseUrl: string; model: string }) => {
    const modulePath = "/src/core/storage/repositories/settingsRepository.ts";
    const repository = await import(/* @vite-ignore */ modulePath);
    const settings = repository.loadSettings({}).value;
    const result = await repository.saveSettingsAsync({ ...settings, apiKey: provider.apiKey, apiEndpoint: provider.baseUrl, selectedModel: provider.model });
    if (!result.success) throw Error("synthetic_config_save_failed");
  }, config);
  await page.reload(); await page.getByText("聊天", { exact: true }).click();
  await page.getByRole("heading", { name: /Claude模型身份验收· 主号/ }).click();
  const before = await page.locator('[data-chat-message-id]').count();
  await page.getByRole("textbox", { name: "发送消息给 Claude模型身份验收..." }).fill("你是真人还是AI？昵称Claude能证明模型身份吗？你真的每天在咖啡店工作吗？请简短回答。");
  await page.getByRole("button", { name: "发送消息并获取回复", exact: true }).click();
  try { await page.waitForFunction(() => [...document.querySelectorAll("[data-chat-message-id]")].slice(-8).some(element => /(?:我是|作为|作为一个)\s*(?:一个)?\s*(?:AI|人工智能)/i.test(element.textContent || "")), undefined, { timeout: 90000 }); }
  catch (error) { console.log(JSON.stringify({ visibleUi: (await page.locator("body").innerText()).slice(-2500) })); throw error; }
  await page.waitForFunction(() => {
    const text = [...document.querySelectorAll("[data-chat-message-id]")].slice(-12).map(element => element.textContent || "").join("\n");
    return /接口配置|配置.*模型/.test(text) && /没有.*(?:肉身|身体|实体)|不会.*咖啡[店馆]|并不.*咖啡[店馆]/.test(text);
  }, undefined, { timeout: 90000 });
  const tail = await page.locator('[data-chat-message-id]').evaluateAll((elements: Element[]) => elements.slice(-12).map(element => element.textContent || ""));
  assert.ok(tail.some((text: string) => /AI|人工智能/i.test(text)));
  await page.screenshot({ path: path.join(output, "real-provider-chat-ui.png") });
  const report = { passed: true, syntheticOnly: true, realProvider: true, model: config.model, initialMountedMessages: before, visibleTail: tail };
  fs.writeFileSync(path.join(output, "real-ui-acceptance.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); await context.close();
} finally { await browser.close(); }
