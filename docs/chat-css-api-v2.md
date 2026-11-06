# 饭饭机聊天 CSS API

聊天 CSS API 让用户只通过 CSS 调整聊天页布局和视觉，同时保证默认界面、消息业务和其他页面不受影响。

## 作用域和版本

用户界面只显示一套聊天 CSS API。新主题使用 v2 作用域，v1 只作为旧主题的内部兼容层，不再提供用户可见的版本选择。

v2 主题会被限制在：

```css
#conv-screen.user-custom-chat-css[data-chat-css-api="2"]
```

旧 v1 主题继续使用原有作用域。导入旧主题时会自动兼容，清空或禁用自定义 CSS 后恢复默认界面。

## 稳定选择器

不要依赖 Tailwind 工具类、React 层级或 `cv-*` 兼容类。以下选择器属于稳定接口：

| 区域 | 选择器 |
| --- | --- |
| 页面 | `.chat-page`, `.chat-theme`, `.chat-page__background` |
| 导航 | `.chat-header`, `.chat-header__back-button`, `.chat-header__identity`, `.chat-header__avatar`, `.chat-header__title`, `.chat-header__status`, `.chat-header__more-button` |
| 消息 | `.chat-messages`, `.chat-message-row`, `.chat-message__avatar-slot`, `.chat-message__content`, `.chat-message__text`, `.chat-bubble-self`, `.chat-bubble-other`, `.chat-timestamp` |
| 输入区 | `.chat-composer`, `.chat-composer__interactive`, `.chat-composer__form`, `.chat-composer__attach-button`, `.chat-composer__input-shell`, `.chat-composer__input`, `.chat-composer__send-only-button`, `.chat-composer__send-reply-button` |
| 工具栏 | `.chat-tools`, `.chat-tool`, `.chat-tool--more`, `.chat-tool__icon`, `.chat-tool__label` |
| 特殊消息 | `.chat-message--voice`, `.chat-message--call`, `.chat-message--transfer`, `.chat-message--red-packet`, `.message-quote` |

## 消息属性

每条消息行提供以下属性：

```text
data-message-id
data-message-side="self|other"
data-message-kind="text|image|text-image|sticker|voice|call|transfer|redpacket|location|quote|diary-share|forum-share"
data-message-state="normal|pending|recalled"
data-group-position="top|middle|bottom"
data-avatar-visible="true|false"
data-has-translation="true|false"
data-selected="true|false"
data-recalled="true|false"
```

示例：

```css
.chat-message-row[data-message-kind="transfer"] {
  --chat-transfer-bg: #2296e8;
}

.chat-message-row[data-message-state="recalled"] {
  opacity: 0.7;
}
```

## 输入区行为

输入区的业务语义固定：

- `.chat-composer__send-only-button`：仅发送，不请求回复。
- `.chat-composer__send-reply-button`：发送并请求回复。
- 生成回复期间，右侧按钮带有 `data-action="stop-reply"`。

输入区状态：

```text
.chat-composer__interactive[data-has-text="true"]
.chat-composer__interactive[data-reply-state="idle|busy|generating"]
```

CSS 可以改变按钮位置、尺寸和视觉，但不能改变业务语义。

## 工具栏

工具栏状态：

```text
.chat-tools[data-tools-open="true|false"]
.chat-tools[data-tools-expanded="true|false"]
```

每个工具提供：

```text
data-tool-key
data-tool-tier="primary|secondary|trigger"
data-tool-order
```

默认工具顺序和业务功能不由主题改变。主题可以使用 `order`、Grid 或 Flex 重新排列。

## 变量分组

模板文件中提供可删除、可覆盖的变量：

```css
/* 页面和安全区 */
--chat-viewport-height
--chat-content-max-width
--chat-safe-top
--chat-safe-bottom
--chat-scroll-padding-bottom

/* 导航 */
--chat-header-height
--chat-header-padding-inline
--chat-header-padding-block
--chat-header-identity-gap
--chat-header-status-gap
--chat-header-control-size
--chat-header-icon-size

/* 消息 */
--chat-message-content-max-width
--chat-avatar-size
--chat-bubble-radius
--chat-bubble-padding-inline
--chat-bubble-padding-block
--chat-bubble-line-height

/* 输入区 */
--chat-composer-padding-inline
--chat-composer-padding-block
--chat-composer-gap
--chat-input-min-height
--chat-input-max-height
--chat-send-only-size
--chat-send-reply-size

/* 工具栏 */
--chat-tools-display
--chat-tools-columns
--chat-tools-padding
--chat-tools-row-gap
--chat-tools-column-gap
--chat-tool-size
--chat-tool-label-size

/* 语音、引用和支付卡片 */
--chat-voice-*
--chat-quote-*
--chat-payment-*
--chat-transfer-*
--chat-redpacket-*
```

## 红包和转账

默认红包层始终保留：

```css
.redpacket-card__default-layer
```

普通 CSS 只会修改默认层的外观，不会自动切换到语义化备用层。语义化红包和转账钩子可以被主题主动使用，但不会改变默认业务结构。

## at-rule 限制

允许使用：

```css
@media
@supports
@container
@layer
```

聊天主题不允许通过 `@import` 加载外部样式，也不允许使用 `@page`。`@font-face`、`@keyframes` 和 `@property` 仍属于全局 CSS 能力，主题应使用独特名称，避免覆盖应用内已有资源。

## 主题文件

导入按钮支持 TXT、DOCX 和旧 JSON。导出默认使用 DOCX，旧 JSON 仍可导入。

新版主题包结构：

```json
{
  "format": "fanfanji-chat-theme",
  "schemaVersion": 2,
  "cssApiVersion": 2,
  "meta": {
    "name": "主题名称",
    "exportedAt": "ISO-8601",
    "app": "fanfanji"
  },
  "css": "...",
  "assets": { "icons": {} }
}
```

导入的主题会显示在 CSS 输入框下方，卡片展示主题名称，右侧提供删除按钮。点击卡片即可应用主题。

## 兼容要求

1. 新增稳定钩子只能向后兼容，不能删除已经发布的钩子。
2. 默认样式不能依赖用户 CSS 才能成立。
3. CSS 主题不能改变发送、回复、停止、上传、通话等业务逻辑。
4. 清空主题后必须恢复默认界面。
5. 主题应提供 `prefers-reduced-motion: reduce` 规则。
