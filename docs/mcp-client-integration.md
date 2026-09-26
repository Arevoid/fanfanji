# MCP 外部只读客户端（阶段 1）

## 范围

米饭机作为外部 MCP Client，支持用户在设置中登记 Streamable HTTP MCP 服务，发现工具并只启用服务器声明为只读的工具。第一阶段不增加桌面应用、不引入新的 AI Provider，也不替换现有聊天、记忆和 IndexedDB 存储层。

聊天调用是“本轮临时调用”：模型需要外部信息时返回受限的 JSON 标记，浏览器执行一次 `tools/call`，再把结果放回同一轮请求的临时系统上下文。工具结果不写入聊天记录、记忆提取、AI ledger 或备份；若工具失败，禁止编造结果。每轮最多一次工具调用，防止递归和费用失控。

## 数据与安全

- `phone_mcp_servers_v1` 由 `storageAdapter` 写入，只保存服务 ID、名称、URL、启用状态和发现到的只读工具元数据。
- OAuth、Bearer/API token、MCP session ID 只在当前页面内存中保存，刷新后需重新输入；不会进入系统备份、导出文件或 AI 请求 ledger。
- 默认走 `/api/mcp-proxy` 同源代理。代理只接受 POST JSON-RPC，生产环境仅允许 HTTPS，开发环境额外允许 localhost；拒绝凭据 URL、私网地址、超大响应。开启浏览器直连时由用户承担 CORS 前提。
- 所有跨域和网络响应都做大小限制，二进制工具内容不会注入提示词，只保留文本或截断后的结构化结果。
- 数据管理新增“MCP 工具”独立清理项，删除 MCP 配置不会触碰聊天、角色和记忆数据。

## 目录与依赖边界

- `src/domain/mcp/mcpTypes.ts`：纯领域契约。
- `src/core/storage/repositories/mcpServerRepository.ts`：唯一持久化入口。
- `src/features/mcp/mcpClient.ts`：Streamable HTTP JSON-RPC、发现和只读调用。
- `src/features/mcp/mcpChatRuntime.ts`：聊天本轮工具编排，不修改持久化历史。
- `src/features/mcp/components/McpSettingsPanel.tsx`：既有“设置”页内的功能面板，不新增桌面应用注册。
- `src/server/mcpProxy.ts`、`server.ts`、`src/cloudflare/worker.ts`：同源代理及部署镜像。

## 兼容与后续

现有文本 Provider 不暴露统一原生 tool-calling，因此阶段 1 使用 provider-neutral marker；后续若接入官方 SDK，应在 `textProtocolAdapters` 增加原生工具协议并保留本阶段安全策略。新增 MCP 服务必须继续经过仓储、备份/清理和门禁测试，不得在 UI 中直接写第二套 localStorage key。

## 预置研究服务

设置页首次进入 MCP 且本机尚无 MCP 配置时，会一次性预置「联网」，地址为 `https://mcp.exa.ai/mcp`，并默认浏览器直连（Exa 允许 CORS；米饭机的 Cloudflare Worker 代理可能被 Exa 的边缘防护拦截）。工具列表必须经过实时 `initialize` 与 `tools/list` 后才会显示为可用；旧版本留下的工具元数据会标为“待验证”，不会直接参与聊天调用。Exa 官方说明该 MCP URL 可直接连接且无需先填写 API Key；实际使用仍受其服务限流与条款约束。用户删除配置后不会自动恢复，除非同时清除 MCP 数据并再次进入设置。

若本机已有「联网」配置，设置页会自动把旧显示名 `Research MCP · 联网研究 MCP` 迁移为「联网」。同时会一次性加入「热搜」，地址为 `https://mcp.pianam.cn/hot-mcp/mcp`，但不会预填虚假的已发现工具；必须实时发现成功后才能参与聊天调用。该服务的公开说明称无需账号或 API Key；如果公共端点不可达，设置页会保留失败原因和最近检查时间，用户可改为自己的自托管 `/mcp` 地址，不影响其他 MCP 服务。

热搜服务建议自托管以避免公共端点的网络或证书波动。可按其项目说明使用 Docker 启动：

```bash
docker run --rm -p 8000:8000 ghcr.io/boy-373/hot-trending-mcp:latest
```

开发环境可填 `http://127.0.0.1:8000/mcp`；生产环境应通过 HTTPS 反向代理后再填入公网 `/mcp` 地址。自托管服务需要在 `tools/list` 中为只读工具返回 `annotations.readOnlyHint: true`，否则米饭机会出于安全原因禁用它们。
