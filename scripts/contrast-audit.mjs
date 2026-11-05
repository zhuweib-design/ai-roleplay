// 旧的独立对比度复核脚本。
//
// 它原先手抄了 dark / midnight / oled / theatre 四套色值（还漏了 light），
// 与 themes.css 完全脱钩 —— 改了 token 也不会感知。2026-11 删除这五套初版主题时，
// 这张手抄表已没有任何数据源可对应，故不再维护第二份色值：
// 唯一的权威是读 tokens.css / themes.css 的 `scripts/check-contrast.mjs`
// （`npm run a11y:contrast`）。这里保留文件名与命令入口，直接转调。
//
// 用法：node scripts/contrast-audit.mjs [--self-test]
import './check-contrast.mjs';
