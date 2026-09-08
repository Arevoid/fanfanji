# AI Request Ledger 设计

## 存储与读取

浏览器端账本使用现有 `storageAdapter` 的 localStorage 通道，键为
`fanfan_ai_request_ledger_v1`，保留有限窗口和最大条数。它是诊断记录，不是
聊天、记忆或业务事实；后续可替换为 IndexedDB，但本轮不迁移。

导出的读取函数只返回已归一化的 Envelope 数组。未来 UI 可按
`parentActionId`、purpose、时间和 status 查看；第一批不新增完整管理页面。

## 记录原则

- 每次逻辑入口完成时写一条详细记录；`providerRequestCount` 统计实际尝试。
- 网络回退、结构格式重试、别名/退化/上下文恢复等由调用方以 reason 标记。
- 记录失败不能改变原有错误处理；storage 不可用时仅保留内存诊断并继续业务。
- 只保存估算 token 或供应商明确返回的 usage；不得把字符数伪装成真实 token。

## 示例：普通聊天

```json
{
  "requestId": "ai-request-…",
  "parentActionId": "chat-action-…",
  "purpose": "chat_reply",
  "characterId": "character-123",
  "relationId": "relation-456",
  "conversationId": "conversation-789",
  "provider": "custom-openai-compatible",
  "model": "gemini-test",
  "endpoint": "https://provider.example/v1/chat/completions",
  "transport": "backend_proxy",
  "status": "success",
  "errorCategory": "none",
  "providerRequestCount": 1,
  "retryCount": 0,
  "fallbackCount": 0,
  "uncertainDelivery": false,
  "estimatedInputTokens": 1200,
  "estimatedOutputTokens": 180,
  "startedAt": 1760000000000,
  "durationMs": 820
}
```

示例中的 ID、模型和端点是元数据；真实记录永远不应附带完整 prompt、聊天
正文或凭据。

