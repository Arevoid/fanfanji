import assert from "node:assert/strict";
import { parseTextApiErrorPayload } from "../src/utils/textApiError";

const cloudflare = parseTextApiErrorPayload('<!doctype html><html><div class="cf-error-details">You have been blocked by Cloudflare</div></html>', 403);
assert.equal(cloudflare.code, "provider_request");
assert.equal(cloudflare.reason, "cloudflare_block");
assert.match(cloudflare.message, /\u7f51\u9875\u8bbf\u95ee\u53d7\u9650/iu);
assert.doesNotMatch(cloudflare.message, /cf-error-details|<html|Cloudflare/iu);

const gateway = parseTextApiErrorPayload('<html><body>502 Bad Gateway</body></html>', 502);
assert.equal(gateway.code, "provider_invalid_response");
assert.equal(gateway.reason, "html_error");
assert.match(gateway.message, /\u7f51\u9875\u8fd4\u56de\u4e86\u5f02\u5e38\u5185\u5bb9/iu);
assert.doesNotMatch(gateway.message, /<html|<body|502/iu);
console.log("PASS provider HTML error pages are sanitized");
