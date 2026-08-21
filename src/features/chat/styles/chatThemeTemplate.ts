export const COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE = `/* 仅作用于聊天页面；设置页和其他应用不会应用本样式。 */
/* 返回按钮和更多按钮已经默认使用透明底板，无需额外隐藏圆形背景。 */

/* ==================== 主题变量 ==================== */
#conv-screen {
  --chat-page-bg: var(--app-bg);
  --chat-header-bg: var(--surface);
  --chat-message-list-bg: var(--app-bg);
  --chat-text: var(--text-primary);
  --chat-muted-text: var(--text-secondary);
  --chat-divider: var(--divider);
  --chat-user-bg: var(--button-primary-bg);
  --chat-user-text: var(--button-primary-text);
  --chat-ai-bg: var(--surface-raised);
  --chat-ai-text: var(--text-primary);
  /* 支持 solid / dashed / dotted */
  --chat-bubble-border: var(--border);
  --chat-bubble-border-width: 1px;
  --chat-bubble-border-style: solid;
  --chat-composer-bg: var(--surface);
  --chat-composer-text: var(--text-primary);
  --chat-composer-border: var(--border);
  --chat-composer-border-width: 1px;
  --chat-composer-radius: var(--radius-xl);
  --chat-composer-shadow: none;
  --chat-input-bg: var(--input-bg);
  --chat-input-text: var(--text-primary);
  --chat-input-placeholder: var(--input-placeholder);
  --chat-input-border: var(--border);
  --chat-input-border-width: 1px;
  --chat-input-radius: var(--radius-sm);
  --chat-input-shadow: none;
  --chat-input-focus-border: var(--accent);
  --chat-input-focus-shadow: 0 0 0 2px var(--focus-ring);
  --chat-button-border: var(--border);
  --chat-button-border-width: 1px;
  --chat-button-radius: var(--radius-full);
  --chat-button-shadow: none;
  --chat-attach-bg: var(--button-secondary-bg);
  --chat-attach-text: var(--button-secondary-text);
  --chat-attach-hover-bg: var(--surface-raised);
  --chat-attach-hover-text: var(--button-secondary-text);
  --chat-send-only-bg: var(--button-secondary-bg);
  --chat-send-only-text: var(--button-secondary-text);
  --chat-send-only-hover-bg: var(--surface-raised);
  --chat-send-only-hover-text: var(--button-secondary-text);
  --chat-send-bg: var(--button-primary-bg);
  --chat-send-text: var(--button-primary-text);
  --chat-send-border: var(--button-primary-bg);
  --chat-send-hover-bg: var(--button-primary-hover-bg);
  --chat-send-hover-text: var(--button-primary-text);
  --chat-send-hover-border: var(--button-primary-hover-bg);
  --chat-stop-bg: var(--button-primary-bg);
  --chat-stop-text: var(--button-primary-text);
  --chat-stop-border: var(--button-primary-bg);
  --chat-stop-icon: none;
  /* 顶部导航按钮 */
  --chat-header-control-bg: transparent;
  --chat-header-control-text: var(--chat-text);
  --chat-header-control-border: transparent;
  --chat-header-control-radius: 0px;
  --chat-header-control-shadow: none;
  /* 展开工具栏 */
  --chat-attachment-panel-bg: var(--surface-muted);
  --chat-attachment-panel-border: var(--divider);
  --chat-attachment-panel-radius: 0px;
  --chat-attachment-icon-bg: var(--surface);
  --chat-attachment-icon-text: var(--text-primary);
  --chat-attachment-icon-border: var(--border);
  --chat-attachment-icon-radius: var(--radius-xl);
  --chat-attachment-label-text: var(--text-secondary);
  --chat-attachment-panel-display: flex;
  --chat-attachment-label-display: block;
}

/* ==================== 页面与壁纸 ==================== */
/* .chat-page 是实际聊天容器，不要写成 #conv-screen .chat-page。 */
.chat-page {
  background: var(--chat-page-bg);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  color: var(--chat-text);
}
.cv-header,
.chat-header,
.header { background: var(--chat-header-bg); color: var(--chat-text); }
.header-title,
.header-title-name { color: var(--chat-text); }
.header-title-avatar,
.user-avatar,
.ai-avatar { border-radius: 50%; }
.character-status { color: var(--accent); }

/* ==================== 顶部导航按钮 ==================== */
.chat-header__back-button,
.chat-header__more-button {
  background: var(--chat-header-control-bg);
  color: var(--chat-header-control-text);
  border: 1px solid var(--chat-header-control-border);
  border-radius: var(--chat-header-control-radius);
  box-shadow: var(--chat-header-control-shadow);
}
.cv-back-icon,
.cv-menu-icon { color: currentColor; }

/* ==================== 消息区域 ==================== */
.cv-messages-list { background: var(--chat-message-list-bg); color: var(--chat-text); }
.chat-timestamp,
.chat-timestamp__label,
.msg-meta-header,
.msg-meta-name,
.msg-meta-date,
.msg-meta-time { color: var(--chat-muted-text); }
.chat-timestamp__label { background: var(--surface-muted); }
.msg-meta-divider { border-color: var(--chat-divider); }

/* ==================== 气泡 ==================== */
.chat-bubble-self {
  background: var(--chat-user-bg);
  color: var(--chat-user-text);
  border: var(--chat-bubble-border-width) var(--chat-bubble-border-style) var(--chat-bubble-border);
  border-radius: 14px;
  box-shadow: none;
}
.chat-bubble-other {
  background: var(--chat-ai-bg);
  color: var(--chat-ai-text);
  border: var(--chat-bubble-border-width) var(--chat-bubble-border-style) var(--chat-bubble-border);
  border-radius: 14px;
  box-shadow: none;
}
.voice-message-bar.chat-bubble-self { background: var(--chat-user-bg); color: var(--chat-user-text); }
.voice-message-bar.chat-bubble-other { background: var(--chat-ai-bg); color: var(--chat-ai-text); }

/* ==================== 稳定消息类型接口 ==================== */
/* 普通文字：高度由内容决定。 */
.chat-message--text {
  padding: 8px 12px;
  border-radius: 14px;
}

/* 语音：保持独立胶囊尺寸，宽度仍由语音时长决定。 */
.chat-message--voice {
  min-width: 95px;
  min-height: 40px;
  padding: 6px 12px;
  border-radius: 14px;
}
.chat-message--voice-wave,
.chat-message--voice-duration { color: currentColor; }

/* 通话记录：不依赖 :has() 或内部 SVG。 */
.chat-message--call {
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 14px;
}
.chat-message--call-icon,
.chat-message--call-duration { color: currentColor; }

/* 图片、文字图与表情包。 */
.chat-message--image { max-width: 160px; border-radius: 16px; }
.chat-message--text-image { border-radius: 16px; }
.chat-message--sticker { /* 表情包容器样式。 */ }

/* 红包与转账共享卡片入口，同时保留各自专用入口。 */
.chat-message--payment { border-radius: 18px; }
.chat-message--red-packet {
  /* 红包卡片：背景、标题、金额、备注和状态胶囊。 */
  --redpacket-bg: linear-gradient(135deg, #0d1b1e, #101d20 72%, #17292c);
  --redpacket-title-color: #f8fafc;
  --redpacket-money-color: #ffffff;
  --redpacket-status-color: #d7dde0;
  --redpacket-note-color: rgba(241, 245, 249, 0.88);
  --redpacket-status-bg: #f5f7f4;
  --redpacket-status-text: #102124;
}

/* 按红包状态覆盖整张卡片和“待领取/已领取”状态胶囊。 */
.chat-message--red-packet[data-status="unclaimed"] {
  --redpacket-bg: #071719;
  --redpacket-status-bg: #f5f7f4;
  --redpacket-status-text: #172020;
}
.chat-message--red-packet[data-status="claimed"] {
  --redpacket-bg: #687170;
  --redpacket-title-color: #e8eeee;
  --redpacket-money-color: #f5f8f7;
  --redpacket-status-bg: #d7ddda;
  --redpacket-status-text: #59615f;
  filter: none;
}
.chat-message--red-packet[data-status="expired"],
.chat-message--red-packet[data-status="refunded"] {
  --redpacket-bg: #64748b;
  --redpacket-status-bg: #e2e8f0;
  --redpacket-status-text: #475569;
}
.chat-message--transfer { /* 转账专属背景和文字。 */ }

/* 分享卡片。 */
.chat-message--forum-share,
.chat-message--diary-share { border-radius: 16px; }

/* 连续消息分组：只有 top 渲染尾巴和装饰。 */
.msg-group-top.chat-bubble-self,
.msg-group-top.chat-bubble-other { border-radius: 14px; }
.msg-group-middle.chat-bubble-self,
.msg-group-middle.chat-bubble-other { border-radius: 4px; }
.msg-group-bottom.chat-bubble-self,
.msg-group-bottom.chat-bubble-other {
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  border-bottom-left-radius: 14px;
  border-bottom-right-radius: 14px;
}

/* ==================== Portal 尾巴与气泡装饰 ==================== */
/* 尾巴没有默认视觉样式，形状、大小、颜色和位置由用户 CSS 决定。 */
.cv-bubble-tip-portal-layer,
.cv-bubble-tip-portal { pointer-events: none; overflow: visible; }
.bubble-tip { position: absolute; z-index: 10; }
.bubble-deco-wrapper { position: relative; overflow: visible; }
.bubble-deco { position: absolute; z-index: 20; overflow: visible; pointer-events: none; }

/* ==================== 引用消息 ==================== */
.message-quote-reply-wrapper,
.message-quote-reply-wrapper--self,
.message-quote-reply-wrapper--other { color: var(--chat-text); }
.message-quote__header,
.message-quote__content,
.message-quote__reply-body { color: inherit; }

/* ==================== 展开工具栏 ==================== */
.chat-composer__attachment-panel {
  display: var(--chat-attachment-panel-display);
  background: var(--chat-attachment-panel-bg);
  border-color: var(--chat-attachment-panel-border);
  border-radius: var(--chat-attachment-panel-radius);
}
.chat-attachment-item { color: var(--chat-text); }
.chat-attachment-icon {
  background: var(--chat-attachment-icon-bg);
  color: var(--chat-attachment-icon-text);
  border-color: var(--chat-attachment-icon-border);
  border-radius: var(--chat-attachment-icon-radius);
}
.chat-attachment-label { display: var(--chat-attachment-label-display); color: var(--chat-attachment-label-text); }

/* ==================== 底部输入栏 ==================== */
.cv-footer,
.chat-input-area { color: var(--chat-composer-text); }
.chat-composer--default,
.chat-composer--floating,
.chat-composer--liquid {
  background: var(--chat-composer-bg);
  border: var(--chat-composer-border-width) solid var(--chat-composer-border);
  border-radius: var(--chat-composer-radius);
  box-shadow: var(--chat-composer-shadow);
}
.chat-input,
.chat-composer__input {
  background: var(--chat-input-bg);
  color: var(--chat-input-text);
  border: var(--chat-input-border-width) solid var(--chat-input-border);
  border-radius: var(--chat-input-radius);
  box-shadow: var(--chat-input-shadow);
}
.chat-input::placeholder,
.chat-composer__input::placeholder { color: var(--chat-input-placeholder); }
.chat-input:focus,
.chat-composer__input:focus {
  border-color: var(--chat-input-focus-border);
  box-shadow: var(--chat-input-focus-shadow);
}

/* ==================== 底部按钮 ==================== */
.chat-composer__button,
.chat-composer__send-button {
  border: var(--chat-button-border-width) solid var(--chat-button-border);
  border-radius: var(--chat-button-radius);
  box-shadow: var(--chat-button-shadow);
}
.chat-composer__attach-button,
.cv-func-btn,
.toggle-tools-btn { background: var(--chat-attach-bg); color: var(--chat-attach-text); }
.chat-composer__attach-button:hover,
.chat-composer__button--open { background: var(--chat-attach-hover-bg); color: var(--chat-attach-hover-text); }
.chat-composer__send-only-button,
.cv-send-only-btn { background: var(--chat-send-only-bg); color: var(--chat-send-only-text); }
.chat-composer__send-only-button:hover:not(:disabled) { background: var(--chat-send-only-hover-bg); color: var(--chat-send-only-hover-text); }
.chat-composer__send-reply-button,
.send-button { background: var(--chat-send-bg); color: var(--chat-send-text); border-color: var(--chat-send-border); }
.chat-composer__stop-reply-button { background: var(--chat-stop-bg); color: var(--chat-stop-text); border-color: var(--chat-stop-border); }
.chat-composer__stop-reply-button .cv-send-reply-icon svg { display: none; }
.chat-composer__stop-reply-button .cv-send-reply-icon { background: var(--chat-stop-icon) center / contain no-repeat; }
.chat-composer__send-reply-button:hover:not(:disabled),
.send-button:hover:not(:disabled) { background: var(--chat-send-hover-bg); color: var(--chat-send-hover-text); border-color: var(--chat-send-hover-border); }
.chat-composer__button:disabled { background: var(--button-disabled-bg); color: var(--button-disabled-text); opacity: 0.4; }

/* ==================== 可选图片按钮 ==================== */
/* 默认保持注释，避免在尚未配置图片 URL 时隐藏功能图标。
   确认三个 URL 均有效后，再取消下面整段注释。 */
/*
.cv-plus-icon svg,
.cv-send-only-icon svg,
.cv-send-reply-icon svg { display: none; }
.cv-plus-icon { background: url("加号按钮图片URL") center / contain no-repeat; }
.cv-send-only-icon { background: url("仅发送按钮图片URL") center / contain no-repeat; }
.cv-send-reply-icon { background: url("发送回复按钮图片URL") center / contain no-repeat; }
.chat-composer__stop-reply-button .cv-send-reply-icon { background: url("停止按钮图片URL") center / contain no-repeat; }
*/
`;
