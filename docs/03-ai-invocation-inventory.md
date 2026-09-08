# AI 调用清单（当前实现）

## 入口与传输

| 入口 | 当前用途 | 可能的子请求/回退 | 本轮处理 |
| --- | --- | --- | --- |
| `apiChat` | 普通回复、群聊、再生成、主动消息、心声、朋友圈、论坛、阅读、电影、角色手机等 | 格式/退化/别名/上下文恢复由上层触发；代理失败时浏览器直连 | 只加账本元数据 |
| `apiExtractMemories` | memory_extract | 代理网络失败时直连；结构修复可能再次调用 | 记录 purpose 与父动作 |
| `apiTranslate` | translation、论坛/日记/消息翻译 | 代理缺失时按既有条件直连；论坛可 proxy-only | 记录 transport/fallback |
| `apiSummarizePersonality` | personality_summary | 代理失败时直连 | 记录 purpose |
| `apiTestKey` | api_test | 后端失败时直连握手 | 记录明确 4xx 不回退 |
| `apiFetchModels` | model_list | 后端失败时直连列表 | 记录请求次数 |
| 图片/语音入口 | image_generate、tts 及模型/测试辅助 | 按现有服务策略 | 本轮只建立 purpose 合同，不改策略 |

## Purpose 合同

第一批的枚举覆盖当前真实用途：

`chat_reply`、`group_chat_reply`、`regenerate`、`proactive_message`、
`memory_extract`、`translation`、`personality_summary`、`inner_voice`、
`moment_generate`、`moment_comment`、`moment_reply`、`diary_generate`、
`character_phone_generate`、`forum_generate`、`forum_story_generate`、
`reading_generate`、`cinema_generate`、`image_generate`、`tts`、`api_test`、
`model_list`。

用途只用于可观测性，不会选择 Provider、改变 Prompt 或触发新的请求。

