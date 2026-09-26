import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, ExternalLink, Plug, RefreshCw, Trash2 } from "lucide-react";
import type { McpServerConfig } from "../../../domain/mcp/mcpTypes";
import { loadMcpServers, removeMcpServer, upsertMcpServer } from "../../../core/storage/repositories/mcpServerRepository";
import { discoverMcpTools, setMcpSessionToken } from "../mcpClient";
import { readString, writeString } from "../../../core/storage/storageAdapter";
import { storageKeys } from "../../../core/storage/storageKeys";
import { createId } from "../../../core/id/createId";

const MCP_PRESET_SEED = "seeded-v2";
const RESEARCH_MCP_SERVER: McpServerConfig = {
  id: "research-mcp-exa",
  name: "联网",
  url: "https://mcp.exa.ai/mcp",
  enabled: true,
  // Exa allows CORS, while its Cloudflare edge rejects requests originating
  // from our Cloudflare Worker proxy. Use the browser path for the hosted app.
  directFetch: true,
  readOnlyOnly: true,
  discoveredTools: [],
  connectionStatus: "unverified",
  updatedAt: Date.now(),
};
const HOTSEARCH_MCP_SERVER: McpServerConfig = {
  id: "hotsearch-mcp",
  name: "热搜",
  url: "https://mcp.pianam.cn/hot-mcp/mcp",
  enabled: true,
  directFetch: false,
  readOnlyOnly: true,
  discoveredTools: [],
  connectionStatus: "unverified",
  updatedAt: Date.now(),
};

const newServer = (): McpServerConfig => ({ id: createId("mcp-server"), name: "", url: "", enabled: true, directFetch: false, readOnlyOnly: true, discoveredTools: [], connectionStatus: "unverified", updatedAt: Date.now() });

function statusLabel(server: McpServerConfig): string {
  if (server.connectionStatus === "connected") return "已连接 · 只读工具已验证";
  if (server.connectionStatus === "checking") return "连接中…";
  if (server.connectionStatus === "error") return "连接失败 · 请重试";
  return "未验证 · 需先发现工具";
}

export function McpSettingsPanel() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [draft, setDraft] = useState<McpServerConfig | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let existing = loadMcpServers();
    const unverified = existing.filter((server) => !server.connectionStatus).map((server) => ({ ...server, connectionStatus: "unverified" as const }));
    if (unverified.length > 0) {
      unverified.forEach(upsertMcpServer);
      existing = loadMcpServers();
    }
    const research = existing.find((server) => server.id === RESEARCH_MCP_SERVER.id);
    if (research && (research.name !== RESEARCH_MCP_SERVER.name || research.directFetch !== RESEARCH_MCP_SERVER.directFetch)) {
      const renamed = {
        ...research,
        name: RESEARCH_MCP_SERVER.name,
        directFetch: RESEARCH_MCP_SERVER.directFetch,
        discoveredTools: [],
        connectionStatus: "unverified" as const,
        lastError: undefined,
        lastCheckedAt: undefined,
        updatedAt: Date.now(),
      };
      upsertMcpServer(renamed);
      existing = existing.map((server) => server.id === renamed.id ? renamed : server);
    }
    const hotSearch = existing.find((server) => server.id === HOTSEARCH_MCP_SERVER.id);
    if (hotSearch && hotSearch.name !== HOTSEARCH_MCP_SERVER.name) {
      const renamed = { ...hotSearch, name: HOTSEARCH_MCP_SERVER.name, updatedAt: Date.now() };
      upsertMcpServer(renamed);
      existing = existing.map((server) => server.id === renamed.id ? renamed : server);
    }
    if (existing.length === 0 && !readString(storageKeys.mcpResearchSeed).found) {
      upsertMcpServer(RESEARCH_MCP_SERVER);
      writeString(storageKeys.mcpResearchSeed, MCP_PRESET_SEED);
      existing = [RESEARCH_MCP_SERVER];
    }
    if (!existing.some((server) => server.id === HOTSEARCH_MCP_SERVER.id) && !readString(storageKeys.mcpHotSearchSeed).found) {
      upsertMcpServer(HOTSEARCH_MCP_SERVER);
      writeString(storageKeys.mcpHotSearchSeed, MCP_PRESET_SEED);
      existing = [...existing, HOTSEARCH_MCP_SERVER];
    }
    setServers(existing);
  }, []);
  const activeCount = useMemo(() => servers.filter((server) => server.enabled).length, [servers]);

  const beginEdit = (server: McpServerConfig) => { setDraft({ ...server, discoveredTools: server.discoveredTools.map((tool) => ({ ...tool })) }); setToken(""); setMessage(""); };
  const persist = (server: McpServerConfig) => {
    const normalizedUrl = server.url.trim();
    const previous = loadMcpServers().find((item) => item.id === server.id);
    const endpointChanged = Boolean(previous && (previous.url !== normalizedUrl || previous.directFetch !== server.directFetch));
    const next = {
      ...server,
      name: server.name.trim() || "未命名 MCP",
      url: normalizedUrl,
      ...(endpointChanged ? { discoveredTools: [], connectionStatus: "unverified" as const, lastError: undefined, lastCheckedAt: undefined } : {}),
      updatedAt: Date.now(),
    };
    const result = upsertMcpServer(next);
    if (!result.success) { setMessage("保存失败：本地存储不可用。"); return false; }
    setServers(loadMcpServers()); setDraft(null); setMessage("已保存。令牌仅保存在当前页面会话中。"); return true;
  };
  const refreshTools = async (server: McpServerConfig) => {
    setBusy(server.id); setMessage("");
    const checking = { ...server, connectionStatus: "checking" as const, lastError: undefined, updatedAt: Date.now() };
    upsertMcpServer(checking); setServers(loadMcpServers());
    try {
      const tools = await discoverMcpTools(checking);
      const next = { ...checking, discoveredTools: tools, connectionStatus: "connected" as const, lastCheckedAt: Date.now(), lastError: undefined, updatedAt: Date.now() };
      upsertMcpServer(next); setServers(loadMcpServers()); setExpanded(server.id); setMessage(`已发现 ${tools.length} 个工具；只有标记为只读的工具会启用。`);
    } catch (error) {
      const rawDetail = error instanceof Error ? error.message : "MCP 发现失败。";
      const isPublicHotSearch = server.id === "hotsearch-mcp" || server.url.includes("mcp.pianam.cn");
      const detail = isPublicHotSearch && (rawDetail.includes("上游连接") || rawDetail.includes("fetch failed") || rawDetail.includes("502"))
        ? `${rawDetail} 热搜公共端点当前不可达，请在“编辑”中填入自托管 MCP 的 /mcp 地址。`
        : rawDetail;
      const failed = { ...checking, connectionStatus: "error" as const, lastCheckedAt: Date.now(), lastError: detail, updatedAt: Date.now() };
      upsertMcpServer(failed); setServers(loadMcpServers()); setExpanded(server.id); setMessage(`连接失败：${detail}`);
    }
    finally { setBusy(null); }
  };
  const toggleTool = (server: McpServerConfig, toolName: string) => {
    const next = { ...server, discoveredTools: server.discoveredTools.map((tool) => tool.name === toolName && tool.readOnly ? { ...tool, enabled: !tool.enabled } : tool), updatedAt: Date.now() };
    upsertMcpServer(next); setServers(loadMcpServers());
  };

  return <div className="space-y-3 text-left" data-mcp-settings>
    <div className="settings-section-header">外部 MCP（只读）</div>
    <section className="settings-card rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm space-y-3">
      <div className="flex items-start gap-3"><Plug className="mt-0.5 h-5 w-5 shrink-0 text-[var(--button-primary-bg)]" /><div><h3 className="text-sm font-bold">聊天内临时调用外部工具</h3><p className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">仅调用服务器明确标记为只读的工具。配置保存到本机，令牌不会写入备份或本地存储；调用结果只存在当前回复。</p></div></div>
      <button type="button" onClick={() => { setDraft(newServer()); setToken(""); setMessage(""); }} className="w-full rounded-xl bg-[var(--button-primary-bg)] px-3 py-2 text-xs font-bold text-[var(--button-primary-text)]">添加 MCP 服务</button>
      {message && <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">{message}</div>}
    </section>

    {servers.length === 0 && <div className="rounded-[16px] border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-secondary)]">还没有外部 MCP 服务。添加后可发现只读工具。</div>}
    {servers.map((server) => <section key={server.id} className="settings-card rounded-[16px] border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3"><button type="button" onClick={() => setExpanded(expanded === server.id ? null : server.id)} className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-bold">{server.name || "未命名 MCP"}</div><div className="truncate text-[10px] text-[var(--text-secondary)]">{server.url}</div><div className={`mt-1 text-[10px] ${server.connectionStatus === "connected" ? "text-emerald-600" : server.connectionStatus === "error" ? "text-rose-500" : "text-[var(--text-secondary)]"}`}>{statusLabel(server)}</div></button><label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]"><input type="checkbox" checked={server.enabled} onChange={(event) => { const next = { ...server, enabled: event.target.checked, updatedAt: Date.now() }; upsertMcpServer(next); setServers(loadMcpServers()); }} />启用</label><button type="button" onClick={() => beginEdit(server)} className="rounded-lg px-2 py-1 text-[11px] text-[var(--button-primary-bg)]">编辑</button><button type="button" onClick={() => { removeMcpServer(server.id); setServers(loadMcpServers()); }} className="rounded-lg p-1 text-rose-500" aria-label="删除 MCP 服务"><Trash2 className="h-4 w-4" /></button>{expanded === server.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
      {expanded === server.id && <div className="border-t border-[var(--divider)] px-4 py-3 space-y-2"><button type="button" onClick={() => void refreshTools(server)} disabled={busy === server.id} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy === server.id ? "animate-spin" : ""}`} />{busy === server.id ? "发现中…" : "重新发现只读工具"}</button>{server.connectionStatus === "error" && server.lastError && <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] leading-relaxed text-rose-600">{server.lastError}</p>}{server.connectionStatus !== "connected" && server.discoveredTools.length > 0 && <p className="text-[10px] text-amber-700">以下是历史工具记录，重新发现成功前不会参与聊天调用。</p>}{server.discoveredTools.length === 0 ? <p className="text-[10px] text-[var(--text-secondary)]">尚未发现工具。</p> : server.discoveredTools.map((tool) => <label key={tool.name} className="flex items-start gap-2 rounded-lg bg-[var(--surface-muted)] p-2 text-[11px]"><input type="checkbox" checked={tool.enabled && server.connectionStatus === "connected"} disabled={!tool.readOnly || server.connectionStatus !== "connected"} onChange={() => toggleTool(server, tool.name)} /><span><span className="font-semibold">{tool.name}</span>{!tool.readOnly && <span className="ml-1 text-rose-500">（非只读，已禁用）</span>}{server.connectionStatus !== "connected" && tool.readOnly && <span className="ml-1 text-amber-700">（待验证）</span>}<span className="block text-[10px] text-[var(--text-secondary)]">{tool.description || "无描述"}</span></span></label>)}</div>}
    </section>)}

    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--surface)] p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h3 className="text-base font-bold">{draft.url ? "编辑 MCP 服务" : "添加 MCP 服务"}</h3><button type="button" onClick={() => setDraft(null)} className="text-lg text-[var(--text-secondary)]">×</button></div><div className="space-y-3"><label className="block text-xs font-bold">名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="例如：我的知识库" /></label><label className="block text-xs font-bold">MCP 地址<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="https://example.com/mcp" inputMode="url" /></label><label className="block text-xs font-bold">本次会话令牌（可选）<input value={token} onChange={(event) => setToken(event.target.value)} type="password" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="不会保存" autoComplete="off" /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.directFetch} onChange={(event) => setDraft({ ...draft, directFetch: event.target.checked })} />浏览器直连（需要 MCP 服务允许 CORS）</label><p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">关闭直连时使用米饭机同源代理；代理只接受 HTTPS 或本机开发地址，并限制为 POST JSON-RPC。</p><div className="flex gap-2"><button type="button" onClick={() => setDraft(null)} className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-xs">取消</button><button type="button" onClick={() => { if (!draft.url.trim()) { setMessage("请填写 MCP 地址。"); return; } setMcpSessionToken(draft.id, token); if (persist(draft)) void refreshTools({ ...draft, name: draft.name.trim() || "未命名 MCP", url: draft.url.trim() }); }} className="flex-1 rounded-xl bg-[var(--button-primary-bg)] px-3 py-2 text-xs font-bold text-[var(--button-primary-text)]"><Check className="mr-1 inline h-3.5 w-3.5" />保存并发现</button></div></div></div></div>}
    <a href="https://modelcontextprotocol.io/" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-[10px] text-[var(--text-secondary)]">MCP 协议说明 <ExternalLink className="h-3 w-3" /></a>
    <span className="sr-only">当前启用服务 {activeCount}</span>
  </div>;
}
