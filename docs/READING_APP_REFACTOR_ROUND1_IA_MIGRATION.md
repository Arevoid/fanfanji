# 阅读应用重构第 1 轮：信息架构与兼容边界

## 目标

阅读应用根页面固定为三个一级入口：`书架`、`共读`、`世界`。本轮只重组展示层，不重写既有阅读、共读或故事存档。

## 三个一级空间

- **书架**：`ReadingBook` 与个人阅读进度的入口。书是内容资产，不因为参与共读或穿书而复制。
- **共读**：关系活动投影。普通共读房间与 AI 好友共同穿书都在这里出现；同一本书与不同好友始终是不同条目。
- **世界**：故事宇宙投影。单人穿书和共同穿书都在这里出现。共同穿书在“共读”和“世界”中展示的是同一份 `ReadingCoStoryState`，不是两套存档。

## 兼容策略

现有五个仓储及版本保持不变：

- `readingStore`：书籍、章节、锚点、进度、标注和阅读偏好；
- `readingCoReadingStore`：共读房间、AI 阅读边界、评论和讨论；
- `readingAnalysisStore`：分析任务与 Book Bible；
- `readingStoryStore`：单人故事、回合和存档；
- `readingCoStoryStore`：AI 好友共同故事和回合。

新版根页面只调用 `readingNavigation.ts` 生成临时 UI 投影，不增加新 localStorage key，不修改旧记录，不在仓储间复制对象。因此旧用户打开新版页面即可继续使用原有数据；回退旧版页面时数据也仍可读取。

## 隔离规则

所有投影先按 `userIdentityId` 过滤。普通共读的稳定边界是 `userIdentityId + readingRoomId + relationId + characterId + bookId`；共同穿书的稳定边界是 `userIdentityId + coStoryId + relationId + characterId`。标题和封面只是展示信息，不能参与数据归属判断。

同一本书与好友 A、好友 B 共读，会产生两个 room 投影；搜索、排序或 UI 合并不得按 `bookId` 去重。共同穿书同时出现在两个导航栏目时，两个卡片必须保留同一个 `sourceId/coStoryId`。

## 路由约定

根导航状态为 `shelf | co_reading | world`，属于页面临时状态，不持久化。阅读器、书籍详情、共读房间和故事正文仍作为根页面上方的子页面打开，关闭后回到进入前的根栏目。

第 3 轮再调整书籍卡片的短按/长按语义；本轮封面短按仍进入既有书籍详情，避免提前改变操作协议。

## 后续迁移触发条件

只有出现无法通过投影表达的新字段时才提升对应仓储版本，并提供逐版本 normalization。底部导航、筛选、排序、角标、封面网格均不是存储迁移理由。书籍封面继续复用 `ReadingBook.coverUrl`，字体继续引用全局 `fontAssetId`。
