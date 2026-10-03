# 第三轮 SettingsView 拆分管线（一次性脚本归档）

2026-10-02 执行优化项 8 时使用的一次性代码变换脚本，`docs/dev/OPTIMIZATION_ROUNDS_2026-10-01.md` §3.2 当时记为"留档备查"。
2026-10-03 从 `scripts/` 根目录归档至此，让 `scripts/` 根目录只留在门禁与发布流程中真正被调用的脚本。

作用：把 4130 行的 `src/views/SettingsView.vue` 按 v-show 分区切分为 5 个面板组件，重写主文件为布局容器，并按分区类名提取样式子集。

| 脚本 | 作用 |
|---|---|
| `run-opt8-pipeline.py` | 总编排入口 |
| `split-settings-view.py` | 模板 / 脚本 / 样式按分区提取切分 |
| `rewrite-settings-main.py` | 主文件重写为布局容器 |
| `apply-s1-toast.py` | 接入全局 Toast 服务 |
| `post-split-fixups.py` | 拆分后的引用与导出修正 |
| `prune-settings-styles.py` | 清理未用样式 |
| `debug-splitter.py` | 切分过程调试辅助 |

**不要对当前代码重跑**：这些脚本按当时的文件形态写死（行号、类名、选择器），重跑会破坏已拆分的文件。要做同类改造请另写脚本，不要复用这里的内容。
