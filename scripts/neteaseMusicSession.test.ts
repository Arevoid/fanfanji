import assert from "node:assert/strict";
import {
  NETEASE_SESSION_COOKIE,
  buildNeteaseSessionCookie,
  clearNeteaseSessionCookie,
  getCookie,
  getNeteaseUpstreamCookie,
  normalizeUpstreamCookie,
} from "../src/server/neteaseMusicSession";

const upstream = "MUSIC_U=abc%3D123; Path=/; HttpOnly, NMTID=nmtid-value; Path=/; Secure";
assert.equal(normalizeUpstreamCookie(upstream), "MUSIC_U=abc%3D123; NMTID=nmtid-value");

const sessionCookie = buildNeteaseSessionCookie(upstream);
assert.ok(sessionCookie);
assert.match(sessionCookie, new RegExp(`^${NETEASE_SESSION_COOKIE}=`));
assert.match(sessionCookie, /HttpOnly/);
assert.match(sessionCookie, /SameSite=Lax/);

const browserCookieHeader = sessionCookie!.split(";")[0];
assert.equal(getCookie(browserCookieHeader, NETEASE_SESSION_COOKIE), "MUSIC_U=abc%3D123; NMTID=nmtid-value");
assert.equal(getNeteaseUpstreamCookie(browserCookieHeader), "MUSIC_U=abc%3D123; NMTID=nmtid-value");

const cleared = clearNeteaseSessionCookie();
assert.match(cleared, /Max-Age=0/);
assert.equal(getNeteaseUpstreamCookie(cleared), "");

console.log("neteaseMusicSession tests passed");
