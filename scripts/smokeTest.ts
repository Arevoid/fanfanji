import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3217;
const child = spawn(process.execPath, ["server-dist/server.cjs"], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  stdio: "ignore",
});

try {
  let response: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/healthz`);
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!response) throw lastError instanceof Error ? lastError : new Error("production server did not start");
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { status?: string }).status, "ok");
  assert.match(response.headers.get("x-request-id") || "", /^[0-9a-f-]{20,}$/i);
  assert.match(response.headers.get("content-security-policy") || "", /script-src 'self'/);
  const shell = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(shell.status, 200);
  assert.match(shell.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.match(await shell.text(), /firstPaintTheme\.js/);
  console.log("PASS production smoke test starts the server, serves health with request correlation, and enforces CSP");
} finally {
  child.kill("SIGTERM");
}
