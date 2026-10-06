import { test, expect } from '@playwright/test';

/**
 * E2E · 数据银行行为链（D-8 / O-24 修复验证，REAL_DEVICE_TEST_2026-10-03）
 *
 * 原缺陷：
 * - D-8：卡片内"展开分块"按钮与父级 .card-header 重复绑定同一 toggle，
 *   冒泡后开→关抵消（点按钮无效，点卡片头部才生效；移动仿真通道同样复现）
 * - O-24：搜索无结果时无空态提示
 *
 * 修复后断言：上传 → **点按钮展开**（文案翻转）→ 点按钮收起 → 头部点击展开仍可用 →
 * 搜索命中 → 不匹配串出现空态 + 清除搜索 → 删除确认（取消不删 / 确认自清理）。
 * 单用例承载全流程（Playwright 每用例独立 context，IndexedDB 不跨用例共享）。
 */

const DOC_NAME = `d8-doc-${Date.now()}`;

test('数据银行：上传 → 展开分块（D-8）→ 搜索空态（O-24）→ 删除确认', async ({ page }) => {
  await page.goto('/databank');

  // ── 上传文档（模态内注入文件 → 点"上传"） ──
  await page.getByRole('button', { name: '上传文档' }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: `${DOC_NAME}.md`,
    mimeType: 'text/markdown',
    buffer: Buffer.from('# D8 测试文档\n\n这是用于验证展开分块与搜索空态的测试内容。\n\n第二段内容，制造第二个分块。'),
  });
  await page.getByRole('button', { name: '上传' }).last().click();
  await expect(page.getByRole('heading', { name: `${DOC_NAME}.md` })).toBeVisible();

  const card = page.locator('.doc-card', { hasText: DOC_NAME });

  // ── D-8 修复断言：点"展开分块"按钮必须展开（展开后按钮文案翻转为"收起分块"） ──
  const expandBtn = card.locator('.card-expand');
  await expandBtn.click();
  await expect(card.locator('.card-chunks')).toBeVisible();
  await expect(expandBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(expandBtn).toHaveAttribute('aria-label', '收起分块');

  // 点同一按钮收起（toggle 语义保持）
  await expandBtn.click();
  await expect(card.locator('.card-chunks')).toBeHidden();
  await expect(expandBtn).toHaveAttribute('aria-label', '展开分块');

  // 头部点击展开仍可用（原有效路径不回归）
  await card.locator('.card-header').click();
  await expect(card.locator('.card-chunks')).toBeVisible();
  await card.locator('.card-header').click();
  await expect(card.locator('.card-chunks')).toBeHidden();

  // ── 搜索命中 / 不匹配空态（O-24）──
  const search = page.getByRole('textbox', { name: '搜索文档' });
  await search.fill('d8-doc');
  await expect(page.getByRole('heading', { name: `${DOC_NAME}.md` })).toBeVisible();
  await search.fill('zzz-不存在-xyz');
  await expect(page.getByText('无匹配文档，请调整搜索关键词')).toBeVisible();
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(page.getByRole('heading', { name: `${DOC_NAME}.md` })).toBeVisible();

  // ── 删除确认：取消不删 → 确认删除（用例自清理） ──
  await card.getByRole('button', { name: '删除文档' }).click();
  await expect(page.getByText('确定要删除这个文档吗？删除后不可恢复。')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('heading', { name: `${DOC_NAME}.md` })).toBeVisible();
  await card.getByRole('button', { name: '删除文档' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${DOC_NAME}.md` })).toBeHidden();
});
