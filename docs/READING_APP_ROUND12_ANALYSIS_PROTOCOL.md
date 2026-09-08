# 阅读应用 Round 12：分析 Prompt 与结构化结果协议

## Prompt 边界

`buildReadingChapterAnalysisPrompt` 只接收一个已验证章节及最多 16000 字正文，前后文只能是有限摘要。Prompt 文本不包含身份、书籍、任务等存储 ID，也不接收整本小说。模型必须声明只依据当前章节，不得把推测当成事实。

## 结果协议

`validateReadingChapterAnalysisResponse` 校验摘要、要点、人物/地点/势力/事件实体、置信度和可选 Book Bible 增量。长度、数组数量、实体类型和属性值都会被限制，未知结构不能直接进入仓储。

## 检查点提交

`commitReadingChapterAnalysisResult` 的顺序是：

1. 验证任务和章节属于当前身份/书籍；
2. 保存章节摘要和实体索引；
3. 保存可选 Book Bible 增量；
4. 所有保存成功后才推进章节检查点。

因此模型返回失败或仓储写入失败时，不会把任务错误标记成“已完成”。实体 ID 根据身份、书籍、类型和名称稳定生成，重复分析同一版本可以幂等更新。

本轮没有绑定具体 API 供应商；下一轮可在现有 API 层调用 Prompt，并将 JSON 返回交给协议校验后再提交。
