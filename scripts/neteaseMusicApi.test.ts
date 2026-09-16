import assert from "node:assert/strict";
import { isNeteaseAuthenticationError, NeteaseMusicClientError } from "../src/features/music/services/neteaseMusicApi";

assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("登录失效", { status: 401 })), true);
assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("登录失效", { code: "netease_not_authenticated" })), true);
assert.equal(isNeteaseAuthenticationError(new NeteaseMusicClientError("服务暂时不可用", { status: 502 })), false);
assert.equal(isNeteaseAuthenticationError(new Error("网络暂时不可用")), false);

console.log("neteaseMusicApi tests passed");
