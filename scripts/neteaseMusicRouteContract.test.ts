import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/cloudflare/worker.ts", import.meta.url), "utf8");

for (const source of [server, worker]) {
  assert.match(source, /\/api\/music\/netease\/qr\/create/);
  assert.match(source, /\/api\/music\/netease\/qr\/check/);
  assert.match(source, /\/api\/music\/netease\/account/);
  assert.match(source, /\/api\/music\/netease\/playlists/);
  assert.match(source, /\/api\/music\/netease\/search/);
  assert.match(source, /recommendations\/daily/);
  assert.match(source, /tracks/);
  assert.match(source, /lyrics/);
  assert.match(source, /tracks.*stream/);
  assert.match(source, /NETEASE_API_BASE_URL/);
  assert.match(source, /netease_not_authenticated/);
}

assert.match(server, /buildNeteaseSessionCookie/);
assert.match(worker, /buildNeteaseSessionCookie/);
assert.doesNotMatch(server, /res\.json\(.*sessionCookie/);
assert.doesNotMatch(worker, /json\(.*sessionCookie/);

console.log("neteaseMusicRouteContract tests passed");
