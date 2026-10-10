import { test, expect, type Page } from '@playwright/test';
import { auditOpenDialog } from './a11y-dup-audit';

/**
 * E2E · 对话框级说明的覆盖补全（M9-d，接 M8-c）
 *
 * M8-c 把 `Modal.describedBy` 铺到 20 处，但只在真浏览器里点开验了 4 处，其余 16 处只有
 * 静态守卫。静态守卫看不见 `v-if`（说明段落可能压根没渲染）与 id 被别处抢注，所以这里
 * 继续把能靠界面走到的弹窗逐个点开，读 `[role=dialog]` 的 `aria-describedby` 反查结果。
 *
 * 覆盖账本在 `tests/accessibility/modal-describedby-coverage.ledger.ts`：
 * 每条引用要么在这里被点开过，要么登记"为什么造不出那个界面状态"，两边不一致门禁就红。
 */

interface Resolved {
  id: string;
  exists: boolean;
  inside: boolean;
  text: string;
}

/** 读当前打开对话框的 aria-describedby，并把每个 token 反查成真实节点 */
async function readDescribed(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { found: false, title: '', raw: '', resolved: [] as Resolved[] };
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

/** 断言 aria-describedby 正好是登记的那几条 id，且每条都落在本对话框内部、有实际文字 */
async function expectDescribedResolved(page: Page, expectedIds: string[]): Promise<string[]> {
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  const state = await readDescribed(page);
  expect(state.raw, `「${state.title}」没有 aria-describedby，读屏不会带出这段说明`).not.toBe('');
  expect(state.resolved.map((r) => r.id), '登记的 id 与实际引用不一致').toEqual(expectedIds);
  for (const r of state.resolved) {
    expect(r.exists, `#${r.id} 在运行时 DOM 里不存在`).toBe(true);
    expect(r.inside, `#${r.id} 存在但不在这个对话框内部`).toBe(true);
    expect(r.text.length, `#${r.id} 解析到了，但里面没有文字`).toBeGreaterThan(0);
  }
  // M12-b：这一刻对话框已经开着，同一套重复 id/可访问名判定顺手跑一遍
  expect(await auditOpenDialog(page), `对话框「${state.title}」内部有可访问名问题`).toEqual([]);
  return state.resolved.map((r) => r.text);
}

/** 关掉当前对话框（不执行动作） */
async function closeDialog(page: Page, name: RegExp) {
  await page
    .getByRole('dialog', { name })
    .getByRole('button', { name: /取消|关闭/ })
    .first()
    .click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
}

/** 快速档建一个角色（群聊成员、编辑器删除都要先有角色） */
async function createCharacter(page: Page, name: string): Promise<void> {
  await page.goto('/character');
  await page.getByRole('button', { name: '新建角色' }).click();
  await page.locator('#qc-name').fill(name);
  await page.locator('#qc-desc').fill('雨夜的港口城市，说话简短。');
  await page.locator('[data-rel-jump="quick-char-create"]').click();
  // 快速档建完会直接跳去对话页，得回列表才看得到卡片
  await expect(page).toHaveURL(/\/chat$/);
  await page.goto('/character');
  await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();
}

/** 建一份 API 档位并激活（端点是假的，只为了"已配置"这个状态） */
async function createApiProfile(page: Page, name = 'E2E 说明接力档位'): Promise<void> {
  await page.goto('/settings?cat=model');
  await page.getByRole('button', { name: '新增 API 配置' }).click();
  await page.locator('#p-name').fill(name);
  await page.locator('#p-baseurl').fill('http://localhost:9/v1');
  await page.locator('#p-model').fill('gpt-4o');
  await page.locator('#p-apikey').fill('test-key');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  const activate = page.getByRole('button', { name: '激活此 API 配置' });
  if (await activate.count()) await activate.first().click();
}

/** 建一个群聊（向导里挑得到成员就挑一个） */
async function createGroup(page: Page, name: string): Promise<void> {
  await page.goto('/group');
  await page.getByRole('button', { name: '新建群聊' }).click();
  await page.locator('#new-group-name').fill(name);
  // 向导要求至少挑一名成员，不挑的话「创建」点了也不落地
  const picks = page.locator('.char-pick');
  await expect(picks.first()).toBeVisible();
  await picks.first().click();
  if ((await picks.count()) > 1) await picks.nth(1).click();
  await page.getByRole('dialog', { name: '创建群聊' }).getByRole('button', { name: '创建' }).click();
  await expect(page.getByText(name).first()).toBeVisible();
}

test.describe('编辑器与列表', () => {
  test('编辑页删除确认：两句说明都在框内可读', async ({ page }) => {
    const name = `E2E编辑删除-${Date.now()}`;
    await createCharacter(page, name);
    await page.getByRole('article', { name: `角色：${name}` }).click();
    await expect(page).toHaveURL(/\/edit/);

    await page.locator('.header-btn.delete').click();
    const texts = await expectDescribedResolved(page, ['char-delete-desc', 'char-delete-warning']);
    expect(texts[0]).toContain(name);
    expect(texts[1]).toContain('不可撤销');
    await closeDialog(page, /删除/);
  });
});

test.describe('世界书页', () => {
  test('删除世界书确认：说明带上了书名与条目数', async ({ page }) => {
    const name = `E2E说明接力设定-${Date.now()}`;
    await page.goto('/worldbook');
    await page.getByRole('button', { name: '创建新世界书' }).click();
    // 新书默认落在列表里，名字是可改的输入框
    const title = page.locator('.lorebook-title-input, input[aria-label*="名称"]').first();
    if (await title.count()) {
      await title.fill(name);
      await title.press('Enter');
    }
    await page.locator('.action-btn.delete').click();
    const texts = await expectDescribedResolved(page, ['wb-delete-desc']);
    expect(texts[0]).toContain('世界书');
    expect(texts[0]).toContain('条目');
    await closeDialog(page, /删除世界书/);
  });

  test('AI 生成世界观确认：说明讲清会生成什么', async ({ page }) => {
    await createApiProfile(page);
    await page.goto('/worldbook');
    await page.getByRole('button', { name: 'AI 生成' }).click();
    const texts = await expectDescribedResolved(page, ['wb-generate-desc']);
    expect(texts.join(' ')).toContain('世界');
    await closeDialog(page, /AI 生成世界观/);
  });
});

test.describe('设置页', () => {
  test('设置主密码对话框：开头那句说明接进了无障碍树', async ({ page }) => {
    await page.goto('/settings?cat=security');
    await page.getByRole('button', { name: '设置主密码' }).click();
    const texts = await expectDescribedResolved(page, ['mpm-desc']);
    expect(texts.join(' ').length).toBeGreaterThan(4);
    await closeDialog(page, /主密码/);
  });

  test('清空审计记录确认：说明写清清的是什么', async ({ page }) => {
    await page.goto('/settings?cat=data');
    // 「清空日志」在「运维与兼容」折叠段里（M4-b2 起默认收起），先展开
    await page.locator('.collapse-toggle').filter({ hasText: '运维与兼容' }).click();
    await page.getByRole('button', { name: '清空日志' }).click();
    const texts = await expectDescribedResolved(page, ['audit-clear-desc']);
    expect(texts.join(' ').length).toBeGreaterThan(4);
    await closeDialog(page, /清空/);
  });

  test('删除 API 档位确认：两句说明（后果 + 不可撤销）都在框内', async ({ page }) => {
    await createApiProfile(page, 'E2E 待删档位');
    await page.getByRole('button', { name: '删除 API 配置' }).first().click();
    const texts = await expectDescribedResolved(page, ['profile-delete-desc', 'profile-delete-warning']);
    expect(texts.join(' ')).toContain('E2E 待删档位');
    expect(texts[1]).toContain('无法恢复');
    await closeDialog(page, /删除/);
  });
});

test.describe('群聊页', () => {
  test('删除群聊确认：说明带上了"消息一并删除"', async ({ page }) => {
    await createCharacter(page, `E2E群成员A-${Date.now()}`);
    const groupName = `E2E说明接力群-${Date.now()}`;
    await createGroup(page, groupName);
    await page.getByRole('button', { name: '删除群聊' }).first().click();
    const texts = await expectDescribedResolved(page, ['group-delete-desc']);
    expect(texts.join(' ')).toContain('无法恢复');
    await closeDialog(page, /删除/);
  });

  test('添加成员：那句"从已创建的角色里挑"接进了无障碍树', async ({ page }) => {
    await createCharacter(page, `E2E群成员B-${Date.now()}`);
    await createGroup(page, `E2E挑成员群-${Date.now()}`);
    await page.getByRole('button', { name: '添加成员' }).click();
    const texts = await expectDescribedResolved(page, ['add-member-hint']);
    expect(texts.join(' ')).toContain('角色');
    await closeDialog(page, /添加成员/);
  });

  test('生成临时 NPC：说明讲清"会建一个并直接进群"', async ({ page }) => {
    await createApiProfile(page);
    await createCharacter(page, `E2E群成员C-${Date.now()}`);
    await createGroup(page, `E2E临时NPC群-${Date.now()}`);
    await page.getByRole('button', { name: '生成随机 NPC' }).click();
    const texts = await expectDescribedResolved(page, ['npc-hint']);
    expect(texts.join(' ')).toContain('NPC');
    await closeDialog(page, /NPC/);
  });
});

test.describe('角色列表页', () => {
  test('随机生成角色：说明与"要花一次调用"的提示接进了无障碍树', async ({ page }) => {
    await createApiProfile(page);
    await page.goto('/character');
    await page.getByRole('button', { name: '随机生成角色' }).click();
    const texts = await expectDescribedResolved(page, ['char-generate-desc']);
    expect(texts.join(' ').length).toBeGreaterThan(4);
    await closeDialog(page, /生成/);
  });
});
