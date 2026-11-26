export const OFFLINE_CSS_EXAMPLE_TEMPLATE = `/* 米饭机线下界面样式 CSS：通用模板
 * 只作用于当前线下页面，不包含线上聊天样式，也不内置任何主题图片。
 * 可直接修改下方变量，再按组件类名覆盖细节。
 */
.offline-page {
  --offline-page-bg: #f8f8f8;
  --offline-page-bg-image: none;
  --offline-page-overlay: transparent;

  --offline-surface: rgba(255, 255, 255, .92);
  --offline-surface-muted: #f3f4f6;
  --offline-nav-bg: rgba(255, 255, 255, .9);
  --offline-nav-border: rgba(31, 41, 55, .12);

  --offline-text: #202124;
  --offline-text-secondary: #6b7280;
  --offline-text-tertiary: #9ca3af;
  --offline-reading-text: #343438;
  --offline-accent: #526a9a;
  --offline-accent-text: #ffffff;
  --offline-border: rgba(31, 41, 55, .14);

  --offline-card-bg: #ffffff;
  --offline-character-card-bg: #ffffff;
  --offline-user-card-bg: #f4f7fb;
  --offline-card-border: rgba(31, 41, 55, .14);
  --offline-card-radius: 16px;
  --offline-card-shadow: 0 4px 18px rgba(15, 23, 42, .06);
  --offline-card-padding: 20px;

  --offline-content-max-width: 720px;
  --offline-content-gutter: 18px;
  --offline-story-gap: 18px;
  --offline-reading-font-size: 17px;
  --offline-reading-line-height: 1.95;
  --offline-reading-letter-spacing: .03em;
  --offline-focus-ring: 0 0 0 3px rgba(82, 106, 154, .22);
}

/* 页面、目录和工作区 */
.offline-page {
  color: var(--offline-text) !important;
  background-color: var(--offline-page-bg) !important;
  background-image: var(--offline-page-bg-image) !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;
}

.offline-page::before { background: var(--offline-page-overlay) !important; }

.offline-page :is(.offline-story-directory, .offline-story-workspace),
.offline-page .offline-story-directory-list,
.offline-page .offline-story-scroll { background: transparent !important; }

.offline-page .offline-directory-header,
.offline-page .offline-workspace-header {
  background: var(--offline-nav-bg) !important;
  border-color: var(--offline-nav-border) !important;
}

.offline-page .offline-workspace-nav { min-height: 48px !important; }
.offline-page .offline-workspace-title h1 { color: var(--offline-text) !important; }
.offline-page .offline-workspace-title p { color: var(--offline-text-secondary) !important; }
.offline-page :is(.offline-workspace-back, .offline-icon-button) { color: var(--offline-accent) !important; }
.offline-page .offline-mode-label {
  border-color: color-mix(in srgb, var(--offline-accent) 28%, transparent) !important;
  background: color-mix(in srgb, var(--offline-accent) 10%, transparent) !important;
  color: var(--offline-accent) !important;
}

/* 线上关联提示和 IF 设定提示 */
.offline-page .offline-chat-link-card,
.offline-page .offline-if-context {
  border-color: var(--offline-border) !important;
  background: var(--offline-surface-muted) !important;
  color: var(--offline-text-secondary) !important;
}

/* 剧情滚动区与记录列表 */
.offline-page .offline-story-scroll {
  padding: var(--offline-content-gutter) !important;
  scrollbar-color: color-mix(in srgb, var(--offline-accent) 55%, transparent) transparent;
}

.offline-page .offline-story-list {
  width: min(100%, var(--offline-content-max-width)) !important;
  gap: var(--offline-story-gap) !important;
  margin: 0 auto !important;
}

.offline-page .offline-story-session { color: var(--offline-text-tertiary) !important; }
.offline-page .offline-story-session span:last-child {
  background: var(--offline-surface-muted) !important;
  color: var(--offline-text-secondary) !important;
}

/* 新版剧情卡片：按 data-offline-role、is-user、is-character 三套入口定制 */
.offline-page .offline-story-card {
  box-sizing: border-box;
  border: 1px solid var(--offline-card-border) !important;
  border-radius: var(--offline-card-radius) !important;
  padding: var(--offline-card-padding) !important;
  background: var(--offline-card-bg) !important;
  box-shadow: var(--offline-card-shadow) !important;
}

.offline-page .offline-story-card.is-character,
.offline-page .offline-story-card[data-offline-role="character"] { background: var(--offline-character-card-bg) !important; }

.offline-page .offline-story-card.is-user,
.offline-page .offline-story-card[data-offline-role="user"] { background: var(--offline-user-card-bg) !important; }

.offline-page .offline-story-card-header {
  margin-bottom: 14px !important;
  border-color: var(--offline-border) !important;
}

.offline-page .offline-story-author { gap: 10px !important; }
.offline-page .offline-story-author-avatar,
.offline-page .offline-author-placeholder {
  width: 34px !important;
  height: 34px !important;
  border: 1px solid var(--offline-border) !important;
  border-radius: 50% !important;
  background: var(--offline-surface-muted) !important;
  object-fit: cover;
}

.offline-page .offline-story-author strong {
  color: var(--offline-text) !important;
  font-size: 14px !important;
  font-weight: 700 !important;
}

.offline-page .offline-story-card-time {
  color: var(--offline-text-tertiary) !important;
  font-size: 11px !important;
}

.offline-page .offline-story-card-content,
.offline-page .offline-raw-content {
  color: var(--offline-reading-text) !important;
  font-size: var(--offline-reading-font-size) !important;
  font-weight: 400 !important;
  letter-spacing: var(--offline-reading-letter-spacing) !important;
  line-height: var(--offline-reading-line-height) !important;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 对白高亮、折叠叙事和动作卡片 */
.offline-page .offline-dialogue-highlight { color: var(--offline-accent) !important; font-weight: 600 !important; }
.offline-page .offline-story-details {
  border-color: var(--offline-border) !important;
  background: var(--offline-surface-muted) !important;
  color: var(--offline-text) !important;
}

.offline-page .offline-story-action-card {
  border-color: color-mix(in srgb, var(--offline-accent) 28%, transparent) !important;
  background: color-mix(in srgb, var(--offline-card-bg) 88%, var(--offline-accent) 12%) !important;
  color: var(--offline-reading-text) !important;
}
.offline-page .offline-story-action-card svg { color: var(--offline-accent) !important; }

/* 节点菜单、生成状态和错误提示 */
.offline-page .offline-story-card-footer { border-color: var(--offline-border) !important; }
.offline-page .offline-node-trigger {
  border-color: var(--offline-border) !important;
  background: transparent !important;
  color: var(--offline-text-secondary) !important;
}
.offline-page .offline-story-status { color: var(--offline-accent) !important; }
.offline-page .offline-story-error {
  border-color: rgba(194, 81, 76, .28) !important;
  background: #fff8f7 !important;
  color: #c2514c !important;
}

/* 底部输入区 */
.offline-page .offline-composer-wrap {
  border-color: var(--offline-nav-border) !important;
  background: var(--offline-nav-bg) !important;
}
.offline-page .offline-composer {
  border-color: var(--offline-border) !important;
  background: var(--offline-surface) !important;
  box-shadow: var(--offline-card-shadow) !important;
}
.offline-page .offline-composer-input-field { color: var(--offline-text) !important; }
.offline-page .offline-composer-input-field::placeholder { color: var(--offline-text-tertiary) !important; }
.offline-page .offline-composer-submit {
  background: var(--offline-accent) !important;
  color: var(--offline-accent-text) !important;
}

/* 目录卡片 */
.offline-page .offline-story-directory [data-offline-card="directory-story"] {
  border-color: var(--offline-card-border) !important;
  border-radius: var(--offline-card-radius) !important;
  background: var(--offline-card-bg) !important;
  box-shadow: var(--offline-card-shadow) !important;
}

@media (max-width: 440px) {
  .offline-page {
    --offline-content-gutter: 16px;
    --offline-story-gap: 14px;
    --offline-card-padding: 16px;
    --offline-reading-font-size: 16px;
  }
}
`;

/**
 * Keeps per-story custom CSS inside the offline workspace. The style element
 * itself is rendered within the message list, but CSS selectors would
 * otherwise still be global to the document.
 *
 * `@scope` lets advanced users continue to write normal selectors such as
 * `.offline-story-card` while preventing broad selectors from affecting the
 * chat, settings, or character-phone pages.
 */
export function scopeOfflineCustomCss(css: string): string {
  const value = css.trim();
  if (!value) return "";

  // `@scope` applies ordinary selectors to descendants of the scope root;
  // rewrite selectors targeting the root itself to `:scope` so theme
  // variables declared on `.offline-page` are available to the whole page.
  const rootAwareCss = value.replace(/(^|[,{]\s*)\.offline-page(?=\s*[{.#:[>+~])/gm, "$1:scope");
  return `@scope (.offline-page) {\n${rootAwareCss}\n}`;
}
