# 阅读应用 Round 10：Prompt Adapter 与记忆候选确认协议

## 设计锁定

共读模型调用前必须经过 `readingPromptAdapter.ts`。上下文优先级固定为：

角色卡/人设 > 当前关系 > 表达习惯 > AI 已知阅读边界 > 当前段落或讨论 > 共读软指导 > 通用活人感建议。

Adapter 只投影角色卡必要文本、关系阶段、AI 已知段落和用户主动透露的冻结片段；不输出任何存储 ID，不发送整本小说，也不发送 blocked 或未来段落。共读软指导不得统一所有好友的语气，AI 不得猜测未来剧情或替用户做决定。

## 结构化回复

`readingAiResponseProtocol.ts` 定义 `comment`、`discussion_reply`、`invitation_reply` 三种回复。API 返回必须先校验 `kind`、`body`、`source`、`isSpoiler`；目标段落必须属于 AI 已知或用户主动透露集合，主动透露内容必须绑定段落。未知、跨书或未来锚点直接拒绝。

## 记忆准入

AI 生成的长期事实只能成为 `ReadingAiMemoryCandidate`，候选不会自动写入 Memory 或主记忆。用户明确确认后，`confirmReadingMemoryCandidate` 才生成带 `relationId`、`sourceReadingRoomId` 和 `sourceReadingEvidence` 的 `MemoryItem`，从而保证同一本书与不同 AI 好友之间不会混淆。

本轮测试覆盖角色卡优先、blocked 文本不出境、未来锚点拒绝、候选未自动持久化以及确认后的关系证据。
