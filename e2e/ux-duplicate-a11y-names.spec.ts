import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 实时 DOM 里的 id / 可访问名 / 命名来源审计（M10-b 立，M11-a 扩）
 *
 * 来源是 M8-c 登记的一条"未做"：当时用静态扫描数出 9 处 `id="main-content"`、
 * 3 处 `panel-settings`，以及角色编辑器页面上三处「取消」，我把它写成"既有的可访问名
 * 重复"。**那条判断没经过运行时验证，实测是说过头了**：那些元素分属互斥的路由分支或
 * `display:none` 的移动变体，21 条路由的真实 DOM 里重复 id 为 0。
 *
 * 于是这里不修代码，而是把结论钉成门禁，三条判定：
 * - 同一页面里同一个 id 出现两次 ⇒ 红（`aria-describedby` / `for` / 跳转锚点会指错节点）；
 * - 同一个条目容器里两个可见按钮可访问名相同 ⇒ 红。跨条目重复是正当的（每条消息都有
 *   自己的"删除"），所以按容器分组判定，不靠白名单点名；
 * - 控件的可访问名只来自 `placeholder` ⇒ 红。占位符一输入就消失、对比度还常偏低，
 *   不能当标签用。注意本审计只看**各路由的默认视图**，条件渲染出来的控件不在范围内——
 *   M11-a 那个"完成关键词只有占位符"的缺陷是面板用例（`worldbook-events-panel-edit`）
 *   抓到的，不是这里；这条判定防的是默认视图层面的同类回归。
 *
 * 用例按"一次启动内循环若干条路由"组织，理由见下面 CHUNKS 的注释。
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
  /** 可访问名只来自 placeholder 的控件：占位符一输入就消失、对比度还偏低，不能当标签用 */
  placeholderOnly: string[];
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

    const placeholderOnly: string[] = [];
    for (const el of [...document.querySelectorAll('input, textarea, select')]) {
      if (!visible(el)) continue;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') continue;
      const hasLabel = !!(el.labels && el.labels.length);
      const hasAria = !!el.getAttribute('aria-label') || !!el.getAttribute('aria-labelledby');
      if (!hasLabel && !hasAria && el.getAttribute('placeholder')) {
        placeholderOnly.push(
          `${el.tagName.toLowerCase()}[${el.type ?? ''}] ${(el.getAttribute('placeholder') ?? '').slice(0, 24)}`
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
      visibleButtons: [...document.querySelectorAll('button, [role="button"]')].filter(visible).length,
    };
  });
}

/**
 * 判定按"一次启动内循环路由"组织，而不是一条路由一个用例。
 *
 * M10-b 刚加进来时是 21 条独立用例，实测它成了全套最贵的一项：46 次执行（双内核）
 * 合计 234s，占全部用例耗时的 12%，而每条只做了"加载页面 + 一次 evaluate"。
 * 成本全在**每个用例重付一次浏览器上下文 + 应用冷启动**。合成一次启动后同样的覆盖面
 * 只要个位数秒，于是也不必再为省时间砍 webkit 的路由数。
 *
 * 归因不丢：违规按 `路由 → 判定` 收集，断言消息里逐条列出是哪条路由出的问题。
 */
const CHUNKS: string[][] = [
  ROUTES.filter((_, i) => i % 2 === 0),
  ROUTES.filter((_, i) => i % 2 === 1),
];

test.describe('实时 DOM 的 id 与可访问名唯一性', () => {
  for (const [idx, routes] of CHUNKS.entries()) {
    test(`第 ${idx + 1} 组共 ${routes.length} 条路由：无重复 id、无同区域同名、无仅靠占位符命名的控件`, async ({ page }) => {
      const violations: string[] = [];
      const checked: string[] = [];
      for (const route of routes) {
        await page.goto(route);
        await page.waitForSelector('#app button, #app [role="button"]', { timeout: 15_000 });
        await page.waitForTimeout(400);
        const res = await audit(page);
        // 先确认这条路由真的渲染出了东西，否则"零违规"可能只是"零内容"
        if (res.visibleButtons <= 2) violations.push(`${route} 可见按钮数 ${res.visibleButtons}，用例在此失去意义`);
        if (res.idTotal <= 2) violations.push(`${route} 带 id 的元素只有 ${res.idTotal} 个，页面没渲染出来`);
        for (const id of res.dupIds) violations.push(`${route} 重复 id：#${id}`);
        for (const row of res.sameRegionDupNames) violations.push(`${route} 同一区域里同名按钮：${row}`);
        for (const row of res.placeholderOnly) violations.push(`${route} 只有占位符没有标签：${row}`);
        checked.push(`${route}(${res.idTotal} 个 id / ${res.visibleButtons} 个按钮)`);
      }
      expect(violations, `已扫 ${checked.length} 条路由：\n${checked.join('\n')}`).toEqual([]);
    });
  }

  test('负向对照：造出违规必须报出来，隐藏的重复不该误报', async ({ page }) => {
    await page.goto('/character');
    await page.waitForSelector('#app button');
    const before = await audit(page);
    expect(before.dupIds, '基线就该是干净的').toEqual([]);
    expect(before.sameRegionDupNames, '基线就该是干净的').toEqual([]);
    expect(before.placeholderOnly, '基线就该是干净的').toEqual([]);
    expect(before.deadAnchors, '基线就该是干净的').toEqual([]);

    const injected: { label: string } = await page.evaluate(() => {
      // 重复 id 是全文档级违规，放哪都算；同名按钮才需要挑同一个父元素（见下）
      const dupHost = document.querySelector('main') ?? document.body;
      const dupId = document.createElement('span');
      dupId.id = 'e2e-probe-dup';
      dupHost.appendChild(dupId);
      const dupId2 = document.createElement('span');
      dupId2.id = 'e2e-probe-dup';
      dupHost.appendChild(dupId2);

      // 同名按钮要插在**真正那个按钮的旁边**（同一个父元素），才会落进同一个区域桶；
      // 插到别的容器里就成"两个区域各一个同名"，那是正当的，审计不该报
      const real = [...document.querySelectorAll('header button, nav button, main button')].find(
        (el) => !!el.parentElement
      );
      if (!real) throw new Error('这条路由上找不到可克隆的按钮，换一条再验');
      const label = (real.getAttribute('aria-label') || real.textContent || '').trim();
      const host = real.parentElement ?? document.body;

      const twin = document.createElement('button');
      twin.type = 'button';
      twin.setAttribute('aria-label', label);
      twin.textContent = label;
      host.insertBefore(twin, real.nextSibling);

      // 隐藏的重复不算违规（判定只看可见元素），放进来是为了证明"可见性"这条规则是承重的
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
    expect(
      after.sameRegionDupNames.filter((row) => row.includes(injected.label)),
      `同区域同名按钮没被抓到，或把隐藏元素误判进来了（${injected.label}）`
    ).toHaveLength(1);

    // 只靠 placeholder 命名的控件：现场造一个，必须被抓到
    await page.evaluate(() => {
      const box = document.createElement('input');
      box.type = 'text';
      box.placeholder = '只有占位符没有标签';
      document.querySelector('main')?.appendChild(box);
    });
    expect((await audit(page)).placeholderOnly, '只靠 placeholder 命名的控件没被抓到').toEqual([
      'input[text] 只有占位符没有标签',
    ]);

    // ④ 页内跳转链接指向不存在的锚点（M11-c 实测就是这样发现 8 条路由的"跳到主内容"落空）
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '#e2e-probe-no-such-anchor';
      a.textContent = '指向不存在的锚点';
      document.body.appendChild(a);
    });
    expect((await audit(page)).deadAnchors, '指向缺失锚点的跳转链接没被抓到').toEqual([
      'e2e-probe-no-such-anchor ← "指向不存在的锚点"',
    ]);
  });

  test('对话页两种分支各自只有一个主内容锚点', async ({ page }) => {
    // ChatView 的冷启动分支与 ChatMain 的 <main> 都带 id="main-content"，
    // 静态看是"重复"，运行时靠 v-if/v-else 互斥。这条用例把"必须互斥"钉住。
    await page.goto('/chat');
    await page.waitForSelector('#main-content');
    expect(await page.locator('#main-content').count()).toBe(1);
  });
});
