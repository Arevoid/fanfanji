# 第一批开发与提交清单

## 开始前

- 确认在 `C:\Users\Administrator\Documents\Codex\fanfanji-refactor` 工作；
- 确认分支为 `refactor/v2-architecture`、HEAD 为批准的 40 位 commit；
- 确认原仓库 clean 且不在本 worktree 修改；
- 阅读本目录文档和 `character-state-architecture.md`。

## 每个提交

- 目的单一、改动可回滚；
- 先跑相关定向测试；
- 不改变 Prompt、Context、Provider、retry/fallback、状态语义或用户数据；
- 检查 `git diff --check`、staged 文件名和无意生成物。

## 第一批完成条件

- 文档、AGENTS、依赖方向门禁、Envelope/Ledger 与测试均已提交；
- 既有测试不少于 531 个，新测试通过；
- `npm run lint`、`npm test`、`npm run build` 全部通过；
- 原仓库 clean，新 worktree 只保留本批提交内容；
- 阶段报告列出 commit hashes、测试数、账本字段/位置、样例记录、风险、用户
  数据影响、回滚方式和下一批建议；完成后停止，不自动进入下一阶段。

