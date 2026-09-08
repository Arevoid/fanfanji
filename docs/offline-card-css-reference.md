# 线下卡片 CSS 类名说明

自定义 CSS 会自动限制在 `.offline-page` 内，只影响当前线下页面。建议优先使用下面的公开类名，不要依赖 Tailwind 工具类或 DOM 层级。

## 页面与视图状态

| 类名 | 用途 |
| --- | --- |
| `.offline-page` | 线下页面根容器 |
| `.offline-page.is-directory` | 线下故事列表页 |
| `.offline-page.is-workspace` | 当前故事工作区 |
| `.offline-page.is-settings` | 当前故事设置页 |
| `[data-offline-view="directory"]` | 故事列表视图 |
| `[data-offline-view="workspace"]` | 故事工作区视图 |
| `[data-offline-view="settings"]` | 故事设置视图 |
| `.offline-story-workspace.is-mode-continue` | 续写模式 |
| `.offline-story-workspace.is-mode-director` | 导演模式 |
| `.offline-story-workspace.is-mode-if` | IF 模式 |

## 故事列表

| 类名 | 用途 |
| --- | --- |
| `.offline-story-directory` | 故事目录容器 |
| `.offline-directory-header` | 目录页顶部导航 |
| `.offline-character-filter` | 角色筛选栏 |
| `.offline-character-filter-list` | 角色筛选横向列表 |
| `.offline-character-filter-item` | 单个角色筛选项 |
| `.offline-character-filter-item.is-active` | 当前选中的角色 |
| `.offline-character-filter-avatar` | 筛选栏角色头像 |
| `.offline-story-directory-list` | 故事条目列表 |

## 故事工作区

| 类名 | 用途 |
| --- | --- |
| `.offline-workspace-header` | 当前故事顶部栏 |
| `.offline-workspace-header--continue` | 续写模式顶部栏 |
| `.offline-workspace-header--director` | 导演模式顶部栏 |
| `.offline-workspace-header--if` | IF 模式顶部栏 |
| `.offline-workspace-nav` | 顶部导航布局 |
| `.offline-workspace-back` | 返回按钮 |
| `.offline-workspace-title` | 故事标题区域 |
| `.offline-workspace-title-text` | 故事标题文字 |
| `.offline-mode-label` | 模式标签 |
| `.offline-story-scroll` | 剧情滚动区域 |
| `.offline-story-list` | 剧情卡片列表 |
| `.offline-story-session` | 剧情记录信息 |

## 剧情卡片

| 类名 | 用途 |
| --- | --- |
| `.offline-story-card` | 单条剧情卡片 |
| `.offline-story-card.is-character` / `.offline-story-card--character` | 角色卡片 |
| `.offline-story-card.is-user` / `.offline-story-card--user` | 用户卡片 |
| `.offline-story-card-header` | 卡片头部 |
| `.offline-story-author` | 作者信息区域 |
| `.offline-story-author-avatar` | 作者头像 |
| `.offline-story-author-copy` | 作者名字和时间 |
| `.offline-story-card-time` | 时间 |
| `.offline-story-card-content` | 剧情正文 |
| `.offline-dialogue-highlight` | 对话高亮文字 |
| `.offline-story-card-footer` | 卡片底部操作区 |
| `.offline-story-card-actions` | 操作按钮容器 |
| `.offline-node-trigger` | 更多操作按钮 |
| `.offline-node-menu` | 操作菜单 |

## 内容与输入

| 类名 | 用途 |
| --- | --- |
| `.offline-story-details` | 可折叠剧情详情 |
| `.offline-story-details-content` | 折叠内容 |
| `.offline-composer-wrap` | 底部输入区域外框 |
| `.offline-composer` | 输入栏主体 |
| `.offline-composer-input-field` | 剧情输入框 |
| `.offline-composer-submit` | 发送/继续按钮 |

## 推荐修改范围

适合修改背景、颜色、字体、字号、行高、字间距、卡片圆角、边框、阴影、头像外观、角色/用户差异和输入栏外观。

涉及 `display`、`position`、`overflow`、`z-index`、`pointer-events`、根容器高度和滚动行为的规则应谨慎使用，以免破坏页面交互。
