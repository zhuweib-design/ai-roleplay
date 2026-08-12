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
  await expect(page.locator('.lorebook-item', { hasText: bookName })).toBeVisible();

  // 2. 新增条目：标题 + 内容（即时自动保存）
  await page.getByRole('button', { name: '新增条目' }).click();
  const titleInput = page.getByPlaceholder('条目标题（不注入提示词）');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(entryTitle);
  await page.getByPlaceholder('条目内容（自包含的完整描述）').fill('E2E 条目内容：翡翠森林深处有一座古塔。');
  await expect(page.locator('.entry-tree-item', { hasText: entryTitle })).toBeVisible();

  // 3. 新建条目后自动选中编辑：断言标题与内容已写入编辑器
  await expect(page.getByPlaceholder('条目标题（不注入提示词）')).toHaveValue(entryTitle);
  await expect(page.getByPlaceholder('条目内容（自包含的完整描述）')).toHaveValue(
    'E2E 条目内容：翡翠森林深处有一座古塔。'
  );
});
