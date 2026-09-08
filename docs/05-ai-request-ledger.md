# AI Request Ledger 设计

## 存储与读取

浏览器端账本使用现有 `storageAdapter` 的 localStorage 通道，键为
`fanfan_ai_request_ledger_v1`，保留有限窗口和最大条数。它是诊断记录，不是
聊天、记忆或业务事实；后续可替换为 IndexedDB，但本轮不迁移。

导出的读取函数只返回已归一化的 Envelope 数组。未来 UI 可按
`parentActionId`、purpose、时间和 status 查看；第一批不新增完整管理页面。

## 记录原则

- 一条 Ledger record 对应一个逻辑 AI request；`providerRequestCount` 统计该逻辑请求内部的 provider attempts 总数。
- backend → browser fallback 属于同一逻辑 request 的多个 attempts；format、alias、context retry 会产生新的逻辑 record，并通过相同 `parentActionId` 关联。
- 当前没有逐 attempt 独立日志；provider/model/transport 表示该逻辑 record 的最后一次 attempt 状态。
- retry/fallback reason 只允许写入受控 code。已知 code 包括：
  `format_validation`、`context_too_large`、`degenerate_response`、`alias_identity`、
  `backend_network`、`backend_route_missing`、`backend_test_key`、
  `backend_model_list`、`backend_memory_extraction`、`backend_personality_summary`、
  `backend_translation`、`translation_route_missing`；未知值会降级为
  `unknown_retry` 或 `unknown_fallback`，不会保存原始异常文本。
- 记录失败不能改变原有错误处理；storage 不可用时仅保留内存诊断并继续业务。
- 只保存估算 token 或供应商明确返回的 usage；不得把字符数伪装成真实 token。

## 持久化策略

记录先进入有界内存队列，随后在短延迟内合并 flush；一次 flush 才会读取并整体写入
localStorage。页面离开时做一次 best-effort flush。flush 写入前会重新读取当前存储并按
`requestId` 合并，降低多标签页 last-write-wins 丢记录的概率。所有持久化失败都只保留
内存诊断并告警，不会改变原始 AI 请求结果。

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
