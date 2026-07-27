import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCharacterImagePrompt } from "../src/domain/prompt/characterImagePrompt";
import { assertReferenceImageCapability, imageProtocolCapabilities, inferGeminiImageAuthMode, inferImageProtocol, resolveImageProtocol, supportsReferenceImageForModel } from "../src/features/chat/services/imageProtocol";

const prompt = buildCharacterImagePrompt({
  character: { id: "char", name: "祁澈", avatar: "", personality: "冷静", backstory: "", imageAppearancePrompt: "黑发，白衬衫", imageNegativePrompt: "水印" },
  relationship: { id: "rel-a", characterId: "char", userIdentityId: "user-a", conversationId: "direct:rel-a", relationship: "partner", createdAt: 1, updatedAt: 1 },
  recentMessages: [{ id: "m", characterId: "char", relationId: "rel-a", sender: "user", content: "给我发张照片", timestamp: 1 }],
  userRequest: "给我发张照片",
});
assert.match(prompt, /黑发，白衬衫/);
assert.match(prompt, /Avoid: 水印/);
assert.match(prompt, /Current relationship context only: partner/);
assert.equal(resolveImageProtocol({ protocol: undefined }), "openai-images", "old presets remain compatible");
assert.equal(inferImageProtocol("gemini-2.5-flash-image"), "gemini-native-image");
assert.equal(inferImageProtocol("gemini-3.1-flash-image-preview"), "gemini-native-image");
assert.equal(inferImageProtocol("imagen-3.0-generate"), "imagen-text");
assert.equal(inferImageProtocol("gpt-image-1"), "openai-images");
assert.equal(inferGeminiImageAuthMode("https://service.example/v1"), "bearer");
assert.equal(supportsReferenceImageForModel("gemini-native-image", "gemini-2.5-flash-image"), true);
assert.equal(supportsReferenceImageForModel("imagen-text", "imagen-3.0-generate"), false);
assert.equal(imageProtocolCapabilities({ protocol: "openai-images" }).supportsReferenceImage, true);
assert.equal(imageProtocolCapabilities({ protocol: "gemini-native-image", referenceImageSupported: false }).supportsReferenceImage, false);
assert.equal(imageProtocolCapabilities({ protocol: "imagen-text" }).supportsReferenceImage, false);
assert.throws(() => assertReferenceImageCapability({ id: "p", name: "Gemini", protocol: "gemini-native-image", apiEndpoint: "x", apiKey: "y", selectedModel: "z", referenceImageSupported: false }, true));
assert.throws(() => assertReferenceImageCapability({ id: "p", name: "Imagen", protocol: "imagen-text", apiEndpoint: "x", apiKey: "y", selectedModel: "z" }, true));
const settingsPage = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const imageSettings = settingsPage.slice(settingsPage.indexOf('activeTab === "image_api"'), settingsPage.indexOf('activeTab === "beauty"'));
assert.doesNotMatch(imageSettings, /Provider Protocol|认证方式|OpenAI Images|Gemini Native|Imagen text-to-image|模型已验证|未验证/);
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
assert.match(chat, /generated \? "border-0 shadow-none outline-none ring-0" : "border shadow-sm"/);
assert.match(settingsPage, /const updateCurrentImageModel = \(model: string\)/);
assert.match(settingsPage, /selectedModel: model/);
assert.match(settingsPage, /请先选择或输入图片模型。/);
assert.match(settingsPage, /selectedModel: preset\.selectedModel \|\| \(preset as ImageApiPreset & \{ model\?: string \}\)\.model \|\| ""/);
assert.match(settingsPage, /当前图片服务不提供模型列表，可手动输入图片模型后保存。/);
assert.match(server, /当前图片服务不提供模型列表，已保留手动输入的模型/);
assert.match(server, /\(\?:404\|405\)/);
console.log("imageApiPayload.test passed");
