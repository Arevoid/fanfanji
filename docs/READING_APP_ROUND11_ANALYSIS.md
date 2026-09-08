# 阅读应用 Round 11：小说分析基础层

本轮开始第三阶段“小说分析”，但暂不接入具体模型供应商。

## 数据与隔离

分析数据使用独立的 `phone_reading_analysis_store_v1`，所有记录都绑定 `userIdentityId + bookId`：

- `ReadingAnalysisTask`：分析类型、输入版本、章节队列、已完成章节、检查点、尝试次数和失败原因。
- `ReadingChapterSummary`：章节摘要、要点、来源哈希和分析版本。
- `ReadingAnalysisEntity`：人物、地点、势力、事件索引及其章节引用。
- `ReadingBookBible`：故事 premise、世界规则、故事线、核心人物/地点/势力、时间线，以及用户编辑标记。

不同身份即使使用相同 `bookId` 也不会互相读取分析结果。

## 任务恢复

任务状态为 `queued → running → completed`，失败进入 `failed` 并保留 `completedChapterIds` 与 `checkpointIndex`。重试会增加 attempts，从最近检查点继续，不重复已完成章节。输入版本变化时应创建新任务，不能覆盖旧分析结果。

## API 输入边界

`prepareChapterAnalysisRequest` 只接受当前身份当前书籍的单个章节，并将章节正文限制在 16000 字符，允许附带有限的前后章节摘要。它不会接收整本小说，也不会把存储 ID发送给模型。后续模型适配器必须在此请求基础上继续做字段投影和结构化输出校验。

本轮测试覆盖任务检查点恢复、失败重试、章节越权拒绝、正文长度限制、实体索引和 Book Bible 隔离。
