# 阅读应用 Round 16：穿书 Prompt 与真实回合生成

本轮把单人穿书页面连接到现有文本 API 适配器。

## 安全 Prompt

`buildReadingStoryPrompt` 只投影当前故事状态、最近 4 个回合和本轮用户行动，不序列化 `userIdentityId`、`storyId`，也不读取现实聊天 Memory、共读房间或整本小说正文。系统提示明确禁止替用户做重大决定，并要求 JSON 输出。

## 回合生成流程

`generateReadingStoryTurn` 会校验 API 配置，调用 `apiChat`，解析普通 JSON 或 fenced JSON，最多重试一次格式错误，然后交给 `validateReadingStoryTurnResult`。校验通过后才调用 `commitReadingStoryTurn` 保存回合和状态；失败不会推进章节或写入正文。

UI 已把应用设置传给穿书页，下一步行动会使用当前配置的文本 API。若没有 API Key，页面会明确提示配置缺失，不会伪造剧情。
