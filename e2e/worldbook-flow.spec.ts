import { test, expect } from '@playwright/test';

/**
 * E2E · 世界书流程 (F06)
 * 新建世界书 → 重命名 → 新增条目 → 树显示
 *
 * 注：世界书即时保存为异步 fire-and-forget 写入，快速刷新可能丢最后修改
 * （已知风险，持久化正确性由 IndexedDB 单元测试覆盖）。
 */
test('世界书：新建→重命名→新增条目→树显示', async ({ page }) => {
  const bookName = `E2E世界书-${Date.now()}`;
  const entryTitle = `条目-${Date.now()}`;

  await page.goto('/worldbook');

  // 1. 新建世界书（自动创建并选中）
  await page.getByRole('button', { name: '新建世界书' }).click();
  const nameInput = page.getByPlaceholder('世界书名称');
  await expect(nameInput).toBeVisible();
  await nameInput.fill(bookName);
  // 手机端两级互换：新建后自动进详情屏（`[data-level='2']` 时列表屏 display:none），
  // 所以窄视口断「名称已写进输入框」，宽视口断「列表项可见」。
  const isNarrow = (page.viewportSize()?.width ?? 1280) <= 640;
  if (isNarrow) {
    await expect(nameInput).toHaveValue(bookName);
  } else {
    await expect(page.locator('.lorebook-item', { hasText: bookName })).toBeVisible();
  }

  // 2. 新增条目：标题 + 内容（即时自动保存）
  await page.getByRole('button', { name: '新增条目' }).click();
  const titleInput = page.getByPlaceholder('条目标题（不注入提示词）');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(entryTitle);
  await page.getByPlaceholder('条目内容（自包含的完整描述）').fill('E2E 条目内容：翡翠森林深处有一座古塔。');
  // 条目树与编辑器同样两级互换：新建条目后自动进编辑屏（`[data-entry='1']` 时树屏
  // display:none）。窄视口断「条目已进树（存在）」，宽视口断「可见」。
  const treeItem = page.locator('.entry-tree-item', { hasText: entryTitle });
  if (isNarrow) {
    await expect(treeItem).toHaveCount(1);
  } else {
    await expect(treeItem).toBeVisible();
  }

  // 3. 新建条目后自动选中编辑：断言标题与内容已写入编辑器
  await expect(page.getByPlaceholder('条目标题（不注入提示词）')).toHaveValue(entryTitle);
  await expect(page.getByPlaceholder('条目内容（自包含的完整描述）')).toHaveValue(
    'E2E 条目内容：翡翠森林深处有一座古塔。'
  );
});
