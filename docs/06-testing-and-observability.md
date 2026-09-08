# 测试与可观测性契约

## 基线

本批开始前在独立 worktree、批准 commit 上完成：`npm ci`、`npm run lint`、
`npm test`（531/531）、`npm run build`。build 的 Service Worker 指纹生成物已
回退，baseline worktree clean；原仓库保持 clean。

## AI accounting 覆盖

测试应观察当前调用次数，不把“一次用户动作只能一次 Provider 请求”当成目标：

1. 正常直连成功；
2. send-only/空发送不产生 AI 请求；
3. 结构格式重试；
4. alias identity 重试；
5. context-too-large 恢复；
6. 后端网络失败后的浏览器直连回退；
7. Provider 明确 4xx 不回退；
8. 达到阈值后自动 memory_extract 是独立 purpose，可关联父动作；
9. diary_generate 是独立 purpose，不混入普通 chat_reply。

## 断言重点

- 既有 Prompt、请求体、输出协议和错误类型保持不变；
- Provider request count 与当前实现一致；
- ledger 不含 key、Authorization、完整 prompt 或聊天正文；
- 新测试失败时先修实现或合同，不删除/跳过既有测试。

