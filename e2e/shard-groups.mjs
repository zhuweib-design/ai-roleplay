/**
 * e2e 分片组（由 scripts/e2e-shard-groups.mjs 生成，请勿手改）
 *
 * 生成依据：e2e-1w-2026-10-16b.log 的**单 worker**实测时长（241 条用例 / 883s）。
 * 按下面这份权重贪心均衡（LPT）后四组极差约 1.003x。
 * 为什么不用 --shard：Playwright 只按用例条数切、不看时长，实测极差到过 3.31x。
 *
 * 重新测量：
 *   npx playwright test --workers=1 --reporter=list > /tmp/e2e-1w.log
 *   node scripts/e2e-shard-groups.mjs --report=/tmp/e2e-1w.log
 * 只复核不写文件：--check=/tmp/e2e-1w.log（极差超过 1.3 退码 1）。
 * tests/tooling/e2e-shard-groups.test.ts 守三件事：每个 spec 恰好属于一组、
 * 权重距今 ≤30 天、按本表权重算出的分组极差 ≤1.3。
 */

/** 跑数时间（ISO）。守卫用它判权重是否过期，CI 里也读得到 */
export const MEASURED_AT = '2026-10-16T06:37:25.069Z';
/** 生成时所处的 commit（溯源用，不参与判定） */
export const SOURCE_COMMIT = 'b6f5f724ce30d6ab310afcee1d13cec5c014331c';
/** 跑数里的用例条数与总时长（秒） */
export const MEASURED_CASES = 241;
export const MEASURED_TOTAL_SEC = 882.5;
/** 每个 spec 的实测权重（秒，跨 project 相加） */
export const SPEC_WEIGHTS = {
  'e2e/backup-restore.spec.ts': 25.1,
  'e2e/character-batch-import.spec.ts': 13.9,
  'e2e/character-crud.spec.ts': 14.9,
  'e2e/chat-flow.spec.ts': 17.9,
  'e2e/chat-search.spec.ts': 2.2,
  'e2e/contrast-axe.spec.ts': 93.0,
  'e2e/custom-theme-contrast.spec.ts': 1.3,
  'e2e/databank-flow.spec.ts': 1.7,
  'e2e/group-chat-flow.spec.ts': 47.3,
  'e2e/i18n-locale.spec.ts': 1.0,
  'e2e/long-history-scroll.spec.ts': 4.8,
  'e2e/mobile-control-font-size.spec.ts': 17.2,
  // 手工登记（2026-10-17）：新增批次 0 断言 spec，实测 9 条约 10s。
  // 未跑单 worker 全量基线，权重按实测填；下次重跑 --report 时会被真实跑数覆盖。
  'e2e/mobile/batch0-composition.spec.ts': 10.0,
  'e2e/mobile/chat-touch-composer.spec.ts': 10.2,
  'e2e/mobile/group-header-narrow.spec.ts': 2.3,
  'e2e/mobile/mobile-layout.spec.ts': 5.5,
  'e2e/mobile/mobile-nav-groups.spec.ts': 2.1,
  'e2e/mobile/narrow-squeeze.spec.ts': 41.2,
  'e2e/model-install-web.spec.ts': 1.8,
  'e2e/theme-flow.spec.ts': 1.7,
  'e2e/theme-visual.spec.ts': 21.7,
  'e2e/token-neutrality.spec.ts': 81.7,
  'e2e/ux-deep-link-book.spec.ts': 4.0,
  'e2e/ux-deep-link-group.spec.ts': 6.9,
  'e2e/ux-duplicate-a11y-names.spec.ts': 166.8,
  'e2e/ux-event-manual-trace.spec.ts': 12.7,
  'e2e/ux-event-trace.spec.ts': 15.6,
  'e2e/ux-gap-visibility.spec.ts': 8.5,
  'e2e/ux-guided-tasks.spec.ts': 8.0,
  'e2e/ux-interaction-feedback.spec.ts': 41.0,
  'e2e/ux-modal-describedby-more.spec.ts': 68.1,
  'e2e/ux-modal-describedby-seeded.spec.ts': 29.0,
  'e2e/ux-modal-describedby-version.spec.ts': 28.4,
  'e2e/ux-modal-describedby.spec.ts': 25.1,
  'e2e/ux-narrow-editor-preview.spec.ts': 12.8,
  'e2e/ux-nav-model.spec.ts': 8.1,
  'e2e/ux-prompt-trace.spec.ts': 11.2,
  'e2e/ux-quick-forms.spec.ts': 7.8,
  'e2e/ux-readiness.spec.ts': 6.6,
  'e2e/ux-relations-panel.spec.ts': 4.8,
  'e2e/ux-status-color.spec.ts': 4.9,
  'e2e/worldbook-flow.spec.ts': 3.9,
};

export const E2E_GROUPS = [
  // 第 1 组：实测 221s
  [
    'e2e/chat-search.spec.ts',
    'e2e/long-history-scroll.spec.ts',
    'e2e/mobile-control-font-size.spec.ts',
    'e2e/theme-flow.spec.ts',
    'e2e/ux-deep-link-group.spec.ts',
    'e2e/ux-duplicate-a11y-names.spec.ts',
    'e2e/ux-gap-visibility.spec.ts',
    'e2e/ux-narrow-editor-preview.spec.ts',
  ],
  // 第 2 组：实测 220s
  [
    'e2e/backup-restore.spec.ts',
    'e2e/character-batch-import.spec.ts',
    'e2e/chat-flow.spec.ts',
    'e2e/contrast-axe.spec.ts',
    'e2e/i18n-locale.spec.ts',
    'e2e/mobile/chat-touch-composer.spec.ts',
    'e2e/model-install-web.spec.ts',
    'e2e/ux-interaction-feedback.spec.ts',
    'e2e/ux-quick-forms.spec.ts',
    'e2e/ux-status-color.spec.ts',
    'e2e/worldbook-flow.spec.ts',
  ],
  // 第 3 组：实测 221s（2026-10-17 手工加入 batch0-composition 约 10s ⇒ 约 231s）
  [
    'e2e/character-crud.spec.ts',
    'e2e/databank-flow.spec.ts',
    'e2e/mobile/batch0-composition.spec.ts',
    'e2e/mobile/group-header-narrow.spec.ts',
    'e2e/mobile/mobile-layout.spec.ts',
    'e2e/mobile/narrow-squeeze.spec.ts',
    'e2e/theme-visual.spec.ts',
    'e2e/token-neutrality.spec.ts',
    'e2e/ux-deep-link-book.spec.ts',
    'e2e/ux-guided-tasks.spec.ts',
    'e2e/ux-modal-describedby-version.spec.ts',
    'e2e/ux-prompt-trace.spec.ts',
  ],
  // 第 4 组：实测 221s
  [
    'e2e/custom-theme-contrast.spec.ts',
    'e2e/group-chat-flow.spec.ts',
    'e2e/mobile/mobile-nav-groups.spec.ts',
    'e2e/ux-event-manual-trace.spec.ts',
    'e2e/ux-event-trace.spec.ts',
    'e2e/ux-modal-describedby-more.spec.ts',
    'e2e/ux-modal-describedby-seeded.spec.ts',
    'e2e/ux-modal-describedby.spec.ts',
    'e2e/ux-nav-model.spec.ts',
    'e2e/ux-readiness.spec.ts',
    'e2e/ux-relations-panel.spec.ts',
  ],
];

/** 第 n 组（1 起）的文件清单 */
export function groupFiles(n) {
  return E2E_GROUPS[n - 1] ?? [];
}

/** 用 SPEC_WEIGHTS 算当前分组的各组权重与极差（--check 与守卫都走它） */
export function groupWeights() {
  const sums = E2E_GROUPS.map((g) => g.reduce((a, f) => a + (SPEC_WEIGHTS[f] ?? 0), 0));
  return { sums, spread: Math.max(...sums) / Math.min(...sums) };
}
