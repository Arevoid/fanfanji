/** Fresh context; local request stub verifies production UI/transport, not model intelligence. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(path.resolve("../browser-test-runtime/node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const output = path.resolve("../../outputs/model-direct-identity-20261023"); fs.mkdirSync(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } }); const page = await context.newPage();
  const captured: any[] = []; const errors: string[] = []; page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.route("**/api/chat", async (route: any) => { captured.push(route.request().postDataJSON()); await route.fulfill({ json: { text: "我是AI助手，Claude只是昵称，没有真实的咖啡店工作经历。" } }); });
  await page.goto("http://127.0.0.3:3103/?chatPerformanceFixture=1&count=1000&modelDirectFixture=1");
  await page.getByText("档案馆", { exact: true }).click(); await page.locator("#archives_add_btn").click(); await page.getByRole("button", { name: "新建人设", exact: true }).click();
  assert.equal(await page.getByRole("combobox", { name: "聊天身份模式" }).count(), 0);
  await page.getByRole("combobox", { name: "性别", exact: true }).selectOption("AI / 智械");
  assert.equal(await page.getByRole("combobox", { name: "聊天身份模式" }).inputValue(), "model-direct");
  await page.getByRole("combobox", { name: "聊天身份模式" }).selectOption("roleplay");
  assert.equal(await page.getByRole("combobox", { name: "聊天身份模式" }).inputValue(), "roleplay");
  await page.getByRole("combobox", { name: "性别", exact: true }).selectOption("女");
  assert.equal(await page.getByRole("combobox", { name: "聊天身份模式" }).count(), 0);
  for (const gender of ["男", "神秘", ""]) {
    await page.getByRole("combobox", { name: "性别", exact: true }).selectOption(gender);
    assert.equal(await page.getByRole("combobox", { name: "聊天身份模式" }).count(), 0);
  }
  await page.getByRole("combobox", { name: "性别", exact: true }).selectOption("AI / 智械");
  await page.getByPlaceholder("请输入姓名", { exact: true }).fill("新建AI默认验收"); await page.getByRole("button", { name: "保存人设", exact: true }).click();
  await page.getByRole("heading", { name: /新建AI默认验收/ }).waitFor();
  await page.reload(); await page.getByText("档案馆", { exact: true }).click(); await page.getByRole("heading", { name: /新建AI默认验收/ }).click();
  assert.equal(await page.getByRole("combobox", { name: "聊天身份模式" }).inputValue(), "model-direct");
  await page.getByRole("button", { name: "保存人设", exact: true }).click();
  await page.getByRole("heading", { name: /旧AI角色兼容验收/ }).click();
  assert.equal(await page.getByRole("combobox", { name: "聊天身份模式" }).inputValue(), "roleplay", "legacy AI gender stays roleplay in edit UI");
  await page.getByRole("combobox", { name: "聊天身份模式" }).selectOption("model-direct");
  await page.getByText("保存后以 AI 身份交流。原聊天和记忆保留，此前虚构经历不会作为本体模型的真实经历继续使用。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "保存人设", exact: true }).click();
  await page.getByRole("heading", { name: /旧AI角色兼容验收/ }).click();
  assert.equal(await page.getByRole("combobox", { name: "聊天身份模式" }).inputValue(), "model-direct");
  await page.getByRole("combobox", { name: "聊天身份模式" }).selectOption("roleplay"); await page.getByRole("button", { name: "保存人设", exact: true }).click();
  await page.reload(); await page.getByText("聊天", { exact: true }).click(); await page.getByRole("heading", { name: /Claude模型身份验收· 主号/ }).click();
  await page.getByRole("textbox", { name: "发送消息给 Claude模型身份验收..." }).fill("你是真人还是AI？");
  await page.getByRole("button", { name: "发送消息并获取回复", exact: true }).click();
  await page.locator("[data-chat-message-id]").getByText("我是AI助手，Claude只是昵称，没有真实的咖啡店工作经历。", { exact: true }).waitFor();
  assert.ok(captured.length > 0);
  const request = captured.find(row => row.message?.includes("你是真人还是AI")); assert.ok(request);
  assert.ok(request.systemInstruction.includes("[MODEL DIRECT IDENTITY v1]")); assert.ok(request.systemInstruction.includes(JSON.stringify(request.model)));
  assert.ok(!request.systemInstruction.includes("Do NOT say you are an AI")); assert.ok(!request.systemInstruction.includes("{{FANFANJI_REQUEST_MODEL_ID}}"));
  await page.getByRole("button", { name: "聊天设置", exact: true }).click();
  await page.getByText(/模型直接聊天 · 当前配置模型/).waitFor();
  await page.screenshot({ path: path.join(output, "ui-model-settings.png") });
  assert.deepEqual(errors, []);
  const report = { passed: true, syntheticOnly: true, providerRequests: 0, transportStub: true, newAiDefaultAndFictionalChoice: true, ordinaryGenderDefault: true, savedCharacter: true, directRequestIdentityMarker: true, actualConfiguredModelBound: request.model, realProviderEvidence: "provider-replies.json (separate opt-in run)" };
  fs.writeFileSync(path.join(output, "ui-acceptance.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  await context.close();
} finally { await browser.close(); }
