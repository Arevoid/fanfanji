# 聊天页设置 UI 设计规范

版本：v1.1
适用范围：小手机聊天页「设置」及其二级设置页面；米饭机各应用的统一容器与导航视觉
参考实现：`src/components/AppChat.tsx`

## 1. 设计目标

聊天设置页及米饭机各应用采用 iOS 简洁设置风格：浅灰背景、浅色白色分组容器、低对比度分割线、黑色主文字、灰色辅助文字。页面强调清晰分组、短列表、直接操作和稳定的垂直节奏。

业务配置项、保存流程和已有数据字段保持不变；本规范只约束 UI 结构、视觉和交互表现。

## 2. 页面层级

```text
ChatSettingsPage
├── SettingsPageHeader
├── ProfileCard
│   ├── Avatar
│   ├── DisplayName
│   ├── RemarkEditButton
│   └── RemarkInput（编辑状态）
├── BackgroundWallpaperCard
├── SectionHeader：偏好设置
├── ToggleListCard
│   ├── ToggleListItem：置顶聊天
│   ├── ToggleListItem：过滤括号动作描写
│   ├── ToggleListItem：时间感知功能
│   ├── ToggleListItem：全部自动翻译
│   ├── ToggleListItem：主动联络
│   └── ToggleListItem：主动来电
├── SectionHeader：更多设置
├── NavigateListCard
│   ├── NavigateListItem：记忆设置
│   ├── NavigateListItem：语音图片
│   └── NavigateListItem：美化样式
├── SectionHeader：危险操作
└── DangerActionCard
    ├── DangerActionItem：清空对话记录
    └── DangerActionItem：删除好友／解除群聊
```

## 3. 组件类型总表

| 组件名称 | 组件类型 | 作用 |
|---|---|---|
| `SettingsPageHeader` | 页面导航组件 | 返回、页面标题、保存设置 |
| `ProfileCard` | 信息卡片 | 展示角色头像、角色名称和备注名 |
| `Avatar` | 媒体组件 | 展示角色头像，使用圆形头像规则 |
| `DisplayName` | 文本组件 | 展示角色名；有备注时显示「名字（备注名）」 |
| `RemarkEditButton` | 图标按钮 | 打开／关闭备注名编辑状态 |
| `RemarkInput` | 表单输入组件 | 编辑备注名或群聊名称 |
| `BackgroundWallpaperCard` | 功能卡片 | 上传、更换、移除聊天背景壁纸 |
| `SectionHeader` | 分区标题组件 | 标记功能分组，必须位于卡片外部上方 |
| `Card` | 通用容器组件 | 提供白色背景、圆角、边框和统一阴影 |
| `ToggleListCard` | 列表卡片 | 承载多个开关表单项 |
| `ToggleListItem` | Toggle 表单项 | 左侧标题、右侧紧凑开关 |
| `CompactToggle` | 开关组件 | 42×24px 的紧凑型胶囊开关 |
| `NavigateListCard` | 列表卡片 | 承载二级设置入口 |
| `NavigateListItem` | Navigate 表单项 | 标题、右侧直接箭头 |
| `DangerActionCard` | 危险操作卡片 | 承载清空、删除、解除等危险操作 |
| `DangerActionItem` | 危险操作项 | 红色文字、右侧直接箭头 |
| `Divider` | 分割线组件 | 分隔列表项，不出现在最后一项之后 |
| `UploadField` | 上传组件 | 背景图或参考图上传入口 |
| `SecondarySettingsPage` | 二级页面容器 | 记忆、语音图片、美化样式设置页 |
| `MemorySettingsPanel` | 二级设置面板 | Token、上下文、归档等记忆参数 |
| `VoiceSettingsCard` | 二级设置卡片 | Voice ID、语速等语音参数 |
| `ImageSettingsCard` | 二级设置卡片 | 图片生成开关、外观提示词、参考图 |
| `AppearanceSettingsCard` | 二级设置卡片 | 自定义 CSS 和聊天图标覆盖 |
| `RangeControl` | 数值表单组件 | 滑块与当前值展示 |
| `SaveButton` | 页面操作组件 | 保存二级页面设置 |

## 4. 页面基础约束

### 4.1 页面容器

- 页面背景：`#F7F7F9` 或同等极浅灰色。
- 页面左右内边距：`16px`。
- 内容区垂直间距：`12px`。
- 底部安全区：至少预留 `34px`，适配全面屏手势区域。
- 页面禁止出现横向滚动条。
- 设置页滚动只发生在内容区，顶部导航固定。

### 4.2 页面头部 `SettingsPageHeader`

- 高度：约 `44px`，根据设备状态栏安全区调整。
- 左侧：返回按钮，触控区域不小于 `32×32px`。
- 中间：页面标题「设置」，`16px`、Medium/Bold、`#111111`。
- 右侧：保存按钮，触控区域不小于 `32×32px`。
- 返回、添加、菜单、删除、保存等导航栏操作统一使用扁平透明按钮。
- 按钮保留不小于 `32×32px` 的触控区域，但不显示圆形、有色或阴影底座。
- 图标直接显示在页面背景上，默认颜色为 `#334155`；悬停或按下只改变透明度，不新增背景。
- 导航栏顶部容器使用透明背景、无底部阴影、无额外边框；页面标题居中显示。

### 4.3 跨应用顶部容器与导航按钮

所有应用（聊天、档案馆、世界书、备忘录、日记、记忆书、线下、日程、阅读、影视、音乐、论坛、设置等）的顶部导航必须使用同一视觉规则：

```css
.app-nav-icon-button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.app-top-container {
  background: transparent;
  border-bottom: 0;
  box-shadow: none;
}
```

- 左侧返回、右侧添加或菜单按钮均使用 `app-nav-icon-button`。
- 不得在单个应用中恢复圆形灰底、圆形彩色底或按钮阴影。
- 图标按钮的透明触控区域可以扩大，但视觉底色必须保持透明。

## 5. Profile 用户卡片

组件：`ProfileCard`

- 背景：`#FFFFFF`。
- 圆角：`10px`。
- 阴影：`0 1px 3px rgba(0, 0, 0, 0.06)`。
- 边框：默认无边框；如必须分隔，仅使用极浅色 `#F0F0F0`。
- 内边距：`16px`。
- 推荐高度：约 `72px`。
- 横向布局：头像 → 文字区 → 编辑按钮。
- 头像与文字区间距：`12px`。

### 5.1 Avatar

- 尺寸：`48×48px`。
- 形状：`50%` 圆形，即 `border-radius: 50%`。
- 头像圆形可以使用 `rounded-full`，但只允许用于头像和圆形状态控件。
- 头像不得复用输入框、卡片或胶囊按钮的圆角样式。
- 头像可有轻微阴影，但不应大于 `0 2px 8px rgba(0,0,0,0.08)`。

### 5.2 DisplayName

- 正常状态：显示角色原名。
- 有备注时：显示 `名字（备注名）`。
- 主文字：`16px`、Medium、`#111111`。
- 名称超长时单行截断，不撑开卡片。
- 编辑按钮位于名称右侧，使用 `Edit3` 或同等编辑图标，图标尺寸约 `16px`。

### 5.3 RemarkInput

- 默认不显示输入框，仅显示名称和编辑图标。
- 点击编辑图标后，在名称区域切换为输入状态。
- 高度固定：`32px`。
- 宽度：占据文字区剩余空间。
- 背景：`#F7F7F9`。
- 圆角：推荐 `8px` 或 `12px`，必须小于输入框高度的一半。
- 强制覆盖规则：

```css
.cv-remark-input {
  height: 32px !important;
  min-height: 32px !important;
  border-radius: 8px !important; /* 可按设计调整为 12px */
  box-shadow: none !important;
}
```

- 禁止继承头像的 `50%` 圆角。
- 禁止使用 `9999px`、`rounded-full` 或胶囊类圆角。

## 6. Section Header 分区标题

组件：`SectionHeader`

Section Header **必须放在卡片外部、卡片上方**，不得放入白色卡片内部。

- 字号：`14px`。
- 字重：400～500。
- 颜色：`#999999`。
- 左对齐，与卡片内容左边缘对齐。
- 标题与下方卡片间距：`8px` 左右。
- 分区之间通过页面垂直间距区分，不使用额外大面积背景块。

当前分区标题：

- `偏好设置`
- `更多设置`
- `危险操作`

「背景壁纸」是独立功能卡片，不需要额外的灰色 Section Header。

## 7. 通用 Card 卡片容器

组件：`Card`

```css
.settings-card {
  background: #FFFFFF;
  border: 0;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
```

约束：

- 所有主设置卡片统一 `10px` 圆角。
- 卡片之间垂直间距：`12px`。
- 卡片内部列表项不再叠加独立白色卡片。
- 禁止大面积模糊阴影、双层 elevation 或多重 shadow；内容卡片不得使用超过 `0 3px 10px` 的阴影。
- 卡片不得使用 `9999px` 圆角。
- 卡片内部最后一项不渲染分割线。

### 7.1 跨应用白色内容卡片

米饭机内所有白色内容卡片、列表分组和设置容器均遵循 `Card` 规则，不得按应用单独设计一套圆角和阴影：

- 背景统一为浅色表面（通常为 `#FFFFFF` 或 `var(--surface)`）。
- 圆角统一为 `10px`；不使用 `24px`、`32px` 等页面级大圆角。
- 阴影统一为轻量阴影 `0 1px 3px rgba(0, 0, 0, 0.06)`。
- 列表项在同一个容器内使用分割线，不为每一项叠加独立浮动白卡。
- 头像、消息气泡、开关、应用图标、弹窗和底部抽屉属于独立视觉组件，不套用内容卡片规则。

### 7.2 居中空状态与创建按钮

档案馆、线下等页面的空状态创建按钮统一使用浅色按钮，不使用黑色实心按钮：

```css
.empty-state-action {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  font-size: 12px;
  font-weight: 600;
}
```

- 按钮在空状态内容区水平居中。
- 同类按钮尺寸、圆角、阴影和文字规格必须一致。
- 悬停或按下只使用更浅的表面色变化，不切换为黑底白字。

## 8. 背景壁纸卡片

组件：`BackgroundWallpaperCard`

- 位置：Profile 卡片之后、`偏好设置` Section Header 之前。
- 背景：白色。
- 圆角：`10px`。
- 内边距：`16px`。
- 标题：`背景壁纸`，`15px`、Medium、`#111111`。
- 上传区域高度：`48px`。
- 上传区域圆角：`12px`。
- 上传区域背景：`#F7F7F9`。
- 边框：`1px dashed #D8D8DF`。
- 空状态文字居中，`14px`、`#8E8E93`。
- 已上传状态保留更换和移除操作，但不改变卡片尺寸体系。

## 9. Toggle 开关表单项

组件：`ToggleListCard`、`ToggleListItem`、`CompactToggle`

### 9.1 ToggleListCard

- 使用一个整体白色卡片承载全部开关项。
- 不为每个开关项创建独立卡片。
- 卡片圆角：`10px`。
- 卡片阴影：统一通用 Card 阴影。
- 列表项高度：`52px`。
- 列表项水平内边距：`16px`。
- 主标题：`16px`、正常或 Medium 字重。
- 当前偏好设置列表不渲染 description/subtitle。

### 9.2 CompactToggle

```css
.compact-toggle {
  width: 42px;
  height: 24px;
  border-radius: 12px;
  padding: 0;
}

.compact-toggle-thumb {
  width: 20px;
  height: 20px;
}
```

- 轨道尺寸固定为 `42×24px`。
- thumb 直径固定为 `20px`。
- 关闭颜色：`#E5E5EA`。
- 开启颜色：品牌黑 `#111111`，除非产品主题另有定义。
- thumb 使用白色和轻微阴影。
- 禁止外层额外 padding。
- 禁止外层再套灰色胶囊容器。
- 禁止使用 `transform: scale()` 缩放开关。
- 开关轨道可以是半高圆角 `12px`，但不得使用 `9999px` 作为通用圆角类。
- 自定义 CSS 可能覆盖开关时，应使用组件自身的高优先级样式保护尺寸。

## 10. Navigate 跳转表单项

组件：`NavigateListCard`、`NavigateListItem`

- 一个整体白色卡片，包含三行：
  - 记忆设置
  - 语音图片
  - 美化样式
- 每行高度：`52px`。
- 每行水平内边距：`16px`。
- 左侧为标题，字号 `16px`、颜色 `#111111`。
- 右侧为直接显示的 `ChevronRight` 箭头。
- 箭头颜色：`#C7C7CC`。
- 箭头尺寸：约 `20px`。
- 箭头不得有灰色圆形或胶囊背景。
- 跳转按钮本身可以是透明按钮，但不得使用 pill button 样式。

## 11. Danger 危险操作

组件：`DangerActionCard`、`DangerActionItem`

- `危险操作` Section Header 位于卡片外部上方。
- 清空对话记录和删除好友／解除群聊必须合并到一个整体 Card。
- 卡片圆角：`10px`。
- 每行高度：`52px`。
- 文字颜色：`#FF3B30`。
- 文字字号：`16px`。
- 右侧使用直接箭头 `ChevronRight`，颜色 `#C7C7CC`。
- 不使用两个独立白色容器。
- 危险操作卡片与上方卡片间距：约 `12px`；Section Header 与卡片间距：约 `8px`。

## 12. Divider 分割线规则

```css
.settings-divider {
  height: 1px;
  background: #F0F0F0;
}
```

- 分割线仅用于同一卡片内相邻列表项之间。
- 第一项上方不渲染分割线。
- 最后一项下方不渲染分割线。
- 禁止同时使用父级 `divide-y` 和子项 `border-bottom` 造成双线。
- 分割线颜色应低于主文字对比度，不得使用黑色或品牌强调色。
- 分割线不改变列表项高度。
- 主设置页的「主动联络」与「主动来电」之间必须保留分割线。

## 13. 四层文字层级

| 层级 | 用途 | 字号 | 字重 | 颜色 |
|---|---|---:|---|---|
| Level 1 | 页面标题、主要设置项、角色名称 | 16px | Medium/Bold | `#111111` |
| Level 2 | Section Header、卡片标题 | 14～15px | Regular/Medium | `#999999` 或 `#111111` |
| Level 3 | helper-text、输入提示、操作说明 | 12px | Regular | `#8E8E93` |
| Level 4 | 辅助状态、时间、极小标签 | 10px | Regular/Medium | `#C7C7CC` |

偏好设置列表当前不显示 Level 3 description；其他二级设置页面仍可根据功能保留 helper-text。

## 14. 配色规范

| Token | 值 | 用途 |
|---|---|---|
| `page-background` | `#F7F7F9` | 页面背景 |
| `surface-card` | `#FFFFFF` | 卡片背景 |
| `text-primary` | `#111111` | 主要文字 |
| `text-secondary` | `#999999` | Section Header |
| `text-helper` | `#8E8E93` | 辅助说明、占位文字 |
| `text-tertiary` | `#C7C7CC` | 箭头、次要状态 |
| `divider` | `#F0F0F0` | 分割线、浅边框 |
| `input-background` | `#F7F7F9` | 输入框背景 |
| `toggle-off` | `#E5E5EA` | 关闭状态开关 |
| `toggle-on` | `#111111` | 开启状态开关 |
| `danger` | `#FF3B30` | 危险操作文字 |

设置页默认不使用蓝色装饰色。箭头和普通交互反馈使用中性灰；危险操作只使用红色。

## 15. 二级设置页面规范

点击 `NavigateListItem` 后进入二级页面，二级页面复用同一套：

- `SecondaryPageHeader`
- `Card`
- `SectionHeader`
- `Divider`
- `SaveButton`

### 15.1 记忆设置

- 页面标题：`记忆设置`。
- 保留 Token 预估、短期上下文、长期检索池、自动归档等原有业务控件。
- 各控制区使用独立白色子卡片时，仍统一 `10px` 圆角和轻量阴影。
- 数值徽标使用小尺寸固定圆角，不得使用头像圆形样式。
- 滑块、开关、输入数值均不得影响页面整体卡片间距。

### 15.2 语音图片

- 页面标题：`语音图片`。
- 分组顺序：语音设置、图片生成设置。
- Voice ID 输入框、提示词输入框使用固定像素圆角，推荐 `8px`。
- 图片参考图上传区域使用虚线边框和 `12px` 圆角。
- 图片生成开关复用 `CompactToggle`。

### 15.3 美化样式

- 页面标题：`美化样式`。
- CSS 编辑器使用固定圆角输入容器，推荐 `8px` 或 `12px`。
- 聊天图标覆盖使用网格表单，不使用圆形输入框。
- 所有代码输入框必须显式覆盖角色自定义 CSS，避免继承 `9999px` 或 `50%` 圆角。

### 15.4 Input / Select 表单控件

- `input`、`select`、`textarea` 使用固定像素圆角，推荐 `14px`；也可在具体组件中使用 `8px`、`12px` 或 `16px`。
- 表单控件必须保持矩形圆角，圆角值不得使用 `50%`、`9999px`、`rounded-full` 或头像圆形样式类。
- 全局表单样式不得使用 `border-radius: 50%`、`border-radius: 9999px` 或带 `!important` 的圆角覆盖，确保组件调整固定 px 数值时能够正常生效。
- 表单控件的高度、内边距和业务交互保持原有实现；本规则只规范圆角来源。
- `input[type="range"]` 的轨道和 thumb 属于滑块专用形状，不套用普通文本输入框圆角规则。
- 头像仍可独立使用 `border-radius: 50%`，但不得与任何表单控件复用同一圆形 class。

推荐基线：

```css
input:not([type="range"]),
select,
textarea {
  border-radius: 14px;
}
```

## 15.5 Wide Action Button 宽按钮

适用于 API 设置、档案馆编辑、世界书词条编辑、线下剧本创建、记忆库自动总结等需要提交或确认的页面操作。

- 使用 `WideActionGroup` 垂直排列宽按钮，按钮之间间距 `8px`。
- 每个 `WideActionButton` 宽度 `100%`，建议高度 `44px`，水平居中文本。
- 按钮使用固定像素圆角 `12px`（可在 `8px`、`12px`、`16px` 中按页面密度调整），禁止 `9999px`、`50%` 或 `rounded-full`。
- 主操作使用深色实心背景（默认 `#111111`）和白色文字；次操作使用白色背景、浅灰边框和主文字颜色。
- 宽按钮组中的按钮不包含文字前置图标；图标不应改变文字的视觉居中位置。
- 保留原有按钮顺序、禁用态、加载态、提交回调和错误处理，只统一布局与视觉样式。

推荐结构：

```tsx
<div className="settings-wide-action-group">
  <button className="settings-wide-action settings-wide-action-primary">测试连接</button>
  <button className="settings-wide-action settings-wide-action-secondary">保存配置</button>
</div>
```

## 16. 圆角使用边界

### 允许

- 头像：`50%` 或 `border-radius: 9999px`，仅限头像。
- CompactToggle 轨道：`12px`，因为高度为 `24px`。
- 卡片：固定 `10px`。
- 输入框：固定 `8px`、`12px` 或 `16px`。
- 上传区域：固定 `12px`。
- 图标按钮：导航栏统一透明、`0` 圆角；非导航图标按钮才可根据控件语义使用固定 `8px` 圆角。

### 禁止

- 将头像的 `rounded-full` 复用于输入框、卡片或列表项。
- 将 `9999px` 作为通用组件圆角。
- 使用不受控的 `border-radius: 50%` 处理卡片或输入框。
- 通过大圆角把普通按钮变成胶囊容器。
- 使用 padding、scale 或外层灰色 pill 模拟 CompactToggle。

## 17. 交互状态

### 默认状态

- 卡片白底、低阴影。
- 列表项无额外背景。
- 开关根据配置显示开／关状态。

### Hover / Pressed

- 普通列表项：使用极浅灰背景反馈，不改变布局。
- 危险操作：使用极浅红色背景反馈，不改变文字颜色。
- 箭头保持直接显示，不增加背景胶囊。

### 编辑状态

- 备注编辑按钮切换为输入框。
- 输入框保持固定高度和固定像素圆角。
- 回车或点击编辑按钮可结束编辑；页面右上角保存按钮负责持久化。

### 开关状态

- 点击开关立即更新 draft 状态。
- 页面右上角保存后写入角色配置。
- 不因开关状态改变列表项高度；只有主动联络开启时间段控件时允许该项扩展。

## 18. 验收清单

- [ ] Section Header 位于卡片外部上方。
- [ ] 背景壁纸卡片位于偏好设置之前，且没有独立灰色 Section Header。
- [ ] Profile 卡片圆角为 `10px`、使用浅色轻量阴影，头像为 `50%` 圆形。
- [ ] 顶部容器透明、无底部阴影，导航按钮无圆形或彩色底座。
- [ ] 白色内容卡片统一 `10px` 圆角和轻量阴影。
- [ ] 居中创建按钮使用浅色背景，并与其他空状态创建按钮尺寸一致。
- [ ] 备注输入框为固定高度，圆角小于高度的一半，并使用 `!important` 防止被全局圆形样式覆盖。
- [ ] 偏好设置使用一个整体卡片，六行 Toggle 项高度一致。
- [ ] CompactToggle 为 `42×24px`，thumb 为 `20px`。
- [ ] 主动联络关闭时与其他 Toggle 行高度一致。
- [ ] 主动联络与主动来电之间有分割线。
- [ ] 更多设置使用一个整体 Navigate 卡片。
- [ ] 危险操作使用一个整体卡片。
- [ ] 所有卡片内部最后一项没有分割线。
- [ ] 没有双分割线。
- [ ] 箭头没有灰色胶囊背景。
- [ ] 没有把 `9999px` 或 `50%` 圆角错误复用于卡片和输入框。
- [ ] 所有普通 `input`、`select`、`textarea` 均使用固定 px 圆角，且没有全局 `!important` 圆角覆盖。
- [ ] 页面底部预留至少 `34px` 安全区。
