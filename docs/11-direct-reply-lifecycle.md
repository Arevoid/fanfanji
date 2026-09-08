# Direct Reply Lifecycle Contract（Stage 3A）

本文件只定义普通单聊与 regenerate 的生命周期边界，不迁移
`AppChat` 的完整 orchestration，也不改变 Prompt、Context、Provider、Retry、
Fallback 或用户数据语义。

## Input

`src/features/chat/contracts/directReplyLifecycle.ts` 中的
`DirectReplyLifecycleInput` 只携带一次 direct reply 所需的业务输入：

- `mode`: `send` 或 `regenerate`；
- canonical `characterId`，以及可选的 `relationId`、`conversationId`、`userIdentityId`；
- 当前 user message 与 regenerate target message；
- 明确的 history boundary / exclusion；
- OOC correction（仅 regenerate）；
- 请求时间和可选的取消信号；
- post-reply policy。

React setter、DOM、JSX、Provider、localStorage 和具体 storage implementation
不进入 contract。它们由页面或 feature adapter 提供。

## Outcome

`DirectReplyLifecycleOutcome` 记录：

- lifecycle status / phase；
- send 或 regenerate mode；
- generated candidate IDs；
- delivered message IDs；
- delivery status；
- post-reply policy、是否已调度及失败阶段；
- 受控 error kind 与 recoverability。

Outcome 只保存 ID 和分类，不保存 Prompt、response、异常正文或凭据。

Stage 3B-5 已把 normal direct send 的 runtime/feature material → 现有
ContextSnapshot/Prompt builder → prepared turn 送入 `DirectReplyUseCase`；delivery →
post-reply 调度仍由既有 UseCase/adapter 边界负责。UI adapter、user-message
persistence 与 regenerate 仍留在各自既有边界。该 outcome contract 继续作为
页面/controller 的唯一结构化生命周期结果。

## Phases

```text
prepared → requesting → parsed → delivering → delivered → post_reply_scheduled
                                      ↘ failed / cancelled
```

主回复 delivery 成功后，Memory、Diary 和其他 background side effects 不属于主
回复成功条件。

## PostReplyCoordinator

`src/features/chat/controllers/postReplyCoordinator.ts` 是轻量调度边界：

- normal send 调用已有 `chatSideEffectController`；
- 在满足当前既有条件时调度已有 Diary service；
- regenerate 使用 `regenerate_none`，保持当前不新增完整 post-reply side effects；
- side-effect 调度异常转为失败阶段，不向主回复重新抛出。

Coordinator 不实现 Memory、Diary、Moments、offline、Character Phone、Provider、
Prompt、Retry 或 Fallback 算法。

## Responsibility classification

### Core delivery completion

- candidate parsing / candidate creation；
- sequential candidate delivery；
- direct-scope attachment；
- message persistence；
- 必要的 pending handoff delivery marker。

### Direct-reply post processing

- 自动 memory extraction 的 eligibility 与延迟调度；
- relationship summary marker 更新；
- Diary eligibility 与已有 Diary service 调度；
- Moments cover 的已有 patch。

### Cross-feature side effects

- offline handoff persistence / workspace transition；
- proactive offline invitation / response directive；
- character-phone image save；
- inline inner voice persistence。

这些动作仍由各自 service 或现有 AppChat adapter 负责，Coordinator 不复制其算法。

### Background / unrelated

Proactive scheduler/catchup、group chat、voice、独立 Moments generation、Forum、
Reading、payment，以及不属于当前 direct reply 的 Character Phone background jobs，
不进入 DirectReplyUseCase。

## Send / regenerate policy

- normal send：`normal_send`，保留当前 `afterReplySuccess` 与 Diary 调度；
- regenerate：`regenerate_none`，保留当前不新增完整 memory/diary side effects 的行为。

Stage 3B 只有在单独定义替换消息、候选接受和 side-effect 语义后，才能重新评估
regenerate 的 post-reply policy。
