/** Isolated synthetic images and mocked sharing only. No provider/user data. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(path.resolve("../browser-test-runtime/node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const output = path.resolve("../../outputs/image-preview-save-20261023"); fs.mkdirSync(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 }, acceptDownloads: true }); const page = await context.newPage();
  await context.addInitScript("window.__name = x => x");
  const errors: string[] = []; page.on("pageerror", (e: Error) => { if (e.message !== "WebSocket closed without opened.") errors.push(e.message); });
  await page.route("**/image-preview-acceptance", (route: any) => route.fulfill({ contentType: "text/html", body: '<html><body style="margin:0"><div id="root"></div><script type="module" src="/@vite/client"></script></body></html>' }));
  const mount = async () => {
    await page.goto("http://127.0.0.3:3103/image-preview-acceptance");
    return page.evaluate(async () => {
      const refresh = "/@react-refresh", react = "/node_modules/.vite/deps/react.js", dom = "/node_modules/.vite/deps/react-dom_client.js", preview = "/src/components/media/ImagePreview.tsx", chat = "/src/features/chat/components/StoredChatImage.tsx", moment = "/src/features/moments/components/StoredMomentImage.tsx", phone = "/src/features/characterPhone/components/StoredCharacterPhoneImage.tsx", db = "/src/utils/imageAssetDb.ts", css = "/src/index.css";
      const runtime = (await import(/* @vite-ignore */ refresh)).default; runtime.injectIntoGlobalHook(window); Object.assign(window, { $RefreshReg$: () => {}, $RefreshSig$: () => (type: unknown) => type, __vite_plugin_react_preamble_installed__: true }); await import(/* @vite-ignore */ css);
      const React = (await import(/* @vite-ignore */ react)).default, { createRoot } = (await import(/* @vite-ignore */ dom)).default;
      const { PreviewableImage, ImageSaveButton } = await import(/* @vite-ignore */ preview), { StoredChatImage } = await import(/* @vite-ignore */ chat), { StoredMomentImage } = await import(/* @vite-ignore */ moment), { StoredCharacterPhoneImage } = await import(/* @vite-ignore */ phone), { imageAssetDb } = await import(/* @vite-ignore */ db);
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 200; const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#bfd8f3"; ctx.fillRect(0, 0, 320, 200); ctx.fillStyle = "#244574"; ctx.font = "28px sans-serif"; ctx.fillText("Synthetic image", 30, 100);
      const src = canvas.toDataURL("image/png"), blob = await (await fetch(src)).blob();
      if (!await imageAssetDb.getImage("synthetic-preview-asset")) await imageAssetDb.saveImage("synthetic-preview-asset", blob);
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
      ctx.fillStyle = "#f1c5cb"; ctx.fillRect(0, 0, 320, 200); const second = canvas.toDataURL("image/jpeg");
      const images = [{ src, alt: "第一张" }, { src: second, alt: "第二张" }];
      createRoot(document.getElementById("root")).render(React.createElement("div", { style: { padding: "20px", minHeight: "1600px" } },
        React.createElement("h1", null, "图片保存隔离验收"), React.createElement(StoredChatImage, { assetId: "synthetic-preview-asset", alt: "聊天图片", generated: true }),
        React.createElement(StoredMomentImage, { assetId: "synthetic-preview-asset", alt: "朋友圈图片" }),
        React.createElement(StoredCharacterPhoneImage, { assetId: "synthetic-preview-asset", alt: "手机相册", className: "w-32", previewImages: images }),
        React.createElement(PreviewableImage, { src, alt: "内嵌图片", className: "w-32", previewImages: images }),
        React.createElement(PreviewableImage, { src: "https://images.invalid/cors.png", alt: "跨域图片", className: "w-32" }),
        React.createElement("section", { "aria-label": "相册详情保存" }, React.createElement(ImageSaveButton, { source: { load: () => imageAssetDb.getImage("synthetic-preview-asset") } })),
        React.createElement("p", null, "纯文字描述，不是图片")));
      return { src, second };
    });
  };
  const fixture = await mount(), original = Buffer.from(fixture.src.split(",")[1], "base64"), secondImage = Buffer.from(fixture.second.split(",")[1], "base64");
  await page.route("https://images.invalid/cors.png", (route: any) => route.request().resourceType() === "fetch" ? route.abort("blockedbyclient") : route.fulfill({ contentType: "image/png", body: original }));
  let downloads = 0;
  for (const label of ["聊天图片", "朋友圈图片", "手机相册", "内嵌图片"]) {
    const trigger = page.getByRole("button", { name: `查看大图：${label}`, exact: true }); await trigger.scrollIntoViewIfNeeded(); const originalScroll = await page.evaluate(() => window.scrollY); await trigger.click(); const dialog = page.getByRole("dialog", { name: "图片预览" }); await dialog.waitFor();
    const originalTransform = await dialog.locator("img").getAttribute("style"); await dialog.locator("img").dblclick(); assert.notEqual(await dialog.locator("img").getAttribute("style"), originalTransform);
    await dialog.getByRole("button", { name: "还原大小" }).click();
    if (label === "聊天图片") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 180, y: 400 }, { x: 250, y: 400 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 140, y: 400 }, { x: 290, y: 400 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      assert.notEqual(await dialog.locator("img").getAttribute("style"), originalTransform, "two-finger pinch must zoom");
      await page.mouse.move(210, 400); await page.mouse.down(); await page.mouse.move(235, 420); await page.mouse.up();
      assert.ok(!(await dialog.locator("img").getAttribute("style"))?.includes("translate(0px, 0px)"), "zoomed image must pan");
      await dialog.getByRole("button", { name: "还原大小" }).click(); await cdp.detach();
    }
    if (label === "手机相册") { await dialog.getByRole("button", { name: "下一张" }).click(); await dialog.getByText("2 / 2", { exact: true }).waitFor(); }
    const pending = page.waitForEvent("download"); await dialog.getByRole("button", { name: "保存图片", exact: true }).click(); const download = await pending;
    assert.ok(download.suggestedFilename().endsWith(label === "手机相册" ? ".jpg" : ".png")); assert.deepEqual(fs.readFileSync(await download.path()), label === "手机相册" ? secondImage : original); downloads++;
    await dialog.getByRole("button", { name: "关闭图片预览" }).click(); assert.equal(await dialog.count(), 0); assert.equal(await page.evaluate(() => window.scrollY), originalScroll);
  }
  const detailDownload = page.waitForEvent("download"); await page.getByRole("region", { name: "相册详情保存" }).getByRole("button", { name: "保存图片", exact: true }).click();
  assert.deepEqual(fs.readFileSync(await (await detailDownload).path()), original); downloads++;
  // Refresh proves that the IndexedDB source can still be loaded and saved.
  await mount(); await page.getByRole("button", { name: "查看大图：聊天图片", exact: true }).click(); await page.getByRole("dialog", { name: "图片预览" }).waitFor();
  await page.evaluate(() => { Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true }); Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("User cancelled", "AbortError"); } }); });
  await page.getByRole("dialog", { name: "图片预览" }).getByRole("button", { name: "保存图片", exact: true }).click(); await page.getByRole("dialog", { name: "图片预览" }).getByRole("button", { name: "保存图片", exact: true }).waitFor();
  assert.equal(await page.getByText(/保存失败|已保存到相册/).count(), 0);
  await page.getByRole("button", { name: "关闭图片预览" }).click();
  await page.getByRole("button", { name: "查看大图：跨域图片", exact: true }).click(); await page.getByRole("dialog", { name: "图片预览" }).getByRole("button", { name: "保存图片", exact: true }).click();
  await page.getByText(/跨域或网络限制/).waitFor(); await page.getByRole("link", { name: "打开原图" }).waitFor();
  await page.screenshot({ path: path.join(output, "cross-origin-fallback.png") });
  await page.getByRole("button", { name: "关闭图片预览" }).click();
  await page.getByRole("button", { name: "查看大图：手机相册", exact: true }).click();
  await page.getByRole("dialog", { name: "图片预览" }).locator("img").waitFor();
  await page.waitForFunction(() => { const img = document.querySelector('[aria-label="图片预览"] img') as HTMLImageElement | null; return Boolean(img?.complete && img.naturalWidth); });
  await page.screenshot({ path: path.join(output, "preview-save.png") }); assert.deepEqual(errors, []);
  const app = await context.newPage();
  await app.goto("http://127.0.0.3:3103/?chatPerformanceFixture=1&count=1000"); await app.getByText("聊天", { exact: true }).waitFor();
  await app.evaluate(async () => {
    const messagePath = "/src/core/storage/repositories/messageRepository.ts", momentPath = "/src/core/storage/repositories/momentRepository.ts";
    const messages = await import(/* @vite-ignore */ messagePath), moments = await import(/* @vite-ignore */ momentPath);
    const rows = (await messages.initializeMessages([])).value, last = rows.at(-1);
    messages.saveMessages([...rows, { ...last, id: "chat-perf-20261023-preview-image", content: "合成图片", imageAssetId: "synthetic-preview-asset", imageSource: "generated", timestamp: Date.now() }]); await messages.flushMessages();
    moments.saveMoments([{ id: "synthetic-preview-moment", characterId: last.characterId, relationId: last.relationId, ownerIdentityId: "identity-1", authorName: "性能验收角色", authorAvatar: "", content: "图片预览验收动态", imageAssetId: "synthetic-preview-asset", imageDescription: "合成图片", imageType: "photo", timestamp: Date.now(), likes: [], comments: [] }]); await moments.flushMoments();
  });
  await app.reload(); await app.getByText("聊天", { exact: true }).click(); await app.getByRole("heading", { name: "性能验收角色· 主号" }).click();
  await app.getByRole("button", { name: "查看大图：generated chat image", exact: true }).click(); await app.getByRole("dialog", { name: "图片预览" }).waitFor();
  await app.getByRole("button", { name: "关闭图片预览" }).click();
  await app.reload(); await app.getByText("聊天", { exact: true }).click(); await app.getByRole("button", { name: "朋友圈", exact: true }).click({ position: { x: 10, y: 5 } });
  await app.getByRole("button", { name: "查看大图：合成图片", exact: true }).click(); await app.getByRole("dialog", { name: "图片预览" }).waitFor();
  await app.getByRole("dialog", { name: "图片预览" }).locator("img").waitFor();
  await app.waitForFunction(() => { const img = document.querySelector('[aria-label="图片预览"] img') as HTMLImageElement | null; return Boolean(img?.complete && img.naturalWidth); });
  await app.screenshot({ path: path.join(output, "full-app-moment-preview.png") }); await app.close();
  fs.writeFileSync(path.join(output, "acceptance.json"), JSON.stringify({ passed: true, syntheticOnly: true, realProviderCalls: 0, byteIdenticalDownloads: downloads, coverage: ["stored chat image", "stored Moment image", "phone gallery", "data URL", "multi-image current selection", "zoom and reset", "close", "IndexedDB reload", "mock native-share cancellation", "CORS open-original fallback"], realPhoneOsAlbumAcceptance: "not tested on physical iPhone/Android" }, null, 2));
  console.log("PASS image preview and byte-identical download UI"); await context.close();
} finally { await browser.close(); }
