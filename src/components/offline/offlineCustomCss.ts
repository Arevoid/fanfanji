export const OFFLINE_CSS_EXAMPLE_TEMPLATE = `/* 米饭机线下界面样式 CSS：只作用于当前线下页面 */
.offline-page {
  --offline-bg: #f8f8f8;
  --offline-pink: #ff6f91;
  --offline-pink-light: #fff0f4;
  --offline-ink: #202124;
  --offline-muted: #99999f;
  --offline-line: rgba(32, 33, 36, 0.16);
  --offline-reading-card: #ffffff;
  --offline-reading-text: #4a4a4f;
}

.offline-story-workspace {
  background-color: var(--offline-bg) !important;
  background-image:
    linear-gradient(rgba(40, 40, 40, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(40, 40, 40, 0.055) 1px, transparent 1px) !important;
  background-size: 25px 25px !important;
}

.offline-workspace-header {
  padding: 12px 16px !important;
  background: var(--offline-pink-light) !important;
  border-bottom: 2px solid rgba(255, 111, 145, 0.28) !important;
}

.offline-workspace-nav { height: 48px !important; }

.offline-workspace-back,
.offline-workspace-header .offline-icon-button {
  color: var(--offline-pink) !important;
  border-radius: 999px !important;
}

.offline-workspace-title h1 {
  color: var(--offline-ink) !important;
  font-family: "Noto Serif SC", "Songti SC", serif !important;
  font-size: 21px !important;
  font-weight: 800 !important;
  letter-spacing: 0.08em !important;
}

.offline-workspace-title p { display: none !important; }

.offline-mode-label {
  border: 0 !important;
  border-radius: 999px !important;
  background: var(--offline-pink) !important;
  color: #ffffff !important;
}

.offline-story-scroll {
  background: transparent !important;
  padding: 38px 22px 24px !important;
}

.offline-story-list { gap: 20px !important; }

.offline-story-card {
  position: relative !important;
  border: 2px solid var(--offline-ink) !important;
  border-radius: 0 !important;
  padding: 42px 24px 22px !important;
  background: #ffffff !important;
  box-shadow: 4px 4px 0 rgba(32, 33, 36, 0.12) !important;
}

.offline-story-card--user { background: #fffafd !important; }

.offline-story-card-header {
  min-height: 38px !important;
  margin-bottom: 18px !important;
  padding-bottom: 15px !important;
  border-bottom: 2px dashed rgba(32, 33, 36, 0.28) !important;
}

.offline-story-author { gap: 12px !important; }

.offline-story-author-avatar,
.offline-author-placeholder {
  width: 58px !important;
  height: 58px !important;
  margin-top: -52px !important;
  border: 3px solid var(--offline-ink) !important;
  border-radius: 50% !important;
  background: #ffffff !important;
  box-shadow: 2px 2px 0 rgba(32, 33, 36, 0.16) !important;
}

.offline-story-card--user .offline-story-author-avatar { border-color: var(--offline-pink) !important; }

.offline-story-author strong {
  color: var(--offline-ink) !important;
  font-family: "Noto Serif SC", "Songti SC", serif !important;
  font-size: 18px !important;
  font-weight: 800 !important;
}

.offline-story-card-time {
  margin-top: 4px !important;
  color: var(--offline-muted) !important;
  font-family: "Space Mono", monospace !important;
  font-size: 11px !important;
}

.offline-story-card-content {
  color: var(--offline-reading-text) !important;
  font-family: "Noto Serif SC", "Songti SC", serif !important;
  font-size: 17px !important;
  font-weight: 600 !important;
  line-height: 2 !important;
  letter-spacing: 0.04em !important;
}

.offline-dialogue-highlight { color: var(--offline-pink) !important; font-weight: 800 !important; }

.offline-story-card-footer { margin-top: 18px !important; padding-top: 12px !important; border-top: 1px solid var(--offline-line) !important; }

.offline-node-trigger {
  width: 38px !important;
  height: 38px !important;
  border: 2px solid var(--offline-ink) !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--offline-ink) !important;
}

.offline-composer-wrap { border-top: 2px solid var(--offline-ink) !important; background: #ffffff !important; }
.offline-composer { border-radius: 0 !important; box-shadow: 4px 4px 0 rgba(32, 33, 36, 0.12) !important; }
.offline-composer-input-field { color: var(--offline-ink) !important; font-family: "Noto Serif SC", "Songti SC", serif !important; }
.offline-composer-submit { background: #202124 !important; color: #ffffff !important; }
.offline-composer-submit:hover { background: var(--offline-pink) !important; }`;

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
