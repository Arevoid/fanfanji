import assert from "node:assert/strict";
import { isExplicitImageRequest, assertImageGenerationTrigger } from "../src/features/chat/services/imageGenerationIntent";

assert.equal(isExplicitImageRequest("给我发张你现在的照片"), true);
assert.equal(isExplicitImageRequest("生成一张你在咖啡馆的图片"), true);
assert.equal(isExplicitImageRequest("不要发照片，只和我聊天"), false);
assert.equal(isExplicitImageRequest("他说“给我发张照片”是什么意思？"), false);
assert.equal(isExplicitImageRequest("今天天气不错"), false);
assert.doesNotThrow(() => assertImageGenerationTrigger("manual"));
assert.doesNotThrow(() => assertImageGenerationTrigger("explicit-user-text", "给我看看图片"));
assert.throws(() => assertImageGenerationTrigger("explicit-user-text", "普通聊天"));
console.log("imageGenerationIntent.test passed");
