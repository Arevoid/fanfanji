# 当前模块边界与权威语义

## 权威来源

`docs/character-state-architecture.md` 是角色 Identity、Relationship、Scene、
Event、Memory 和 canonical ID 的唯一权威文档。本文件只描述模块依赖和当前
实现状态，不创建新的状态字段，也不覆盖其语义。

## 当前实现分层

| 层 | 当前职责 | 状态 |
| --- | --- | --- |
| UI/page | React 页面、交互和页面编排 | 已实现，但部分页面仍直接触达旧存储入口。 |
| Feature | chat、diary、forum、reading、moments、phone 等用例服务 | 已实现；入口较多，先用测试和账本观察。 |
| Domain | Prompt 组合、角色状态、记忆/关系规则、协议校验 | 已实现；禁止反向依赖 UI/feature。 |
| Core | ID、storage、monitoring、migration 等共享能力 | 已实现；逐步抽取端口，第一批不迁移。 |
| Adapter/transport | Provider 协议、后端路由、浏览器直连 | 已实现；可依赖 port，port 不依赖具体 adapter。 |

## 当前已知混合点

- `src/utils/apiHelper.ts` 同时承担入口编排、后端代理请求和浏览器直连回退。
- 页面和旧服务仍有直接 repository/storage 使用；这些是依赖门禁的历史 allowlist，
  本轮不通过大搬迁清零。
- `src/types.ts`、forum story、character knowledge、memory 与验证器之间存在
  三组历史循环；只冻结数量，不在本轮强制归零。

## 改动规则

新增代码应遵守 `docs/02-dependency-direction.md`。若必须触碰历史混合点，先
增加测试或更新明确的 allowlist 证据，再做最小改动，并说明没有改变状态语义。

