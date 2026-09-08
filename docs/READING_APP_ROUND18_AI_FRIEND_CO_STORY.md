# 阅读应用第 18 轮：AI 好友共同穿书基础层

## 参与者模型

共同穿书不是两个真人联机房间，而是一个用户身份和一个 AI 好友关系共同进入故事宇宙。共同故事的完整作用域为：

`userIdentityId + coStoryId + relationId + characterId`

同一本小说、同一个用户和不同 AI 好友会创建不同的 `coStoryId`，关系、角色、回合和 AI 已知情报不会串线。

## AI 好友知识视角

`ReadingStoryAiFriendProfile` 保存 AI 好友的人设、故事身份、已知情报和 `knownTurnIds`。Prompt 投影只允许发送：

- 角色卡和关系语气；
- AI 已知情报；
- `knownTurnIds` 中且标记为 AI 可见的最近回合；
- 当前地点、时间和章节进度。

空的 `knownTurnIds` 表示 AI 尚未读到任何回合，不会因为“当前故事状态”而自动知道用户隐藏的行动。

## AI 行动边界

AI 好友只能控制自己的角色。支持三种意图：

- `suggest`：提出建议，由用户决定是否采用；
- `ask_opinion`：询问 AI 好友意见；
- `low_risk_execute`：执行不改变用户角色重大路线的低风险行动。

AI 返回 `controlsUserCharacter=true` 会被拒绝。涉及用户角色生死、身份、关系、婚姻、阵营或路线的行动，即使模型标记为低风险，也会被提升为 `approval_required`，必须由用户确认。

## 待确认状态

重大行动不会直接推进故事，而是写入 `pendingApproval`，并保存一条对用户可见的 AI 行动提案。后续 UI 应提供“接受 / 拒绝 / 让 TA 换个方案”，但不能自动替用户确认。

## 当前轮次范围

本轮完成数据模型、独立存储、AI 视角投影、行动协议和重大决定拦截。下一轮接入共同穿书页面与“让 TA 行动 / 询问意见 / 低风险授权”交互；普通用户行动仍复用单人穿书的结构化回合协议。
