import { expect, type Page } from '@playwright/test';

/**
 * 可访问名/重复 id 审计的判定实现（M10-b 立，M11-a 扩，M12-b 抽成共享模块）
 *
 * 抽出来的理由：同一套判定原先只写在 `ux-duplicate-a11y-names.spec.ts` 里，
 * 而它只看"每条路由的默认视图"。真正容易长出重复的地方是**点开之后**——折叠段展开
 * 出来的控件、对话框内部的工具条。对话框由 `ux-modal-describedby*` 那四条 spec 逐个打开，
 * 它们本来就在那一刻读了无障碍树，再让同一份判定跑一遍几乎不花时间；
 * 但前提是判定能被发现，所以这里导出，而不是再复制一份。
 *
 * 四条判定：
 * - `dupIds`：同一文档里同一个 id 出现两次 ⇒ 违规（`aria-describedby` / `for` / 锚点会指错节点）；
 * - `sameRegionDupNames`：同一个条目容器里两个**可见**按钮可访问名相同 ⇒ 违规。
 *   跨条目重复是正当的（每条消息都有自己的"删除"），所以按容器分桶，不靠白名单；
 * - `placeholderOnly`：控件的可访问名只来自 `placeholder` ⇒ 违规（占位符一输入就消失）；
 * - `deadAnchors`：页内跳转链接指向不存在的锚点 ⇒ 违规。
 *
 * `dupIds` 与 `deadAnchors` 天然是文档级的，不随 scope 收窄；只有按钮与控件两条
 * 按 `rootSelector` 限定范围（对话框场景就是 `[role="dialog"]`）。
 */

export interface Audit {
  dupIds: string[];
  sameRegionDupNames: string[];
  placeholderOnly: string[];
  deadAnchors: string[];
  idTotal: number;
  visibleButtons: number;
}

export async function audit(page: Page, rootSelector?: string): Promise<Audit> {
  return page.evaluate((root) => {
    const scope: Element = root ? document.querySelector(root) ?? document.body : document.body;

    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    const dupIds = [...new Set(ids.filter((x, i, a) => a.indexOf(x) !== i))];

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const nameOf = (el: Element) =>
      (el.getAttribute('aria-label') || (el.textContent ?? '')).trim();
    /**
     * 条目容器：同一个容器里的同名按钮才是真歧义。
     * 每条消息的工具条、每张角色卡各自成容器，它们之间的重名是正当的。
     */
    const itemOf = (el: Element) =>
      el.closest('[role="toolbar"], [role="dialog"], article, li, tr, nav, aside, header') ??
      document.body;

    // 按容器**元素本身**分桶，不能用 aria-label 派生的字符串：每条消息的工具条
    // aria-label 都一样（"消息操作：编辑、复制…"），一派生就把 4 条消息并成一桶，
    // 于是"每条消息各有自己的删除"被误判成同区域重名。
    const buckets = new Map<Element, string[]>();
    for (const el of [...scope.querySelectorAll('button, [role="button"]')].filter(visible)) {
      const name = nameOf(el);
      if (!name || name.length >= 24) continue;
      const item = itemOf(el);
      buckets.set(item, [...(buckets.get(item) ?? []), name]);
    }
    const labelOf = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${
        el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')?.slice(0, 20)}]` : ''
      }`;
    const sameRegionDupNames = [...buckets]
      .filter(([, names]) => new Set(names).size !== names.length)
      .map(([item, names]) => `${labelOf(item)} → ${names.join('、')}`);

    const placeholderOnly: string[] = [];
    for (const el of [...scope.querySelectorAll('input, textarea, select')]) {
      if (!visible(el)) continue;
      const inputLike = el as HTMLInputElement;
      if (['hidden', 'submit', 'button'].includes(inputLike.type)) continue;
      const hasLabel = !!(inputLike.labels && inputLike.labels.length);
      const hasAria = !!el.getAttribute('aria-label') || !!el.getAttribute('aria-labelledby');
      if (!hasLabel && !hasAria && el.getAttribute('placeholder')) {
        placeholderOnly.push(
          `${el.tagName.toLowerCase()}[${inputLike.type ?? ''}] ${(el.getAttribute('placeholder') ?? '').slice(0, 24)}`
        );
      }
    }

    const deadAnchors: string[] = [];
    for (const a of [...document.querySelectorAll('a[href^="#"]')]) {
      const id = (a.getAttribute('href') ?? '').slice(1);
      if (!id) continue;
      if (!document.getElementById(id)) {
        deadAnchors.push(`${decodeURIComponent(id)} ← "${(a.textContent ?? '').trim().slice(0, 16)}"`);
      }
    }

    return {
      dupIds,
      sameRegionDupNames,
      placeholderOnly,
      deadAnchors,
      idTotal: ids.length,
      visibleButtons: [...scope.querySelectorAll('button, [role="button"]')].filter(visible).length,
    };
  }, rootSelector ?? null);
}

/**
 * 当前打开着的那条对话框的违规清单（空数组 = 干净）。
 *
 * 由 `ux-modal-describedby*` 四条 spec 在 `expectDescribedResolved` 里调用：那一刻
 * 对话框已经确认可见、无障碍树已经读过，顺手跑判定的边际成本接近零。
 */
export async function auditOpenDialog(page: Page): Promise<string[]> {
  const found = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return { present: !!d, title: d?.querySelector('.modal-title')?.textContent?.trim() ?? '' };
  });
  expect(found.present, '审计对话框内部前先确认它真的开着').toBe(true);

  const res = await audit(page, '[role="dialog"]');
  const violations: string[] = [];
  // 页面上一个对话框都没有却报重复，说明是页面本身的问题；这里只关心"开框之后新增的"
  for (const id of res.dupIds) violations.push(`对话框「${found.title}」打开后重复 id：#${id}`);
  for (const row of res.sameRegionDupNames) violations.push(`对话框「${found.title}」内同名按钮：${row}`);
  for (const row of res.placeholderOnly) violations.push(`对话框「${found.title}」内只有占位符：${row}`);
  for (const row of res.deadAnchors) violations.push(`对话框「${found.title}」打开后锚点落空：${row}`);
  return violations;
}

/**
 * 折叠段触发器（`Collapse.vue` 的标准写法：真按钮 + aria-expanded）。
 * 只算**可见**的那些：设置页会把非当前分类的面板整块 `display:none`，
 * 里面的折叠按钮点不到，把它们计入"没收出来"就是误报。
 */
export const COLLAPSE_TOGGLE = 'button.collapse-toggle[aria-expanded="false"]:visible';

/**
 * 把当前页面上所有收着的折叠段展开，返回"展开前收着几个 / 展开后还收着几个"。
 *
 * 后一项必须归零，否则"扫过了"其实什么都没扫——审计最容易自欺的地方就是
 * 零违规与零内容是同一个返回值。循环到"没有可点的"为止，因为展开外层段会
 * 露出内层段；上限 60 次只是防止某个页面无限自我展开。
 */
export async function expandAllCollapsed(page: Page): Promise<{ closedBefore: number; closedAfter: number }> {
  const closedBefore = await page.locator(COLLAPSE_TOGGLE).count();
  // 每次点第一个还收着的：展开后它就不再匹配 `[aria-expanded="false"]`，
  // 所以固定点 index 0 天然遍历完所有段，不会因为 DOM 变化而漏。
  for (let clicks = 0; clicks < 60; clicks++) {
    const toggle = page.locator(COLLAPSE_TOGGLE).first();
    if (!(await toggle.count())) break;
    await toggle.click();
    await page.waitForTimeout(60);
  }
  return { closedBefore, closedAfter: await page.locator(COLLAPSE_TOGGLE).count() };
}
