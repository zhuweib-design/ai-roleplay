# 优化项 8 无障碍审查清单（S7 验收）

拆分方式为**模板逐字迁移**（分区模板与其 ARIA 属性原样搬入子组件），无障碍结构理论上零变化。以下为逐项核验记录（2026-10-03）。

| # | 审查项 | 核验方式 | 结果 |
|---|---|---|---|
| 1 | 分类导航 role="tablist"/tab + aria-selected + 键盘可达（handleCategoryKeydown） | 保留于主文件（未迁移区）；模板逐字核对 | ✅ 保留 |
| 2 | 各分区 section aria-labelledby → 对应标题 id | 子组件模板逐字迁移（含 section-title 的 id） | ✅ 保留 |
| 3 | 主题/字号 radiogroup 键盘操作（handleThemeKeydown / handleFontSizeKeydown） | 随 appearance 分区迁移，函数与 aria 属性同块 | ✅ 保留 |
| 4 | 语言切换 aria-label | 随 appearance 分区迁移 | ✅ 保留 |
| 5 | 主密码弹窗 aria（MasterPasswordModal 组件自身未改动） | 组件未动；触发按钮 aria-label 逐字迁移 | ✅ 保留 |
| 6 | 数据分区文件上传 hidden-file-input + aria | 随 data 分区迁移 | ✅ 保留 |
| 7 | Toast 通知可达性 | 全局容器在 App.vue（Toast.vue 组件自身未改动，role/aria 由组件内部承担） | ✅ 保留 |
| 8 | 截图目检（7 张，见 before-after-screenshots/） | 6 分区 + 首启主密码弹窗渲染完好，布局无破损 | ✅ 通过 |

**结论**：无障碍属性随模板逐字迁移，无遗漏。
