# 饭饭机会话交接：角色手机内容生成修复

最后更新：2026-09-04

这是一份给新 Codex 会话的动态交接文档。新会话先完整阅读本文件，再完整阅读 `docs/CODEX_PROJECT_HANDOFF.md`，然后执行 `git status --short`。本文记录当前任务、已完成内容、验证证据和真实的后续边界；长期架构规则以 `docs/CODEX_PROJECT_HANDOFF.md` 为准。

## 当前仓库状态

- 仓库：`C:\Users\Administrator\Documents\Codex\fanfanji`
- 分支：`agent/relationship-isolation`
- 当前代码提交：`c66211d fix: make character phone content context driven`
- 该提交已推送到：`origin/agent/relationship-isolation`
- 本次交接文档是在该提交之后新增/更新的；若文档尚未提交，先保留文档并不要用破坏性 Git 命令清理。
- 本地开发服务此前运行在 `http://127.0.0.1:3000`；若服务已停止，使用 `npm.cmd run dev -- --host 127.0.0.1 --port 3000` 启动。
- 右侧浏览器验收地址：`http://127.0.0.1:3000/?characterPhoneTest=1&phoneLayout=2`。

## 本次任务是什么

修复角色手机内容生成逻辑。产品设定是：角色被当作真实的人，角色手机是他自己的真实手机；手机中的聊天、联系人、朋友圈、浏览、日程、日记、备忘录、相册和音乐都要根据该角色的人设、角色卡、相关世界书、最近上下文和已有手机记录形成，不能把人设文件名、世界书标题或字段名当成角色姓名和正文，也不能让不同角色的手机内容串线。

本轮还落实了用户最后确认的交互：进入/解锁手机只解锁，不生成或追加内容；进入手机后点击桌面右上角的纯图标，才调用生成/追加逻辑。

## 已完成的实现

### 1. 角色手机作用域与上下文同步

- 每个角色手机按 `ownerIdentityId + characterId` 单独持久化；不能只按 `characterId` 查找或合并。
- 新建或进入角色手机时，只做本地、确定性的上下文同步，不调用 AI：
  - 同步当前用户与该角色的聊天镜像；
  - 保留/补充与该角色明确有关联的角色联系人；
  - 从人设/世界书中提取有明确关系依据的 NPC；
  - 同步角色本人、当前用户以及角色认识的 NPC 可见朋友圈；
  - 同步用户手机的音乐源，但没有用户音乐源时保持空；
  - 清理旧版本硬编码演示数据和遗留重复数据。
- 用户不认识该角色的好友不会因为“用户手机里存在”就出现在角色手机联系人或朋友圈中。
- 用户头像更新后，角色手机中来自用户的朋友圈记录会刷新头像，不继续使用旧头像。
- 角色手机联系人被删除是软删除：隐藏联系人但保留旧线程和可发现的操作事实，不清空聊天记录。

### 2. 生成/追加逻辑

- `src/features/characterPhone/characterPhoneProgression.ts` 负责 AI 生成/解析；`AppCharacterPhone.tsx` 的 `generateCharacterPhoneContent` 是唯一 UI 生成入口。
- 解锁函数 `verifyPasscode` 不再调用 `advanceCharacterPhone` 或 `discoverCharacterPhoneActions`。
- 生成按钮只有一个 `RefreshCw` 图标，没有可见文字或白色底板；生成过程中禁用并旋转。
- Prompt 明确要求：内容来自角色卡、人设、相关世界书、最近聊天/朋友圈/手机记录的合理延伸；每次只生成少量最有依据的字段，其余留空。
- API 返回先做 JSON 解析和字段清洗，再写入本地；失败、无 API Key、无模型或非法 JSON 都只保留本地已有内容，不用模板补齐。
- 浏览器只保存/显示搜索记录标题；日记是角色隐私日志；备忘录和日程是具体事项；相册只记录真实可能保存的图片或文字图描述。
- NPC 对话写入对应 NPC 的独立线程，不写进角色与用户的聊天镜像；无法唯一确定联系人时不生成该聊天。
- 生成联系人必须能在已有上下文中找到名字依据；上下文外的随机 NPC 和文件名联系人会被拒绝。
- AI 生成的内容不会自动写入长期事实层。

### 3. 旧数据、音乐和持久化修复

- `src/core/storage/repositories/characterPhoneRepository.ts` 在读取/保存时规范化音乐 ID，防止重复拼接 `character-phone:<phoneId>:music:` 导致 localStorage 膨胀和配额错误。
- 旧版演示曲目 `Night Mood`、`Quiet City Lights`、`Soft Rain`、`First Light` 在没有真实来源时会被清理；没有用户音乐源时音乐页显示空状态，不制造收听历史和播放列表。
- 旧版硬编码联系人、聊天、浏览、日记、日程、备忘录、待办、朋友圈和无真实图片的相册演示记录会在该角色手机进入/同步时清理；用户真实消息、收到的图片、用户生成的文字图和有资产的内容会保留。
- 生成的待办不会在下一次同步时被误删；只清理旧版 seed ID。
- 不要为了修复 API 或页面显示而直接清空 `localStorage`、IndexedDB、聊天、记忆或角色手机数据。

### 4. 角色手机 UI 已完成的相关修复

- 锁屏顶部是选择人物；密码键盘 `0` 位于 `2/5/8` 中轴；“忘记密码”跳转当前角色聊天；“取消”返回桌面。
- 桌面右上角显示纯生成图标，不显示角色头像/名字，不显示文字和额外白底。
- 日记支持公开/隐藏边界，连续点击五次 `Hiding + 数字` 进入隐藏日记；`See All` 展示全部可见日记且不带右箭头；新建使用悬浮 `+`。
- 相册按日期分组，支持隐藏、最近删除、删除和恢复；文字图是本地 SVG/文字图，不调用生图 API。
- 音乐首页、播放列表、播放页有独立的固定底部导航；导航容器实测高度 64px，三个按钮各 48px；无音乐时不显示虚构曲目和虚构统计。
- 浏览器搜索框强制透明背景；日程默认选中今天；备忘录和待办没有预设条目。
- 设置支持角色专属壁纸和逐应用自定义图标。
- 角色手机操作写入隐藏 `actionLog`；部分行为可被角色发现，发现后通过角色聊天产生反应；该机制不要绕过检测服务直接写普通消息。

## 关键文件

- `src/components/AppCharacterPhone.tsx`：角色手机容器、锁屏、桌面、应用页面、生成图标和用户操作入口。
- `src/features/characterPhone/characterPhoneContent.ts`：本地上下文同步、用户聊天/朋友圈/联系人/音乐源映射、旧预设清理和幂等归一化。
- `src/features/characterPhone/characterPhoneProgression.ts`：API Prompt、生成 JSON 校验、文件名过滤、占位内容过滤、联系人线程绑定和追加写入。
- `src/features/characterPhone/characterPhoneDetection.ts`：角色对用户操作的发现判定。
- `src/features/characterPhone/characterPhoneReaction.ts`：发现后的角色反应文本和节流。
- `src/features/characterPhone/characterPhoneThreadService.ts`：NPC/联系人独立线程、代角色发消息、承诺和操作记录。
- `src/core/storage/repositories/characterPhoneRepository.ts`：角色手机存取、作用域和音乐持久化修复。
- `src/domain/characterPhone/types.ts`：角色手机记录、联系人、线程、相册、日记、音乐和隐藏操作记录类型。
- `scripts/characterPhone.test.ts`：锁屏、解锁不生成、生成入口和作用域静态契约。
- `scripts/characterPhoneContent.test.ts`：内容隔离、用户聊天/动态同步、旧预设清理、音乐 ID 幂等测试。
- `scripts/characterPhoneGeneration.test.ts`：模拟 API 的生成契约测试，覆盖上下文、NPC、文件名、占位符、线程隔离和待办持久化。

## 已完成的验证

代码门禁：

- `npm.cmd run lint`：通过。
- `npm.cmd test`：506/506 通过。
- `npm.cmd run build`：通过；只有既有的大 chunk 性能提示，不是失败。
- `git diff --check`：通过；CRLF 提示是 Git 的换行提示，不是代码错误。

右侧浏览器逐页验收通过：锁屏、解锁、桌面、聊天、联系人、朋友圈、浏览器、日程、相册、日记、备忘录、音乐和设置。解锁前后实测 `lastGeneratedAt` 与各类内容数量不变，说明解锁不会触发生成；生成按钮未在真实浏览器点击。

生成按钮没有在真实浏览器点击，是有意的：点击会把当前角色的人设、世界书、最近上下文和手机内容提交给用户配置的外部 API。生成链路已用模拟 `fetch` 契约测试覆盖，不能把这项模拟测试描述成真实第三方 API 验收。

## 后续计划

当前用户要求的角色手机内容生成修复已完成，没有已知的仓库内阻塞项。下一个会话如果继续此项目：

1. 先读本文和 `docs/CODEX_PROJECT_HANDOFF.md`，再看 `git status --short`；确认是否有用户新改动。
2. 若用户继续修改角色手机内容规则，先更新 `characterPhoneContent`/`characterPhoneProgression` 的领域测试，再改 UI。
3. 若用户明确同意使用已配置的外部 API，再在右侧浏览器点击生成图标，验证真实请求、返回、持久化、重复点击和错误提示；不要默认发送私密上下文。
4. 若要继续推进真实设备、staging、弱网或第三方 API 线路验收，单独记录为外部验收，不要用本地浏览器或模拟 API 测试冒充。
5. 提交前只提交本任务文件；先看 staged 文件名、统计和完整 diff。只有用户明确要求时才推送。

## 绝对不要再踩的坑

- 不要把角色的人设文件名、文件 stem、世界书标题、JSON 字段名当作角色姓名、联系人或正文。
- 不要在解锁、刷新、打开应用或普通 React 重渲染时调用生成 API；生成只能由桌面纯图标触发。
- 不要为“看起来有内容”写入硬编码示例联系人、示例聊天、示例日记、示例日程、示例音乐或示例朋友圈。
- 不要把所有用户好友同步给角色；只展示角色认识或有明确世界观/人设依据的联系人和动态。
- 不要把 NPC 对话塞进角色与用户的聊天镜像；不要在联系人不明确时随便绑定第一个联系人。
- 不要用 `characterId` 单字段读写；角色手机至少校验 `ownerIdentityId + characterId`，聊天和关系数据继续遵守项目要求的完整 scope。
- 不要每次生成都重复追加相同内容；使用来源 ID/内容签名做幂等，且保留用户手工内容。
- 不要恢复已经删除的旧版演示数据；不要把所有 `source: "generated"` 的新内容当成旧 seed 删除。
- 不要让音乐 ID 反复套同一个 phone 前缀；先 canonicalize，再建立播放列表和历史引用。
- 不要为第三方 API 错误清空用户数据，也不要在日志里记录 API Key、完整私密上下文或原始敏感请求。
- 不要把本地右侧浏览器验收说成真实移动设备、staging 或外部 API 已验收。
- 不要使用 `git reset --hard`、`git checkout --` 等破坏性命令处理工作区；不要把无关改动混入提交。
- 没有用户明确要求时不要推送；推送前核对分支、远端和 staged 内容。
