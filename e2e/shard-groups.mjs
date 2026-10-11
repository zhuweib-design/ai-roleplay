/**
 * e2e 分片组（由 scripts/e2e-shard-groups.mjs 生成，请勿手改）
 *
 * 生成依据：e2e-run10-1worker.log 的**单 worker**实测时长（177 条用例 / 662s，
 * 日期见最近一次提交这条文件的记录）。四组权重极差约 1.00x。
 * 为什么不用 --shard：Playwright 只按用例条数切，不看时长，实测极差到过 3.31x。
 *
 * 新增 spec 后要重新生成：
 *   npx playwright test --workers=1 --reporter=list > /tmp/e2e-1w.log
 *   node scripts/e2e-shard-groups.mjs --report=/tmp/e2e-1w.log
 * tests/tooling/e2e-shard-groups.test.ts 会守住"每个 spec 恰好属于一组"。
 */
export const E2E_GROUPS = [
  // 第 1 组：实测 165s
  [
    'e2e/chat-search.spec.ts',
    'e2e/ux-duplicate-a11y-names.spec.ts',
    'e2e/ux-readiness.spec.ts',
  ],
  // 第 2 组：实测 165s
  [
    'e2e/character-batch-import.spec.ts',
    'e2e/databank-flow.spec.ts',
    'e2e/mobile/mobile-layout.spec.ts',
    'e2e/ux-event-trace.spec.ts',
    'e2e/ux-guided-tasks.spec.ts',
    'e2e/ux-modal-describedby-more.spec.ts',
    'e2e/ux-modal-describedby-seeded.spec.ts',
    'e2e/ux-prompt-trace.spec.ts',
    'e2e/ux-quick-forms.spec.ts',
    'e2e/worldbook-flow.spec.ts',
  ],
  // 第 3 组：实测 166s
  [
    'e2e/backup-restore.spec.ts',
    'e2e/chat-flow.spec.ts',
    'e2e/contrast-axe.spec.ts',
    'e2e/custom-theme-contrast.spec.ts',
    'e2e/i18n-locale.spec.ts',
    'e2e/long-history-scroll.spec.ts',
    'e2e/theme-visual.spec.ts',
    'e2e/ux-deep-link-group.spec.ts',
    'e2e/ux-gap-visibility.spec.ts',
    'e2e/ux-modal-describedby-version.spec.ts',
    'e2e/ux-relations-panel.spec.ts',
  ],
  // 第 4 组：实测 165s
  [
    'e2e/character-crud.spec.ts',
    'e2e/group-chat-flow.spec.ts',
    'e2e/mobile/mobile-nav-groups.spec.ts',
    'e2e/theme-flow.spec.ts',
    'e2e/ux-event-manual-trace.spec.ts',
    'e2e/ux-interaction-feedback.spec.ts',
    'e2e/ux-modal-describedby.spec.ts',
    'e2e/ux-narrow-editor-preview.spec.ts',
    'e2e/ux-nav-model.spec.ts',
    'e2e/ux-status-color.spec.ts',
  ],
];

/** 第 n 组（1 起）的文件清单 */
export function groupFiles(n) {
  return E2E_GROUPS[n - 1] ?? [];
}
