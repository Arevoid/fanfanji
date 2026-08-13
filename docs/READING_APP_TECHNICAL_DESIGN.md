# 阅读应用技术设计（Round 1 基线）

> 状态：第一阶段 Round 1～6 已完成；稳定本地阅读器、阅读工具与完整阅读归档均已落地。
> 产品基线：`docs/READING_APP_PRODUCT_BASELINE.md`。
> 当前阶段：第一阶段第 6 轮——搜索、标注、单书排版、全局字体引用与完整备份恢复。

## 1. 已锁定的默认决策

1. `reading` 注册为应用商店可安装应用，但本轮不修改任何用户的桌面或安装列表。
2. 老用户桌面永不因新增应用被补写；新用户是否默认安装留到应用接入轮次通过 fresh-install policy 决定。
3. 导入小说默认只保存在浏览器本地。只有用户主动启动 AI 分析时，才展示将发送的片段范围、目标 API、隐私与成本提示。
4. 第一阶段仅支持 TXT、Markdown 与上下连续滚动；EPUB、左右覆盖和左右滑动均不提前进入数据层或 UI。
5. 好友是 AI 角色，不设计另一真人账号、在线状态、双端同步或并发提交。

## 2. 领域边界

```text
private reading（第一阶段）
  userIdentityId + bookId
  ├─ 书籍元数据、章节、段落锚点
  ├─ 私人进度、书签、高亮、笔记
  └─ 单书排版覆盖（仅引用 fontAssetId）

relationship co-reading（第二阶段）
  userIdentityId + readingRoomId + relationId
  + characterId + conversationId + bookId
  ├─ AI 阅读游标与知识边界
  ├─ 房间评论、召唤、线程、未读状态
  └─ 经确认的 relation-scoped 记忆来源

hypothetical story universe（第四、五阶段）
  universeId + branchId + participantId
  ├─ 结构化宇宙事实、人物状态、情报与任务
  └─ 独立存档树；禁止自动写入现实关系事实
```

`bookId` 只标识共享的本地正文资源，永远不能替代个人身份、共读房间或关系作用域。

## 3. 第一阶段数据模型

模型定义位于 `src/domain/reading/types.ts`，存储结构版本为 `READING_STORE_VERSION = 1`。

### 3.1 ReadingBook

保存书名、作者、格式、来源文件、编码、内容哈希、Blob 引用、章节/字数统计、状态和时间戳。正文不进入此对象。

作用域：`userIdentityId + bookId`。同一份文件可被不同用户身份分别导入，不能通过哈希跨身份自动共享私人状态。

### 3.2 BookAsset

大文本使用 IndexedDB `FanfanjiReadingDB/assets` 保存：

- `assetId`：稳定 Blob 标识；
- `bookId`、`userIdentityId`：删除与访问校验；
- `blob`：原始 TXT/Markdown；
- `contentHash`、`byteLength`、`mimeType`、`createdAt`。

普通仓储只保存 `assetId`。删除书籍必须在元数据成功更新后清理关联 Blob；若 Blob 清理失败，应留下可重试的 orphan cleanup 任务，而不是谎报完整删除成功。

### 3.3 Chapter 与 ParagraphAnchor

- 章节记录顺序、标题、首尾段落及字数。
- 段落锚点由 `bookId + chapterId + ordinal + normalizedTextHash` 构成稳定身份。
- UI 改字号、字体、行距或视口宽度不会改变锚点。
- 目录重命名不改变章节 ID；重新导入新文件版本时通过文本哈希迁移锚点，不能使用屏幕页码作为持久化位置。

### 3.4 ReadingProgress

唯一键：`userIdentityId + bookId`。保存章节、段落锚点、段内字符偏移和可选滚动恢复提示。滚动像素只能作为提示，真实恢复以段落锚点为准。

### 3.5 ReadingAnnotation

支持 `bookmark | highlight | note`。每条记录绑定 `userIdentityId + bookId + chapterId + paragraphAnchorId`，并保存文本冻结快照与段内范围。第一阶段全部为私人内容；第二阶段分享时复制冻结快照到明确的 `readingRoomId`，不改变原记录可见性。

### 3.6 ReadingBookPreferences

保存单书排版覆盖。字体只保存全局字体资产的 `fontAssetId` 引用，不存重复 Blob。字体资产被删除时回退系统字体，不删除书籍设置的其他部分。

## 4. 普通仓储与 IndexedDB 边界

| 数据 | 存储 | 原因 |
| --- | --- | --- |
| 书籍、章节、锚点、进度、标注、偏好 | `phone_reading_store_v1` | 小型、结构化、需校验和迁移 |
| 原始 TXT/Markdown | `FanfanjiReadingDB/assets` | 大文本 Blob，不占 localStorage 配额 |
| 后续分析分片 | IndexedDB 独立 store（第三阶段） | 大型派生资料、可检查点恢复 |
| 后续共读房间 | 独立 relation-scoped repository（第二阶段） | 防止私人阅读与关系数据混表 |
| 后续故事宇宙 | 独立 IndexedDB/仓储（第四阶段） | 假设域与主记忆严格分离 |

仓储读取必须先 normalize。无效数组项被拒绝，旧版本只能通过明确 migration 升级；读取失败返回安全空仓储且不覆盖原始数据。

## 5. 安装、卸载与桌面规则

应用接入轮次必须分别处理：

1. `AppReading.tsx` 页面与懒加载 loader；
2. `APP_LOADERS`、`React.lazy` 和 `activeApp === "reading"` 渲染；
3. `AppIcons.reading()` 与 `desktopApps` 注册；
4. `AppStore.APPS_LIST` 商店卡；
5. `AppSettings.appKeys` 自定义图标入口；
6. 安装列表与桌面空位写入；
7. fresh-install policy（只允许真正新用户获得新默认应用）；
8. 懒加载、安装、卸载、刷新恢复和老用户桌面保护测试。

卸载 `reading` 只移除安装和桌面入口，不删除书籍。业务数据仅通过阅读内容管理或“清除全部应用数据”删除。

## 6. 备份、恢复、删除与清除

### 6.1 系统备份

阅读数据不能只把 `phone_reading_store_v1` 塞入现有 JSON 备份，否则恢复后会缺少正文 Blob。本轮因此只锁定协议，不把半成品键加入系统备份：

- 第六轮提供 Reading Archive（manifest JSON + 正文文件/Blob）。
- 全量系统备份若包含阅读元数据，必须同时包含 Reading Archive 或明确标记 `assetMissing`，不得显示完整恢复成功。
- 恢复先验证 manifest、版本、哈希和空间，再写 Blob，最后事务性替换元数据。
- 轻量备份默认不含小说正文。

### 6.2 删除与归档

- 归档只改变 `archivedAt/status`，保留正文和标注。
- 删除一本书前展示相关私人标注；第二阶段后还需展示共读房间与派生宇宙影响。
- 默认不级联删除进行中的共读/宇宙，而是保留冻结来源快照或阻止删除并要求选择。
- 内容哈希重复不等于同一业务实体，不能跨用户身份级联删除。

### 6.3 清除全部应用数据

`clearApplicationData` 必须调用 `readingAssetDb.clearAll()`，并在所有二进制仓库成功清理后才清 localStorage。失败时向上抛错，不能刷新后宣称成功。

## 7. AI 外发与隐私

第一阶段导入、搜索、章节识别和阅读全部本地运行。第三阶段开始 AI 分析时：

- 用户必须主动点击分析；
- UI 明示提供商/endpoint、发送片段、用途和预计调用量；
- 仅按章节或任务发送必要片段，不发送整本书；
- 任务记录 `taskId + inputVersion`，已完成分片不重复调用；
- 不把小说正文写入聊天 Memory、Truth Layer 或公开 Prompt。

## 8. 第一批代码与测试

本轮新增：

- `src/domain/reading/types.ts`：模型和存储版本；
- `src/domain/reading/normalization.ts`：安全规范化；
- `src/domain/reading/scope.ts`：私人/共读作用域匹配；
- `src/core/storage/repositories/readingRepository.ts`：元数据仓储；
- `src/core/storage/readingAssetDb.ts`：正文 Blob 仓库；
- `scripts/readingDomain.test.ts`：模型与隔离行为测试；
- `scripts/readingStorageIntegration.test.ts`：存储键、清理和边界接入测试。

首批隔离断言：

- 相同 `bookId`、不同 `userIdentityId` 的私人进度不能互相命中；
- 相同 `bookId/characterId`、不同 `readingRoomId/relationId` 的共读作用域不能匹配；
- 仅改变 `conversationId` 也必须拒绝匹配；
- normalize 丢弃缺少 owner/book/scope 的脏数据；
- 正文 Blob 不出现在 localStorage store；
- 全量清除入口包含阅读正文 DB。

## 9. 后续接入位置清单

| 位置 | 轮次 | 动作 |
| --- | --- | --- |
| `src/App.tsx` | 2 | loader、lazy、注册、渲染、props、安装行为 |
| `src/components/AppReading.tsx` | 2 起 | 应用壳与后续页面 |
| `src/components/AppStore.tsx` | 2 | 商店卡，不强塞老用户桌面 |
| `src/components/AppSettings.tsx` | 2/6 | 自定义图标；完整 Reading Archive |
| `src/components/AppIcons.tsx` 或现有图标注册处 | 2 | 黑白线性阅读图标 |
| `src/features/home/freshInstallPolicy.ts` | 2 | 新用户默认安装决策和旧用户保护 |
| `src/core/storage/storageKeys.ts` | 1 | `phone_reading_store_v1` |
| `src/features/settings/clearApplicationData.ts` | 1 | 清理阅读正文 DB |
| `src/utils/fontAssetDb.ts` | 6 | 只引用现有资产，不复制字体 |
| 系统备份/恢复 | 6 | 元数据 + Blob 完整归档、回滚与校验 |
| `src/features/reading/` | 3 起 | 导入、解析、检索、阅读服务与 UI 子组件 |
| `src/domain/reading/` | 1 起 | 纯模型、锚点、隔离、迁移和策略 |
| AI Prompt Builder/Adapter | 7 起 | deny-by-default 的共读知识投影 |
| Memory/Truth 写入服务 | 10 | 仅确认后的关系互动摘要 |

## 10. Round 1 完成标准

- 产品文档已进入项目 `docs/`。
- 数据模型、作用域、存储版本和 Blob 边界有代码定义。
- 应用接入、安装、卸载、备份、清除和字体引用规则已写明。
- 第一批仓储与隔离测试可执行。
- `npm run check` 通过。
- 不出现阅读 UI、不修改安装列表、不修改新老用户桌面、不发起网络请求。

## 11. Round 2 应用接入结果

- 新增 `src/components/AppReading.tsx`，作为可打开的懒加载应用壳；它只读取当前 `userIdentityId` 的本地书籍元数据，不执行导入或网络请求。
- `src/App.tsx` 已接入 `loadAppReading`、`APP_LOADERS`、`React.lazy`、默认图标、桌面注册和 `activeApp === "reading"` 渲染。
- `src/components/AppStore.tsx` 已增加“阅读”商店卡；安装继续复用通用 `handleInstallApp`，在桌面寻找空位并持久化安装列表。
- `src/components/AppSettings.tsx` 的自定义应用图标列表已包含 `reading`。
- 默认决策：新用户与老用户都不预装阅读。只有应用商店的明确安装操作才会把 `reading` 写入 `phone_installed_apps` 和桌面布局。
- 卸载只删除安装与桌面入口，不删除 `phone_reading_store_v1` 或 `FanfanjiReadingDB`。
- 新增 `scripts/readingAppFoundation.test.ts`，并把 AppReading 纳入全局懒加载测试。

Round 2 不包含：文件选择、编码检测、章节解析、书架编辑、阅读正文或 AI 功能。

## 12. Round 3 本地文件导入结果

- 新增 `src/features/reading/import/readingImport.ts`，第一阶段仅接受 TXT、Markdown 与 `.markdown` 文件。
- 解码顺序为 UTF-8 BOM、UTF-16 LE/BE BOM、严格 UTF-8，最后回退 GB18030；统一换行后保存为 UTF-8 Blob。
- 使用规范化正文的 SHA-256 作为内容哈希。重复检测只在同一 `userIdentityId` 内生效；不同身份永不自动共享或合并书籍。
- 默认拒绝同身份的重复内容，用户明确确认后可保留副本。
- 写入顺序为正文 Blob 后元数据；元数据保存失败时回滚新 Blob。元数据仓库无效或不可读时在任何写入前停止，防止覆盖损坏数据或制造孤立资源。
- `AppReading.tsx` 已提供真实文件选择、导入状态、隐私说明和当前身份书架列表；导入本身不发起网络请求。
- 新增 `scripts/readingImport.test.ts`，覆盖格式、编码、哈希、身份隔离、重复策略、事务回滚和损坏仓库保护。
- 实际浏览器验收已完成：从应用商店安装阅读、打开应用、选择 Markdown 文件，并在书架看到标题、字符数、格式和源编码。

Round 3 仍不包含章节解析、书籍详情、正文阅读、搜索、标注、备份归档或 AI 功能；这些依照既定轮次继续实现。

## 13. Round 4 书架、章节解析与内容管理结果

- 新增 `readingParser.ts`：识别 Markdown 标题以及常见中文/英文小说章名，生成确定性的章节 ID、段落 ID、正文哈希和字符偏移；同一书籍版本重复解析得到相同锚点，不同 `bookId` 不会碰撞。
- 新导入的书籍在元数据事务提交前完成章节与段落锚点解析；Round 3 已导入但 `chapterCount = 0` 的书籍在首次进入详情时自动补解析。
- 连续标题不会制造空章节；没有可识别章名的正文归入单一“正文”章节。
- 书架按当前 `userIdentityId` 读取，提供书架/归档分区、书籍资料编辑、文件信息和目录预览。
- 归档仅改变书籍状态并保留正文、目录、进度、偏好与标注；恢复后回到当前身份的书架。
- 永久删除按完整 `userIdentityId + bookId + assetId` 作用域执行。先事务性移除书籍及派生元数据并创建清理任务，再删除正文 Blob；Blob 清理失败时保留任务并在下次进入阅读应用时重试。
- 元数据删除未成功提交时绝不开始 Blob 删除；提交后的清理异常不会被错误描述为业务数据仍完整保留。
- 新增 `readingParser.test.ts` 和 `readingLibrary.test.ts`，覆盖稳定锚点、跨书防碰撞、身份隔离、资料编辑、归档恢复、级联删除、失败重试以及写入顺序。

Round 4 仍不包含正文阅读和进度恢复；目录项暂只用于检查解析结果，Round 5 将接入上下滚动阅读页和精确跳转。

## 14. Round 5 上下滚动阅读与进度恢复结果

- 新增 `readingReader.ts`：按 `userIdentityId + bookId + assetId` 加载正文 Blob，只组合属于同一身份和书籍的章节、锚点与文本切片。
- 正文版本与锚点范围不一致时拒绝继续读取并提示重新导入，不用错误偏移展示其他内容。
- 阅读位置保存为 `chapterId + paragraphAnchorId + characterOffset`；像素位置仅作为提示，恢复以稳定段落锚点和段内字符偏移为准。
- 百分比按所有可阅读段落的累计字符计算，不把章名、空行和文件分隔符计入阅读进度；第一段起点为 0%，最后一段末尾为 100%。
- 进度唯一键继续为 `userIdentityId + bookId`。保存当前身份的进度时不会覆盖具有相同 `bookId` 的其他身份记录，也不会更新其他身份的书架最近时间。
- 新增 `ReadingReader.tsx`：实现上下连续滚动正文、当前章节标题、目录抽屉、上一章/下一章、实时百分比、退出保存和再次打开恢复。
- 书籍详情显示“开始阅读/继续阅读”，书架卡片显示已读百分比；归档书籍不能直接进入正文。
- 新增 `readingReader.test.ts` 和 `readingReaderUi.test.ts`，覆盖正文作用域、同 ID 身份隔离、进度百分比、非法锚点拒绝、损坏仓库拒绝和垂直阅读 UI 约束。

Round 5 不包含字体排版面板、搜索、复制增强、高亮、笔记、书签或备份恢复；这些属于第一阶段第 6 轮。

## 15. Round 6 阅读工具与完整归档结果

- 阅读页新增全文本地搜索，结果携带章节、段落锚点和命中位置，可直接跳回稳定正文位置，不发送网络请求。
- 用户可通过系统文本选择精确选中段内范围；段落工具支持复制、范围高亮、范围笔记和段落书签。没有选区时快捷作用于整段。
- 高亮保存 `paragraphAnchorId + range + textSnapshot` 并按字符范围渲染；再次操作同一范围可取消。笔记和书签都继续按当前 `userIdentityId + bookId` 隔离。
- 单书设置支持字号、行间距、段间距、字间距、页边距、首行缩进、对齐、文字/背景主题；所有数值写入前都经过上下限校验。
- 字体只保存全局 `FontAsset` 的 `fontAssetId` 引用。阅读器运行时从全局字体仓库加载；关闭引用不会复制或删除字体 Blob。
- 新增独立 Reading Archive：导出当前身份的书籍元数据、正文 Blob、进度、标注和单书偏好；不包含其他身份的数据和未完成清理任务。
- 恢复时先校验归档类型、版本、UTF-8 正文和 SHA-256，再为目标身份重新生成书籍、资源、章节、锚点及标注 ID，避免与现有书架碰撞。
- 恢复采用“先写新 Blob、再提交合并元数据”的事务顺序；任何正文或元数据失败都会回滚本次已写入 Blob，不改动原书架。
- 系统 JSON 备份继续不包含小说正文，也不宣称能恢复阅读数据；设置页明确引导用户在阅读应用导出独立完整归档。
- 新增 `readingTools.test.ts`、`readingArchive.test.ts` 和 `readingRound6Ui.test.ts`，覆盖偏好约束、范围标注、身份隔离、搜索、完整往返、哈希拒绝、回滚和 UI 接入。

第一阶段至此完成。仍未进入范围：EPUB、左右翻页、TTS、AI 共读、小说分析和穿书；下一阶段从独立 AI 好友共读房间与知识边界开始。
