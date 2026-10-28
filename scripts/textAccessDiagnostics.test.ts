import assert from "node:assert/strict";
import { apiExtractMemories, apiChat, ApiChatError } from "../src/utils/apiHelper";
import { callTextProviderWithDiagnostics } from "../src/server/textProtocolAdapters";
import { parseTextApiErrorPayload, proxyTextErrorOrigin, safeApiRequestId } from "../src/utils/textApiError";

const oldFetch = globalThis.fetch;
const upstream = {success:false,error:"blocked",code:"provider_request",reason:"cloudflare_block",origin:"provider",requestId:"abc123-SJC"};
let calls = 0;
const extraction = {singlePass:true,scenario:"immediate-summary" as const,history:[],characterName:"test",apiKey:"synthetic",model:"test"};
try {
  globalThis.fetch = (async () => {calls++;return Response.json(upstream,{status:403});}) as typeof fetch;
  const result = await apiExtractMemories(extraction);
  assert.equal(result.errorDetails?.status,403);
  assert.equal(result.errorDetails?.origin,"provider");
  assert.equal(result.errorDetails?.requestId,"abc123-SJC");
  assert.equal(result.errorDetails?.reason,"cloudflare_block");
  assert.equal(calls,1,"diagnostics must not retry");
  assert.match(result.error || "",/HTTP 403/);
  await assert.rejects(apiChat({message:"hello",history:[],apiKey:"synthetic",model:"test",singleAttempt:true}), error =>
    error instanceof ApiChatError && error.origin === "provider" && error.status === 403);
  calls=0;
  globalThis.fetch = (async () => {calls++;return new Response("error code: 1010\n",{status:403,headers:{"cf-ray":"123abc-SIN"}});}) as typeof fetch;
  const site = await apiExtractMemories(extraction);
  assert.equal(site.errorDetails?.origin,"site_proxy");
  assert.equal(site.errorDetails?.reason,"cloudflare_block");
  assert.equal(site.errorDetails?.requestId,"123abc-SIN");
  assert.equal(calls,1);
  globalThis.fetch = (async () => new Response('<html><div class="cf-error-details">blocked</div></html>',{status:403,headers:{"cf-ray":"456def-HKG"}})) as typeof fetch;
  await assert.rejects(callTextProviderWithDiagnostics({message:"test",apiKey:"synthetic",model:"test",apiEndpoint:"https://example.invalid/v1"}), (error:any) =>
    error.origin === "provider" && error.requestId === "456def-HKG" && error.reason === "cloudflare_block");
  const legacy = JSON.stringify({success:false,error:"blocked",code:"provider_request",reason:"cloudflare_block"});
  assert.equal(proxyTextErrorOrigin(legacy,parseTextApiErrorPayload(legacy,403)),"unknown","old sanitized upstream payload is not proof of a site-edge block");
  assert.equal(safeApiRequestId("Bearer secret"),undefined);
  assert.equal(safeApiRequestId("https://example.com/?key=secret"),undefined);
} finally {globalThis.fetch=oldFetch;}
console.log("PASS text access diagnostics preserve origin/status/reason and bounded trace IDs, without extra requests or raw credential persistence");
