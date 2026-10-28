import assert from "node:assert/strict";
import { mapForumGenerationError } from "../src/features/forum/services/forumGenerationService";

const failure = (code: string, extra = {}) => Object.assign(new Error("generate failed"), { code, ...extra });
assert.match(mapForumGenerationError(failure("timeout")), /超时/);
assert.match(mapForumGenerationError(failure("provider_safety")), /内容策略/);
assert.match(mapForumGenerationError(failure("provider_unavailable")), /暂不可用/);
assert.match(mapForumGenerationError(failure("provider_auth")), /认证/);
assert.match(mapForumGenerationError(failure("network")), /连接失败/);
assert.match(mapForumGenerationError(failure("provider_auth", { reason: "cloudflare_block", origin: "site_proxy", status: 403 })), /网站请求入口/);
assert.match(mapForumGenerationError(failure("provider_auth", { reason: "cloudflare_block", origin: "provider", status: 403 })), /供应商/);
assert.match(mapForumGenerationError(new Error("generate failed")), /原因未确认/);
assert.match(mapForumGenerationError(new Error("429 rate limit")), /频繁/);
console.log("Forum failure categories preserve actual cause without disclosing raw responses.");
