# AI Request Envelope 合同

## 作用

Envelope 是一次逻辑 AI 请求的非业务元数据边界。它包住已有请求，不拥有
Prompt、Context、Provider 选择或响应协议。调用方可以提供 `parentActionId`，
把一次用户动作产生的多个子请求关联起来。

## 字段

| 字段 | 说明 |
| --- | --- |
| `requestId` | 每条账本记录唯一 ID。 |
| `parentActionId` | 同一用户动作/批任务的关联 ID，可为空。 |
| `purpose` | `AiPurpose` 枚举，不用自由文本替代。 |
| `characterId` / `relationId` / `conversationId` | 有作用域时记录 ID；没有则省略。 |
| `provider` / `model` | 供应商标识和模型名；不记录 key。 |
| `endpoint` / `transport` | 去除 query、fragment 和凭据后的端点及传输路径。 |
| `startedAt` / `durationMs` | 开始时间和耗时。 |
| `status` / `errorCategory` | 成功/失败及归一化错误类别。 |
| `estimatedInputTokens` / `estimatedOutputTokens` | 本地估算；不冒充供应商用量。 |
| `actualInputTokens` / `actualOutputTokens` | Provider 返回 usage 时才填写。 |
| `retryCount` / `retryReasons` | 已发生的同一逻辑请求重试。 |
| `fallbackCount` / `fallbackReasons` | 已发生的传输/Provider 回退。 |
| `uncertainDelivery` | 超时、断连等无法确定 Provider 是否收到时为 true。 |

另有 `providerRequestCount`、`inputCharacters`、`outputCharacters` 供账本审计，
不包含完整 Prompt、聊天记录、API key、Authorization 或原始响应体。

## 不变量

- 包装前后的 Prompt、Context、Provider、retry/fallback 条件和输出协议相同。
- Envelope 失败不得让原请求成功变失败；账本写入失败只告警，不阻塞业务。
- 不能从 `endpoint` 中持久化 API key 或 query 参数。

