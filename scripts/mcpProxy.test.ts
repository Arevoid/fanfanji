import assert from "node:assert/strict";
import { validateMcpProxyUrl } from "../src/server/mcpProxy";

assert.equal(validateMcpProxyUrl("https://example.com/mcp").protocol, "https:");
assert.equal(validateMcpProxyUrl("http://127.0.0.1:8787/mcp").hostname, "127.0.0.1");
assert.throws(() => validateMcpProxyUrl("http://10.0.0.2/mcp"), /不允许|仅允许/);
assert.throws(() => validateMcpProxyUrl("https://user:pass@example.com/mcp"), /不允许/);
console.log("PASS MCP proxy URL scheme, localhost development allowance, and SSRF guards");
