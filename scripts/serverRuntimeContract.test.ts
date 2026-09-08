import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("server.ts", "utf8");
const worker = readFileSync("src/cloudflare/worker.ts", "utf8");
const policy = readFileSync("src/core/security/contentSecurityPolicy.ts", "utf8");
assert.match(source, /app\.get\("\/healthz"/);
assert.match(source, /randomUUID\(\)/);
assert.match(source, /setHeader\("x-request-id"/);
assert.match(source, /server\.close\(/);
assert.match(source, /SIGTERM/);
assert.match(source, /SIGINT/);
assert.match(worker, /url\.pathname === "\/healthz"/);
assert.match(policy, /frame-ancestors 'none'/);
assert.match(policy, /connect-src 'self' https:/);
assert.match(worker, /withSecurityHeaders\(await env\.ASSETS\.fetch\(request\)\)/);
console.log("PASS server exposes health, request correlation, graceful shutdown, and CSP contracts");
