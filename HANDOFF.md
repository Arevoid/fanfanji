# 饭饭机当前会话交接

更新时间：2026-08-24

这是一份“当前会话状态”交接文档。新会话开始时，请先阅读本文件，再阅读 `docs/CODEX_PROJECT_HANDOFF.md`，然后检查实际 Git 状态；不要只依据本文中的历史描述判断代码是否已完成。

## 当前会话最新状态（2026-08-28）

本次会话处理的是“多个人设身份不对应、身份 2/3 显示重复、桌面欢迎卡片显示错误”。已完成原因定位、修复和远端推送。

### 已完成并已推送

提交：`ef432c1 fix: keep active identity profile consistent`

分支：`staging/long-term-optimization-2026-08-20`

修复内容：

- 桌面欢迎卡片改为读取当前 `activeIdentity`，不再固定读取主号 `primaryIdentity`。
- 设置加载时校验身份 ID；缺失或重复 ID 会被分配稳定的新 ID。
- 当前身份 ID 不存在时安全回退到主身份，避免 `find()` 命中错误身份。
- 加载时把顶层资料字段重新对齐到当前身份，减少旧数据造成的身份错配。
- 增加身份切换持久化和身份归一化测试。

注意：系统不会猜测两个同名人设本来应该叫什么，因此重复昵称不会自动改名；用户需要在对应身份下手动重新编辑。身份数据被旧逻辑写错后，已经丢失的原始字段无法由迁移推断恢复。

### 本次验证边界

- `npx.cmd tsx scripts/settingsIdentityPersistence.test.ts`：通过。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：通过；仅有既有大 chunk 性能警告。
- `git diff --check`：通过。
- `npm.cmd test`：被工作区原有的 `scripts/characterPhone.test.ts` 失败阻断；该测试属于角色手机未提交实验改动，本次没有修改它，也不能为了让全量测试变绿而接管角色手机代码。

### 当前工作区边界

身份修复已提交并推送。以下仍是未提交的角色手机实验改动，必须原样保留、不要审阅后顺手修复、不要加入任何普通功能提交：

```text
M  src/App.tsx
M  src/components/AppChat.tsx
?? scripts/characterPhone.test.ts
?? src/core/storage/repositories/characterPhoneRepository.ts
?? src/domain/characterPhone/
?? src/features/characterPhone/
```

`src/App.tsx` 的身份修复提交已经只暂存了欢迎卡片相关 hunk；角色手机接入 hunk 仍留在工作区。提交前必须同时检查 `git diff` 和 `git diff --cached`，不能只看文件名。

### 下一步建议

如果继续处理身份问题，先在浏览器实际存储中确认每条身份的 `id/name/avatar/signature/bio`，再决定是否需要提供用户可见的数据修复工具。不要自动把重复昵称改成猜测名称。

如果继续开发角色手机，必须先重新审计“我的手机”的真实路由、页面组件、状态和存储边界；当前实验实现不能当作完成版本，也不能在没有新的明确授权前验证或推送。

如果处理其他 bug 或新增应用，遵循本文“安全修改流程”，并把不相关的角色手机改动留在工作区之外。

## 一、当前正在做什么

本会话最后处理的是系统备份导入后“联系人能恢复、聊天记录不显示”的问题。

另一个较大的需求是“查手机/角色手机”应用，但用户已经明确要求：

- 查手机应用开发暂时暂停；
- 不要继续修改、验证或推送查手机相关代码；
- 现有查手机工作区改动是未完成的实验性实现，不能当作最终版本。

## 二、已经完成并已推送

### 系统备份恢复聊天记录

已确认用户提供的旧备份文件：

`C:\Users\Administrator\AppData\Roaming\dragfile_file\饭饭机_20260811.json`

它是旧版扁平 JSON 备份，不是新版带 `format/version/indexedDb` 的备份。文件中确实有聊天记录：

- `phone_messages_v3`：986 条；
- 7 个角色、7 个关系；
- 消息覆盖 7 个 `characterId` 和 7 个 `relationId`；
- 时间范围约为 2026-07-13 至 2026-08-11。

根因是：旧导入逻辑只把 `phone_messages_v3` 写入旧 LocalStorage；当前应用启用 durable IndexedDB 消息库后，`App.tsx` 会从 `message-entry-v1` 初始化消息，因此联系人能出现，但聊天记录没有进入当前消息库。

已修复：

- 在 `src/features/settings/systemBackup.ts` 的旧备份映射中加入：
  `phone_messages_v3 -> message-entry-v1`；
- 保留现有 `restoreSystemBackupIndexedDb` 的恢复与启用逻辑；
- 在 `scripts/systemBackup.test.ts` 增加旧版聊天记录迁移测试，并验证有 durable 数据时不会继续恢复重复的旧 LocalStorage 副本。

已提交并推送：

- 分支：`staging/long-term-optimization-2026-08-20`
- HEAD/远端最新提交：`8860f1a fix: restore legacy chat messages from backups`
- 远端：`origin/staging/long-term-optimization-2026-08-20`

用户使用修复后的版本时，需要重新导入该备份文件，旧备份中的聊天记录才会进入当前消息库。

### 本次验证

以下检查已通过：

```text
npx.cmd tsx scripts/systemBackup.test.ts
npx.cmd tsx scripts/systemBackupInspection.test.ts
npx.cmd tsx scripts/contentStorageMigration.test.ts
npm.cmd run lint
npm.cmd run build
git diff --check
```

并对真实备份文件做了直接归一化检查，确认 `986` 条消息会进入 `message-entry-v1`。

## 三、查手机应用：当前状态（必须视为暂停）

此前曾创建过一组未完成的角色手机实验代码，包含密码解锁、角色手机数据仓储、聊天/日程/浏览器/相册/日记等尝试，以及让角色手机复用现有 `AppChat`、`AppSchedule` 的部分适配。

但用户已经指出当前实现没有真正做到“完全沿用我的手机页面、页面结构和操作逻辑”。因此这些改动不能宣称完成，也不能在没有新的明确授权前合并或推送。

当前与查手机有关的未提交文件包括（以实际 `git status` 为准）：

```text
scripts/characterPhone.test.ts
src/components/AppCharacterPhone.tsx
src/core/storage/repositories/characterPhoneRepository.ts
src/domain/characterPhone/
src/features/characterPhone/
```

另外还有部分已修改的公共文件可能与这项实验有关：

```text
public/sw.js
src/App.tsx
src/components/AppChat.tsx
src/components/AppStore.tsx
src/core/storage/storageKeys.ts
src/features/chat/components/ChatComposer.tsx
```

这些工作区改动属于用户现有改动/未完成改动。新会话不得执行 `git reset --hard`、`git checkout --`、批量删除或擅自提交；应先逐项检查 diff，必要时向用户确认处理方式。当前用户要求是暂停查手机，所以默认只保留现状，不动、不测、不推送。

## 四、下一步计划

当前没有获得继续查手机开发的授权。下一次新会话如果用户提出其他 bug 或新增功能：

1. 先执行 `git status --short` 和 `git diff --stat`，确认哪些是未完成的查手机改动；
2. 不要把这些改动混入其他 bug 的提交；
3. 先阅读本文件和 `docs/CODEX_PROJECT_HANDOFF.md` 的对应章节；
4. 只修改用户当前明确要求的范围；
5. 运行与风险匹配的测试，涉及备份/迁移时至少运行系统备份测试、lint 和 build；
6. 只有用户明确要求推送，且确认提交内容不包含查手机改动时，才提交和推送。

如果用户以后恢复查手机开发，第一步不是继续堆 UI，而是重新审计现有“我的手机”页面的真实组件、路由、状态和存储边界，制定复用方案后再实现；目标是复用现有页面/逻辑，而不是另做一套外观相似的页面。

## 五、绝对不要再踩的坑

- 不要把“备份文件里有数据”和“当前导入器已恢复数据”混为一谈；旧版 `phone_messages_v3` 必须归一化到 `message-entry-v1`。
- 不要只恢复 LocalStorage 就认为消息恢复完成；当前消息库可能由 IndexedDB durable store 驱动。
- 不要把本地测试、Vite preview 或浏览器预览说成真实移动设备验收。
- `localhost:3000` 可能被旧 Service Worker 缓存；验证最新前端改动时要确认实际加载的 bundle，必要时使用新的 Vite preview 地址或唯一查询参数，并核对浏览器控制台/网络请求。
- 不要把查手机实验实现描述为“已经完全复刻我的手机”；它目前未完成，且用户已要求暂停。
- 不要把查手机未提交文件与普通 bug 修复一起提交或推送。
- 不要用破坏性 Git 命令清理用户工作区；先读取 diff、分离范围并保留现有改动。
- 不要泄露 API Key、密码或其他敏感值到交接文档、日志或提交信息。
- 代码改动后必须重新验证，不能引用历史测试结果代替当前验证。

## 六、当前 Git 参考

```text
分支：staging/long-term-optimization-2026-08-20
最新已推送提交：8860f1a fix: restore legacy chat messages from backups
```

开始新任务前，以实际命令输出为准：

```powershell
git status --short
git log -5 --oneline --decorate
```
