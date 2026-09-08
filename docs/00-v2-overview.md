# V2 重构总览与本轮边界

## 目的

V2 不是一次性重写，而是把已有功能逐步放进可审计的边界。第一批只建立
规范、依赖门禁、AI 请求账本和回归测试；用户可见行为必须保持不变。

## 当前状态分级

| 状态 | 含义 |
| --- | --- |
| 已实现 | 当前代码已存在并由测试保护；本轮只记录和观测，不重新设计。 |
| 部分实现 | 有局部模块或旧路径，但边界仍混合；本轮可建立门禁，不强行搬迁。 |
| V2 目标 | 后续批次可实现的方向；本轮不提前改变运行时语义。 |
| 禁止本轮 | 任何会改变提示词、上下文、Provider、重试/回退、状态语义、数据格式或 UI 的工作。 |

## 已实现的基础

- 角色状态的 canonical ID、Relationship、Scene、Event、Memory 边界以
  `docs/character-state-architecture.md` 为准。
- 文本 AI 已有后端代理与浏览器直连回退；不同路径的重试/错误策略已有测试。
- 主要持久化已混合使用 IndexedDB 与 localStorage；第一批不做迁移。
- 既有测试基线为 531/531，lint 与 build 均通过。

## 本轮交付

1. `AGENTS.md` 和编号规范文档；
2. 依赖方向静态门禁，保留并冻结三条已知循环的 allowlist；
3. AI Request Envelope 与仅保存元数据的 per-request ledger；
4. 覆盖成功、空发送、格式重试、别名重试、上下文恢复、网络回退、明确
   4xx 不回退、自动记忆、日记等现有调用账本的测试。

## 后续而非本轮

AppChat 拆分、目录大搬迁、统一存储端口、Prompt/context/worldbook/truth/memory
重构、Provider 改造、IndexedDB 迁移、完整 UI/观测面板，均留到后续 RFC 和
独立小批次，并且每批都必须先有行为基线。

