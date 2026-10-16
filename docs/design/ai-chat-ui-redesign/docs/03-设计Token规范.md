# 03 设计 Token 规范

本文件由 `tools/gen-token-doc.mjs` 从 CSS 源文件自动生成，第 5、6 节的数值与实现完全一致。

## 1. 三层结构

| 层级 | 文件 | 职责 | 是否随风格变化 |
|---|---|---|---|
| L1 结构 Token | `css/tokens.base.css` | 间距、尺寸、字号、行高、字重、圆角阶梯、动效时长与曲线、层级、焦点、滚动条 | 否 |
| L2 语义 Token | `css/theme-*.css` 上半部 | 颜色、字体族、阴影、圆角覆写、描边、玻璃与背景装饰 | 是 |
| L3 组件 Token | `css/theme-*.css` 下半部 | 组件级表现开关：形状、边框、阴影、指示器、悬停行为 | 是 |

依赖方向严格单向：组件层 → L3 → L2 → L1。L1 不引用 L2/L3，组件层不引用任何字面量。

## 2. 命名规则

`--<域>-<对象>-<属性>[-<变体>]`

`--space-4` 结构：间距阶梯第 4 级
`--color-bg-surface-raised` 语义：颜色 / 背景 / 表面 / 浮起
`--color-text-secondary` 语义：颜色 / 文字 / 次要
`--component-card-shadow-hover` 组件：卡片阴影的悬停态

## 3. 强制使用规则

1. 组件层（`layout.css`、`components.css`、`overview.css`、`demo.css`）禁止出现十六进制颜色、`rgb()/hsl()`、`px` 数值、`ms/s` 时长。
2. 所有颜色与间距必须通过 `var()` 引用 Token。
3. 数值 0 也统一写为 `var(--space-0)`，避免出现「零值可以例外」的破窗。
4. 数据驱动的动态值（进度百分比、画布缩放比例）通过运行时 Token 注入：`--progress-value`、`--stage-scale`。
5. 该规则由 `tools/check-tokens.mjs` 静态校验，当前结果：组件层零字面量、零未定义引用。

## 4. 风格差异如何仅靠 Token 表达

四套风格共用同一份 DOM 与同一份组件 CSS，差异全部落在 L2/L3 上：

| 维度 | 极光夜曲 | 墨纸 | 新终端 | 樱雾玻璃 |
|---|---|---|---|---|
| 模式 | 深色 | 浅色 | 深色 | 浅色 |
| `--color-bg-app` | #0A0B14 | #F4F1EA | #05070A | #F6F3FB | #EFE9DC | #FFF6EC | #FDF2FF | #0A0A1F | #15181C | #F5EDE0 | #FAF7F0 | #1A0B2E | #F4F6F9 |
| `--color-accent` | #8B7CF6 | #B23A2F | #38F2C8 | #E5678F | #2B5BFF | #2563D9 | #E0338A | #FF2E88 | #FFB000 | #B33A3A | #4A7C96 | #FF6EC7 | #C0392B |
| `--radius-lg` | 14px | 6px | 2px | 22px | 0px | 10px | 24px | 16px | 3px | 6px | 18px | 14px | 8px |
| `--component-button-radius` | 10px | 4px | 2px | 999px | 0px | 8px | 999px | 10px | 2px | 4px | 999px | 10px | 6px |
| `--component-nav-indicator-w` | 3px | 3px | 2px | 0px | 4px | 3px | 0px | 3px | 3px | 2px | 0px | 3px | 3px |
| `--component-card-lift` | -2px | 0px | 0px | -3px | -2px | -2px | -3px | -2px | -1px | -1px | -2px | -2px | -1px |
| `--component-divider-style` | solid | solid | dashed | solid | solid | solid | solid | solid | solid | solid | solid | solid | solid |
| `--component-title-letter-spacing` | -0.01em | 0.01em | 0.10em | 0em | -0.02em | 0em | 0em | 0.02em | 0.06em | 0.02em | 0em | 0.04em | 0.01em |
| `--component-glass-blur` | 18px | 0px | 0px | 20px | 0px | 0px | 20px | 16px | 0px | 0px | 12px | 14px | 0px |

## 5. L1 结构 Token 完整清单

### 1. 设计基准画布

| Token | 值 |
|---|---|
| `--size-app-w` | `1920px` |
| `--size-app-h` | `1080px` |

### 2. 间距阶梯（4px 基准）

| Token | 值 |
|---|---|
| `--space-0` | `0px` |
| `--space-px` | `1px` |
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--space-6` | `24px` |
| `--space-7` | `32px` |
| `--space-8` | `40px` |
| `--space-9` | `48px` |
| `--space-10` | `64px` |
| `--space-11` | `80px` |
| `--gap-inline-xs` | `var(--space-1)` |
| `--gap-inline-sm` | `var(--space-2)` |
| `--gap-inline-md` | `var(--space-3)` |
| `--gap-inline-lg` | `var(--space-4)` |
| `--gap-stack-xs` | `var(--space-1)` |
| `--gap-stack-sm` | `var(--space-2)` |
| `--gap-stack-md` | `var(--space-3)` |
| `--gap-stack-lg` | `var(--space-4)` |
| `--gap-stack-xl` | `var(--space-6)` |
| `--gap-section` | `var(--space-7)` |
| `--padding-control-sm` | `var(--space-2)` |
| `--padding-control-md` | `var(--space-3)` |
| `--padding-control-lg` | `var(--space-4)` |
| `--padding-panel` | `var(--space-4)` |
| `--padding-panel-lg` | `var(--space-5)` |

### 3. 布局尺寸（1920x1080 基准实测）

| Token | 值 |
|---|---|
| `--size-main-min-w` | `640px` |
| `--size-nav-item-h` | `36px` |
| `--size-list-item-h` | `56px` |
| `--size-section-gap` | `var(--space-6)` |
| `--size-avatar-xs` | `20px` |
| `--size-avatar-sm` | `28px` |
| `--size-avatar-md` | `40px` |
| `--size-avatar-lg` | `56px` |
| `--size-avatar-xl` | `88px` |
| `--size-control-xs` | `24px` |
| `--size-control-sm` | `28px` |
| `--size-control-md` | `36px` |
| `--size-control-lg` | `44px` |
| `--size-icon-xs` | `12px` |
| `--size-icon-sm` | `14px` |
| `--size-icon-md` | `16px` |
| `--size-icon-lg` | `20px` |
| `--size-icon-xl` | `28px` |
| `--size-icon-hero` | `64px` |
| `--size-border-thin` | `1px` |
| `--size-border-thick` | `2px` |
| `--size-divider` | `1px` |
| `--size-composer-max-w` | `860px` |
| `--size-context-inner-max-w` | `320px` |
| `--size-modal-max-w` | `560px` |
| `--size-menu-max-w` | `280px` |
| `--size-progress-h` | `6px` |
| `--size-slider-track-h` | `4px` |
| `--size-slider-thumb` | `14px` |
| `--size-badge-h` | `18px` |

### 4. 字体阶梯

| Token | 值 |
|---|---|
| `--font-size-2xs` | `11px` |
| `--font-size-xs` | `12px` |
| `--font-size-sm` | `13px` |
| `--font-size-md` | `14px` |
| `--font-size-lg` | `16px` |
| `--font-size-xl` | `20px` |
| `--font-size-2xl` | `26px` |
| `--font-size-3xl` | `34px` |
| `--font-size-display` | `44px` |
| `--line-height-tight` | `1.2` |
| `--line-height-snug` | `1.35` |
| `--line-height-normal` | `1.5` |
| `--line-height-relaxed` | `1.7` |
| `--font-weight-regular` | `400` |
| `--font-weight-medium` | `500` |
| `--font-weight-semibold` | `600` |
| `--font-weight-bold` | `700` |
| `--letter-spacing-tight` | `-0.01em` |
| `--letter-spacing-normal` | `0em` |
| `--letter-spacing-wide` | `0.02em` |
| `--letter-spacing-caps` | `0.08em` |

### 5. 圆角阶梯

| Token | 值 |
|---|---|
| `--radius-none` | `0px` |
| `--radius-xs` | `4px` |
| `--radius-sm` | `6px` |
| `--radius-md` | `10px` |
| `--radius-lg` | `14px` |
| `--radius-xl` | `20px` |
| `--radius-2xl` | `28px` |
| `--radius-pill` | `999px` |
| `--radius-circle` | `50%` |

### 6. 动效

| Token | 值 |
|---|---|
| `--duration-motion-off` | `0.01ms` |
| `--duration-instant` | `80ms` |
| `--duration-fast` | `140ms` |
| `--duration-normal` | `220ms` |
| `--duration-slow` | `360ms` |
| `--duration-slower` | `600ms` |
| `--duration-ambient` | `12s` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-decelerate` | `cubic-bezier(0, 0, 0, 1)` |
| `--ease-accelerate` | `cubic-bezier(0.3, 0, 1, 1)` |
| `--ease-spring` | `cubic-bezier(0.34, 1.4, 0.64, 1)` |
| `--ease-linear` | `linear` |
| `--transition-transform` | `transform var(--duration-fast) var(--ease-standard)` |
| `--transition-shadow` | `box-shadow var(--duration-normal) var(--ease-standard)` |
| `--transition-opacity` | `opacity var(--duration-fast) var(--ease-standard)` |
| `--transition-all` | `all var(--duration-normal) var(--ease-standard)` |
| `--motion-press-scale` | `0.97` |
| `--motion-hover-lift` | `-1px` |

### 7. 层级

| Token | 值 |
|---|---|
| `--z-base` | `0` |
| `--z-raised` | `10` |
| `--z-sticky` | `100` |
| `--z-overlay` | `200` |
| `--z-modal` | `300` |
| `--z-popover` | `400` |
| `--z-tooltip` | `500` |
| `--z-toast` | `600` |

### 8. 焦点与可访问性

| Token | 值 |
|---|---|
| `--focus-ring-width` | `2px` |
| `--focus-ring-offset` | `2px` |
| `--focus-ring-offset-inset` | `-2px` |
| `--opacity-disabled` | `0.42` |
| `--opacity-muted` | `0.72` |
| `--opacity-scrim` | `0.6` |
| `--opacity-hover-layer` | `0.08` |
| `--opacity-active-layer` | `0.14` |

### 9. 滚动条（结构尺寸部分）

| Token | 值 |
|---|---|
| `--scrollbar-width` | `thin` |
| `--scrollbar-size` | `10px` |
| `--scrollbar-thumb-border` | `2px` |

### 10. 文本截断

| Token | 值 |
|---|---|
| `--truncate-lines-1` | `1` |
| `--truncate-lines-2` | `2` |
| `--truncate-lines-3` | `3` |

### 11. 图标与描边

| Token | 值 |
|---|---|
| `--icon-stroke-w` | `1.6` |
| `--icon-stroke-w-bold` | `2` |
| `--size-icon-button-glyph` | `var(--size-icon-md)` |

### 12. 细节尺寸

| Token | 值 |
|---|---|
| `--size-dot` | `6px` |
| `--size-dot-lg` | `8px` |
| `--size-marker-w` | `3px` |
| `--size-marker-h` | `16px` |
| `--size-textarea-min-h` | `48px` |
| `--size-textarea-max-h` | `168px` |
| `--size-tooltip-max-w` | `240px` |
| `--size-empty-icon` | `64px` |
| `--size-starter-min-h` | `36px` |
| `--size-rail-footer-gap` | `var(--space-2)` |
| `--size-panel-divider-inset` | `var(--space-4)` |
| `--size-slider-h` | `24px` |
| `--size-avatar-stack-overlap` | `-8px` |
| `--size-count-pill-min-w` | `20px` |
| `--component-rail-bg` | `var(--color-bg-rail)` |
| `--component-rail-border` | `var(--color-divider)` |
| `--component-rail-item-color` | `var(--color-text-secondary)` |
| `--component-rail-item-color-hover` | `var(--color-text-primary)` |
| `--component-rail-item-bg-hover` | `var(--color-bg-hover)` |
| `--component-rail-item-bg-active` | `var(--color-bg-active)` |
| `--component-rail-group-color` | `var(--color-text-tertiary)` |
| `--size-rail-w-md` | `168px` |
| `--size-list-w-md` | `260px` |
| `--size-list-w-s` | `248px` |
| `--size-list-w-xs` | `240px` |
| `--size-context-w-md` | `320px` |
| `--size-context-w-s` | `288px` |

### 12b. 运行时可变 Token（由脚本或数据写入，此处为默认值）

| Token | 值 |
|---|---|
| `--stage-scale` | `1` |
| `--progress-value` | `0%` |
| `--slider-fill` | `0%` |

### 13. 透明度细节

| Token | 值 |
|---|---|
| `--opacity-hint` | `0.55` |
| `--opacity-ghost` | `0.08` |
| `--opacity-strong` | `1` |
| `--opacity-none` | `0` |

### 14. 层级与定位偏移

| Token | 值 |
|---|---|
| `--offset-tooltip-y` | `-6px` |
| `--offset-lift-sm` | `-1px` |
| `--offset-lift-md` | `-2px` |
| `--offset-lift-lg` | `-3px` |
| `--size-rail-collapsed-w` | `64px` |
| `--size-context-drawer-w` | `320px` |
| `--size-list-collapsed-w` | `0px` |

### 15. 文档与总览页（非产品界面）

| Token | 值 |
|---|---|
| `--size-overview-card-min` | `340px` |
| `--size-preview-h` | `176px` |
| `--size-preview-rail-w` | `44px` |
| `--size-preview-line-h` | `8px` |
| `--size-preview-title-h` | `16px` |
| `--size-preview-title-w` | `48%` |
| `--size-preview-pill-h` | `20px` |
| `--size-preview-pill-w` | `40%` |
| `--size-demo-frame-h` | `760px` |
| `--size-demo-frame-md` | `460px` |
| `--size-demo-frame-sm` | `320px` |
| `--size-demo-col-sm` | `96px` |
| `--size-demo-col-md` | `140px` |
| `--size-demo-label-w` | `160px` |
| `--size-demo-label-w-lg` | `190px` |
| `--size-demo-value-w` | `90px` |

## 6. L2 / L3 主题 Token 四套对照

| Token | 极光夜曲 | 墨纸 | 新终端 | 樱雾玻璃 |
|---|---|---|---|---|
| **L2-1 背景与表面** | | | | |
| `--color-bg-app` | `#0A0B14` | `#F4F1EA` | `#05070A` | `#F6F3FB` | `#EFE9DC` | `#FFF6EC` | `#FDF2FF` | `#0A0A1F` | `#15181C` | `#F5EDE0` | `#FAF7F0` | `#1A0B2E` | `#F4F6F9` |
| `--color-bg-canvas` | `#0B0D18` | `#FAF8F3` | `#06090D` | `#FBF9FE` | `#FBF7EF` | `#FFFBF5` | `#FFFAFF` | `#0D0D26` | `#1A1E23` | `#FBF6EC` | `#FDFBF6` | `#22103A` | `#FAFBFD` |
| `--color-bg-rail` | `#0D0F1B` | `#EFEBE2` | `#04060A` | `#F1EDF9` | `#FFE94A` | `#FFE3C7` | `#FFE0F5` | `#07071A` | `#101317` | `#2A3B33` | `#F0EBE0` | `#14082280` | `#1F2E4A` |
| `--color-bg-list` | `#0F111E` | `#F4F1EA` | `#060A0E` | `#F6F3FB` | `#F5EFE3` | `#FFF6EC` | `#FDF2FF` | `#0C0C22` | `#171B20` | `#F5EDE0` | `#FAF7F0` | `#1D0D33` | `#F4F6F9` |
| `--color-bg-panel` | `#12141F` | `#FAF8F3` | `#070B10` | `#FFFFFF` | `#FBF7EF` | `#FFFBF5` | `#FFFAFF` | `#10102B` | `#1D2228` | `#FBF6EC` | `#FDFBF6` | `#241040` | `#FAFBFD` |
| `--color-bg-surface` | `#171A28` | `#FFFFFF` | `#0A0F16` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#16163A` | `#242A31` | `#FFFDF8` | `#FFFFFF` | `#2D1550` | `#FFFFFF` |
| `--color-bg-surface-raised` | `#1D2133` | `#FFFFFF` | `#0D141C` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#1C1C46` | `#2B323A` | `#FFFFFF` | `#FFFFFF` | `#36195E` | `#FFFFFF` |
| `--color-bg-inset` | `#0C0E18` | `#F0ECE3` | `#03050A` | `#F3EFFA` | `#E8E1D2` | `#F5E8D8` | `#F7E6FF` | `#060614` | `#0E1114` | `#EDE2D0` | `#F2EDE2` | `#100620` | `#EDF1F6` |
| `--color-bg-hover` | `rgba(255, 255, 255, 0.06)` | `rgba(28, 26, 23, 0.05)` | `rgba(56, 242, 200, 0.07)` | `rgba(139, 124, 246, 0.07)` | `rgba(17, 17, 17, 0.08)` | `rgba(42, 36, 56, 0.06)` | `rgba(123, 75, 224, 0.08)` | `rgba(0, 229, 255, 0.08)` | `rgba(255, 176, 0, 0.08)` | `rgba(46, 38, 32, 0.06)` | `rgba(74, 74, 68, 0.05)` | `rgba(0, 240, 255, 0.10)` | `rgba(31, 46, 74, 0.05)` |
| `--color-bg-active` | `rgba(255, 255, 255, 0.10)` | `rgba(28, 26, 23, 0.09)` | `rgba(56, 242, 200, 0.13)` | `rgba(139, 124, 246, 0.13)` | `rgba(17, 17, 17, 0.15)` | `rgba(42, 36, 56, 0.12)` | `rgba(123, 75, 224, 0.16)` | `rgba(0, 229, 255, 0.15)` | `rgba(255, 176, 0, 0.16)` | `rgba(46, 38, 32, 0.12)` | `rgba(74, 74, 68, 0.10)` | `rgba(0, 240, 255, 0.18)` | `rgba(31, 46, 74, 0.10)` |
| `--color-bg-selected` | `rgba(139, 124, 246, 0.16)` | `rgba(178, 58, 47, 0.10)` | `rgba(56, 242, 200, 0.12)` | `rgba(229, 103, 143, 0.12)` | `#2B5BFF` | `rgba(37, 99, 217, 0.16)` | `rgba(224, 51, 138, 0.14)` | `rgba(255, 46, 136, 0.18)` | `rgba(255, 176, 0, 0.16)` | `rgba(179, 58, 58, 0.16)` | `rgba(74, 124, 150, 0.16)` | `rgba(255, 110, 199, 0.20)` | `rgba(192, 57, 43, 0.12)` |
| `--color-bg-selected-hover` | `rgba(139, 124, 246, 0.24)` | `rgba(178, 58, 47, 0.16)` | `rgba(56, 242, 200, 0.19)` | `rgba(229, 103, 143, 0.18)` | `#1E4AE8` | `rgba(37, 99, 217, 0.24)` | `rgba(224, 51, 138, 0.22)` | `rgba(255, 46, 136, 0.28)` | `rgba(255, 176, 0, 0.24)` | `rgba(179, 58, 58, 0.24)` | `rgba(74, 124, 150, 0.24)` | `rgba(255, 110, 199, 0.30)` | `rgba(192, 57, 43, 0.20)` |
| `--color-bg-glass` | `rgba(23, 26, 40, 0.72)` | `rgba(250, 248, 243, 0.88)` | `rgba(7, 11, 16, 0.86)` | `rgba(255, 255, 255, 0.72)` | `#FFFFFF` | `rgba(255, 251, 245, 0.88)` | `rgba(255, 250, 255, 0.80)` | `rgba(16, 16, 43, 0.80)` | `rgba(29, 34, 40, 0.86)` | `rgba(251, 246, 236, 0.90)` | `rgba(253, 251, 246, 0.85)` | `rgba(45, 21, 80, 0.78)` | `rgba(250, 251, 253, 0.88)` |
| `--color-bg-scrim` | `rgba(5, 6, 12, 0.66)` | `rgba(28, 26, 23, 0.42)` | `rgba(0, 0, 0, 0.72)` | `rgba(74, 60, 96, 0.34)` | `rgba(17, 17, 17, 0.55)` | `rgba(42, 36, 56, 0.45)` | `rgba(74, 43, 92, 0.40)` | `rgba(3, 3, 12, 0.72)` | `rgba(6, 8, 10, 0.72)` | `rgba(46, 38, 32, 0.50)` | `rgba(74, 74, 68, 0.35)` | `rgba(8, 4, 18, 0.72)` | `rgba(31, 46, 74, 0.42)` |
| **L2-2 文本** | | | | |
| `--color-text-primary` | `#ECEEF7` | `#1C1A17` | `#D6F5EC` | `#2C2740` | `#111111` | `#2A2438` | `#4A2B5C` | `#EDE9FF` | `#DCE2E8` | `#2E2620` | `#4A4A44` | `#F0E6FF` | `#232B38` |
| `--color-text-secondary` | `#A7AEC6` | `#57534B` | `#7FA79E` | `#635C7C` | `#3D3A33` | `#5A5268` | `#7A5C92` | `#A9A3D0` | `#98A2AD` | `#5E5348` | `#6E6E66` | `#BFA8E0` | `#56616F` |
| `--color-text-tertiary` | `#737B96` | `#8A8478` | `#4F6B67` | `#948EAC` | `#6E6A5F` | `#8B8399` | `#9E85B4` | `#7A76A8` | `#6B747E` | `#8C7F70` | `#9A9A90` | `#8C76B8` | `#848D9A` |
| `--color-text-disabled` | `#4C5268` | `#B3ADA2` | `#33443F` | `#BDB8CE` | `#A8A296` | `#B8B1C4` | `#CFC0DC` | `#4A4870` | `#464E56` | `#B8AC9C` | `#C4C4BA` | `#5C4C80` | `#B4BAC4` |
| `--color-text-inverse` | `#0A0B14` | `#FAF8F3` | `#05070A` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#0A0A1F` | `#15181C` | `#F5EDE0` | `#FAF7F0` | `#1A0B2E` | `#F4F6F9` |
| `--color-text-on-accent` | `#FFFFFF` | `#FFFFFF` | `#03130F` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#0A0A1F` | `#1A1400` | `#FFFFFF` | `#FFFFFF` | `#1A0B2E` | `#FFFFFF` |
| `--color-text-link` | `#9E92F8` | `#B23A2F` | `#38F2C8` | `#D64B79` | `#2B5BFF` | `#2563D9` | `#C4276F` | `#00E5FF` | `#4FC3F7` | `#B33A3A` | `#4A7C96` | `#00F0FF` | `#C0392B` |
| **L2-3 边框与分隔** | | | | |
| `--color-border-subtle` | `rgba(255, 255, 255, 0.06)` | `rgba(28, 26, 23, 0.08)` | `rgba(56, 242, 200, 0.10)` | `rgba(139, 124, 246, 0.10)` | `#111111` | `rgba(42, 36, 56, 0.16)` | `rgba(123, 75, 224, 0.18)` | `rgba(0, 229, 255, 0.14)` | `rgba(255, 255, 255, 0.08)` | `rgba(46, 38, 32, 0.14)` | `rgba(74, 74, 68, 0.10)` | `rgba(0, 240, 255, 0.16)` | `rgba(31, 46, 74, 0.12)` |
| `--color-border-default` | `rgba(255, 255, 255, 0.10)` | `rgba(28, 26, 23, 0.16)` | `rgba(56, 242, 200, 0.20)` | `rgba(139, 124, 246, 0.18)` | `#111111` | `#2A2438` | `rgba(123, 75, 224, 0.30)` | `rgba(0, 229, 255, 0.26)` | `rgba(255, 255, 255, 0.16)` | `rgba(46, 38, 32, 0.26)` | `rgba(74, 74, 68, 0.18)` | `rgba(0, 240, 255, 0.28)` | `rgba(31, 46, 74, 0.22)` |
| `--color-border-strong` | `rgba(255, 255, 255, 0.18)` | `rgba(28, 26, 23, 0.32)` | `rgba(56, 242, 200, 0.40)` | `rgba(139, 124, 246, 0.32)` | `#111111` | `#2A2438` | `rgba(123, 75, 224, 0.50)` | `rgba(0, 229, 255, 0.48)` | `rgba(255, 255, 255, 0.30)` | `rgba(46, 38, 32, 0.44)` | `rgba(74, 74, 68, 0.32)` | `rgba(255, 110, 199, 0.48)` | `rgba(31, 46, 74, 0.40)` |
| `--color-border-accent` | `rgba(139, 124, 246, 0.45)` | `rgba(178, 58, 47, 0.40)` | `rgba(56, 242, 200, 0.60)` | `rgba(229, 103, 143, 0.40)` | `#111111` | `#2563D9` | `rgba(224, 51, 138, 0.55)` | `rgba(255, 46, 136, 0.60)` | `rgba(255, 176, 0, 0.60)` | `rgba(179, 58, 58, 0.50)` | `rgba(74, 124, 150, 0.45)` | `rgba(255, 110, 199, 0.62)` | `rgba(192, 57, 43, 0.50)` |
| `--color-divider` | `rgba(255, 255, 255, 0.07)` | `rgba(28, 26, 23, 0.12)` | `rgba(56, 242, 200, 0.14)` | `rgba(139, 124, 246, 0.14)` | `#111111` | `rgba(42, 36, 56, 0.22)` | `rgba(123, 75, 224, 0.22)` | `rgba(0, 229, 255, 0.18)` | `rgba(255, 255, 255, 0.12)` | `rgba(46, 38, 32, 0.18)` | `rgba(74, 74, 68, 0.14)` | `rgba(0, 240, 255, 0.20)` | `rgba(31, 46, 74, 0.16)` |
| **L2-4 主色与强调** | | | | |
| `--color-accent` | `#8B7CF6` | `#B23A2F` | `#38F2C8` | `#E5678F` | `#2B5BFF` | `#2563D9` | `#E0338A` | `#FF2E88` | `#FFB000` | `#B33A3A` | `#4A7C96` | `#FF6EC7` | `#C0392B` |
| `--color-accent-hover` | `#9E92F8` | `#C64A3E` | `#5CF7D5` | `#F0789E` | `#1E4AE8` | `#3B78E8` | `#F04D9C` | `#FF5AA3` | `#FFC233` | `#C74A4A` | `#5A8FAB` | `#FF8AD4` | `#D04734` |
| `--color-accent-active` | `#7867E8` | `#96291F` | `#1FD8AF` | `#D2557D` | `#1740CC` | `#1B4FB0` | `#C4276F` | `#E01F73` | `#E09B00` | `#962E2E` | `#3A6579` | `#E855AF` | `#A22F24` |
| `--color-accent-soft` | `rgba(139, 124, 246, 0.16)` | `rgba(178, 58, 47, 0.10)` | `rgba(56, 242, 200, 0.12)` | `rgba(229, 103, 143, 0.12)` | `#D9E2FF` | `rgba(37, 99, 217, 0.14)` | `rgba(224, 51, 138, 0.14)` | `rgba(255, 46, 136, 0.16)` | `rgba(255, 176, 0, 0.14)` | `rgba(179, 58, 58, 0.12)` | `rgba(74, 124, 150, 0.14)` | `rgba(255, 110, 199, 0.16)` | `rgba(192, 57, 43, 0.12)` |
| `--color-accent-softer` | `rgba(139, 124, 246, 0.08)` | `rgba(178, 58, 47, 0.05)` | `rgba(56, 242, 200, 0.06)` | `rgba(229, 103, 143, 0.06)` | `#EDF1FF` | `rgba(37, 99, 217, 0.07)` | `rgba(224, 51, 138, 0.07)` | `rgba(255, 46, 136, 0.08)` | `rgba(255, 176, 0, 0.07)` | `rgba(179, 58, 58, 0.06)` | `rgba(74, 124, 150, 0.07)` | `rgba(255, 110, 199, 0.08)` | `rgba(192, 57, 43, 0.06)` |
| `--color-accent-contrast` | `#FFFFFF` | `#FFFFFF` | `#03130F` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#0A0A1F` | `#1A1400` | `#FFFFFF` | `#FFFFFF` | `#1A0B2E` | `#FFFFFF` |
| `--color-accent-2` | `#4FD1C5` | `#3F6B5C` | `#7CFF6B` | `#8B7CF6` | `#FF5C8A` | `#E2603A` | `#7B4BE0` | `#00E5FF` | `#4FC3F7` | `#2D4A3E` | `#C97B4A` | `#00F0FF` | `#1F2E4A` |
| `--color-accent-2-soft` | `rgba(79, 209, 197, 0.16)` | `rgba(63, 107, 92, 0.12)` | `rgba(124, 255, 107, 0.12)` | `rgba(139, 124, 246, 0.14)` | `#FFE0E9` | `rgba(226, 96, 58, 0.16)` | `rgba(123, 75, 224, 0.16)` | `rgba(0, 229, 255, 0.14)` | `rgba(79, 195, 247, 0.14)` | `rgba(45, 74, 62, 0.14)` | `rgba(201, 123, 74, 0.14)` | `rgba(0, 240, 255, 0.14)` | `rgba(31, 46, 74, 0.12)` |
| `--color-highlight` | `#F2568C` | `#C08A2E` | `#FFB020` | `#F0A73C` | `#FFD400` | `#E0A200` | `#C99A00` | `#FFE600` | `#E53935` | `#A8871F` | `#7A9E5A` | `#FFD93D` | `#B8941F` |
| `--color-highlight-soft` | `rgba(242, 86, 140, 0.16)` | `rgba(192, 138, 46, 0.14)` | `rgba(255, 176, 32, 0.14)` | `rgba(240, 167, 60, 0.16)` | `#FFF4BF` | `rgba(224, 162, 0, 0.20)` | `rgba(201, 154, 0, 0.18)` | `rgba(255, 230, 0, 0.16)` | `rgba(229, 57, 53, 0.16)` | `rgba(168, 135, 31, 0.18)` | `rgba(122, 158, 90, 0.16)` | `rgba(255, 217, 61, 0.16)` | `rgba(184, 148, 31, 0.18)` |
| **L2-5 语义状态色** | | | | |
| `--color-success` | `#4ADE80` | `#2F6B45` | `#7CFF6B` | `#3FAE7A` | `#1E8E4E` | `#2F8F52` | `#2A9E63` | `#2BE8A0` | `#4CAF50` | `#3A6B4A` | `#4A8C5A` | `#4ADE9E` | `#2E7D4F` |
| `--color-success-soft` | `rgba(74, 222, 128, 0.16)` | `rgba(47, 107, 69, 0.12)` | `rgba(124, 255, 107, 0.12)` | `rgba(63, 174, 122, 0.14)` | `#D6F2E1` | `rgba(47, 143, 82, 0.15)` | `rgba(42, 158, 99, 0.15)` | `rgba(43, 232, 160, 0.14)` | `rgba(76, 175, 80, 0.15)` | `rgba(58, 107, 74, 0.14)` | `rgba(74, 140, 90, 0.14)` | `rgba(74, 222, 158, 0.14)` | `rgba(46, 125, 79, 0.14)` |
| `--color-success-contrast` | `#052E16` | `#FFFFFF` | `#04170A` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#04231A` | `#08210A` | `#FFFFFF` | `#FFFFFF` | `#04231A` | `#FFFFFF` |
| `--color-warning` | `#FBBF24` | `#9A6B12` | `#FFB020` | `#E0912B` | `#C77700` | `#B87400` | `#C77A12` | `#FFB020` | `#FFB000` | `#A8701C` | `#B07A2A` | `#FFB347` | `#A8721C` |
| `--color-warning-soft` | `rgba(251, 191, 36, 0.16)` | `rgba(154, 107, 18, 0.14)` | `rgba(255, 176, 32, 0.14)` | `rgba(224, 145, 43, 0.16)` | `#FFEBCC` | `rgba(184, 116, 0, 0.16)` | `rgba(199, 122, 18, 0.16)` | `rgba(255, 176, 32, 0.16)` | `rgba(255, 176, 0, 0.16)` | `rgba(168, 112, 28, 0.16)` | `rgba(176, 122, 42, 0.16)` | `rgba(255, 179, 71, 0.16)` | `rgba(168, 114, 28, 0.16)` |
| `--color-warning-contrast` | `#3B2503` | `#FFFFFF` | `#1A1000` | `#FFFFFF` | `#111111` | `#FFFFFF` | `#FFFFFF` | `#2A1900` | `#1A1400` | `#FFFFFF` | `#FFFFFF` | `#2A1900` | `#FFFFFF` |
| `--color-danger` | `#F87171` | `#A32B22` | `#FF5C6C` | `#E05666` | `#D62828` | `#C93A32` | `#D93A5E` | `#FF3D5A` | `#E53935` | `#A32B2B` | `#B85A52` | `#FF5470` | `#B03A2E` |
| `--color-danger-soft` | `rgba(248, 113, 113, 0.16)` | `rgba(163, 43, 34, 0.12)` | `rgba(255, 92, 108, 0.14)` | `rgba(224, 86, 102, 0.14)` | `#FFDCDC` | `rgba(201, 58, 50, 0.15)` | `rgba(217, 58, 94, 0.15)` | `rgba(255, 61, 90, 0.16)` | `rgba(229, 57, 53, 0.16)` | `rgba(163, 43, 43, 0.14)` | `rgba(184, 90, 82, 0.14)` | `rgba(255, 84, 112, 0.16)` | `rgba(176, 58, 46, 0.14)` |
| `--color-danger-contrast` | `#450A0A` | `#FFFFFF` | `#1A0206` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#2A0009` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#2A0009` | `#FFFFFF` |
| `--color-info` | `#60A5FA` | `#2F5D8C` | `#4DD8FF` | `#4E8FE0` | `#2B5BFF` | `#2563D9` | `#5B7FE0` | `#00E5FF` | `#4FC3F7` | `#3A5A7A` | `#4A7C96` | `#00F0FF` | `#2F5D8C` |
| `--color-info-soft` | `rgba(96, 165, 250, 0.16)` | `rgba(47, 93, 140, 0.12)` | `rgba(77, 216, 255, 0.12)` | `rgba(78, 143, 224, 0.14)` | `#D9E2FF` | `rgba(37, 99, 217, 0.14)` | `rgba(91, 127, 224, 0.15)` | `rgba(0, 229, 255, 0.14)` | `rgba(79, 195, 247, 0.14)` | `rgba(58, 90, 122, 0.14)` | `rgba(74, 124, 150, 0.14)` | `rgba(0, 240, 255, 0.14)` | `rgba(47, 93, 140, 0.14)` |
| `--color-info-contrast` | `#0B1B3A` | `#FFFFFF` | `#001420` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#002028` | `#04202B` | `#FFFFFF` | `#FFFFFF` | `#002028` | `#FFFFFF` |
| **L2-6 焦点与滚动条** | | | | |
| `--color-focus-ring` | `#A99BFF` | `#B23A2F` | `#38F2C8` | `#8B7CF6` | `#2B5BFF` | `#2563D9` | `#7B4BE0` | `#00E5FF` | `#FFB000` | `#B33A3A` | `#4A7C96` | `#00F0FF` | `#C0392B` |
| `--color-scrollbar-track` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` |
| `--color-scrollbar-thumb` | `rgba(255, 255, 255, 0.14)` | `rgba(28, 26, 23, 0.20)` | `rgba(56, 242, 200, 0.22)` | `rgba(139, 124, 246, 0.24)` | `#111111` | `rgba(42, 36, 56, 0.28)` | `rgba(123, 75, 224, 0.30)` | `rgba(255, 46, 136, 0.32)` | `rgba(255, 176, 0, 0.30)` | `rgba(46, 38, 32, 0.24)` | `rgba(74, 74, 68, 0.20)` | `rgba(255, 110, 199, 0.34)` | `rgba(31, 46, 74, 0.22)` |
| `--color-scrollbar-thumb-hover` | `rgba(255, 255, 255, 0.26)` | `rgba(28, 26, 23, 0.34)` | `rgba(56, 242, 200, 0.40)` | `rgba(139, 124, 246, 0.40)` | `#2B5BFF` | `rgba(42, 36, 56, 0.45)` | `rgba(123, 75, 224, 0.48)` | `rgba(255, 46, 136, 0.55)` | `rgba(255, 176, 0, 0.52)` | `rgba(46, 38, 32, 0.42)` | `rgba(74, 74, 68, 0.36)` | `rgba(255, 110, 199, 0.58)` | `rgba(31, 46, 74, 0.40)` |
| **L2-7 阴影与光效** | | | | |
| `--shadow-xs` | `0 1px 2px rgba(0, 0, 0, 0.40)` | `0 1px 1px rgba(28, 26, 23, 0.05)` | `0 0 0 1px rgba(56, 242, 200, 0.10)` | `0 1px 3px rgba(120, 100, 170, 0.0…` | `2px 2px 0 #111111` | `2px 2px 0 rgba(42, 36, 56, 0.18)` | `0 1px 4px rgba(160, 100, 200, 0.1…` | `0 0 6px rgba(255, 46, 136, 0.20)` | `0 1px 2px rgba(0, 0, 0, 0.50)` | `0 1px 2px rgba(46, 38, 32, 0.08)` | `0 1px 4px rgba(90, 110, 130, 0.08)` | `0 0 6px rgba(255, 110, 199, 0.22)` | `0 1px 2px rgba(31, 46, 74, 0.08)` |
| `--shadow-sm` | `0 2px 8px rgba(0, 0, 0, 0.45)` | `0 1px 2px rgba(28, 26, 23, 0.07)` | `0 0 8px rgba(56, 242, 200, 0.12)` | `0 2px 8px rgba(120, 100, 170, 0.1…` | `3px 3px 0 #111111` | `2px 2px 0 rgba(42, 36, 56, 0.22)` | `0 2px 10px rgba(160, 100, 200, 0.…` | `0 0 12px rgba(255, 46, 136, 0.22)` | `0 2px 6px rgba(0, 0, 0, 0.55)` | `0 2px 6px rgba(46, 38, 32, 0.10)` | `0 2px 10px rgba(90, 110, 130, 0.1…` | `0 0 12px rgba(255, 110, 199, 0.24)` | `0 2px 6px rgba(31, 46, 74, 0.10)` |
| `--shadow-md` | `0 8px 24px rgba(0, 0, 0, 0.50)` | `0 2px 6px rgba(28, 26, 23, 0.08)` | `0 0 16px rgba(56, 242, 200, 0.14)` | `0 8px 22px rgba(120, 100, 170, 0.…` | `4px 4px 0 #111111` | `3px 3px 0 rgba(42, 36, 56, 0.24)` | `0 8px 24px rgba(160, 100, 200, 0.…` | `0 0 24px rgba(255, 46, 136, 0.24)` | `0 6px 18px rgba(0, 0, 0, 0.58)` | `0 6px 18px rgba(46, 38, 32, 0.12)` | `0 8px 24px rgba(90, 110, 130, 0.1…` | `0 0 24px rgba(255, 110, 199, 0.26)` | `0 6px 18px rgba(31, 46, 74, 0.12)` |
| `--shadow-lg` | `0 16px 48px rgba(0, 0, 0, 0.55)` | `0 6px 18px rgba(28, 26, 23, 0.10)` | `0 0 28px rgba(56, 242, 200, 0.16)` | `0 16px 40px rgba(120, 100, 170, 0…` | `6px 6px 0 #111111` | `4px 4px 0 rgba(42, 36, 56, 0.26)` | `0 16px 40px rgba(160, 100, 200, 0…` | `0 0 40px rgba(255, 46, 136, 0.26)` | `0 12px 32px rgba(0, 0, 0, 0.62)` | `0 12px 32px rgba(46, 38, 32, 0.14)` | `0 16px 40px rgba(90, 110, 130, 0.…` | `0 0 40px rgba(255, 110, 199, 0.28)` | `0 12px 32px rgba(31, 46, 74, 0.14)` |
| `--shadow-xl` | `0 32px 80px rgba(0, 0, 0, 0.60)` | `0 12px 36px rgba(28, 26, 23, 0.12)` | `0 0 48px rgba(56, 242, 200, 0.18)` | `0 28px 70px rgba(120, 100, 170, 0…` | `8px 8px 0 #111111` | `6px 6px 0 rgba(42, 36, 56, 0.28)` | `0 28px 64px rgba(160, 100, 200, 0…` | `0 0 64px rgba(255, 46, 136, 0.28)` | `0 24px 56px rgba(0, 0, 0, 0.66)` | `0 24px 56px rgba(46, 38, 32, 0.16)` | `0 28px 64px rgba(90, 110, 130, 0.…` | `0 0 64px rgba(255, 110, 199, 0.30)` | `0 24px 56px rgba(31, 46, 74, 0.16)` |
| `--shadow-inset` | `inset 0 1px 0 rgba(255, 255, 255,…` | `inset 0 1px 0 rgba(255, 255, 255,…` | `inset 0 0 24px rgba(56, 242, 200,…` | `inset 0 1px 0 rgba(255, 255, 255,…` | `none` | `inset 0 1px 0 rgba(255, 255, 255,…` | `inset 0 1px 0 rgba(255, 255, 255,…` | `inset 0 0 20px rgba(0, 229, 255, …` | `inset 0 1px 0 rgba(255, 255, 255,…` | `inset 0 1px 0 rgba(255, 255, 255,…` | `inset 0 1px 0 rgba(255, 255, 255,…` | `inset 0 0 24px rgba(0, 240, 255, …` | `inset 0 1px 0 rgba(255, 255, 255,…` |
| `--shadow-glow` | `0 0 0 1px rgba(139, 124, 246, 0.3…` | `0 0 0 1px rgba(178, 58, 47, 0.30)` | `0 0 12px rgba(56, 242, 200, 0.45)…` | `0 0 0 1px rgba(229, 103, 143, 0.2…` | `4px 4px 0 #2B5BFF` | `0 0 0 2px rgba(37, 99, 217, 0.35)` | `0 0 0 2px rgba(224, 51, 138, 0.30…` | `0 0 10px rgba(255, 46, 136, 0.55)…` | `inset 0 3px 0 #FFB000, 0 0 0 1px …` | `0 0 0 1px rgba(168, 135, 31, 0.45)` | `0 0 0 2px rgba(74, 124, 150, 0.25)` | `0 0 10px rgba(255, 110, 199, 0.60…` | `0 0 0 2px rgba(184, 148, 31, 0.40)` |
| `--shadow-focus` | `0 0 0 3px rgba(139, 124, 246, 0.3…` | `0 0 0 3px rgba(178, 58, 47, 0.20)` | `0 0 0 2px rgba(56, 242, 200, 0.45…` | `0 0 0 3px rgba(139, 124, 246, 0.2…` | `0 0 0 3px #FFD400` | `0 0 0 3px rgba(37, 99, 217, 0.28)` | `0 0 0 3px rgba(123, 75, 224, 0.26)` | `0 0 0 2px rgba(0, 229, 255, 0.55)…` | `0 0 0 2px rgba(255, 176, 0, 0.50)` | `0 0 0 3px rgba(179, 58, 58, 0.20)` | `0 0 0 3px rgba(74, 124, 150, 0.22)` | `0 0 0 2px rgba(0, 240, 255, 0.60)…` | `0 0 0 3px rgba(192, 57, 43, 0.20)` |
| **L2-8 字体** | | | | |
| `--font-family-sans` | `"Inter", "HarmonyOS Sans SC", "Pi…` | `"Noto Sans SC", "Source Han Sans …` | `"JetBrains Mono", "Cascadia Mono"…` | `"Nunito", "Quicksand", "PingFang …` | `'Archivo', 'Inter', 'HarmonyOS Sa…` | `'Noto Sans SC', 'Source Han Sans …` | `'Nunito', 'Quicksand', 'PingFang …` | `'Inter', 'HarmonyOS Sans SC', 'Pi…` | `'Barlow', 'Inter', 'HarmonyOS San…` | `'Noto Serif SC', 'Source Han Seri…` | `'Noto Sans SC', 'Source Han Sans …` | `'Inter', 'HarmonyOS Sans SC', 'Pi…` | `'Inter', 'HarmonyOS Sans SC', 'Pi…` |
| `--font-family-display` | `"Inter", "HarmonyOS Sans SC", "Pi…` | `"Noto Serif SC", "Source Han Seri…` | `"JetBrains Mono", "Cascadia Mono"…` | `"Nunito", "Quicksand", "PingFang …` | `'Archivo', 'Inter', 'HarmonyOS Sa…` | `'Yuanti SC', 'YouYuan', 'Noto San…` | `'Nunito', 'Quicksand', 'PingFang …` | `'Inter', 'HarmonyOS Sans SC', 'Pi…` | `'Barlow Condensed', 'Oswald', 'Ha…` | `'Noto Serif SC', 'Source Han Seri…` | `'Yuanti SC', 'YouYuan', 'Noto San…` | `'Inter', 'HarmonyOS Sans SC', 'Pi…` | `'Inter', 'HarmonyOS Sans SC', 'Pi…` |
| `--font-family-mono` | `"JetBrains Mono", "Cascadia Mono"…` | `"IBM Plex Mono", "Cascadia Mono",…` | `"JetBrains Mono", "Cascadia Mono"…` | `"JetBrains Mono", "Cascadia Mono"…` | `'JetBrains Mono', 'Cascadia Mono'…` | `'JetBrains Mono', 'Cascadia Mono'…` | `'JetBrains Mono', 'Cascadia Mono'…` | `'JetBrains Mono', 'Cascadia Mono'…` | `'JetBrains Mono', 'Cascadia Mono'…` | `'IBM Plex Mono', 'Cascadia Mono',…` | `'JetBrains Mono', 'Cascadia Mono'…` | `'JetBrains Mono', 'Cascadia Mono'…` | `'JetBrains Mono', 'Cascadia Mono'…` |
| `--font-feature-settings` | `"cv11", "ss01", "tnum"` | `"tnum"` | `"tnum", "zero", "ss02"` | `"tnum"` | `'tnum'` | `'tnum'` | `'tnum'` | `'tnum', 'ss01'` | `'tnum'` | `'tnum'` | `'tnum'` | `'tnum', 'ss01'` | `'tnum'` |
| **L2-9 圆角覆写（风格形状语言）** | | | | |
| `--radius-xs` | `4px` | `2px` | `0px` | `8px` | `0px` | `4px` | `10px` | `6px` | `0px` | `2px` | `8px` | `4px` | `3px` |
| `--radius-sm` | `6px` | `3px` | `0px` | `12px` | `0px` | `6px` | `14px` | `8px` | `0px` | `3px` | `10px` | `6px` | `4px` |
| `--radius-md` | `10px` | `4px` | `2px` | `16px` | `0px` | `8px` | `18px` | `12px` | `2px` | `4px` | `14px` | `10px` | `6px` |
| `--radius-lg` | `14px` | `6px` | `2px` | `22px` | `0px` | `10px` | `24px` | `16px` | `3px` | `6px` | `18px` | `14px` | `8px` |
| `--radius-xl` | `20px` | `8px` | `3px` | `28px` | `0px` | `14px` | `32px` | `22px` | `4px` | `8px` | `24px` | `20px` | `10px` |
| `--radius-2xl` | `28px` | `10px` | `4px` | `36px` | `0px` | `18px` | `40px` | `28px` | `6px` | `12px` | `32px` | `28px` | `14px` |
| **L2-10 描边与玻璃** | | | | |
| `--size-border-thin` | `1px` | `1px` | `1px` | `1px` | `2px` | `2px` | `2px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` |
| `--size-border-thick` | `2px` | `2px` | `1px` | `2px` | `3px` | `3px` | `3px` | `2px` | `2px` | `2px` | `2px` | `2px` | `2px` |
| `--effect-blur` | `18px` | `0px` | `0px` | `20px` | `0px` | `0px` | `20px` | `16px` | `0px` | `0px` | `12px` | `14px` | `0px` |
| `--effect-saturate` | `1.4` | `1` | `1` | `1.6` | `1` | `1` | `1.7` | `1.5` | `1` | `1` | `1.3` | `1.6` | `1` |
| **L2-11 环境装饰（背景层）** | | | | |
| `--component-backdrop-image` | `radial-gradient(900px 620px at 18…` | `none` | `repeating-linear-gradient(0deg, r…` | `radial-gradient(820px 560px at 12…` | `repeating-linear-gradient(45deg, …` | `radial-gradient(circle, rgba(42, …` | `radial-gradient(circle at 12% 0%,…` | `linear-gradient(rgba(0, 229, 255,…` | `repeating-linear-gradient(45deg, …` | `repeating-linear-gradient(45deg, …` | `radial-gradient(circle at 15% 10%…` | `linear-gradient(180deg, transpare…` | `repeating-linear-gradient(0deg, r…` |
| `--component-backdrop-size` | `cover` | `cover` | `auto` | `cover` | `cover` | `12px 12px` | `cover` | `44px 44px, 44px 44px, cover, cover` | `cover` | `cover` | `cover` | `cover, cover, cover` | `cover` |
| `--component-backdrop-repeat` | `no-repeat` | `no-repeat` | `repeat` | `no-repeat` | `no-repeat` | `repeat` | `no-repeat` | `repeat, repeat, no-repeat, no-rep…` | `repeat` | `repeat` | `no-repeat` | `no-repeat, repeat, repeat` | `repeat` |
| `--component-backdrop-opacity` | `1` | `0` | `1` | `1` | `1` | `0.5` | `1` | `1` | `1` | `0.9` | `1` | `1` | `0.9` |
| **L3 组件级表现开关** | | | | |
| `--component-nav-item-radius` | `10px` | `4px` | `0px` | `16px` | `0px` | `8px` | `999px` | `10px` | `0px` | `4px` | `10px` | `8px` | `4px` |
| `--component-nav-indicator-w` | `3px` | `3px` | `2px` | `0px` | `4px` | `3px` | `0px` | `3px` | `3px` | `2px` | `0px` | `3px` | `3px` |
| `--component-nav-indicator-color` | `#8B7CF6` | `#B23A2F` | `#38F2C8` | `transparent` | `#111111` | `#2563D9` | `transparent` | `#FF2E88` | `#FFB000` | `#C9A227` | `transparent` | `#FF6EC7` | `#C0392B` |
| `--component-nav-item-active-bg` | `rgba(139, 124, 246, 0.18)` | `rgba(178, 58, 47, 0.10)` | `rgba(56, 242, 200, 0.12)` | `rgba(229, 103, 143, 0.14)` | `#FFD400` | `rgba(37, 99, 217, 0.16)` | `rgba(224, 51, 138, 0.16)` | `rgba(255, 46, 136, 0.20)` | `rgba(255, 176, 0, 0.18)` | `rgba(201, 162, 39, 0.20)` | `rgba(74, 124, 150, 0.14)` | `rgba(255, 110, 199, 0.22)` | `rgba(192, 57, 43, 0.20)` |
| `--component-nav-item-active-color` | `#ECEEF7` | `#1C1A17` | `#D6F5EC` | `#2C2740` | `#111111` | `#2A2438` | `#4A2B5C` | `#EDE9FF` | `#DCE2E8` | `#F5EDE0` | `#4A4A44` | `#F0E6FF` | `#FFFFFF` |
| `--component-panel-radius` | `0px` | `0px` | `0px` | `0px` | `0px` | `0px` | `0px` | `0px` | `0px` | `0px` | `0px` | `0px` | `0px` |
| `--component-panel-border-w` | `1px` | `1px` | `1px` | `1px` | `2px` | `2px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` |
| `--component-panel-border-color` | `rgba(255, 255, 255, 0.06)` | `rgba(28, 26, 23, 0.12)` | `rgba(56, 242, 200, 0.18)` | `rgba(139, 124, 246, 0.14)` | `#111111` | `#2A2438` | `rgba(123, 75, 224, 0.22)` | `rgba(0, 229, 255, 0.16)` | `rgba(255, 255, 255, 0.10)` | `rgba(46, 38, 32, 0.16)` | `rgba(74, 74, 68, 0.12)` | `rgba(0, 240, 255, 0.18)` | `rgba(31, 46, 74, 0.14)` |
| `--component-panel-shadow` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` |
| `--component-card-radius` | `14px` | `6px` | `2px` | `22px` | `0px` | `10px` | `28px` | `14px` | `2px` | `6px` | `18px` | `12px` | `6px` |
| `--component-card-border-w` | `1px` | `1px` | `1px` | `1px` | `2px` | `2px` | `2px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` |
| `--component-card-border-color` | `rgba(255, 255, 255, 0.08)` | `rgba(28, 26, 23, 0.16)` | `rgba(56, 242, 200, 0.22)` | `rgba(139, 124, 246, 0.14)` | `#111111` | `#2A2438` | `rgba(224, 51, 138, 0.28)` | `rgba(0, 229, 255, 0.22)` | `rgba(255, 255, 255, 0.14)` | `rgba(168, 135, 31, 0.35)` | `rgba(74, 74, 68, 0.10)` | `rgba(0, 240, 255, 0.26)` | `rgba(31, 46, 74, 0.16)` |
| `--component-card-bg` | `rgba(255, 255, 255, 0.03)` | `#FFFFFF` | `rgba(56, 242, 200, 0.03)` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `rgba(22, 22, 58, 0.72)` | `#242A31` | `#FFFDF8` | `#FFFFFF` | `rgba(45, 21, 80, 0.74)` | `#FFFFFF` |
| `--component-card-shadow` | `0 2px 8px rgba(0, 0, 0, 0.35)` | `0 1px 2px rgba(28, 26, 23, 0.07)` | `none` | `0 2px 8px rgba(120, 100, 170, 0.1…` | `4px 4px 0 #111111` | `3px 3px 0 rgba(42, 36, 56, 0.85),…` | `0 4px 16px rgba(160, 100, 200, 0.…` | `0 0 18px rgba(255, 46, 136, 0.16)…` | `inset 0 3px 0 #FFB000, 0 4px 14px…` | `0 1px 2px rgba(46, 38, 32, 0.08)` | `0 4px 16px rgba(90, 110, 130, 0.1…` | `0 0 20px rgba(255, 110, 199, 0.18…` | `0 1px 2px rgba(31, 46, 74, 0.08)` |
| `--component-card-shadow-hover` | `0 10px 28px rgba(0, 0, 0, 0.48)` | `0 6px 18px rgba(28, 26, 23, 0.10)` | `0 0 16px rgba(56, 242, 200, 0.18)` | `0 16px 40px rgba(120, 100, 170, 0…` | `6px 6px 0 #111111` | `5px 5px 0 rgba(42, 36, 56, 0.85),…` | `0 16px 40px rgba(160, 100, 200, 0…` | `0 0 30px rgba(255, 46, 136, 0.28)…` | `inset 0 3px 0 #FFB000, 0 10px 26p…` | `0 6px 18px rgba(46, 38, 32, 0.14)` | `0 12px 32px rgba(90, 110, 130, 0.…` | `0 0 34px rgba(255, 110, 199, 0.30…` | `0 6px 18px rgba(31, 46, 74, 0.14)` |
| `--component-card-lift` | `-2px` | `0px` | `0px` | `-3px` | `-2px` | `-2px` | `-3px` | `-2px` | `-1px` | `-1px` | `-2px` | `-2px` | `-1px` |
| `--component-button-radius` | `10px` | `4px` | `2px` | `999px` | `0px` | `8px` | `999px` | `10px` | `2px` | `4px` | `999px` | `10px` | `6px` |
| `--component-button-shadow` | `0 1px 2px rgba(0, 0, 0, 0.40)` | `none` | `none` | `0 2px 8px rgba(120, 100, 170, 0.1…` | `3px 3px 0 #111111` | `2px 2px 0 #2A2438` | `0 2px 10px rgba(224, 51, 138, 0.2…` | `0 0 12px rgba(255, 46, 136, 0.35)` | `0 2px 6px rgba(0, 0, 0, 0.50)` | `none` | `0 2px 8px rgba(90, 110, 130, 0.12)` | `0 0 12px rgba(255, 110, 199, 0.40)` | `none` |
| `--component-button-shadow-hover` | `0 0 0 1px rgba(139, 124, 246, 0.3…` | `0 0 0 1px rgba(178, 58, 47, 0.30)` | `0 0 12px rgba(56, 242, 200, 0.35)` | `0 0 0 1px rgba(229, 103, 143, 0.2…` | `5px 5px 0 #111111` | `4px 4px 0 #2A2438` | `0 0 0 3px rgba(224, 51, 138, 0.20…` | `0 0 20px rgba(255, 46, 136, 0.55)…` | `0 0 14px rgba(255, 176, 0, 0.35)` | `0 0 0 1px rgba(168, 135, 31, 0.50)` | `0 6px 20px rgba(90, 110, 130, 0.2…` | `0 0 22px rgba(255, 110, 199, 0.60…` | `0 0 0 1px rgba(184, 148, 31, 0.50)` |
| `--component-button-primary-bg` | `#8B7CF6` | `#B23A2F` | `#38F2C8` | `#E5678F` | `#2B5BFF` | `linear-gradient(180deg, #3468D1 0…` | `linear-gradient(135deg, #E0338A 0…` | `linear-gradient(135deg, #FF2E88 0…` | `linear-gradient(180deg, #FFC233 0…` | `#B33A3A` | `#4A7C96` | `linear-gradient(135deg, #FF6EC7 0…` | `#C0392B` |
| `--component-button-primary-bg-hover` | `#9E92F8` | `#C64A3E` | `#5CF7D5` | `#F0789E` | `#1E4AE8` | `linear-gradient(180deg, #4076DF 0…` | `linear-gradient(135deg, #F04D9C 0…` | `linear-gradient(135deg, #FF5AA3 0…` | `linear-gradient(180deg, #FFCE55 0…` | `#C74A4A` | `#5A8FAB` | `linear-gradient(135deg, #FF8AD4 0…` | `#D04734` |
| `--component-button-primary-color` | `#FFFFFF` | `#FFFFFF` | `#03130F` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#0A0A1F` | `#1A1400` | `#FFFFFF` | `#FFFFFF` | `#1A0B2E` | `#FFFFFF` |
| `--component-icon-button-radius` | `10px` | `4px` | `2px` | `999px` | `0px` | `8px` | `999px` | `10px` | `2px` | `4px` | `999px` | `8px` | `6px` |
| `--component-icon-button-bg` | `transparent` | `transparent` | `transparent` | `transparent` | `#FFFFFF` | `#FFFFFF` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` |
| `--component-icon-button-bg-hover` | `rgba(255, 255, 255, 0.08)` | `rgba(28, 26, 23, 0.07)` | `rgba(56, 242, 200, 0.12)` | `rgba(139, 124, 246, 0.10)` | `#FFD400` | `#FFE3C7` | `rgba(123, 75, 224, 0.12)` | `rgba(0, 229, 255, 0.12)` | `rgba(255, 176, 0, 0.14)` | `rgba(168, 135, 31, 0.16)` | `rgba(74, 124, 150, 0.10)` | `rgba(0, 240, 255, 0.14)` | `rgba(31, 46, 74, 0.08)` |
| `--component-list-item-radius` | `12px` | `4px` | `0px` | `18px` | `0px` | `8px` | `22px` | `12px` | `0px` | `4px` | `14px` | `10px` | `6px` |
| `--component-list-item-active-bg` | `rgba(139, 124, 246, 0.16)` | `rgba(178, 58, 47, 0.10)` | `rgba(56, 242, 200, 0.12)` | `rgba(229, 103, 143, 0.14)` | `#FFD400` | `rgba(37, 99, 217, 0.16)` | `rgba(224, 51, 138, 0.14)` | `rgba(255, 46, 136, 0.18)` | `rgba(255, 176, 0, 0.16)` | `rgba(179, 58, 58, 0.14)` | `rgba(74, 124, 150, 0.14)` | `rgba(255, 110, 199, 0.20)` | `rgba(192, 57, 43, 0.12)` |
| `--component-chip-radius` | `999px` | `4px` | `0px` | `999px` | `0px` | `999px` | `999px` | `999px` | `0px` | `2px` | `999px` | `999px` | `6px` |
| `--component-chip-border-w` | `1px` | `1px` | `1px` | `1px` | `2px` | `2px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` |
| `--component-chip-bg` | `rgba(255, 255, 255, 0.04)` | `#FFFFFF` | `rgba(56, 242, 200, 0.05)` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `rgba(255, 255, 255, 0.04)` | `rgba(255, 255, 255, 0.05)` | `#FFFDF8` | `#FFFFFF` | `rgba(255, 255, 255, 0.05)` | `#FFFFFF` |
| `--component-chip-bg-hover` | `rgba(255, 255, 255, 0.09)` | `rgba(28, 26, 23, 0.05)` | `rgba(56, 242, 200, 0.12)` | `rgba(139, 124, 246, 0.09)` | `#FFD400` | `#FFE3C7` | `rgba(123, 75, 224, 0.12)` | `rgba(0, 229, 255, 0.14)` | `rgba(255, 176, 0, 0.14)` | `rgba(168, 135, 31, 0.14)` | `rgba(74, 124, 150, 0.10)` | `rgba(0, 240, 255, 0.16)` | `rgba(31, 46, 74, 0.08)` |
| `--component-chip-color` | `#A7AEC6` | `#57534B` | `#7FA79E` | `#635C7C` | `#111111` | `#2A2438` | `#7A5C92` | `#A9A3D0` | `#98A2AD` | `#5E5348` | `#6E6E66` | `#BFA8E0` | `#56616F` |
| `--component-tag-radius` | `999px` | `3px` | `0px` | `999px` | `0px` | `6px` | `999px` | `999px` | `0px` | `2px` | `999px` | `999px` | `4px` |
| `--component-tag-border-w` | `1px` | `1px` | `1px` | `1px` | `2px` | `2px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` |
| `--component-tag-bg` | `rgba(139, 124, 246, 0.14)` | `rgba(178, 58, 47, 0.08)` | `rgba(56, 242, 200, 0.10)` | `rgba(229, 103, 143, 0.10)` | `#FFD400` | `#E0A200` | `rgba(224, 51, 138, 0.10)` | `rgba(255, 46, 136, 0.16)` | `rgba(255, 176, 0, 0.16)` | `rgba(168, 135, 31, 0.16)` | `rgba(74, 124, 150, 0.12)` | `rgba(255, 110, 199, 0.18)` | `rgba(192, 57, 43, 0.10)` |
| `--component-input-radius` | `16px` | `6px` | `2px` | `24px` | `0px` | `10px` | `24px` | `14px` | `2px` | `4px` | `16px` | `12px` | `6px` |
| `--component-input-border-w` | `1px` | `1px` | `1px` | `1px` | `2px` | `2px` | `2px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` |
| `--component-input-bg` | `rgba(255, 255, 255, 0.04)` | `#FFFFFF` | `rgba(56, 242, 200, 0.04)` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `rgba(255, 255, 255, 0.04)` | `rgba(255, 255, 255, 0.05)` | `#FFFDF8` | `#FFFFFF` | `rgba(255, 255, 255, 0.05)` | `#FFFFFF` |
| `--component-input-bg-focus` | `rgba(255, 255, 255, 0.06)` | `#FFFFFF` | `rgba(56, 242, 200, 0.07)` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `rgba(0, 229, 255, 0.06)` | `rgba(255, 176, 0, 0.07)` | `#FFFFFF` | `#FFFFFF` | `rgba(0, 240, 255, 0.07)` | `#FFFFFF` |
| `--component-input-shadow-focus` | `0 0 0 3px rgba(139, 124, 246, 0.2…` | `0 0 0 3px rgba(178, 58, 47, 0.16)` | `0 0 0 2px rgba(56, 242, 200, 0.30…` | `0 0 0 3px rgba(139, 124, 246, 0.2…` | `4px 4px 0 #2B5BFF` | `0 0 0 3px rgba(37, 99, 217, 0.28)` | `0 0 0 3px rgba(123, 75, 224, 0.24)` | `0 0 0 2px rgba(0, 229, 255, 0.40)…` | `0 0 0 2px rgba(255, 176, 0, 0.35)` | `0 0 0 3px rgba(179, 58, 58, 0.16)` | `0 0 0 3px rgba(74, 124, 150, 0.18)` | `0 0 0 2px rgba(0, 240, 255, 0.45)…` | `0 0 0 3px rgba(192, 57, 43, 0.16)` |
| `--component-input-min-h` | `44px` | `44px` | `44px` | `44px` | `44px` | `44px` | `44px` | `44px` | `44px` | `44px` | `44px` | `44px` | `44px` |
| `--component-avatar-radius` | `50%` | `4px` | `2px` | `50%` | `0px` | `50%` | `50%` | `50%` | `2px` | `4px` | `50%` | `50%` | `6px` |
| `--component-avatar-ring` | `0 0 0 1px rgba(255, 255, 255, 0.1…` | `0 0 0 1px rgba(28, 26, 23, 0.16)` | `0 0 0 1px rgba(56, 242, 200, 0.30)` | `0 0 0 2px rgba(255, 255, 255, 0.9…` | `0 0 0 2px #111111` | `0 0 0 2px #2A2438` | `0 0 0 3px rgba(255, 255, 255, 0.9…` | `0 0 0 2px rgba(0, 229, 255, 0.40)` | `0 0 0 1px rgba(255, 176, 0, 0.40)` | `0 0 0 1px rgba(168, 135, 31, 0.50)` | `0 0 0 2px rgba(255, 255, 255, 0.9…` | `0 0 0 2px rgba(0, 240, 255, 0.45)` | `0 0 0 1px rgba(31, 46, 74, 0.22)` |
| `--component-avatar-shadow` | `0 4px 14px rgba(0, 0, 0, 0.45)` | `none` | `0 0 12px rgba(56, 242, 200, 0.20)` | `0 4px 12px rgba(120, 100, 170, 0.…` | `3px 3px 0 #111111` | `2px 2px 0 rgba(42, 36, 56, 0.50)` | `0 4px 14px rgba(160, 100, 200, 0.…` | `0 0 18px rgba(255, 46, 136, 0.35)` | `0 2px 8px rgba(0, 0, 0, 0.50)` | `none` | `0 4px 14px rgba(90, 110, 130, 0.1…` | `0 0 20px rgba(255, 110, 199, 0.40)` | `none` |
| `--component-badge-radius` | `999px` | `3px` | `0px` | `999px` | `0px` | `999px` | `999px` | `999px` | `0px` | `2px` | `999px` | `999px` | `4px` |
| `--component-badge-border-w` | `1px` | `1px` | `1px` | `1px` | `2px` | `2px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` | `1px` |
| `--component-bubble-radius` | `18px` | `6px` | `2px` | `22px` | `0px` | `14px` | `26px` | `18px` | `3px` | `8px` | `20px` | `18px` | `10px` |
| `--component-bubble-shadow` | `0 2px 10px rgba(0, 0, 0, 0.35)` | `none` | `none` | `0 2px 8px rgba(120, 100, 170, 0.1…` | `3px 3px 0 #111111` | `2px 2px 0 rgba(42, 36, 56, 0.50)` | `0 2px 10px rgba(160, 100, 200, 0.…` | `0 0 16px rgba(255, 46, 136, 0.18)` | `0 2px 8px rgba(0, 0, 0, 0.45)` | `none` | `0 2px 10px rgba(90, 110, 130, 0.1…` | `0 0 18px rgba(255, 110, 199, 0.20)` | `none` |
| `--component-hero-radius` | `50%` | `6px` | `2px` | `50%` | `0px` | `50%` | `50%` | `50%` | `2px` | `50%` | `50%` | `50%` | `6px` |
| `--component-hero-bg` | `linear-gradient(145deg, rgba(139,…` | `#FFFFFF` | `rgba(56, 242, 200, 0.08)` | `linear-gradient(145deg, rgba(229,…` | `#FFD400` | `linear-gradient(180deg, #FFE9A8 0…` | `linear-gradient(135deg, rgba(224,…` | `linear-gradient(135deg, rgba(255,…` | `rgba(255, 176, 0, 0.12)` | `#FFFDF8` | `linear-gradient(140deg, rgba(123,…` | `linear-gradient(135deg, rgba(255,…` | `#FFFFFF` |
| `--component-hero-shadow` | `0 0 0 1px rgba(139, 124, 246, 0.3…` | `0 1px 2px rgba(28, 26, 23, 0.07)` | `0 0 24px rgba(56, 242, 200, 0.25)…` | `0 0 0 1px rgba(229, 103, 143, 0.2…` | `6px 6px 0 #111111` | `0 0 0 2px #2A2438, 4px 4px 0 rgba…` | `0 0 0 3px rgba(224, 51, 138, 0.22…` | `0 0 0 1px rgba(255, 46, 136, 0.55…` | `inset 0 3px 0 #FFB000, 0 0 28px r…` | `0 0 0 1px rgba(168, 135, 31, 0.45…` | `0 0 0 1px rgba(74, 124, 150, 0.20…` | `0 0 0 1px rgba(255, 110, 199, 0.6…` | `0 1px 2px rgba(31, 46, 74, 0.10)` |
| `--component-hero-color` | `#C9C2FF` | `#B23A2F` | `#38F2C8` | `#D2557D` | `#111111` | `#2A2438` | `#E0338A` | `#FF6FB0` | `#FFB000` | `#B33A3A` | `#4A7C96` | `#FF9EDB` | `#C0392B` |
| `--component-progress-radius` | `999px` | `0px` | `0px` | `999px` | `0px` | `999px` | `999px` | `999px` | `0px` | `2px` | `999px` | `999px` | `3px` |
| `--component-progress-track` | `rgba(255, 255, 255, 0.08)` | `rgba(28, 26, 23, 0.10)` | `rgba(56, 242, 200, 0.12)` | `rgba(139, 124, 246, 0.14)` | `#E8E1D2` | `#F5E8D8` | `rgba(123, 75, 224, 0.18)` | `rgba(0, 229, 255, 0.14)` | `rgba(255, 255, 255, 0.10)` | `rgba(46, 38, 32, 0.10)` | `rgba(74, 74, 68, 0.10)` | `rgba(0, 240, 255, 0.16)` | `rgba(31, 46, 74, 0.10)` |
| `--component-progress-fill` | `#8B7CF6` | `#B23A2F` | `#38F2C8` | `#E5678F` | `#2B5BFF` | `#2563D9` | `#E0338A` | `#FF2E88` | `#FFB000` | `#B33A3A` | `#4A7C96` | `#FF6EC7` | `#C0392B` |
| `--component-slider-track` | `rgba(255, 255, 255, 0.10)` | `rgba(28, 26, 23, 0.12)` | `rgba(56, 242, 200, 0.15)` | `rgba(139, 124, 246, 0.16)` | `#E8E1D2` | `#F5E8D8` | `rgba(123, 75, 224, 0.20)` | `rgba(0, 229, 255, 0.16)` | `rgba(255, 255, 255, 0.12)` | `rgba(46, 38, 32, 0.12)` | `rgba(74, 74, 68, 0.12)` | `rgba(0, 240, 255, 0.18)` | `rgba(31, 46, 74, 0.12)` |
| `--component-slider-fill` | `#8B7CF6` | `#B23A2F` | `#38F2C8` | `#E5678F` | `#2B5BFF` | `#2563D9` | `#E0338A` | `#FF2E88` | `#FFB000` | `#B33A3A` | `#4A7C96` | `#FF6EC7` | `#C0392B` |
| `--component-slider-thumb-bg` | `#8B7CF6` | `#B23A2F` | `#38F2C8` | `#E5678F` | `#2B5BFF` | `#2563D9` | `#FFFFFF` | `#FF2E88` | `#FFB000` | `#B33A3A` | `#4A7C96` | `#FF6EC7` | `#C0392B` |
| `--component-slider-thumb-ring` | `0 0 0 4px rgba(139, 124, 246, 0.2…` | `0 0 0 4px rgba(178, 58, 47, 0.16)` | `0 0 0 4px rgba(56, 242, 200, 0.20)` | `0 0 0 4px rgba(229, 103, 143, 0.2…` | `0 0 0 3px #111111` | `0 0 0 3px #FFFFFF, 0 0 0 5px #2A2…` | `0 0 0 3px #E0338A` | `0 0 0 3px rgba(255, 46, 136, 0.28)` | `0 0 0 3px rgba(255, 176, 0, 0.25)` | `0 0 0 4px rgba(179, 58, 58, 0.16)` | `0 0 0 4px rgba(74, 124, 150, 0.18)` | `0 0 0 3px rgba(255, 110, 199, 0.3…` | `0 0 0 4px rgba(192, 57, 43, 0.16)` |
| `--component-divider-style` | `solid` | `solid` | `dashed` | `solid` | `solid` | `solid` | `solid` | `solid` | `solid` | `solid` | `solid` | `solid` | `solid` |
| `--component-title-letter-spacing` | `-0.01em` | `0.01em` | `0.10em` | `0em` | `-0.02em` | `0em` | `0em` | `0.02em` | `0.06em` | `0.02em` | `0em` | `0.04em` | `0.01em` |
| `--component-title-transform` | `none` | `none` | `uppercase` | `none` | `none` | `none` | `none` | `none` | `uppercase` | `none` | `none` | `none` | `none` |
| `--component-glass-blur` | `18px` | `0px` | `0px` | `20px` | `0px` | `0px` | `20px` | `16px` | `0px` | `0px` | `12px` | `14px` | `0px` |
| `--component-focus-offset` | `2px` | `2px` | `1px` | `2px` | `2px` | `2px` | `2px` | `2px` | `2px` | `2px` | `2px` | `2px` | `2px` |

> 完整数值以 `css/theme-*.css` 为准，本表由 `tools/gen-token-doc.mjs` 自动生成，请勿手工修改。
