import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 实时 DOM 里的重复 id 与同区域重复可访问名（M10-b）
 *
 * 来源是 M8-c 登记的一条"未做"：当时用静态扫描数出 9 处 `id="main-content"`、
 * 3 处 `panel-settings`，以及角色编辑器页面上三处「取消」，我把它写成"既有的可访问名
 * 重复"。**这条判断没经过运行时验证，本批验完发现是说过头了**：
 * 那些同名元素分属互斥的路由分支或 `display:none` 的移动变体，
 * 21 条路由的真实 DOM 里既没有重复 id，也没有"同一区域里两个同名按钮"。
 *
 * 所以这里不修代码，而是把结论钉成门禁，防止将来真的长出：
 * - 一个页面里同一个 id 出现两次 ⇒ 红（`aria-describedby` / `for` / 跳转锚点会指错节点）；
 * - 同一个区域（工具条 / 卡片 / 对话框 / 导航）里两个可见按钮可访问名相同 ⇒ 红。
 *   跨条目重复是正当的（每条消息都有自己的"删除"），判定按"是否落在同一个条目容器里"，
 *   不靠白名单点名。
 */

const ROUTES = [
  '/',
  '/chat',
  '/group',
  '/character',
  '/character/new',
  '/worldbook',
  '/databank',
  '/story',
  '/random-events',
  '/market',
  '/local-model',
  '/image-gen',
  '/archives',
  '/versions',
  '/guide',
  '/more',
  '/settings',
  '/settings?cat=model',
  '/settings?cat=data',
  '/settings?cat=appearance',
  '/settings?cat=security',
];

interface Audit {
  dupIds: string[];
  sameRegionDupNames: string[];
  idTotal: number;
  visibleButtons: number;
}

async function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => {
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
    for (const el of [...document.querySelectorAll('button, [role="button"]')].filter(visible)) {
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

    return {
      dupIds,
      sameRegionDupNames,
      idTotal: ids.length,
      visibleButtons: [...document.querySelectorAll('button, [role="button"]')].filter(visible).length,
    };
  });
}

test.describe('实时 DOM 的 id 与可访问名唯一性', () => {
  for (const route of ROUTES) {
    test(`${route} 没有重复 id，也没有同区域同名按钮`, async ({ page }) => {
      await page.goto(route);
      // 有些路由会立刻重定向（无角色时 /chat 落引导、/versions 需要选中角色），
      // 所以等到"确实渲染出内容骨架"而不是死等某个 id
      await page.waitForSelector('#app button, #app [role="button"]', { timeout: 15_000 });
      await page.waitForTimeout(400);
      const res = await audit(page);
      // 先确认这条路由真的渲染出了东西，否则"零违规"可能只是"零内容"
      expect(res.visibleButtons, `${route} 可见按钮数为 0，用例失去意义`).toBeGreaterThan(2);
      expect(res.idTotal, `${route} 没有任何带 id 的元素`).toBeGreaterThan(2);
      expect(res.dupIds, `${route} 存在重复 id`).toEqual([]);
      expect(res.sameRegionDupNames, `${route} 同一区域里有同名按钮`).toEqual([]);
    });
  }

  test('负向对照：造一个重复 id 与一个同区域同名按钮，审计必须报出来', async ({ page }) => {
    await page.goto('/character');
    await page.waitForSelector('#app button');
    const before = await audit(page);
    expect(before.dupIds, '基线就该是干净的').toEqual([]);
    expect(before.sameRegionDupNames, '基线就该是干净的').toEqual([]);

    // ① 重复 id：给两张卡片里的一张再加一个同 id 的可见节点
    // ② 同区域同名：在同一个 header 里塞第二个「导入」
    // ③ 只藏不删的同名（display:none）——它不该被算进违规，否则这条审计会误伤移动变体
    const injected: { label: string } = await page.evaluate(() => {
      const header = document.querySelector('header') ?? document.body;
      const dupId = document.createElement('span');
      dupId.id = 'e2e-probe-dup';
      header.appendChild(dupId);
      const dupId2 = document.createElement('span');
      dupId2.id = 'e2e-probe-dup';
      header.appendChild(dupId2);

      // 同名按钮要插在**真正那个按钮的旁边**（同一个父元素），才会落进同一个区域桶；
      // 插到别的容器里就成"两个区域各一个同名"，那是正当的，审计不该报
      const real = [...document.querySelectorAll('header button, nav button, main button')].find(
        (el) => !!el.parentElement && [...el.parentElement.querySelectorAll(':scope > button')].length > 0
      );
      if (!real) throw new Error('这条路由上找不到可克隆的按钮，换一条再验');
      const label = (real.getAttribute('aria-label') || real.textContent || '').trim();
      const host = real.parentElement ?? document.body;

      const twin = document.createElement('button');
      twin.type = 'button';
      twin.setAttribute('aria-label', label);
      twin.textContent = label;
      host.insertBefore(twin, (real as HTMLElement).nextSibling);

      const hiddenTwin = document.createElement('button');
      hiddenTwin.type = 'button';
      hiddenTwin.setAttribute('aria-label', label);
      hiddenTwin.textContent = label;
      hiddenTwin.style.display = 'none';
      host.insertBefore(hiddenTwin, twin.nextSibling);
      return { label };
    });

    const after = await audit(page);
    expect(after.dupIds, '重复 id 没被抓到').toContain('e2e-probe-dup');
    // 隐藏的重复不算违规（同区域规则只看可见元素），所以违规数应正好是"多出来的那一个"
    expect(
      after.sameRegionDupNames.filter((row) => row.includes(injected.label)),
      '同区域同名按钮没被抓到，或把隐藏元素误判进来了（' + injected.label + '）'
    ).toHaveLength(1);
  });

  test('对话页两种分支各自只有一个主内容锚点', async ({ page }) => {
    // ChatView 的冷启动分支与 ChatMain 的 <main> 都带 id="main-content"，
    // 静态看是"重复"，运行时靠 v-if/v-else 互斥。这条用例把"必须互斥"钉住。
    await page.goto('/chat');
    await page.waitForSelector('#main-content');
    expect(await page.locator('#main-content').count()).toBe(1);
  });
});
