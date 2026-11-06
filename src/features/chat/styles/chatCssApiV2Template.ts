/** Starter contract only: it exposes API surfaces and intentionally does not impose a new theme. */
export const CHAT_CSS_API_V2_TEMPLATE = `/* 饭饭机 CSS API v2。删除不需要的声明即可，默认界面不会被改变。 */
:root {
  /* 页面与导航 */
  --chat-page-bg: var(--app-bg);
  --chat-viewport-height: 100dvh;
  --chat-content-max-width: none;
  --chat-safe-top: env(safe-area-inset-top, 0px);
  --chat-safe-bottom: env(safe-area-inset-bottom, 0px);
  --chat-scroll-padding-bottom: 0px;
  --chat-z-header: 20;
  --chat-z-composer: 30;
  --chat-motion-duration: 160ms;
  --chat-motion-easing: ease;
  --chat-focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent);

  --chat-header-height: auto;
  --chat-header-padding-inline: 1rem;
  --chat-header-padding-block: 0.375rem;
  --chat-header-bg: var(--surface);
  --chat-header-color: var(--text-primary);
  --chat-header-border: var(--border);
  --chat-header-shadow: none;
  --chat-header-control-size: 2.5rem;
  --chat-header-icon-size: 1.5rem;
  --chat-header-identity-gap: 0.25rem;
  --chat-header-status-gap: 0.125rem;
  --chat-header-status-dot-size: 0.375rem;

  /* 消息列表、时间与头像 */
  --chat-list-bg: transparent;
  --chat-list-inline-padding: 1rem;
  --chat-message-gap: 0.5rem;
  --chat-message-group-gap: 0.25rem;
  --chat-message-content-max-width: 85%;
  --chat-avatar-size: 2rem;
  --chat-avatar-radius: 999px;
  --chat-timestamp-bg: transparent;
  --chat-timestamp-color: var(--text-secondary);

  /* 双方气泡 */
  --chat-self-bubble-bg: var(--button-primary-bg);
  --chat-self-bubble-color: var(--button-primary-text);
  --chat-other-bubble-bg: var(--surface-raised);
  --chat-other-bubble-color: var(--text-primary);
  --chat-bubble-radius: 14px;
  --chat-bubble-border: 1px solid var(--border);
  --chat-bubble-shadow: none;
  --chat-bubble-max-width: 78%;
  --chat-bubble-padding-inline: 0.75rem;
  --chat-bubble-padding-block: 0.5rem;
  --chat-bubble-line-height: 1.5;

  /* 输入区 */
  --chat-composer-bg: var(--surface);
  --chat-composer-border: 1px solid var(--border);
  --chat-composer-radius: 0px;
  --chat-composer-shadow: none;
  --chat-composer-padding-inline: 0.75rem;
  --chat-composer-padding-block: 0.5rem;
  --chat-composer-gap: 0.5rem;
  --chat-input-bg: var(--input-bg);
  --chat-input-color: var(--text-primary);
  --chat-input-placeholder: var(--text-secondary);
  --chat-input-radius: 0.75rem;
  --chat-input-min-height: 2.5rem;
  --chat-input-max-height: 6rem;
  --chat-input-padding-inline: 1rem;
  --chat-input-padding-block: 0.5rem;
  --chat-input-border: 1px solid transparent;
  --chat-input-focus-border: var(--accent);
  --chat-input-focus-ring: var(--chat-focus-ring);
  --chat-action-size: 2.5rem;
  --chat-send-only-size: var(--chat-action-size);
  --chat-send-only-icon-size: 1rem;
  --chat-send-reply-size: var(--chat-action-size);
  --chat-send-reply-icon-size: 0.875rem;
  --chat-send-only-bg: transparent;
  --chat-send-reply-bg: var(--button-primary-bg);
  --chat-voice-min-width: 5.9375rem;
  --chat-voice-max-width: min(220px, calc(100vw - 92px));
  --chat-voice-height: 2.5rem;
  --chat-voice-wave-color: currentColor;
  --chat-voice-duration-color: currentColor;
  --chat-voice-wave-overflow: hidden;

  /* 工具栏 */
  --chat-tools-bg: var(--surface);
  --chat-tools-display: flex;
  --chat-tools-columns: 5;
  --chat-tools-padding: 0.625rem 0.75rem;
  --chat-tools-row-gap: 0.5rem;
  --chat-tools-column-gap: 0.25rem;
  --chat-tools-gap: 0.5rem;
  --chat-tool-size: 2.5rem;
  --chat-tool-radius: 0.75rem;
  --chat-tool-label-gap: 0.25rem;
  --chat-tool-label-size: 0.625rem;
  --chat-tool-label-display: block;
  --chat-more-icon-box-size: 1.375rem;
  --chat-more-icon-size: 0.875rem;

  /* Special message components. These defaults are contract values only;
     they do not replace the built-in red-packet layer. */
  --chat-payment-width: 240px;
  --chat-payment-height: 112px;
  --chat-payment-radius: 18px;
  --chat-payment-content-padding: 14px 16px 12px;
  --chat-payment-divider: color-mix(in srgb, currentColor 18%, transparent);
  --chat-transfer-bg: linear-gradient(135deg, #0f766e, #0891b2);
  --chat-transfer-icon-size: 2rem;
  --chat-transfer-amount-size: 1.4rem;
  --chat-transfer-footer-height: 1.25rem;
  --chat-redpacket-bg: linear-gradient(135deg, #0d1b1e, #101d20 72%, #17292c);
  --chat-redpacket-amount-size: 1.3rem;
  --chat-redpacket-footer-height: 1.25rem;
  --chat-quote-padding: 0.5rem 0.75rem;
  --chat-quote-radius: 1rem;
  --chat-quote-jump-size: 1.75rem;
}

/* 变量到界面的标准映射。 */
.chat-page {
  min-height: var(--chat-viewport-height);
  max-width: var(--chat-content-max-width);
  padding-top: var(--chat-safe-top);
  background: var(--chat-page-bg);
}
.chat-header {
  min-height: var(--chat-header-height);
  padding-inline: var(--chat-header-padding-inline);
  padding-block: var(--chat-header-padding-block);
  z-index: var(--chat-z-header);
  background: var(--chat-header-bg);
  color: var(--chat-header-color);
  border-color: var(--chat-header-border);
  box-shadow: var(--chat-header-shadow);
}
.chat-header__back-button,
.chat-header__more-button {
  width: var(--chat-header-control-size);
  height: var(--chat-header-control-size);
}
.chat-header__back-button svg,
.chat-header__more-button svg { width: var(--chat-header-icon-size); height: var(--chat-header-icon-size); }
.chat-header__identity { gap: var(--chat-header-identity-gap); }
.chat-header__status { gap: var(--chat-header-status-gap); }
.chat-header__status > .status-indicator { width: var(--chat-header-status-dot-size); height: var(--chat-header-status-dot-size); }
.chat-messages {
  background: var(--chat-list-bg);
  padding-inline: var(--chat-list-inline-padding);
  scroll-padding-bottom: var(--chat-scroll-padding-bottom);
}
.chat-message-row { margin-block: var(--chat-message-gap); }
.chat-message-row .avatar { width: var(--chat-avatar-size); height: var(--chat-avatar-size); border-radius: var(--chat-avatar-radius); }
.chat-timestamp { background: var(--chat-timestamp-bg); color: var(--chat-timestamp-color); }
.chat-bubble-self, .chat-bubble-other {
  max-width: var(--chat-bubble-max-width);
  border: var(--chat-bubble-border);
  border-radius: var(--chat-bubble-radius);
  box-shadow: var(--chat-bubble-shadow);
  padding-inline: var(--chat-bubble-padding-inline);
  padding-block: var(--chat-bubble-padding-block);
  line-height: var(--chat-bubble-line-height);
}
.chat-bubble-self { background: var(--chat-self-bubble-bg); color: var(--chat-self-bubble-color); }
.chat-bubble-other { background: var(--chat-other-bubble-bg); color: var(--chat-other-bubble-color); }
.chat-composer {
  position: relative;
  z-index: var(--chat-z-composer);
  padding-inline: var(--chat-composer-padding-inline);
  padding-block: var(--chat-composer-padding-block);
  padding-bottom: calc(var(--chat-composer-padding-block) + var(--chat-safe-bottom));
  background: var(--chat-composer-bg);
  border: var(--chat-composer-border);
  border-radius: var(--chat-composer-radius);
  box-shadow: var(--chat-composer-shadow);
}
.chat-composer__form { gap: var(--chat-composer-gap); }
.chat-composer__input {
  min-height: var(--chat-input-min-height);
  max-height: var(--chat-input-max-height);
  padding-inline: var(--chat-input-padding-inline);
  padding-block: var(--chat-input-padding-block);
  background: var(--chat-input-bg);
  color: var(--chat-input-color);
  border: var(--chat-input-border);
  border-radius: var(--chat-input-radius);
}
.chat-composer__input::placeholder { color: var(--chat-input-placeholder); }
.chat-composer__input:focus-visible { border-color: var(--chat-input-focus-border); box-shadow: var(--chat-input-focus-ring); outline: none; }
.chat-composer__button { width: var(--chat-action-size); height: var(--chat-action-size); transition-duration: var(--chat-motion-duration); transition-timing-function: var(--chat-motion-easing); }
.chat-composer__send-only-button { width: var(--chat-send-only-size); height: var(--chat-send-only-size); }
.chat-composer__send-reply-button { width: var(--chat-send-reply-size); height: var(--chat-send-reply-size); }
.chat-composer__send-only-button { background: var(--chat-send-only-bg); }
.chat-composer__send-reply-button { background: var(--chat-send-reply-bg); }
.chat-tools {
  display: var(--chat-tools-display);
  grid-template-columns: repeat(var(--chat-tools-columns), minmax(0, 1fr));
  padding: var(--chat-tools-padding);
  row-gap: var(--chat-tools-row-gap);
  column-gap: var(--chat-tools-column-gap);
  background: var(--chat-tools-bg);
  gap: var(--chat-tools-gap);
}
.chat-tool { min-width: 0; min-height: 2.75rem; touch-action: manipulation; }
.chat-tool__icon { width: var(--chat-tool-size); height: var(--chat-tool-size); border-radius: var(--chat-tool-radius); }
.chat-tool__label { margin-top: var(--chat-tool-label-gap); font-size: var(--chat-tool-label-size); }
.chat-tool__label { display: var(--chat-tool-label-display); }
.chat-tool--more .chat-tool__icon { width: var(--chat-more-icon-box-size); height: var(--chat-more-icon-box-size); }
.chat-tool--more .chat-tool__icon svg,
.chat-tool--more .chat-tool__icon img { width: var(--chat-more-icon-size); height: var(--chat-more-icon-size); }
.chat-message--voice.voice-message-bar {
  box-sizing: border-box;
  width: var(--chat-voice-max-width);
  min-width: var(--chat-voice-min-width);
  max-width: var(--chat-voice-max-width);
  overflow: hidden;
}
.chat-message--voice-wave { min-width: 0; overflow: var(--chat-voice-wave-overflow); }
.chat-message--voice-duration { flex: 0 0 auto; white-space: nowrap; }
.chat-message--voice { min-height: var(--chat-voice-height); }
.chat-message--voice-wave { color: var(--chat-voice-wave-color); }
.chat-message--voice-duration { color: var(--chat-voice-duration-color); }
.message-quote { padding: var(--chat-quote-padding); border-radius: var(--chat-quote-radius); }
.message-quote__jump { width: var(--chat-quote-jump-size); height: var(--chat-quote-jump-size); cursor: pointer; }

.chat-message__avatar-slot { flex: 0 0 auto; }
.chat-message__content { min-width: 0; max-width: var(--chat-message-content-max-width); }
.chat-message__text { overflow-wrap: anywhere; word-break: break-word; }
.chat-message-row[data-message-state="selected"] { box-shadow: var(--chat-focus-ring); }
.chat-header__back-button:focus-visible,
.chat-header__more-button:focus-visible,
.chat-composer__button:focus-visible,
.chat-tool:focus-visible,
.message-quote__jump:focus-visible { outline: none; box-shadow: var(--chat-focus-ring); }

@media (prefers-reduced-motion: reduce) {
  .chat-page *, .chat-page *::before, .chat-page *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}

/* 稳定语义钩子：按需取消注释并修改。 */
/* .chat-header {} */
/* .chat-header__back-button {} */
/* .chat-header__identity {} */
/* .chat-header__avatar {} */
/* .chat-header__title {} */
/* .chat-header__status {} */
/* .chat-header__more-button {} */
/* .chat-messages {} */
/* .chat-message-row[data-message-side="self"] {} */
/* .chat-message-row[data-message-side="other"] {} */
/* .chat-bubble-self, .chat-bubble-other {} */
/* .chat-composer {} */
/* .chat-composer__attach-button { display: none; } */
/* .chat-composer__input-shell {} */
/* .chat-composer__form[data-has-text="true"] .chat-composer__send-only-button {} */
/* .chat-composer__send-reply-button {} */
/* .chat-tools {} */
/* .chat-tool[data-tool-tier="primary"] {} */
/* .chat-tool[data-tool-tier="secondary"] {} */
/* .chat-tool--more { display: flex; } */
/* .chat-tools[data-tools-expanded="false"] .chat-tool[data-tool-tier="secondary"] { display: none; } */
`;
