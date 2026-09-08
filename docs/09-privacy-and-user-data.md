# 隐私与用户数据边界

## 允许记录

requestId、parentActionId、purpose、作用域 ID、provider/model、脱敏 endpoint、
transport、时间、耗时、状态、错误类别、token 估算/usage、重试/回退次数和
reason、uncertain-delivery。

## 明确禁止记录

- API key、Authorization header、完整 URL query；
- 完整 Prompt、system instruction、聊天历史、记忆内容、图片/音频正文；
- Provider 原始响应体或可反推出私密上下文的日志副本。

作用域 ID 也不应被当作内容备份；它们只帮助本地诊断请求归属。任何新的调试
输出必须走独立的、短期且用户明确开启的 prompt debug 通道，不得混入 durable
ledger。

