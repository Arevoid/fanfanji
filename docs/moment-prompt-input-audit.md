# Moment Prompt 输入收敛审计

## 结论

Moments 的三条 AI 生成链路已经收敛到公开输入白名单：

- 自动生成角色动态：公开角色资料、当前时间、当前身份的信息流中的公开动态历史、去重约束。
- 自动评论用户动态：公开角色资料、当前时间、用户公开动态正文及图片提示、公开评论行为约束。
- 评论回复：公开角色资料、当前时间、目标动态正文、该动态的公开评论、公开回复行为约束。

聊天历史、私有 Memory、关系状态、关系时间线、关系事件、InnerVoice、OfflineStory 私密内容、机主资料和 WorldBook 不再作为 Moments Prompt 输入。

`relationId` 仍可用于运行时选择关系、生成去重键和保存归属，但不进入 Prompt；这属于数据路由，不属于角色认知输入。

## 当前链路

```text
AppChat
  ├─ handleAutoCommentOnUserMoment
  │    └─ PromptComposer(scenario: moment-comment)
  │         └─ requestAutomaticMomentComment
  │              └─ apiChat
  │
  ├─ handleAutoReplyToUserComment
  │    └─ PromptComposer(scenario: moment-reply)
  │         └─ requestMomentCommentReply
  │              └─ apiChat
  │
  └─ generateCharacterMoment
       └─ PromptComposer(scenario: moment-post)
            └─ requestCharacterMomentOnce
                 └─ requestCharacterMoment
                      └─ apiChat
```

服务层只负责请求、清理、时间冲突检查、去重和结果组装。Prompt 的场景文本仍在 `AppChat`，本轮没有改变 `PromptComposer` 或 AI 请求协议。

## 收敛前输入审计

| 输入来源 | 收敛前情况 | 风险 | 当前处理 |
| --- | --- | --- | --- |
| 角色信息 | `friend.name`、`personality`、`backstory` 已用于三种场景 | 角色资料本身是必要的，但不应带入关系私密字段 | 保留精简公开角色资料 |
| 聊天历史 | 曾从 `messages` 按关系截取近期、历史和回退记录 | 暴露私聊、共同经历和其他关系语境 | 删除；三种 `PromptComposer` 均使用空 `history` |
| Memory | 发帖前曾注入归档 Memory、关系上下文；评论路径也曾依赖认知投影 | 私有 Memory 进入公开内容，造成隐私泄露和虚假共同经历 | 删除 Prompt 输入；发帖返回的 Moment 记录仍按既有业务保存，不属于本轮 Prompt 来源 |
| Relationship | 曾通过 `CharacterCognitiveContext` 及关系历史影响 Prompt | stage、tone、openLoops、boundaries 等私域关系信息不应公开 | 删除 Prompt 输入；关系仍用于运行时路由和生成资格 |
| CharacterEvent | 曾构建关系范围内的 cognitive context | `safe` 不是 `public`，仍可能泄露关系事实 | 不再构建或传入 Moment Prompt |
| WorldBook | 发帖和评论曾读取完整/角色范围 WorldBook | 可能带入仅对某角色或某关系可见的设定 | 从三条 Moments Prompt 路径移除 |
| 用户资料 | 曾注入机主昵称、人格/Bio | 将用户私密资料暴露给公开动态/评论生成 | 删除 |
| 时间上下文 | 由 `createMomentTemporalContext` 和 `formatMomentTemporalContext` 生成 | 时间缺失会导致发布时间和文案冲突 | 保留；服务层继续执行时间冲突校验 |
| 动态历史 | 发帖已有当前身份信息流的最近公开动态 | 缺少历史会导致重复主题和句式 | 保留为公开去重上下文；仅限公开动态正文 |
| 评论上下文 | 评论回复使用目标动态和其已有评论 | 评论内容本身是该动态的公开上下文 | 保留；不附带私聊历史 |

## 当前白名单

### 自动发帖

允许：

- `friend.name`、`friend.personality`、`friend.backstory` 等当前公开角色资料。
- `formatMomentTemporalContext(...)` 生成的时间信息。
- 当前身份信息流中最近的公开角色动态，用于避免重复或相似内容。
- 发帖长度、格式、`SKIP`、不编造经历、不引用私域信息等生成约束。

禁止：

- 私聊历史、Memory、关系状态、关系时间线、关系事件。
- 用户资料、InnerVoice、OfflineStory 私密内容。
- 任何未由公开输入支持的共同经历或用户信息。

### 自动评论

允许：

- 公开角色资料和当前时间。
- 用户公开动态正文及图片存在性提示。
- 评论长度、语言和只回应公开内容等约束。

禁止：

- 私聊、Memory、用户资料、关系状态和事件。
- 通过关系推断熟悉程度、共同经历或情绪。

### 评论回复

允许：

- 公开角色资料和当前时间。
- 目标动态作者、正文、图片提示。
- 该动态已有的公开评论和用户刚发表的公开评论。
- 公开回复格式与长度约束。

禁止：

- 私聊历史、Memory、InnerVoice、OfflineStory、关系状态或其他身份数据。
- 把公开评论互动推断为私人关系升级或现实共同经历。

## 代码级收敛点

- `AppChat.tsx` 的 Moments 自动化区域移除了 `getMomentCognitiveContext`、WorldBook 完整读取、关系消息历史、归档 Memory、历史消息回退和机主资料注入。
- 发帖、评论、回复的 `PromptComposer` 调用均明确传入 `history: []`，公开文本在 `systemInstruction` 中按场景提供。
- `momentGenerator.ts`、`momentCommentService.ts`、`momentReplyService.ts` 不再接受或格式化 `CharacterCognitiveContext` / `MomentPromptContext`。
- `requestCharacterMoment` 仍使用 `existingMoments` 做公开动态去重；`temporalContext` 仍做文案时间冲突拦截。
- `relationId` 仍保留在 Moment 生成输入和结果保存路径，用于关系归属、生成 guard 与去重，不会被拼入 AI 请求。

## 剩余边界与后续接入点

1. 当前公开动态历史按 `ownerIdentityId` 选择信息流；后续应将“公开可见”作为明确谓词，而不是仅依赖身份过滤。
2. 当前 Moments Prompt 仍由 `AppChat` 直接组装。后续接入独立 `MomentPublicCognitiveContext` 时，应在调用 Prompt 之前生成公开投影，再由专用 Adapter 格式化；不得恢复 Chat Context、关系范围 safe event 或私有 Memory。
3. `requestCharacterMoment` 返回的 Moment Memory 是生成结果的既有保存副作用，不是 Prompt 输入。本轮未改变该数据流；若未来要限制其进入长期认知，应单独审计 Memory 写入策略。
4. `handleAutoReplyToUserComment` 的角色选择仍有按角色匹配关系的运行时兼容路径。它不向 Prompt 暴露关系数据，但未来多身份场景应继续确保选择与当前身份一致。

## 验证范围

- `scripts/momentPromptInputIsolation.test.ts` 检查三条自动生成链路不再包含私聊、Memory、WorldBook、机主资料或私有 cognitive context。
- `scripts/momentPromptAdapterIntegration.test.ts` 已调整为验证旧请求对象保持不变，确保服务层不再注入私域认知块。
- 应继续运行 Moments、Prompt Adapter、Memory/Relationship 隔离测试，以及 lint、build 和 `git diff --check`。

本轮不修改 Memory、Relationship、CharacterEvent、UI 或 AI 请求协议，也未提交任何 commit。
