# 依赖方向门禁

## 目标方向

```text
UI/page -> feature use case -> domain policy/port -> adapter/provider
                         \-> core port/storage contract
```

依赖箭头表示“可以依赖”。实现细节不得反向渗透到更稳定的层。

## 门禁规则

1. UI/page 不得新增 Provider client、server transport 或 concrete storage engine
   的导入；页面应通过 feature/core 入口完成操作。
2. Domain 不得导入 feature 或 UI。
3. Core port/contract 不得导入 concrete feature、页面或 provider adapter。
4. Adapter 可以依赖 port/contract；port 不得依赖 adapter。
5. 新循环直接失败；现有三组循环只允许保持原数量和 allowlist 成员。

## 当前 allowlist

本轮基线文件 `scripts/dependency-direction-baseline.json` 保存当前违规边和
三组已知循环。它不是永久豁免：修改历史边时必须先更新 RFC/测试并由评审确认。
门禁要求现有边不增加，循环不增加；本轮不以“强行清零”为目标。

## 循环基线

- `src/types.ts` <-> `src/domain/forum/forumStoryArc.ts`
- `src/domain/characterKnowledge/characterKnowledgeTypes.ts` <->
  `src/domain/memory/memoryModel.ts`
- forum-story cognitive adapters <->
  `src/features/forumStory/validators/forumStoryOutputValidator.ts`

## 失败处理

门禁失败时停止后续修改，报告新增边/循环和触发文件。不得删除测试、跳过
检查、把导入改成动态绕过规则，或借机迁移业务目录。

