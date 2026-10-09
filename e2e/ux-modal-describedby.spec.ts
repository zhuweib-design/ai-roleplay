import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 对话框级说明在真实浏览器里接得上（M8-c）
 *
 * 静态守卫（`tests/accessibility/modal-describedby-wired.test.ts`）只能保证
 * "源码里那个 id 存在"，但真正生效的是**运行时 DOM**：
 * - 说明段落带 `v-if`（删除确认里那句"确定要删除角色「X」吗"就是），
 *   弹窗打开时它若没渲染出来，`aria-describedby` 就指着一个空气泡；
 * - id 若在别处被重复注册，浏览器只认第一个，读屏念出来的可能是别人的文字。
 *
 * 这里逐个把弹窗真点开，读 `[role=dialog]` 的 `aria-describedby`，再用
 * `getElementById` 反查：必须查得到、必须就在同一个对话框里、必须有实际文字。
 * 最后一条是负向对照：只把引用改成不存在的 id，检查必须报错，
 * 否则前面的绿灯可能只是"什么都没检查"。
 *
 * 没在这里点开的是世界书页那两个：三步流程的第三步（绑定/改全局）需要先有角色，
 * 空 profile 下走不到"完成"，编辑器整块因此不渲染，删除按钮也就拿不到。
 * 那两处由静态守卫负责（说明段落无 v-if、id 全应用唯一、就在 Modal 内部）。
 */

interface DescribedState {
  found: boolean;
  title: string;
  raw: string;
  resolved: Array<{ id: string; exists: boolean; inside: boolean; text: string }>;
}

/** 读取当前打开的对话框，把 aria-describedby 的每个 token 反查成真实节点 */
async function readDescribed(page: Page): Promise<DescribedState> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) {
      return { found: false, title: '', raw: '', resolved: [] };
    }
    const raw = dialog.getAttribute('aria-describedby') ?? '';
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    return {
      found: true,
      title: dialog.querySelector('.modal-title')?.textContent?.trim() ?? '',
      raw,
      resolved: tokens.map((id) => {
        const el = document.getElementById(id);
        return {
          id,
          exists: !!el,
          inside: !!el && dialog.contains(el),
          text: (el?.textContent ?? '').trim(),
        };
      }),
    };
  });
}

/** 断言每条引用都落在本对话框内部且有实际文字，并返回引用到的文字 */
async function expectDescribedResolved(page: Page, minTokens = 1): Promise<string[]> {
  const state = await readDescribed(page);
  expect(state.found, '对话框未打开').toBe(true);
  expect(
    state.raw,
    `「${state.title}」没有 aria-describedby，读屏不会带出这段说明`
  ).not.toBe('');
  expect(state.resolved.length, '引用 token 数').toBeGreaterThanOrEqual(minTokens);
  for (const r of state.resolved) {
    expect(r.exists, `#${r.id} 在运行时 DOM 里不存在`).toBe(true);
    expect(r.inside, `#${r.id} 存在但不在这个对话框内部`).toBe(true);
    expect(r.text.length, `#${r.id} 解析到了，但里面没有文字`).toBeGreaterThan(0);
  }
  return state.resolved.map((r) => r.text);
}

// 首启欢迎窗需要干净的 localStorage（默认 storageState 预置了"引导已完成"）
test.describe('首启欢迎窗', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('欢迎窗开头那句说明接进了无障碍树', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.modal-title')).toHaveText('欢迎来到 AI 酒馆');
    const texts = await expectDescribedResolved(page);
    expect(texts.join(' ')).toContain('三步就能聊起来');
  });
});

test.describe('编辑与删除确认', () => {
  test('未保存修改确认：说明在弹窗内可读', async ({ page }) => {
    await page.goto('/character');
    await page.getByRole('button', { name: '新建角色' }).click();
    await page.getByRole('button', { name: '完整表单' }).click();
    await page.getByLabel('名称').fill(`E2E说明接力-${Date.now()}`);

    await page.locator('.header-btn.back').click();
    await expect(page.locator('.modal-title')).toHaveText('未保存的修改');
    const texts = await expectDescribedResolved(page);
    expect(texts.join(' ')).toContain('有未保存的修改');

    // 页面上有三处「取消」（页头/表单底部/弹窗），必须限定在对话框里点
    await page.getByRole('dialog', { name: '未保存的修改' }).getByRole('button', { name: '取消' }).click();
  });

  test('列表删除确认：带 v-if 的那句说明在弹窗打开时确实存在', async ({ page }) => {
    const name = `E2E删除说明-${Date.now()}`;
    await page.goto('/character');
    await page.getByRole('button', { name: '新建角色' }).click();
    await page.getByRole('button', { name: '完整表单' }).click();
    await page.getByLabel('名称').fill(name);
    await page.locator('#f-desc').fill('用于验证删除确认弹窗的说明引用。');
    await page.locator('.header-btn.save').click();
    await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });

    const card = page.getByRole('article', { name: `角色：${name}` });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: '删除角色' }).click();
    await expect(page.locator('.modal-title')).toHaveText('确认删除');
    // 两条引用：第一句是 v-if 的那句"确定要删除角色「X」吗"，第二句是不可撤销警告
    const texts = await expectDescribedResolved(page, 2);
    expect(texts[0]).toContain(name);
    expect(texts[1]).toContain('不可撤销');

    // 收场：真的删掉，夹具不留残留
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await expect(card).toHaveCount(0);
  });
});

test.describe('负向对照', () => {
  test('引用指向不存在的 id 时，检查必须报错', async ({ page }) => {
    await page.goto('/character');
    await page.getByRole('button', { name: '新建角色' }).click();
    await page.getByRole('button', { name: '完整表单' }).click();
    await page.getByLabel('名称').fill(`E2E对照-${Date.now()}`);
    await page.locator('.header-btn.back').click();
    await expect(page.locator('.modal-title')).toHaveText('未保存的修改');

    // 接线本身是对的：先按原样过一遍
    await expectDescribedResolved(page);

    // 只改被验的那件事：把引用换成空气泡，不动弹窗内容
    await page.evaluate(() => {
      document
        .querySelector('[role="dialog"]')
        ?.setAttribute('aria-describedby', 'probe-missing-id');
    });
    const state = await readDescribed(page);
    expect(state.resolved.map((r) => `${r.id}:${r.exists}`)).toEqual(['probe-missing-id:false']);

    let message = '';
    try {
      await expectDescribedResolved(page);
    } catch (e) {
      message = String(e);
    }
    expect(message, '检查没有报错，说明它是空转的').toContain('在运行时 DOM 里不存在');
    expect(message).toContain('probe-missing-id');

    // 页面上有三处「取消」（页头/表单底部/弹窗），必须限定在对话框里点
    await page.getByRole('dialog', { name: '未保存的修改' }).getByRole('button', { name: '取消' }).click();
  });
});
