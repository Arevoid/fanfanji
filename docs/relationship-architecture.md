# Relationship Architecture

## 1. 背景与问题

项目早期以 `characterId` 作为主要数据关联键。这能识别“角色是谁”，但“小手机”允许用户创建多个身份，并让不同身份分别添加同一个 AI 角色。

例如，祁澈的 `characterId` 为 `char_xxx`；用户身份“小梨花”和“饭饭”都可以与祁澈建立互动。若所有数据只按 `characterId` 查询，两段关系产生的聊天、Memory、OfflineStory 和 InnerVoice 就会混合。

因此系统引入 Relationship 层，以隔离同一角色在不同用户身份下的关系经历。

## 2. 核心概念

### Character

Character 表示 AI 角色本体，唯一标识为 `characterId`。它负责角色资料、人设、头像、世界书角色引用和档案馆展示。

Character 不代表某个用户身份下的关系；档案馆仍只展示一个祁澈，而不是为每个身份创建角色副本。

### Relationship

Relationship 表示“某个用户身份与某个角色之间的一段独立关系”，唯一标识为 `relationId`。

一个 Character 可以拥有多个 Relationship：

- Relationship A：小梨花 + 祁澈
- Relationship B：饭饭 + 祁澈

两者的 `characterId` 相同，但 `relationId` 不同，因此各自的经历必须隔离。

## 3. 数据归属规则

角色本体范围使用 `characterId`；关系经历范围使用 `relationId`。

| 数据 | 归属键 | 说明 |
| --- | --- | --- |
| Character | `characterId` | 角色资料、人设与头像 |
| Relationship | `relationId` | 当前身份与角色的一段关系 |
| Conversation | `relationId` | 同角色、不同身份的聊天入口独立 |
| Message | `relationId` | 聊天消息属于具体关系 |
| Memory | `relationId` | 记忆描述关系经历，不是角色通用资料 |
| OfflineStory | `relationId` | 线下剧情属于具体关系 |
| InnerVoice | `relationId` | 心声仅反映当前关系上下文 |

这些关系范围数据描述的是“这段关系发生过什么”，不能被当作角色本体的通用知识。

## 4. canonical characterId 与 relationId 的区别

- `characterId` 回答：“这个 AI 是谁？”
- `relationId` 回答：“这个 AI 和当前用户身份经历了什么？”

`canonical characterId` 继续解决历史联系人副本、别名和角色身份归一化问题；`relationId` 在其基础上增加用户身份维度。二者职责不同，不能互相替代。

## 5. 数据迁移与兼容策略

历史 Message、Memory、OfflineStory 与 InnerVoice 可能只有 `characterId`。迁移采用向后兼容方式：

1. 保留原有 `characterId` 字段。
2. 为关系范围数据新增可选 `relationId?`。
3. 读取时优先按 `relationId` 精确匹配。
4. 缺少 `relationId` 的旧记录，通过 canonical 角色和默认用户身份解析到 legacy 默认关系。

系统不删除历史数据，也不要求用户批量重写旧记录。

## 6. 联系人副本与 Relationship

旧系统存在 `contact-${identityId}-...` 形式的联系人副本，仍用于兼容现有联系人与界面流程。

联系人副本可通过 `profileSourceId` 映射到 canonical `characterId`，再结合 `ownerIdentityId` 解析到 `relationId`：

```text
contact instance
  -> profileSourceId
  -> canonical characterId
  + ownerIdentityId
  -> relationId
```

联系人副本不是最终关系模型；它只是进入 Relationship 的兼容入口。

## 7. 生命周期规则

### 删除联系人副本

删除某一身份下的联系人副本，只删除该身份对应的 Relationship 及其 Message、Memory、OfflineStory、InnerVoice。不得影响其他身份与同一角色的关系。

### 删除角色本体

删除角色本体时，系统先以 canonical `characterId` 找到全部 Relationship，再清理全部相关的 Relationship、Message、Memory、OfflineStory 与 InnerVoice，避免留下孤立数据。

## 8. 多身份示例

角色：祁澈（`characterId = char_qiche`）

```text
小梨花 + 祁澈 -> relation_A
  - 聊天 A
  - 记忆 A
  - 剧情 A
  - 心声 A

饭饭 + 祁澈 -> relation_B
  - 聊天 B
  - 记忆 B
  - 剧情 B
  - 心声 B
```

`relation_A` 与 `relation_B` 可以拥有不同聊天内容、不同关系状态与不同剧情历史；切换身份后只读取当前 `relationId` 的数据。

## 9. 当前完成状态

已完成：

- Relationship 基础层与 Repository
- Memory relationId 隔离
- OfflineStory relationId 隔离
- InnerVoice relationId 隔离
- Chat relationId 最小迁移
- 联系人与角色删除的生命周期清理
- 旧数据默认关系兼容

未完成：

- 群聊的 relation 模型
- 更复杂、可演进的关系状态系统
